import * as THREE from 'three';

export const starTypes = [
  { type: 'O-type', colorRange: { min: [0.2, 0.2, 0.9], max: [0.4, 0.4, 1] }, luminosityRange: { min: 2.5, max: 5.0 } },
  { type: 'B-type', colorRange: { min: [0.6, 0.7, 1], max: [0.8, 0.9, 1] }, luminosityRange: { min: 2.0, max: 4.0 } },
  { type: 'A-type', colorRange: { min: [0.8, 0.8, 0.95], max: [0.9, 0.9, 1] }, luminosityRange: { min: 1.5, max: 2.5 } },
  { type: 'F-type', colorRange: { min: [0.95, 0.95, 0.8], max: [1, 1, 0.9] }, luminosityRange: { min: 1.2, max: 1.8 } },
  { type: 'G-type', colorRange: { min: [1, 0.95, 0.7], max: [1, 1, 0.8] }, luminosityRange: { min: 0.9, max: 1.3 } },
  { type: 'K-type', colorRange: { min: [1, 0.6, 0.4], max: [1, 0.8, 0.6] }, luminosityRange: { min: 0.6, max: 1.0 } },
  { type: 'M-type', colorRange: { min: [1, 0.3, 0.3], max: [1, 0.5, 0.5] }, luminosityRange: { min: 0.4, max: 0.7 } },
  { type: 'Red Giant', colorRange: { min: [1, 0.4, 0.2], max: [1, 0.6, 0.4] }, luminosityRange: { min: 2.0, max: 4.0 } },
  { type: 'White Dwarf', colorRange: { min: [0.7, 0.7, 0.9], max: [0.9, 0.9, 1] }, luminosityRange: { min: 0.8, max: 1.5 } },
  { type: 'Brown Dwarf', colorRange: { min: [0.3, 0.15, 0.1], max: [0.5, 0.3, 0.2] }, luminosityRange: { min: 0.1, max: 0.3 } }
];

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // Approx 137.5 degrees

export const controlParams = {
  rotationSpeed: 1e-4
};

export const galaxyParams = {
  numStars: 10000,
  starSize: 0.0032,
  galacticRadius: 4,
  spiralArms: 2,
  coreRadius: 0.05,
  orbitalTimeScale: 20.9, // Time scaling factor for orbital motion
  // Galaxy structure parameters
  discScaleLength: 0.29, // h_r ≈ 0.29 R_gal
  bulgeRadius: 0.05, // R < 0.05 R_gal
  verticalScaleHeight: 0.05, // h_z ≈ 0.05 R_gal
  spiralPitchAngle: 12.5, // degrees (12.5°)
  clusterInfluence: 0.09, // 9% of stars snap to clusters
  // New spiral arm parameters
  baseRadius: 0.1, // For spiral calculations (stars and nebula)
  armWidth: 0.17, // Width of nebula arms
  armDensityMultiplier: 5.0, // Max density boost on nebula arms
  // Volumetric nebula parameters (replacing old smoke particles)
  // Tuned for physically-based extinction (sigmaT = sigmaA + sigmaS) so stars still shine through.
  densityFactor: 14.0,
  absorptionCoefficient: 0.28,
  scatteringCoefficient: 5.2,
  rayMarchSteps: 96,
  godRaysIntensity: 0.35,
  sunPosition: new THREE.Vector3(0.0, 0.0, 0.0),
  anisotropyG: 0.35,
  centralLightIntensity: 0.9
};
