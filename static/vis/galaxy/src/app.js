import * as THREE from "three";
import { galaxyParams, controlParams } from "./params.js";
import { createCamera } from "./camera.js";
import {
  createRenderer,
  createControls,
  createBlueNoiseUpdater,
  createPostProcessing,
  handleResize,
} from "./rendering.js";
import { createBackgroundStarField, createStarField } from "./particles.js";
import { generateClusterCenters } from "./structures.js";
import { setupDensityTexture, DENSITY_TEXTURE_SIZE } from "./density.js";
import { createBlackHoleLensingShader, createVolumetricSmokeShader } from "./shaders.js";

window.__GALAXY_APP_LOADED__ = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = createCamera();
const renderer = createRenderer(document.body);

const controls = createControls(camera, renderer);
// Default camera pose (from the UI screenshot).
camera.position.set(-0.31, -1.45, -0.61);
camera.rotation.set(
  THREE.MathUtils.degToRad(112.7),
  THREE.MathUtils.degToRad(-11.1),
  THREE.MathUtils.degToRad(155.4),
);
// OrbitControls drives orientation via `target`; derive a target from the rotation so
// the initial pose matches and remains stable once controls update.
{
  const forward = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
  controls.target.copy(camera.position).addScaledVector(forward, 1.0);
}
controls.update();

const galaxyGroup = new THREE.Group();
scene.add(galaxyGroup);

let globalTime = 0;
let lastFrameTime = performance.now();

const { blueNoiseTexture, updateSmokePass } = createBlueNoiseUpdater();
const volumetricSmokeShader = createVolumetricSmokeShader({
  galaxyParams,
  blueNoiseTexture,
});

const blackHoleShader = createBlackHoleLensingShader({ galaxyParams });

let sharedGalaxyClusters = generateClusterCenters(
  20,
  galaxyParams.galacticRadius * 0.8,
  galaxyParams.spiralArms,
  galaxyParams.baseRadius,
  galaxyParams.spiralPitchAngle,
  galaxyParams.verticalScaleHeight,
);

let starField = createStarField({
  galaxyParams,
  galaxyGroup,
  sharedGalaxyClusters,
});

let backgroundStarField = createBackgroundStarField({
  galaxyParams,
  scene,
});

let composer = null;
let smokePass = null;
let blackHolePass = null;
let bloomPass = null;
let densityTexture = null;
let densityWorker = null;

function initDensityTexture() {
  const result = setupDensityTexture({
    galaxyParams,
    sharedGalaxyClusters,
    onTextureReady: (texture) => {
      densityTexture = texture;
      if (!composer) {
        const post = createPostProcessing({
          renderer,
          scene,
          camera,
          densityTexture,
          DENSITY_TEXTURE_SIZE,
          volumetricSmokeShader,
          blackHoleShader,
          blueNoiseTexture,
          galaxyParams,
        });
        composer = post.composer;
        smokePass = post.smokePass;
        blackHolePass = post.blackHolePass;
        bloomPass = post.bloomPass;
        updateSmokePass(smokePass);
        if (smokePass?.uniforms?.timeScale) {
          smokePass.uniforms.timeScale.value = galaxyParams.orbitalTimeScale;
        }
      } else if (smokePass && smokePass.uniforms) {
        smokePass.uniforms.tDensity.value = densityTexture;
      }
    },
  });
  densityTexture = result.densityTexture;
  densityWorker = result.densityWorker;
}

initDensityTexture();

