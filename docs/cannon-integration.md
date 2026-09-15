# Cannon in the Action Yard

The Fieldwork application at `/action.html` installs a stationary ball cannon in
the same courtyard as the winch, rebound panel and wake driver. **Walk to cannon**
uses the normal terrain navigation. **Kick ball** sends the normal kick input;
it does not spawn ammunition, invoke a special test action or teleport the player.
The gold ball starts behind the rear intake. The three other loose balls are also
approved for this cannon.

The app declares the cannon and its approved toy IDs in
`examples/action-content.ts`, and installs `cannonBehavior` on **both** the
`Zoomap` client and `createRoomService`. Zoomigo item tags, ownership and access
remain outside the library. See `cannon-source-audit.md` for the source behavior
and `world-objects.md` for the shared object contract.

## Model and presentation contract

`examples/cannon-model.ts` loads the real Blender export from
`examples/hub/public/models/ball-cannon.glb` before opening the room. An unavailable,
oversized or mechanically incompatible asset stops entry with a visible retry
message. The app does not replace a missing cannon with unrelated geometry.

The GLB uses metres, Y up and local +Z forward. Required nodes are:

| Node | Responsibility |
| --- | --- |
| `barrel_recoil` | Cosmetic barrel translation along local Z |
| `fuse_tip` | Spark attachment point |
| `gauge_needle` | Pressure needle pivot; local Z rotation |
| `indicator_0`, `indicator_1`, `indicator_2` | Independently coloured fuse progress lights |
| `intake` | Static rear physical socket, nominal `(0, 0.85, -1.12)` |
| `muzzle` | Static exit socket, nominal `(0, 0.85, 1.32)` |

The loader checks all nodes and checks the physical sockets against the instance
configuration within 6 cm. Static sockets remain separate from the recoiling
barrel. The simulation launches from the authored muzzle; visual recoil cannot
change the launch location or velocity.

The consuming app combines the avatar scenery and cannon scenery, then supplies
`visuals.frame` to update the cannon once per displayed frame. This hook receives
the displayed simulation, time in seconds, reduced-motion preference and drawing
buffer dimensions. It runs after character and ball transforms and before the
renderer draws. No particular player has to exist for the cannon to animate.

All effects derive from accepted object state and event ticks. The pressure lights,
needle and sparks show the 0.8-second fuse. Teal intake flow explains the shared
ball being lifted and drawn into the bore during loading. An accepted fire produces barrel recoil,
a muzzle puff, a pressure ring and a short trail following that same ball's actual
positions. There is no local timeout that can fire an effect after a cancelled fuse.
Presentation interpolates at most one tick, so a stalled room cannot keep advancing
its animation. A late join reads the shared fuse start/end rather than restarting it.

Nearby hands-free characters briefly crouch and lean back at an accepted launch.
This is a cosmetic pose; it does not move their shared body or interrupt a held tool.

Reduced motion keeps the needle, lights and a quiet fading ring while suppressing
barrel movement, startle poses, intake flow, sparks, smoke and trail. Particle
storage is fixed at 10 sparks, 8 intake-flow particles, 16 puff particles and
14 trail points per cannon. Kit disposal removes its scene
roots and releases geometry, materials, styles and instance resources.

## Validation

`tests/browser/cannon.spec.ts` exercises:

- Walking to the rear and kicking the existing ball through the normal controls.
- Three real clients with shaped traffic, late join during the fuse, closing the
  actual elected host, one identical launch event, retained ball identity, the
  24-tick fuse, approved exit/velocity, bounded checkpoint size and recovery time.
- A failed GLB request stopping room entry.
- Closing while avatar preparation is pending, and a room-entry failure releasing
  navigation frames, the canvas and all completed visual resources.
- Portrait layout and reduced-motion behavior.
- Captures of the actual in-courtyard model during fuse and recoil.

Evidence is written to `docs/evidence/cannon/`. These browser measurements are
local desktop observations, not physical-phone performance certification.
