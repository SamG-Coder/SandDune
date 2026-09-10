# Flowing-fin goldfish

Original model, texture, and Blender authoring script by **SamG-Coder**, under the repository's MIT license.

- `goldfish.blend`: editable Blender scene with model, materials, morph targets, camera, and studio lighting.
- `goldfish-scales.png`: original 2048 × 2048 scale colour atlas, also packed into the Blender scene.
- `../../public/models/goldfish.glb`: browser asset with embedded texture and animation morph targets.
- `../../tools/build-goldfish.py`: reproducible authoring/export/render script for Blender 5.2.

From the project root, run Blender in background mode with `--python tools/build-goldfish.py`. The script rebuilds these generated assets and saves a studio portrait under `.artifacts/goldfish-blender.png`.

The browser shares the model across up to eight fish and animates the exported fin morph targets. Source fin materials are translucent; the browser makes those membranes opaque during rendering so the existing water transmission pass refracts the whole fish consistently.
