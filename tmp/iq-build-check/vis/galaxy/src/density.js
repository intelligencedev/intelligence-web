import * as THREE from 'three';
import { isMobile } from './rendering.js';

export const DENSITY_TEXTURE_SIZE = 128;

// Convert Float32 to Float16 (half precision)
function float32ToFloat16(val) {
  const floatView = new Float32Array(1);
  const int32View = new Int32Array(floatView.buffer);
  floatView[0] = val;
  const f = int32View[0];
  
  const sign = (f >> 16) & 0x8000;
  let exponent = ((f >> 23) & 0xff) - 127 + 15;
  let mantissa = f & 0x7fffff;
  
  if (exponent <= 0) {
    if (exponent < -10) return sign;
    mantissa = (mantissa | 0x800000) >> (1 - exponent);
    return sign | (mantissa >> 13);
  } else if (exponent === 0xff - 127 + 15) {
    if (mantissa === 0) return sign | 0x7c00;
    return sign | 0x7c00 | (mantissa >> 13);
  }
  
  if (exponent > 30) return sign | 0x7c00;
  return sign | (exponent << 10) | (mantissa >> 13);
}

export function setupDensityTexture({
  galaxyParams,
  sharedGalaxyClusters,
  onTextureReady
}) {
  const useMobileFormat = isMobile();
  const dataSize = DENSITY_TEXTURE_SIZE * DENSITY_TEXTURE_SIZE * DENSITY_TEXTURE_SIZE * 2;
  
  // Use HalfFloat on mobile for better compatibility
  const textureType = useMobileFormat ? THREE.HalfFloatType : THREE.FloatType;
  const initialData = useMobileFormat 
    ? new Uint16Array(dataSize) 
    : new Float32Array(dataSize);
  
  console.log('[Galaxy] Density texture type:', useMobileFormat ? 'HalfFloat' : 'Float');
  
  const densityTexture = new THREE.Data3DTexture(
    initialData,
    DENSITY_TEXTURE_SIZE,
    DENSITY_TEXTURE_SIZE,
    DENSITY_TEXTURE_SIZE
  );
  densityTexture.format = THREE.RGFormat;
  densityTexture.type = textureType;
  densityTexture.minFilter = THREE.LinearFilter;
  densityTexture.magFilter = THREE.LinearFilter;
  densityTexture.wrapS = THREE.ClampToEdgeWrapping;
  densityTexture.wrapT = THREE.ClampToEdgeWrapping;
  densityTexture.wrapR = THREE.ClampToEdgeWrapping;
  densityTexture.unpackAlignment = 1;
  densityTexture.needsUpdate = true;

  if (!window.Worker) {
    console.error('Web Workers are not supported in this browser.');
    if (onTextureReady) onTextureReady(densityTexture);
    return { densityTexture, densityWorker: null };
  }

  const densityWorker = new Worker('densityWorker.js');
  densityWorker.onmessage = (event) => {
    const { textureData } = event.data;
    const float32Data = new Float32Array(textureData);
    
    // Convert to HalfFloat on mobile
    if (useMobileFormat) {
      const halfData = new Uint16Array(float32Data.length);
      for (let i = 0; i < float32Data.length; i++) {
        halfData[i] = float32ToFloat16(float32Data[i]);
      }
      densityTexture.image.data = halfData;
    } else {
      densityTexture.image.data = float32Data;
    }
    densityTexture.needsUpdate = true;

    if (onTextureReady) {
      onTextureReady(densityTexture);
    }

    densityWorker.terminate();
  };
  densityWorker.onerror = (error) => {
    console.error('Error from density worker:', error);
    // Still call onTextureReady so scene can render without volumetrics
    if (onTextureReady) onTextureReady(densityTexture);
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
