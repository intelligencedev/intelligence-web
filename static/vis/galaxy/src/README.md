# Galaxy Visualization Modules

This folder contains the modularized WebGL galaxy renderer. The entry point is `app.js`.

## Layout
- `app.js`: Main bootstrapper, animation loop, and UI bindings.
- `params.js`: Shared parameters and constants.
- `camera.js`: Camera setup.
- `rendering.js`: Renderer, controls, post-processing, and resize handling.
- `particles.js`: Star and dust particle systems.
- `structures.js`: Galaxy structure math and clustering.
- `density.js`: Worker-backed density texture setup.
- `shaders.js`: Volumetric shader definition.
- `blueNoise.js`: Blue-noise texture utilities.

## Notes
- `script.js` remains as a legacy reference and will be removed once the migration is complete.
- Keep module boundaries tight; avoid cross-module globals unless explicitly exported.
