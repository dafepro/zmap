# Delivery status — independent v3 first playable

Updated 2026-09-06. The owner explicitly removed legacy data migration from scope. This is a fresh product/library iteration; audit differences are not a legacy parity checklist. Source is on `feat/first-playable`.

## Implemented and exercised

- Versioned TypeScript core, browser and server exports, installable ESM package and declarations.
- App-owned content/identity/visual adapters; three focused browser example modes.
- Direct screen-relative keyboard and portrait pointer controls, local movement prediction, follow camera, menu/focus isolation and disposal.
- Ramp ascent, solid terrace faces, raised bridge and independent underpass; height-aware kicks and slope motion.
- Scalar ground resistance, separate air drag, slope gravity, substepped contact-normal ball collisions, floor/ceiling bounce and own-home reset; displacement-based visible rolling.
- Bounded display-only remote interpolation, time-based camera easing and view reset on re-entry.
- Per-room service queues, read-only adapter timeouts, concurrent-load reservations, persisted schema/content validation and honest pending-commit semantics.
- Real WebSocket clients, one browser host, relay-stamped input identity, epoch-fenced snapshots, late join, abrupt loss/lease expiry recovery, visibility yield and reconnect states.
- Original Blender athlete with palette-controlled materials and animated limb/head pivots; paneled soccer ball, slatted bench and planter. Editable source, reproducible builder and self-contained exports retained.
- App-owned demo inventory and durable filesystem adapter: supported placement, preview/cancel, move/rotate/return, owner checks, quota, revision CAS, idempotent receipts and atomic fsync/rename before acknowledgment. Receipts stay on the service; peers receive only public layout.

## Evidence

| Check                     | Result and boundary                                                                                                                                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Headless invariants       | `npm test`: 24 passing tests covering height, physics, interpolation, Blender exports, real sockets, authority, host loss, room isolation/capacity, durable ownership/retries/restart and corruption.                                                     |
| Browser journeys          | `npm run test:e2e`: 6 passing Chrome journeys: multiplayer/late join/host close; decorating/save/re-entry/return; portrait pointer movement/reduced motion; 20 enter/dispose cycles and focus isolation; missing model/retry; leave during model loading. |
| Cleanup                   | 20 cycles retained 107 active-renderer geometries and 4 textures; one canvas and one peer after each entry, no canvas after disposal. This is renderer/session evidence, not a total heap leak proof.                                                     |
| Host-close sample         | 24 ms in one localhost browser run; a separate real-socket test exercises a silent lease timeout. Neither is a WAN/mobile p95 claim.                                                                                                                      |
| Independent package       | `npm run test:package` packs and installs outside the repository; ESM imports, TypeScript declarations and Vite browser production build pass without source aliases.                                                                                     |
| Build and dependencies    | Strict typecheck and production build pass. Dependency audit reports zero known advisories at install time. Bundle measurements below are build gzip sizes, not measured network delivery.                                                                |
| Desktop sample            | Chrome 152.0.7977.82, macOS Darwin 25.6.0 arm64, host model Mac16,7; 1440×1050, one avatar, six-second development-server sample: 63.7 ms join after model loading; rolling frame p95 16.7 ms; 107 draws, 9,552 visible triangles. See JSON.              |
| Required content download | Example build approximately 169 KB gzip JS/CSS/HTML plus 408 KB raw GLBs. System fonts. The Three/GLTF chunk triggers Vite’s 500 KB uncompressed advisory; cold-entry p95 is unmeasured.                                                                  |

The desktop sample includes the new Blender kit and isolated test services. Join timing starts after asset loading; it does not measure the complete route-to-play download. The observed draw count fell from 135 to 107 while visible triangles increased from 2,714 to 9,552. This single stationary sample is not a representative load or deployment cost measurement.

Images: [Blender kit](evidence/blender-kit.png), [earlier exploration](evidence/explore-desktop.png), [shared room](evidence/shared-desktop.png), [decorating](evidence/decorate-desktop.png), [portrait](evidence/explore-portrait.png). [Raw desktop sample](evidence/desktop-sample.json).

