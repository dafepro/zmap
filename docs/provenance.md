# Asset and dependency provenance

The supplied Zoomigo poster is the owner's visual reference. It is not bundled as runtime artwork. No Minecraft assets, models, branding or code were copied. The Canvas and Zoomigo repositories were inspected as source evidence; no implementation source or artwork was copied into this library.

The courtyard, animation, vegetation and signage were authored as original TypeScript. The athlete, paneled soccer ball, slatted bench and planter were authored in Blender 5.2.1 LTS using `assets/source/build_models.py`. The editable `assets/source/zoomap-kit.blend` and export manifest are retained; four self-contained GLBs total 408,092 bytes. The athlete uses named limb/head pivots, with runtime animation and approved palettes supplied by the example app. No downloaded artwork or fonts are bundled. `docs/evidence/blender-kit.png` is a Blender render; the shared/decorating/portrait screenshots show the GLBs in the running examples.

To rebuild with Blender installed:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python assets/source/build_models.py
```

The builder starts from a disposable factory scene and writes only this kit’s source, GLBs, manifest and evidence render. It does not modify an open user scene.

The project has not selected a distribution license; the package remains private. This file does not assign a license on the owner's behalf.

Installed direct dependencies inspected 2026-09-06:

| Dependency      | Version | License    | Purpose                    |
| --------------- | ------- | ---------- | -------------------------- |
| three           | 0.180.0 | MIT        | WebGL2 rendering           |
| ws              | 8.21.3  | MIT        | Node WebSocket relay       |
| TypeScript      | 5.9.3   | Apache-2.0 | Typechecking/declarations  |
| Vite            | 7.3.6   | MIT        | Example dev/build          |
| tsx             | 4.23.13 | MIT        | TypeScript service/tests   |
| concurrently    | 9.2.4   | MIT        | Local multi-process runner |
| Playwright test | 1.63.0  | Apache-2.0 | Real browser journeys      |
| Prettier        | 3.9.6   | MIT        | Source formatting          |

DefinitelyTyped Node/Three/ws declarations are MIT. `package-lock.json` pins the full transitive dependency graph. Runtime and type dependencies install from npm; none is fetched dynamically by the world. Preserve upstream notices when distributing dependency bundles.
