# Delivery status — independent v3

Updated 2026-09-07 on `codex/reference-avatar-base`. This is a fresh product and library; legacy-data migration is outside scope. The current increment adds an independent modular avatar system, visual iteration tools and stronger multiplayer regression coverage.

## Current delivery

- Reusable TypeScript core, browser and server exports; ESM/declarations verified through an independently installed package.
- Public app-owned content, identity and visual adapters, with explore/shared/decorate examples. Identity, access, inventory, rewards and durable policy remain outside the reusable library.
- Height-aware worlds, keyboard/touch movement, prediction, remote interpolation, ramps, bridge/underpass separation and slope motion.
- Scalar ball rolling resistance, separate air drag, substepped contact-normal collisions, floor/ceiling bounce, own-home reset and displacement-based visual rolling.
- Room-isolated WebSocket coordination, leases, epoch fencing, late join, visibility yield and reconnect. Durable app-owned placement uses ownership/entitlement checks, CAS revisions, idempotent receipts and fsync/rename before acknowledgment.
- Independent `avatar-studio/` package/application, 36 Blender parts, 11 modular categories, strict appearance/catalog contracts, atomic replacement, SHA-256 verification, bounded templates and independently disposable instances.
- Studio color editing, saved looks, history, JSON import/export, transparent PNG export, study-sheet comparison, animation and camera controls. Default illustrated rendering uses drawn face and cloth maps, unified face shading and thin skinned silhouettes. Sixteen-view capture/export freezes the equipped pose into a directional atlas, with live animation available separately.
- The hub uses approved prepared avatar factories from the independent package. Its ball, bench and planter still use the original world Blender kit. No alternate avatar is silently substituted after an asset failure.

## Verification and evidence

| Check                   | Current result and boundary                                                                                                                                                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root invariants         | 27 passing tests: simulation, assets, sockets, authority, room isolation/capacity, durable retries/restart, corruption and deduplicated GPU/skeleton cleanup. The service accepts 20 distinct clients and rejects the 21st.                                                                              |
| Root browser journeys   | Seven passing Chrome tests: multiplayer/late join/host close; decorating/persistence; portrait input; 20 lifecycle cycles; asset failure/retry; leave during loading; three clients under message shaping and a lost durable receipt.                                                                    |
| Avatar invariants       | 58 passing tests: 311,040 structural combinations, 216 scalp-coverage states, selective hair occlusion and bounded wrapped eyewear, actual exported skin/cloth deformation, pigment integrity, asset contracts, atomic replacement and independent resource ownership.                                   |
| Avatar browser journeys | 27 passing tests: all 11 categories, collection presets and component/weight controls, 144 hair-orbit panels plus 24 cap-and-glasses views, illustrated rendering, sixteen-view capture, import/export/history/storage, asset failures and 40 bounded replacements.                                      |
| Packages and builds     | Both packages pass ESM import, TypeScript declarations and production browser-build checks from an independent tarball consumer. Avatar consumer also decodes painted PNGs, assembles and renders skinned GLBs and captures sixteen directions in a real browser. Typechecks and production builds pass. |
| Cleanup                 | Root 20 entry/disposal cycles retain stable active GPU geometry/texture counts; avatar 40 replacements and repeated comic toggles stay bounded. This is renderer/session evidence, not a total heap leak proof.                                                                                          |
| Impaired network        | Ordered WebSocket-message proxy adds 75 ms per direction ±15 ms jitter and drops every 50th snapshot. A lost saved receipt plus connection close retries one durable command with one committed revision. This is not packet-level loss.                                                                 |
| Local performance       | Latest raw samples are linked below. Desktop measurements begin after asset loading and involve one avatar; recovery and input observations are samples, not p95 qualification.                                                                                                                          |
| Art source              | Editable Blender source includes supplied and generated references, 24 isolated hair cameras and 15 collection cameras. All 36 GLBs total 2,085,208 bytes; the largest tested fitted assembly is 13,900 source triangles against the unchanged 14,000 limit. Outline rendering adds a separate pass.     |

Evidence: [desktop sample](evidence/desktop-sample.json), [network sample](evidence/network-sample.json), [shared hub](evidence/shared-desktop.png), [portrait hub](evidence/explore-portrait.png), [studio comic view](../avatar-studio/docs/evidence/studio-comic.png), [studio modular look](../avatar-studio/docs/evidence/studio-desktop.png), [current Blender lineup](../avatar-studio/docs/evidence/blender-lineup.png), [directional capture](../avatar-studio/docs/evidence/studio-directional.png). Full methods and requirement boundaries are in [multiplayer coverage](multiplayer-coverage.md).

Current avatar revision: **2.3.0**. The [Hair 03 workflow](../avatar-studio/docs/hair-03-workflow.md) records Nova, Halo and Reed, including [their actual geometry](../avatar-studio/docs/evidence/hair-isolated/collection-03-review.png). See the [compatibility review](../avatar-studio/docs/fit-quality-review.md), [actual isolated hair renders](../avatar-studio/docs/evidence/hair-isolated/review.png) and [generated reference provenance](../avatar-studio/docs/references/hair-isolated/README.md).

## Remaining product and release work

The art approximates the supplied study's angular athletic style but is simpler than its illustrated detail. Body and tops now use connected, smoothly weighted surfaces; natural fingers and painted facial expressions replace the most conspicuous primitives. The coiled crop, asymmetric bob and swept quiff have been rebuilt from isolated four-view studies; a high ponytail, full afro and centre-parted waves extend the catalog to nine hairstyles; scalp foundations and accessory interactions are qualified separately. Finer curl edges, fringe shading, painted hair linework, distinct head shapes, expressive hand poses, facial animation and production motion remain art-development work. The 16-view experiment captures one pose and elevation; animated sprite sheets and cloth simulation are not implemented.

Before production performance claims, run the unchanged specs matrix on a named physical baseline phone: 20 distinct avatars, 50 placements including five complex active toys, 15 minutes, repeated cold/warm entry, visible input timing, host recovery, transport-level loss/jitter, suspension and cost. Local browser emulation and three-client impairment tests do not satisfy that whole matrix.

Real Zoomigo credential/inventory integration, service restart drills with connected browsers, database write deadlines/unknown-outcome reconciliation, graphics-context recovery and distributed room ownership remain consuming-app/operations work. Use one durable writer until distributed ownership is implemented.

Content-contract expansion, explicit linked travel and map-generation switching remain tracked requirements. Ball-to-ball contact, physical spin and airborne angular momentum are not implemented. The independent v3 does not require old-data conversion.

No full V1 or release-complete claim is made. The code, assets, integration examples and verification evidence are ready for hands-on review and continued product development.