## Acceptance journeys

| IDs         | Status                                                                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A-01        | Desktop entry/control/cleanup passed; phone viewport automation passed; physical phone and real Zoomigo entry untested.                                                                          |
| A-02        | Core bridge/underpass, cross-height reach and slope tests passed; physical-phone human route review untested.                                                                                    |
| A-03        | Real browsers kick one shared toy, late join without reset and see shared state; sustained simultaneous interactions under WAN faults untested.                                                  |
| A-04        | Browser place/rotate/return and store retry/CAS/concurrency checks passed; exhaustive dropped-reply UI scenarios remain.                                                                         |
| A-05        | Owner/entitlement guards, cross-room denial, access revocation, forged snapshot identity and non-host rejection passed against the reference service. Actual app credential integration pending. |
| A-06        | Browser host close and silent socket-host lease expiry passed locally; physical-phone suspension and network partitions pending.                                                                 |
| A-07        | Durable file reopen and room unload passed; destructive full-service restart drill with connected browsers pending.                                                                              |
| A-08        | Missing GLB fails explicitly, retry recovers, and leaving during load cannot remount. Graphics-context loss and broader fault qualification pending.                                             |
| A-09 / A-10 | Linked travel and map-generation switching not implemented. Fresh v3 scope, no old-data conversion requirement.                                                                                  |
| A-11        | Full-room physical-device/network/cost qualification not run.                                                                                                                                    |
| A-12        | Public-export example hub and separately installed package consumer build passed.                                                                                                                |
| A-13        | 390 px portrait, reduced-motion and focus isolation passed in desktop emulation; 320 px and human access testing pending. No audio is produced.                                                  |
| A-14        | Legacy migration journey retired by owner clarification; fresh release/rollback checks belong to future app adoption.                                                                            |

Ball physics remains a bounded sphere controller. Ball-to-ball contacts and physical spin/airborne angular momentum are not implemented. Pending durable writes intentionally hold their room’s queue until resolved; app adapters need database deadlines and unknown-outcome reconciliation.

## Next work, ordered by product value

| Work                                            | Trigger / requirement                                 | Acceptance                                                                                                                                                                                                                                               |
| ----------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Peer pose interpolation and action presentation | Improve connected feel; Z-05/06/10, N-02/04           | Measure local input response and smooth remote motion with two real phones under latency/jitter. Bounded 80 ms remote interpolation is implemented; action anticipation and host 30 Hz pose smoothing remain.                                            |
| First real consuming-app adapter                | Zoomigo adoption; Z-01/09/14, L-01/03/06              | App issues scoped credentials, commits current inventory policy transactionally, embeds lazy world route and mounts approved appearance/content. No copied accounts or legacy migration.                                                                 |
| Art/readability iteration                       | Review first playable beside supplied poster; Z-03/10 | Improve expressive silhouettes, grounded action animation, route landmarks and foliage at actual phone scale. Blender kit is integrated; richer expressions, kick anticipation, individual silhouettes and production rigging remain.                    |
| Content contract expansion                      | Next authored toy/map; Z-07/08/13                     | Durable behavior states, explicit map travel transaction and per-surface placement picker; richer bounds/occlusion/collision conformance. General behavior plugins are not yet supplied.                                                                 |
| Physical device and network qualification       | Before production claims; N-01–06                     | Execute unchanged benchmark targets in implementation plan: 20 distinct characters/50 items/5 complex toys, 15 minutes, cold/warm entry, WAN faults, host suspension and total cost.                                                                     |
| Service hardening and operations                | Before public deployment; N-04/05/06/08               | Read timeouts, room isolation, schema/corruption checks and concurrent-load capacity are implemented. Next: restart drills, write-adapter deadline/reconciliation conformance and WAN faults. Use one writer until distributed ownership is implemented. |

No full V1/release-complete claim is made. This increment is useful for hands-on review and continued product work.
