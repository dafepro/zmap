# Walking to a destination

Zoomap exposes bounded geometry navigation separately from controls. The consuming application owns pointer gestures, joystick presentation, markers and interaction decisions. `findWalkPath` uses the same player blocking volume as movement, preserving overlapping bridge and underpass surfaces. It searches around obstacles and connects sloped routes; it does not jump gaps or drop from a ledge.

```ts
import { findWalkPath } from "zmap";
const result = findWalkPath(map, world.local, destination, {
  items: world.durable.items,
  catalog,
});
if (result.status === "ready") {
  // Follow result.points in order, using the local predicted position.
  world.setWorldInput(direction.x, direction.z);
}
// Release on arrival, interrupted interaction, loss of focus and disposal.
world.setWorldInput(0, 0);
```

Directions use horizontal world axes, with a maximum magnitude of one. Values below one provide proportional movement speed. The existing `setInput(x,y)` remains screen relative and keyboard controls remain available. Navigation does not write positions, send a privileged teleport or bypass authority. Each frame still submits ordinary movement input; the shared simulation determines the result.

`findWalkPath` returns `ready` with exact endpoints and collision-checked waypoints, `unreachable`, or `budget-exceeded`. Default spacing is 0.4 m, with a 20,000 surface-candidate/search budget; limits are explicit. `canWalkSegment` samples grounded movement every 10 cm and at exact surface boundaries, including a support footprint so paths do not skim exact platform edges. Supplied placements and catalog definitions are checked by the physics occupancy helper. Recompute after a layout change; do not blindly follow a stale route.

Action Yard implements the complete consumer in `examples/navigation-controls.ts`. Click/tap picks actual sloped/elevated surface planes, displays a route and destination, and follows waypoints with arrival braking. A fresh tap redirects; Stop, Escape, keyboard movement, tool activation, backgrounding and disposal cancel path following. A bounded replan handles changed layouts or disrupted motion. A destination selected during an airborne action waits for landing, then plans from the actual supported position. An explicit joystick mode uses captured pointer input, a dead zone and cancellation on pointer loss. Neither mode installs competing movement loops while idle. A second touch cannot steal the active joystick pointer.

Tests execute returned routes with normal player physics around the Action Yard wall, up and down its ramp and between its overlapping height layers. Browser tests additionally drive real click/tap input, a remote friend, retained positions, redirection, cancellation, joystick input and portrait layout. This is local navigation over the supported rectangular/slope map contract, not arbitrary triangle-mesh navmesh generation or crowd avoidance.
