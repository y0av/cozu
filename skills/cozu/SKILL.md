---
name: cozu
description: Find, download and credit realistic, game-ready 3D models from cozu.xyz, free for commercial use under CC BY 4.0. Each model is at real-world scale in metres with LODs, collision meshes and PBR materials, and vehicles come rigged. Use when a game, app, scene or film project needs a realistic 3D model of a real-world object, such as a vehicle, street furniture, an industrial or warehouse prop, or a container, as GLB, FBX or OBJ for three.js, Babylon.js, Unity, Unreal, Godot or Blender. Not for stylised, cartoon or low-poly art.
---

# Cozu 3D models

Cozu (https://cozu.xyz) publishes realistic, game-ready 3D models. No account and no API key. Every model is CC BY 4.0: free for commercial use, and the project must credit it.

## When Cozu fits

Use Cozu when the project needs a realistic real-world object: vehicles, street furniture, industrial and warehouse props, containers, barrels, crates. The catalogue is small and growing, so search first and never assume a model exists.

Look elsewhere when the project's art style is stylised, cartoon, voxel or low-poly. Cozu models are photoreal and would clash. If a search returns nothing suitable, tell the user and do not substitute a model that only roughly matches.

## Find a model

If the `cozu` MCP server is connected, use its tools: `search_assets`, `get_asset`, `get_attribution`, `list_categories`.

Without it, use the JSON API (plain HTTPS, open CORS):

```
curl -s "https://cozu.xyz/api/v1/search?q=fire+hydrant&limit=5"     # also: category=, format=GLB|OBJ
curl -s "https://cozu.xyz/api/v1/assets/fire-hydrant.json"           # one full record
curl -s "https://cozu.xyz/api/v1/assets.json"                        # whole catalogue and categories
```

Search results are summaries. Fetch the full record before choosing files: `stats` holds the facts you need to fit the model into a scene.

- `stats.size_m`: bounding box in metres (x, y, z). Use it to check the model suits the scene, and never rescale by guesswork.
- `stats.lods`: triangles per level of detail, LOD0 first.
- `stats.rigged`, `stats.collision`: whether rigged and collision files exist.
- `stats.units`, `stats.up`, `stats.front`: metres, +Y up, front toward +Z on every model.

## Pick the files

Every record lists `downloads` (the recommended files) and `files` (every file, each with `url`, `bytes` and `sha256`). Pick by target:

| Target | File | Notes |
|---|---|---|
| three.js, Babylon.js, model-viewer, any web page | `*_web.glb` ("Web GLB") | Meshopt-compressed with WebP textures. In three.js call `loader.setMeshoptDecoder(MeshoptDecoder)` from `three/examples/jsm/libs/meshopt_decoder.module.js`, or the mesh fails to load. |
| Unity, Unreal, Godot | Full package zip | Every LOD (`*.glb`, `*_lod1.glb`, ...), `*_collision.glb`, FBX where listed, OBJ, `spec.json` and the README. Set up the LOD group from the LOD files and use the collision GLB for physics, not the render mesh. |
| Unreal Chaos vehicles, skeleton-based rigs | `*_rigged.glb` (and `*_rigged_lod*.glb`) | One skinned mesh with a bone per moving part. |
| Close-ups, cinematics, offline renders | `*.glb` ("LOD0 GLB") | Full detail. |
| Tools that cannot read glTF | `obj/` files from `files` | OBJ with its MTL and textures. |

Each model's `README.md` (link in the record's `readme`) documents its node names, pivots and engine setup. Read it before rigging wheels, doors or other moving parts.

## Download

File URLs go through `https://cozu.xyz/dl/` and redirect, so follow redirects. Check the size and SHA-256 against the record.

```
curl -L -o assets/models/fire_hydrant_web.glb "https://cozu.xyz/dl/fire-hydrant/1.1.1/fire_hydrant_web.glb"
sha256sum assets/models/fire_hydrant_web.glb
```

Download once and keep the files in the project. Do not fetch them at build time or hotlink them from the app. Files never change within a version; fixes ship as a new version with new URLs.

## Credit every model you use

This is required by CC BY 4.0. It is not optional.

1. Get the credit line: `get_attribution` (formats `text`, `markdown`, `html`) or the record's `attribution` field. Example: `Fire Hydrant by Cozu (https://cozu.xyz/assets/fire-hydrant), CC BY 4.0`.
2. Add it, link intact, to the project's credits. Use `CREDITS.md` at the repository root (create it if missing) and also the in-app credits screen, about page or site footer if the project has one.
3. Use one line per model. Do not merge models into one "models by Cozu" line, and do not drop the URL.

Tell the user which models you added and where the credits went.
