# Shared ball contacts and Wake Driver motion

The deterministic world core owns motion and contacts. Renderers consume body coordinates and accepted action phases; they do not generate a second jump, strike, ball impulse, or world outcome.

## Ball authoring and contacts

`Toy.radius` is the collision radius in metres. A toy body's `y` is its bottom; its sphere centre is `(x, y + radius, z)`. This distinction matters for different ball sizes, vertical piles, and separate bridge levels.

`Toy.mass` optionally specifies kilograms, validated between 0.01 and 1,000. Omitted mass uses equal density: `(radius / 0.3) ** 3`, so a 0.3m ball weighs 1kg. Pair restitution is the lower of the two authored restitution values. Low-speed resting contacts suppress restitution. A pair impulse changes only velocity along its actual three-dimensional contact normal and preserves pair linear momentum; tangential velocity is unchanged. Terrain can supply an external reaction.

Every ball shares the same time subdivisions of the 30Hz world step. Subdivision limits travel relative to the smallest radius, including opposing balls. Each subdivision alternates terrain constraints and sphere contacts, then propagates ground support through resting contacts. This prevents piles with large mass ratios from gradually interpenetrating while pair impulses converge. Position corrections do not add a velocity bias. Source order is normalized by ID, including toy interactions with players and triggers.

Existing floor resistance continues to act on the whole rolling velocity vector. On flat ground it cannot turn or reverse a roll. Gravity supplies downhill motion on slopes. Blockers, room boundaries, placed objects and bridge slabs remain physical constraints after ball separation.

The authored room limit remains five toys. This is a bounded shared toy simulation, with spherical toy collision shapes; arbitrary rigid mesh simulation is outside this interface.

## Timed contextual strikes (0.1.10; per-ball flight in 0.1.11)

An app may opt a toy into `strike: { speed, closeLift }` and set a positive
`map.kickWindup`. This selects the ball's horizontal ground speed (metres per
second) and the vertical velocity of the closest grounded strike. Other toys
retain the previous 8 m/s, 3 m/s kick. `Toy.rollingResistance` optionally
overrides a surface's ground deceleration for one toy; `Toy.restitution` still
controls bounce. The room negotiates `strike-v1` as well as `kick-windup-v1`.

At the kick press, the shared simulation predicts the toy centre at contact
from its current velocity and gravity and selects a target in reach. It refreshes
that target during windup. A header anticipates a 0.44 m physical jump; a
bicycle kick anticipates 0.69 m. Launch speed is `sqrt(2 × 18 × jumpHeight)`.
The player keeps normal steering and collision, so a ceiling can shorten a
jump. At the exact existing contact tick, the _actual_ toy centre and player
position decide the result. A ball crossing 1.0 m above the player's supporting
surface switches from a ground kick to a header; above 2.35 m it switches to a
bicycle kick, and above 3.2 m it is unreachable. Aerial contact requires a
committed jump, at least 0.12 m of actual lift, horizontal distance at most
1.1 m, and the toy centre within 0.55 m of the 1.55 m head contact point or
0.5 m of the 2.15 m overhead boot point. Ground reach is 1.65 m. Height-aware
blockers still reject contact. A miss does not grant an impulse.

For ground contact, vertical speed blends from `closeLift` at 0.65 m or nearer
to 0.25 m at 1.3 m or farther, creating a close loft and a distant low roll.
Headers use 0.82 × the authored horizontal speed and 2.2 m/s upward; bicycle
kicks use 1.15 × and 4.2 m/s upward. The shot points from the player's actual
contact position to the ball; a ball directly over the player uses facing.
The player snapshot carries `strike: { toy, kind, target, jumpHeight }`; target
is a world-space sphere centre updated during anticipation and fixed at actual
contact. It is bounded and copied by the relay through late join and host
transfer. The app's rig can aim a head or boot at this target and use the same
physical body height; it must not create a second world-space jump.

`Toy.gravity` (1–30 m/s²) optionally sets that toy's airborne and downhill
acceleration; omitted toys keep 18 m/s². Strike anticipation uses the same
authored gravity so a timed header predicts the correct contact height.
`strike.closeSpeed` (greater than zero, up to 20 m/s) optionally slows
horizontal travel at 0.65 m or nearer, blending into `strike.speed` at 1.3 m.
Omitting it preserves the existing horizontal speed. These fields negotiate
`ball-flight-v1` when present; older clients cannot silently join a room that
uses them. The host applies any live changes to its shared simulation map;
applications own their own tuning UI and host handoff policy.

## Wake Driver accepted action sequence

`PlayerActionState.phaseStarted` is the tick when its current phase began. `phaseUntil` is the next fixed transition or the airborne safety deadline. Both are serialized and validated with the rest of the checkpoint. `WAKE_MOTION` contains the fixed physical timings and launch speeds.

| Phase       | Physical behavior                                                                        | Transition                                        |
| ----------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `charging`  | Grounded anticipation; movement and facing lock                                          | After 6 ticks                                     |
| `leaping`   | Body receives 4.8m/s upward velocity, then ordinary gravity and ceiling/floor collisions | Actual supported landing; 45-tick safety deadline |
| `impact`    | Feet on the ground; one pulse at the supported strike position                           | After 3 ticks                                     |
| `recoiling` | Body receives a second 2.7m/s upward velocity                                            | Actual supported landing; 30-tick safety deadline |
| `cooldown`  | Ordinary movement; no new activation until the tool's existing cooldown expires          | Cooldown expires                                  |

`finishActions` runs after player collision integration, so a timer cannot produce a midair pulse. The strike point follows sloped ground. An unsupported ledge, another storey, or an intervening wall cannot create a pulse there. Pulse forces affect the real nearby ball and player bodies and retain the existing height, reach, obstruction and immunity rules.

Releasing the use button allows this press action to finish. Explicit cancellation or equipment changes abort it; existing airborne velocity continues under gravity. Starting another action while airborne is rejected. `actionMovementLocked` exposes the same lock rule to local prediction. `Body` and `Input` retain their previous shapes.

Presentation may use crouch, knee tuck, tool compression and impact effects to make the sequence legible. It must derive them from accepted phases and authoritative pulse events. A renderer must not add another world-space height offset or replay pulse forces.

## Verification

`tests/ball-contacts.test.ts` covers opposing high-speed small balls, analytic unequal-mass elastic impact, glancing contact momentum/energy, three-ball stacks through the full supported mass range, thin-wall chains, vertical impacts with unequal radii, bridge separation, slopes and reordered deterministic replay.

`tests/world-actions.test.ts` covers true lift, landing-only pulse, recoil, settling, locked movement, cancellation without teleportation, low ceilings, supported strike heights, obstruction and per-phase checkpoint replay. Existing rolling resistance, floor bounce, thin obstacle and bridge-underpass regressions remain in `tests/physics.test.ts` and `tests/core.test.ts`.

The existing 20-player/five-toy test runs all three tool presets for 120 simulated seconds, asserting finite bounded state, the 32-event ring and the fixed-step deadline. This is a Node simulation measurement; it is not a physical-phone rendering or network-latency result.
