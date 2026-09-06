import { test } from "node:test";
import assert from "node:assert/strict";
import { bodyAt, initialSimulation, stepWorld, type WorldMap } from "zmap/core";
const flat = (): WorldMap => ({
  version: 1,
  id: "physics",
  bounds: { x: -20, z: -20, width: 40, depth: 40 },
  spawn: { x: 0, y: 0, z: 0 },
  surfaces: [
    { id: "floor", x: -20, z: -20, width: 40, depth: 40, y: 0, thickness: 1 },
  ],
  blockers: [],
  toys: [
    {
      id: "ball",
      home: { x: 1, y: 0, z: 1 },
      radius: 0.38,
      color: "#fff",
      sleep: "home",
    },
  ],
  triggers: [],
  placementZones: [],
  protectedZones: [],
});
test("rolling resistance slows the velocity vector without steering or reversing it, then sleeps", () => {
  const map = flat(),
    s = initialSimulation(map),
    b = s.toys.ball;
  b.vx = 1.2;
  b.vz = 0.9;
  let speed = Math.hypot(b.vx, b.vz);
  for (let i = 0; i < 300; i++) {
    stepWorld(map, s, {});
    const next = Math.hypot(b.vx, b.vz);
    assert.ok(next <= speed + 1e-10);
    if (next > 0) {
      assert.ok(Math.abs(b.vx * 0.9 - b.vz * 1.2) < 1e-8);
      assert.ok(b.vx >= 0 && b.vz >= 0);
    }
    speed = next;
  }
  assert.equal(speed, 0);
});
test("airborne ball has light drag, and bounces instead of sticking on first floor impact", () => {
  const map = flat(),
    s = initialSimulation(map),
    b = s.toys.ball;
  b.y = 2;
  b.vx = 3;
  stepWorld(map, s, {});
  assert.ok(b.vx > 2.98);
  let bounced = false;
  for (let i = 0; i < 40; i++) {
    stepWorld(map, s, {});
    if (b.vy > 1) bounced = true;
  }
  assert.ok(bounced);
});
test("circular obstacle glancing collision reflects the contact normal, not coordinate axes", () => {
  const map = flat(),
    s = initialSimulation(map),
    b = s.toys.ball;
  b.x = -1.15;
  b.z = 0.55;
  b.vx = 5;
  const items = [
    {
      id: "pot",
      type: "pot",
      owner: "owner",
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      revision: 1,
    },
  ];
  for (let i = 0; i < 5; i++)
    stepWorld(map, s, {}, items, [
      { id: "pot", radius: 0.5, height: 1, blocking: true },
    ]);
  assert.ok(b.vz > 1, "a glancing impact deflects along the circular normal");
  assert.ok(
    Math.hypot(b.x, b.z) >= 0.879,
    "sphere is separated from the obstacle",
  );
});
test("high speed motion cannot tunnel through a thin wall; tangential momentum survives", () => {
  const map = flat();
  map.blockers = [{ x: 0, z: -5, width: 0.04, depth: 10, y: 0, height: 2 }];
  const s = initialSimulation(map),
    b = s.toys.ball;
  b.x = -0.8;
  b.z = 0;
  b.vx = 25;
  b.vz = 3;
  stepWorld(map, s, {});
  assert.ok(b.x <= -0.379);
  assert.ok(b.vx < 0);
  assert.ok(b.vz > 2.9);
});
test("a lost toy resets to its own home, never the player spawn", () => {
  const map = flat(),
    s = initialSimulation(map);
  s.toys.ball = bodyAt({ x: 3, y: -9, z: 3 });
  stepWorld(map, s, {});
  assert.deepEqual(
    { x: s.toys.ball.x, y: s.toys.ball.y, z: s.toys.ball.z },
    map.toys[0].home,
  );
});
test("surface resistance changes stopping distance; gravity alone turns a roll downhill", () => {
  const run = (resistance: number) => {
    const map = flat();
    map.surfaces[0].rollingResistance = resistance;
    const s = initialSimulation(map);
    s.toys.ball.vx = 2;
    for (let i = 0; i < 30; i++) stepWorld(map, s, {});
    return s.toys.ball;
  };
  assert.ok(run(0.2).x > run(2).x + 0.5);
  const map = flat();
  map.surfaces[0].slope = 0.25;
  map.surfaces[0].rollingResistance = 0;
  const s = initialSimulation(map),
    b = s.toys.ball;
  b.y = 5.25;
  b.vx = 2;
  for (let i = 0; i < 15; i++) stepWorld(map, s, {});
  assert.ok(b.vz < -0.9, "gravity accelerates down the authored slope");
  assert.ok(
    Math.abs(b.vx - 2) < 1e-8,
    "gravity cannot change cross-slope velocity",
  );
  assert.ok(
    Math.abs(b.y - (b.z + 20) * 0.25) < 1e-8,
    "rolling follows slope support",
  );
});
test("a ceiling impact bounces down without ejecting the ball sideways", () => {
  const map = flat();
  map.surfaces.push({
    id: "bridge",
    x: -5,
    z: -5,
    width: 10,
    depth: 10,
    y: 2,
    thickness: 0.2,
  });
  const s = initialSimulation(map),
    b = s.toys.ball;
  b.y = 0.9;
  b.vy = 9;
  let hit = false;
  for (let i = 0; i < 5; i++) {
    stepWorld(map, s, {});
    if (b.vy < 0) hit = true;
    assert.equal(b.x, 1);
    assert.equal(b.z, 1);
    assert.ok(b.y + 0.76 <= 1.80001);
  }
  assert.ok(hit);
});
