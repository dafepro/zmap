# Repository map

## zmap

| Path                                            | Responsibility                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/`                                          | Public world/browser/core/server implementation; no Avatar Studio runtime dependency   |
| `examples/hub/index.html`                       | Courtyard: explore, multiplayer and app-owned decorating examples                      |
| `examples/hub/action.html`                      | Fieldwork: shared tools, cannon and avatar integration; primary Team World reference   |
| `examples/models.ts`, `action-models.ts`        | Public avatar package consumers and presentation adapters                              |
| `examples/server.ts`, `store.ts`                | Explicit demo auth and file persistence; replace in production                         |
| `examples/hub/review/`                          | Development-only source-animation review pages; not production build inputs            |
| `tests/fixtures/`                               | Instrumented art/motion qualification; may intentionally inspect pinned avatar source  |
| `docs/status.md`                                | Current readiness and known gaps                                                       |
| `docs/development-history.md`, `docs/evidence/` | Historical work log and regression evidence; not current integration instructions      |
| `assets/source/`                                | Editable world prop sources and provenance                                             |
| `avatar-studio/`                                | Pinned Git submodule of `dafepro/zmap-avatar-studio`; not duplicated zmap-owned source |

The courtyard and Fieldwork are both retained because they exercise different contracts: decorating/entitlements versus transient action gameplay. Neither should be copied wholesale into Zoomigo. Review pages and old evidence are developer material, not an alternative lounge implementation. The original athlete GLB remains source/provenance material; current characters are supplied by the avatar package.

## zmap-avatar-studio

| Path                 | Responsibility                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `src/`               | Modular runtime and data-only contract exports                                              |
| `app/`               | Independent appearance editor and equipment workbenches                                     |
| `public/`            | Verified runtime catalogs and GLBs; delivered with the package                              |
| `assets/source/`     | Editable Blender source, retained concepts and animation references; not packed for runtime |
| `tests/`, `scripts/` | Independent qualification and asset/package tooling                                         |
| `docs/`              | Avatar-specific contracts, fitting, authoring and animation workflows                       |

No submodule is needed to install the two release packages in Zoomigo. The submodule is for zmap development, source-based visual qualification and coordinated changes.

## Development checkout

```sh
git clone --recurse-submodules https://github.com/dafepro/zmap.git
cd zmap
npm ci
npm --prefix avatar-studio ci
npm run dev
```

For an existing clone: `git submodule update --init --recursive` before installing. After switching zmap revisions, use `git submodule update --init --recursive` to restore the recorded avatar commit. Do not use `--remote` in CI: it would silently replace the tested pin.

When editing avatars, create a branch in the submodule, test and commit there, push it to its repository, then update and test the zmap gitlink. Keep both repositories' work committed. Never replace a submodule directory with an untracked copy.
