// densityWorker.js

// --- START: Noise functions (snoiseJS, fbmJS) ---
// Helper to mimic GLSL mod(x,y)
function mod(x, y) {
    return x - y * Math.floor(x / y);
}

// 3D Simplex Noise functions (ported from GLSL)
function mod289_v3(x_vec) {
    return x_vec.clone().sub(x_vec.clone().divideScalar(289.0).floor().multiplyScalar(289.0));
}

function mod289_v4(x_vec) {
    return x_vec.clone().sub(x_vec.clone().divideScalar(289.0).floor().multiplyScalar(289.0));
}

function permute_v4(x_in_vec) {
    let x_vec = x_in_vec.clone();
    let part1 = mod(x_vec.multiplyScalar(34.0).addScalar(1.0).multiply(x_vec), 289.0);
    return mod289_v4(part1);
}

function taylorInvSqrt_v4(r_vec) {
    return new THREE.Vector4(1.79284291400159, 1.79284291400159, 1.79284291400159, 1.79284291400159)
        .sub(r_vec.clone().multiplyScalar(0.85373472095314));
}

function snoiseJS(v_in_vec3) {
    // Simple placeholder noise function since the full implementation is complex
    // and THREE.js Vector operations aren't fully available in worker
    const x = v_in_vec3.x;
    const y = v_in_vec3.y; 
    const z = v_in_vec3.z;
    
    // Simple 3D noise approximation
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    return (n - Math.floor(n)) * 2.0 - 1.0; // Return value in [-1, 1]
}


function fbmJS(p_vec3, octaves = 6, persistence = 0.5, lacunarity = 2.0) {
    let total = 0;
    let frequency = 1.0;
    let amplitude = 1.0;
    let maxValue = 0;
    let p = p_vec3.clone();

    for (let i = 0; i < octaves; i++) {
        total += snoiseJS(p.clone().multiplyScalar(frequency)) * amplitude;
        maxValue += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
    }
    return total / maxValue;
}
// --- END: Noise functions ---

// --- START: Clustering functions ---
// These would be simplified versions or require THREE.Vector3 if not shimmed
function generateClusterCenters(numClusters, galacticRadius, spiralArms, armOffsetStrength = 2.0, heightMax = 0.5) {
    const centers = [];
    const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // For phyllotaxis distribution

    for (let i = 0; i < numClusters; i++) {
        // Phyllotaxis for initial distribution in XY plane
        const r = Math.sqrt(i / numClusters) * galacticRadius; // Spread points out
        const theta_phyllotaxis = i * GOLDEN_ANGLE;

        // Spiral arm perturbation
        const armAngle = Math.atan2(Math.sin(theta_phyllotaxis), Math.cos(theta_phyllotaxis)); // Base angle
        const armPerturbation = Math.floor(spiralArms * (armAngle + r * 0.1) / (2 * Math.PI)); // Determine which arm segment
        const angleOffset = armPerturbation * (2 * Math.PI / spiralArms);
        const distanceToArmCenter = Math.abs(mod(armAngle - angleOffset + Math.PI, 2 * Math.PI) - Math.PI);
        const spiralInfluence = Math.exp(-distanceToArmCenter * armOffsetStrength); // Stronger influence near arm center

        const theta_spiral = theta_phyllotaxis + spiralInfluence * Math.sin(r * 0.5) * 0.5; // Apply spiral perturbation

        const x = r * Math.cos(theta_spiral);
        const y = r * Math.sin(theta_spiral);

        // Add some vertical displacement, more concentrated towards the center
        const z_base = (Math.random() - 0.5) * 2 * heightMax;
        const radialFalloff = Math.exp(- (r / galacticRadius) * (r / galacticRadius) * 2.0); // Stronger falloff for z
        const z = z_base * radialFalloff * (0.5 + Math.random() * 0.5); // More concentrated z

        centers.push({ x, y, z, influenceRadius: galacticRadius / numClusters * (5 + Math.random() * 5) });
    }
    return centers;
}

function getClusterInfluence(position, clusters) {
    let totalInfluence = 0;
    if (!clusters || clusters.length === 0) return 0.1; // Default low influence if no clusters

    for (const cluster of clusters) {
        const distSq = (position.x - cluster.x)**2 + (position.y - cluster.y)**2 + (position.z - cluster.z)**2;
        const influenceRadiusSq = cluster.influenceRadius**2;
        if (distSq < influenceRadiusSq) {
            totalInfluence += (1.0 - Math.sqrt(distSq) / cluster.influenceRadius);
        }
    }
    return Math.min(totalInfluence, 1.0); // Clamp influence
}
// --- END: Clustering functions ---

// --- START: Exponential Disc Profile ---
function getExponentialDiscDensity(x, y, z, galaxyRadius, galaxyHeightScale) {
    const r = Math.sqrt(x*x + y*y);
    const verticalDensity = Math.exp(-Math.abs(z) / galaxyHeightScale);
    const radialDensity = Math.exp(-r / (galaxyRadius * 0.5)); // Falloff more towards edge
    return verticalDensity * radialDensity;
}
// --- END: Exponential Disc Profile ---


