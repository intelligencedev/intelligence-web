import * as THREE from 'three';

export function createCamera() {
  return new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
}

