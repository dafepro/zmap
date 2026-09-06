# Delivery status — independent v3 first playable

Updated 2026-09-06. The owner explicitly removed legacy data migration from scope. This is a fresh product/library iteration; audit differences are not a legacy parity checklist. Source is on `feat/first-playable`.

## Implemented and exercised

- Versioned TypeScript core, browser and server exports, installable ESM package and declarations.
- App-owned content/identity/visual adapters; three focused browser example modes.
- Direct screen-relative keyboard and portrait pointer controls, local movement prediction, follow camera, menu/focus isolation and disposal.
- Ramp ascent, solid terrace faces, raised bridge and independent underpass; height-aware kicks and slope motion.
- Real WebSocket clients, one browser host, relay-stamped input identity, epoch-fenced snapshots, late join, abrupt loss/lease expiry recovery, visibility yield and reconnect states.
- Original procedural athletic characters with palettes, locomotion and wave; faceted courtyard, gardens, benches, trees, ball and authored launch pad.
- App-owned demo inventory and durable filesystem adapter: supported placement, preview/cancel, move/rotate/return, owner checks, quota, revision CAS, idempotent receipts and atomic fsync/rename before acknowledgment. Receipts stay on the service; peers receive only public layout.

## Evidence

| Check                     | Result and boundary                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Headless invariants       | `npm test`: 10 passing tests covering height, slopes, bridge ceilings, normalized speed, terrain faces, trigger, snapshot validation, real sockets, denied access, host loss/expiry, owner rights, concurrency, retries and store restart. |
| Browser journeys          | `npm run test:e2e`: 4 passing Chrome journeys: multiplayer/late join/host close; decorating/save/re-entry/return; portrait pointer movement/reduced motion; 20 enter/dispose cycles and focus isolation.                                   |
| Cleanup                   | 20 cycles retained 135 active-renderer geometries and 4 textures; one canvas and one peer after each entry, no canvas after disposal. This is renderer/session evidence, not a total heap leak proof.                                      |
| Host-close sample         | 29 ms in one localhost browser run; a separate real-socket test exercises a silent lease timeout. Neither is a WAN/mobile p95 claim.                                                                                                       |
| Independent package       | `npm run test:package` packs and installs outside the repository; ESM imports, TypeScript declarations and Vite browser production build pass without source aliases.                                                                      |
| Build and dependencies    | Strict typecheck and production build pass. Dependency audit reports zero known advisories at install time. Bundle measurements below are build gzip sizes, not measured network delivery.                                                 |
| Desktop sample            | Chrome 152.0.7977.82, macOS Darwin 25.6.0 arm64, host model Mac16,7; 1440×1050, one avatar, six-second development-server sample: 42.7 ms join; rolling frame p95 16.8 ms; 135 draws, 2,714 visible triangles. See JSON.                   |
| Required content download | Initial example build approximately 142 KB gzip total JS/CSS/HTML, entirely local procedural assets and system fonts. Not a cold-entry p95.                                                                                                |

The desktop sample predates the final input relay optimization (inputs now travel only to the host). Its traffic values are retained as dated evidence, not represented as final deployment cost.

Images: [exploration](evidence/explore-desktop.png), [shared room](evidence/shared-desktop.png), [decorating](evidence/decorate-desktop.png), [portrait](evidence/explore-portrait.png). [Raw desktop sample](evidence/desktop-sample.json).

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
| A-08        | Graphics/cosmetic error boundaries exist; injected failure qualification pending. No Canvas fallback.                                                                                            |
| A-09 / A-10 | Linked travel and map-generation switching not implemented. Fresh v3 scope, no old-data conversion requirement.                                                                                  |
| A-11        | Full-room physical-device/network/cost qualification not run.                                                                                                                                    |
| A-12        | Public-export example hub and separately installed package consumer build passed.                                                                                                                |
| A-13        | 390 px portrait, reduced-motion and focus isolation passed in desktop emulation; 320 px and human access testing pending. No audio is produced.                                                  |
| A-14        | Legacy migration journey retired by owner clarification; fresh release/rollback checks belong to future app adoption.                                                                            |

## Next work, ordered by product value

| Work                                            | Trigger / requirement                                 | Acceptance                                                                                                                                                                                                                       |
| ----------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Peer pose interpolation and action presentation | Improve connected feel; Z-05/06/10, N-02/04           | Measure local input response and smooth remote motion with two real phones under latency/jitter. Current peers use 15 Hz toy poses without interpolation.                                                                        |
| First real consuming-app adapter                | Zoomigo adoption; Z-01/09/14, L-01/03/06              | App issues scoped credentials, commits current inventory policy transactionally, embeds lazy world route and mounts approved appearance/content. No copied accounts or legacy migration.                                         |
| Art/readability iteration                       | Review first playable beside supplied poster; Z-03/10 | Improve expressive silhouettes, grounded action animation, route landmarks and foliage at actual phone scale. Current characters are procedural samples, not final production rigs.                                              |
| Content contract expansion                      | Next authored toy/map; Z-07/08/13                     | Durable behavior states, explicit map travel transaction and per-surface placement picker; richer bounds/occlusion/collision conformance. General behavior plugins are not yet supplied.                                         |
| Physical device and network qualification       | Before production claims; N-01–06                     | Execute unchanged benchmark targets in implementation plan: 20 distinct characters/50 items/5 complex toys, 15 minutes, cold/warm entry, WAN faults, host suspension and total cost.                                             |
| Service hardening and operations                | Before public deployment; N-04/05/06/08               | Bound slow app callbacks, isolate room queues, validate persisted schema more deeply, run restart/corruption tests and a transactional app adapter conformance suite. Use one writer until distributed ownership is implemented. |

No full V1/release-complete claim is made. This increment is useful for hands-on review and continued product work.
