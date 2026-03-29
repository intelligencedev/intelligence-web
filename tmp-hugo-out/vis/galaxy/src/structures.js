import * as THREE from 'three';

export function exponentialDiscDensity(r, scaleLength) {
  return Math.exp(-r / scaleLength);
}

export function sersicProfile(r, effectiveRadius, sersicIndex = 2.0) {
  const bn = 2.0 * sersicIndex - 1.0 / 3.0;
  const x = r / effectiveRadius;
  return Math.exp(-bn * (Math.pow(x, 1.0 / sersicIndex) - 1.0));
}

export function verticalDensity(z, scaleHeight) {
  return Math.exp(-Math.abs(z) / scaleHeight);
}

export function spiralArmRadius(theta, armIndex, pitchAngleDeg, numArms, baseRadius = 0.5) {
  const pitchAngleRad = (pitchAngleDeg * Math.PI) / 180.0;
  const b = Math.tan(pitchAngleRad);
  const armOffset = (armIndex * 2.0 * Math.PI) / numArms;
  const adjustedTheta = theta - armOffset;
  return baseRadius * Math.exp(b * adjustedTheta);
}

// Compute the distance from a point to the nearest spiral arm centerline
export function distanceToNearestArm(r, theta, params) {
  const pitchRad = (params.spiralPitchAngle * Math.PI) / 180.0;
  const b = Math.tan(pitchRad);
  const baseRadius = params.baseRadius || 0.5;
  
  let minDist = Infinity;
  
  // Wrap angle helper
  function wrapAngle(a) {
    a = (a + Math.PI) % (2.0 * Math.PI);
    if (a < 0) a += 2.0 * Math.PI;
    return a - Math.PI;
  }
  
  const rSafe = Math.max(r, baseRadius * 0.5);
  
  for (let arm = 0; arm < params.spiralArms; arm++) {
    const armOffset = (arm * 2.0 * Math.PI) / params.spiralArms;
    // For a given radius, compute where the arm centerline should be in theta
    const thetaOnArm = (b !== 0)
      ? (Math.log(rSafe / baseRadius) / b + armOffset)
      : armOffset;
    
    const dTheta = wrapAngle(theta - thetaOnArm);
    const arcDist = Math.abs(rSafe * dTheta);
    minDist = Math.min(minDist, arcDist);
  }
  
  return minDist;
}

// Compute spiral arm density enhancement factor (similar to nebula armFalloff)
export function spiralArmDensityFactor(r, theta, params) {
  const armWidth = params.armWidth || 0.35;
  const dist = distanceToNearestArm(r, theta, params);
  const sigma2 = armWidth * armWidth;
  return Math.exp(-(dist * dist) / (2.0 * sigma2));
}

export function galaxySurfaceDensity(r, theta, params) {
  const discDensity = exponentialDiscDensity(r, params.discScaleLength * params.galacticRadius);

  const bulgeDensity = r < (params.bulgeRadius * params.galacticRadius)
    ? sersicProfile(r, params.bulgeRadius * params.galacticRadius * 0.5)
    : 0.0;

  // Use proper spiral arm calculation matching the nebula
  const armFactor = spiralArmDensityFactor(r, theta, params);
  const spiralEnhancement = 1.0 + (params.armDensityMultiplier || 2.0) * armFactor;

  return (discDensity + 3.0 * bulgeDensity) * spiralEnhancement;
}

