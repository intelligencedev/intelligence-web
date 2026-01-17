import * as THREE from 'three';

export function createVolumetricSmokeShader({ galaxyParams, blueNoiseTexture }) {
  const lightColor = new THREE.Color(1.0, 0.9, 0.8);
  const initialLightIntensity = lightColor.clone().multiplyScalar(
    typeof galaxyParams?.centralLightIntensity === 'number' ? galaxyParams.centralLightIntensity : 1.0
  );

  const initialNebulaCool = new THREE.Color(
    typeof galaxyParams?.nebulaCoolColor === 'string' ? galaxyParams.nebulaCoolColor : '#1f47f2'
  );
  const initialNebulaDust = new THREE.Color(
    typeof galaxyParams?.nebulaDustColor === 'string' ? galaxyParams.nebulaDustColor : '#8c401f'
  );
  const initialNebulaWarm = new THREE.Color(
    typeof galaxyParams?.nebulaWarmColor === 'string' ? galaxyParams.nebulaWarmColor : '#ffdbb3'
  );

  return {
    uniforms: {
      tDiffuse: { value: null },
      // Scene depth from the RenderPass (DepthTexture attached to EffectComposer targets).
      // Used to clamp the ray march so foreground stars/geometry don't get dimmed by background volume.
      tDepth: { value: null },
      tDensity: { value: null },
      cameraPos: { value: new THREE.Vector3() },
      invProjectionMatrix: { value: new THREE.Matrix4() },
      invModelViewMatrix: { value: new THREE.Matrix4() },
      screenResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      u_time: { value: 0.0 },
      absorptionCoefficient: { value: typeof galaxyParams?.absorptionCoefficient === 'number' ? galaxyParams.absorptionCoefficient : 0.5 },
      scatteringCoefficient: { value: typeof galaxyParams?.scatteringCoefficient === 'number' ? galaxyParams.scatteringCoefficient : 6.0 },
      phaseG: { value: typeof galaxyParams?.anisotropyG === 'number' ? galaxyParams.anisotropyG : 0.1 },
      godRaysIntensity: { value: typeof galaxyParams?.godRaysIntensity === 'number' ? galaxyParams.godRaysIntensity : 0.0 },
      lightPosition: { value: (galaxyParams?.sunPosition ? galaxyParams.sunPosition.clone() : new THREE.Vector3(0, 0, 0)) },
      lightIntensity: { value: initialLightIntensity },
      nebulaCoolColor: { value: initialNebulaCool },
      nebulaDustColor: { value: initialNebulaDust },
      nebulaWarmColor: { value: initialNebulaWarm },
      densityFactor: { value: typeof galaxyParams?.densityFactor === 'number' ? galaxyParams.densityFactor : 15.0 },
      steps: { value: typeof galaxyParams?.rayMarchSteps === 'number' ? galaxyParams.rayMarchSteps : 96 },
      shadowSteps: { value: 12 },
      shadowStrength: { value: 1.0 },
      noiseTexture: { value: blueNoiseTexture },
      noiseScale: { value: new THREE.Vector2(1, 1) },
      boxMin: { value: new THREE.Vector3(-galaxyParams.galacticRadius, -galaxyParams.galacticRadius, -galaxyParams.galacticRadius * 0.5) },
      boxMax: { value: new THREE.Vector3(galaxyParams.galacticRadius, galaxyParams.galacticRadius, galaxyParams.galacticRadius * 0.5) }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      precision highp sampler3D;

      uniform sampler2D tDiffuse;
      uniform sampler2D tDepth;
      uniform sampler3D tDensity;
      uniform vec3 cameraPos;
      uniform mat4 invProjectionMatrix;
      uniform mat4 invModelViewMatrix;
      uniform vec2 screenResolution;
      uniform float u_time;
      uniform float absorptionCoefficient;
      uniform float scatteringCoefficient;
      uniform float phaseG;
      uniform float godRaysIntensity;
      uniform vec3 lightPosition;
      uniform vec3 lightIntensity;
      uniform vec3 nebulaCoolColor;
      uniform vec3 nebulaDustColor;
      uniform vec3 nebulaWarmColor;
      uniform float densityFactor;
      uniform int steps;
      uniform int shadowSteps;
      uniform float shadowStrength;
      uniform sampler2D noiseTexture;
      uniform vec2 noiseScale;
      uniform vec3 boxMin;
      uniform vec3 boxMax;

      varying vec2 vUv;

      #define PI 3.14159265359
      #define MAX_STEPS 128
      #define MAX_SHADOW_STEPS 64
      #define EMPTY_SPACE_THRESHOLD 0.001

      float henyeyGreenstein(float cosTheta, float g) {
        float g2 = g * g;
        return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
      }

      bool intersectBox(vec3 ro, vec3 rd, vec3 boxMin, vec3 boxMax, out float t0, out float t1) {
        vec3 invDir = 1.0 / rd;
        vec3 tbot = invDir * (boxMin - ro);
        vec3 ttop = invDir * (boxMax - ro);
        vec3 tmin = min(ttop, tbot);
        vec3 tmax = max(ttop, tbot);
        float t_enter = max(max(tmin.x, tmin.y), tmin.z);
        float t_exit = min(min(tmax.x, tmax.y), tmax.z);
        t0 = t_enter;
        t1 = t_exit;
        return t_exit > max(0.0, t_enter);
      }

      vec2 sampleDensity(vec3 pos_world) {
        vec3 texCoord = (pos_world - boxMin) / (boxMax - boxMin);

        if (any(lessThan(texCoord, vec3(0.0))) || any(greaterThan(texCoord, vec3(1.0)))) {
          return vec2(0.0);
        }

        vec2 densityData = texture(tDensity, texCoord).rg;

        // Density is scaled in-shader for artistic control.
        // Temperature/albedo stays in [0..1] as authored by the density worker.
        float density = densityData.r * densityFactor;
        float temperature = densityData.g;

        density = clamp(density, 0.0, 1000.0);
        temperature = clamp(temperature, 0.0, 1.0);

        if (isnan(density)) density = 0.0;
        if (isnan(temperature)) temperature = 0.0;

        return vec2(density, temperature);
      }

      float absorptionFromDensity(float density, float temperature) {
        // Treat lower-temperature regions as dustier (more absorbing, less luminous).
        float dust = 1.0 - clamp(temperature, 0.0, 1.0);
        float dustBoost = mix(0.7, 2.25, dust);
        return absorptionCoefficient * density * dustBoost;
      }

      float scatteringFromDensity(float density, float temperature) {
        // Hotter gas contributes more visible scattering, dust contributes less.
        float gas = clamp(temperature, 0.0, 1.0);
        float scatterBoost = mix(0.35, 1.0, gas);
        return scatteringCoefficient * density * scatterBoost;
      }

      float shadowTransmittance(vec3 pos_world, vec3 lightDir, float lightDistance) {
        float t0;
        float t1;
        if (!intersectBox(pos_world, lightDir, boxMin, boxMax, t0, t1)) {
          return 1.0;
        }

        float tStart = max(0.0, t0);
        float tEnd = min(t1, lightDistance);
        if (tEnd <= tStart) {
          return 1.0;
        }

        int actualShadowSteps = min(shadowSteps, MAX_SHADOW_STEPS);
        float dt = (tEnd - tStart) / float(actualShadowSteps);

        // Jitter to reduce banding.
        float frame = floor(u_time * 60.0);
        float j = texture(noiseTexture, (gl_FragCoord.xy + vec2(frame, frame * 7.0) + pos_world.xy * 37.0) * noiseScale).r;
        float t = tStart + (0.25 + 0.75 * j) * dt;

        float opticalDepth = 0.0;

        for (int s = 0; s < MAX_SHADOW_STEPS; ++s) {
          if (s >= actualShadowSteps || t >= tEnd || opticalDepth > 14.0) break;

          vec3 p = pos_world + lightDir * t;
          vec2 d = sampleDensity(p);
          float density = d.r;
          float temperature = d.g;

          if (density > EMPTY_SPACE_THRESHOLD) {
            float sigmaA = absorptionFromDensity(density, temperature);
            float sigmaS = scatteringFromDensity(density, temperature);
            float extinction = sigmaA + sigmaS;
            opticalDepth += extinction * dt;
          }

          t += dt;
        }

        return exp(-opticalDepth * shadowStrength);
      }

      vec3 getNebulaColor(float temperature) {
        vec3 coolColor = nebulaCoolColor;
        vec3 dustColor = nebulaDustColor;
        vec3 warmColor = nebulaWarmColor;

        if (temperature < 0.35) {
          return mix(dustColor, coolColor, smoothstep(0.05, 0.35, temperature));
        }
        return mix(coolColor, warmColor, smoothstep(0.35, 1.0, temperature));
      }

      // Simple emissive term for hot gas near the core.
      // This helps get the "Hollywood" core glow that still respects extinction.
      vec3 coreEmission(vec3 pos_world, float density, float temperature) {
        float r = length(pos_world.xy);
        float coreMask = exp(-r * 3.5);
        float hot = smoothstep(0.55, 1.0, temperature);
        float amount = coreMask * hot * density;
        vec3 warm = vec3(1.0, 0.85, 0.65);
        return warm * amount;
      }

      void main() {
        vec4 sceneColor = texture2D(tDiffuse, vUv);

        // Depth-aware compositing:
        // Clamp the volume march to the closest depth in the scene so stars/geometry in front
        // don't get dimmed by volumetrics behind them.
        float sceneDepthT = 1e20;
        bool hasSceneDepth = false;
        float depthSample = texture2D(tDepth, vUv).r;
        if (depthSample < 0.999999) {
          vec4 clipSurface = vec4(vUv * 2.0 - 1.0, depthSample * 2.0 - 1.0, 1.0);
          vec4 viewSurface = invProjectionMatrix * clipSurface;
          viewSurface /= max(viewSurface.w, 1e-6);
          sceneDepthT = length(viewSurface.xyz);
          hasSceneDepth = true;
        }

        vec4 clipPos = vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
        vec4 viewPos = invProjectionMatrix * clipPos;
        viewPos /= viewPos.w;

        vec3 rayDir = normalize((invModelViewMatrix * vec4(viewPos.xyz, 0.0)).xyz);
        vec3 rayOrigin = cameraPos;

        float tNear;
        float tFar;
        if (!intersectBox(rayOrigin, rayDir, boxMin, boxMax, tNear, tFar)) {
          gl_FragColor = sceneColor;
          return;
        }

        tNear = max(tNear, 0.0);

        if (tFar <= tNear) {
          gl_FragColor = sceneColor;
          return;
        }

        vec3 accumulatedColor = vec3(0.0);
        float transmittance = 1.0;
        float transmittanceToScene = 1.0;
        bool sceneTransmittanceLocked = (!hasSceneDepth) || (sceneDepthT <= tNear);

        float frame = floor(u_time * 60.0);
        float noiseVal = texture(noiseTexture, (gl_FragCoord.xy + vec2(frame, frame * 7.0)) * noiseScale).r;
        float stepSize = (tFar - tNear) / float(steps);
        float currentT = tNear + noiseVal * stepSize;

        int actualSteps = min(steps, MAX_STEPS);

        for (int i = 0; i < MAX_STEPS; ++i) {
          if (i >= actualSteps || currentT >= tFar || transmittance < 0.01) break;

          vec3 currentPos = rayOrigin + rayDir * currentT;
          vec2 densityData = sampleDensity(currentPos);
          float density = densityData.r;
          float temperature = densityData.g;

          if (density > EMPTY_SPACE_THRESHOLD) {
            float adaptiveFactor = clamp(1.0 / (density * 2.5 + 1.0), 0.25, 1.0);
            float dt = stepSize * adaptiveFactor;

            float sigmaA = absorptionFromDensity(density, temperature);
            float sigmaS = scatteringFromDensity(density, temperature);
            float sigmaT = sigmaA + sigmaS;
            float stepTransmittance = exp(-sigmaT * dt);

            vec3 lightDir = normalize(lightPosition - currentPos);
            // Phase function uses angle between incident light direction (light -> sample)
            // and view direction (sample -> camera).
            // With our conventions, that's equivalent to dot(rayDir, lightDir).
            float cosTheta = dot(rayDir, lightDir);
            float phase = henyeyGreenstein(cosTheta, phaseG);
            phase *= (1.0 + godRaysIntensity * pow(max(cosTheta, 0.0), 10.0));

            float lightDistance = length(lightPosition - currentPos);
            // A slightly softer falloff keeps the arms lit at cinematic distances.
            float lightAttenuation = 1.0 / (1.0 + 0.35 * lightDistance * lightDistance);

            float shadow = shadowTransmittance(currentPos, lightDir, lightDistance);

            vec3 nebulaColor = getNebulaColor(temperature);

            // Let bright stars influence nearby scattering so the nebula feels lit by the field.
            vec3 starTint = pow(sceneColor.rgb, vec3(1.25));
            float starLuma = dot(sceneColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            float starInfluence = smoothstep(0.04, 0.55, starLuma) * (1.0 - clamp(density * 0.2, 0.0, 0.85));
            nebulaColor = mix(nebulaColor, starTint, starInfluence);

            // Local emission (e.g. hot gas near the core), attenuated by the current transmittance.
            // Keep it subtle; bloom will do the cinematic lift.
            vec3 emission = coreEmission(currentPos, density, temperature) * 0.018;
            accumulatedColor += emission * transmittance * dt;

            // Energy-conserving single scattering: integrates scattering over the segment using
            // (1 - exp(-sigmaT * dt)) instead of sigmaS * dt, so dense regions don't blow out.
            float scatterAmount = (1.0 - stepTransmittance) * (sigmaS / max(sigmaT, 1e-6));

            vec3 inScatteredLight = lightIntensity * lightAttenuation * shadow * nebulaColor *
              phase * scatterAmount;

            accumulatedColor += inScatteredLight * transmittance;
            transmittance *= stepTransmittance;

            currentT += dt;

            // Lock transmittance at the scene depth (e.g. star depth) so stars are only dimmed
            // by volume *in front* of them, while still allowing volumetrics *behind* them.
            if (!sceneTransmittanceLocked && currentT >= sceneDepthT) {
              transmittanceToScene = transmittance;
              sceneTransmittanceLocked = true;
            }
          } else {
            currentT += stepSize;
          }
        }

        if (!sceneTransmittanceLocked) {
          transmittanceToScene = transmittance;
        }

        vec3 finalColor = sceneColor.rgb * transmittanceToScene + accumulatedColor;
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `
  };
}
