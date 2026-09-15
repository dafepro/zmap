# Repository cleanup — September 15, 2026

## Decisions

- Extracted the complete tracked `avatar-studio/` history into `dafepro/zmap-avatar-studio`. The former directory was independently buildable, but had not been a separate repository. Original extraction tip: `3b329af71a46b93007ab23e66bcd7861c86ac563`.
- Avatar Studio has its own `main`, repository-local dafepro identity, AGENTS.md, CI and v0.1.1 package. Its working directory remains mounted in zmap as a pinned development submodule. There is no duplicated tracked avatar source in zmap's current tree.
- Consolidated the long-running world implementation and current main guidance without rewriting history. Old work branches are preserved with `archive/` tags before retirement. `main` is the integration starting point.
- Added built v0.1.1 release tarballs and SHA-256 manifests for both packages. Excluding studio-only reference images reduced the avatar runtime archive from 43.3 MB to about 1.3 MB; approved models, catalogs and runtime remain independently verified. The consuming app needs neither source checkout nor submodule to install them. Public asset resolution replaces a hard-coded source path.
- Moved source-animation review pages to `examples/hub/review/`. Kept the courtyard and Fieldwork examples because they test distinct placement and action contracts. Maintained production example entries are courtyard, Fieldwork and architecture; review pages remain dev-only.
- Split current readiness from historical development notes. Added repository/package guides and updated the architecture website, source links and v3 handoff. Historical art and performance evidence remains available without presenting old gait iterations as current architecture.

## Verification

- World build and formatting passed; 109 unit/socket tests passed.
- Avatar typecheck, formatting and 154 unit tests passed.
- Both independent tarball consumers passed ESM/declarations/build checks. Avatar consumer additionally rendered skinned/textured models, exact grips and approved asset integrity through the public asset export.
- All 30 world browser journeys passed locally after the split, including shared actions, cannon, source/directional review, lifecycle, persistence, host recovery, sprint and navigation.
- All 44 independent Avatar Studio browser journeys passed locally; independent Linux avatar CI passed once, while a second run at the same commit timed out in two cases. See the CI investigation below.
- A fresh local clone initialized the recorded avatar commit, ran both clean `npm ci` installs, and passed the complete world production build without pre-existing lib/assets or lockfile changes. The clone used local Git object transport to avoid re-downloading the retained Blender history; the same avatar commit is published on GitHub.

- Both publicly released tarballs installed together in an empty consumer; public imports, catalog validation and lockfile integrity passed.
- World Linux CI passed build/unit/package checks but failed 17 of 31 browser cases. This is an open qualification blocker, documented in [the CI investigation](ci-browser-investigation.md), with retained traces.

## Integration starting point

Read [package delivery](integration-packages.md), [repository map](repository-map.md), [current readiness](status.md), then [Team World handoff](zoomigo-v3-agent-prompt.md). Scope is fresh v3 with app-owned identity, access, inventory and durable policy. This cleanup does not claim a production Zoomigo deployment or physical-phone qualification.
