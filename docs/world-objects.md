# Authored world objects

An app can add a passive shared object without modifying Zoomap's relay, wearable tool IDs, or renderer. The map supplies data; the app installs the same versioned behavior implementation in its browser client and room service.

```ts
import { Zoomap, cannonBehavior, cannonObject } from "zmap";
import { createRoomService } from "zmap/server";

const objectBehaviors = [cannonBehavior];
const map = {
  ...courtyard,
  objects: [
    cannonObject("yard-cannon", { x: 6, y: 0, z: -4 }, 0, ["cannon-ball"]),
  ],
};
const world = new Zoomap({ container, map, catalog, objectBehaviors, visuals });
createRoomService({
  server,
  map,
  catalog,
  objectBehaviors,
  store,
  authenticate,
  canAccess,
});
```

`cannon-ball` must identify an existing `map.toys` entry. This allowlist is supplied by the consuming application; Zoomap does not read inventory tags, entitlements or reward rules. All geometry uses metres, Y up, and local +Z forward. `objectPoint(instance, localPoint)` transforms authored intake/muzzle anchors into world space. The example asset and simulation use the same anchors.

## Cannon behavior

The cannon recycles an existing ball. A sphere entering the rear intake starts a continuous 24-tick (0.8 second) fuse. During the first 12 ticks it withdraws behind the rear lip if necessary, lifts and centers behind that lip, then enters the bore. It stays seated for the remaining fuse. This deliberately adapts the source's frozen 2D contact to the 3D barrel: a floor ball cannot roll through the elevated opening without lifting. The actual shared body follows the loading path; there is no hidden or visually offset duplicate. On completion the same ball appears at the muzzle with a horizontal velocity along the object's rotation. The preset uses 14 m/s, explicitly adapted for the 3D courtyard. The individual ball cannot reload this cannon for 23 ticks (0.767 seconds, rounded up from the source's 0.75 seconds at 30 Hz).

There is one chamber owner at a time. Other eligible balls remain physical objects while the chamber is occupied. This is an intentional improvement over the source's independent overlapping contact timers. Reordering the toy record or map objects cannot choose a different owner: objects and eligible toy IDs are processed in stable code-point order.

An external displacement away from the expected loading path cancels the fuse. The path derives from the captured initial position and accepted simulation tick, so every checkpoint restores the same pose. Kinematic loading uses the shared physics substeps and actual sweep velocity for contacts; incoming balls cannot pass through it, and a moving motor does not add an elastic bounce boost. Once seated, incoming balls bounce normally against the held ball. The intake performs a swept sphere check, so fast balls cannot skip a narrow sensor or load through a thin wall. Intake checks include height. The front stop affects toys only, matching the Canvas cannon's collision mask; avatar movement and navigation ignore it. A blocked loading path or outlet emits a `blocked` event instead of pulling a ball through the obstacle. Normal shared ball collision, gravity, wall bounce and friction resume immediately after firing. The cannon does not launch avatars, create ammunition, score hits or grant rewards.

Capture, loading and outlet clearance all use the public `spherePathClear` helper with the ball's full radius. It measures swept distance to boxes and placed cylinders, includes rotated object colliders, and conservatively expands the face planes of sloped slabs. A clear centerline or a few clear offset rays are insufficient at a corner. Floor and wall tangency remain permitted; a side wall or underside touching the sphere's volume blocks loading before penetration. Clearance uses a 1-micrometre numerical tolerance. Slab-edge clearance on ramps is intentionally conservative.

`cannonConfig(ids)` exposes the intake center/size, muzzle, speed and bounded timing values. `cannonObject(...)` is a convenient instance factory; applications may supply the explicit `WorldObject` data themselves. Its `toyColliders` are local oriented boxes and are transformed with the same instance rotation as the model.

Startup validation reserves room for the full rear loading envelope and accepted ball radii, not only the intake and muzzle centers. A cannon too close to the map edge is rejected before entry instead of producing out-of-bounds held balls and rejected checkpoints.

## Timeline and recovery

`Simulation.objects.instances[instanceId]` holds each behavior's checkpoint. The cannon stores per-ball phase, start/deadline ticks and contact position. `Simulation.objects.events` contains at most 32 accepted events, retained for at most 120 ticks, with a room-monotonic ID, object ID, simulation tick, kind and bounded data.

For the cannon, event kinds are `fuse`, `fire`, `cancel`, and `blocked`. Data contains `toy` and `position`; `fire` also contains launch `velocity`. Render from accepted state and event age. Do not restart a fuse when a new browser joins or when the renderer is recreated. Events describe effects; they are not commands that should launch a ball again. A renderer may retain a bounded set of event IDs for one-shot audio and effects.

The service checkpoints object state in the same accepted host snapshot as players and toys. A replacement host resumes that snapshot's exact fuse deadline and cooldown. There are no wall-clock timeouts or local callback handles to reconstruct. No separate cannon wire message is needed: entering the shared intake is the action. The `world-objects-v1` capability is required on maps using these objects; incompatible clients fail entry instead of silently simulating a different world.

Intentional movement discontinuities increment the ball's optional `Body.teleportEpoch`. Display interpolation holds the earlier pose until the new checkpoint is displayed, then changes the ball and fire timeline together. Rolling presentation does not turn the jump into a false rolling journey through the barrel.

Like existing transient toys, object timelines sleep when the room becomes empty. A later room instance starts from authored state. This does not change durable layout or application-owned inventory. Cannon aiming is currently authored map rotation; this increment does not expose interactive placement/rotation or invent a manual fire control absent from the source behavior.

## Adding another behavior

Implement the exported `ObjectBehavior` interface:

- `id` and `version` select the implementation referenced by map data.
- `validateConfig(config, object, map)` rejects unsupported values and invalid references before entry.
- `initialState(object)` returns JSON-compatible transient state.
- `validState(state, object, map, tick)` validates received checkpoints and initialization.
- `validEvent(event, object, map)` validates the effect's semantic shape at emission and checkpoint acceptance. The cannon rejects unknown event kinds, unapproved toy references, missing/null positions and fire vectors that disagree with its physical muzzle and launch direction.
- `step(context)` advances one fixed simulation step. It can inspect shared bodies, update its own state, acquire a kinematic toy hold and emit a bounded event.

Install this implementation in both app integration points. Behavior functions are trusted application code, not scripts downloaded from a peer or embedded in map JSON. They must be deterministic and bounded: use simulation ticks, stable ordering and explicit state, not `Date.now()`, timers, unseeded randomness, network calls or renderer transforms. CPU isolation for arbitrary third-party code is not provided.

Required callbacks are checked at startup for JavaScript consumers as well as TypeScript callers. `emit` takes ownership of a cloned data value, so later app mutations cannot rewrite an accepted event. `holdToy(id, target?)` optionally supplies the next physical position; the ball solver sweeps toward that position during its shared substeps.

Limits are five active objects, eight toy collider boxes per object, 2 KiB configuration per object, 16 KiB total object checkpoint, 32 events and 512 bytes per event data. JSON structure, finite numbers, identifiers and depth are bounded; unsupported implementations, extra top-level object/state fields and malformed cannon state are rejected. This contract covers passive fixed-step behavior. A future item requiring direct user commands should add a validated generic interaction contract; it should not tunnel commands through an effect event.

## Evidence

`tests/cannon.test.ts` checks the source timing, same-ball reuse, rotation, cooldown, exclusive chamber, kinematic ball contacts, front-stop masks, exact sphere/swept intake, height, wall clearance, cancellation, malformed content/state, generic custom behavior, teleport presentation and deterministic checkpoint replay. `tests/cannon-server.test.ts` uses real sockets to check late join, host loss halfway through a fuse, one accepted launch, cooldown continuity, capability rejection, state injection, event rollback and stale authority.

The deterministic Node capacity exercise runs five cannons, five balls and twenty actors for 120 simulated seconds with repeated loading. Its diagnostics report the actual fixed-step p95 and maximum checkpoint bytes on the test machine. This is simulation evidence, not browser frame time, impaired-network throughput or physical-phone performance.
