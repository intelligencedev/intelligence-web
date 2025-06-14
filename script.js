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

// Try to load BlueNoise470.png, fallback to procedural texture
const blueNoiseTexture = new THREE.TextureLoader().load(
    'BlueNoise470.png',
    undefined, // onLoad
    undefined, // onProgress
    function(error) {
        console.warn('Failed to load BlueNoise470.png, using procedural fallback:', error);
        // Replace with procedural texture
        const proceduralTexture = createBlueNoiseTexture();
        blueNoiseTexture.image = proceduralTexture.image;
        blueNoiseTexture.needsUpdate = true;
    }
);
blueNoiseTexture.wrapS = THREE.RepeatWrapping;
blueNoiseTexture.wrapT = THREE.RepeatWrapping;

camera.position.set(0.52, -7.77, 1.51);
camera.rotation.set(THREE.MathUtils.degToRad(79.0), THREE.MathUtils.degToRad(3.9), THREE.MathUtils.degToRad(-18.7)); // Converted to radians

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.25;
controls.enableZoom = true;
controls.enablePan = false;

const galaxyGroup = new THREE.Group();
scene.add(galaxyGroup);

const controlParams = {
    rotationSpeed: 1e-4
};

// Add time tracking for continuous animation
let globalTime = 0;
let lastFrameTime = performance.now(); // Initialize lastFrameTime

const galaxyParams = {
    numStars: 70000,
    starSize: 0.02,
    galacticRadius: 6,
    spiralArms: 2,
    coreRadius: 0.10,
    numNebulaParticles: 20000,
    numSmokeParticles: 20000,
    smokeParticleSize: 0.90,
    smokeColor1: new THREE.Color(0x101025).multiplyScalar(1.5), // Example: Brighten smoke colors
    smokeColor2: new THREE.Color(0x251510).multiplyScalar(1.5), // Example: Brighten smoke colors
    smokeDensityFactor: 5.0,
    smokeMarchSteps: 6,
    smokeDiffuseStrength: 9.0,
    godRaysIntensity: 0.33,
    sunPosition: new THREE.Vector3(0.0, 0.0, 0.0),
    anisotropyG: 0.1,
    centralLightIntensity: 0.3
};

// --- START: GPU Instanced Stars ---

