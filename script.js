const starTypes = [
    { type: "O-type", colorRange: { min: [0.2, 0.2, 0.9], max: [0.4, 0.4, 1] } },
    { type: "B-type", colorRange: { min: [0.6, 0.7, 1], max: [0.8, 0.9, 1] } },
    { type: "A-type", colorRange: { min: [0.8, 0.8, 0.95], max: [0.9, 0.9, 1] } },
    { type: "F-type", colorRange: { min: [0.95, 0.95, 0.8], max: [1, 1, 0.9] } },
    { type: "G-type", colorRange: { min: [1, 0.95, 0.7], max: [1, 1, 0.8] } },
    { type: "K-type", colorRange: { min: [1, 0.6, 0.4], max: [1, 0.8, 0.6] } },
    { type: "M-type", colorRange: { min: [1, 0.3, 0.3], max: [1, 0.5, 0.5] } },
    { type: "Red Giant", colorRange: { min: [1, 0.4, 0.2], max: [1, 0.6, 0.4] } },
    { type: "White Dwarf", colorRange: { min: [0.7, 0.7, 0.9], max: [0.9, 0.9, 1] } },
    { type: "Brown Dwarf", colorRange: { min: [0.3, 0.15, 0.1], max: [0.5, 0.3, 0.2] } }
];

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

camera.position.set(0.36, -7.70, 1.89);
camera.rotation.set(1.32, 0.09, 0);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.25;
controls.enableZoom = true;
controls.enablePan = false;

const galaxyGroup = new THREE.Group();
scene.add(galaxyGroup);

const controlParams = {
    rotationSpeed: 5e-4
};

// Add time tracking for continuous animation
let globalTime = 0;
let lastFrameTime = 0;

const galaxyParams = {
    numStars: 70000,
    starSize: 0.02,
    galacticRadius: 6,
    spiralArms: 2,
    coreRadius: 0.10,
    numNebulaParticles: 30000,
    numSmokeParticles: 9900,
    smokeParticleSize: 0.90,
    smokeColor1: new THREE.Color(0x101025),
    smokeColor2: new THREE.Color(0x251510),
    smokeNoiseIntensity: 0.65,
    smokeRimColor: new THREE.Color(0xffffff),
    smokeRimIntensity: 9.0,
    smokeRimPower: 3.0,
    smokeRimInner: 0.35,
    smokeRimOuter: 0.5,
    smokeDensityFactor: 9.0,
    smokeMarchSteps: 3,
    smokeDiffuseStrength: 3.8,
    godRaysIntensity: 0.3,
    sunPosition: new THREE.Vector3(0.0, 0.0, 0.0),
    anisotropyG: 0.9,
    centralLightIntensity: 1.0
};

function getRandomColorInRange(range) {
    const r = THREE.MathUtils.lerp(range.min[0], range.max[0], Math.random());
    const g = THREE.MathUtils.lerp(range.min[1], range.max[1], Math.random());
    const b = THREE.MathUtils.lerp(range.min[2], range.max[2], Math.random());
    return new THREE.Color(r, g, b);
}

function createCircularGradientTexture() {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    context.clearRect(0, 0, size, size);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.minFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.format = THREE.RGBAFormat;
    return texture;
}

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
let sharedGalaxyClusters = null; // Global variable to hold shared cluster centers

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
const VolumetricRaymarchingInspiredSmokeShader = {
    uniforms: {
        uTime: { value: 0.0 },
        uColor1: { value: galaxyParams.smokeColor1 },
        uColor2: { value: galaxyParams.smokeColor2 },
        uSize: { value: galaxyParams.smokeParticleSize },
        uNoiseIntensity: { value: galaxyParams.smokeNoiseIntensity },
        uCentralLightPosition: { value: new THREE.Vector3(0, 0, 0) },
        uCentralLightIntensity: { value: 1.0 },
        uCameraPosition: { value: new THREE.Vector3() },
        uParticleTexture: { value: null },
        uDensityFactor: { value: galaxyParams.smokeDensityFactor },
        uMarchSteps: { value: galaxyParams.smokeMarchSteps },
        uDiffuseStrength: { value: galaxyParams.smokeDiffuseStrength },
        time: { value: 0 },             // Add time uniform for rotation (matches original name)
        rotationSpeed: { value: 0.1 }   // Add rotation speed uniform (matches original name)
    },
    vertexShader: `
        uniform float uSize;
        uniform float time;          // Time for rotation
        uniform float rotationSpeed; // Rotation speed
        
        attribute float aParticleSize;
        attribute float aParticleOpacity;
        attribute float angle;       // Original angle attribute
        attribute float radius;      // Original radius attribute
        
        varying vec3 vWorldPosition;
        varying float vParticleOpacity;
        varying vec3 vViewVector;
        varying vec3 vLocalPosition;

        void main() {
            // Apply rotation similar to the rotationShader
            float wrappedTime = mod(time, 1000.0);
            float rotationAngle = angle + wrappedTime * rotationSpeed;
            
            // Create rotated position
            vec3 rotatedPosition = vec3(
                radius * cos(rotationAngle),
                radius * sin(rotationAngle),
                position.z
            );
            
            // Use the rotated position for the rest of the calculations
            vec4 modelPosition = modelMatrix * vec4(rotatedPosition, 1.0);
            vWorldPosition = modelPosition.xyz;
            vParticleOpacity = aParticleOpacity;
            vLocalPosition = rotatedPosition;

            // View vector from camera to this vertex (used for raymarching direction)
            vViewVector = normalize(modelPosition.xyz - cameraPosition);

            vec4 viewPosition = viewMatrix * modelPosition;
            vec4 projectedPosition = projectionMatrix * viewPosition;

            gl_Position = projectedPosition;
            gl_PointSize = (uSize * aParticleSize) * (300.0 / -viewPosition.z);
        }
    `,
    fragmentShader: `
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

        varying vec3 vWorldPosition;
        varying float vParticleOpacity;
        varying vec3 vViewVector;
        varying vec3 vLocalPosition;
        
        // Simple hash function for noise
        float hash(vec3 p) {
            p = fract(p * 0.3183099 + 0.1);
            p *= 17.0;
            return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }
        
        // Simple 3D noise function
        float noise(vec3 x) {
            vec3 p = floor(x);
            vec3 f = fract(x);
            f = f * f * (3.0 - 2.0 * f);
            
            return mix(mix(mix(hash(p + vec3(0, 0, 0)), 
                               hash(p + vec3(1, 0, 0)), f.x),
                           mix(hash(p + vec3(0, 1, 0)), 
                               hash(p + vec3(1, 1, 0)), f.x), f.y),
                       mix(mix(hash(p + vec3(0, 0, 1)), 
                               hash(p + vec3(1, 0, 1)), f.x),
                           mix(hash(p + vec3(0, 1, 1)), 
                               hash(p + vec3(1, 1, 1)), f.x), f.y), f.z);
        }
        
        // Fractal Brownian Motion (FBM) for more interesting noise
        float fbm(vec3 p, int octaves) {
            float value = 0.0;
            float amplitude = 0.5;
            float frequency = 1.0;
            
            // Animate noise over time for subtle movement
            p += uTime * 0.05 * vec3(0.7, -0.4, 0.2);
            
            for (int i = 0; i < 6; i++) {
                if (i >= octaves) break; // Honor the octaves parameter
                value += amplitude * noise(p * frequency);
                frequency *= 2.0;
                amplitude *= 0.5;
            }
            
            return value;
        }

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
            
            // Apply FBM noise
            float noiseValue = fbm(localP * 3.0, 4) * uNoiseIntensity;
            
            // Higher density factor means thicker smoke
            return (-base + noiseValue * 0.3) * uDensityFactor;
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
                    // Compare density at current point vs. point slightly offset toward light
                    float densityToLight = densityFunction(pos + lightDir * 0.2);
                    float diffuse = clamp((density - densityToLight) / 0.2, 0.0, 1.0) * uDiffuseStrength;
                    
                    // Mix colors based on noise
                    float colorMix = fbm(pos * 2.0, 2);
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

            // Sample particle texture for basic shape
            vec4 texColor = texture2D(uParticleTexture, pointCoord);
            if (texColor.a < 0.05) {
                discard;
            }
            
            // Ray starting at particle center facing towards camera
            vec3 rayOrigin = vWorldPosition;
            vec3 rayDirection = normalize(vWorldPosition - uCameraPosition);
            
            // Perform raymarching within the particle
            vec4 volumetricResult = raymarch(rayOrigin, rayDirection);
            
            // Combine with particle texture for smooth edges
            volumetricResult.a *= texColor.a * vParticleOpacity;
            
            gl_FragColor = volumetricResult;
        }
    `
};

