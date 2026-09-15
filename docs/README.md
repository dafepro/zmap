# Documentation entry points

For the Zoomigo integration, read these maintained guides in order:

1. [Architecture website](../examples/hub/architecture.html) — world, avatar and consuming-app boundaries.
2. [Repository map](repository-map.md) — source ownership, pinned submodule and development setup.
3. [Package delivery](integration-packages.md) — install the built releases and serve versioned assets.
4. [Public API](api.md) — browser lifecycle, trusted service and persistence contracts.
5. [Team World handoff](zoomigo-v3-agent-prompt.md) — independent v3 implementation brief.
6. [Current readiness](status.md), [multiplayer evidence boundaries](multiplayer-coverage.md), and [operations](operations.md).

World-specific extensions: [navigation](navigation.md), [field tools](field-tools.md), [world objects](world-objects.md), [cannon](cannon-integration.md), and [shared performances](shared-performances.md).

Avatar contracts, fitting, assets and animation are maintained in [zmap-avatar-studio](https://github.com/dafepro/zmap-avatar-studio). The local `../avatar-studio/` checkout is the exact version pinned by zmap, not another source of truth.

Original intent/specs/handoff documents are historical product background. Their migration requirements are superseded by the owner's fresh-v3 scope. [Development history](development-history.md) retains earlier implementation iterations and numbers; it is not the integration runbook. Raw visual and timing captures under `evidence/` are observations, not blanket production guarantees.
