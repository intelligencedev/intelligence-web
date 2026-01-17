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

export function galaxySurfaceDensity(r, theta, params) {
  const discDensity = exponentialDiscDensity(r, params.discScaleLength * params.galacticRadius);

  const bulgeDensity = r < (params.bulgeRadius * params.galacticRadius)
    ? sersicProfile(r, params.bulgeRadius * params.galacticRadius * 0.5)
    : 0.0;

  let spiralEnhancement = 1.0;
  const armWidth = 0.3;

  for (let arm = 0; arm < params.spiralArms; arm++) {
    const expectedR = spiralArmRadius(theta, arm, params.spiralPitchAngle, params.spiralArms);
    const armDistance = Math.abs(r - expectedR);
    const armFactor = Math.exp(-Math.pow(armDistance / armWidth, 2.0));
    spiralEnhancement += 2.0 * armFactor;
  }

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

      z = cluster.center.z + (Math.random() - 0.5) * jitterScale * 0.5;
    } else {
      const u = Math.random();
      let radiusIndex = 0;
      for (let j = 0; j < radiusSamples - 1; j++) {
        if (cumulativeProb[j] <= u && u < cumulativeProb[j + 1]) {
          radiusIndex = j;
          break;
        }
      }
      r = (radiusIndex / radiusSamples) * params.galacticRadius;

      theta = Math.random() * 2.0 * Math.PI;

      const spiralBias = 0.3;
      for (let arm = 0; arm < params.spiralArms; arm++) {
        const expectedR = spiralArmRadius(theta, arm, params.spiralPitchAngle, params.spiralArms);
        if (Math.abs(r - expectedR) < 0.5) {
          const armTheta = Math.log(r / 0.5) / Math.tan((params.spiralPitchAngle * Math.PI) / 180.0);
          const armOffset = (arm * 2.0 * Math.PI) / params.spiralArms;
          const targetTheta = armTheta + armOffset;
          theta = theta * (1.0 - spiralBias) + targetTheta * spiralBias;
          break;
        }
      }

      const scaleHeight = params.verticalScaleHeight * params.galacticRadius;
      const u1 = Math.random();
      const u2 = Math.random();
      const gaussian = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      z = gaussian * scaleHeight * 0.5;
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
  spiralPitchAngleDeg = 13.0
) {
  const clusters = [];
  const pitchRad = (spiralPitchAngleDeg * Math.PI) / 180.0;
  const b = Math.tan(pitchRad);

  const clustersPerArm = Math.floor(numClusters * 0.7 / Math.max(1, spiralArms));
  for (let arm = 0; arm < spiralArms; arm++) {
    const armBaseAngle = (arm / spiralArms) * 2 * Math.PI;

    for (let i = 0; i < clustersPerArm; i++) {
      const progressAlongArm = (i + 0.5) / clustersPerArm;
      let radius = baseRadius + progressAlongArm * (galacticRadius * 0.8 - baseRadius);
      radius = Math.max(baseRadius * 0.5, Math.min(radius, galacticRadius * 0.9));

      let angleOnArm = armBaseAngle;
      if (b !== 0 && radius > 0 && baseRadius > 0) {
        angleOnArm = Math.log(radius / baseRadius) / b + armBaseAngle;
      }

      const x = radius * Math.cos(angleOnArm);
      const y = radius * Math.sin(angleOnArm);

      const zScale = (1.0 - radius / galacticRadius) * 0.4 + 0.05;
      const z = (Math.random() - 0.5) * galacticRadius * zScale;

      const jitterScale = (0.5 + Math.random() * 0.8) * 0.15;

      clusters.push({
        center: new THREE.Vector3(
          x + (Math.random() - 0.5) * jitterScale * radius,
          y + (Math.random() - 0.5) * jitterScale * radius,
          z + (Math.random() - 0.5) * jitterScale * galacticRadius * 0.1
        ),
        radius: (0.2 + Math.random() * 0.3) * (galacticRadius / 10),
        density: 0.3 + Math.random() * 0.4,
        armIndex: arm
      });
    }
  }

  const haloCount = numClusters - clusters.length;
  for (let i = 0; i < haloCount; i++) {
    const angle = Math.random() * 2 * Math.PI;
    const radius = Math.pow(Math.random(), 1.8) * galacticRadius;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);

    const normalizedRadius = radius / galacticRadius;
    const verticalScale = Math.exp(-normalizedRadius * 3.0) * 2.0 + 0.1;
    const z = (Math.random() - 0.5) * verticalScale;

    clusters.push({
      center: new THREE.Vector3(x, y, z),
      radius: 0.5 + Math.random() * 0.8,
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
