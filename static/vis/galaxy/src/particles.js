import * as THREE from 'three';
import { starTypes } from './params.js';
import {
  generateAccurateGalaxyStars,
  generateClusterCenters,
  selectStellarType
} from './structures.js';

export function createCircularGradientTexture() {
  const canvas = document.createElement('canvas');
  const size = 128;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size / 2;

  const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.1, 'rgba(255,255,220,0.8)');
  gradient.addColorStop(0.3, 'rgba(255,220,200,0.4)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');

  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  context.strokeStyle = 'rgba(255,255,255,0.2)';
  context.lineWidth = radius * 0.02;
  context.beginPath();
  context.moveTo(0, centerY);
  context.lineTo(size, centerY);
  context.moveTo(centerX, 0);
  context.lineTo(centerX, size);
  context.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

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

  uniform float uTime;
  uniform float timeScale;
  uniform float coreRadiusUniform;

  varying vec3 vColor;
  varying vec2 vUv;

  #define PI 3.14159265359

  float angularVel(float r) {
    if (r < 0.01) r = 0.01;
    return sqrt(GM / pow(r, 3.0));
  }

  void main() {
    vColor = instanceColor;
    vUv = uv;

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
  uniform sampler2D starTexture;
  varying vec3 vColor;
  varying vec2 vUv;

  void main() {
    vec4 texColor = texture2D(starTexture, vUv);
    if (texColor.a < 0.05) discard;

    // Slightly boost highlights so stars punch through the volumetrics.
    vec3 color = vColor;
    color = pow(color, vec3(0.85));

    gl_FragColor = texColor * vec4(color * 1.35, 1.0);
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
      starTexture: { value: createCircularGradientTexture() },
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
    instanceSizes[i] = galaxyParams.starSize * sizeFactor * 15;
  }

  starField.geometry.setAttribute('initPos', new THREE.InstancedBufferAttribute(initPositions, 3));
  starField.geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(instanceColors, 3));
  starField.geometry.setAttribute('instanceSize', new THREE.InstancedBufferAttribute(instanceSizes, 1));

  galaxyGroup.add(starField);
  return starField;
}

const smokeVertexShader = `
  attribute float aParticleSize;
  attribute float angle;
  attribute float radius;
  attribute float aParticleOpacity;

  varying float vParticleOpacity;
  varying vec3 vWorldPosition;

  uniform float uTime;
  uniform float uSize;

  void main() {
    vParticleOpacity = aParticleOpacity;

    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = modelPosition.xyz;

    vec4 viewPosition = viewMatrix * modelPosition;

    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = uSize * aParticleSize;
  }
`;

const smokeFragmentShader = `
  uniform vec3 uSmokeColor;
  uniform float uTime;
  uniform float uNoiseIntensity;
  uniform vec3 uCentralLightPosition;
  uniform float uCentralLightIntensity;
  uniform vec3 uCameraPosition;
  uniform sampler2D uParticleTexture;
  uniform float uDensityFactor;
  uniform int uMarchSteps;
  uniform float uDiffuseStrength;
  uniform sampler2D uBlueNoiseTexture;

  varying vec3 vWorldPosition;
  varying float vParticleOpacity;

  void main() {
    vec2 pointCoord = gl_PointCoord;
    float dist = length(pointCoord - vec2(0.5));

    if (dist > 0.5) {
      discard;
    }

    vec3 particleColor = uSmokeColor * (1.5 - dist);
    float alpha = (1.0 - dist * 2.0) * vParticleOpacity;

    gl_FragColor = vec4(particleColor, alpha);
  }
`;

export function createSmokeField({
  galaxyParams,
  galaxyGroup,
  camera,
  blueNoiseTexture,
  globalTime
}) {
  // NOTE:
  // These are legacy "smoke" sprites and tend to read as fake once the 3D density
  // volumetrics are enabled. Default them off unless explicitly requested.
  if (!galaxyParams.numSmokeParticles || galaxyParams.numSmokeParticles <= 0) {
    return { smokePoints: null, smokeData: [] };
  }

  const count = galaxyParams.numSmokeParticles;
  const positions = [];
  const colors = [];
  const sizes = [];
  const opacities = [];
  const angles = [];
  const radii = [];
  const smokeData = [];

  for (let i = 0; i < count; i++) {
    const arm = Math.floor(Math.random() * galaxyParams.spiralArms);
    let r = THREE.MathUtils.randFloat(galaxyParams.baseRadius, galaxyParams.galacticRadius);
    const pitch = THREE.MathUtils.degToRad(galaxyParams.spiralPitchAngle);
    let theta0 = Math.log(r / galaxyParams.baseRadius) / Math.tan(pitch) + (arm * (2 * Math.PI / galaxyParams.spiralArms));
    r += (Math.random() - 0.5) * galaxyParams.smokeNoiseIntensity;
    const z = (Math.random() - 0.5) * galaxyParams.verticalScaleHeight;

    positions.push(r * Math.cos(theta0), r * Math.sin(theta0), z);
    angles.push(theta0);
    radii.push(r);
    smokeData.push({ r, theta0, z });

    const t = Math.random();
    const smokeColor1 = new THREE.Color(0x101025).multiplyScalar(1.5);
    const smokeColor2 = new THREE.Color(0x251510).multiplyScalar(1.5);
    const color = new THREE.Color().lerpColors(smokeColor1, smokeColor2, t);
    colors.push(color.r, color.g, color.b);

    sizes.push(galaxyParams.smokeParticleSize * (0.5 + Math.random() * 1.0));
    opacities.push(0.15 + Math.random() * 0.25);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  geometry.setAttribute('aParticleSize', new THREE.BufferAttribute(new Float32Array(sizes), 1));
  geometry.setAttribute('aParticleOpacity', new THREE.BufferAttribute(new Float32Array(opacities), 1));
  geometry.setAttribute('angle', new THREE.BufferAttribute(new Float32Array(angles), 1));
  geometry.setAttribute('radius', new THREE.BufferAttribute(new Float32Array(radii), 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: globalTime },
      uSmokeColor: { value: new THREE.Color(galaxyParams.smokeParticleColor) },
      uSize: { value: galaxyParams.smokeParticleSize },
      uNoiseIntensity: { value: galaxyParams.smokeNoiseIntensity },
      uCentralLightPosition: { value: new THREE.Vector3(0, 0, 0) },
      uCentralLightIntensity: { value: 1.0 },
      uCameraPosition: { value: camera.position },
      uParticleTexture: { value: createCircularGradientTexture() },
      uBlueNoiseTexture: { value: blueNoiseTexture },
      uDensityFactor: { value: 5.0 },
      uMarchSteps: { value: 6 },
      uDiffuseStrength: { value: 9.0 },
      time: { value: globalTime },
      rotationSpeed: { value: 5e-4 }
    },
    vertexShader: smokeVertexShader,
    fragmentShader: smokeFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const smokePoints = new THREE.Points(geometry, material);
  galaxyGroup.add(smokePoints);

  return { smokePoints, smokeData };
}

export function regenerateSmoke({
  galaxyGroup,
  smokePoints,
  smokeData,
  galaxyParams,
  camera,
  blueNoiseTexture,
  globalTime
}) {
  if (smokePoints) {
    galaxyGroup.remove(smokePoints);
    smokePoints.geometry.dispose();
    smokePoints.material.dispose();
  }

  return createSmokeField({
    galaxyParams,
    galaxyGroup,
    camera,
    blueNoiseTexture,
    globalTime
  });
}
