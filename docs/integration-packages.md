# Installable integration baseline: zmap v0.1.3 / Avatar Studio v0.1.1

Studio-only concept images and editable source are excluded from the avatar runtime tarball; required catalogs, GLBs and runtime code are included.

The packages remain private to prevent accidental npm-registry publication. They are delivered as built, versioned GitHub Release tarballs. A consuming app does not need the Blender sources, demo server, development submodule or repository build scripts.

```sh
npm install --save-exact \
  https://github.com/dafepro/zmap/releases/download/v0.1.3/zmap-0.1.3.tgz \
  https://github.com/dafepro/zmap-avatar-studio/releases/download/v0.1.1/zmap-avatar-studio-0.1.1.tgz
```

Commit the consuming lockfile. Release assets have SHA-256 manifests; npm records the tarball integrity in its lockfile. Use a single compatible Three.js installation. The packages are ESM with TypeScript declarations. `zmap/server` is Node-only; keep it out of the browser bundle. This version establishes a clean integration baseline, not production performance certification.

## Static assets

The avatar package exposes its assets through `@zmap/avatar-studio/assets/*`. Copy the approved catalog and required model/equipment folders at build time. For example, in a Node build script:

```js
import { cp, mkdir } from "node:fs/promises";
const source = new URL(
  "./",
  import.meta.resolve("@zmap/avatar-studio/assets/catalog.json"),
);
const destination = new URL("./public/avatars/v0.1.1/", import.meta.url);
await mkdir(destination, { recursive: true });
for (const name of ["catalog.json", "models", "action", "wield"]) {
  await cp(new URL(name, source), new URL(name, destination), {
    recursive: true,
  });
}
```

Adjust destination to the app build root. Serve catalog and model hashes from the same immutable versioned base URL. Construct `AvatarLibrary` with that base. World map/scenery assets belong to the app's approved content; the example world props are in zmap's checked-in `examples/hub/public/models/` and their editable sources/provenance are retained separately. Do not assume the zmap engine package includes a complete lounge UI or map asset pack.

## Maintaining a release

Run the independent suites in each repository and the zmap integration suites at the exact avatar pin. Bump package versions and lockfiles together. `npm pack` builds declarations/runtime through `prepack`. Inspect `npm pack --dry-run`, install the generated tarballs into an empty consumer, then upload the tarballs and checksums to matching immutable version tags. Do not replace artifacts at an existing version. Record which avatar commit zmap tested.

Clone from `main` for development; use release artifacts for reproducible integration. Source-based motion review fixtures are intentionally not a consumer API.

## Connected Zoomigo consumer

[Zoomigo PR #66](https://github.com/dafepro/fc-workout-pwa/pull/66) contains the
first connected Team World slice on `codex/team-world-v3`: a lazy world route,
separate Node relay, and Go-owned session/team/participation authority. Its
`docs/TEAM_WORLD.md` documents the one-command fixture stack, two-account browser
tests and remaining qualification gates. The local checkout is
`/Users/dcarrell/Documents/fc-workout-pwa`.

Zmap 0.1.2 preserves the authenticated identity object privately for continuing
access checks and suppresses unchanged host elections. These fixes support the
consumer's private grant adapter. They do not resolve all software-rendered Linux
stalls; this remains an integration prerelease, not pilot certification.

## v0.1.3 dev scheduling prerelease

Simulation advances on a separate fixed-rate timer. Drawing uses the same current
clock for interpolation, and pauses during recovery from a main-thread stall.
The 250 ms withdrawal threshold and one-second healthy recovery window remain
unchanged. Room changes respect that recovery window. No protocol or schema
change is required; Avatar Studio remains 0.1.1.

Validation: 111 unit/socket tests, TypeScript, independent packed consumer, and
three local Chrome synchronization journeys pass, including sustained movement,
rendered cadence, slow presentation and stalled-host handoff. The three-player
action journey also passed locally. Linux software-rendered multiplayer remains
an open qualification issue. This prerelease is for dev evaluation, not a claim
of production, phone, or Linux rendering performance.
