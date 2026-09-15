# Ball cannon source audit

Reviewed September 9, 2026, before the 3D cannon implementation. This records
observed source behavior separately from the choices needed for Zoomap.

Sources inspected read-only:

- `dafepro/fc-workout-pwa` at
  `0338c77c36d400f9b388b525d30beca281b042e3`, checkout
  `/tmp/zmap-zoomigo-source`.
- `dafepro/canvas` at `b67b79f7ce685d7526b88f68fe1058ba6cbecc89`, checkout
  `/tmp/zmap-canvas-source`.

The source documents describe the Zoomigo application. Its identity, inventory,
placement permits, rewards, and editing rights are context for the consumer, not
instructions to add those policies to `zmap`.

## What the original actually does

The Ball cannon is a fixed prop that catches an existing ball at its rear,
visibly fuses, and launches that same ball beyond its muzzle. It does not create
ammunition, capture avatars, require a fire button, or award a score.

| Property | Observed value |
| --- | --- |
| Definition | `zoomigo-prop-play-ball-cannon`, version 2 |
| Visual footprint | 18 × 10.5 source world units |
| Body | Fixed |
| Intake | Rectangle 4 × 7, local offset `(−7, 0)` |
| Front stop | Solid rectangle 2 × 8, local offset `(+4, 0)` |
| Eligible ball definitions | `beach-ball`, `zoomigo-prop-beach-ball` |
| Hold | Zero linear and angular velocity while eligible contact stays |
| Fuse / continuous dwell | 0.8 seconds; 48 ticks at the source's 60 Hz |
| Exit | Local offset `(+10, 0)`, rotated by the cannon's placement angle |
| Launch velocity | Local `(+50, 0)` world units/second, rotated by placement angle |
| Cooldown | 0.75 seconds, tracked separately for each ball by this cannon |
| Aim controls | General item rotation controls, 15° per step |
| Scale controls | General item scale controls, normally 0.75–1.4 |
| Sleep | Persist transform and behavior state; pause on room sleep |
| Wake | Clear transient target cooldowns |

