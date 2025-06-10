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
        
        // 3D Simplex Noise function (by Ashima Arts)
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
        
        // Fractal Brownian Motion
        float fbm(vec3 p) {
            float value = 0.0;
            float amplitude = 0.5;
            float frequency = 0.0;
            for (int i = 0; i < 6; i++) {
                value += amplitude * snoise(p);
                p *= 2.0;
                amplitude *= 0.5;
            }
            return value;
        }

        void main() {
            float dist = length(gl_PointCoord - vec2(0.5));
            if (dist > 0.5) {
                discard;
            }

            // Use world position and time to drive the 3D noise
            vec3 noisePos = vec3(vWorldPosition * 0.5);
            noisePos.z += uTime * 0.1;

            float noiseValue = fbm(noisePos);
            
            // Remap noise to create more contrast (clumpiness)
            noiseValue = smoothstep(0.3, 0.7, noiseValue);

            // Mix colors based on a different noise frequency
            float colorNoise = snoise(vWorldPosition * 0.2 + uTime * 0.05);
            vec3 mixedColor = mix(uColor1, uColor2, colorNoise);

            // Create a soft falloff at the particle edge
            float alpha = (1.0 - dist * 2.0) * noiseValue;

            gl_FragColor = vec4(mixedColor, alpha);
        }
    `
};

// --- NEW: Function to generate volumetric smoke in spiral arms ---
function generateVolumetricSmoke() {
    const geometry = new THREE.BufferGeometry();
    const positions = [];

    for (let i = 0; i < galaxyParams.numSmokeParticles; i++) {
        // This logic is borrowed from generateGalaxyStars to ensure placement in spiral arms
        const armAngle = (i % galaxyParams.spiralArms) * (2 * Math.PI / galaxyParams.spiralArms);
        const distanceFromCenter = Math.pow(Math.random(), 1.5) * galaxyParams.galacticRadius;
        
        // Add more spread to the arms for a diffuse look
        const armSpread = 2.0; 
        const angle = armAngle + armSpread * distanceFromCenter + (Math.random() - 0.5) * 2.5;

        // Make the smoke distribution less dense than stars
        if (distanceFromCenter < galaxyParams.coreRadius * 2.0 || distanceFromCenter > galaxyParams.galacticRadius * 0.9) {
            continue;
        }

        const x = distanceFromCenter * Math.cos(angle);
        const y = distanceFromCenter * Math.sin(angle);
        const z = (Math.random() - 0.5) * 0.4; // Thicker vertical distribution than stars

        positions.push(x, y, z);
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

    for (let i = 0; i < galaxyParams.numStars; i++) {
        const armAngle = (i % galaxyParams.spiralArms) * (2 * Math.PI / galaxyParams.spiralArms);
        const distanceFromCenter = Math.max(0.1, Math.pow(Math.random(), 2) * galaxyParams.galacticRadius);
        const angle = armAngle + 2.9 * distanceFromCenter + 1 * (Math.random() - 0.5);

        const x = distanceFromCenter * Math.cos(angle);
        const y = distanceFromCenter * Math.sin(angle);
        const z = 0.5 * (Math.random() - 0.5);

        if (distanceFromCenter < galaxyParams.coreRadius || distanceFromCenter > galaxyParams.galacticRadius) {
            continue;
        }

        positions.push(x, y, z);

        const starType = starTypes[Math.floor(Math.random() * starTypes.length)];
        const color = getRandomColorInRange(starType.colorRange);
        colors.push(color.r, color.g, color.b);
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

    for (let layer = 0; layer < 3; layer++) {
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        const angles = [];
        const radii = [];
        const scaleFactor = 1 + 0.3 * layer;

        for (let i = 0; i < galaxyParams.numNebulaParticles; i++) {
            const angle = Math.random() * 2 * Math.PI;
            const radius = Math.pow(Math.random(), 1.5) * galaxyParams.galacticRadius * scaleFactor;

            if (radius < galaxyParams.coreRadius || radius > galaxyParams.galacticRadius) {
                continue;
            }

            const x = radius * Math.cos(angle);
            const y = radius * Math.sin(angle);
            const z = 0.5 * (Math.random() - 0.5);

            positions.push(x, y, z);
            angles.push(angle);
            radii.push(radius);

            const noiseVal = 0.55 + 0.3 * fractalNoise({ x: x, y: y }, 5, 0.5, 2);
            const color = new THREE.Color().setHSL(noiseVal, 0.7, 0.5);
            colors.push(color.r, color.g, color.b);
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
            float rotationAngle = angle + time * rotationSpeed * (speed > 0.0 ? speed : 1.0); // Added a default for speed
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
galaxyGroup.add(generateGalaxyStars());
galaxyGroup.add(generateNebula());
galaxyGroup.add(generateVolumetricSmoke()); // Add smoke to the scene

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

function updateGalaxyParameters() {
    galaxyParams.numStars = parseInt(document.getElementById("num-stars").value);
    galaxyParams.starSize = parseFloat(document.getElementById("star-size").value);
    galaxyParams.galacticRadius = parseInt(document.getElementById("galactic-radius").value);
    galaxyParams.spiralArms = parseInt(document.getElementById("spiral-arms").value);
    galaxyParams.coreRadius = parseFloat(document.getElementById("core-radius").value);
    galaxyParams.numNebulaParticles = parseInt(document.getElementById("num-nebula-particles").value);

    // Update smoke parameters
    galaxyParams.numSmokeParticles = parseInt(document.getElementById("num-smoke-particles").value);
    galaxyParams.smokeParticleSize = parseFloat(document.getElementById("smoke-particle-size").value);
    galaxyParams.smokeColor1.set(document.getElementById("smoke-color1").value);
    galaxyParams.smokeColor2.set(document.getElementById("smoke-color2").value);


    galaxyGroup.children.forEach(child => {
        if (child.material && child.material.uniforms && child.material.uniforms.size) {
            child.material.uniforms.size.value = galaxyParams.starSize;
        }
        // Update smoke shader uniforms
        if (child.material && child.material.uniforms && child.material.uniforms.uSize) { // For smoke particle size
            child.material.uniforms.uSize.value = galaxyParams.smokeParticleSize;
        }
        if (child.material && child.material.uniforms && child.material.uniforms.uColor1) { // For smoke color 1
            child.material.uniforms.uColor1.value.copy(galaxyParams.smokeColor1);
        }
        if (child.material && child.material.uniforms && child.material.uniforms.uColor2) { // For smoke color 2
            child.material.uniforms.uColor2.value.copy(galaxyParams.smokeColor2);
        }
    });
    regenerateGalaxy();
}

function regenerateGalaxy() {
    // Clear all children from the group
    while(galaxyGroup.children.length > 0){ 
        const object = galaxyGroup.children[0];
        if (object.geometry) object.geometry.dispose();
        if (object.material) object.material.dispose();
        galaxyGroup.remove(object);
    }
    
    // Regenerate and add all components
    galaxyGroup.add(generateGalaxyStars());
    galaxyGroup.add(generateNebula());
    galaxyGroup.add(generateVolumetricSmoke());
}

function animate() {
    requestAnimationFrame(animate);
    galaxyGroup.rotation.z += controlParams.rotationSpeed;
    updateLensingEffect();
    
    const elapsedTime = performance.now() / 1000;

    galaxyGroup.children.forEach(child => {
        if (child.material && child.material.uniforms && child.material.uniforms.time) {
            child.material.uniforms.time.value += 0.01;
        }
        // --- Animate the smoke shader's time uniform ---
        if (child.material && child.material.uniforms && child.material.uniforms.uTime) {
            child.material.uniforms.uTime.value = elapsedTime;
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

// Assuming your HTML has controls for the new parameters
// Example: <input type="range" id="num-smoke-particles" ... >
// You would need to add event listeners for them similar to the others.

document.getElementById("star-size").addEventListener("input", () => {
    galaxyParams.starSize = parseFloat(document.getElementById("star-size").value);
    galaxyGroup.children.forEach(child => {
        if (child.isPoints && child.material.uniforms.size) { // Check for nebula
            child.material.uniforms.size.value = galaxyParams.starSize;
        }
        if(child.isPoints && child.material.size){ // Check for stars
             child.material.size = galaxyParams.starSize;
        }
    });
});

document.getElementById("core-radius").addEventListener("input", () => {
    galaxyParams.coreRadius = parseFloat(document.getElementById("core-radius").value);
    updateBlackHoleSize();
    updateLensingEffect();
    regenerateGalaxy();
});

document.addEventListener("DOMContentLoaded", function() {
    document.getElementById("num-stars").addEventListener("input", updateGalaxyParameters);
    document.getElementById("star-size").addEventListener("input", updateGalaxyParameters);
    document.getElementById("galactic-radius").addEventListener("input", updateGalaxyParameters);
    document.getElementById("spiral-arms").addEventListener("input", updateGalaxyParameters);
    document.getElementById("core-radius").addEventListener("input", updateGalaxyParameters);
    document.getElementById("num-nebula-particles").addEventListener("input", updateGalaxyParameters);
    
    // Add event listeners for new smoke controls
    document.getElementById("num-smoke-particles").addEventListener("input", updateGalaxyParameters);
    document.getElementById("smoke-particle-size").addEventListener("input", updateGalaxyParameters);
    document.getElementById("smoke-color1").addEventListener("input", updateGalaxyParameters);
    document.getElementById("smoke-color2").addEventListener("input", updateGalaxyParameters);
    

    const parametersButton = document.getElementById("parameters-button");
    if(parametersButton) parametersButton.addEventListener("click", toggleParametersMenu);
});

animate();