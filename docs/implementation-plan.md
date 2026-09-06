# First playable plan — 2026-09-06

Status: implementation authorized by the owner's current request. The older handoff's review pause is superseded; its planning evidence remains useful. This is a first playable increment, not a V1 replacement or a claim of phone qualification.

## Owner clarification: independent v3

The owner clarified during implementation that Zoomigo is alpha with no data worth migrating. This is an independent v3; Canvas underpinned v2. Legacy migration, format compatibility, permit carryover and rollback conversion are removed from delivery scope. Audit findings inform sound boundaries, not obligations to preserve old implementations. Prioritize product quality and a pleasant, reliable consumer API. No fallback to Canvas or parallel legacy runtime. Clear error states remain normal lifecycle behavior.

## Scope and assumptions

Confirmed: reusable zmap library; Zoomap presentation; player-controlled visible avatars; real height; shared toys; app-owned identity, inventory and policy; low idle cost; independent integrations. The supplied Zoomigo poster is visual context, not a requirement to implement every depicted feature.

Reversible defaults: fixed-angle orthographic follow view; screen-relative WASD/arrows and touch stick; no jump; pass-through players; terraced courtyard with ramp and a traversable bridge/underpass; original Blender athletic character kit and faceted authored scenery. First-person, large catalog, accounts, chat, rewards and broad engine tooling are excluded from this increment.

## Architecture decision

- TypeScript headless deterministic bounded fixed-step simulation, shared between browser host and tests. Explicit solid surfaces (including sloped tops), vertical gravity, height-aware collision and reach. This small model proves stacked routes without importing Canvas's scalar elevation limitation. Arbitrary mesh physics is deferred; add Rapier only if authored content requires it.
- Three.js MIT WebGL2 renderer and replaceable app character factory. Low-poly original geometry, no remote assets, limited pixel ratio and no postprocessing. Camera follows predicted local movement. Unsupported graphics produce an app-safe failure. Three requires explicit geometry/material disposal ([official guide](https://threejs.org/manual/en/how-to-dispose-of-objects.html)).
- One browser simulates each active room. A shared Node WebSocket service chooses and fences host epochs, relays inputs/snapshots and stores durable edits; it does no world simulation. WebSocket relay trades more service bandwidth for easy LAN/browser reach. Native browser WebSocket, MIT `ws` on server ([official package](https://www.npmjs.com/package/ws)). JSON is inspectable but costs bandwidth; binary/delta transport is a measured follow-up.
- Separate trusted server callbacks for session identity/current access and transactional durable edits. Host snapshots contain transient poses only: no ownership or inventory writes. A modified host can fake toy motion but cannot grant inventory or rewards. A single-writer reference service is deliberate; distributed coordination is deferred; a fresh Zoomigo app adapter is the next consumer integration.
- Stable public exports: core content/simulation; client mount/enter/leave/dispose/input/edit/state; server coordination and persistence contracts. Consumer owns maps, characters, toy definitions, inventory UI and business policy.

## File tree

`src/core.ts`, `src/toy-physics.ts`, `src/presentation.ts`, `src/client.ts`, `src/view.ts`, `src/server.ts`, `src/index.ts`; `examples/content.ts`, `examples/models.ts`, `assets/source/`, `examples/server.ts`, `examples/hub/`; `tests/`; `docs/` evidence, API, audit and operation notes.

## Increments and acceptance mapping

1. Source audit, scope, architecture, test matrix (N-08).
2. Headless geometry, input normalization, surface/reach invariants; original rendered courtyard and character extension (Z-02/03/04/10, A-02).
3. Real multi-client room, late join, trigger, lease loss and reconnect (Z-01/05/06/07/12, A-03/06).
4. App-owned mock identity and entitlements, validated placement/edit/return, idempotent durable store, server restart (Z-08/09/11, A-04/05/07).
5. Three focused consumer modes, browser verification, measured initial bundle and evidence/backlog (Z-14, A-12/13). Do not mark A-01 phone, A-11 or V1 passed from desktop automation.

## Review iteration — completed 2026-09-06

The owner requested broad hardening, especially ball physics and Blender art. Added scalar rolling resistance, contact-normal reflection/substeps, bounce and home reset; remote pose interpolation and frame-rate-independent presentation; an original editable Blender kit with bounded loading and independent instance disposal; isolated room queues, read deadlines, load-capacity reservations and strict saved-record validation. Regressions cover slow callbacks, pending commits, corruption, model failures and mount cancellation. Current results and remaining gaps are tracked in [status](status.md).

## Benchmark protocol

Unmeasured target hardware: iPhone SE (2022), iOS Safari and installed PWA; Pixel 6a Android Chrome; MacBook Air M1 Safari/Chrome/Firefox. Record actual OS/browser build at execution, not an assumed current version. Physical devices are required for release qualification.

Use 30 cold and 30 warm enters, 20 distinct equipped avatars, 50 decorations and five complex toys; 15-minute sessions; 20 enter/leave cycles. Normal shaping: 10 Mbps down, 2 Mbps up, 80 ms RTT. Impaired: 150 ms RTT, uniform ±30 ms jitter and independent 2% packet loss at network layer (TCP retransmission included). Run host as well as peer under faults. Thirty abrupt losses and background suspends for recovery p95. Targets remain specs §6 unchanged.

Record frame/input/join/recovery timing, stalls, heap/GPU resources, client and server CPU/RSS, bytes in/out, durable writes and asset transfer. Report 1/20-player active rooms and 100 empty rooms. Cost = measured relay GB × deployed egress rate + persisted writes/storage + asset CDN GB + service compute; no dollar estimate until deployment rates and representative measurements exist. Sample desktop numbers are not p95 or phone evidence.