function animate() {
  requestAnimationFrame(animate);

  const currentTime = performance.now();
  const deltaTime = (currentTime - lastFrameTime) / 1000;
  lastFrameTime = currentTime;
  globalTime += deltaTime;

  controls.update();

  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  if (starField) {
    starField.material.uniforms.uTime.value = globalTime;
  }

  if (backgroundStarField) {
    backgroundStarField.material.uniforms.uTime.value = globalTime;
    backgroundStarField.position.copy(camera.position);
  }

  if (smokePass) {
    smokePass.uniforms.u_time.value = globalTime;
    smokePass.uniforms.cameraPos.value.copy(camera.position);
    smokePass.uniforms.invProjectionMatrix.value.copy(
      camera.projectionMatrixInverse,
    );
    smokePass.uniforms.invModelViewMatrix.value.copy(camera.matrixWorld);
    if (smokePass.uniforms.steps) {
      smokePass.uniforms.steps.value = galaxyParams.rayMarchSteps;
    }
    if (smokePass.uniforms.tDepth && composer?.readBuffer?.depthTexture) {
      smokePass.uniforms.tDepth.value = composer.readBuffer.depthTexture;
    }
  }

  if (blackHolePass && blackHolePass.uniforms) {
    // Project the galactic center (world origin) into screen UV.
    const center = new THREE.Vector3(0, 0, 0).project(camera);
    const centerUvX = center.x * 0.5 + 0.5;
    const centerUvY = center.y * 0.5 + 0.5;
    if (blackHolePass.uniforms.uCenterUv) {
      blackHolePass.uniforms.uCenterUv.value.set(centerUvX, centerUvY);
    }
    if (blackHolePass.uniforms.uEnabled) {
      blackHolePass.uniforms.uEnabled.value = galaxyParams.blackHoleEnabled;
    }
    if (blackHolePass.uniforms.uMass) blackHolePass.uniforms.uMass.value = galaxyParams.blackHoleMass;
    if (blackHolePass.uniforms.uLensStrength) blackHolePass.uniforms.uLensStrength.value = galaxyParams.blackHoleLensStrength;
    if (blackHolePass.uniforms.uHorizonRadius) blackHolePass.uniforms.uHorizonRadius.value = galaxyParams.blackHoleHorizonRadius;
    if (blackHolePass.uniforms.uPhotonRingRadius) blackHolePass.uniforms.uPhotonRingRadius.value = galaxyParams.blackHolePhotonRingRadius;
    if (blackHolePass.uniforms.uPhotonRingWidth) blackHolePass.uniforms.uPhotonRingWidth.value = galaxyParams.blackHolePhotonRingWidth;
    if (blackHolePass.uniforms.uPhotonRingIntensity) blackHolePass.uniforms.uPhotonRingIntensity.value = galaxyParams.blackHolePhotonRingIntensity;
    if (blackHolePass.uniforms.uAccretionIntensity) blackHolePass.uniforms.uAccretionIntensity.value = galaxyParams.blackHoleAccretionIntensity;
    if (blackHolePass.uniforms.uAccretionRadius) blackHolePass.uniforms.uAccretionRadius.value = galaxyParams.blackHoleAccretionRadius;
    if (blackHolePass.uniforms.uAccretionWidth) blackHolePass.uniforms.uAccretionWidth.value = galaxyParams.blackHoleAccretionWidth;
    if (blackHolePass.uniforms.uDiskInclination) blackHolePass.uniforms.uDiskInclination.value = galaxyParams.blackHoleDiskInclination;
    if (blackHolePass.uniforms.uDopplerStrength) blackHolePass.uniforms.uDopplerStrength.value = galaxyParams.blackHoleDopplerStrength;
  }

  const cameraInfo = document.getElementById("camera-info");
  if (cameraInfo) {
    cameraInfo.innerHTML =
      `Camera: x: ${camera.position.x.toFixed(2)}, y: ${camera.position.y.toFixed(2)}, z: ${camera.position.z.toFixed(2)}<br>` +
      `Rotation: x: ${THREE.MathUtils.radToDeg(camera.rotation.x).toFixed(1)}, y: ${THREE.MathUtils.radToDeg(camera.rotation.y).toFixed(1)}, z: ${THREE.MathUtils.radToDeg(camera.rotation.z).toFixed(1)}`;
  }

  if (composer) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
}

animate();

