import * as THREE from 'three';

export function createBlackHoleLensingShader({ galaxyParams }) {
  return {
    uniforms: {
      tDiffuse: { value: null },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      // Black hole center in UV space (0..1). Updated every frame from camera projection.
      uCenterUv: { value: new THREE.Vector2(0.5, 0.5) },
      uEnabled: { value: typeof galaxyParams?.blackHoleEnabled === 'number' ? galaxyParams.blackHoleEnabled : 1.0 },
      uMass: { value: typeof galaxyParams?.blackHoleMass === 'number' ? galaxyParams.blackHoleMass : 1.0 },
      uLensStrength: { value: typeof galaxyParams?.blackHoleLensStrength === 'number' ? galaxyParams.blackHoleLensStrength : 1.0 },
      uHorizonRadius: { value: typeof galaxyParams?.blackHoleHorizonRadius === 'number' ? galaxyParams.blackHoleHorizonRadius : 0.055 },
      uPhotonRingRadius: { value: typeof galaxyParams?.blackHolePhotonRingRadius === 'number' ? galaxyParams.blackHolePhotonRingRadius : 0.09 },
      uPhotonRingWidth: { value: typeof galaxyParams?.blackHolePhotonRingWidth === 'number' ? galaxyParams.blackHolePhotonRingWidth : 0.012 },
      uPhotonRingIntensity: { value: typeof galaxyParams?.blackHolePhotonRingIntensity === 'number' ? galaxyParams.blackHolePhotonRingIntensity : 1.8 },
      uAccretionIntensity: { value: typeof galaxyParams?.blackHoleAccretionIntensity === 'number' ? galaxyParams.blackHoleAccretionIntensity : 0.7 },
      uAccretionRadius: { value: typeof galaxyParams?.blackHoleAccretionRadius === 'number' ? galaxyParams.blackHoleAccretionRadius : 0.14 },
      uAccretionWidth: { value: typeof galaxyParams?.blackHoleAccretionWidth === 'number' ? galaxyParams.blackHoleAccretionWidth : 0.03 },
      uDiskInclination: { value: typeof galaxyParams?.blackHoleDiskInclination === 'number' ? galaxyParams.blackHoleDiskInclination : 0.45 },
      uDopplerStrength: { value: typeof galaxyParams?.blackHoleDopplerStrength === 'number' ? galaxyParams.blackHoleDopplerStrength : 0.6 }
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
      uniform sampler2D tDiffuse;
      uniform vec2 uResolution;
      uniform vec2 uCenterUv;
      uniform float uEnabled;
      uniform float uMass;
      uniform float uLensStrength;
      uniform float uHorizonRadius;
      uniform float uPhotonRingRadius;
      uniform float uPhotonRingWidth;
      uniform float uPhotonRingIntensity;
      uniform float uAccretionIntensity;
      uniform float uAccretionRadius;
      uniform float uAccretionWidth;
      uniform float uDiskInclination;
      uniform float uDopplerStrength;

      varying vec2 vUv;

      float gaussian(float x, float sigma) {
        float s = max(sigma, 1e-6);
        float a = x / s;
        return exp(-a * a);
      }

      void main() {
        if (uEnabled < 0.5) {
          gl_FragColor = texture2D(tDiffuse, vUv);
          return;
        }

        float aspect = uResolution.x / max(uResolution.y, 1.0);
        vec2 p = vUv - uCenterUv;
        vec2 pAspect = vec2(p.x * aspect, p.y);
        float r = length(pAspect);

        // Event horizon (shadow)
        if (r < uHorizonRadius) {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }

        // Weak-field gravitational lensing approximation:
        // deflection ~ 4GM / b. We treat b as r in screen space and roll constants into uLensStrength.
        float b = max(r, uHorizonRadius * 0.35);
        float alpha = uLensStrength * (4.0 * uMass) / b;
        alpha = clamp(alpha, 0.0, 0.25);

        vec2 dirAspect = pAspect / b;
        vec2 dirUv = vec2(dirAspect.x / aspect, dirAspect.y);

        // Sample from a shifted UV to emulate bending.
        vec2 warpedUv = vUv + dirUv * alpha;
        warpedUv = clamp(warpedUv, vec2(0.0), vec2(1.0));

        vec3 col = texture2D(tDiffuse, warpedUv).rgb;

        // Photon ring (emissive)
        float ring = gaussian(r - uPhotonRingRadius, uPhotonRingWidth) * uPhotonRingIntensity;
        vec3 ringCol = vec3(1.0, 0.88, 0.72) * ring;

        // Accretion disk: tilted ring + simple doppler beaming
        float tilt = mix(1.0, 0.25, clamp(uDiskInclination, 0.0, 1.0));
        vec2 diskP = vec2(pAspect.x, pAspect.y / tilt);
        float diskR = length(diskP);
        float disk = gaussian(diskR - uAccretionRadius, uAccretionWidth) * uAccretionIntensity;
        float beaming = 1.0 + uDopplerStrength * (diskP.x / max(uAccretionRadius, 1e-3));
        beaming = clamp(beaming, 0.25, 1.75);
        vec3 diskCol = vec3(1.0, 0.55, 0.2) * disk * beaming;

        // Slight darkening near the shadow edge for contrast
        float edge = smoothstep(uHorizonRadius, uHorizonRadius + 0.04, r);
        col *= mix(0.75, 1.0, edge);

        col += ringCol + diskCol;

        gl_FragColor = vec4(col, 1.0);
      }
    `
  };
}

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
      timeScale: { value: typeof galaxyParams?.orbitalTimeScale === 'number' ? galaxyParams.orbitalTimeScale : 1.0 },
      absorptionCoefficient: { value: typeof galaxyParams?.absorptionCoefficient === 'number' ? galaxyParams.absorptionCoefficient : 0.5 },
      scatteringCoefficient: { value: typeof galaxyParams?.scatteringCoefficient === 'number' ? galaxyParams.scatteringCoefficient : 6.0 },
      phaseG: { value: 0.35 },
      // Secondary phase function for back-scattering (silver-lining effect)
      phaseG2: { value: -0.3 },
      phaseBlend: { value: 0.3 },
      lightPosition: { value: (galaxyParams?.sunPosition ? galaxyParams.sunPosition.clone() : new THREE.Vector3(0, 0, 0)) },
      lightIntensity: { value: initialLightIntensity },
      nebulaCoolColor: { value: initialNebulaCool },
      nebulaDustColor: { value: initialNebulaDust },
      nebulaWarmColor: { value: initialNebulaWarm },
      densityFactor: { value: typeof galaxyParams?.densityFactor === 'number' ? galaxyParams.densityFactor : 15.0 },
      steps: { value: typeof galaxyParams?.rayMarchSteps === 'number' ? galaxyParams.rayMarchSteps : 96 },
      shadowSteps: { value: 16 },
      shadowStrength: { value: 1.2 },
      // Advanced volumetric parameters
      multiScatterStrength: { value: 0.35 },
      ambientDensity: { value: 0.08 },
      powderStrength: { value: 0.6 },
      shadowDensityScale: { value: 1.5 },
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
      uniform float timeScale;
      uniform float absorptionCoefficient;
      uniform float scatteringCoefficient;
      uniform float phaseG;
      uniform float phaseG2;
      uniform float phaseBlend;
      uniform vec3 lightPosition;
      uniform vec3 lightIntensity;
      uniform vec3 nebulaCoolColor;
      uniform vec3 nebulaDustColor;
      uniform vec3 nebulaWarmColor;
      uniform float densityFactor;
      uniform int steps;
      uniform int shadowSteps;
      uniform float shadowStrength;
      uniform float multiScatterStrength;
      uniform float ambientDensity;
      uniform float powderStrength;
      uniform float shadowDensityScale;
      uniform sampler2D noiseTexture;
      uniform vec2 noiseScale;
      uniform vec3 boxMin;
      uniform vec3 boxMax;

      varying vec2 vUv;

      #define PI 3.14159265359
      #define MAX_STEPS 128
      #define MAX_SHADOW_STEPS 64
      #define EMPTY_SPACE_THRESHOLD 0.001

      vec3 rotateXY(vec3 p, float angle) {
        float s = sin(angle);
        float c = cos(angle);
        return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
      }

      // ============================================================
      // ADVANCED VOLUMETRIC LIGHTING - Based on:
      // - Beer-Lambert absorption law
      // - Henyey-Greenstein phase function (dual-lobe for silver lining)
      // - Light marching with directional derivatives
      // - Multi-scattering approximation (Horizon Zero Dawn technique)
      // - Energy-conserving in-scattering
      // ============================================================

      // Beer-Lambert law: transmittance through medium
      float beersLaw(float density, float distance) {
        return exp(-density * distance);
      }

      // Beer-Powder approximation for enhanced edge lighting (Horizon Zero Dawn)
      // Creates the characteristic "silver lining" effect on cloud edges
      float beersPowder(float density, float distance) {
        float beer = beersLaw(density, distance);
        float powder = 1.0 - exp(-density * distance * 2.0);
        return beer * mix(1.0, powder, powderStrength);
      }

      // Dual-lobe Henyey-Greenstein phase function
      // Combines forward scattering (g > 0) with back scattering (g < 0)
      // for more realistic light distribution
      float henyeyGreenstein(float cosTheta, float g) {
        float g2 = g * g;
        return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
      }

      float dualLobePhase(float cosTheta, float g1, float g2, float blend) {
        float phase1 = henyeyGreenstein(cosTheta, g1);
        float phase2 = henyeyGreenstein(cosTheta, g2);
        return mix(phase1, phase2, blend);
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
        // Rotate texture lookup to make nebula orbit with the same differential
        // Keplerian motion as the instanced stars.
        // Star shader uses: omega(r) = sqrt(GM / r^3) and theta = theta0 - omega * t * timeScale.
        // Match that here by rotating the density field by -omega(r) * t * timeScale.
        const float GM = 4.3e-6;
        float r = max(length(pos_world.xy), 0.01);
        float omega = sqrt(GM / (r * r * r));
        float orbitAngle = omega * u_time * timeScale;
        float s = sin(orbitAngle);
        float c = cos(orbitAngle);
        vec3 rotatedPos = vec3(
          c * pos_world.x - s * pos_world.y,
          s * pos_world.x + c * pos_world.y,
          pos_world.z
        );
        
        // Map rotated position to texture coordinates
        vec3 boxSize = boxMax - boxMin;
        vec3 boxCenter = (boxMax + boxMin) * 0.5;
        vec3 texCoord = (rotatedPos - boxCenter) / boxSize + 0.5;

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

      // Directional derivative for fast diffuse approximation
      // Samples density gradient in light direction to estimate local illumination
      float directionalDerivative(vec3 pos, vec3 lightDir, float baseDensity) {
        float offset = 0.15;
        vec2 offsetSample = sampleDensity(pos + lightDir * offset);
        float gradientDensity = offsetSample.x;
        // Positive derivative = getting denser toward light = darker
        // Negative derivative = getting less dense toward light = brighter (edge lit)
        float derivative = clamp((baseDensity - gradientDensity) / offset, -2.0, 2.0);
        return derivative;
      }

      float absorptionFromDensity(float density, float temperature) {
        // Treat lower-temperature regions as dustier (more absorbing, less luminous).
        float dust = 1.0 - clamp(temperature, 0.0, 1.0);
        float dustBoost = mix(0.45, 1.65, dust);
        return absorptionCoefficient * density * dustBoost;
      }

      float scatteringFromDensity(float density, float temperature) {
        // Hotter gas contributes more visible scattering, dust contributes less.
        float gas = clamp(temperature, 0.0, 1.0);
        float scatterBoost = mix(0.55, 1.15, gas);
        return scatteringCoefficient * density * scatterBoost;
      }

      float emissionFromDensity(float density, float temperature) {
        float hot = smoothstep(0.35, 0.9, temperature);
        float mid = smoothstep(0.2, 0.55, temperature) * (1.0 - hot * 0.6);
        float amount = (hot * 0.9 + mid * 0.45) * density;
        return amount;
      }

      // Advanced light marching with cone sampling
      // Samples light energy arriving at a point by marching toward the light source
      // Uses exponentially increasing step sizes for efficiency
      struct LightMarchResult {
        float transmittance;
        float multiScatter;
      };

      LightMarchResult lightMarch(vec3 pos_world, vec3 lightDir, float lightDistance) {
        LightMarchResult result;
        result.transmittance = 1.0;
        result.multiScatter = 0.0;

        float t0, t1;
        if (!intersectBox(pos_world, lightDir, boxMin, boxMax, t0, t1)) {
          return result;
        }

        float tStart = max(0.0, t0);
        float tEnd = min(t1, lightDistance);
        if (tEnd <= tStart) {
          return result;
        }

        int actualShadowSteps = min(shadowSteps, MAX_SHADOW_STEPS);
        
        // Use exponentially increasing step sizes (cone sampling)
        // This provides better quality near the sample point where shadows matter most
        float totalDistance = tEnd - tStart;
        float baseStep = totalDistance / float(actualShadowSteps) * 0.5;

        // Jitter to reduce banding with temporal variation
        float frame = floor(u_time * 60.0);
        float j = texture(noiseTexture, (gl_FragCoord.xy + vec2(frame, frame * 7.0) + pos_world.xy * 37.0) * noiseScale).r;
        float t = tStart + j * baseStep * 0.5;

        float opticalDepth = 0.0;
        float multiScatterAccum = 0.0;
        float stepMultiplier = 1.0;

        for (int s = 0; s < MAX_SHADOW_STEPS; ++s) {
          if (s >= actualShadowSteps || t >= tEnd || opticalDepth > 12.0) break;

          // Exponentially increasing step size (cone sampling)
          float dt = baseStep * stepMultiplier;
          stepMultiplier *= 1.15;

          vec3 p = pos_world + lightDir * t;
          vec2 d = sampleDensity(p);
          float density = d.r * shadowDensityScale;
          float temperature = d.g;

          if (density > EMPTY_SPACE_THRESHOLD) {
            float sigmaA = absorptionFromDensity(density, temperature);
            float sigmaS = scatteringFromDensity(density, temperature);
            float extinction = sigmaA + sigmaS;
            
            float segmentOpticalDepth = extinction * dt;
            opticalDepth += segmentOpticalDepth;
            
            // Multi-scattering approximation: accumulate scattered light that gets
            // re-scattered toward the viewer. This creates the soft, diffuse look.
            float localTransmittance = exp(-opticalDepth);
            multiScatterAccum += localTransmittance * density * dt * 0.5;
          }

          t += dt;
        }

        result.transmittance = exp(-opticalDepth * shadowStrength);
        result.multiScatter = multiScatterAccum;
        return result;
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

      // Light falloff from the central galactic core
      // Implements inverse-square with artistic adjustments
      float coreLightFalloff(vec3 pos_world) {
        float r = length(pos_world.xy);
        // Soft inverse-square falloff with minimum to prevent division issues
        float falloff = 1.0 / (1.0 + 0.04 * r * r);
        // Vertical attenuation for disc-like illumination
        falloff *= exp(-abs(pos_world.z) * 0.3);
        return falloff;
      }

      // Core emission for hot gas - creates the central galactic glow
      vec3 coreEmission(vec3 pos_world, float density, float temperature) {
        float r = length(pos_world.xy);
        float coreMask = exp(-r * 3.0);
        float hot = smoothstep(0.5, 1.0, temperature);
        float amount = coreMask * hot * density;
        vec3 warm = vec3(1.0, 0.85, 0.65);
        return warm * amount;
      }

      // Ambient occlusion approximation using density gradient
      float ambientOcclusion(vec3 pos, vec3 normal, float baseDensity) {
        float ao = 1.0;
        float scale = 0.3;
        for (int i = 1; i <= 3; i++) {
          float dist = float(i) * scale;
          vec2 occSample = sampleDensity(pos + normal * dist);
          float expectedDensity = baseDensity * exp(-dist * 0.5);
          ao -= (expectedDensity - occSample.x) * (1.0 / float(i));
        }
        return clamp(ao, 0.2, 1.0);
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

        float tNear, tFar;
        if (!intersectBox(rayOrigin, rayDir, boxMin, boxMax, tNear, tFar)) {
          gl_FragColor = sceneColor;
          return;
        }

        tNear = max(tNear, 0.0);

        if (tFar <= tNear) {
          gl_FragColor = sceneColor;
          return;
        }

        // Light direction from galactic center
        vec3 lightDir = normalize(lightPosition - rayOrigin);
        float viewLightAngle = dot(rayDir, lightDir);

        // Dual-lobe phase function for forward and back scattering
        float phase = dualLobePhase(viewLightAngle, phaseG, phaseG2, phaseBlend);

        vec3 accumulatedColor = vec3(0.0);
        float transmittance = 1.0;
        float transmittanceToScene = 1.0;
        bool sceneTransmittanceLocked = (!hasSceneDepth) || (sceneDepthT <= tNear);

        // Blue noise dithering with temporal variation
        float frame = floor(u_time * 60.0);
        float noiseVal = texture(noiseTexture, (gl_FragCoord.xy + vec2(frame, frame * 7.0)) * noiseScale).r;
        float stepSize = (tFar - tNear) / float(steps);
        float currentT = tNear + noiseVal * stepSize;

        int actualSteps = min(steps, MAX_STEPS);

        // Track cumulative optical depth for multi-scattering
        float cumulativeOpticalDepth = 0.0;

        for (int i = 0; i < MAX_STEPS; ++i) {
          if (i >= actualSteps || currentT >= tFar || transmittance < 0.005) break;

          vec3 currentPos = rayOrigin + rayDir * currentT;
          vec2 densityData = sampleDensity(currentPos);
          float density = densityData.r;
          float temperature = densityData.g;

          if (density > EMPTY_SPACE_THRESHOLD) {
            // Adaptive step size based on density for better quality in dense regions
            float adaptiveFactor = clamp(1.0 / (density * 2.0 + 1.0), 0.3, 1.0);
            float dt = stepSize * adaptiveFactor;

            // Calculate extinction coefficients
            float sigmaA = absorptionFromDensity(density, temperature);
            float sigmaS = scatteringFromDensity(density, temperature);
            float sigmaT = sigmaA + sigmaS;
            
            // Beer-Powder for enhanced edge lighting
            float segmentTransmittance = beersPowder(sigmaT, dt);

            // Local light direction and attenuation
            vec3 localLightDir = normalize(lightPosition - currentPos);
            float lightDistance = length(lightPosition - currentPos);
            float lightAttenuation = coreLightFalloff(currentPos);

            // Advanced light marching with multi-scattering
            LightMarchResult lightResult = lightMarch(currentPos, localLightDir, lightDistance);
            float shadow = lightResult.transmittance;
            float multiScatter = lightResult.multiScatter;

            // Directional derivative for fast local diffuse
            float derivative = directionalDerivative(currentPos, localLightDir, density);
            float localDiffuse = clamp(0.5 + derivative * 0.4, 0.1, 1.0);

            // Nebula color based on temperature
            vec3 nebulaColor = getNebulaColor(temperature);

            // Star field influence on nearby nebula
            vec3 starTint = pow(sceneColor.rgb, vec3(1.25));
            float starLuma = dot(sceneColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            float starInfluence = smoothstep(0.04, 0.55, starLuma) * (1.0 - clamp(density * 0.2, 0.0, 0.85));
            nebulaColor = mix(nebulaColor, starTint, starInfluence * 0.5);

            // Self-emission from hot gas
            float volumeEmissionStrength = emissionFromDensity(density, temperature);
            vec3 volumeEmission = nebulaColor * volumeEmissionStrength * 0.1;
            vec3 emission = coreEmission(currentPos, density, temperature) * 0.08;
            
            // Accumulate emission attenuated by current transmittance
            accumulatedColor += (emission + volumeEmission) * transmittance * dt;

            // ============================================================
            // SINGLE SCATTERING (Primary lighting)
            // Energy-conserving integration using (1 - exp(-sigmaT * dt))
            // ============================================================
            float scatterAmount = (1.0 - segmentTransmittance) * (sigmaS / max(sigmaT, 1e-6));
            
            vec3 singleScatter = lightIntensity * lightAttenuation * shadow * 
                                 nebulaColor * phase * scatterAmount * localDiffuse * 2.5;

            // ============================================================
            // MULTI-SCATTERING APPROXIMATION
            // Simulates light that bounces multiple times within the volume
            // Creates softer, more diffuse illumination in dense regions
            // ============================================================
            vec3 multiScatterContrib = lightIntensity * lightAttenuation * 
                                       nebulaColor * multiScatter * multiScatterStrength;

            // ============================================================
            // AMBIENT TERM
            // Provides base illumination in heavily shadowed regions
            // Prevents nebula from becoming completely black
            // ============================================================
            vec3 ambient = nebulaColor * ambientDensity * density * dt * 
                          (1.0 - shadow * 0.7); // More ambient where shadows are deeper

            // Combine all lighting contributions
            accumulatedColor += (singleScatter + multiScatterContrib + ambient) * transmittance;

            // Update transmittance
            transmittance *= segmentTransmittance;
            cumulativeOpticalDepth += sigmaT * dt;

            currentT += dt;

            // Lock transmittance at scene depth for proper star compositing
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

        // Final compositing: stars attenuated by volume + accumulated nebula light
        vec3 finalColor = sceneColor.rgb * transmittanceToScene + accumulatedColor;
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `
  };
}