export function generateAccurateGalaxyStars(numStars, params, clusters) {
  const stars = [];
  const clusterSnapCount = Math.floor(numStars * params.clusterInfluence);

  const radiusSamples = 1000;
  const cumulativeProb = new Float32Array(radiusSamples);
  let totalDensity = 0;

  for (let i = 0; i < radiusSamples; i++) {
    const r = (i / radiusSamples) * params.galacticRadius;
    const thetaSamples = 32;
    let avgDensity = 0;

    for (let j = 0; j < thetaSamples; j++) {
      const theta = (j / thetaSamples) * 2.0 * Math.PI;
      avgDensity += galaxySurfaceDensity(r, theta, params);
    }
    avgDensity /= thetaSamples;

    const weightedDensity = avgDensity * r;
    totalDensity += weightedDensity;
    cumulativeProb[i] = totalDensity;
  }

  for (let i = 0; i < radiusSamples; i++) {
    cumulativeProb[i] /= totalDensity;
  }

  for (let i = 0; i < numStars; i++) {
    let r;
    let theta;
    let z;
    let stellarType;

    const snapToCluster = (i < clusterSnapCount) && clusters.length > 0;

    if (snapToCluster) {
      const cluster = clusters[Math.floor(Math.random() * clusters.length)];
      const jitterScale = cluster.radius * 0.3;

      r = Math.sqrt(cluster.center.x * cluster.center.x + cluster.center.y * cluster.center.y);
      r += (Math.random() - 0.5) * jitterScale;
      r = Math.max(0.1, Math.min(r, params.galacticRadius));

      theta = Math.atan2(cluster.center.y, cluster.center.x);
      theta += (Math.random() - 0.5) * 0.5;

      // Tighter vertical distribution for cluster stars
      const clusterZ = cluster.center.z;
      z = clusterZ + (Math.random() - 0.5) * jitterScale * 0.3;
    } else {
      // Sample radius from cumulative probability distribution
      const u = Math.random();
      let radiusIndex = 0;
      for (let j = 0; j < radiusSamples - 1; j++) {
        if (cumulativeProb[j] <= u && u < cumulativeProb[j + 1]) {
          radiusIndex = j;
          break;
        }
      }
      r = (radiusIndex / radiusSamples) * params.galacticRadius;

      // Sample theta with bias toward spiral arms
      // Use rejection sampling to concentrate stars along arms
      const maxAttempts = 8;
      let bestTheta = Math.random() * 2.0 * Math.PI;
      let bestArmFactor = 0;
      
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidateTheta = Math.random() * 2.0 * Math.PI;
        const armFactor = spiralArmDensityFactor(r, candidateTheta, params);
        
        // Accept with probability proportional to arm factor
        // This clusters stars more strongly along spiral arms
        if (armFactor > bestArmFactor) {
          bestTheta = candidateTheta;
          bestArmFactor = armFactor;
        }
        
        // Early accept if we're on an arm
        if (armFactor > 0.7 && Math.random() < 0.8) {
          bestTheta = candidateTheta;
          break;
        }
      }
      theta = bestTheta;

      // Vertical distribution with realistic scale height
      // Scale height varies with radius: thinner disc at large radii, slightly thicker near bulge
      const normalizedR = r / params.galacticRadius;
      const baseScaleHeight = params.verticalScaleHeight * params.galacticRadius;
      
      // Bulge region has different (rounder) vertical distribution
      const inBulge = normalizedR < params.bulgeRadius * 2.0;
      
      let effectiveScaleHeight;
      if (inBulge) {
        // Bulge is more spheroidal, but still flattened
        // Scale height decreases rapidly with radius to keep stars in a disc
        const bulgeInfluence = Math.exp(-normalizedR / (params.bulgeRadius * 2.0));
        effectiveScaleHeight = baseScaleHeight * (1.0 + bulgeInfluence * 0.5);
      } else {
        // Disc: thin layer that stays constant or slightly flares at edges
        effectiveScaleHeight = baseScaleHeight * (0.8 + 0.2 * normalizedR);
      }
      
      // Use exponential/sech^2 distribution (more realistic than pure Gaussian)
      // sech^2 has heavier tails but still thin disc
      const u1 = Math.random();
      // Inverse CDF of sech^2: z = h * arctanh(2u - 1) ≈ h * log(u / (1-u)) / 2
      const safeU = Math.max(0.001, Math.min(0.999, u1));
      const sechZ = effectiveScaleHeight * Math.log(safeU / (1 - safeU)) * 0.3;
      
      // Clamp to prevent outliers
      const maxZ = effectiveScaleHeight * 2.5;
      z = Math.max(-maxZ, Math.min(maxZ, sechZ));
      
      // Additional constraint: stars on spiral arms should be even more confined to disc
      const armFactor = spiralArmDensityFactor(r, theta, params);
      if (armFactor > 0.3) {
        // Compress z for arm stars (young stars in arms are very thin disc)
        z *= (1.0 - armFactor * 0.6);
      }
    }

    stellarType = selectStellarType(r, params);

    stars.push({
      r,
      theta,
      z,
      stellarType
    });
  }

  return stars;
}

