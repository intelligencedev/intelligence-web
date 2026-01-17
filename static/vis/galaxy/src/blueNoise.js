import * as THREE from 'three';

export function createBlueNoiseTexture(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const imageData = context.createImageData(size, size);

  // Generate pseudo-blue noise using a simple algorithm
  for (let i = 0; i < imageData.data.length; i += 4) {
    const x = (i / 4) % size;
    const y = Math.floor((i / 4) / size);

    // Use multiple offset hash functions to approximate blue noise distribution
    const hash1 = ((x * 73856093) ^ (y * 19349663)) % 1000000;
    const hash2 = ((x * 83492791) ^ (y * 57885161)) % 1000000;
    const noise = (Math.sin(hash1 * 0.001) + Math.sin(hash2 * 0.001)) * 0.5;

    const value = Math.floor((noise + 1) * 127.5);
    imageData.data[i] = value;     // R
    imageData.data[i + 1] = value; // G
    imageData.data[i + 2] = value; // B
    imageData.data[i + 3] = 255;   // A
  }

  context.putImageData(imageData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

export function loadBlueNoiseTexture({
  url = 'BlueNoise470.png',
  fallbackSize = 128,
  onUpdate
} = {}) {
  const proceduralTexture = createBlueNoiseTexture(fallbackSize);
  let blueNoiseTexture = proceduralTexture;

  new THREE.TextureLoader().load(
    url,
    (loadedTexture) => {
      blueNoiseTexture = loadedTexture;
      blueNoiseTexture.wrapS = THREE.RepeatWrapping;
      blueNoiseTexture.wrapT = THREE.RepeatWrapping;
      blueNoiseTexture.needsUpdate = true;
      if (typeof onUpdate === 'function') {
        onUpdate(blueNoiseTexture);
      }
    },
    undefined,
    (error) => {
      console.warn('Failed to load BlueNoise470.png, using procedural fallback:', error);
    }
  );

  blueNoiseTexture.wrapS = THREE.RepeatWrapping;
  blueNoiseTexture.wrapT = THREE.RepeatWrapping;
  blueNoiseTexture.needsUpdate = true;

  return blueNoiseTexture;
}