self.onmessage = function(e) {
    const { textureSize, galaxyParams, noiseScale, clusterCenters } = e.data;
    const { galacticRadius } = galaxyParams; // Assuming galacticRadius is part of galaxyParams

    const data = new Uint8Array(textureSize * textureSize * textureSize); // Use Uint8Array for better compatibility
    
    // Shim for THREE.Vector3 if not available
    const Vec3 = (x,y,z) => ({x,y,z, clone: function(){ return Vec3(this.x,this.y,this.z)}, multiplyScalar: function(s){this.x*=s;this.y*=s;this.z*=s; return this;}, addScalar: function(s){this.x+=s;this.y+=s;this.z+=s; return this;}, sub: function(v){this.x-=v.x;this.y-=v.y;this.z-=v.z; return this;}, dot: function(v){return this.x*v.x+this.y*v.y+this.z*v.z;}, divideScalar: function(s){this.x/=s;this.y/=s;this.z/=s; return this;}, floor: function(){this.x=Math.floor(this.x); this.y=Math.floor(this.y); this.z=Math.floor(this.z); return this;}});

    // Pre-normalize coordinates to be [-0.5, 0.5] for texture lookup mapping to world space later
    // Or map world coordinates to texture voxel coordinates
    const halfSize = textureSize / 2;
    const worldToVoxelScale = textureSize / (galacticRadius * 2); // Map world units to voxel units

    for (let z = 0; z < textureSize; z++) {
        for (let y = 0; y < textureSize; y++) {
            for (let x = 0; x < textureSize; x++) {
                const index = (x + y * textureSize + z * textureSize * textureSize);

                // Convert voxel coordinates to world-like coordinates for noise and profile
                // Assuming the 3D texture covers a cubic region of space, e.g., [-galaxyRadius, +galaxyRadius]
                const worldX = (x - halfSize) / halfSize * galacticRadius;
                const worldY = (y - halfSize) / halfSize * galacticRadius;
                const worldZ = (z - halfSize) / halfSize * (galacticRadius * 0.25); // Flatter distribution for Z

                const posVec = Vec3(worldX, worldY, worldZ);
                
                // 1. FBM Noise
                let noiseVal = fbmJS(posVec.clone().multiplyScalar(noiseScale || 0.1), 4, 0.5, 2.0); // (pos * scale, octaves, persistence, lacunarity)
                noiseVal = (noiseVal + 1.0) / 2.0; // Normalize to [0, 1]

                // 2. Cluster Influence
                const clusterInfluence = getClusterInfluence(posVec, clusterCenters);

                // 3. Exponential Disc Profile
                const discDensity = getExponentialDiscDensity(worldX, worldY, worldZ, galacticRadius, galacticRadius * 0.1); // galaxyHeightScale

                // Combine them: Modulate FBM by disc profile and cluster influence
                let density = noiseVal * discDensity * (0.2 + clusterInfluence * 0.8); // Ensure some base density
                density = Math.max(0, Math.min(density, 1.0)); // Clamp

                data[index] = Math.floor(density * 255); // Convert to 8-bit value
            }
        }
    }
    self.postMessage({ textureData: data.buffer }, [data.buffer]);
};

// Minimal THREE.Vector shim for worker if THREE is not imported
if (typeof THREE === 'undefined') {
    self.THREE = {
        Vector2: function(x,y) { 
            this.x=x||0; this.y=y||0; 
            this.clone = function(){ return new self.THREE.Vector2(this.x,this.y)};
            this.multiplyScalar = function(s){this.x*=s;this.y*=s; return this;};
            this.addScalar = function(s){this.x+=s;this.y+=s; return this;};
            this.sub = function(v){this.x-=v.x;this.y-=v.y; return this;};
            this.add = function(v){this.x+=v.x;this.y+=v.y; return this;};
            this.dot = function(v){return this.x*v.x+this.y*v.y;};
        },
        Vector3: function(x,y,z) { 
            this.x=x||0; this.y=y||0; this.z=z||0; 
            this.clone = function(){ return new self.THREE.Vector3(this.x,this.y,this.z)}; 
            this.multiplyScalar = function(s){this.x*=s;this.y*=s;this.z*=s; return this;}; 
            this.addScalar = function(s){this.x+=s;this.y+=s;this.z+=s; return this;}; 
            this.subScalar = function(s){this.x-=s;this.y-=s;this.z-=s; return this;}; 
            this.sub = function(v){this.x-=v.x;this.y-=v.y;this.z-=v.z; return this;}; 
            this.add = function(v){this.x+=v.x;this.y+=v.y;this.z+=v.z; return this;}; 
            this.dot = function(v){return this.x*v.x+this.y*v.y+this.z*v.z;}; 
            this.divideScalar = function(s){this.x/=s;this.y/=s;this.z/=s; return this;}; 
            this.floor = function(){this.x=Math.floor(this.x); this.y=Math.floor(this.y); this.z=Math.floor(this.z); return this;}; 
            this.distanceTo = function(v){ var dx=this.x-v.x, dy=this.y-v.y, dz=this.z-v.z; return Math.sqrt(dx*dx+dy*dy+dz*dz); };
            this.setScalar = function(s){this.x=s;this.y=s;this.z=s; return this;};
            this.multiply = function(v){this.x*=v.x;this.y*=v.y;this.z*=v.z; return this;};
        },
        Vector4: function(x,y,z,w) { 
            this.x=x||0; this.y=y||0; this.z=z||0; this.w=w||0; 
            this.clone = function(){ return new self.THREE.Vector4(this.x,this.y,this.z,this.w)}; 
            this.multiplyScalar = function(s){this.x*=s;this.y*=s;this.z*=s;this.w*=s; return this;}; 
            this.sub = function(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;this.w-=v.w; return this;}; 
            this.add = function(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;this.w+=v.w; return this;};
            this.addScalar = function(s){this.x+=s;this.y+=s;this.z+=s;this.w+=s; return this;};
            this.setScalar = function(s){this.x=s;this.y=s;this.z=s;this.w=s; return this;};
            this.multiply = function(v){this.x*=v.x;this.y*=v.y;this.z*=v.z;this.w*=v.w; return this;};
        }
    };
}