Definition and defaults:
[`lounge-items.ts:375–412`](https://github.com/dafepro/fc-workout-pwa/blob/0338c77c36d400f9b388b525d30beca281b042e3/app/team-lounge/lounge-items.ts#L375-L412).
Fixed-body and persistence defaults:
[`lounge-items.ts:646–667`](https://github.com/dafepro/fc-workout-pwa/blob/0338c77c36d400f9b388b525d30beca281b042e3/app/team-lounge/lounge-items.ts#L646-L667).
Editor controls:
[`LoungeItemEditor.tsx:330–421`](https://github.com/dafepro/fc-workout-pwa/blob/0338c77c36d400f9b388b525d30beca281b042e3/app/team-lounge/LoungeItemEditor.tsx#L330-L421).

## Timeline and eligibility

1. A contact must be on the configured intake sensor, belong to an item or
   avatar category, and carry one of the two approved ball definition tags.
   Ordinary avatars and other props fail that tag filter. See
   [`lounge-composite-behavior.ts:259–269`](https://github.com/dafepro/fc-workout-pwa/blob/0338c77c36d400f9b388b525d30beca281b042e3/app/team-lounge/lounge-composite-behavior.ts#L259-L269).
2. An eligible `contact.enter` outside cooldown emits `lounge.cannon-fuse`
   with the ball ID and `durationSeconds: 0.8`.
3. Each `contact.stay` outside cooldown first applies the configured damping
   effect. Both factors are zero, stopping translation and spin. The source
   does not attach the ball to a socket or make it kinematic.
4. Once continuous contact reaches the fuse duration, the cannon claims that
   ball's cooldown, teleports it to the rotated exit offset, replaces its
   velocity with the rotated launch velocity, and emits `lounge.cannon` with
   the same ball ID and speed.
5. The ball continues as the same ordinary dynamic ball. Repeated contact
   notifications cannot relaunch it during its cooldown. Leaving the intake
   before the dwell completes prevents firing because no qualifying stay
   event occurs; a fresh contact starts a fresh dwell.

The effect dispatch is
[`lounge-composite-behavior.ts:339–367`](https://github.com/dafepro/fc-workout-pwa/blob/0338c77c36d400f9b388b525d30beca281b042e3/app/team-lounge/lounge-composite-behavior.ts#L339-L367),
damping is
[`654–677`](https://github.com/dafepro/fc-workout-pwa/blob/0338c77c36d400f9b388b525d30beca281b042e3/app/team-lounge/lounge-composite-behavior.ts#L654-L677),
and launch/cooldown is
[`801–840`](https://github.com/dafepro/fc-workout-pwa/blob/0338c77c36d400f9b388b525d30beca281b042e3/app/team-lounge/lounge-composite-behavior.ts#L801-L840).
Canvas derives dwell from the current tick minus contact-start tick in
[`rapier-world.ts:1065–1074`](https://github.com/dafepro/canvas/blob/b67b79f7ce685d7526b88f68fe1058ba6cbecc89/packages/client/src/simulation/rapier-world.ts#L1065-L1074).

The front stop collides with world-static and item-solid layers, but not
avatars. It prevents a ball pushed into the muzzle from simply passing through
to the intake. The cannon's body is not a player blocker. See
[`lounge-items.ts:774–782`](https://github.com/dafepro/fc-workout-pwa/blob/0338c77c36d400f9b388b525d30beca281b042e3/app/team-lounge/lounge-items.ts#L774-L782).

## Flight, hits, and recovery

There is no cannon-specific projectile object, flight integrator, target
damage, avatar knockback, impact effect, or projectile recovery sequence in
the source cannon. Both accepted ball definitions have radius 4.5, mass 0.5,
restitution 0.95, friction 0.05, linear damping 0.05, and angular damping 0.08.
The boardwalk adds linear drag 0.03, angular drag 0.06, a soft speed limit of
40, and elastic bounding walls. These ordinary ball/world rules continue after
launch. Avatar interaction uses the existing ball kick sensor and its
closing-speed/spin behavior.

Sources: system ball and world in
[`scene/beach-boardwalk.ts:10–45`](https://github.com/dafepro/fc-workout-pwa/blob/0338c77c36d400f9b388b525d30beca281b042e3/app/team-lounge/scene/beach-boardwalk.ts#L10-L45)
and
[`99–173`](https://github.com/dafepro/fc-workout-pwa/blob/0338c77c36d400f9b388b525d30beca281b042e3/app/team-lounge/scene/beach-boardwalk.ts#L99-L173);
earned ball in
[`lounge-items.ts:608–644`](https://github.com/dafepro/fc-workout-pwa/blob/0338c77c36d400f9b388b525d30beca281b042e3/app/team-lounge/lounge-items.ts#L608-L644);
kick interaction in
[`lounge-ball-behavior.ts:64–134`](https://github.com/dafepro/fc-workout-pwa/blob/0338c77c36d400f9b388b525d30beca281b042e3/app/team-lounge/lounge-ball-behavior.ts#L64-L134).

Canvas marks the muzzle teleport as a discontinuity with `teleportEpoch`, so
its renderer can snap instead of drawing the ball crossing the barrel. See
[`rapier-world.ts:1438–1444`](https://github.com/dafepro/canvas/blob/b67b79f7ce685d7526b88f68fe1058ba6cbecc89/packages/client/src/simulation/rapier-world.ts#L1438-L1444)
and
[`1548–1568`](https://github.com/dafepro/canvas/blob/b67b79f7ce685d7526b88f68fe1058ba6cbecc89/packages/client/src/simulation/rapier-world.ts#L1548-L1568).

## Artwork and visible feedback

The original asset is
[`public/team-lounge/items/ball-cannon-v1.svg`](https://github.com/dafepro/fc-workout-pwa/blob/0338c77c36d400f9b388b525d30beca281b042e3/public/team-lounge/items/ball-cannon-v1.svg),
a 192 × 112 viewbox containing a teal barrel, a dark round rear intake, an
oversized faceted gold muzzle rim, a gold cradle, two dark wheels with gold
rims/hubs, and a cream forward chevron. These are the recognizable features to
carry into the concept reference. The original is side-oriented 2D vector art,
not an existing 3D mesh or an orthographic modeling sheet.

On the fuse event, React sets a cannon-active flag and starts a local timeout
using the event duration, clamped to 200–3000 ms. The launch event clears that
flag immediately. CSS draws a warm spark above the prop with a 0.18-second
stepped animation; reduced motion removes animation. There is no authored
barrel recoil, smoke burst, wheel response, or character anticipation in the
source. Those would be new 3D presentation work.

Sources:
[`SharedLoungeCanvas.tsx:841–882`](https://github.com/dafepro/fc-workout-pwa/blob/0338c77c36d400f9b388b525d30beca281b042e3/app/team-lounge/SharedLoungeCanvas.tsx#L841-L882)
and
[`globals.css:5151–5190`](https://github.com/dafepro/fc-workout-pwa/blob/0338c77c36d400f9b388b525d30beca281b042e3/app/globals.css#L5151-L5190).

## Source limits to improve in the 3D adaptation

These are implementation observations, not extra source requirements:

- The source has no single-ball chamber owner or cannon-wide busy phase.
  Several eligible balls can have independent dwell/cooldown state. An
  explicit bounded chamber claim would make a physical 3D barrel and shared
  timeline unambiguous.
- The fuse is a transient client effect, not cannon checkpoint state. A late
  joining renderer cannot reconstruct its exact phase from the composite
  state alone. A checkpointed capture/start/fire timeline should drive the
  new model and feedback.
- There is no fuse-cancel event on contact exit; the old spark can continue
  until its timeout even when the ball escaped. A declared cancellation or
  capture-release state removes this ambiguity.
- The source exit offset is rotated but not multiplied by item scale in
  `cannonCommands`. A 3D asset's authored socket transform should determine
  the real muzzle location so art, collision, and launch stay aligned.
- Timing should remain in seconds at Zoomap's simulation rate. Do not copy
  the source's 48-tick fuse literally into the 30 Hz world.
- Keep the same ball identity, deterministic cooldown ownership, and one
  accepted launch across late join, host handoff, loss, and retries. These
  cases need 3D integration tests beyond the source tests listed below.

## Unit conversion is a design choice

Source units are abstract: the board is 100 × 150; the avatar image is 18 × 18,
its collision radius is 4 and speed is 26; ball radius is 4.5. The cannon is
two ball diameters long. Mapping the source ball to a current 0.32 m Zoomap
ball would make the cannon about 1.28 m long and launch speed 3.56 m/s.
Mapping the source avatar speed to Zoomap's 4 m/s instead gives a 2.77 m
cannon and 7.69 m/s launch, with a much larger ball.

Consequently no single scale preserves the old token, ball, and new humanoid
proportions. Choose and record a 3D physical size and launch speed suited to
the courtyard. Preserve the rear-feed interaction, ball identity, 0.8-second
fuse, rotated muzzle, and 0.75-second cooldown; label any speed, pitch,
knockback, chamber, or VFX additions as the new integration's tuning.

## Existing evidence inspected

These tests were read, not rerun as part of this source audit:

- [`lounge-composite-behavior.test.ts:736–834`](https://github.com/dafepro/fc-workout-pwa/blob/0338c77c36d400f9b388b525d30beca281b042e3/app/team-lounge/lounge-composite-behavior.test.ts#L736-L834):
  approved ball only; no fire at 47 ticks; fire at 48; rotated muzzle and
  velocity; no repeated launch at the next dwell event.
- [`lounge-items.test.ts:275–299`](https://github.com/dafepro/fc-workout-pwa/blob/0338c77c36d400f9b388b525d30beca281b042e3/app/team-lounge/lounge-items.test.ts#L275-L299):
  definition version, tag allowlist, tunings, front-stop geometry and mask.
- [`local-simulation.test.ts:236–309`](https://github.com/dafepro/fc-workout-pwa/blob/0338c77c36d400f9b388b525d30beca281b042e3/app/team-lounge/local-simulation.test.ts#L236-L309):
  real local simulation stops a ball pushed against the muzzle while allowing
  the avatar through.
- [`SharedLoungeCanvas.test.tsx:1088–1167`](https://github.com/dafepro/fc-workout-pwa/blob/0338c77c36d400f9b388b525d30beca281b042e3/app/team-lounge/SharedLoungeCanvas.test.tsx#L1088-L1167):
  fuse effect shows the UI spark and launch removes it.
- [`e2e/pwa-team-lounge.spec.ts:1303–1450`](https://github.com/dafepro/fc-workout-pwa/blob/0338c77c36d400f9b388b525d30beca281b042e3/e2e/pwa-team-lounge.spec.ts#L1303-L1450):
  a 320 px browser places the cannon, pushes the ball into its rear, observes
  the fuse for at least 250 ms before launch, and observes the ball pass the
  muzzle at high speed.

Source review establishes the behavior to port. It is not proof that the new
3D asset, animation, collisions, multiplayer timeline, or performance pass.
