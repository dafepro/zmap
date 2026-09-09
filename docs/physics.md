# Shared ball contacts and Wake Driver motion

The deterministic world core owns motion and contacts. Renderers consume body coordinates and accepted action phases; they do not generate a second jump, strike, ball impulse, or world outcome.

## Ball authoring and contacts

`Toy.radius` is the collision radius in metres. A toy body's `y` is its bottom; its sphere centre is `(x, y + radius, z)`. This distinction matters for different ball sizes, vertical piles, and separate bridge levels.

`Toy.mass` optionally specifies kilograms, validated between 0.01 and 1,000. Omitted mass uses equal density: `(radius / 0.3) ** 3`, so a 0.3m ball weighs 1kg. Pair restitution is the lower of the two authored restitution values. Low-speed resting contacts suppress restitution. A pair impulse changes only velocity along its actual three-dimensional contact normal and preserves pair linear momentum; tangential velocity is unchanged. Terrain can supply an external reaction.

Every ball shares the same time subdivisions of the 30Hz world step. Subdivision limits travel relative to the smallest radius, including opposing balls. Each subdivision alternates terrain constraints and sphere contacts, then propagates ground support through resting contacts. This prevents piles with large mass ratios from gradually interpenetrating while pair impulses converge. Position corrections do not add a velocity bias. Source order is normalized by ID, including toy interactions with players and triggers.

Existing floor resistance continues to act on the whole rolling velocity vector. On flat ground it cannot turn or reverse a roll. Gravity supplies downhill motion on slopes. Blockers, room boundaries, placed objects and bridge slabs remain physical constraints after ball separation.

The authored room limit remains five toys. This is a bounded shared toy simulation, with spherical toy collision shapes; arbitrary rigid mesh simulation is outside this interface.

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