// --- NEW: Function to generate volumetric smoke with clustering ---
function generateVolumetricSmoke() {
    const positions = [];
    const colors = [];
    const sizes = []; // For individual particle size variation if needed
    const opacities = []; // For individual particle opacity variation
    const angles = []; // For rotation
    const radii = []; // For rotation

    let attempts = 0;
    const maxAttempts = galaxyParams.numSmokeParticles * 20; // Increased attempts for better distribution

    // Use sharedGalaxyClusters for smoke distribution
    const smokeClusters = sharedGalaxyClusters;

    while (positions.length / 3 < galaxyParams.numSmokeParticles && attempts < maxAttempts) {
        attempts++;
        let x, y, z, distanceFromCenter, angle, radius;

        // Use the same distribution logic as generateGalaxyStars
        if (Math.random() < 0.75) { // 75% cluster-based generation
            const cluster = smokeClusters[Math.floor(Math.random() * smokeClusters.length)];
            // Adjust ellipsoid for smoke - potentially wider and flatter than star clusters
            const clusterOffset = randomPointInEllipsoid(
                cluster.radius * 2.0, // Smoke clusters might be more diffuse
                cluster.radius * 2.0,
                cluster.radius * 0.5 // Flatter distribution for smoke
            );
            
            const particlePosition = cluster.center.clone().add(clusterOffset);
            x = particlePosition.x;
            y = particlePosition.y;
            z = particlePosition.z;
            distanceFromCenter = Math.sqrt(x * x + y * y);
            angle = Math.atan2(y, x);
            radius = distanceFromCenter;

        } else { // 25% spiral arm generation
            const armAngle = (Math.random() * galaxyParams.spiralArms) * (2 * Math.PI / galaxyParams.spiralArms);
            distanceFromCenter = Math.max(0.1, Math.pow(Math.random(), 2.0) * galaxyParams.galacticRadius); // Adjusted exponent for smoke spread
            angle = armAngle - 3.2 * distanceFromCenter / galaxyParams.galacticRadius + (Math.random() - 0.5) * 0.8;
            radius = distanceFromCenter;
            
            x = distanceFromCenter * Math.cos(angle);
            y = distanceFromCenter * Math.sin(angle);
            
            const normalizedDistance = distanceFromCenter / galaxyParams.galacticRadius;
            // Smoke might be thicker or follow a different vertical profile than stars
            const thicknessMultiplier = Math.exp(-normalizedDistance * 1.5) * 1.0 + 0.1; // Adjusted for smoke
            z = (Math.random() - 0.5) * thicknessMultiplier * 0.75; // Flatter smoke overall
        }

        if (distanceFromCenter > galaxyParams.galacticRadius * 1.1) continue; // Allow smoke to extend slightly further

        const positionVec = new THREE.Vector3(x, y, z);
        const clusterInfluence = getClusterInfluence(positionVec, smokeClusters, 1.2); // Adjusted sensitivity for smoke
        const noise = fractalNoise3D(positionVec, 3, 0.1); // Different noise profile for smoke

        // Probability for smoke, potentially less dense than stars but following similar patterns
        const centralBonus = Math.exp(-distanceFromCenter / (galaxyParams.galacticRadius * 0.3)) * 0.3; // Less central concentration for smoke
        const probability = Math.min(1.0, clusterInfluence * 0.6 + noise * 0.3 + centralBonus + 0.05); // Adjusted weights

        if (Math.random() < probability) {
            positions.push(x, y, z);
            angles.push(angle);
            radii.push(radius);

            const t = Math.random();
            const color = new THREE.Color().lerpColors(galaxyParams.smokeColor1, galaxyParams.smokeColor2, t);
            colors.push(color.r, color.g, color.b);

            sizes.push(galaxyParams.smokeParticleSize * (0.5 + Math.random() * 1.0)); // Wider size variation
            opacities.push(0.15 + Math.random() * 0.25); // Generally lower opacity for softer smoke
        }
    }

    if (positions.length === 0) {
        console.warn("No smoke particles generated. Check parameters or probability logic.");
        // Create a dummy geometry to prevent errors if no particles are generated
        const dummyGeometry = new THREE.BufferGeometry();
        dummyGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0], 3));
        return new THREE.Points(dummyGeometry, new THREE.PointsMaterial({size: 0.01, transparent: true, opacity: 0}));
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('aParticleSize', new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('aParticleOpacity', new THREE.Float32BufferAttribute(opacities, 1));
    geometry.setAttribute('angle', new THREE.Float32BufferAttribute(angles, 1)); 
    geometry.setAttribute('radius', new THREE.Float32BufferAttribute(radii, 1));

    const material = new THREE.ShaderMaterial({
        uniforms: VolumetricRaymarchingInspiredSmokeShader.uniforms,
        vertexShader: VolumetricRaymarchingInspiredSmokeShader.vertexShader,
        fragmentShader: VolumetricRaymarchingInspiredSmokeShader.fragmentShader,
        transparent: true,
        blending: THREE.NormalBlending,
        depthWrite: false,
    });

    // Set up uniforms
    material.uniforms.uParticleTexture.value = createCircularGradientTexture();
    material.uniforms.uCameraPosition.value.copy(camera.position);
    material.uniforms.uCentralLightPosition.value.set(0, 0, 0); // Set central light position
    material.uniforms.uCentralLightIntensity.value = pointLight.intensity; // Use pointLight's intensity
    material.uniforms.uDensityFactor.value = galaxyParams.smokeDensityFactor;
    material.uniforms.uMarchSteps.value = galaxyParams.smokeMarchSteps;
    material.uniforms.uDiffuseStrength.value = galaxyParams.smokeDiffuseStrength;
    material.uniforms.uNoiseIntensity.value = galaxyParams.smokeNoiseIntensity;
    material.uniforms.rotationSpeed.value = controlParams.rotationSpeed;

    return new THREE.Points(geometry, material);
}