window.handleParamChange = function handleParamChange(key, val) {
  const densityRegenKeys = [
    "galacticRadius",
    "verticalScaleHeight",
    "discScaleLength",
    "spiralArms",
    "spiralPitchAngle",
    "baseRadius",
    "armWidth",
    "armDensityMultiplier",
    "clusterInfluence",
  ];
  const starRegenKeys = [
    "numStars",
    "starSize",
    "coreRadius",
    "galacticRadius",
    "spiralArms",
    "discScaleLength",
    "bulgeRadius",
    "verticalScaleHeight",
    "spiralPitchAngle",
    "clusterInfluence",
    "baseRadius",
  ];

  const backgroundRegenKeys = [
    "backgroundStarCount",
    "backgroundStarInnerRadius",
    "backgroundStarOuterRadius",
    "backgroundStarSize",
  ];

  const needsDensityRegen = densityRegenKeys.includes(key);
  const needsStarRegen = starRegenKeys.includes(key);
  const needsBackgroundRegen = backgroundRegenKeys.includes(key);

  if (needsDensityRegen || needsStarRegen) {
    if (
      [
        "galacticRadius",
        "spiralArms",
        "baseRadius",
        "spiralPitchAngle",
        "verticalScaleHeight",
      ].includes(key)
    ) {
      sharedGalaxyClusters = generateClusterCenters(
        20,
        galaxyParams.galacticRadius * 0.8,
        galaxyParams.spiralArms,
        galaxyParams.baseRadius,
        galaxyParams.spiralPitchAngle,
        galaxyParams.verticalScaleHeight,
      );
    }
  }

  if (needsDensityRegen) {
    if (densityWorker) {
      densityWorker.terminate();
      densityWorker = null;
    }
    initDensityTexture();
  }

  if (needsStarRegen) {
    if (starField) {
      galaxyGroup.remove(starField);
      starField.geometry.dispose();
      starField.material.dispose();
      starField = null;
    }
    starField = createStarField({
      galaxyParams,
      galaxyGroup,
      sharedGalaxyClusters,
    });
  }

  if (needsBackgroundRegen) {
    if (backgroundStarField) {
      scene.remove(backgroundStarField);
      backgroundStarField.geometry.dispose();
      backgroundStarField.material.dispose();
      backgroundStarField = null;
    }
    backgroundStarField = createBackgroundStarField({
      galaxyParams,
      scene,
    });
  }

  if (starField && key === "orbitalTimeScale") {
    starField.material.uniforms.timeScale.value = val;
  }
  if (smokePass && key === "orbitalTimeScale" && smokePass.uniforms.timeScale) {
    smokePass.uniforms.timeScale.value = val;
  }
  if (starField && key === "coreRadius") {
    starField.material.uniforms.coreRadiusUniform.value = val;
  }

  if (smokePass) {
    if (key === "densityFactor") smokePass.uniforms.densityFactor.value = val;
    if (key === "absorptionCoefficient")
      smokePass.uniforms.absorptionCoefficient.value = val;
    if (key === "scatteringCoefficient")
      smokePass.uniforms.scatteringCoefficient.value = val;
    if (key === "rayMarchSteps") smokePass.uniforms.steps.value = val;
    if (key === "centralLightIntensity") {
      smokePass.uniforms.lightIntensity.value
        .setRGB(1.0, 0.9, 0.8)
        .multiplyScalar(val);
    }
    if (key === "nebulaCoolColor" && smokePass.uniforms.nebulaCoolColor) {
      smokePass.uniforms.nebulaCoolColor.value.set(val);
    }
    if (key === "nebulaDustColor" && smokePass.uniforms.nebulaDustColor) {
      smokePass.uniforms.nebulaDustColor.value.set(val);
    }
    if (key === "nebulaWarmColor" && smokePass.uniforms.nebulaWarmColor) {
      smokePass.uniforms.nebulaWarmColor.value.set(val);
    }
    if (key === "galacticRadius" && smokePass.uniforms.boxMin) {
      smokePass.uniforms.boxMin.value.set(-val, -val, -val * 0.5);
      smokePass.uniforms.boxMax.value.set(val, val, val * 0.5);
    }
  }
};

window.addEventListener(
  "resize",
  () => {
    handleResize({
      camera,
      renderer,
      composer,
      smokePass,
      blackHolePass,
      bloomPass,
      blueNoiseTexture,
    });
  },
  false,
);

window.galaxyParams = galaxyParams;
window.controlParams = controlParams;
