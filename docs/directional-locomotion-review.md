# Directional locomotion review

The reported failures were reproduced on `b59a151` using the real modular avatar meshes and runtime. Previous checks covered forward poses, finite diagnostics, floor clearance and equipment fit. Those properties remained valid while the knees visibly twisted and the body folded forward, so they did not establish movement quality.

## Reproduced failures

The neutral-weight avatar, with free hands and fixed forward facing, gave these measurements at 60 Hz:

| Motion                                                      | Largest thigh/shin rotation in one frame | Smallest left/right knee flexion over the cycle | Torso forward inclination |
| ----------------------------------------------------------- | ---------------------------------------: | ----------------------------------------------: | ------------------------: |
| Forward walk, 2.2 m/s                                       |                                     9.6° |                                     1.7° / 7.7° |                10.0–12.4° |
| Backward walk, 2.2 m/s                                      |                                    71.9° |                                     1.7° / 7.7° |                10.0–12.4° |
| Forward sprint, 5.4 m/s                                     |                                    75.9° |                                   36.0° / 44.6° |                37.7–44.8° |
| Backward sprint, 5.4 m/s                                    |                                   136.0° |                                   35.0° / 43.8° |                37.7–44.8° |
| Backward sprint with alternating ±0.00001 m/s lateral noise |                                   136.2° |                                   35.0° / 43.5° |                37.7–44.8° |

Knee flexion is measured geometrically from hip, knee and ankle joint positions; 0° means straight. Torso inclination is the hip-to-head attachment centerline, not a local Euler angle or a claim from the animation diagnostics. The shoe meshes still cleared the floor in these failed cases.

The earlier directional adaptation transformed ankle paths while retaining forward knee poles. It also clamped an `atan2` heading at ±0.55 radians, introducing a 63° foot-yaw discontinuity across the exact-backward sign seam. The new qualification exercises that boundary explicitly.

[Baseline measurements](evidence/directional-locomotion/baseline-summary.json) and [baseline side-view sheet](evidence/directional-locomotion/before-sprint-side.png) preserve the comparison before replacement.

## Qualification method

[`tests/fixtures/directional-review.ts`](../tests/fixtures/directional-review.ts) creates the actual avatar, outfit and two-hand panel through the public studio APIs. It evaluates 120 cases: eight travel directions, an exact-backward sign-seam sequence and abrupt 135° direction changes; each at 2.2 and 5.4 m/s, weights −1/0/+1, and free/occupied hands. The avatar keeps facing forward, so sideways and backward travel cannot accidentally pass by turning the whole model toward the destination.

Each case settles for 120 frames and then measures 180 frames at 60 Hz. Measurements include every frame's world-space joint quaternion deltas, knee extension/flexion, torso posture and both full equipment grip matrices. Every sixth frame independently evaluates the skinned shoe vertices to measure actual floor clearance. Additional knee separation and leg-axis metrics are retained for checking crossing or inverted poses.

The test writes front and side sheets with four comparable cycle phases for every direction, for both free hands and the two-hand panel. These images are visual review evidence; the numerical gates do not replace looking at the silhouette and motion.

Run the regression with `npx playwright test tests/browser/directional-review.spec.ts`. Its output is in [`docs/evidence/directional-locomotion`](evidence/directional-locomotion). The fixture imports the avatar runtime source directly; the broader package and multiplayer tests separately exercise the built consumer package.

Set `ZMAP_RECORD_DIRECTIONAL=1` for a real RAF-paced recording of all eight directions and the exact-backward sign seam at both speeds, plus backward movement with the two-hand panel. Each case records two seconds of the measured motion. The film uses the same evaluated avatar in simultaneous front and side views; the default test run skips recording for speed.

## Regression limits

The regression rejects a joint rotating more than 25° in a steady 60 Hz frame, or 40° during an abrupt input change. Each leg must reach less than 20° flexion during the settled cycle while retaining useful bending, except the authored pure strafe's trailing crossover leg, which must reach below 35°. Maximum flexion is below 165°. The torso centerline must remain between −20° and +24° rather than staying folded toward the floor, and head pitch must remain within 35° of neutral. Actual footwear must clear the ground to within 3 mm and include a support phase within 12 mm of the surface; both equipment grip matrices must agree within 0.00001.

The source KayKit strafe clips use intentional crossover steps, reaching approximately 155.1° knee flexion. Their support leg extends to 0.23° while the trailing crossover leg remains at least 30.04° bent. A categorical no-crossing rule, a 145° flexion ceiling or requiring that trailing leg to straighten would reject the actual choreography. Knee separation remains recorded for visual inspection; continuity, extension and actual mesh fit distinguish a crossover step from an inverted IK pose.

The backward diagonal sprint blends that crossover choreography with the backward-running adaptation. Its trailing leg reaches approximately 21–23° while the support leg straightens, so that specific trailing leg has a 25° limit. The opposite leg and both diagonal walking legs retain the 20° requirement.

These are quality bounds for this avatar family and the tested movement speeds, not universal anatomical limits. They deliberately reject the reproduced baseline while allowing fast authored motion, foot roll, weight transfer and brief running flight.

The first replacement candidate exposed another failure that a minimum-floor test alone misses: both shoes rose roughly 0.50 m during slow strafing. The regression therefore also bounds the maximum clearance of the lowest shoe: 35 mm during walking, 120 mm during running. This permits stylized running flight while rejecting a slow-motion leap used as a walking cycle.

## Final qualified result

The final recording run passed all 120 cases. The largest steady per-frame joint change was 19.59°; the largest during abrupt direction changes was 34.45°. Across all weights and equipped states, torso inclination stayed between −3.11° and +21.07°. Every walking sample retained shoe support; maximum running flight was 69.6 mm, and every running case reached a support phase within 1.2 mm of the ground.

Equipment required a separate correction: the source hips can yaw 58.5° during sprint strafing. Resetting the chest's _local_ rotation preserved that yaw in the carried item, so both hand grips could fit perfectly while the panel pointed away from the player's intended aim. The regression now compares the panel's full face rotation against its neutral avatar-relative frame and checks world carrier yaw, in addition to checking both grip matrices. The corrected carrier held zero measurable aim rotation error across all tested directions, and the largest grip matrix error was below 0.00000000000003.

The [final recording](evidence/directional-locomotion/directions.webm) contains 40.6 seconds at 768 × 558 and 60 frames/s. The [full measurements](evidence/directional-locomotion/metrics.json), [walking side views](evidence/directional-locomotion/2.2-side.png), [sprint side views](evidence/directional-locomotion/5.4-side.png), and [equipped sprint views](evidence/directional-locomotion/5.4-held-side.png) accompany it. These are real evaluated meshes and runtime motion, not concept images.
