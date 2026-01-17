import * as THREE from 'three';

export const DENSITY_TEXTURE_SIZE = 128;

export function setupDensityTexture({
  galaxyParams,
  sharedGalaxyClusters,
  onTextureReady
}) {
  const dataSize = DENSITY_TEXTURE_SIZE * DENSITY_TEXTURE_SIZE * DENSITY_TEXTURE_SIZE * 2;
  const densityTexture = new THREE.Data3DTexture(
    new Float32Array(dataSize),
    DENSITY_TEXTURE_SIZE,
    DENSITY_TEXTURE_SIZE,
    DENSITY_TEXTURE_SIZE
  );
  densityTexture.format = THREE.RGFormat;
  densityTexture.type = THREE.FloatType;
  densityTexture.minFilter = THREE.LinearFilter;
  densityTexture.magFilter = THREE.LinearFilter;
  densityTexture.wrapS = THREE.ClampToEdgeWrapping;
  densityTexture.wrapT = THREE.ClampToEdgeWrapping;
  densityTexture.wrapR = THREE.ClampToEdgeWrapping;
  densityTexture.unpackAlignment = 1;
  densityTexture.needsUpdate = true;

  if (!window.Worker) {
    console.error('Web Workers are not supported in this browser.');
    return { densityTexture, densityWorker: null };
  }

  const densityWorker = new Worker('densityWorker.js');
  densityWorker.onmessage = (event) => {
    const { textureData } = event.data;
    const densityData = new Float32Array(textureData);

    densityTexture.image.data = densityData;
    densityTexture.needsUpdate = true;

    if (onTextureReady) {
      onTextureReady(densityTexture);
    }

    densityWorker.terminate();
  };
  densityWorker.onerror = (error) => {
    console.error('Error from density worker:', error);
  };

  if (!sharedGalaxyClusters) {
    console.error('sharedGalaxyClusters should be generated before setupDensityTexture!');
  }

  densityWorker.postMessage({
    textureSize: DENSITY_TEXTURE_SIZE,
    galaxyParams: {
      galacticRadius: galaxyParams.galacticRadius,
      verticalScaleHeight: galaxyParams.verticalScaleHeight,
      discScaleLength: galaxyParams.discScaleLength,
      spiralArms: galaxyParams.spiralArms,
      spiralPitchAngle: galaxyParams.spiralPitchAngle,
      baseRadius: galaxyParams.baseRadius,
      armWidth: galaxyParams.armWidth,
      armDensityMultiplier: galaxyParams.armDensityMultiplier
    },
    noiseScale: 0.08,
    clusterCenters: sharedGalaxyClusters
  });

  return { densityTexture, densityWorker };
}
