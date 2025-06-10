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

camera.position.set(0.28, -3.04, 0.78);
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
    numStars: 2e5,
    starSize: 0.01,
    galacticRadius: 15,
    spiralArms: 2,
    coreRadius: 0.5,
    numNebulaParticles: 5e4,
    // --- New parameters for volumetric smoke ---
    numSmokeParticles: 3000, // Initial value, will be updated by control
    smokeParticleSize: 0.8, // Initial value, will be updated by control
    smokeColor1: new THREE.Color(0x101025), // Initial value, will be updated by control
    smokeColor2: new THREE.Color(0x251510)  // Initial value, will be updated by control
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

function generateClusterCenters(numClusters, galacticRadius, spiralArms) {
    const clusters = [];
    
    // Generate spiral arm clusters
    for (let arm = 0; arm < spiralArms; arm++) {
        const armAngle = (arm / spiralArms) * 2 * Math.PI;
        const clustersPerArm = Math.floor(numClusters * 0.7 / spiralArms); // 70% in spiral arms
        
        for (let i = 0; i < clustersPerArm; i++) {
            const t = (i + 1) / (clustersPerArm + 1); // Parameter along arm
            const radius = Math.pow(t, 0.8) * galacticRadius * 0.9; // Non-linear distribution
            const angle = armAngle + 3.0 * radius / galacticRadius + (Math.random() - 0.5) * 0.8;
            
            const x = radius * Math.cos(angle);
            const y = radius * Math.sin(angle);
            const z = (Math.random() - 0.5) * 0.3 * Math.pow(1 - t, 0.5); // Thinner at edges
            
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
    
    // Generate halo/disc clusters
    const haloCount = numClusters - clusters.length;
    for (let i = 0; i < haloCount; i++) {
        const angle = Math.random() * 2 * Math.PI;
        const radius = Math.pow(Math.random(), 0.6) * galacticRadius;
        const x = radius * Math.cos(angle);
        const y = radius * Math.sin(angle);
        const z = (Math.random() - 0.5) * 1.5 * Math.pow(1 - radius/galacticRadius, 0.3);
        
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

// --- NEW: Volumetric Smoke Shader ---
const volumetricSmokeShader = {
    uniforms: {
        uTime: { value: 0.0 },
        uColor1: { value: galaxyParams.smokeColor1 },
        uColor2: { value: galaxyParams.smokeColor2 },
        uSize: { value: galaxyParams.smokeParticleSize }
    },
    vertexShader: `
        uniform float uSize;
        uniform float uTime;
        
        varying vec3 vWorldPosition;

        void main() {
            vec4 modelPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = modelPosition.xyz;

            vec4 viewPosition = viewMatrix * modelPosition;
            vec4 projectedPosition = projectionMatrix * viewPosition;

            gl_Position = projectedPosition;
            gl_PointSize = uSize * (300.0 / -viewPosition.z);
        }
    `,
    fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor1;
        uniform vec3 uColor2;

        varying vec3 vWorldPosition;
        
        // Enhanced 3D Simplex Noise function
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v) {
            const vec2 C = vec2(1.0/6.0, 1.0/3.0);
            const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
            vec3 i  = floor(v + dot(v, C.yyy));
            vec3 x0 = v - i + dot(i, C.xxx);
            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min(g.xyz, l.zxy);
            vec3 i2 = max(g.xyz, l.zxy);
            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy;
            vec3 x3 = x0 - D.yyy;
            i = mod289(i);
            vec4 p = permute(permute(permute(
                i.z + vec4(0.0, i1.z, i2.z, 1.0))
                + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                + i.x + vec4(0.0, i1.x, i2.x, 1.0));
            float n_ = 0.142857142857;
            vec3 ns = n_ * D.wyz - D.xzx;
            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_);
            vec4 x = x_ * ns.x + ns.yyyy;
            vec4 y = y_ * ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);
            vec4 b0 = vec4(x.xy, y.xy);
            vec4 b1 = vec4(x.zw, y.zw);
            vec4 s0 = floor(b0)*2.0 + 1.0;
            vec4 s1 = floor(b1)*2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));
            vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
            vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
            vec3 p0 = vec3(a0.xy,h.x);
            vec3 p1 = vec3(a0.zw,h.y);
            vec3 p2 = vec3(a1.xy,h.z);
            vec3 p3 = vec3(a1.zw,h.w);
            vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
            p0 *= norm.x;
            p1 *= norm.y;
            p2 *= norm.z;
            p3 *= norm.w;
            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m;
            return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }
        
        // Enhanced Multi-Scale FBM with Domain Warping
        float fbm(vec3 p) {
            // First pass - base noise
            float value = 0.0;
            float amplitude = 0.5;
            vec3 q = p;
            for (int i = 0; i < 4; i++) {
                value += amplitude * snoise(q);
                q *= 2.0;
                amplitude *= 0.5;
            }
            
            // Domain warping for more complex structures
            vec3 warp = vec3(
                snoise(p + vec3(1.7, 9.2, 4.3)),
                snoise(p + vec3(8.3, 2.8, 7.1)),
                snoise(p + vec3(3.1, 6.7, 1.9))
            ) * 0.3;
            
            // Second pass with warped domain
            vec3 r = p + warp;
            amplitude = 0.3;
            for (int i = 0; i < 3; i++) {
                value += amplitude * abs(snoise(r));
                r *= 2.0;
                amplitude *= 0.5;
            }
            
            return value;
        }
        
        // Layered 3D noise for volumetric detail
        float volumetricDensity(vec3 p, float time) {
            // Use modulo to prevent floating point precision issues at large time values
            float wrappedTime = mod(time, 1000.0);
            
            // Large scale structure
            float density1 = fbm(p * 0.8 + vec3(wrappedTime * 0.05, 0.0, wrappedTime * 0.03));
            
            // Medium scale detail
            float density2 = fbm(p * 2.1 + vec3(wrappedTime * 0.08, wrappedTime * 0.06, 0.0)) * 0.6;
            
            // Fine scale wispy details
            float density3 = snoise(p * 8.0 + vec3(wrappedTime * 0.15, wrappedTime * 0.12, wrappedTime * 0.1)) * 0.3;
            
            // Combine with different weights
            float combined = density1 + density2 + density3;
            
            // Apply additional shaping
            combined *= 1.0 - smoothstep(0.0, 0.5, length(p.xy) * 0.1); // Fade at edges
            
            return combined;
        }

        void main() {
            float dist = length(gl_PointCoord - vec2(0.5));
            if (dist > 0.5) {
                discard;
            }

            // Enhanced 3D volumetric calculation with wrapped time
            vec3 worldPos = vWorldPosition;
            float time = mod(uTime, 1000.0); // Wrap time to prevent precision issues
            
            // Calculate volumetric density with multiple octaves and domain warping
            float density = volumetricDensity(worldPos * 0.3, time);
            
            // Additional turbulence layer with wrapped time
            vec3 turbulence = vec3(
                snoise(worldPos * 1.5 + time * 0.1),
                snoise(worldPos * 1.8 + time * 0.12),
                snoise(worldPos * 2.1 + time * 0.08)
            ) * 0.2;
            
            float finalDensity = volumetricDensity(worldPos * 0.3 + turbulence, time);
            
            // Remap density for better contrast
            finalDensity = smoothstep(0.2, 0.8, finalDensity);
            
            // Color mixing with enhanced variation and wrapped time
            float colorNoise = snoise(worldPos * 0.5 + time * 0.03);
            colorNoise = colorNoise * 0.5 + 0.5; // Remap to [0,1]
            
            // Add temperature variation with wrapped time
            float temperature = snoise(worldPos * 0.8 + time * 0.02) * 0.3 + 0.7;
            vec3 baseColor = mix(uColor1, uColor2, colorNoise);
            vec3 finalColor = baseColor * temperature;
            
            // Enhanced particle edge with soft falloff
            float edgeFalloff = 1.0 - smoothstep(0.2, 0.5, dist);
            float alpha = edgeFalloff * finalDensity * 0.8;
            
            // Add subtle glow effect
            alpha += edgeFalloff * 0.1;

            gl_FragColor = vec4(finalColor, alpha);
        }
    `
};

// --- NEW: Function to generate volumetric smoke with clustering ---
function generateVolumetricSmoke() {
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    
    // Generate cluster centers for smoke binding
    const smokeClusters = generateClusterCenters(25, galaxyParams.galacticRadius, galaxyParams.spiralArms);
    
    let attempts = 0;
    const maxAttempts = galaxyParams.numSmokeParticles * 3;

    while (positions.length / 3 < galaxyParams.numSmokeParticles && attempts < maxAttempts) {
        attempts++;
        
        // Choose generation method based on probability
        let x, y, z, distanceFromCenter;
        
        if (Math.random() < 0.8) {
            // 80% cluster-based generation
            const cluster = smokeClusters[Math.floor(Math.random() * smokeClusters.length)];
            const clusterOffset = new THREE.Vector3(
                (Math.random() - 0.5) * cluster.radius * 2,
                (Math.random() - 0.5) * cluster.radius * 2,
                (Math.random() - 0.5) * cluster.radius * 0.8
            );
            
            const position = cluster.center.clone().add(clusterOffset);
            x = position.x;
            y = position.y;
            z = position.z;
            distanceFromCenter = Math.sqrt(x * x + y * y);
        } else {
            // 20% spiral arm generation
            const armAngle = (Math.random() * galaxyParams.spiralArms) * (2 * Math.PI / galaxyParams.spiralArms);
            distanceFromCenter = Math.pow(Math.random(), 1.3) * galaxyParams.galacticRadius;
            const angle = armAngle + 2.8 * distanceFromCenter / galaxyParams.galacticRadius + (Math.random() - 0.5) * 1.5;
            
            x = distanceFromCenter * Math.cos(angle);
            y = distanceFromCenter * Math.sin(angle);
            
            const normalizedDistance = distanceFromCenter / galaxyParams.galacticRadius;
            const thicknessMultiplier = Math.pow(Math.max(0, 1.0 - normalizedDistance), 0.4);
            z = (Math.random() - 0.5) * 1.2 * thicknessMultiplier;
        }
        
        if (distanceFromCenter < galaxyParams.coreRadius * 1.2 || distanceFromCenter > galaxyParams.galacticRadius * 0.98) {
            continue;
        }
        
        // Enhanced cluster influence check
        const position = new THREE.Vector3(x, y, z);
        const clusterInfluence = getClusterInfluence(position, smokeClusters);
        
        // Multi-layer noise for realistic distribution
        const noise1 = fractalNoise3D(position, 4, 0.08);
        const noise2 = fractalNoise3D(position, 6, 0.15) * 0.7;
        const combinedNoise = (noise1 + noise2) / 1.7;
        
        // Combined probability based on cluster influence and noise
        const probability = Math.min(1.0, clusterInfluence * 0.7 + combinedNoise * 0.3);
        
        if (Math.random() < probability * 0.85) { // 85% acceptance rate for good candidates
            positions.push(x, y, z);
        }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    
    const material = new THREE.ShaderMaterial({
        uniforms: volumetricSmokeShader.uniforms,
        vertexShader: volumetricSmokeShader.vertexShader,
        fragmentShader: volumetricSmokeShader.fragmentShader,
        transparent: true,
        blending: THREE.NormalBlending, // Normal blending works best for dark smoke
        depthWrite: false, // Essential for correct layering of transparent objects
    });

    return new THREE.Points(geometry, material);
}


function generateGalaxyStars() {
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    
    // Generate cluster centers for realistic star distribution
    const starClusters = generateClusterCenters(35, galaxyParams.galacticRadius, galaxyParams.spiralArms);
    
    let attempts = 0;
    const maxAttempts = galaxyParams.numStars * 2;

    while (positions.length / 3 < galaxyParams.numStars && attempts < maxAttempts) {
        attempts++;
        
        let x, y, z, distanceFromCenter;
        
        if (Math.random() < 0.75) {
            // 75% cluster-based generation
            const cluster = starClusters[Math.floor(Math.random() * starClusters.length)];
            const clusterOffset = new THREE.Vector3(
                (Math.random() - 0.5) * cluster.radius * 1.5,
                (Math.random() - 0.5) * cluster.radius * 1.5,
                (Math.random() - 0.5) * cluster.radius * 0.3
            );
            
            const position = cluster.center.clone().add(clusterOffset);
            x = position.x;
            y = position.y;
            z = position.z;
            distanceFromCenter = Math.sqrt(x * x + y * y);
        } else {
            // 25% spiral arm generation
            const armAngle = (Math.random() * galaxyParams.spiralArms) * (2 * Math.PI / galaxyParams.spiralArms);
            distanceFromCenter = Math.max(0.1, Math.pow(Math.random(), 1.8) * galaxyParams.galacticRadius);
            const angle = armAngle + 3.2 * distanceFromCenter / galaxyParams.galacticRadius + (Math.random() - 0.5) * 0.8;
            
            x = distanceFromCenter * Math.cos(angle);
            y = distanceFromCenter * Math.sin(angle);
            
            const normalizedDistance = distanceFromCenter / galaxyParams.galacticRadius;
            const thicknessMultiplier = Math.pow(Math.max(0, 1.0 - normalizedDistance), 0.9);
            z = (Math.random() - 0.5) * 0.4 * thicknessMultiplier;
        }

        if (distanceFromCenter < galaxyParams.coreRadius || distanceFromCenter > galaxyParams.galacticRadius) {
            continue;
        }

        // Enhanced cluster influence and noise check
        const position = new THREE.Vector3(x, y, z);
        const clusterInfluence = getClusterInfluence(position, starClusters);
        const noise = fractalNoise3D(position, 5, 0.12);
        
        const probability = Math.min(1.0, clusterInfluence * 0.8 + noise * 0.2);
        
        if (Math.random() < probability * 0.9) {
            positions.push(x, y, z);

            const starType = starTypes[Math.floor(Math.random() * starTypes.length)];
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
    
    // Generate cluster centers for nebula
    const nebulaClusters = generateClusterCenters(20, galaxyParams.galacticRadius, galaxyParams.spiralArms);

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
                const clusterOffset = new THREE.Vector3(
                    (Math.random() - 0.5) * cluster.radius * 2.5,
                    (Math.random() - 0.5) * cluster.radius * 2.5,
                    (Math.random() - 0.5) * cluster.radius * 1.2
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

// --- Update galaxy generation to include smoke ---
const blackHole = new THREE.Mesh(
    new THREE.SphereGeometry(galaxyParams.coreRadius, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
);
scene.add(blackHole);

const pointLight = new THREE.PointLight(0xffffff, 1, 100);
pointLight.position.set(0, 0, 0);
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
composer.addPass(lensingPass);

const GodRayShader = {
    uniforms: {
        tDiffuse: { value: null },
        lightPosition: { value: new THREE.Vector2(0.5, 0.5) },
        exposure: { value: 0.85 },
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

            vec3 resultColor = mix(originalColor.rgb, shadowEffect.rgb, 0.5);
            resultColor += originalColor.rgb * 0.3;

            gl_FragColor = vec4(resultColor, originalColor.a) * exposure;
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
    blackHole.geometry.dispose();
    blackHole.geometry = new THREE.SphereGeometry(galaxyParams.coreRadius, 32, 32);
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
    
    // Regenerate and add all components
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
            applySmokeSizeChange();
            break;
        case "smoke-color1":
            galaxyParams.smokeColor1.set(value);
            // No explicit call to applySmokeSizeChange needed for color, as uniform value is the object itself.
            break;
        case "smoke-color2":
            galaxyParams.smokeColor2.set(value);
            // Same as above.
            break;
    }
}

function animate() {
    requestAnimationFrame(animate);
    
    // Calculate smooth time progression
    const currentTime = performance.now();
    const deltaTime = (currentTime - lastFrameTime) / 1000; // Convert to seconds
    lastFrameTime = currentTime;
    
    // Accumulate global time for continuous animation
    globalTime += deltaTime;
    
    // Continuous galaxy rotation without resets
    galaxyGroup.rotation.z += controlParams.rotationSpeed;
    
    updateLensingEffect();

    galaxyGroup.children.forEach(child => {
        if (child.material && child.material.uniforms && child.material.uniforms.time) {
            // Use continuous time accumulation instead of fixed increment
            child.material.uniforms.time.value = globalTime;
        }
        // --- Animate the smoke shader's time uniform with continuous time ---
        if (child.material && child.material.uniforms && child.material.uniforms.uTime) {
            child.material.uniforms.uTime.value = globalTime;
        }
    });

    composer.render();
}

godRayPass.uniforms.lightPosition.value = new THREE.Vector2(0.5, 0.5);
composer.addPass(godRayPass);

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
        "smoke-particle-size", "smoke-color1", "smoke-color2"
    ];

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
});

animate();