const starVertexShader = `
    attribute vec3 initPos;       // Initial position of the star (center of the quad)
    attribute vec3 instanceColor; // Color of the star
    attribute float instanceSize;  // Size of the star

    uniform float uTime;           // Combined globalTime * effective rotationSpeed
    uniform float coreRadiusUniform; // To pass galaxyParams.coreRadius

    varying vec3 vColor;
    varying vec2 vUv;              // UV for the texture on the quad (from PlaneGeometry's uv attribute)

    float angularVel(float r_val, float core_r_uniform) {
        if (r_val < core_r_uniform * 0.75) {
            return 5.0; 
        } else if (r_val < core_r_uniform * 2.0) {
            return mix(5.0, 1.0, smoothstep(core_r_uniform * 0.75, core_r_uniform * 2.0, r_val));
        } else { 
            return 1.0 / (r_val * 0.5 + 0.2); 
        }
    }

    void main() {
        vColor = instanceColor;
        vUv = uv; // 'uv' is the attribute from the PlaneGeometry of the quad

        float r = length(initPos.xy); 
        
        float currentAngularOffset = angularVel(r, coreRadiusUniform) * uTime;
        float baseAngle = atan(initPos.y, initPos.x); 
        float theta = baseAngle + currentAngularOffset; 

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
    // Allocate 3D Texture
    densityTexture = new THREE.DataTexture3D(
        new Uint8Array(DENSITY_TEXTURE_SIZE * DENSITY_TEXTURE_SIZE * DENSITY_TEXTURE_SIZE),
        DENSITY_TEXTURE_SIZE,
        DENSITY_TEXTURE_SIZE,
        DENSITY_TEXTURE_SIZE
    );
    densityTexture.format = THREE.RedFormat;
    densityTexture.type = THREE.UnsignedByteType;
    densityTexture.minFilter = THREE.LinearFilter;
    densityTexture.magFilter = THREE.LinearFilter;
    densityTexture.unpackAlignment = 1;
    densityTexture.needsUpdate = true;

    // Initialize Web Worker
    if (window.Worker) {
        densityWorker = new Worker('densityWorker.js');
        densityWorker.onmessage = function(e) {
            const { textureData } = e.data;
            densityTexture.image.data = new Uint8Array(textureData);
            densityTexture.needsUpdate = true;
            console.log("Density texture updated by worker.");

            // Worker has done its job, can terminate if not needed for updates
            // densityWorker.terminate(); 
            // densityWorker = null;
        };
        densityWorker.onerror = function(error) {
            console.error('Error from density worker:', error);
        };

        // Start computation
        // Clusters should already be generated before this function is called
        if (!sharedGalaxyClusters) {
            console.error("sharedGalaxyClusters should be generated before setupDensityTexture!");
            // Generate as fallback
            sharedGalaxyClusters = generateClusterCenters(20, galaxyParams.galacticRadius * 0.8, galaxyParams.spiralArms);
        }

        densityWorker.postMessage({
            textureSize: DENSITY_TEXTURE_SIZE,
            galaxyParams: { // Send relevant params
                galacticRadius: galaxyParams.galacticRadius,
                // Potentially other params like coreRadius, spiralArms if needed by worker's logic
            },
            noiseScale: 0.15, // Example scale for FBM
            clusterCenters: sharedGalaxyClusters // Send cluster data
        });

    } else {
        console.error('Web Workers are not supported in this browser.');
        // Fallback or error message
    }
}


const volumetricSmokeShader = {
    uniforms: {
        'tDiffuse': { value: null }, // Scene render
        'tDensity': { value: null }, // Will be densityTexture
        'cameraPos': { value: new THREE.Vector3() },
        'invProjectionMatrix': { value: new THREE.Matrix4() },
        'invModelViewMatrix': { value: new THREE.Matrix4() },
        'screenResolution': { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        'u_time': { value: 0.0 },
        'absorptionCoefficient': { value: 2.0 }, // Beer-Lambert (reduced)
        'scatteringCoefficient': { value: 8.0 }, // Increased scattering
        'phaseG': { value: 0.1 }, // Henyey-Greenstein g
        'lightPosition': { value: new THREE.Vector3(0, 0, 0) }, // Example: central light
        'lightIntensity': { value: new THREE.Color(1.0, 0.9, 0.8).multiplyScalar(2.0) }, // Brighter light
        'densityFactor': { value: 5.0 }, // Increased density factor
        'steps': { value: 64 }, // Raymarching steps
        'noiseTexture': { value: blueNoiseTexture }, // For dithering/jittering ray start
        'noiseScale': { value: new THREE.Vector2(1, 1) }, // Placeholder, updated once texture loads
        'boxMin': { value: new THREE.Vector3(-galaxyParams.galacticRadius, -galaxyParams.galacticRadius, -galaxyParams.galacticRadius * 0.25) },
        'boxMax': { value: new THREE.Vector3(galaxyParams.galacticRadius, galaxyParams.galacticRadius, galaxyParams.galacticRadius * 0.25) },
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
        uniform sampler3D tDensity;
        uniform vec3 cameraPos; // World space camera position
        uniform mat4 invProjectionMatrix;
        uniform mat4 invModelViewMatrix; // Inverse of camera's modelViewMatrix (camera.matrixWorld)
        uniform vec2 screenResolution;
        uniform float u_time;
        uniform float absorptionCoefficient;
        uniform float scatteringCoefficient;
        uniform float phaseG;
        uniform vec3 lightPosition; // World space light position
        uniform vec3 lightIntensity;
        uniform float densityFactor;
        uniform int steps;
        uniform sampler2D noiseTexture;
        uniform vec2 noiseScale;
        uniform vec3 boxMin; // AABB of the smoke volume
        uniform vec3 boxMax;

        varying vec2 vUv;

        #define PI 3.14159265359

        // Henyey-Greenstein phase function
        float henyeyGreenstein(float cosTheta, float g) {
            float g2 = g * g;
            return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
        }

        // Intersection of a ray with an AABB
        // ro: ray origin, rd: ray direction
        // boxMin, boxMax: AABB corners
        // t0, t1: entry and exit distances
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
            return t_exit > max(0.0, t_enter); // Ensure t_exit is positive and after t_enter
        }


        // Sample density from 3D texture
        float sampleDensity(vec3 pos_world) {
            // Transform world position to texture coordinates [0, 1]
            vec3 texCoord = (pos_world - boxMin) / (boxMax - boxMin);
            // Clamp to avoid sampling outside the texture
            if (any(lessThan(texCoord, vec3(0.0))) || any(greaterThan(texCoord, vec3(1.0)))) {
                return 0.0;
            }
            float rawDensity = texture(tDensity, texCoord).r;
            return rawDensity * densityFactor; // Scale density by factor
        }


        void main() {
            // Sample scene color
            vec4 sceneColor = texture2D(tDiffuse, vUv);
            // Calculate ray direction from camera through fragment
            vec2 screenPos = vUv * 2.0 - 1.0; // Convert UV to NDC [-1, 1]
            
            // Create ray direction in view space
            vec4 clipPos = vec4(screenPos, -1.0, 1.0); // Near plane
            vec4 viewPos = invProjectionMatrix * clipPos;
            viewPos /= viewPos.w;
            
            vec3 rayDir = normalize(viewPos.xyz); // Ray direction in view space
            rayDir = (invModelViewMatrix * vec4(rayDir, 0.0)).xyz; // Transform to world space
            vec3 rayOrigin = cameraPos;

            float tNear, tFar;
            if (!intersectBox(rayOrigin, rayDir, boxMin, boxMax, tNear, tFar)) {
                gl_FragColor = sceneColor; // No volume contribution
                return;
            }
            
            tNear = max(tNear, 0.0); // Ensure tNear is not behind camera

            if (tFar <= tNear) {
                gl_FragColor = sceneColor;
                return;
            }

            vec3 accumulatedColor = vec3(0.0);
            float accumulatedAlpha = 0.0; // Transmittance

            // Jitter ray start for noise reduction (using blue noise if available)
            float noiseVal = texture(noiseTexture, gl_FragCoord.xy * noiseScale).r;
            float stepSize = (tFar - tNear) / float(steps);
            float currentT = tNear + noiseVal * stepSize; // Jittered start

            for (int i = 0; i < steps; ++i) {
                if (currentT >= tFar || accumulatedAlpha > 0.99) break;

                vec3 currentPos = rayOrigin + rayDir * currentT;
                float density = sampleDensity(currentPos);

                if (density > 0.01) { // Only process if density is significant
                    float effectiveStepSize = stepSize; // Could be adaptive: stepSize * clamp(0.1, 1.0/density, 1.0);
                    
                    // Beer-Lambert Law for absorption
                    float transmittance = exp(-absorptionCoefficient * density * effectiveStepSize);
                    accumulatedAlpha += (1.0 - transmittance) * (1.0 - accumulatedAlpha);


                    // Scattering (simplified single scattering)
                    vec3 lightDir = normalize(lightPosition - currentPos); // Direction to light
                    float cosTheta = dot(rayDir, lightDir); // Angle between view ray and light ray
                    float phase = henyeyGreenstein(cosTheta, phaseG);
                    
                    // Attenuation of light to this point (simplified, could also raymarch to light)
                    float lightAttenuation = 1.0; // Placeholder for light raymarching or shadow map

                    vec3 scatteredLight = lightIntensity * scatteringCoefficient * density * phase * lightAttenuation * effectiveStepSize;
                    accumulatedColor += scatteredLight * (1.0 - accumulatedAlpha); // Add scattered light, attenuated by what's in front
                }
                currentT += stepSize; // Basic adaptive step: stepSize * clamp(0.1, 1.0 / (density * 10.0 + 1e-6), 1.0);
            }
            // Composite volumetric over scene
            gl_FragColor = sceneColor + vec4(accumulatedColor, 1.0);
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

    const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(255,255,220,0.8)');
    gradient.addColorStop(0.5, 'rgba(255,220,200,0.4)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

function setupInstancedStars() {
    const numStars = galaxyParams.numStars;
    const starGeo = new THREE.PlaneGeometry(1, 1); 

    const starMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            starTexture: { value: createCircularGradientTexture() }, 
            coreRadiusUniform: { value: galaxyParams.coreRadius }
        },
        vertexShader: starVertexShader,
        fragmentShader: starFragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending, 
        depthWrite: false 
    });

    starField = new THREE.InstancedMesh(starGeo, starMaterial, numStars);

    const initPositions = new Float32Array(numStars * 3);
    const instanceColors = new Float32Array(numStars * 3);
    const instanceSizes = new Float32Array(numStars * 1);
    const tempColor = new THREE.Color();

    for (let i = 0; i < numStars; i++) {
        const starTypeIndex = Math.floor(Math.random() * starTypes.length);
        const starType = starTypes[starTypeIndex];

        let x_pos, y_pos, z_pos;
        const r_dist = Math.random(); 
        const isInBulge = Math.random() < 0.20 && galaxyParams.coreRadius > 0.01;

        if (isInBulge) {
            const radius = Math.pow(Math.random(), 1.5) * galaxyParams.coreRadius;
            const u = Math.random(); 
            const v = Math.random(); 
            const theta_bulge = 2 * Math.PI * u; 
            const phi_bulge = Math.acos(2 * v - 1); 

            x_pos = radius * Math.sin(phi_bulge) * Math.cos(theta_bulge);
            y_pos = radius * Math.sin(phi_bulge) * Math.sin(theta_bulge);
            z_pos = radius * Math.cos(phi_bulge) * 0.6; 
        } else {
            const armIndex = Math.floor(Math.random() * galaxyParams.spiralArms);
            const angleOffsetPerArm = (Math.PI * 2) / galaxyParams.spiralArms;
            const baseAngleForArm = armIndex * angleOffsetPerArm;

            let r_disk = galaxyParams.coreRadius + Math.pow(r_dist, 1.8) * (galaxyParams.galacticRadius - galaxyParams.coreRadius);
            r_disk = Math.min(r_disk, galaxyParams.galacticRadius); 

            const spiralTightness = 2.5; 
            const armSpread = 0.35; 
            
            let theta_disk = baseAngleForArm + (r_disk / galaxyParams.galacticRadius) * spiralTightness * Math.PI;
            theta_disk += (Math.random() - 0.5) * armSpread * (galaxyParams.galacticRadius / (r_disk + 0.1)); 

            x_pos = r_disk * Math.cos(theta_disk);
            y_pos = r_disk * Math.sin(theta_disk);
            
            const z_rand = (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2; 
            z_pos = z_rand * (0.03 * galaxyParams.galacticRadius) * (1 - (r_disk / galaxyParams.galacticRadius) * 0.7); 
        }
        initPositions[i * 3 + 0] = x_pos;
        initPositions[i * 3 + 1] = y_pos;
        initPositions[i * 3 + 2] = z_pos;

        const colorObj = generateStarColorWithLuminosity(starType.colorRange, starType.luminosityRange);
        tempColor.set(colorObj); 
        instanceColors[i * 3 + 0] = tempColor.r;
        instanceColors[i * 3 + 1] = tempColor.g;
        instanceColors[i * 3 + 2] = tempColor.b;

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
    console.log("Instanced stars setup complete.");
}

// Call the new setup function
setupInstancedStars();

// Generate cluster centers before density texture setup
sharedGalaxyClusters = generateClusterCenters(20, galaxyParams.galacticRadius * 0.8, galaxyParams.spiralArms);

// Hoist composer declaration before setup to avoid TDZ error


setupDensityTexture(); // Initialize density texture and worker
setupPostProcessing(); // Setup post-processing after density texture initialization


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

// --- NEW: Advanced Clustering Functions ---
function generateClusterCenters(numClusters, galacticRadius, spiralArms) {
    const clusters = [];
    
    // Generate spiral arm clusters
    for (let arm = 0; arm < spiralArms; arm++) {
        const armAngle = (arm / spiralArms) * 2 * Math.PI;
        const clustersPerArm = Math.floor(numClusters * 0.7 / spiralArms); // 70% in spiral arms
        
        for (let i = 0; i < clustersPerArm; i++) {
            const t = (i + 1) / (clustersPerArm + 1); // Parameter along arm
            const radius = Math.pow(t, 0.8) * galacticRadius * 0.9; // Non-linear distribution
            // REVERSED spiral direction: negate the pitch term
            const angle = armAngle - 3.0 * radius / galacticRadius + (Math.random() - 0.5) * 0.8;
            
            const x = radius * Math.cos(angle);
            const y = radius * Math.sin(angle);
            
            // Enhanced vertical distribution - much thicker at center, thinner at edges
            const normalizedRadius = radius / galacticRadius;
            const verticalScale = Math.pow(1.0 - normalizedRadius, 1.2) * 0.8 + 0.1;
            const z = (Math.random() - 0.5) * verticalScale;
            
            // Add 3D noise perturbation to cluster centers
            const noiseOffset = fractalNoise3D(new THREE.Vector3(x, y, z), 3, 0.08) - 0.5;
            clusters.push({
                center: new THREE.Vector3(x + noiseOffset, y + noiseOffset, z),
                radius: 0.8 + Math.random() * 1.2, // Cluster size variation
                density: 0.6 + Math.random() * 0.4, // Density variation
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

// Remove old smoke particle system related code if it exists
// For example, if there was a 'createSmokeParticles' or similar, it should be removed.
// And in the animate loop, any updates to that old system.

// Update EffectComposer - declare composer here
var composer;

function setupPostProcessing() {
    // Initialize composer here
    composer = new THREE.EffectComposer(renderer);
    const renderPass = new THREE.RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Volumetric Smoke Pass
    if (densityTexture) { // Ensure texture is ready or at least initialized
        volumetricSmokeShader.uniforms.tDensity.value = densityTexture;
        volumetricSmokeShader.uniforms.cameraPos.value = camera.position;
        // invProjectionMatrix and invModelViewMatrix will be updated in animate
        volumetricSmokeShader.uniforms.screenResolution.value = new THREE.Vector2(window.innerWidth, window.innerHeight);
        volumetricSmokeShader.uniforms.noiseTexture.value = blueNoiseTexture;
        
        const imgWidth = blueNoiseTexture.image && blueNoiseTexture.image.width ? blueNoiseTexture.image.width : 1;
        const imgHeight = blueNoiseTexture.image && blueNoiseTexture.image.height ? blueNoiseTexture.image.height : 1;
        volumetricSmokeShader.uniforms.noiseScale.value = new THREE.Vector2(
            window.innerWidth / imgWidth,
            window.innerHeight / imgHeight
        );
        
        volumetricSmokeShader.uniforms.boxMin.value = new THREE.Vector3(-galaxyParams.galacticRadius, -galaxyParams.galacticRadius, -galaxyParams.galacticRadius * 0.25);
        volumetricSmokeShader.uniforms.boxMax.value = new THREE.Vector3(galaxyParams.galacticRadius, galaxyParams.galacticRadius, galaxyParams.galacticRadius * 0.25);


        smokePass = new THREE.ShaderPass(volumetricSmokeShader);
        // Enable additive blending to overlay volumetric effect onto scene
        smokePass.material.transparent = true;
        smokePass.material.blending = THREE.AdditiveBlending;
        smokePass.material.depthTest = false;
        smokePass.material.depthWrite = false;
        smokePass.renderToScreen = true; // Final pass renders to screen
        composer.addPass(smokePass);
    } else {
        console.warn("Density texture not ready for post-processing pass setup.");
        // Create a fallback pass if texture isn't ready
        const copyPass = new THREE.ShaderPass(THREE.CopyShader);
        copyPass.renderToScreen = true;
        composer.addPass(copyPass);
    }
}

// setupPostProcessing(); // Moved to after density texture setup


function animate() {
    requestAnimationFrame(animate);

    const currentTime = performance.now();
    const deltaTime = (currentTime - lastFrameTime) / 1000; // Convert to seconds
    lastFrameTime = currentTime;
    globalTime += deltaTime;

    controls.update();

    // Update shader uniforms that change each frame
    if (starField) {
        starField.material.uniforms.uTime.value = globalTime * controlParams.rotationSpeed;
    }

    if (smokePass) {
        smokePass.uniforms.u_time.value = globalTime;
        smokePass.uniforms.cameraPos.value.copy(camera.position);
        smokePass.uniforms.invProjectionMatrix.value.copy(camera.projectionMatrixInverse);
        smokePass.uniforms.invModelViewMatrix.value.copy(camera.matrixWorld); // camera.matrixWorld is already the inverse of view matrix
    }


    // renderer.render(scene, camera); // Replace with composer.render()
    if (composer) {
        composer.render();
    } else {
        renderer.render(scene, camera); // Fallback if composer not ready
    }

    const cameraInfo = document.getElementById('camera-info');
    if (cameraInfo) {
        cameraInfo.innerHTML =
            `Camera: x: ${camera.position.x.toFixed(2)}, y: ${camera.position.y.toFixed(2)}, z: ${camera.position.z.toFixed(2)}<br>` +
            `Rotation: x: ${THREE.MathUtils.radToDeg(camera.rotation.x).toFixed(1)}, y: ${THREE.MathUtils.radToDeg(camera.rotation.y).toFixed(1)}, z: ${THREE.MathUtils.radToDeg(camera.rotation.z).toFixed(1)}`;
    }
}
animate();

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
// ...existing code...