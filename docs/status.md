# Delivery status — independent v3

Updated 2026-09-06 on `feat/first-playable`. This is a fresh product and library; legacy-data migration is outside scope. The current increment adds an independent modular avatar system, visual iteration tools and stronger multiplayer regression coverage.

## Current delivery

- Reusable TypeScript core, browser and server exports; ESM/declarations verified through an independently installed package.
- Public app-owned content, identity and visual adapters, with explore/shared/decorate examples. Identity, access, inventory, rewards and durable policy remain outside the reusable library.
- Height-aware worlds, keyboard/touch movement, prediction, remote interpolation, ramps, bridge/underpass separation and slope motion.
- Scalar ball rolling resistance, separate air drag, substepped contact-normal collisions, floor/ceiling bounce, own-home reset and displacement-based visual rolling.
- Room-isolated WebSocket coordination, leases, epoch fencing, late join, visibility yield and reconnect. Durable app-owned placement uses ownership/entitlement checks, CAS revisions, idempotent receipts and fsync/rename before acknowledgment.
- Independent `avatar-studio/` package/application, 22 original Blender parts, eight modular categories, strict appearance/catalog contracts, atomic replacement, SHA-256 verification, bounded templates and independently disposable instances.
- Studio color editing, saved looks, history, JSON import/export, transparent PNG export, study-sheet comparison, animation and camera controls. Optional comic lighting, silhouette outlines and orthographic projection preserve the same modular geometry and motion.
- The hub uses approved prepared avatar factories from the independent package. Its ball, bench and planter still use the original world Blender kit. No alternate avatar is silently substituted after an asset failure.

## Verification and evidence

| Check                   | Current result and boundary                                                                                                                                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root invariants         | 25 passing tests: simulation, assets, sockets, authority, room isolation/capacity, durable retries/restart and corruption. The service accepts 20 distinct clients and rejects the 21st.                                                                         |
| Root browser journeys   | Seven passing Chrome tests: multiplayer/late join/host close; decorating/persistence; portrait input; 20 lifecycle cycles; asset failure/retry; leave during loading; three clients under message shaping and a lost durable receipt.                            |
| Avatar invariants       | Nine passing tests, including all 5,184 structural combinations, pinned GLBs, incompatible/invalid recipes, atomic races, independent resources, prepared factories, disposal and integrity retry.                                                               |
| Avatar browser journeys | Nine passing tests: all eight categories, colors/history/saved looks, import/export/PNG, failed load/retry, portrait/reduced motion, 40 replacements, comic rendering/projection/swaps, pending-choice composition, unavailable storage and empty saved lineups. |
| Packages and builds     | Both packages pass ESM import, TypeScript declarations and production browser-build checks from an independent tarball consumer. Avatar consumer also assembles packaged GLBs. Typechecks and production builds pass.                                            |
| Cleanup                 | Root 20 entry/disposal cycles retain stable active GPU geometry/texture counts; avatar 40 replacements and repeated comic toggles stay bounded. This is renderer/session evidence, not a total heap leak proof.                                                  |
| Impaired network        | Ordered WebSocket-message proxy adds 75 ms per direction ±15 ms jitter and drops every 50th snapshot. A lost saved receipt plus connection close retries one durable command with one committed revision. This is not packet-level loss.                         |
| Local performance       | Latest raw samples are linked below. Desktop measurements begin after asset loading and involve one avatar; recovery and input observations are samples, not p95 qualification.                                                                                  |
| Art source              | Editable Blender kit and reproducible builder; interactive side/back/wave review and real studio screenshots retained. All 22 modular GLBs together are under 0.8 MB before HTTP compression.                                                                    |

Evidence: [desktop sample](evidence/desktop-sample.json), [network sample](evidence/network-sample.json), [shared hub](evidence/shared-desktop.png), [portrait hub](evidence/explore-portrait.png), [studio comic view](../avatar-studio/docs/evidence/studio-comic.png), [studio modular look](../avatar-studio/docs/evidence/studio-desktop.png), [Blender fit review](../avatar-studio/docs/evidence/fit-wave.png). Full methods and requirement boundaries are in [multiplayer coverage](multiplayer-coverage.md).

## Remaining product and release work

The art approximates the supplied study's angular athletic style but is simpler than its illustrated detail. Hand poses, facial variety, cloth deformation, hair sculpting and production animation remain art-development work. The current rig uses rigid segments; it does not claim skinning, cloth simulation or facial blend shapes.

Before production performance claims, run the unchanged specs matrix on a named physical baseline phone: 20 distinct avatars, 50 placements including five complex active toys, 15 minutes, repeated cold/warm entry, visible input timing, host recovery, transport-level loss/jitter, suspension and cost. Local browser emulation and three-client impairment tests do not satisfy that whole matrix.

Real Zoomigo credential/inventory integration, service restart drills with connected browsers, database write deadlines/unknown-outcome reconciliation, graphics-context recovery and distributed room ownership remain consuming-app/operations work. Use one durable writer until distributed ownership is implemented.

Content-contract expansion, explicit linked travel and map-generation switching remain tracked requirements. Ball-to-ball contact, physical spin and airborne angular momentum are not implemented. The independent v3 does not require old-data conversion.

No full V1 or release-complete claim is made. The code, assets, integration examples and verification evidence are ready for hands-on review and continued product development.
