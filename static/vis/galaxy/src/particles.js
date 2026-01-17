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
  gradient.addColorStop(0.12, 'rgba(255,255,240,0.85)');
  gradient.addColorStop(0.28, 'rgba(255,240,220,0.35)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.08)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');

  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

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
    float intensity = texColor.r;
    if (intensity < 0.035) discard;

    vec3 color = pow(vColor, vec3(0.9));
    intensity = pow(intensity, 1.6);

    gl_FragColor = vec4(color * intensity, intensity * 0.9);
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
    instanceSizes[i] = galaxyParams.starSize * sizeFactor * 10.0;
  }

  starField.geometry.setAttribute('initPos', new THREE.InstancedBufferAttribute(initPositions, 3));
  starField.geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(instanceColors, 3));
  starField.geometry.setAttribute('instanceSize', new THREE.InstancedBufferAttribute(instanceSizes, 1));

  galaxyGroup.add(starField);
  return starField;
}
