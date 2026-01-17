import * as THREE from 'three';

export function createCamera() {
  return new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
}

export function setupCameraIntro({
  camera,
  controls,
  onComplete
}) {
  const cameraAnimation = {
    isActive: true,
    duration: 1660.0,
    startTime: 0,
    startPosition: new THREE.Vector3(0, 0, 0),
    endPosition: new THREE.Vector3(144, -56, -164),
    currentRotation: 0,
    rotationSpeed: 0.3,
    update(currentTime) {
      if (!this.isActive) return;

      if (this.startTime === 0) {
        this.startTime = currentTime;
      }

      const elapsed = currentTime - this.startTime;
      const progress = Math.min(elapsed / this.duration, 1.0);

      if (progress >= 1.0) {
        this.isActive = false;
        controls.enabled = true;
        if (onComplete) {
          onComplete();
        }
        return;
      }

      controls.enabled = false;

      const easeProgress = Math.pow(progress, 0.9);

      camera.position.lerpVectors(this.startPosition, this.endPosition, easeProgress);

      const lookTarget = new THREE.Vector3(0, 0, 0);
      const barrelRollAngle = progress * 20 * Math.PI;

      const baseUpVector = new THREE.Vector3(0, 1, 0);
      const rollAxis = new THREE.Vector3().subVectors(lookTarget, camera.position);

      if (rollAxis.lengthSq() > 0.0001) {
        rollAxis.normalize();
        const rollQuaternion = new THREE.Quaternion().setFromAxisAngle(rollAxis, barrelRollAngle);
        camera.up.copy(baseUpVector).applyQuaternion(rollQuaternion);
      } else {
        camera.up.copy(baseUpVector);
      }

      this.lastUpdateTime = currentTime;
      camera.lookAt(lookTarget);
    }
  };

  camera.position.set(0, 0, 0);
  camera.rotation.set(0, 0, 0);
  controls.enabled = false;

  return cameraAnimation;
}
