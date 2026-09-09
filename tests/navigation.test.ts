import { test } from "node:test";
import assert from "node:assert/strict";
import { findWalkPath, canWalkSegment } from "../src/navigation.js";
import {
  bodyAt,
  idleInput,
  movePlayer,
  type Vec3,
  type WorldMap,
} from "../src/core.js";
import { actionYard } from "../examples/action-content.js";

function follow(map: WorldMap, from: Vec3, to: Vec3) {
  const result = findWalkPath(map, from, to);
  assert.equal(result.status, "ready", JSON.stringify(result));
  assert.ok(result.points.length >= 2);
  const body = bodyAt(from);
  for (const point of result.points.slice(1)) {
    let steps = 0;
    while (
      Math.hypot(point.x - body.x, point.z - body.z) > 0.07 &&
      steps++ < 1000
    ) {
      const dx = point.x - body.x,
        dz = point.z - body.z,
        length = Math.hypot(dx, dz),
        speed = Math.min(1, length * 4);
      movePlayer(
        map,
        body,
        { ...idleInput(), x: (dx / length) * speed, z: (dz / length) * speed },
        1 / 30,
      );
    }
    assert.ok(
      steps < 1000,
      `Route blocked at ${JSON.stringify(body)} heading to ${JSON.stringify(point)}`,
    );
    assert.ok(
      Math.abs(body.y - point.y) < 0.15,
      JSON.stringify({ body, point, route: result.points }),
    );
  }
  assert.ok(Math.hypot(body.x - to.x, body.y - to.y, body.z - to.z) < 0.15);
  return result;
}
test("click paths around the wall are executable by normal player physics", () => {
  const from = { x: 0, y: 0, z: 1 },
    to = { x: 4, y: 0, z: 1 };
  assert.equal(canWalkSegment(actionYard, from, to), false);
  const route = follow(actionYard, from, to);
  assert.ok(route.points.some((p) => p.z < -0.98 || p.z > 4.28));
});
test("path to raised bridge takes the ramp; reverse path never drops through the floor", () => {
  const from = { x: -2, y: 0, z: -3 },
    to = { x: 0, y: 2.8, z: 8 };
  const route = follow(actionYard, from, to);
  assert.ok(route.points.some((p) => p.x < -3 && p.y > 0 && p.y < 2.8));
  follow(actionYard, to, from);
});
test("same X/Z on bridge and underpass remain separate navigation layers", () => {
  const lower = { x: 0, y: 0, z: 8 },
    upper = { ...lower, y: 2.8 };
  assert.equal(canWalkSegment(actionYard, lower, upper), false);
  const result = follow(actionYard, lower, upper);
  assert.ok(result.points.length > 3);
  follow(actionYard, { x: -1, y: 0, z: 8 }, { x: 2, y: 0, z: 8 });
});
test("routes reject blocked, unsupported, nonfinite and out-of-bounds destinations", () => {
  for (const to of [
    { x: 2, y: 0, z: 1 },
    { x: 0, y: 5, z: 0 },
    { x: Infinity, y: 0, z: 0 },
    { x: 20, y: 0, z: 0 },
  ])
    assert.equal(
      findWalkPath(actionYard, actionYard.spawn, to).status,
      "unreachable",
    );
});
test("a sealed wall is unreachable; bounded searches fail explicitly and are deterministic", () => {
  const map = structuredClone(actionYard);
  map.blockers = [{ x: 1, y: 0, z: -10, width: 1, depth: 24, height: 10 }];
  const to = { x: 4, y: 0, z: 0 };
  assert.equal(findWalkPath(map, map.spawn, to).status, "unreachable");
  assert.equal(
    findWalkPath(map, map.spawn, to, { maxNodes: 10 }).status,
    "budget-exceeded",
  );
  assert.deepEqual(
    findWalkPath(actionYard, actionYard.spawn, to),
    findWalkPath(actionYard, actionYard.spawn, to),
  );
  assert.throws(() => findWalkPath(map, map.spawn, to, { spacing: 0 }));
});

function splitFloor(gap: number): WorldMap {
  return {
    version: 1,
    id: "navigation-gaps",
    bounds: { x: -3, z: -2, width: 6, depth: 4 },
    spawn: { x: -1, y: 0, z: 0 },
    surfaces: [
      {
        id: "left",
        x: -3,
        z: -2,
        width: 3 - gap / 2,
        depth: 4,
        y: 0,
        thickness: 0.2,
      },
      {
        id: "right",
        x: gap / 2,
        z: -2,
        width: 3 - gap / 2,
        depth: 4,
        y: 0,
        thickness: 0.2,
      },
    ],
    blockers: [],
    toys: [],
    triggers: [],
    placementZones: [],
    protectedZones: [],
  };
}
test("narrow unsupported gaps cannot alias the uniform segment or footprint samples", () => {
  for (const gap of [0.001, 0.015, 0.08]) {
    const map = splitFloor(gap),
      from = { x: -0.25, y: 0, z: 0 },
      to = { x: 0.25, y: 0, z: 0 };
    assert.equal(
      canWalkSegment(map, from, to),
      false,
      `unsupported gap ${gap}`,
    );
    assert.equal(canWalkSegment(map, to, from), false);
    assert.equal(findWalkPath(map, from, to).status, "unreachable");
  }
  // Shared exact boundaries are connected; only actual missing support is rejected.
  const joined = splitFloor(0);
  follow(joined, { x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
});

test("placed blockers participate in both segment checks and executable graph detours", () => {
  const map = splitFloor(0),
    from = { x: -1.2, y: 0, z: 0 },
    to = { x: 1.2, y: 0, z: 0 },
    items = [
      {
        id: "pot-1",
        type: "pot",
        owner: "owner",
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
        revision: 1,
      },
    ],
    catalog = [{ id: "pot", radius: 0.5, height: 1, blocking: true }],
    options = { items, catalog };
  assert.equal(canWalkSegment(map, from, to, options), false);
  const result = findWalkPath(map, from, to, options);
  assert.equal(result.status, "ready");
  const body = bodyAt(from);
  for (const point of result.points.slice(1)) {
    for (
      let i = 0;
      i < 300 && Math.hypot(point.x - body.x, point.z - body.z) > 0.07;
      i++
    ) {
      const dx = point.x - body.x,
        dz = point.z - body.z,
        d = Math.hypot(dx, dz),
        speed = Math.min(1, d * 4);
      movePlayer(
        map,
        body,
        { ...idleInput(), x: (dx / d) * speed, z: (dz / d) * speed },
        1 / 30,
        items,
        catalog,
      );
      assert.ok(Math.hypot(body.x, body.z) >= 0.78 - 1e-8);
    }
    assert.ok(Math.hypot(point.x - body.x, point.z - body.z) < 0.08);
  }
});

test("direct segment sampling also respects an explicit work budget", () => {
  const map = splitFloor(0),
    from = { x: -2, y: 0, z: 0 },
    to = { x: 2, y: 0, z: 0 };
  assert.equal(canWalkSegment(map, from, to, { maxNodes: 10 }), false);
  assert.equal(
    findWalkPath(map, from, to, { maxNodes: 10 }).status,
    "budget-exceeded",
  );
  assert.equal(canWalkSegment(map, from, to, { maxNodes: 1000 }), true);
});
