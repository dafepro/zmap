# Initial locomotion reference audit (historical)

The active source is now KayKit 1.1; see [directional review](directional-locomotion-review.md) and [current source provenance](../avatar-studio/assets/source/locomotion/kaykit/README.md). This audit records the previous increment and does not describe current directional retargeting.

Inspected September 15, 2026. The request was to replace the conspicuous procedural gait with actual animation reference, then add sprinting. This audit distinguishes the author's animation files from Zoomap's later retargeting and speed adaptation.

## Candidate comparison

| Source                                                                                                                                                                                                                                | Reuse terms verified at source                                                    | Actual downloaded contents                                                                                       | Assessment for Zoomap                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Quaternius Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html), [creator's download and changelog](https://quaternius.itch.io/universal-animation-library)                                     | CC0 1.0; dedication included in the archive                                       | Standard v3: 43 clips in GLB/FBX, both in-place and root-motion versions; includes ordinary walk, jog and sprint | Recommended. Human joint chains, real pelvis motion, bent knees and coordinated shoulders. A T-pose reference makes the rest-frame conversion inspectable. |
| [Kenney Animated Characters Protagonists](https://kenney.nl/assets/animated-characters-protagonists)                                                                                                                                  | CC0; dedication included in archive                                               | `idle.fbx`, `jump.fbx`, `run.fbx`, a medium character and skins                                                  | Useful stylized running comparison, but this downloaded set has no walk cycle. Not selected as the main locomotion source.                                 |
| [RobotExpressive in three.js](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive), [asset-specific license](https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/RobotExpressive/README.md) | CC0 1.0 credited to Tomás Laulhé; README records Don McCurdy's conversion changes | `Walking` and `Running`, each 0.958333 s; 12 additional action/emote clips                                       | Readable expressive timing, but the robot's long forearms, detached foot targets and exaggerated proportions make direct retargeting less suitable.        |

The Quaternius page advertises the complete library's eight-direction locomotion. The **free Standard archive inspected here contains forward walk/jog/sprint, not the eight-direction set**. The [second library](https://quaternius.itch.io/universal-animation-library-2) was also downloaded: its 43 free Standard clips include a carrying walk and a zombie forward walk, but no ordinary strafe or backward cycles. Do not attribute procedural directional adaptations to authored clips that have not been imported.

## Selected source measurements

These numbers come from the downloaded GLB accessors and skeleton, not the promotional page. The source is the creator's Standard v3 archive uploaded June 16, 2026. The ordinary file disables root translation; `_RM` carries the corresponding authored displacement.

| Clip           |   Duration | Keys per animated channel | Corresponding source root distance | Source average pace |
| -------------- | ---------: | ------------------------: | ---------------------------------: | ------------------: |
| `Walk_Loop`    | 1.333333 s |                        41 |                             1.30 m |           0.975 m/s |
| `Jog_Fwd_Loop` | 0.933333 s |                        29 |                             5.00 m |           5.357 m/s |
| `Sprint_Loop`  | 0.666667 s |                        21 |                             5.50 m |           8.250 m/s |
| `Idle_Loop`    | 2.500000 s |                        76 |                                  0 |                   0 |

Each clip is sampled at 30 Hz and contains 195 channels: translation, rotation and scale for 65 joints. Root translation is exactly zero throughout the three in-place locomotion clips. Their pelvis translation still carries weight shift and vertical motion. Copying only thigh rotations would discard much of the author's animation.

World coordinates after evaluating the source hierarchy are **Y up, +Z forward, left side +X**. The `root` node itself has a −90° X rotation. Child local quaternions therefore cannot be copied into Zoomap's world-aligned sockets without rest-frame conversion.

The T-pose contains `pelvis → spine_01 → spine_02 → spine_03 → neck_01 → Head`; each arm has `clavicle → upperarm → lowerarm → hand`; each leg has `thigh → calf → foot → ball`. Source thigh and calf lengths are approximately 0.40031 m and 0.42948 m. The left ankle is at `(0.089, 0.1037, -0.0358)` and pelvis at `(0, 0.9167, -0.0501)` in the evaluated rest pose. The left toe end is at Z 0.1921 m, confirming forward orientation.

Retarget rotation through the source rest frames while preserving the reference avatar's authored limb lengths and accessory sockets. Scale pelvis displacement to the target proportions. Remove global root travel from the visual pose: Zoomap physics remains responsible for collision, movement and synchronization. Measure the target's effective stride before selecting playback rate. In particular, a literal 4 m/s walk at the unmodified source's 0.975 m/s cadence would visibly slide.

## FK pace and loop checks

The source skeleton was evaluated at every original sample, including every translation, rotation and scale track. [`source-samples.json`](../avatar-studio/assets/source/locomotion/source-samples.json) records 25 semantic world joint frames for the five selected clips. The sampling script was independently compared with Three.js `GLTFLoader` plus `AnimationMixer`: maximum checked position difference was 0.000000253 m and normalized quaternion angle difference 0.000040 degrees.

For pace calibration, use actual planted-toe travel rather than only the `_RM` displacement. Median backward toe speed during conservative flat contact is approximately **0.9794 m/s walk, 5.898 m/s jog, and 8.905 m/s sprint**. The exported root-motion variant underestimates the latter two by about 10% and 8%. The ankle moves more slowly than the toe during heel roll, so ankle translation alone is not a stable pace reference. Full interval measurements and the explicit contact criterion are in [`source-contact-measurements.json`](../avatar-studio/assets/source/locomotion/source-contact-measurements.json).

The authored walk closes exactly. Idle, jog and sprint have a small original left forearm seam: the largest first/last hand displacement is 4.15 mm and forearm rotation difference about 0.78 degrees. Closing or blending that seam is a retargeting adaptation, not a change hidden in the preserved source.

## Download provenance

The free download option was used on the creator's itch.io page; no purchase, login or machine account change was required. The transient signed CDN URL is deliberately not stored as a reproducible source URL. The canonical pack page, archive version and hashes identify the source.

- `UAL1_Standard.glb`: 7,618,436 bytes; SHA-256 `69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997`.
- `UAL1_Standard_RM.glb`: 7,620,504 bytes; SHA-256 `be684571ed655a1b892c2c07e6e2aeca053b606c442d34004adaf1d944090d01`.
- `RobotExpressive.glb`: 463,988 bytes; SHA-256 `047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319`.

Downloaded candidates were inspected under `/tmp/zmap-locomotion-references`. The selected five-clip subset, original review mannequin, license, extraction script, exact rest frames and complete provenance now live in [`avatar-studio/assets/source/locomotion`](../avatar-studio/assets/source/locomotion/README.md). The subset is 1,414,256 bytes. Its nodes, bind frames, geometry and all 1,950 retained animation sampler input/output byte sequences were verified unchanged against the full source. The original 7.6 MB file and other candidates remain outside the repository. The source mannequin is not the runtime player model.
