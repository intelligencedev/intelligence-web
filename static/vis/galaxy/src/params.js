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
  numStars: 51700,
  starSize: 0.002,
  backgroundStarCount: 150000,
  backgroundStarInnerRadius: 5.0,
  backgroundStarOuterRadius: 10.0,
  backgroundStarSize: 0.012,
  galacticRadius: 2.07,
  spiralArms: 2,
  coreRadius: 2.0,
  orbitalTimeScale: 2.7, // Time scaling factor for orbital motion
  // Galaxy structure parameters
  discScaleLength: 0.31, // h_r ≈ 0.43 R_gal
  bulgeRadius: 0.05, // R < 0.05 R_gal
  verticalScaleHeight: 0.02, // h_z ≈ 0.04 R_gal
  spiralPitchAngle: 20, // degrees
  clusterInfluence: 0.0, // 11% of stars snap to clusters
  // New spiral arm parameters
  baseRadius: 0.1, // For spiral calculations (stars and nebula)
  armWidth: 0.73, // Width of nebula arms
  armDensityMultiplier: 1.0, // Max density boost on nebula arms
  // Volumetric nebula parameters (replacing old smoke particles)
  // Tuned for physically-based extinction (sigmaT = sigmaA + sigmaS) so stars still shine through.
  densityFactor: 1.1,
  absorptionCoefficient: 5.0,
  scatteringCoefficient: 20.0,
  // Nebula palette (editable via UI)
  nebulaCoolColor: '#1f47f2',
  nebulaDustColor: '#8c401f',
  nebulaWarmColor: '#ffdbb3',
  rayMarchSteps: 32,
  sunPosition: new THREE.Vector3(0.0, 0.0, 0.0),
  centralLightIntensity: 0.71
};
