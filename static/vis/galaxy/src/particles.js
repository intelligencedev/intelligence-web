import * as THREE from 'three';
import { starTypes } from './params.js';
import { generateAccurateGalaxyStars } from './structures.js';

export function generateStarColorWithLuminosity(colorRange) {
  const r = THREE.MathUtils.lerp(colorRange.min[0], colorRange.max[0], Math.random());
  const g = THREE.MathUtils.lerp(colorRange.min[1], colorRange.max[1], Math.random());
  const b = THREE.MathUtils.lerp(colorRange.min[2], colorRange.max[2], Math.random());
  return new THREE.Color(r, g, b);
}

const starVertexShader = `
  uniform float GM;
  attribute vec3 initPos;
  attribute vec3 instanceColor;
  attribute float instanceSize;
  attribute float instanceRotation;
  attribute float instanceTwinkle;
  attribute float instanceBrightness;

  uniform float uTime;
  uniform float timeScale;
  uniform float coreRadiusUniform;

  varying vec3 vColor;
  varying vec2 vUv;
  varying float vRotation;
  varying float vTwinkle;
  varying float vBrightness;

  #define PI 3.14159265359

  float angularVel(float r) {
    if (r < 0.01) r = 0.01;
    return sqrt(GM / pow(r, 3.0));
  }

  void main() {
    vColor = instanceColor;
    vUv = uv;
    vRotation = instanceRotation;
    vTwinkle = instanceTwinkle;
    vBrightness = instanceBrightness;

    float r = initPos.x;
    float theta0 = initPos.y;

    float omega = angularVel(r);
    float theta = theta0 - omega * uTime * timeScale;

    vec3 rotatedWorldPos = vec3(r * cos(theta), r * sin(theta), initPos.z);

    vec4 mvPosition = modelViewMatrix * vec4(rotatedWorldPos, 1.0);
    mvPosition.xy += position.xy * instanceSize;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const starFragmentShader = `
  uniform float uTime;
  varying vec3 vColor;
  varying vec2 vUv;
  varying float vRotation;
  varying float vTwinkle;
  varying float vBrightness;

  #define PI 3.14159265359

  vec2 rotate(vec2 p, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }

  // Cheap(ish) Airy-ish point spread function.
  // Stars are unresolved points; what we "see" is the lens/sensor response.
  float airyPSF(float r) {
    // Scale controls ring spacing.
    float x = r * 12.0;
    float sinc = 1.0;
    if (x > 1e-3) {
      sinc = sin(x) / x;
    }
    float airy = sinc * sinc;
    // Dampen far rings so we don't get noisy aliasing.
    airy *= exp(-r * 2.4);
    return airy;
  }

  // Diffraction spikes for bright stars (aperture / optics artifacts).
  float diffractionSpikes(vec2 uv, float brightness) {
    float r = length(uv);
    // 6-blade aperture look, rotated per-instance.
    float ang = atan(uv.y, uv.x);
    float blades = 6.0;
    float blade = pow(max(0.0, cos(ang * blades * 0.5)), 24.0);
    // Stretch outward.
    float radial = 1.0 / (r * 10.0 + 0.25);
    float gate = smoothstep(0.35, 0.95, brightness);
    return blade * radial * gate;
  }

  void main() {
    vec2 uv = vUv * 2.0 - 1.0;
    vec2 rotatedUv = rotate(uv, vRotation);

    float brightness = clamp(vBrightness, 0.0, 1.0);

    float r = length(uv);

    // Tight gaussian core (keeps faint stars from looking like orbs).
    float coreSharpness = mix(120.0, 45.0, brightness);
    float core = exp(-r * r * coreSharpness);

    // Airy rings are mostly visible on brighter stars.
    float rings = airyPSF(r * mix(1.35, 1.0, brightness)) * (0.25 + 0.45 * brightness);

    // Diffraction spikes: only show up strongly on bright stars.
    float spikes = diffractionSpikes(rotatedUv, brightness) * (0.08 + 0.35 * brightness);

    // Atmospheric scintillation / sensor flicker (subtle).
    float twinkle = 0.9 + 0.1 * sin(uTime * (1.35 + brightness * 2.2) + vTwinkle);
    twinkle *= 0.96 + 0.04 * sin(uTime * 2.7 + vTwinkle * 3.1);

    // Per-star flux scaling (lets bloom pick up only the brightest ones).
    float flux = mix(0.35, 2.6, pow(brightness, 1.2));

    float intensity = (core + rings + spikes) * twinkle * flux;

    if (intensity < 0.015) discard;

    // Bright stars saturate toward white in the core (sensor clipping).
    vec3 color = pow(vColor, vec3(0.9));
    float coreMask = exp(-r * r * 35.0);
    float whiteMix = smoothstep(0.55, 1.0, brightness) * coreMask;
    color = mix(color, vec3(1.0), whiteMix);

    // Additive blending in Three.js uses SRC_ALPHA, so keep alpha at 1.0 to avoid
    // unintentionally squaring intensity (which makes stars look like big orbs).
    gl_FragColor = vec4(color * intensity, 1.0);
  }