function generateGalaxyStars() {
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    // Use sharedGalaxyClusters directly
    const starClusters = sharedGalaxyClusters;
    
    let attempts = 0;
    const maxAttempts = galaxyParams.numStars * 2;

    while (positions.length / 3 < galaxyParams.numStars && attempts < maxAttempts) {
        attempts++;
        let x, y, z, distanceFromCenter;
        
        if (Math.random() < 0.75) {
            // 75% cluster-based generation
            const cluster = starClusters[Math.floor(Math.random() * starClusters.length)];
            const clusterOffset = randomPointInEllipsoid(
                cluster.radius * 1.5,
                cluster.radius * 1.5,
                cluster.radius * 0.3
            );
                
                const position = cluster.center.clone().add(clusterOffset);
                x = position.x;
                y = position.y;
                z = position.z;
                distanceFromCenter = Math.sqrt(x * x + y * y);
        } else {
            // 25% spiral arm generation with enhanced central concentration
            const armAngle = (Math.random() * galaxyParams.spiralArms) * (2 * Math.PI / galaxyParams.spiralArms);
            // Enhanced exponential distribution for higher central concentration
            distanceFromCenter = Math.max(0.1, Math.pow(Math.random(), 2.8) * galaxyParams.galacticRadius);
            // REVERSED spiral direction: negate the pitch term
            const angle = armAngle - 3.2 * distanceFromCenter / galaxyParams.galacticRadius + (Math.random() - 0.5) * 0.8;
            
            x = distanceFromCenter * Math.cos(angle);
            y = distanceFromCenter * Math.sin(angle);
            
            // Enhanced vertical distribution - exponentially thicker at center
            const normalizedDistance = distanceFromCenter / galaxyParams.galacticRadius;
            const thicknessMultiplier = Math.exp(-normalizedDistance * 2.0) * 1.5 + 0.05;
            z = (Math.random() - 0.5) * thicknessMultiplier;
        }

        // Allow stars much closer to galactic center
        if (distanceFromCenter > galaxyParams.galacticRadius) {
            continue;
        }

        // Enhanced cluster influence and noise check
        const position = new THREE.Vector3(x, y, z);
        // Pass starClusters (which is sharedGalaxyClusters) to getClusterInfluence
        const clusterInfluence = getClusterInfluence(position, starClusters);
        const noise = fractalNoise3D(position, 5, 0.12);
        
        // Enhanced central density bonus for stars
        const centralBonus = Math.exp(-distanceFromCenter / (galaxyParams.galacticRadius * 0.2)) * 0.5;
        
        const probability = Math.min(1.0, clusterInfluence * 0.7 + noise * 0.2 + centralBonus);
        
        if (Math.random() < probability * 0.9) {
            positions.push(x, y, z);

            // Enhanced star type selection based on distance from center
            let starTypeIndex;
            if (distanceFromCenter < galaxyParams.galacticRadius * 0.3) {
                // More massive, hotter stars in the galactic center
                starTypeIndex = Math.floor(Math.random() * 4); // O, B, A, F types
            } else if (distanceFromCenter < galaxyParams.galacticRadius * 0.7) {
                // Mixed population in mid-disc
                starTypeIndex = Math.floor(Math.random() * 7); // O through K types
            } else {
                // Cooler stars in outer regions
                starTypeIndex = Math.floor(Math.random() * 3) + 4; // G, K, M types
            }
            
            const starType = starTypes[starTypeIndex];
            const color = getRandomColorInRange(starType.colorRange);
            colors.push(color.r, color.g, color.b);
        }
    }

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: galaxyParams.starSize,
        map: createCircularGradientTexture(),
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    return new THREE.Points(geometry, material);
}

