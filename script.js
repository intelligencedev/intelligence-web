import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';

const starTypes = [
    { type: "O-type", colorRange: { min: [0.2, 0.2, 0.9], max: [0.4, 0.4, 1] }, luminosityRange: { min: 2.5, max: 5.0 } },
    { type: "B-type", colorRange: { min: [0.6, 0.7, 1], max: [0.8, 0.9, 1] }, luminosityRange: { min: 2.0, max: 4.0 } },
    { type: "A-type", colorRange: { min: [0.8, 0.8, 0.95], max: [0.9, 0.9, 1] }, luminosityRange: { min: 1.5, max: 2.5 } },
    { type: "F-type", colorRange: { min: [0.95, 0.95, 0.8], max: [1, 1, 0.9] }, luminosityRange: { min: 1.2, max: 1.8 } },
    { type: "G-type", colorRange: { min: [1, 0.95, 0.7], max: [1, 1, 0.8] }, luminosityRange: { min: 0.9, max: 1.3 } },
    { type: "K-type", colorRange: { min: [1, 0.6, 0.4], max: [1, 0.8, 0.6] }, luminosityRange: { min: 0.6, max: 1.0 } },
    { type: "M-type", colorRange: { min: [1, 0.3, 0.3], max: [1, 0.5, 0.5] }, luminosityRange: { min: 0.4, max: 0.7 } },
    { type: "Red Giant", colorRange: { min: [1, 0.4, 0.2], max: [1, 0.6, 0.4] }, luminosityRange: { min: 2.0, max: 4.0 } },
    { type: "White Dwarf", colorRange: { min: [0.7, 0.7, 0.9], max: [0.9, 0.9, 1] }, luminosityRange: { min: 0.8, max: 1.5 } },
    { type: "Brown Dwarf", colorRange: { min: [0.3, 0.15, 0.1], max: [0.5, 0.3, 0.2] }, luminosityRange: { min: 0.1, max: 0.3 } }
];

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // Approx 137.5 degrees

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding; // Corrected from sRGBEncoding
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// Create a procedural blue noise texture as fallback
function createBlueNoiseTexture() {
    const size = 128;
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

// Create a procedural blue noise texture as fallback
const proceduralBlueNoiseTexture = createBlueNoiseTexture();
let blueNoiseTexture = proceduralBlueNoiseTexture; // Default to procedural

// Try to load BlueNoise470.png, fallback to procedural texture
new THREE.TextureLoader().load(
    'BlueNoise470.png',
    function(loadedTexture) {
        blueNoiseTexture = loadedTexture;
        blueNoiseTexture.wrapS = THREE.RepeatWrapping;
        blueNoiseTexture.wrapT = THREE.RepeatWrapping;
        blueNoiseTexture.needsUpdate = true;
        // If smokePass already exists, update its uniform
        if (smokePass && smokePass.uniforms && smokePass.uniforms.noiseTexture) {
            smokePass.uniforms.noiseTexture.value = blueNoiseTexture;
        }
    },
    undefined, // onProgress
    function(error) {
        console.warn('Failed to load BlueNoise470.png, using procedural fallback:', error);
        // blueNoiseTexture is already set to proceduralBlueNoiseTexture
    }
);
blueNoiseTexture.wrapS = THREE.RepeatWrapping;
blueNoiseTexture.wrapT = THREE.RepeatWrapping;
blueNoiseTexture.needsUpdate = true;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.25;
controls.enableZoom = true;
controls.enablePan = false;

// Set camera position after controls are initialized
camera.position.set(0.52, -7.77, 1.51);
camera.rotation.set(THREE.MathUtils.degToRad(79.0), THREE.MathUtils.degToRad(3.9), THREE.MathUtils.degToRad(-18.7));
controls.update(); // Update controls to match camera position

const galaxyGroup = new THREE.Group();
scene.add(galaxyGroup);

const controlParams = {
    rotationSpeed: 1e-4
};

// Add time tracking for continuous animation
let globalTime = 0;
let lastFrameTime = performance.now(); // Initialize lastFrameTime

window.galaxyParams = {
    numStars: 1000,
    starSize: 0.02,
    galacticRadius: 4,
    spiralArms: 2,
    coreRadius: 0.30,
    orbitalTimeScale: 10.0, // Time scaling factor for orbital motion
    // Galaxy structure parameters
    discScaleLength: 0.35, // h_r ≈ 0.35 R_gal
    bulgeRadius: 0.2, // R < 0.2 R_gal
    verticalScaleHeight: 0.06, // h_z ≈ 0.06 R_gal
    spiralPitchAngle: 13.0, // degrees (12°-14°)
    clusterInfluence: 0.20, // 20% of stars snap to clusters
    // New spiral arm parameters
    baseRadius: 0.5, // For spiral calculations (stars and nebula)
    armWidth: 0.35, // Width of nebula arms
    armDensityMultiplier: 4.0, // Max density boost on nebula arms
    // Volumetric nebula parameters (replacing old smoke particles)
    densityFactor: 15.0, // Increased for better visibility
    absorptionCoefficient: 0.5, // Reduced for better visibility
    scatteringCoefficient: 6.0,
    rayMarchSteps: 96,
    godRaysIntensity: 0.33,
    sunPosition: new THREE.Vector3(0.0, 0.0, 0.0),
    anisotropyG: 0.1,
    centralLightIntensity: 0.3,
    // Dust/Smoke Params
    numSmokeParticles: 10000,
    smokeParticleSize: 0.5, // Increased for better visibility
    smokeNoiseIntensity: 1.0
};

// --- START: GPU Instanced Stars ---

const starVertexShader = `
    uniform float GM;
    attribute vec3 initPos;       // (r, theta0, z) for circular orbit
    attribute vec3 instanceColor; // Color of the star
    attribute float instanceSize;  // Size of the star

    uniform float uTime;
    uniform float timeScale;
    uniform float coreRadiusUniform;

    varying vec3 vColor;
    varying vec2 vUv;

    #define PI 3.14159265359

    // Keplerian angular velocity - physics-driven orbital motion
    float angularVel(float r) { 
        // Add safety check to prevent division by zero
        if (r < 0.01) r = 0.01;
        return sqrt(GM / pow(r, 3.0)); 
    }

    void main() {
        vColor = instanceColor;
        vUv = uv;

        float r = initPos.x;
        float theta0 = initPos.y;
        
        // Physics-driven orbital motion: θ = θ₀ - ω·time (clockwise rotation)
        // where ω = angularVel(r) is the Keplerian angular velocity
        float omega = angularVel(r);
        float theta = theta0 - omega * uTime * timeScale;

        vec3 rotatedWorldPos = vec3(r * cos(theta), r * sin(theta), initPos.z);

        vec4 mvPosition = modelViewMatrix * vec4(rotatedWorldPos, 1.0);
        mvPosition.xy += position.xy * instanceSize;

        gl_Position = projectionMatrix * mvPosition;
    }
`;

const starFragmentShader = `
    uniform sampler2D starTexture; 
    varying vec3 vColor;
    varying vec2 vUv;

    void main() {
        vec4 texColor = texture2D(starTexture, vUv);
        if (texColor.a < 0.05) discard; 

        gl_FragColor = texColor * vec4(vColor, 1.0); 
    }
`;

let starField;

// --- START: Volumetric Smoke ---
let densityTexture = null;
// Shared cluster centers must be initialized before setupDensityTexture is called
let sharedGalaxyClusters = null;
let densityWorker = null;
const DENSITY_TEXTURE_SIZE = 128;

function setupDensityTexture() {
    // Allocate 3D Texture with RG16F format for HDR density data
    const dataSize = DENSITY_TEXTURE_SIZE * DENSITY_TEXTURE_SIZE * DENSITY_TEXTURE_SIZE * 2; // 2 components (RG)
    densityTexture = new THREE.Data3DTexture(
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

    // Initialize Web Worker
    if (window.Worker) {
        densityWorker = new Worker('densityWorker.js');
        densityWorker.onmessage = function(e) {
            const { textureData } = e.data;
            console.log("Received density data from worker, size:", textureData.byteLength);
            
            // Create new Float32Array from the transferred buffer
            const densityData = new Float32Array(textureData);
            console.log("First few density values:", densityData.slice(0, 10));
            
            // Check for non-zero values
            let nonZeroCount = 0;
            let maxValue = 0;
            for (let i = 0; i < densityData.length; i += 2) {
                if (densityData[i] > 0.01) nonZeroCount++;
                maxValue = Math.max(maxValue, densityData[i]);
            }
            console.log(`Density validation: ${nonZeroCount} non-zero voxels, max value: ${maxValue.toFixed(3)}`);
            
            densityTexture.image.data = densityData;
            densityTexture.needsUpdate = true;
            console.log("HDR density texture updated by worker.");
            
            // Setup post-processing now that texture is ready
            if (!composer) {
                console.log("Setting up post-processing with density texture");
                setupPostProcessing();
            } else {
                // Update existing smokePass with new texture
                if (smokePass && smokePass.uniforms) {
                    smokePass.uniforms.tDensity.value = densityTexture;
                    console.log("Updated existing smokePass with new density texture");
                }
            }

            // Worker has done its job, can terminate if not needed for updates
            densityWorker.terminate(); 
            densityWorker = null;

            console.log("Density worker terminated after processing.");
        };
        densityWorker.onerror = function(error) {
            console.error('Error from density worker:', error);
        };

        // Start computation
        // Clusters should already be generated before this function is called
        if (!sharedGalaxyClusters) {
            console.error("sharedGalaxyClusters should be generated before setupDensityTexture!");
            // Generate as fallback
            sharedGalaxyClusters = generateClusterCenters(20, galaxyParams.galacticRadius * 0.8, galaxyParams.spiralArms, galaxyParams.baseRadius, galaxyParams.spiralPitchAngle);
        }

        densityWorker.postMessage({
            textureSize: DENSITY_TEXTURE_SIZE,
            galaxyParams: { // Send relevant params
                galacticRadius: galaxyParams.galacticRadius,
                verticalScaleHeight: galaxyParams.verticalScaleHeight,
                discScaleLength: galaxyParams.discScaleLength,
                spiralArms: galaxyParams.spiralArms,
                spiralPitchAngle: galaxyParams.spiralPitchAngle,
                baseRadius: galaxyParams.baseRadius, // New
                armWidth: galaxyParams.armWidth,         // New
                armDensityMultiplier: galaxyParams.armDensityMultiplier // New
            },
            noiseScale: 0.08, // Finer noise scale for better detail
            clusterCenters: sharedGalaxyClusters
        });

    } else {
        console.error('Web Workers are not supported in this browser.');
        // Fallback or error message
    }
}


const volumetricSmokeShader = {
    uniforms: {
        'tDiffuse': { value: null }, // Scene render
        'tDensity': { value: null }, // RG16F density texture
        'cameraPos': { value: new THREE.Vector3() },
        'invProjectionMatrix': { value: new THREE.Matrix4() },
        'invModelViewMatrix': { value: new THREE.Matrix4() },
        'screenResolution': { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        'u_time': { value: 0.0 },
        'absorptionCoefficient': { value: 0.5 }, // Reduced for better visibility
        'scatteringCoefficient': { value: 6.0 },
        'phaseG': { value: 0.1 }, // Henyey-Greenstein g
        'lightPosition': { value: new THREE.Vector3(0, 0, 0) },
        'lightIntensity': { value: new THREE.Color(1.0, 0.9, 0.8).multiplyScalar(3.0) },
        'densityFactor': { value: 15.0 }, // Increased for better visibility
        'steps': { value: 96 }, // Increased for better quality
        'noiseTexture': { value: blueNoiseTexture },
        'noiseScale': { value: new THREE.Vector2(1, 1) },
        'boxMin': { value: new THREE.Vector3(-galaxyParams.galacticRadius, -galaxyParams.galacticRadius, -galaxyParams.galacticRadius * 0.5) },
        'boxMax': { value: new THREE.Vector3(galaxyParams.galacticRadius, galaxyParams.galacticRadius, galaxyParams.galacticRadius * 1.5) },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        precision highp float;
        precision highp sampler3D;
        
        uniform sampler2D tDiffuse; // Scene texture
        uniform sampler3D tDensity;  // RG format: R=density, G=temperature
        uniform vec3 cameraPos;
        uniform mat4 invProjectionMatrix;
        uniform mat4 invModelViewMatrix;
        uniform vec2 screenResolution;
        uniform float u_time;
        uniform float absorptionCoefficient;
        uniform float scatteringCoefficient;
        uniform float phaseG;
        uniform vec3 lightPosition;
        uniform vec3 lightIntensity;
        uniform float densityFactor;
        uniform int steps;
        uniform sampler2D noiseTexture;
        uniform vec2 noiseScale;
        uniform vec3 boxMin;
        uniform vec3 boxMax;

        varying vec2 vUv;

        #define PI 3.14159265359
        #define MAX_STEPS 128
        #define EMPTY_SPACE_THRESHOLD 0.001 // Reduced threshold for better visibility

        // Henyey-Greenstein phase function
        float henyeyGreenstein(float cosTheta, float g) {
            float g2 = g * g;
            return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
        }

        // Intersection of a ray with an AABB
        bool intersectBox(vec3 ro, vec3 rd, vec3 boxMin, vec3 boxMax, out float t0, out float t1) {
            vec3 invDir = 1.0 / rd;
            vec3 tbot = invDir * (boxMin - ro);
            vec3 ttop = invDir * (boxMax - ro);
            vec3 tmin = min(ttop, tbot);
            vec3 tmax = max(ttop, tbot);
            float t_enter = max(max(tmin.x, tmin.y), tmin.z);
            float t_exit = min(min(tmax.x, tmax.y), tmax.z);
            t0 = t_enter;
            t1 = t_exit;
            return t_exit > max(0.0, t_enter);
        }

        // Sample density with early exit optimization
        vec2 sampleDensity(vec3 pos_world) {
            // Transform world position to texture coordinates [0, 1]
            vec3 texCoord = (pos_world - boxMin) / (boxMax - boxMin);
            
            // Early exit if outside volume bounds
            if (any(lessThan(texCoord, vec3(0.0))) || any(greaterThan(texCoord, vec3(1.0)))) {
                return vec2(0.0);
            }
            
            vec2 densityData = texture(tDensity, texCoord).rg;
            return densityData * densityFactor;
        }

        // Temperature-based color mixing
        vec3 getNebulaColor(float temperature) {
            // Enhanced color palette for better blue knots / red dust lanes
            vec3 coolColor  = vec3(0.15, 0.35, 1.0);  // brighter blue for knots
            vec3 dustColor  = vec3(0.6, 0.3, 0.1);    // brownish absorption/dust lanes
            vec3 warmColor  = vec3(1.0, 0.9, 0.75);   // core light / warmer regions
            
            if (temperature < 0.4) {
                return mix(dustColor, coolColor, smoothstep(0.05, 0.4, temperature));
            } else {
                return mix(coolColor, warmColor, smoothstep(0.4, 1.0, temperature));
            }
        }

        void main() {
            // Sample scene color
            vec4 sceneColor = texture2D(tDiffuse, vUv);
            
            // Calculate ray direction from camera through fragment
            vec2 screenPos = vUv * 2.0 - 1.0;
            screenPos.x *= screenResolution.x / screenResolution.y; // Correct aspect ratio
            
            // Create ray direction in view space
            vec4 clipPos = vec4(screenPos, 1.0, 1.0);
            vec4 viewPos = invProjectionMatrix * clipPos;
            viewPos /= viewPos.w;
            
            // Transform to world space
            vec3 rayDir = normalize((invModelViewMatrix * vec4(viewPos.xyz, 0.0)).xyz);
            vec3 rayOrigin = cameraPos;

            float tNear, tFar;
            if (!intersectBox(rayOrigin, rayDir, boxMin, boxMax, tNear, tFar)) {
                gl_FragColor = sceneColor;
                return;
            }
            
            tNear = max(tNear, 0.0);
            
            if (tFar <= tNear) {
                gl_FragColor = sceneColor;
                return;
            }

            // Debug: Add a simple color tint to verify ray-box intersection is working
            // Remove this after debugging
            if (gl_FragCoord.x < 10.0 && gl_FragCoord.y < 10.0) {
                gl_FragColor = vec4(sceneColor.rgb + vec3(0.1, 0.0, 0.0), 1.0); // Red tint in corner
                return;
            }

            // HDR accumulation
            vec3 accumulatedColor = vec3(0.0);
            float transmittance = 1.0;
            float maxDensitySampled = 0.0; // Debug: track max density
            
            // Jitter ray start for noise reduction
            float noiseVal = texture(noiseTexture, gl_FragCoord.xy * noiseScale).r;
            float stepSize = (tFar - tNear) / float(steps);
            float currentT = tNear + noiseVal * stepSize;
            
            int actualSteps = min(steps, MAX_STEPS);
            
            for (int i = 0; i < MAX_STEPS; ++i) {
                if (i >= actualSteps || currentT >= tFar || transmittance < 0.01) break;

                vec3 currentPos = rayOrigin + rayDir * currentT;
                vec2 densityData = sampleDensity(currentPos);
                float density = densityData.r;
                float temperature = densityData.g;
                
                maxDensitySampled = max(maxDensitySampled, density); // Debug: track max density

                if (density > EMPTY_SPACE_THRESHOLD) {
                    // Adaptive step size based on density
                    float adaptiveStepSize = stepSize * clamp(0.1, 1.0 / (density * 8.0 + 1.0), 1.0);
                    
                    // Beer-Lambert Law for absorption
                    float absorption = absorptionCoefficient * density * adaptiveStepSize;
                    // Modulate extinction by density and temperature for dust lanes
                    absorption *= mix(1.0, 2.0, 1.0 - clamp(temperature, 0.0, 1.0)); // Extra dust if temperature low
                    float stepTransmittance = exp(-absorption);
                    
                    // Scattering calculation
                    vec3 lightDir = normalize(lightPosition - currentPos);
                    float cosTheta = dot(-rayDir, lightDir);
                    float phase = henyeyGreenstein(cosTheta, phaseG);
                    
                    // Simple light attenuation (could be improved with shadow raymarching)
                    float lightDistance = length(lightPosition - currentPos);
                    float lightAttenuation = 1.0 / (1.0 + lightDistance * lightDistance * 0.01);
                    
                    // Nebula color based on temperature
                    vec3 nebulaColor = getNebulaColor(temperature);
                    
                    // Scattered light contribution
                    vec3 scatteredLight = lightIntensity * nebulaColor * scatteringCoefficient * 
                                         density * phase * lightAttenuation * adaptiveStepSize;
                    
                    accumulatedColor += scatteredLight * transmittance;
                    transmittance *= stepTransmittance;
                    
                    currentT += adaptiveStepSize;
                } else {
                    // Empty space - take larger steps
                    currentT += stepSize * 2.0;
                }
            }
            
            // Debug: Visualize density sampling
            if (maxDensitySampled > 0.0) {
                // Add green tint where density was found
                accumulatedColor += vec3(0.0, maxDensitySampled * 0.5, 0.0);
            }
            
            // Composite volumetric over scene with HDR
            vec3 finalColor = sceneColor.rgb * transmittance + accumulatedColor;
            gl_FragColor = vec4(finalColor, 1.0);
        }
    `
};

let smokePass;
// --- END: Volumetric Smoke ---

// --- END: GPU Instanced Stars ---

function generateStarColorWithLuminosity(colorRange, luminosityRange) {
    const r = THREE.MathUtils.lerp(colorRange.min[0], colorRange.max[0], Math.random());
    const g = THREE.MathUtils.lerp(colorRange.min[1], colorRange.max[1], Math.random());
    const b = THREE.MathUtils.lerp(colorRange.min[2], colorRange.max[2], Math.random());
    return new THREE.Color(r, g, b);
}

function createCircularGradientTexture() {
    const canvas = document.createElement('canvas');
    const size = 128; // Texture size
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2;

    // Create radial gradient for star glow
    const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.1, 'rgba(255,255,220,0.8)');
    gradient.addColorStop(0.3, 'rgba(255,220,200,0.4)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    // Add softened cross lens flare streaks
    context.strokeStyle = 'rgba(255,255,255,0.2)';  // Reduced opacity
    context.lineWidth = radius * 0.02;               // Thinner streaks
    context.beginPath();
    // Horizontal streak
    context.moveTo(0, centerY);
    context.lineTo(size, centerY);
    // Vertical streak
    context.moveTo(centerX, 0);
    context.lineTo(centerX, size);
    context.stroke();

    // Angled streaks (optional, currently disabled)
    /*
    context.strokeStyle = 'rgba(255,255,255,0.1)';  // Even lower opacity
    context.lineWidth = radius * 0.015;
    context.beginPath();
    context.moveTo(centerX - radius, centerY - radius);
    context.lineTo(centerX + radius, centerY + radius);
    context.moveTo(centerX - radius, centerY + radius);
    context.lineTo(centerX + radius, centerY - radius);
    context.stroke();
    */

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

function setupInstancedStars() {
    const numStars = galaxyParams.numStars;
    const starGeo = new THREE.PlaneGeometry(1, 1); 

    const starMaterial = new THREE.ShaderMaterial({
        uniforms: {
            GM: { value: 4.3e-6 }, // Gravitational parameter for ~10^11 solar masses (kpc³ s⁻²)
            uTime: { value: 0.0 },
            timeScale: { value: galaxyParams.orbitalTimeScale }, // Time scaling factor from parameters
            starTexture: { value: createCircularGradientTexture() },
            coreRadiusUniform: { value: galaxyParams.coreRadius }
        },
        vertexShader: starVertexShader,
        fragmentShader: starFragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending, 
        depthWrite: false 
    });

    // Check for shader compilation errors
    starMaterial.needsUpdate = true;
    console.log('Star material created:', starMaterial);

    starField = new THREE.InstancedMesh(starGeo, starMaterial, numStars);

    // Generate stars using accurate galaxy structure
    const starData = generateAccurateGalaxyStars(numStars, galaxyParams, sharedGalaxyClusters || []);
    
    const initPositions = new Float32Array(numStars * 3);
    const instanceColors = new Float32Array(numStars * 3);
    const instanceSizes = new Float32Array(numStars * 1);
    const tempColor = new THREE.Color();

    for (let i = 0; i < numStars; i++) {
        const star = starData[i];
        const starType = starTypes[star.stellarType];
        
        // Store (r, theta, z) directly from accurate generation
        initPositions[i * 3] = star.r;
        initPositions[i * 3 + 1] = star.theta;
        initPositions[i * 3 + 2] = star.z;

        // Generate color based on stellar type
        const colorObj = generateStarColorWithLuminosity(starType.colorRange, starType.luminosityRange);
        tempColor.set(colorObj); 
        instanceColors[i * 3 + 0] = tempColor.r;
        instanceColors[i * 3 + 1] = tempColor.g;
        instanceColors[i * 3 + 2] = tempColor.b;

        // Generate size based on stellar type and luminosity
        const luminosity = THREE.MathUtils.lerp(starType.luminosityRange.min, starType.luminosityRange.max, Math.random());
        let sizeFactor = 0.3 + luminosity * 0.25; 
        if (starType.type === "Red Giant") sizeFactor *= 2.0;
        else if (starType.type === "White Dwarf") sizeFactor *= 0.3;
        else if (starType.type === "O-type" || starType.type === "B-type") sizeFactor *= 1.3;
        
        sizeFactor = Math.max(0.15, Math.min(sizeFactor, 3.0)); 
        instanceSizes[i] = galaxyParams.starSize * sizeFactor * 15;
    }

    starField.geometry.setAttribute('initPos', new THREE.InstancedBufferAttribute(initPositions, 3));
    starField.geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(instanceColors, 3));
    starField.geometry.setAttribute('instanceSize', new THREE.InstancedBufferAttribute(instanceSizes, 1));
    
    galaxyGroup.add(starField);
    console.log("Accurate galaxy structure stars setup complete.");
}

// Volumetric Raymarching Smoke Shaders
const smokeVertexShader = `
  uniform float uSize;
  uniform float time;
  uniform float rotationSpeed;
  
  attribute float aParticleSize;
  attribute float aParticleOpacity;
  attribute float angle;
  attribute float radius;
  
  varying vec3 vWorldPosition;
  varying float vParticleOpacity;
  varying vec3 vViewVector;
  varying vec3 vLocalPosition;

  void main() {
    // Apply rotation similar to galaxy rotation
    float wrappedTime = mod(time, 1000.0);
    float rotationAngle = angle + wrappedTime * rotationSpeed;
    
    // Create rotated position
    vec3 rotatedPosition = vec3(
      radius * cos(rotationAngle),
      radius * sin(rotationAngle),
      position.z
    );
    
    // Use the rotated position for calculations
    vec4 modelPosition = modelMatrix * vec4(rotatedPosition, 1.0);
    vWorldPosition = modelPosition.xyz;
    vParticleOpacity = aParticleOpacity;
    vLocalPosition = rotatedPosition;

    // View vector from camera to this vertex (used for raymarching direction)
    vViewVector = normalize(modelPosition.xyz - cameraPosition);

    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;

    gl_Position = projectedPosition;
    
    // Calculate point size with better scaling and minimum size
    float distance = length(viewPosition.xyz);
    float sizeScale = (uSize * aParticleSize) * (800.0 / max(distance, 1.0));
    gl_PointSize = max(2.0, min(sizeScale, 100.0)); // Clamp between 2 and 100 pixels
  }
`;

const smokeFragmentShader = `
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform float uTime;
  uniform float uNoiseIntensity;
  uniform vec3 uCentralLightPosition;
  uniform float uCentralLightIntensity;
  uniform vec3 uCameraPosition;
  uniform sampler2D uParticleTexture;
  uniform float uDensityFactor;
  uniform int uMarchSteps;
  uniform float uDiffuseStrength;
  uniform sampler2D uBlueNoiseTexture;

  varying vec3 vWorldPosition;
  varying float vParticleOpacity;
  varying vec3 vViewVector;
  varying vec3 vLocalPosition;
  
  // Simple diagnostic mode - set to true to bypass complex rendering
  #define DIAGNOSTIC_MODE true
  
  // Sphere signed distance function - returns negative inside, positive outside
  float sdfSphere(vec3 p, float radius) {
    return length(p) - radius;
  }
  
  // Density function that combines SDF and noise
  float densityFunction(vec3 p) {
    // Transform from world to local particle space
    vec3 localP = p - vWorldPosition;
    
    // Base sphere with radius 0.5
    float base = sdfSphere(localP, 0.5);
    
    // Sample blue noise texture for density, animate with uTime
    vec2 densityNoiseUV = mod(localP.xy * 3.0 + uTime * 0.02, 1.0);
    float noiseValue = texture2D(uBlueNoiseTexture, densityNoiseUV).r * uNoiseIntensity;
    
    // Higher density factor means thicker smoke
    float density = (-base + noiseValue * 0.3) * uDensityFactor;
    
    // Ensure minimum density for visibility
    return max(density, 0.1);
  }

  // Raymarching through the volume
  vec4 raymarch(vec3 rayOrigin, vec3 rayDirection) {
    float stepSize = 1.0 / float(uMarchSteps);
    vec3 lightDir = normalize(uCentralLightPosition - vWorldPosition);
    
    vec4 result = vec4(0.0);
    float t = -0.5; // Start inside the volume
    
    for (int i = 0; i < 32; i++) { // Hard-code max steps for compatibility
      if (i >= uMarchSteps) break;
      
      // Current position along ray
      vec3 pos = rayOrigin + rayDirection * t;
      
      // Sample density at this position
      float density = max(0.0, densityFunction(pos));
      
      if (density > 0.0) {
        // Distance to central light affects lighting
        float distToLight = length(uCentralLightPosition - pos);
        float lightAttenuation = 4.0 / (distToLight * distToLight + 1.0);
        
        // Calculate diffuse lighting
        float densityToLight = densityFunction(pos + lightDir * 0.2);
        float diffuse = clamp((density - densityToLight) / 0.2, 0.0, 1.0) * uDiffuseStrength;
        
        // Sample blue noise texture for color mixing
        vec2 colorMixNoiseUV = mod(pos.xy * 2.0 + uTime * 0.01 + vec2(0.3, 0.7), 1.0);
        float colorMix = texture2D(uBlueNoiseTexture, colorMixNoiseUV).r;
        vec3 color = mix(uColor1, uColor2, colorMix);
        
        // Apply lighting effects
        vec3 lit = color * (0.5 + diffuse * 0.5) * lightAttenuation * uCentralLightIntensity;
        
        // Accumulate color and opacity
        vec4 newSample = vec4(lit, density * 0.15);
        newSample.rgb *= newSample.a;
        result += newSample * (1.0 - result.a);
        
        // Early exit if nearly opaque
        if (result.a > 0.95) break;
      }
      
      // Advance along ray
      t += stepSize;
    }
    
    return result;
  }

  void main() {
    vec2 pointCoord = gl_PointCoord;
    float dist = length(pointCoord - vec2(0.5));
    
    // Discard pixels outside particle circle
    if (dist > 0.5) {
      discard;
    }
    
    #if DIAGNOSTIC_MODE
    // Simple diagnostic rendering - always visible particles
    vec3 simpleColor = mix(uColor1, uColor2, 0.5 + 0.5 * sin(uTime * 2.0));
    float alpha = (1.0 - dist * 2.0) * vParticleOpacity * 0.8;
    gl_FragColor = vec4(simpleColor, alpha);
    return;
    #endif

    // Sample particle texture for basic shape
    vec4 texColor = texture2D(uParticleTexture, pointCoord);
    if (texColor.a < 0.05) {
      // If texture is transparent, use debug color
      vec4 debugColor = vec4(1.0, 0.5, 0.0, 0.3);
      gl_FragColor = debugColor;
      return;
    }
    
    // Ray starting at particle center facing towards camera
    vec3 rayOrigin = vWorldPosition;
    vec3 rayDirection = normalize(vWorldPosition - uCameraPosition);
    
    // Perform raymarching within the particle
    vec4 volumetricResult = raymarch(rayOrigin, rayDirection);
    
    // If volumetric result is too dim, boost it or use fallback
    if (volumetricResult.a < 0.01) {
      // Fallback: simple particle with color based on position
      vec3 fallbackColor = mix(uColor1, uColor2, 0.5);
      volumetricResult = vec4(fallbackColor * 0.8, 0.4);
    }
    
    // Combine with particle texture for smooth edges
    volumetricResult.a *= texColor.a * vParticleOpacity;
    
    gl_FragColor = volumetricResult;
  }
`;

// Implement dust/volumetric smoke system
let smokePoints, smokeData;
function generateVolumetricSmoke() {
  // Remove existing smoke if any
  if (smokePoints) {
    galaxyGroup.remove(smokePoints);
    smokePoints.geometry.dispose();
    smokePoints.material.dispose();
    smokePoints = null;
  }
  
  const count = galaxyParams.numSmokeParticles;
  const positions = [];
  const colors = [];
  const sizes = [];
  const opacities = [];
  const angles = [];
  const radii = [];
  
  smokeData = [];
  
  // Generate particles along logarithmic spirals
  for (let i = 0; i < count; i++) {
    const arm = Math.floor(Math.random() * galaxyParams.spiralArms);
    // Random radius between baseRadius and galacticRadius
    let r = THREE.MathUtils.randFloat(galaxyParams.baseRadius, galaxyParams.galacticRadius);
    // Compute theta along arm: theta = ln(r/baseRadius)/tan(pitch) + arm offset
    const pitch = THREE.MathUtils.degToRad(galaxyParams.spiralPitchAngle);
    let theta0 = Math.log(r / galaxyParams.baseRadius) / Math.tan(pitch) + (arm * (2 * Math.PI / galaxyParams.spiralArms));
    // Add noise radial offset
    r += (Math.random() - 0.5) * galaxyParams.smokeNoiseIntensity;
    // Random small z offset
    const z = (Math.random() - 0.5) * galaxyParams.verticalScaleHeight;
    
    // Store initial position
    positions.push(r * Math.cos(theta0), r * Math.sin(theta0), z);
    angles.push(theta0);
    radii.push(r);
    smokeData.push({ r, theta0, z });
    
    // Colors based on dust parameters
    const t = Math.random();
    const smokeColor1 = new THREE.Color(0x101025).multiplyScalar(1.5);
    const smokeColor2 = new THREE.Color(0x251510).multiplyScalar(1.5);
    const color = new THREE.Color().lerpColors(smokeColor1, smokeColor2, t);
    colors.push(color.r, color.g, color.b);
    
    // Size and opacity variation
    sizes.push(galaxyParams.smokeParticleSize * (0.5 + Math.random() * 1.0));
    opacities.push(0.15 + Math.random() * 0.25);
  }
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  geometry.setAttribute('aParticleSize', new THREE.BufferAttribute(new Float32Array(sizes), 1));
  geometry.setAttribute('aParticleOpacity', new THREE.BufferAttribute(new Float32Array(opacities), 1));
  geometry.setAttribute('angle', new THREE.BufferAttribute(new Float32Array(angles), 1));
  geometry.setAttribute('radius', new THREE.BufferAttribute(new Float32Array(radii), 1));
  
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: globalTime },
      uColor1: { value: new THREE.Color(0x101025).multiplyScalar(1.5) },
      uColor2: { value: new THREE.Color(0x251510).multiplyScalar(1.5) },
      uSize: { value: galaxyParams.smokeParticleSize },
      uNoiseIntensity: { value: galaxyParams.smokeNoiseIntensity },
      uCentralLightPosition: { value: new THREE.Vector3(0, 0, 0) },
      uCentralLightIntensity: { value: 1.0 },
      uCameraPosition: { value: camera.position },
      uParticleTexture: { value: createCircularGradientTexture() },
      uBlueNoiseTexture: { value: blueNoiseTexture },
      uDensityFactor: { value: 15.0 }, // Increased for better visibility
      uMarchSteps: { value: 6 },
      uDiffuseStrength: { value: 9.0 },
      time: { value: globalTime },
      rotationSpeed: { value: 5e-4 }
    },
    vertexShader: smokeVertexShader,
    fragmentShader: smokeFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending, // Changed to additive for better visibility
    depthWrite: false,
    depthTest: true, // Enable depth testing to ensure proper rendering order
    side: THREE.DoubleSide
  });
  
  smokePoints = new THREE.Points(geometry, material);
  galaxyGroup.add(smokePoints);
  
  console.log("✓ Volumetric smoke generated:");
  console.log("  Particle count:", count);
  console.log("  Geometry:", geometry);
  console.log("  Material uniforms:", material.uniforms);
  console.log("  Added to galaxyGroup:", galaxyGroup.children.length, "children");
  console.log("  Smoke particle size:", material.uniforms.uSize.value);
  console.log("  Density factor:", material.uniforms.uDensityFactor.value);
}

// Debug: Log orbital periods for different radii to verify Keplerian motion
console.log("Orbital Motion Debug:");
const GM = 4.3e-6;
for (let r = 0.5; r <= 4.0; r += 0.5) {
    const omega = Math.sqrt(GM / Math.pow(r, 3.0));
    const period = 2.0 * Math.PI / omega;
    console.log(`r=${r.toFixed(1)} kpc: ω=${omega.toFixed(4)} rad/s, period=${period.toFixed(2)} s`);
}

// Generate cluster centers before density texture setup
sharedGalaxyClusters = generateClusterCenters(20, galaxyParams.galacticRadius * 0.8, galaxyParams.spiralArms, galaxyParams.baseRadius, galaxyParams.spiralPitchAngle);

// Call the setup functions
setupInstancedStars();
generateVolumetricSmoke();

// Hoist composer declaration before setup to avoid TDZ error
var composer;

setupDensityTexture(); // Initialize density texture and worker
// setupPostProcessing(); // Setup post-processing after density texture initialization - moved to worker callback


// --- fractalNoise, snoiseJS, fbmJS, clustering, smoke shaders etc. below ---

function fractalNoise(vec, octaves, persistence, lacunarity) {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;
    for (let i = 0; i < octaves; i++) {
        total += generatePerlinNoise(vec.x * frequency, vec.y * frequency) * amplitude;
        maxValue += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
    }
    return total / maxValue;
}

function generatePerlinNoise(x, y) {
    function fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    function lerp(a, b, t) {
        return a + t * (b - a);
    }

    function grad(hash, x, y) {
        const h = hash & 3;
        const u = h < 2 ? x : y;
        const v = h < 2 ? y : x;
        return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
    }

    const p = [151, 160, 137, 91, 90, 15, 151]; // Simplified permutation table for brevity

    return (function(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        const u = fade(x);
        const v = fade(y);
        const aa = p[p[X] + Y + 1]; // Adjusted indexing for simplified p
        const ab = p[p[X + 1] + Y];
        const bb = p[p[X + 1] + Y + 1];

        return (lerp(
            lerp(grad(p[p[X] + Y], x, y), grad(ab, x - 1, y), u),
            lerp(grad(aa, x, y - 1), grad(bb, x - 1, y - 1), u),
            v
        ) + 1) / 2;
    })(x * 0.1, y * 0.1);
}

// --- START: 3D Simplex Noise and FBM Port from Shader to JavaScript ---

// Helper to mimic GLSL mod(x,y) for THREE.Vector objects
function vecMod(v, m) {
    if (v instanceof THREE.Vector2 && m instanceof THREE.Vector2) return new THREE.Vector2(v.x % m.x, v.y % m.y); // Basic JS modulo, GLSL mod is different for negative
    if (v instanceof THREE.Vector3 && m instanceof THREE.Vector3) return new THREE.Vector3(v.x % m.x, v.y % m.y, v.z % m.z);
    if (v instanceof THREE.Vector4 && m instanceof THREE.Vector4) return new THREE.Vector4(v.x % m.x, v.y % m.y, v.z % m.z, v.w % m.w);
    // For GLSL-like mod: x - y * floor(x/y)
    if (v instanceof THREE.Vector3 && typeof m === 'number') { // mod(vec3, float)
      return new THREE.Vector3(
        v.x - m * Math.floor(v.x/m),
        v.y - m * Math.floor(v.y/m),
        v.z - m * Math.floor(v.z/m)
      );
    }
     if (v instanceof THREE.Vector4 && typeof m === 'number') { // mod(vec4, float)
      return new THREE.Vector4(
        v.x - m * Math.floor(v.x/m),
        v.y - m * Math.floor(v.y/m),
        v.z - m * Math.floor(v.z/m),
        v.w - m * Math.floor(v.w/m)
      );
    }
    return v % m; // Fallback for scalar
}


function mod289_v3(x) { // x is THREE.Vector3
    return x.clone().sub(new THREE.Vector3().setScalar(289.0).multiply(new THREE.Vector3(Math.floor(x.x / 289.0), Math.floor(x.y / 289.0), Math.floor(x.z / 289.0))));
}

function mod289_v4(x) { // x is THREE.Vector4
    return x.clone().sub(new THREE.Vector4().setScalar(289.0).multiply(new THREE.Vector4(Math.floor(x.x / 289.0), Math.floor(x.y / 289.0), Math.floor(x.z / 289.0), Math.floor(x.w / 289.0))));
}

function permute_v4(x_in) { // x_in is THREE.Vector4
    let x = x_in.clone();
    let term1 = x.multiplyScalar(34.0);
    let term2 = term1.addScalar(1.0);
    let result = mod289_v4(term2.multiply(x)); // component-wise multiply
    return result;
}

function taylorInvSqrt_v4(r) { // r is THREE.Vector4
    return new THREE.Vector4(
        1.79284291400159 - 0.85373472095314 * r.x,
        1.79284291400159 - 0.85373472095314 * r.y,
        1.79284291400159 - 0.85373472095314 * r.z,
        1.79284291400159 - 0.85373472095314 * r.w
    );
}

function snoiseJS(v_in) { // v_in is THREE.Vector3
    let v = v_in.clone();
    const C = new THREE.Vector2(1.0/6.0, 1.0/3.0);
    const D = new THREE.Vector4(0.0, 0.5, 1.0, 2.0);

    let i = new THREE.Vector3(
        Math.floor(v.x + (v.x + v.y + v.z) * C.y),
        Math.floor(v.y + (v.x + v.y + v.z) * C.y),
        Math.floor(v.z + (v.x + v.y + v.z) * C.y)
    );
    let x0 = v.clone().sub(i).add(new THREE.Vector3().setScalar((i.x + i.y + i.z) * C.x));
    
    let g = new THREE.Vector3(
        x0.x >= x0.y ? 1.0 : 0.0,
        x0.y >= x0.z ? 1.0 : 0.0,
        x0.z >= x0.x ? 1.0 : 0.0
    );
    let l = new THREE.Vector3(1.0 - g.x, 1.0 - g.y, 1.0 - g.z); // 1.0 - g
    let i1 = new THREE.Vector3(Math.min(g.x, l.z), Math.min(g.y, l.x), Math.min(g.z, l.y)); // min(g.xyz, l.zxy);
    let i2 = new THREE.Vector3(Math.max(g.x, l.z), Math.max(g.y, l.x), Math.max(g.z, l.y)); // max(g.xyz, l.zxy);

    let x1 = x0.clone().sub(i1).add(new THREE.Vector3().setScalar(C.x));
    let x2 = x0.clone().sub(i2).add(new THREE.Vector3().setScalar(C.y)); // C.yyy in GLSL means C.y for all components
    let x3 = x0.clone().subScalar(D.y); // D.yyy is (0.5,0.5,0.5)

    i = mod289_v3(i);
    
    let p = permute_v4(
        permute_v4(
            permute_v4(
                new THREE.Vector4(i.z + 0.0, i.z + i1.z, i.z + i2.z, i.z + 1.0)
            ).add(new THREE.Vector4(i.y + 0.0, i.y + i1.y, i.y + i2.y, i.y + 1.0))
        ).add(new THREE.Vector4(i.x + 0.0, i.x + i1.x, i.x + i2.x, i.x + 1.0))
    );

    const n_ = 0.142857142857; // 1.0/7.0
    let ns = new THREE.Vector3(D.w, D.y, D.z).multiplyScalar(n_).sub(new THREE.Vector3(D.x, D.z, D.x));

    let j = p.clone().sub(mod289_v4(new THREE.Vector4().setScalar(49.0)).multiply( // This was likely floor(p * ns.z * ns.z), not mod289
         new THREE.Vector4(
            Math.floor(p.x * ns.z * ns.z), Math.floor(p.y * ns.z * ns.z),
            Math.floor(p.z * ns.z * ns.z), Math.floor(p.w * ns.z * ns.z)
        )
    ));


    let x_ = new THREE.Vector4(Math.floor(j.x * ns.z), Math.floor(j.y * ns.z), Math.floor(j.z * ns.z), Math.floor(j.w * ns.z));
    let y_ = new THREE.Vector4(
        Math.floor(j.x - 7.0 * x_.x), Math.floor(j.y - 7.0 * x_.y),
        Math.floor(j.z - 7.0 * x_.z), Math.floor(j.w - 7.0 * x_.w)
    );

    let x = x_.multiplyScalar(ns.x).addScalar(ns.y);
    let y = y_.multiplyScalar(ns.x).addScalar(ns.y);

    let h = new THREE.Vector4(1.0 - Math.abs(x.x) - Math.abs(y.x), 1.0 - Math.abs(x.y) - Math.abs(y.y), 1.0 - Math.abs(x.z) - Math.abs(y.z), 1.0 - Math.abs(x.w) - Math.abs(y.w));
    
    let b0 = new THREE.Vector4(x.x, x.y, y.x, y.y);
    let b1 = new THREE.Vector4(x.z, x.w, y.z, y.w);

    let s0 = new THREE.Vector4(Math.floor(b0.x)*2.0 + 1.0, Math.floor(b0.y)*2.0 + 1.0, Math.floor(b0.z)*2.0 + 1.0, Math.floor(b0.w)*2.0 + 1.0);
    let s1 = new THREE.Vector4(Math.floor(b1.x)*2.0 + 1.0, Math.floor(b1.y)*2.0 + 1.0, Math.floor(b1.z)*2.0 + 1.0, Math.floor(b1.w)*2.0 + 1.0);
    
    let sh = new THREE.Vector4(
        h.x >= 0.0 ? -1.0 : 0.0, h.y >= 0.0 ? -1.0 : 0.0,
        h.z >= 0.0 ? -1.0 : 0.0, h.w >= 0.0 ? -1.0 : 0.0
    );

    let a0 = new THREE.Vector4(b0.x, b0.z, b0.y, b0.w).add(new THREE.Vector4(s0.x, s0.z, s0.y, s0.w).multiply(new THREE.Vector4(sh.x, sh.x, sh.y, sh.y)));
    let a1 = new THREE.Vector4(b1.x, b1.z, b1.y, b1.w).add(new THREE.Vector4(s1.x, s1.z, s1.y, s1.w).multiply(new THREE.Vector4(sh.z, sh.z, sh.w, sh.w)));

    let p0 = new THREE.Vector3(a0.x, a0.y, h.x);
    let p1 = new THREE.Vector3(a0.z, a0.w, h.y);
    let p2 = new THREE.Vector3(a1.x, a1.y, h.z);
    let p3 = new THREE.Vector3(a1.z, a1.w, h.w);

    let norm = taylorInvSqrt_v4(new THREE.Vector4(p0.dot(p0), p1.dot(p1), p2.dot(p2), p3.dot(p3)));
    p0.multiplyScalar(norm.x);
    p1.multiplyScalar(norm.y);
    p2.multiplyScalar(norm.z);
    p3.multiplyScalar(norm.w);

    let mVal = new THREE.Vector4(
        Math.max(0.6 - x0.dot(x0), 0.0), Math.max(0.6 - x1.dot(x1), 0.0),
        Math.max(0.6 - x2.dot(x2), 0.0), Math.max(0.6 - x3.dot(x3), 0.0)
    );
    mVal = mVal.multiply(mVal);
    mVal = mVal.multiply(mVal);

    return 42.0 * (mVal.x * p0.dot(x0) + mVal.y * p1.dot(x1) + mVal.z * p2.dot(x2) + mVal.w * p3.dot(x3));
}

function fbmJS(p_vec3, octaves = 6) {
    let p = p_vec3.clone();
    let value = 0.0;
    let amplitude = 0.5;
    for (let i = 0; i < octaves; i++) {
        value += amplitude * snoiseJS(p);
        p.multiplyScalar(2.0);
        amplitude *= 0.5;
    }
    return value;
}

function fractalNoise3D(vec, octaves = 4, scale = 0.1) {
    let scaledVec = vec.clone().multiplyScalar(scale);
    let noiseVal = fbmJS(scaledVec, octaves);
    return (noiseVal + 1.0) * 0.5; // Remap from approx [-1, 1] to [0, 1]
}

// --- NEW: Accurate Galaxy Structure Functions ---

// Exponential disc surface density: Σ(r) = Σ₀ · e^(-r/h_r)
function exponentialDiscDensity(r, scaleLength) {
    return Math.exp(-r / scaleLength);
}

// Sersic profile for bulge (n ≈ 2)
function sersicProfile(r, effectiveRadius, sersicIndex = 2.0) {
    const bn = 2.0 * sersicIndex - 1.0/3.0; // Approximation for n=2
    const x = r / effectiveRadius;
    return Math.exp(-bn * (Math.pow(x, 1.0/sersicIndex) - 1.0));
}

// Vertical density profile: ρ(z) = ρ₀ · e^(-|z|/h_z)
function verticalDensity(z, scaleHeight) {
    return Math.exp(-Math.abs(z) / scaleHeight);
}

// Logarithmic spiral arms: r = a · e^(b·θ) with pitch angle
function spiralArmRadius(theta, armIndex, pitchAngleDeg, numArms, baseRadius = 0.5) {
    const pitchAngleRad = (pitchAngleDeg * Math.PI) / 180.0;
    const b = Math.tan(pitchAngleRad);
    const armOffset = (armIndex * 2.0 * Math.PI) / numArms;
    const adjustedTheta = theta - armOffset;
    return baseRadius * Math.exp(b * adjustedTheta);
}

// Combined surface density including spiral arms
function galaxySurfaceDensity(r, theta, params) {
    const discDensity = exponentialDiscDensity(r, params.discScaleLength * params.galacticRadius);
    
    // Bulge contribution (Sersic profile)
    const bulgeDensity = r < (params.bulgeRadius * params.galacticRadius) ? 
        sersicProfile(r, params.bulgeRadius * params.galacticRadius * 0.5) : 0.0;
    
    // Spiral arm enhancement
    let spiralEnhancement = 1.0;
    const armWidth = 0.3; // Arm width parameter
    
    for (let arm = 0; arm < params.spiralArms; arm++) {
        const expectedR = spiralArmRadius(theta, arm, params.spiralPitchAngle, params.spiralArms);
        const armDistance = Math.abs(r - expectedR);
        const armFactor = Math.exp(-Math.pow(armDistance / armWidth, 2.0));
        spiralEnhancement += 2.0 * armFactor; // Arms are 3x denser
    }
    
    return (discDensity + 3.0 * bulgeDensity) * spiralEnhancement;
}

// Generate star positions using accurate galaxy structure
function generateAccurateGalaxyStars(numStars, params, clusters) {
    const stars = [];
    const clusterSnapCount = Math.floor(numStars * params.clusterInfluence);
    
    // Pre-compute cumulative distribution for radius sampling
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
        
        // Weight by circumference (2πr) for proper sampling
        const weightedDensity = avgDensity * r;
        totalDensity += weightedDensity;
        cumulativeProb[i] = totalDensity;
    }
    
    // Normalize cumulative probability
    for (let i = 0; i < radiusSamples; i++) {
        cumulativeProb[i] /= totalDensity;
    }
    
    console.log("Generating", numStars, "stars with accurate galaxy structure...");
    
    for (let i = 0; i < numStars; i++) {
        let r, theta, z;
        let stellarType;
        
        // Determine if this star snaps to a cluster
        const snapToCluster = (i < clusterSnapCount) && clusters.length > 0;
        
        if (snapToCluster) {
            // Snap to nearest cluster with Gaussian jitter
            const cluster = clusters[Math.floor(Math.random() * clusters.length)];
            const jitterScale = cluster.radius * 0.3;
            
            r = Math.sqrt(cluster.center.x * cluster.center.x + cluster.center.y * cluster.center.y);
            r += (Math.random() - 0.5) * jitterScale;
            r = Math.max(0.1, Math.min(r, params.galacticRadius));
            
            theta = Math.atan2(cluster.center.y, cluster.center.x);
            theta += (Math.random() - 0.5) * 0.5; // Angular jitter
            
            z = cluster.center.z + (Math.random() - 0.5) * jitterScale * 0.5;
        } else {
            // Sample radius using inverse transform sampling
            const u = Math.random();
            let radiusIndex = 0;
            for (let j = 0; j < radiusSamples - 1; j++) {
                if (cumulativeProb[j] <= u && u < cumulativeProb[j + 1]) {
                    radiusIndex = j;
                    break;
                }
            }
            r = (radiusIndex / radiusSamples) * params.galacticRadius;
            
            // Sample theta uniformly but with spiral arm bias
            theta = Math.random() * 2.0 * Math.PI;
            
            // Add spiral arm bias to theta
            const spiralBias = 0.3;
            for (let arm = 0; arm < params.spiralArms; arm++) {
                const expectedR = spiralArmRadius(theta, arm, params.spiralPitchAngle, params.spiralArms);
                if (Math.abs(r - expectedR) < 0.5) {
                    // Adjust theta slightly toward spiral arm
                    const armTheta = Math.log(r / 0.5) / Math.tan((params.spiralPitchAngle * Math.PI) / 180.0);
                    const armOffset = (arm * 2.0 * Math.PI) / params.spiralArms;
                    const targetTheta = armTheta + armOffset;
                    theta = theta * (1.0 - spiralBias) + targetTheta * spiralBias;
                    break;
                }
            }
            
            // Sample z using exponential vertical profile
            const scaleHeight = params.verticalScaleHeight * params.galacticRadius;
            // Use Box-Muller transform for Gaussian, then scale by exponential
            const u1 = Math.random();
            const u2 = Math.random();
            const gaussian = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
            z = gaussian * scaleHeight * 0.5; // Scale factor for thickness
        }
        
        // Select stellar type based on galactic position
        stellarType = selectStellarType(r, params);
        
        stars.push({
            r: r,
            theta: theta,
            z: z,
            stellarType: stellarType
        });
    }
    
    return stars;
}

// Select stellar type based on galactic position (metallicity gradient, etc.)
function selectStellarType(r, params) {
    const normalizedRadius = r / params.galacticRadius;
    
    // Inner galaxy: more metal-rich, younger stars (O, B, A types)
    // Outer galaxy: more metal-poor, older stars (K, M types)
    let typeWeights;
    
    if (normalizedRadius < 0.3) {
        // Inner galaxy - young stellar population
        typeWeights = [0.02, 0.08, 0.15, 0.20, 0.25, 0.15, 0.10, 0.03, 0.01, 0.01]; // Favor hot stars
    } else if (normalizedRadius < 0.7) {
        // Middle galaxy - mixed population  
        typeWeights = [0.01, 0.05, 0.10, 0.15, 0.25, 0.20, 0.15, 0.05, 0.03, 0.01];
    } else {
        // Outer galaxy - old stellar population
        typeWeights = [0.005, 0.02, 0.05, 0.10, 0.20, 0.25, 0.25, 0.08, 0.05, 0.02]; // Favor cool stars
    }
    
    const random = Math.random();
    let cumulative = 0;
    for (let i = 0; i < typeWeights.length; i++) {
        cumulative += typeWeights[i];
        if (random < cumulative) {
            return i;
        }
    }
    return typeWeights.length - 1; // Fallback
}

// --- END: Accurate Galaxy Structure Functions ---
function generateClusterCenters(numClusters, galacticRadius, spiralArms, baseRadius = 0.5, spiralPitchAngleDeg = 13.0) {
    const clusters = [];
    const pitchRad = (spiralPitchAngleDeg * Math.PI) / 180.0;
    const b = Math.tan(pitchRad); // ln-spiral coefficient

    // Generate spiral arm clusters
    const clustersPerArm = Math.floor(numClusters * 0.7 / Math.max(1, spiralArms));
    for (let arm = 0; arm < spiralArms; arm++) {
        const armBaseAngle = (arm / spiralArms) * 2 * Math.PI;
        
        for (let i = 0; i < clustersPerArm; i++) {
            // Distribute clusters along the arm; ensure radius is within bounds
            const progressAlongArm = (i + 0.5) / clustersPerArm; // 0 to 1
            let radius = baseRadius + progressAlongArm * (galacticRadius * 0.8 - baseRadius); // Spread from baseRadius outwards
            radius = Math.max(baseRadius * 0.5, Math.min(radius, galacticRadius * 0.9));

            // Stronger arm-following, deterministic theta based on radius
            let angleOnArm = armBaseAngle;
            if (b !== 0 && radius > 0 && baseRadius > 0) { // Avoid Math.log(0) or division by zero
                 angleOnArm = Math.log(radius / baseRadius) / b + armBaseAngle;
            }

            const x = radius * Math.cos(angleOnArm);
            const y = radius * Math.sin(angleOnArm);
            
            // Vertical position with some randomness, scaled by distance from center
            const z_scale = (1.0 - radius / galacticRadius) * 0.4 + 0.05; // Thicker towards center
            const z = (Math.random() - 0.5) * galacticRadius * z_scale;
            
            const jitterScale = (0.5 + Math.random() * 0.8) * 0.15; // Smaller jitter

            clusters.push({
                center: new THREE.Vector3(
                    x + (Math.random() - 0.5) * jitterScale * radius, // Jitter relative to radius
                    y + (Math.random() - 0.5) * jitterScale * radius,
                    z + (Math.random() - 0.5) * jitterScale * galacticRadius * 0.1
                ),
                radius: (0.2 + Math.random() * 0.3) * (galacticRadius / 10), // Smaller cluster radius
                density: 0.3 + Math.random() * 0.4, // Density can be used by worker
                armIndex: arm 
            });
        }
    }
    
    // Generate halo/disc clusters with enhanced central concentration
    const haloCount = numClusters - clusters.length;
    for (let i = 0; i < haloCount; i++) {
        const angle = Math.random() * 2 * Math.PI;
        // Enhanced central concentration using exponential distribution
        const radius = Math.pow(Math.random(), 1.8) * galacticRadius;
        const x = radius * Math.cos(angle);
        const y = radius * Math.sin(angle);
        
        // Much thicker at center, exponentially thinner towards edges
        const normalizedRadius = radius / galacticRadius;
        const verticalScale = Math.exp(-normalizedRadius * 3.0) * 2.0 + 0.1;
        const z = (Math.random() - 0.5) * verticalScale;
        
        clusters.push({
            center: new THREE.Vector3(x, y, z),
            radius: 0.5 + Math.random() * 0.8,
            density: 0.2 + Math.random() * 0.3,
            armIndex: -1 // Not part of spiral arms
        });
    }
    
    return clusters;
}

function getClusterInfluence(position, clusters) {
    let totalInfluence = 0;
    let spiralArmBonus = 0;
    
    // Use the passed 'clusters' argument, not 'sharedGalaxyClusters'
    clusters.forEach(cluster => {
        const distance = position.distanceTo(cluster.center);
        const influence = cluster.density * Math.exp(-distance / cluster.radius);
        totalInfluence += influence;
        
        // Bonus for spiral arm clusters
        if (cluster.armIndex >= 0) {
            spiralArmBonus += influence * 0.3;
        }
    });
    
    return totalInfluence + spiralArmBonus;
}

// --- END: Advanced Clustering Functions ---

// --- NEW: Volumetric Raymarching Inspired Smoke Shader ---

function setupPostProcessing() {
    console.log("Setting up post-processing...");
    
    // Initialize composer with HDR render target
    const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
        magFilter: THREE.LinearFilter,
        minFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping
    });
    
    composer = new EffectComposer(renderer, renderTarget);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    
    console.log("Created composer and render pass");

    // Volumetric Smoke Pass
    if (densityTexture) {
        console.log("Density texture available, setting up volumetric pass");
        console.log("Density texture details:", {
            size: DENSITY_TEXTURE_SIZE,
            format: densityTexture.format,
            type: densityTexture.type,
            needsUpdate: densityTexture.needsUpdate
        });
        
        volumetricSmokeShader.uniforms.tDensity.value = densityTexture;
        volumetricSmokeShader.uniforms.cameraPos.value = camera.position;
        volumetricSmokeShader.uniforms.screenResolution.value = new THREE.Vector2(window.innerWidth, window.innerHeight);
        volumetricSmokeShader.uniforms.noiseTexture.value = blueNoiseTexture;
        
        console.log("Setting up volumetric shader with density texture:", densityTexture);
        
        const imgWidth = blueNoiseTexture.image && blueNoiseTexture.image.width ? blueNoiseTexture.image.width : 1;
        const imgHeight = blueNoiseTexture.image && blueNoiseTexture.image.height ? blueNoiseTexture.image.height : 1;
        volumetricSmokeShader.uniforms.noiseScale.value = new THREE.Vector2(
            window.innerWidth / imgWidth,
            window.innerHeight / imgHeight
        );
        
        volumetricSmokeShader.uniforms.boxMin.value = new THREE.Vector3(-galaxyParams.galacticRadius, -galaxyParams.galacticRadius, -galaxyParams.galacticRadius * 0.5);
        volumetricSmokeShader.uniforms.boxMax.value = new THREE.Vector3(galaxyParams.galacticRadius, galaxyParams.galacticRadius, galaxyParams.galacticRadius * 0.5);

        smokePass = new ShaderPass(volumetricSmokeShader);
        smokePass.renderToScreen = true; // Final pass renders to screen with ACES tonemapping
        composer.addPass(smokePass);
        
        console.log("✓ Volumetric pass added to composer");
        console.log("  Box bounds:", volumetricSmokeShader.uniforms.boxMin.value, "to", volumetricSmokeShader.uniforms.boxMax.value);
    } else {
        console.warn("Density texture not ready for post-processing pass setup.");
        // Create a fallback pass if texture isn't ready
        const copyPass = new ShaderPass(CopyShader);
        copyPass.renderToScreen = true;
        composer.addPass(copyPass);
    }
}

// NEW: VolumePass for full-screen raymarch
const VolumePass = {
    uniforms: {
        tScene:   { value: null },        // Scene color buffer
        tDensity: { value: null },        // 3D density texture
        cameraMat:{ value: new THREE.Matrix4() },
        invProj:  { value: new THREE.Matrix4() },
        sunPos:   { value: new THREE.Vector3() },
        g:        { value: galaxyParams.anisotropyG },    // Henyey–Greenstein g
        sigmaS:   { value: galaxyParams.smokeDiffuseStrength },
        sigmaA:   { value: galaxyParams.smokeDensityFactor },
        stepSz:   { value: 1.0 / 64.0 },   // Default step size
        maxSteps: { value: galaxyParams.smokeMarchSteps }
    },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.0,1.0);}`,
    fragmentShader: volumetricSmokeShader.fragmentShader // reuse our existing raymarch code
};

// --- NEW: Volumetric Raymarching Inspired Smoke Shader ---

function animate() {
    requestAnimationFrame(animate);

    const currentTime = performance.now();
    const deltaTime = (currentTime - lastFrameTime) / 1000; // Convert to seconds
    lastFrameTime = currentTime;
    globalTime += deltaTime;

    controls.update();

    // Update camera matrices for volumetric rendering
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    // Update shader uniforms that change each frame
    if (starField) {
        starField.material.uniforms.uTime.value = globalTime;
    }

    if (smokePass) {
        smokePass.uniforms.u_time.value = globalTime;
        smokePass.uniforms.cameraPos.value.copy(camera.position);
        smokePass.uniforms.invProjectionMatrix.value.copy(camera.projectionMatrixInverse);
        smokePass.uniforms.invModelViewMatrix.value.copy(camera.matrixWorld); // camera.matrixWorld is already the inverse of view matrix
        
        // Debug: Check if density texture is bound and log important values occasionally
        if (Math.floor(globalTime * 60) % 120 === 0) { // Every 2 seconds
            if (smokePass.uniforms.tDensity && smokePass.uniforms.tDensity.value) {
                console.log("✓ Density texture bound to shader");
                console.log("  Density factor:", smokePass.uniforms.densityFactor.value);
                console.log("  Ray march steps:", smokePass.uniforms.steps.value);
                console.log("  Box bounds:", smokePass.uniforms.boxMin.value, "to", smokePass.uniforms.boxMax.value);
                console.log("  Camera position:", camera.position);
                
                // Check if camera is inside or outside the galaxy volume
                const boxMin = smokePass.uniforms.boxMin.value;
                const boxMax = smokePass.uniforms.boxMax.value;
                const isInsideBox = (
                    camera.position.x >= boxMin.x && camera.position.x <= boxMax.x &&
                    camera.position.y >= boxMin.y && camera.position.y <= boxMax.y &&
                    camera.position.z >= boxMin.z && camera.position.z <= boxMax.z
                );
                console.log("  Camera inside volume:", isInsideBox);
            } else {
                console.log("❌ Density texture NOT bound to shader!");
            }
        }
    }

    // Update smoke particle positions rotating like stars
    if (smokePoints && smokeData) {
      const posAttr = smokePoints.geometry.attributes.position;
      for (let i = 0; i < smokeData.length; i++) {
        const data = smokeData[i];
        // simple rotation: theta0 minus angularVel*timeScale
        const omega = Math.sqrt(4.3e-6 / Math.pow(data.r, 3));
        const theta = data.theta0 - omega * globalTime * galaxyParams.orbitalTimeScale * 0.5;
        const x = data.r * Math.cos(theta);
        const y = data.r * Math.sin(theta);
        posAttr.setXYZ(i, x, y, data.z);
      }
      posAttr.needsUpdate = true;
    }

    // Update volumetric smoke shader uniforms
    if (smokePoints && smokePoints.material) {
        smokePoints.material.uniforms.uTime.value = globalTime;
        smokePoints.material.uniforms.uCameraPosition.value.copy(camera.position);
        
        // Debug: Log smoke particle info occasionally
        if (Math.floor(globalTime * 60) % 300 === 0) { // Every 5 seconds
            console.log("🔥 Smoke particles debug:");
            console.log("  Visible:", smokePoints.visible);
            console.log("  Count:", smokePoints.geometry.attributes.position.count);
            console.log("  Material:", smokePoints.material.type);
            console.log("  Size uniform:", smokePoints.material.uniforms.uSize.value);
            console.log("  Density factor:", smokePoints.material.uniforms.uDensityFactor.value);
            console.log("  In galaxyGroup:", galaxyGroup.children.includes(smokePoints));
        }
    }

    // Update camera info display
    const cameraInfo = document.getElementById('camera-info');
    if (cameraInfo) {
        cameraInfo.innerHTML =
            `Camera: x: ${camera.position.x.toFixed(2)}, y: ${camera.position.y.toFixed(2)}, z: ${camera.position.z.toFixed(2)}<br>` +
            `Rotation: x: ${THREE.MathUtils.radToDeg(camera.rotation.x).toFixed(1)}, y: ${THREE.MathUtils.radToDeg(camera.rotation.y).toFixed(1)}, z: ${THREE.MathUtils.radToDeg(camera.rotation.z).toFixed(1)}`;
    }

    // renderer.render(scene, camera); // Replace with composer.render()
    if (composer) {
      composer.render();
    } else {
      renderer.render(scene, camera); // Fallback if composer not ready
      console.log("Using fallback renderer - composer not ready yet");
    }
}

// Extend parameter change handler for smoke
 window.handleParamChange = function(key, val) {
   // galaxyParams[key] is already updated by the UI script in index.html

    const densityRegenKeys = [
        'galacticRadius', 'verticalScaleHeight', 'discScaleLength', 
        'spiralArms', 'spiralPitchAngle', 'baseRadius', 'armWidth', 
        'armDensityMultiplier', 'clusterInfluence' // clusterInfluence affects star distribution which might be tied to nebula
    ];
    const starRegenKeys = [
        'numStars', 'starSize', 'coreRadius', 'galacticRadius', 'spiralArms',
        'discScaleLength', 'bulgeRadius', 'verticalScaleHeight', 'spiralPitchAngle',
        'clusterInfluence', 'baseRadius'
    ];
    // Smoke regen keys
    const smokeRegen = ['numSmokeParticles'];
    // Regenerate smoke when spiral structure parameters change
    const smokeStructKeys = ['galacticRadius','spiralArms','baseRadius','spiralPitchAngle','verticalScaleHeight'];
    if (smokeStructKeys.includes(key)) {
      console.log('Regenerating smoke due to structural param change:', key);
      generateVolumetricSmoke();
    }

    let needsDensityRegen = densityRegenKeys.includes(key);
    let needsStarRegen = starRegenKeys.includes(key);

    if (needsDensityRegen || needsStarRegen) { // Some params (e.g. galacticRadius) affect both
        // Regenerate cluster centers if parameters they depend on change
        // This should happen before star or density regeneration if they use the new clusters
        if (['galacticRadius', 'spiralArms', 'baseRadius', 'spiralPitchAngle'].includes(key)) {
             console.log("Regenerating shared galaxy clusters due to parameter change:", key);
             sharedGalaxyClusters = generateClusterCenters(20, galaxyParams.galacticRadius * 0.8, galaxyParams.spiralArms, galaxyParams.baseRadius, galaxyParams.spiralPitchAngle);
        }
    }

    if (needsDensityRegen) {
        console.log("Regenerating density texture due to parameter change:", key);
        if (densityWorker) {
            densityWorker.terminate();
            densityWorker = null;
            console.log("Terminated existing density worker.");
        }
        // Ensure composer is reset or correctly handles new texture if it exists
        if (composer && smokePass) {
            // Potentially remove and re-add smokePass if texture dimensions/format changes,
            // but here only data changes. Texture object itself is reused.
        }
        setupDensityTexture(); // This will create and start a new worker
    }

    if (needsStarRegen) {
        console.log("Regenerating stars due to parameter change:", key);
        if (starField) {
            galaxyGroup.remove(starField);
            starField.geometry.dispose();
                       starField.material.dispose();
            starField = null; // Important to nullify
        }
        setupInstancedStars();
    }
    
    // Live uniform updates for shaders
    if (starField && key === 'orbitalTimeScale') {
        starField.material.uniforms.timeScale.value = val;
    }
    if (starField && key === 'coreRadius') { 
        starField.material.uniforms.coreRadiusUniform.value = val;
    }

    if (smokePass) {
        if (key === 'densityFactor') smokePass.uniforms.densityFactor.value = val;
        if (key === 'absorptionCoefficient') smokePass.uniforms.absorptionCoefficient.value = val;
        if ( key === 'scatteringCoefficient') smokePass.uniforms.scatteringCoefficient.value = val;
        if (key === 'rayMarchSteps') smokePass.uniforms.steps.value = val;
        if (key === 'anisotropyG') smokePass.uniforms.phaseG.value = val;
        if (key === 'centralLightIntensity') {
            smokePass.uniforms.lightIntensity.value.setRGB(1.0, 0.9, 0.8).multiplyScalar(val);
        }
        if (key === 'galacticRadius' && smokePass.uniforms.boxMin) { // Check if boxMin exists
            smokePass.uniforms.boxMin.value.set(-val, -val, -val * 0.5);
            smokePass.uniforms.boxMax.value.set(val, val, val * 0.5);
        }
    }

    // Smoke regeneration on specific parameter changes
    if (smokePoints) {
      if (smokeRegen.includes(key)) {
        console.log('Regenerating smoke particles due to change:', key);
        generateVolumetricSmoke();
      }
      // Live update size and noise intensity
      if (key === 'smokeParticleSize') {
        console.log('Updating smoke particle size to:', val);
        smokePoints.material.uniforms.uSize.value = val;
      }
      if (key === 'smokeNoiseIntensity') {
        console.log('Updating smoke noise intensity to:', val);
        smokePoints.material.uniforms.uNoiseIntensity.value = val;
      }
    }
};

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) {
        composer.setSize(window.innerWidth, window.innerHeight);
    }
    if (smokePass) {
        smokePass.uniforms.screenResolution.value.set(window.innerWidth, window.innerHeight);
        const imgWidth = blueNoiseTexture.image && blueNoiseTexture.image.width ? blueNoiseTexture.image.width : 1;
        const imgHeight = blueNoiseTexture.image && blueNoiseTexture.image.height ? blueNoiseTexture.image.height : 1;
        smokePass.uniforms.noiseScale.value.set(
            window.innerWidth / imgWidth,
            window.innerHeight / imgHeight
        );
    }
}, false);

// Parameter UI (Example - can be expanded)

// Start the animation loop
animate();