`;

export function createStarField({
  galaxyParams,
  galaxyGroup,
  sharedGalaxyClusters
}) {
  const numStars = galaxyParams.numStars;
  const starGeo = new THREE.PlaneGeometry(1, 1);

  const starMaterial = new THREE.ShaderMaterial({
    uniforms: {
      GM: { value: 4.3e-6 },
      uTime: { value: 0.0 },
      timeScale: { value: galaxyParams.orbitalTimeScale },
      coreRadiusUniform: { value: galaxyParams.coreRadius }
    },
    vertexShader: starVertexShader,
    fragmentShader: starFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    // Write depth so the volumetric post-pass can clamp ray marching to foreground stars.
    // This avoids incorrectly dimming stars that are in front of the volume.
    depthWrite: true,
    depthTest: true
  });

  const starField = new THREE.InstancedMesh(starGeo, starMaterial, numStars);
  const starData = generateAccurateGalaxyStars(numStars, galaxyParams, sharedGalaxyClusters || []);

  const initPositions = new Float32Array(numStars * 3);
  const instanceColors = new Float32Array(numStars * 3);
  const instanceSizes = new Float32Array(numStars * 1);
  const instanceRotations = new Float32Array(numStars * 1);
  const instanceTwinkles = new Float32Array(numStars * 1);
  const instanceBrightness = new Float32Array(numStars * 1);
  const tempColor = new THREE.Color();

  for (let i = 0; i < numStars; i++) {
    const star = starData[i];
    const starType = starTypes[star.stellarType];

    initPositions[i * 3] = star.r;
    initPositions[i * 3 + 1] = star.theta;
    initPositions[i * 3 + 2] = star.z;

    const colorObj = generateStarColorWithLuminosity(starType.colorRange, starType.luminosityRange);
    tempColor.set(colorObj);
    instanceColors[i * 3 + 0] = tempColor.r;
    instanceColors[i * 3 + 1] = tempColor.g;
    instanceColors[i * 3 + 2] = tempColor.b;

    const luminosity = THREE.MathUtils.lerp(starType.luminosityRange.min, starType.luminosityRange.max, Math.random());
    let sizeFactor = 0.3 + luminosity * 0.25;
    if (starType.type === 'Red Giant') sizeFactor *= 2.0;
    else if (starType.type === 'White Dwarf') sizeFactor *= 0.3;
    else if (starType.type === 'O-type' || starType.type === 'B-type') sizeFactor *= 1.3;

    sizeFactor = Math.max(0.15, Math.min(sizeFactor, 3.0));
    instanceSizes[i] = galaxyParams.starSize * sizeFactor * 10.0;
    instanceRotations[i] = Math.random() * Math.PI * 2.0;
    instanceTwinkles[i] = Math.random() * Math.PI * 2.0;

    // Map physical-ish luminosity into a 0..1 brightness control for the PSF.
    // Keeps most stars small/point-like and reserves bloom/spikes for a minority.
    const brightnessNorm = THREE.MathUtils.clamp((luminosity - 0.1) / (5.0 - 0.1), 0, 1);
    instanceBrightness[i] = Math.pow(brightnessNorm, 0.55);
  }

  starField.geometry.setAttribute('initPos', new THREE.InstancedBufferAttribute(initPositions, 3));
  starField.geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(instanceColors, 3));
  starField.geometry.setAttribute('instanceSize', new THREE.InstancedBufferAttribute(instanceSizes, 1));
  starField.geometry.setAttribute('instanceRotation', new THREE.InstancedBufferAttribute(instanceRotations, 1));
  starField.geometry.setAttribute('instanceTwinkle', new THREE.InstancedBufferAttribute(instanceTwinkles, 1));
  starField.geometry.setAttribute('instanceBrightness', new THREE.InstancedBufferAttribute(instanceBrightness, 1));

  galaxyGroup.add(starField);
  return starField;
}
