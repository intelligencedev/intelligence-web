---
title: "Orbits GLSL Shader"
description: "GLSL shader for Keplerian orbital mechanics"
---

# Orbits GLSL Shader

This GLSL shader implements Keplerian orbital mechanics for galaxy simulation.

```glsl
// Keplerian orbital mechanics for galaxy simulation
// GM is the gravitational parameter (mass × gravitational constant)
// For a galaxy with ~10^11 solar masses: GM ≈ 4.3e-6 kpc³ s⁻²

#define PI 3.14159265359

// Keplerian circular velocity; GM is passed as uniform
uniform float GM;

float angularVel(float r) {
    // Add safety check to prevent division by zero
    if (r < 0.01) r = 0.01;
    return sqrt(GM / pow(r, 3.0));
}

// Alternative formulation for orbital period
float orbitalPeriod(float r) {
    return 2.0 * PI * sqrt(pow(r, 3.0) / GM);
}

// Angular velocity from period
float angularVelFromPeriod(float r) {
    return 2.0 * PI / orbitalPeriod(r);
}

// Velocity magnitude at radius r (for reference)
float orbitalSpeed(float r) {
    return sqrt(GM / r);
}
```</content>
<parameter name="filePath">/Users/art/Documents/code/intelligence-web/content/visualizations/orbits/_index.md
