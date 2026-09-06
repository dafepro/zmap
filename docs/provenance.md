# Asset and dependency provenance

The supplied Zoomigo poster is the owner's visual reference. It is not bundled as runtime artwork. No Minecraft assets, models, branding or code were copied. The Canvas and Zoomigo repositories were inspected as source evidence; no implementation source or artwork was copied into this library.

All courtyard geometry, characters, animation, vegetation, furniture, ball vertex colors and sign textures in `examples/` were created as original source in this workspace. Editable TypeScript is retained. There are no downloaded fonts, remote runtime assets or generated opaque binaries. Screenshots under `docs/evidence` were captured from the running examples.

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
