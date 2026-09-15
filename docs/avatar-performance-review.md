# Avatar performance qualification

The performance review places the **original animated GLB** next to the real
modular Zoomap avatar at body weights −1, 0 and +1. Each contact sheet shows
front and side views at three moments. The video records the same comparisons
through the full authored motion, including the appearance/disappearance marker
of equipment. The source model is uniformly scaled for display and reflected in
X to match the documented target handedness; its original animation tracks are
played directly by Three's AnimationMixer.

See [the recording](evidence/avatar-performances/performances.webm),
[wave](evidence/avatar-performances/wave.png),
[dance](evidence/avatar-performances/dance.png),
[shared panel draw](evidence/avatar-performances/wield-rebound-panel-equip.png),
[wake driver draw](evidence/avatar-performances/wield-wake-driver-equip.png), and
[all measurements](evidence/avatar-performances/metrics.json).

## What is actually sourced

Wave and cheer use KayKit's Waving and Cheering. Dance uses Quaternius
Dance_Loop, bounded to three cycles. Yes and no use Quaternius Yes and
Idle_No_Loop. These are authored full-body performances retargeted to the
modular rig, with a grounded target shoe correction and bounded entry/exit blend.
Source licenses, original files, sampler verification and derivation details are
in [the source folder](../avatar-studio/assets/source/performances/README.md).

Equipment draw/stow uses a **reach adaptation** of KayKit PickUp, retimed to
0.8 seconds for one hand and 1 second for a shared item. Stowing reverses the
reach. A shared item adds a second rigid grip, reach/joint constraints, floor
clearance and preservation of its approved hold's forward separation from the
avatar. This is not a native two-hand clip or a physical ground-pickup action.
The source appears beside the target so the adaptation is visible and reviewable.

## Regression coverage

The new browser fixture evaluates 63 sequences at 60 Hz: five emotes at three
weights, plus equip and stow for all eight approved items at those weights.
It measures world joint rotation per frame, the physical avatar root, actual
skinned shoe vertices, full matrices of every visible grip, one visibility
marker per transition and the settled drawn state. The original GLB loader is
also checked against independently sampled world-joint positions and rotations
at 80 original source timestamps. Simply setting an AnimationAction's time
would not prove that its tracks were bound to real source bones.

The independent unit qualification adds these cases:

- Repeated targets, rapid authoritative reversal with a fractional start,
  immediate late-join state, invalid input rejection and reduced motion.
- Different left/right drawn states, input ownership and a single shared owner.
- Appearance replacement without advancing an accepted animation clock.
- Slow and failed asset swaps preserving the previous complete owner; completing
  a load while stowed cannot reveal the new item.
- Emote stow/restore, replacing a queued emote, explicit stow superseding captured
  restoration, hidden equipment, disposal and stale async completion.
- All eight items, both primary hands, three weights and eleven transition
  samples: 528 candidate states. Every visible item is tested against actual
  posed trunk/leg triangles and the floor. Replaced relaxed hand meshes are
  excluded from this anatomy check because their intentional grip contact is
  separately verified using the complete attachment matrices.

The body intersection check evaluates skinning once per pose and ray-tests item
triangle edges against that evaluated surface. It retains anatomy hidden by
clothing, so a garment cannot conceal a tool passing through a thigh. This
caught broad equipment sweeping backward through the pelvis during an early
shared-item reach. The generic forward-clearance constraint removed those
crossings while preserving both exact grip frames.

## Measurement limits

`poseP95Ms` times only the avatar pose update, including held-item constraint
solving. It excludes rendering, source playback, screenshots, asset loading,
networking and geometry audit work. It is a local desktop Chrome measurement,
not a phone or a 20-avatar room benchmark. Geometry and ownership gates are
assertions; timing is recorded as diagnostic evidence rather than a flaky
machine-dependent pass/fail threshold.

These tests qualify the modular runtime. The separate Action Yard multiplayer
journey verifies accepted emote/equipment clocks, peer presentation and handoff.
No equipment entitlement or inventory policy is introduced here.

The development-only [interactive review](http://localhost:5173/review/performances.html)
runs the same canonical source and target assets, then replays the captured
comparison. It is intentionally absent from the production build inputs.

## Reproduce

Run `node --import tsx --test avatar-studio/tests/performance.test.ts` from the
repository root. Run
`npx playwright test tests/browser/performance-review.spec.ts` for the rendered
contact sheets and geometry metrics. Add `ZMAP_RECORD_PERFORMANCES=1` to record
the source/target video. The fixture reads canonical approved assets directly;
it does not substitute primitives or wait for a second application's asset copy.

The movie uses a separate real-time source clock and captures the native WebGL
canvas with front/side scissor views. Geometry qualification still samples a
deterministic 60 Hz timeline. Keeping those passes separate prevents screenshot
readback cost from making a correct animation appear to play in slow motion.