function generateNebula() {
    const nebulaGroup = new THREE.Group();
    // Use sharedGalaxyClusters directly
    const nebulaClusters = sharedGalaxyClusters;

    for (let layer = 0; layer < 3; layer++) {
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        const angles = [];
        const radii = [];
        let currentLayerPositionsCount = 0;
        const scaleFactor = 1 + 0.3 * layer;
        const effectiveGalacticRadius = galaxyParams.galacticRadius * scaleFactor;

        let attempts = 0;
        const maxAttempts = (galaxyParams.numNebulaParticles / 3) * 2;

        while (currentLayerPositionsCount < galaxyParams.numNebulaParticles / 3 && attempts < maxAttempts) {
            attempts++;
            
            let angle, radius, x, y, z;
            
            if (Math.random() < 0.7) {
                // Cluster-based generation
                const cluster = nebulaClusters[Math.floor(Math.random() * nebulaClusters.length)];
                const clusterOffset = randomPointInEllipsoid(
                    cluster.radius * 2.5,
                    cluster.radius * 2.5,
                    cluster.radius * 1.2
                );
                
                const position = cluster.center.clone().add(clusterOffset);
                x = position.x;
                y = position.y;
                z = position.z;
                radius = Math.sqrt(x * x + y * y);
                angle = Math.atan2(y, x);
            } else {
                // Traditional generation
                angle = Math.random() * 2 * Math.PI;
                radius = Math.pow(Math.random(), 1.2) * effectiveGalacticRadius;
                x = radius * Math.cos(angle);
                y = radius * Math.sin(angle);
                
                const normalizedDistance = radius / effectiveGalacticRadius;
                const thicknessMultiplier = Math.pow(Math.max(0, 1.0 - normalizedDistance), 0.6);
                z = (Math.random() - 0.5) * 0.8 * thicknessMultiplier * (0.8 + layer * 0.3);
            }

            if (radius < galaxyParams.coreRadius * scaleFactor || radius > effectiveGalacticRadius) {
                continue;
            }

            // Enhanced clustering check
            const position = new THREE.Vector3(x, y, z);
            // Pass nebulaClusters (which is sharedGalaxyClusters) to getClusterInfluence
            const clusterInfluence = getClusterInfluence(position, nebulaClusters);
            const noise = fractalNoise3D(position, 4, 0.1);
            
            const probability = Math.min(1.0, clusterInfluence * 0.6 + noise * 0.4);
            
            if (Math.random() < probability * 0.8) {
                positions.push(x, y, z);
                currentLayerPositionsCount++;
                
                const noiseVal = 0.55 + 0.3 * fractalNoise({ x: x, y: y }, 5, 0.5, 2);
                const color = new THREE.Color().setHSL(noiseVal, 0.7, 0.5);
                // Push angles and radii here as well, as they are associated with the particle
                angles.push(angle);
                radii.push(radius);
                colors.push(color.r, color.g, color.b);
            }
        }

        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        geometry.setAttribute("angle", new THREE.Float32BufferAttribute(angles, 1));
        geometry.setAttribute("radius", new THREE.Float32BufferAttribute(radii, 1));

        const material = new THREE.ShaderMaterial({
            uniforms: rotationShader.uniforms,
            vertexShader: rotationShader.vertexShader,
            fragmentShader: rotationShader.fragmentShader,
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const points = new THREE.Points(geometry, material);
        nebulaGroup.add(points);
    }
    return nebulaGroup;
}

const rotationShader = {
    uniforms: {
        time: { value: 0 },
        rotationSpeed: { value: 0.1 },
        size: { value: galaxyParams.starSize }
    },
    vertexShader: `
        uniform float time;
        uniform float rotationSpeed;
        uniform float size;

        attribute float angle;
        attribute float radius;
        attribute float speed; // Assuming speed attribute might be added later or is implicitly handled

        varying vec3 vColor;

        void main() {
            // Use modulo to prevent floating point precision issues
            float wrappedTime = mod(time, 1000.0);
            float rotationAngle = angle + wrappedTime * rotationSpeed * (speed > 0.0 ? speed : 1.0);
            vec3 newPosition = vec3(
                radius * cos(rotationAngle),
                radius * sin(rotationAngle),
                position.z
            );

            vColor = color; // Use the built-in color attribute

            vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            
            // Updated point size logic
            gl_PointSize = size * (100.0 / -mvPosition.z); // Scale with distance
        }
    `,
    fragmentShader: `
        varying vec3 vColor;

        void main() {
            gl_FragColor = vec4(vColor, 1.0);
        }
    `
};

// --- Update galaxy generation to include galactic core ---
// Create galactic core instead of black hole
const galacticCore = new THREE.Group();

// Central bright core
const coreGeometry = new THREE.SphereGeometry(galaxyParams.coreRadius * 0.8, 16, 16);
const coreMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xFFDD88,
    transparent: true,
    opacity: 0.1
});
const centralCore = new THREE.Mesh(coreGeometry, coreMaterial);
//galacticCore.add(centralCore);

// Core glow effect
const glowGeometry = new THREE.SphereGeometry(galaxyParams.coreRadius * 1.5, 16, 16);
const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0xFFAA44,
    transparent: true,
    opacity: 0.1
});
const coreGlow = new THREE.Mesh(glowGeometry, glowMaterial);
//galacticCore.add(coreGlow);

// Dense star cluster in core region
const coreStarsGeometry = new THREE.BufferGeometry();
const coreStarsPositions = [];
const coreStarsColors = [];

for (let i = 0; i < 500; i++) {
    const radius = Math.pow(Math.random(), 0.5) * galaxyParams.coreRadius * 2;
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.5) * Math.PI * 0.3; // Flattened distribution
    
    const x = radius * Math.cos(theta) * Math.cos(phi);
    const y = radius * Math.sin(theta) * Math.cos(phi);
    const z = radius * Math.sin(phi) * 0.3; // Very flat central region
    
    coreStarsPositions.push(x, y, z);
    
    // Bright, hot stars in the core
    const coreStarType = starTypes[Math.floor(Math.random() * 3)]; // O, B, A types
    const color = getRandomColorInRange(coreStarType.colorRange);
    coreStarsColors.push(color.r, color.g, color.b);
}

coreStarsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(coreStarsPositions, 3));
coreStarsGeometry.setAttribute("color", new THREE.Float32BufferAttribute(coreStarsColors, 3));

const coreStarsMaterial = new THREE.PointsMaterial({
    size: galaxyParams.starSize * 1.5,
    map: createCircularGradientTexture(),
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});

const coreStars = new THREE.Points(coreStarsGeometry, coreStarsMaterial);
galacticCore.add(coreStars);

scene.add(galacticCore);

const pointLight = new THREE.PointLight(0xffffff, 5.0, 100); // Initial intensity 5, distance 100
pointLight.position.set(0, 0, 0); // Positioned at the center
scene.add(pointLight);

const composer = new THREE.EffectComposer(renderer);
const renderPass = new THREE.RenderPass(scene, camera);
composer.addPass(renderPass);

const lensingShader = {
    uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        blackHolePosition: { value: new THREE.Vector2(0.5, 0.5) },
        blackHoleRadius: { value: galaxyParams.coreRadius }
    },
    vertexShader: `
        varying vec2 vUv;

        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 blackHolePosition;
        uniform float blackHoleRadius;
        varying vec2 vUv;

        void main() {
            vec2 coord = vUv;
            float distance = length(blackHolePosition - vUv);
            if (distance < blackHoleRadius) {
                float distortion = 1.0 - smoothstep(0.0, blackHoleRadius, distance);
                coord -= normalize(vUv - blackHolePosition) * distortion * 0.2;
            }
            gl_FragColor = texture2D(tDiffuse, coord);
        }
    `
};

function getCameraDistanceToBlackHole() {
    return camera.position.length();
}

function updateLensingEffect() {
    const distanceToBlackHole = getCameraDistanceToBlackHole();
    lensingPass.uniforms.blackHoleRadius.value = galaxyParams.coreRadius / distanceToBlackHole;
}

const lensingPass = new THREE.ShaderPass(lensingShader);
lensingPass.uniforms.blackHolePosition.value = new THREE.Vector2(0.5, 0.5);
//composer.addPass(lensingPass);

