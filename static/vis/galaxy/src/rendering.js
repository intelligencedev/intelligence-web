import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { loadBlueNoiseTexture } from './blueNoise.js';

function createDepthTexture(width, height) {
  const depthTexture = new THREE.DepthTexture(width, height);
  depthTexture.type = THREE.UnsignedShortType;
  depthTexture.format = THREE.DepthFormat;
  depthTexture.minFilter = THREE.NearestFilter;
  depthTexture.magFilter = THREE.NearestFilter;
  depthTexture.wrapS = THREE.ClampToEdgeWrapping;
  depthTexture.wrapT = THREE.ClampToEdgeWrapping;
  depthTexture.needsUpdate = true;
  return depthTexture;
}

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  // r177 uses outputColorSpace instead of outputEncoding.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setClearColor(0x000000, 1);
  container.appendChild(renderer.domElement);
  return renderer;
}

export function createControls(camera, renderer) {
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.25;
  controls.enableZoom = true;
  controls.enablePan = false;
  return controls;
}

export function createBlueNoiseUpdater() {
  let smokePass = null;
  const updateSmokePass = (pass) => {
    smokePass = pass;
  };

  const blueNoiseTexture = loadBlueNoiseTexture({
    onUpdate: (texture) => {
      if (smokePass && smokePass.uniforms && smokePass.uniforms.noiseTexture) {
        smokePass.uniforms.noiseTexture.value = texture;
      }
    }
  });

  return { blueNoiseTexture, updateSmokePass };
}

export function createPostProcessing({
  renderer,
  scene,
  camera,
  densityTexture,
  DENSITY_TEXTURE_SIZE,
  volumetricSmokeShader,
  blueNoiseTexture,
  galaxyParams
}) {
  const depthTexture = createDepthTexture(window.innerWidth, window.innerHeight);

  const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping
  });

  // Make scene depth available to post-processing passes (e.g. volumetric integration).
  renderTarget.depthTexture = depthTexture;
  renderTarget.depthBuffer = true;

  const composer = new EffectComposer(renderer, renderTarget);

  // EffectComposer clones the render target for ping-ponging. Each render target must have its
  // own depth texture to avoid read/write feedback.
  if (composer.renderTarget2) {
    composer.renderTarget2.depthTexture = createDepthTexture(window.innerWidth, window.innerHeight);
    composer.renderTarget2.depthBuffer = true;
  }
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  let smokePass = null;
  let bloomPass = null;
  if (densityTexture) {
    volumetricSmokeShader.uniforms.tDensity.value = densityTexture;
    volumetricSmokeShader.uniforms.cameraPos.value = camera.position;
    volumetricSmokeShader.uniforms.screenResolution.value = new THREE.Vector2(window.innerWidth, window.innerHeight);
    volumetricSmokeShader.uniforms.noiseTexture.value = blueNoiseTexture;
    if (volumetricSmokeShader.uniforms.tDepth) {
      volumetricSmokeShader.uniforms.tDepth.value = depthTexture;
    }

    const imgWidth = blueNoiseTexture.image && blueNoiseTexture.image.width ? blueNoiseTexture.image.width : 1;
    const imgHeight = blueNoiseTexture.image && blueNoiseTexture.image.height ? blueNoiseTexture.image.height : 1;
    volumetricSmokeShader.uniforms.noiseScale.value = new THREE.Vector2(
      1 / imgWidth,
      1 / imgHeight
    );

    volumetricSmokeShader.uniforms.boxMin.value = new THREE.Vector3(
      -galaxyParams.galacticRadius,
      -galaxyParams.galacticRadius,
      -galaxyParams.galacticRadius * 0.5
    );
    volumetricSmokeShader.uniforms.boxMax.value = new THREE.Vector3(
      galaxyParams.galacticRadius,
      galaxyParams.galacticRadius,
      galaxyParams.galacticRadius * 0.5
    );

    smokePass = new ShaderPass(volumetricSmokeShader);
    // Fullscreen post passes should not write/test depth.
    smokePass.material.depthWrite = false;
    smokePass.material.depthTest = false;
    composer.addPass(smokePass);

    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      // Strength / radius tuned for a subtle cinematic bloom.
      0.85,
      0.35,
      0.0
    );
    composer.addPass(bloomPass);

    const outputPass = new OutputPass();
    outputPass.renderToScreen = true;
    composer.addPass(outputPass);
  } else {
    const copyPass = new ShaderPass(CopyShader);
    copyPass.renderToScreen = true;
    composer.addPass(copyPass);
  }

  return { composer, smokePass, bloomPass };
}

export function handleResize({
  camera,
  renderer,
  composer,
  smokePass,
  bloomPass,
  blueNoiseTexture
}) {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);

  if (composer) {
    composer.setSize(window.innerWidth, window.innerHeight);
  }

  // Ensure composer depth textures track resize.
  const depthTexture1 = composer?.renderTarget1?.depthTexture;
  if (depthTexture1) {
    depthTexture1.image.width = window.innerWidth;
    depthTexture1.image.height = window.innerHeight;
    depthTexture1.needsUpdate = true;
  }

  const depthTexture2 = composer?.renderTarget2?.depthTexture;
  if (depthTexture2) {
    depthTexture2.image.width = window.innerWidth;
    depthTexture2.image.height = window.innerHeight;
    depthTexture2.needsUpdate = true;
  }

  if (bloomPass) {
    bloomPass.setSize(window.innerWidth, window.innerHeight);
  }

  if (smokePass) {
    smokePass.uniforms.screenResolution.value.set(window.innerWidth, window.innerHeight);
    const imgWidth = blueNoiseTexture.image && blueNoiseTexture.image.width ? blueNoiseTexture.image.width : 1;
    const imgHeight = blueNoiseTexture.image && blueNoiseTexture.image.height ? blueNoiseTexture.image.height : 1;
    smokePass.uniforms.noiseScale.value.set(1 / imgWidth, 1 / imgHeight);
  }
}
