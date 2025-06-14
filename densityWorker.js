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
    const { galacticRadius, verticalScaleHeight, discScaleLength, spiralArms, spiralPitchAngle } = galaxyParams;

    // Use Float32Array for RG16F format (2 components per voxel)
    const dataSize = textureSize * textureSize * textureSize * 2; // 2 components (RG)
    const data = new Float32Array(dataSize);
    
    // Shim for THREE.Vector3 if not available
    const Vec3 = (x,y,z) => ({
        x,y,z, 
        clone: function(){ return Vec3(this.x,this.y,this.z)}, 
        multiplyScalar: function(s){this.x*=s;this.y*=s;this.z*=s; return this;}, 
        addScalar: function(s){this.x+=s;this.y+=s;this.z+=s; return this;}, 
        sub: function(v){this.x-=v.x;this.y-=v.y;this.z-=v.z; return this;}, 
        dot: function(v){return this.x*v.x+this.y*v.y+this.z*v.z;}, 
        divideScalar: function(s){this.x/=s;this.y/=s;this.z/=s; return this;}, 
        floor: function(){this.x=Math.floor(this.x); this.y=Math.floor(this.y); this.z=Math.floor(this.z); return this;}
    });

    const halfSize = textureSize / 2;

    for (let z = 0; z < textureSize; z++) {
        for (let y = 0; y < textureSize; y++) {
            for (let x = 0; x < textureSize; x++) {
                const index = (x + y * textureSize + z * textureSize * textureSize) * 2; // 2 components

                // Convert voxel coordinates to world coordinates
                const worldX = (x - halfSize) / halfSize * galacticRadius;
                const worldY = (y - halfSize) / halfSize * galacticRadius;
                const worldZ = (z - halfSize) / halfSize * (galacticRadius * 0.5); // Match box bounds

                const posVec = Vec3(worldX, worldY, worldZ);
                const r = Math.sqrt(worldX*worldX + worldY*worldY);
                
                // 1. Multi-octave FBM Noise (6 octaves for more detail)
                let noiseVal = fbmJS(posVec.clone().multiplyScalar(noiseScale || 0.08), 6, 0.5, 2.0);
                noiseVal = (noiseVal + 1.0) / 2.0; // Normalize to [0, 1]

                // Add second layer of finer noise for detail
                let detailNoise = fbmJS(posVec.clone().multiplyScalar(noiseScale * 3.0), 4, 0.4, 2.2);
                detailNoise = (detailNoise + 1.0) / 2.0;
                noiseVal = noiseVal * 0.7 + detailNoise * 0.3;

                // 2. Spiral arm enhancement
                let spiralDensity = 1.0;
                if (r > galacticRadius * 0.1) { // Don't apply in core
                    const theta = Math.atan2(worldY, worldX);
                    const pitchRad = (spiralPitchAngle || 13.0) * Math.PI / 180.0;
                    
                    for (let arm = 0; arm < (spiralArms || 2); arm++) {
                        const armOffset = (arm * 2.0 * Math.PI) / (spiralArms || 2);
                        const spiralTheta = theta - armOffset - r * Math.tan(pitchRad);
                        const armDist = Math.abs(Math.sin(spiralTheta * (spiralArms || 2) / 2.0));
                        spiralDensity += Math.exp(-armDist * 8.0) * 0.8;
                    }
                    spiralDensity = Math.min(spiralDensity, 2.5);
                }

                // 3. Cluster Influence
                const clusterInfluence = getClusterInfluence(posVec, clusterCenters);

                // 4. Exponential Disc Profile (more realistic)
                const verticalDensity = Math.exp(-Math.abs(worldZ) / (verticalScaleHeight || galacticRadius * 0.06));
                const radialDensity = Math.exp(-r / (discScaleLength || galacticRadius * 0.35));
                const discDensity = verticalDensity * radialDensity;

                // 5. Central bulge enhancement
                const bulgeFactor = r < galacticRadius * 0.2 ? 
                    Math.exp(-r / (galacticRadius * 0.08)) * 1.5 : 1.0;

                // Combine all factors with enhanced multipliers for visibility
                let finalDensity = noiseVal * discDensity * spiralDensity * bulgeFactor * (0.5 + clusterInfluence * 1.5) * 3.0; // Increased multiplier
                
                // Add temperature/color variation (R = density, G = temperature)
                let temperature = 0.5 + noiseVal * 0.3 + clusterInfluence * 0.2;
                temperature *= (1.0 + spiralDensity * 0.2); // Hotter in spiral arms
                
                // Clamp values for HDR storage
                finalDensity = Math.max(0, Math.min(finalDensity * 2.0, 8.0)); // Increased max HDR value
                temperature = Math.max(0, Math.min(temperature, 2.0));

                data[index] = finalDensity;     // R channel - density
                data[index + 1] = temperature;  // G channel - temperature/color
            }
        }
    }
    
    self.postMessage({ textureData: data.buffer }, [data.buffer]);
    
    // Debug: Log some statistics about the generated data
    let nonZeroCount = 0;
    let maxDensity = 0;
    let totalDensity = 0;
    for (let i = 0; i < data.length; i += 2) {
        const density = data[i];
        if (density > 0.01) nonZeroCount++;
        if (density > maxDensity) maxDensity = density;
        totalDensity += density;
    }
    const avgDensity = totalDensity / (data.length / 2);
    console.log(`Density Worker: Generated ${data.length/2} voxels, ${nonZeroCount} non-zero, max: ${maxDensity.toFixed(3)}, avg: ${avgDensity.toFixed(3)}`);
    console.log(`World coordinate range: X[${-galacticRadius},${galacticRadius}] Y[${-galacticRadius},${galacticRadius}] Z[${-galacticRadius*0.5},${galacticRadius*0.5}]`);
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