export function selectStellarType(r, params) {
  const normalizedRadius = r / params.galacticRadius;
  let typeWeights;

  if (normalizedRadius < 0.3) {
    typeWeights = [0.02, 0.08, 0.15, 0.20, 0.25, 0.15, 0.10, 0.03, 0.01, 0.01];
  } else if (normalizedRadius < 0.7) {
    typeWeights = [0.01, 0.05, 0.10, 0.15, 0.25, 0.20, 0.15, 0.05, 0.03, 0.01];
  } else {
    typeWeights = [0.005, 0.02, 0.05, 0.10, 0.20, 0.25, 0.25, 0.08, 0.05, 0.02];
  }

  const random = Math.random();
  let cumulative = 0;
  for (let i = 0; i < typeWeights.length; i++) {
    cumulative += typeWeights[i];
    if (random < cumulative) {
      return i;
    }
  }
  return typeWeights.length - 1;
}

export function generateClusterCenters(
  numClusters,
  galacticRadius,
  spiralArms,
  baseRadius = 0.5,
  spiralPitchAngleDeg = 13.0,
  verticalScaleHeight = 0.04
) {
  const clusters = [];
  const pitchRad = (spiralPitchAngleDeg * Math.PI) / 180.0;
  const b = Math.tan(pitchRad);
  
  // Vertical scale in world units
  const vScale = verticalScaleHeight * galacticRadius;

  const clustersPerArm = Math.floor(numClusters * 0.75 / Math.max(1, spiralArms));
  for (let arm = 0; arm < spiralArms; arm++) {
    const armBaseAngle = (arm / spiralArms) * 2 * Math.PI;

    for (let i = 0; i < clustersPerArm; i++) {
      const progressAlongArm = (i + 0.5) / clustersPerArm;
      let radius = baseRadius + progressAlongArm * (galacticRadius * 0.85 - baseRadius);
      radius = Math.max(baseRadius * 0.5, Math.min(radius, galacticRadius * 0.92));

      let angleOnArm = armBaseAngle;
      if (b !== 0 && radius > 0 && baseRadius > 0) {
        angleOnArm = Math.log(radius / baseRadius) / b + armBaseAngle;
      }

      const x = radius * Math.cos(angleOnArm);
      const y = radius * Math.sin(angleOnArm);

      // Vertical position: clusters in arms are confined to thin disc
      // Use sech^2-like distribution with tighter constraint
      const normalizedR = radius / galacticRadius;
      const localVScale = vScale * (0.6 + 0.4 * normalizedR); // Slightly flared at edges
      const u = Math.random();
      const safeU = Math.max(0.01, Math.min(0.99, u));
      const z = localVScale * Math.log(safeU / (1 - safeU)) * 0.25;
      const maxZ = localVScale * 1.5;
      const clampedZ = Math.max(-maxZ, Math.min(maxZ, z));

      const jitterScale = (0.3 + Math.random() * 0.5) * 0.12;

      clusters.push({
        center: new THREE.Vector3(
          x + (Math.random() - 0.5) * jitterScale * radius,
          y + (Math.random() - 0.5) * jitterScale * radius,
          clampedZ + (Math.random() - 0.5) * localVScale * 0.2
        ),
        radius: (0.15 + Math.random() * 0.25) * (galacticRadius / 10),
        density: 0.3 + Math.random() * 0.4,
        armIndex: arm
      });
    }
  }

  const haloCount = numClusters - clusters.length;
  for (let i = 0; i < haloCount; i++) {
    const angle = Math.random() * 2 * Math.PI;
    // Bias toward inner regions where most disc stars are
    const radius = Math.pow(Math.random(), 1.5) * galacticRadius * 0.7;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);

    // Halo clusters still follow disc-like distribution but with slightly more vertical extent
    const normalizedRadius = radius / galacticRadius;
    const localVScale = vScale * (1.0 + normalizedRadius * 0.5);
    const u = Math.random();
    const safeU = Math.max(0.01, Math.min(0.99, u));
    const z = localVScale * Math.log(safeU / (1 - safeU)) * 0.35;
    const maxZ = localVScale * 2.0;
    const clampedZ = Math.max(-maxZ, Math.min(maxZ, z));

    clusters.push({
      center: new THREE.Vector3(x, y, clampedZ),
      radius: 0.3 + Math.random() * 0.5,
      density: 0.2 + Math.random() * 0.3,
      armIndex: -1
    });
  }

  return clusters;
}

export function getClusterInfluence(position, clusters) {
  let totalInfluence = 0;
  let spiralArmBonus = 0;

  clusters.forEach((cluster) => {
    const distance = position.distanceTo(cluster.center);
    const influence = cluster.density * Math.exp(-distance / cluster.radius);
    totalInfluence += influence;

    if (cluster.armIndex >= 0) {
      spiralArmBonus += influence * 0.3;
    }
  });

  return totalInfluence + spiralArmBonus;
}