const GodRayShader = {
    uniforms: {
        tDiffuse: { value: null },
        lightPosition: { value: new THREE.Vector2(0.5, 0.5) },
        exposure: { value: 0.45 },
        decay: { value: 0.95 },
        density: { value: 0.96 },
        weight: { value: 0.5 },
        samples: { value: 60 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 lightPosition;
        uniform float exposure;
        uniform float decay;
        uniform float density;
        uniform float weight;
        uniform int samples;

        varying vec2 vUv;

        void main() {
            vec2 texCoord = vUv;
            vec2 deltaTextCoord = texCoord - lightPosition;
            deltaTextCoord *= 1.0 / float(samples) * density;
            vec4 originalColor = texture2D(tDiffuse, texCoord);
            float illuminationDecay = 1.0;

            vec4 shadowEffect = vec4(0.0);

            for (int i = 0; i < samples; i++) {
                texCoord -= deltaTextCoord;
                vec4 sampleColor = texture2D(tDiffuse, texCoord);
                sampleColor *= illuminationDecay * weight;
                shadowEffect += sampleColor;
                illuminationDecay *= decay;
            }

            // Apply exposure (controlled by slider) only to the god rays (shadowEffect)
            vec3 godRaysComponent = shadowEffect.rgb * exposure;

            // Combine the original scene color with the intensity-controlled god rays
            vec3 finalColor = originalColor.rgb + godRaysComponent;

            gl_FragColor = vec4(finalColor, originalColor.a);
        }
    `
};

const godRayPass = new THREE.ShaderPass(GodRayShader);

function updateCameraRotation(event) {
    console.log("Camera rotation updated:", event.target.id);
    camera.rotation.x = parseFloat(document.getElementById("camera-rotation-x").value);
    camera.rotation.y = parseFloat(document.getElementById("camera-rotation-y").value);
    camera.rotation.z = parseFloat(document.getElementById("camera-rotation-z").value);
    updateInfoPanel();
}

function updateInfoPanel() {
    document.getElementById("info-content").innerHTML = `
        <p><strong>Camera Position:</strong> x: ${camera.position.x.toFixed(2)}, y: ${camera.position.y.toFixed(2)}, z: ${camera.position.z.toFixed(2)}</p>
        <p><strong>Camera Rotation:</strong> x: ${camera.rotation.x.toFixed(2)}, y: ${camera.rotation.y.toFixed(2)}, z: ${camera.rotation.z.toFixed(2)}</p>
    `;
}

function toggleParametersMenu() {
    const menu = document.getElementById("parameters-menu");
    menu.style.display = (menu.style.display === "none" || menu.style.display === "") ? "block" : "none";
}

function toggleInfoPanel() {
    const panel = document.getElementById("info-panel");
    const button = document.getElementById("info-button");
    if (panel.style.display === "none" || panel.style.display === "") {
        panel.style.display = "block";
        button.innerText = "Hide Info";
    } else {
        panel.style.display = "none";
        button.innerText = "Show Info";
    }
}

function updateBlackHoleSize() {
    // Update galactic core size instead of black hole
    galacticCore.children.forEach((child, index) => {
        if (child.geometry) {
            child.geometry.dispose();
            if (index === 0) { // Central core
                child.geometry = new THREE.SphereGeometry(galaxyParams.coreRadius * 0.8, 16, 16);
            } else if (index === 1) { // Glow
                child.geometry = new THREE.SphereGeometry(galaxyParams.coreRadius * 1.5, 16, 16);
            }
            // Core stars (index 2) don't need geometry update as they're points
        }
    });
}

function regenerateGalaxy() {
    // Clear all children from the group
    while(galaxyGroup.children.length > 0){ 
        const object = galaxyGroup.children[0];
        if (object.isGroup) { // Handle groups like nebula
            object.children.forEach(childInGroup => {
                if (childInGroup.geometry) childInGroup.geometry.dispose();
                if (childInGroup.material) {
                    if (childInGroup.material.dispose) childInGroup.material.dispose();
                    // If shader material, dispose textures in uniforms if any (not currently the case for nebula/smoke)
                }
            });
        } else { // Handle individual Points objects like stars and smoke
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
                if (object.material.dispose) object.material.dispose();
                if (object.material.map && object.material.map.dispose) object.material.map.dispose(); // Dispose star texture
            }
        }
        galaxyGroup.remove(object);
    }
    
    // Generate shared clusters ONCE for all components
    sharedGalaxyClusters = generateClusterCenters(35, galaxyParams.galacticRadius, galaxyParams.spiralArms);
    
    // Regenerate and add all components. They will use the global sharedGalaxyClusters.
    galaxyGroup.add(generateGalaxyStars());
    galaxyGroup.add(generateNebula());
    galaxyGroup.add(generateVolumetricSmoke());
}


// --- New Parameter Handling Logic ---

function applyStarSizeChange() {
    const newStarSize = galaxyParams.starSize;
    galaxyGroup.children.forEach(child => {
        if (child.isPoints && child.material.isPointsMaterial) { // Stars
            child.material.size = newStarSize;
        } else if (child.isGroup) { // Nebula group
            child.children.forEach(nebulaLayer => {
                // Check if it's a nebula layer (Points with rotationShader)
                if (nebulaLayer.isPoints && nebulaLayer.material.isShaderMaterial && nebulaLayer.material.uniforms.rotationSpeed) {
                    nebulaLayer.material.uniforms.size.value = newStarSize;
                }
            });
        }
    });
}

function applySmokeSizeChange() {
    const newSmokeSize = galaxyParams.smokeParticleSize;
    // Color uniforms (uColor1, uColor2) in volumetricSmokeShader point to galaxyParams.smokeColor1/2
    // These are THREE.Color objects, so .set() on galaxyParams.smokeColor1/2 updates them directly.
    // Only uSize needs explicit update here.
    galaxyGroup.children.forEach(child => {
        // Check if it's the smoke Points system (has uTime and uColor1 uniforms)
        if (child.isPoints && child.material.isShaderMaterial && child.material.uniforms.uTime && child.material.uniforms.uColor1) {
            child.material.uniforms.uSize.value = newSmokeSize;
        }
    });
}

function applyGodRaysIntensityChange() {
    const newIntensity = galaxyParams.godRaysIntensity;
    godRayPass.uniforms.exposure.value = newIntensity;
}

function applyNoiseIntensityChange() {
    const newNoiseIntensity = galaxyParams.smokeNoiseIntensity;
    galaxyGroup.children.forEach(child => {
        // Check if it's the new smoke Points system
        if (child.isPoints && child.material.isShaderMaterial && 
            child.material.uniforms.uNoiseIntensity && child.material.uniforms.uSunPosition) {
            child.material.uniforms.uNoiseIntensity.value = newNoiseIntensity;
        }
    });
}

function handleParameterChange(inputId) {
    const inputElement = document.getElementById(inputId);
    let value;

    if (inputElement.type === 'color') {
        value = inputElement.value;
    } else if (inputElement.type === 'range') {
        // Ensure correct parsing for integer vs float based on step or typical use
        if (["num-stars", "galactic-radius", "spiral-arms", "num-nebula-particles", "num-smoke-particles"].includes(inputId)) {
            value = parseInt(inputElement.value);
        } else {
            value = parseFloat(inputElement.value);
        }
    } else {
        value = inputElement.value; // Fallback, though not expected for current controls
    }

    // Update the corresponding value display
    updateValueDisplay(inputId, value);

    switch (inputId) {
        case "num-stars":
            galaxyParams.numStars = value;
            regenerateGalaxy();
            break;
        case "star-size":
            galaxyParams.starSize = value;
            applyStarSizeChange();
            break;
        case "galactic-radius":
            galaxyParams.galacticRadius = value;
            regenerateGalaxy();
            break;
        case "spiral-arms":
            galaxyParams.spiralArms = value;
            regenerateGalaxy();
            break;
        case "core-radius":
            galaxyParams.coreRadius = value;
            updateBlackHoleSize();
            updateLensingEffect(); 
            regenerateGalaxy(); 
            break;
        case "num-nebula-particles":
            galaxyParams.numNebulaParticles = value;
            regenerateGalaxy();
            break;
        case "num-smoke-particles":
            galaxyParams.numSmokeParticles = value;
            regenerateGalaxy();
            break;
        case "smoke-particle-size":
            galaxyParams.smokeParticleSize = value;
            regenerateGalaxy();
            break;
        case "smoke-noise-intensity":
            galaxyParams.smokeNoiseIntensity = value;
            applyNoiseIntensityChange();
            break;
        case "god-rays-intensity":
            galaxyParams.godRaysIntensity = value;
            applyGodRaysIntensityChange();
            break;
        case "smoke-color1":
            galaxyParams.smokeColor1.set(value);
            break;
        case "smoke-color2":
            galaxyParams.smokeColor2.set(value);
            break;
    }
}

function updateValueDisplay(inputId, value) {
    const valueElement = document.getElementById(inputId + '-value');
    if (valueElement) {
        // Format the value based on type
        if (inputId.includes('color')) {
            valueElement.textContent = value.toUpperCase();
        } else if (Number.isInteger(value) || inputId.includes('num-') || inputId.includes('spiral-arms') || inputId.includes('galactic-radius')) {
            valueElement.textContent = value.toString();
        } else {
            valueElement.textContent = value.toFixed(2);
        }
    }
}

function initializeValueDisplays() {
    const controlIds = [
        "num-stars", "star-size", "galactic-radius", "spiral-arms",
        "core-radius", "num-nebula-particles", "num-smoke-particles",
        "smoke-particle-size", "smoke-noise-intensity", "god-rays-intensity", 
        "smoke-color1", "smoke-color2"
    ];

    controlIds.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            let value;
            if (element.type === 'color') {
                value = element.value;
            } else if (element.type === 'range') {
                if (["num-stars", "galactic-radius", "spiral-arms", "num-nebula-particles", "num-smoke-particles"].includes(id)) {
                    value = parseInt(element.value);
                } else {
                    value = parseFloat(element.value);
                }
            }
            updateValueDisplay(id, value);
        }
    });
}

// --- NEW: Function to update the display of actual rendered parameters ---
function updateActualParametersDisplay() {
    document.getElementById("actual-num-stars").textContent = galaxyParams.numStars.toString();
    document.getElementById("actual-star-size").textContent = galaxyParams.starSize.toFixed(2);
    document.getElementById("actual-galactic-radius").textContent = galaxyParams.galacticRadius.toString();
    document.getElementById("actual-spiral-arms").textContent = galaxyParams.spiralArms.toString();
    document.getElementById("actual-core-radius").textContent = galaxyParams.coreRadius.toFixed(2);
    document.getElementById("actual-num-nebula-particles").textContent = galaxyParams.numNebulaParticles.toString();
    document.getElementById("actual-num-smoke-particles").textContent = galaxyParams.numSmokeParticles.toString();
    document.getElementById("actual-smoke-particle-size").textContent = galaxyParams.smokeParticleSize.toFixed(2);
    document.getElementById("actual-smoke-noise-intensity").textContent = galaxyParams.smokeNoiseIntensity.toFixed(2);
    document.getElementById("actual-smoke-density-factor").textContent = galaxyParams.smokeDensityFactor.toFixed(1);
    document.getElementById("actual-smoke-diffuse-strength").textContent = galaxyParams.smokeDiffuseStrength.toFixed(1);
    document.getElementById("actual-smoke-color1").textContent = "#" + galaxyParams.smokeColor1.getHexString().toUpperCase();
    document.getElementById("actual-smoke-color2").textContent = "#" + galaxyParams.smokeColor2.getHexString().toUpperCase();
    document.getElementById("actual-god-rays-intensity").textContent = godRayPass.uniforms.exposure.value.toFixed(2);
    document.getElementById("actual-central-light-intensity").textContent = pointLight.intensity.toFixed(2);
}

function animate() {
    requestAnimationFrame(animate);

    const currentTime = performance.now() / 1000;
    const deltaTime = currentTime - lastFrameTime;
    lastFrameTime = currentTime;
    globalTime += deltaTime;

    // Restore global galaxy rotation
    galaxyGroup.rotation.z += controlParams.rotationSpeed;

    // Update all rotation shaders and smoke
    galaxyGroup.children.forEach(child => {
        if (child.material && child.material.uniforms) {
            if (child.material.uniforms.time) {
                child.material.uniforms.time.value = globalTime;
            }
            if (child.material.uniforms.rotationSpeed) {
                child.material.uniforms.rotationSpeed.value = controlParams.rotationSpeed;
            }
            if (child.material.uniforms.uTime) {
                child.material.uniforms.uTime.value = globalTime;
            }
            if (child.material.uniforms.uCameraPosition) {
                child.material.uniforms.uCameraPosition.value.copy(camera.position);
            }
        }
    });

    controls.update();
    composer.render();

    // --- CAMERA INFO DISPLAY ---
    const cameraInfoDiv = document.getElementById('camera-info');
    if (cameraInfoDiv) {
        cameraInfoDiv.innerHTML =
            `Camera: x: ${camera.position.x.toFixed(2)}, y: ${camera.position.y.toFixed(2)}, z: ${camera.position.z.toFixed(2)}<br>` +
            `Rotation: x: ${(THREE.MathUtils.radToDeg(camera.rotation.x)).toFixed(1)}°, y: ${(THREE.MathUtils.radToDeg(camera.rotation.y)).toFixed(1)}°, z: ${(THREE.MathUtils.radToDeg(camera.rotation.z)).toFixed(1)}°`;
    }

    // Update actual rendered parameters display
    updateActualParametersDisplay();
}

// godRayPass.uniforms.lightPosition.value = new THREE.Vector2(0.5, 0.5);
composer.addPass(godRayPass);

// --- Ensure all params are set from defaults before first render ---
// Set all uniforms and runtime values to match galaxyParams defaults

godRayPass.uniforms.exposure.value = galaxyParams.godRaysIntensity;
pointLight.intensity = galaxyParams.centralLightIntensity;

// If you have other uniforms for smoke, stars, etc., set them here as well:
galaxyGroup.children.forEach(child => {
    if (child.material && child.material.uniforms) {
        if (child.material.uniforms.uDensityFactor)
            child.material.uniforms.uDensityFactor.value = galaxyParams.smokeDensityFactor;
        if (child.material.uniforms.uDiffuseStrength)
            child.material.uniforms.uDiffuseStrength.value = galaxyParams.smokeDiffuseStrength;
        if (child.material.uniforms.uNoiseIntensity)
            child.material.uniforms.uNoiseIntensity.value = galaxyParams.smokeNoiseIntensity;
        if (child.material.uniforms.uSize)
            child.material.uniforms.uSize.value = galaxyParams.smokeParticleSize;
        if (child.material.uniforms.uColor1)
            child.material.uniforms.uColor1.value = galaxyParams.smokeColor1;
        if (child.material.uniforms.uColor2)
            child.material.uniforms.uColor2.value = galaxyParams.smokeColor2;
        if (child.material.uniforms.uCentralLightIntensity)
            child.material.uniforms.uCentralLightIntensity.value = galaxyParams.centralLightIntensity;
    }
});

// If you have any PointsMaterial for stars, set their size:
galaxyGroup.children.forEach(child => {
    if (child.isPoints && child.material && child.material.isPointsMaterial) {
        child.material.size = galaxyParams.starSize;
    }
});

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

// REMOVE old event listeners for star-size and core-radius (previously lines 600-616)
// document.getElementById("star-size").addEventListener("input", () => { ... }); // REMOVED
// document.getElementById("core-radius").addEventListener("input", () => { ... }); // REMOVED

document.addEventListener("DOMContentLoaded", function() {
    // Initialize time tracking
    lastFrameTime = performance.now();
    globalTime = 0;
    
    // Initial population of the galaxy
    regenerateGalaxy();

    const controlIds = [
        "num-stars", "star-size", "galactic-radius", "spiral-arms",
        "core-radius", "num-nebula-particles", "num-smoke-particles",
        "smoke-particle-size", "smoke-noise-intensity", "god-rays-intensity",
        "smoke-color1", "smoke-color2"
    ];

    // Initialize value displays
    initializeValueDisplays();

    controlIds.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener("input", function() {
                handleParameterChange(this.id);
            });
        }
    });
    
    const parametersButton = document.getElementById("parameters-button");
    if(parametersButton) parametersButton.addEventListener("click", toggleParametersMenu);

    // Effects parameters
    const godRaysIntensitySlider = document.getElementById('god-rays-intensity');
    const godRaysIntensityValue = document.getElementById('god-rays-intensity-value');
    godRaysIntensitySlider.addEventListener('input', (event) => {
        godRayPass.uniforms.exposure.value = parseFloat(event.target.value);
        godRaysIntensityValue.textContent = parseFloat(event.target.value).toFixed(2);
    });

    const centralLightIntensitySlider = document.getElementById('central-light-intensity');
    const centralLightIntensityValue = document.getElementById('central-light-intensity-value');
    centralLightIntensitySlider.addEventListener('input', (event) => {
        const newIntensity = parseFloat(event.target.value);
        pointLight.intensity = newIntensity;
        centralLightIntensityValue.textContent = newIntensity.toFixed(2);
        // Update smoke shader uniform if smoke exists
        if (galaxyGroup.children.find(child => child.material && child.material.uniforms && child.material.uniforms.uCentralLightIntensity)) {
            galaxyGroup.children.forEach(child => {
                if (child.material && child.material.uniforms && child.material.uniforms.uCentralLightIntensity) {
                    child.material.uniforms.uCentralLightIntensity.value = newIntensity;
                }
            });
        }
    });
    // Initialize central light slider and display to match pointLight intensity
    centralLightIntensitySlider.value = pointLight.intensity;
    centralLightIntensityValue.textContent = pointLight.intensity.toFixed(2);

    // Smoke parameters
    const smokeDensitySlider = document.getElementById('smoke-density-factor');
    const smokeDensityValue = document.getElementById('smoke-density-factor-value');
    smokeDensitySlider.value = galaxyParams.smokeDensityFactor;
    smokeDensityValue.textContent = galaxyParams.smokeDensityFactor;
    smokeDensitySlider.addEventListener('input', (event) => {
        galaxyParams.smokeDensityFactor = parseFloat(event.target.value);
        smokeDensityValue.textContent = event.target.value;
        // Update shader uniforms if smoke particles exist
        galaxyGroup.children.forEach(child => {
            if (child.material && child.material.uniforms && child.material.uniforms.uDensityFactor) {
                child.material.uniforms.uDensityFactor.value = galaxyParams.smokeDensityFactor;
            }
        });
    });

    const smokeDiffuseStrengthSlider = document.getElementById('smoke-diffuse-strength');
    const smokeDiffuseStrengthValue = document.getElementById('smoke-diffuse-strength-value');
    smokeDiffuseStrengthSlider.value = galaxyParams.smokeDiffuseStrength;
    smokeDiffuseStrengthValue.textContent = galaxyParams.smokeDiffuseStrength;
    smokeDiffuseStrengthSlider.addEventListener('input', (event) => {
        galaxyParams.smokeDiffuseStrength = parseFloat(event.target.value);
        smokeDiffuseStrengthValue.textContent = event.target.value;
        // Update shader uniforms if smoke particles exist
        galaxyGroup.children.forEach(child => {
            if (child.material && child.material.uniforms && child.material.uniforms.uDiffuseStrength) {
                child.material.uniforms.uDiffuseStrength.value = galaxyParams.smokeDiffuseStrength;
            }
        });
    });

    // Initial setup for sliders based on current values    document.getElementById("num-stars").value = galaxyParams.numStars;
    document.getElementById("star-size").value = galaxyParams.starSize;
    document.getElementById("galactic-radius").value = galaxyParams.galacticRadius;
    document.getElementById("spiral-arms").value = galaxyParams.spiralArms;
    document.getElementById("core-radius").value = galaxyParams.coreRadius;
    document.getElementById("num-nebula-particles").value = galaxyParams.numNebulaParticles;
    document.getElementById("num-smoke-particles").value = galaxyParams.numSmokeParticles;
    document.getElementById("smoke-particle-size").value = galaxyParams.smokeParticleSize;
    document.getElementById("smoke-noise-intensity").value = galaxyParams.smokeNoiseIntensity;
    document.getElementById("god-rays-intensity").value = galaxyParams.godRaysIntensity;

    // Set initial color values
    document.getElementById("smoke-color1").value = "#" + galaxyParams.smokeColor1.getHexString();
    document.getElementById("smoke-color2").value = "#" + galaxyParams.smokeColor2.getHexString();
});

animate();

// helper: random point inside ellipsoid to avoid cubic artifacts with Gaussian falloff
function randomPointInEllipsoid(rx, ry, rz) {
    // Get random direction using spherical coordinates
    const u = Math.random();
    const v = Math.random();
    const theta = 2.0 * Math.PI * u;
    const phi = Math.acos(2.0 * v - 1.0);
    const sinPhi = Math.sin(phi);
    
    // Direction vector
    const dir = new THREE.Vector3(
        sinPhi * Math.cos(theta),
        sinPhi * Math.sin(theta),
        Math.cos(phi)
    );
    
    // Gaussian magnitude using rx as the characteristic radius
    const magnitude = rx * Math.sqrt(-2 * Math.log(Math.max(1e-9, Math.random())));
    
    // Apply magnitude and ellipsoid scaling
    return new THREE.Vector3(
        dir.x * magnitude,
        dir.y * magnitude,
        dir.z * magnitude * (rz / rx)  // Scale z to maintain ellipsoid aspect ratio
    );
}