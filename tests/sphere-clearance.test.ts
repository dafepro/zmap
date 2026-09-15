import { test } from "node:test";
import assert from "node:assert/strict";
import { spherePathClear } from "../src/sphere-clearance";
import type { WorldMap } from "../src/core";
function map(): WorldMap {
  return {
    version: 1,
    id: "sweep",
    bounds: { x: -10, z: -10, width: 20, depth: 20 },
    spawn: { x: 0, y: 0, z: 0 },
    surfaces: [
      {
        id: "floor",
        x: -10,
        z: -10,
        width: 20,
        depth: 20,
        y: 0,
        thickness: 0.3,
      },
    ],
    blockers: [],
    toys: [],
    triggers: [],
    placementZones: [],
    protectedZones: [],
  };
}
test("sphere sweeps include flat slab undersides and preserve floor/ceiling tangency", () => {
  const world = map(),
    from = { x: 0, y: 0.85, z: -1 },
    to = { x: 0, y: 0.85, z: 1 };
  assert.equal(
    spherePathClear(world, { ...from, y: 0.35 }, { ...to, y: 0.35 }, 0.35),
    true,
  );
  world.surfaces.push({
    id: "ceiling",
    x: -1,
    z: -2,
    width: 2,
    depth: 4,
    y: 1.3,
    thickness: 0.2,
  });
  assert.equal(spherePathClear(world, from, to, 0.35), false);
  world.surfaces[1].y = 1.4;
  assert.equal(spherePathClear(world, from, to, 0.35), true);
});
test("sloped slabs expand along their normal, including an underside that never crosses the sphere centerline", () => {
  const world = map();
  world.surfaces.push({
    id: "ramp",
    x: -1,
    z: -1,
    width: 2,
    depth: 2,
    y: 1.4,
    slope: 0.5,
    thickness: 0.2,
  });
  const from = { x: 0, y: 0.9, z: -1 },
    to = { x: 0, y: 1.9, z: 1 };
  assert.equal(spherePathClear(world, from, to, 0.35), false);
  assert.equal(
    spherePathClear(world, { ...from, y: 0.7 }, { ...to, y: 1.7 }, 0.35),
    true,
  );
});
test("blocking placed cylinders use full radius and rounded top-edge distance, independent of decorative rotation", () => {
  const world = map(),
    catalog = [{ id: "post", radius: 0.12, height: 1, blocking: true }],
    items = [
      {
        id: "one",
        type: "post",
        owner: "ari",
        position: { x: 0.4, y: 0, z: 0 },
        rotation: 1.3,
        revision: 1,
      },
    ];
  const from = { x: 0, y: 0.85, z: -1 },
    to = { x: 0, y: 0.85, z: 1 };
  assert.equal(spherePathClear(world, from, to, 0.35, items, catalog), false);
  assert.equal(
    spherePathClear(
      world,
      { ...from, y: 1.2 },
      { ...to, y: 1.2 },
      0.35,
      items,
      catalog,
    ),
    false,
  );
  assert.equal(
    spherePathClear(
      world,
      { ...from, y: 1.22 },
      { ...to, y: 1.22 },
      0.35,
      items,
      catalog,
    ),
    true,
  );
  items[0].position.x = 0.47;
  assert.equal(spherePathClear(world, from, to, 0.35, items, catalog), true);
  catalog[0].blocking = false;
  items[0].position.x = 0;
  assert.equal(spherePathClear(world, from, to, 0.35, items, catalog), true);
});
test("oriented world-object toy colliders participate in the same swept sphere clearance", () => {
  const world = map();
  world.objects = [
    {
      id: "gate",
      behavior: "authored",
      version: 1,
      position: { x: 0, y: 0, z: 0 },
      rotation: Math.PI / 4,
      config: {},
      toyColliders: [
        { center: { x: 0.4, y: 0.5, z: 0 }, size: { x: 0.1, y: 1, z: 1 } },
      ],
    },
  ];
  assert.equal(
    spherePathClear(
      world,
      { x: 0, y: 0.5, z: -1 },
      { x: 0, y: 0.5, z: 1 },
      0.35,
    ),
    false,
  );
  assert.equal(
    spherePathClear(
      world,
      { x: -2, y: 0.5, z: -1 },
      { x: -2, y: 0.5, z: 1 },
      0.35,
    ),
    true,
  );
});
