import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialSimulation,
  stepWorld,
  validateMap,
  type WorldMap,
  type Simulation,
} from "../src/core";
import { toyMass } from "../src/toy-physics";

function arena(count = 2): WorldMap {
  return {
    version: 1,
    id: "contacts",
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
        thickness: 0.2,
        rollingResistance: 0,
      },
    ],
    blockers: [],
    toys: Array.from({ length: count }, (_, i) => ({
      id: `ball-${i}`,
      home: { x: i, y: 0, z: 0 },
      radius: 0.3,
      restitution: 1,
      color: "#fff",
      sleep: "home",
    })),
    triggers: [],
    placementZones: [],
    protectedZones: [],
  };
}
function energy(m: WorldMap, s: Simulation) {
  return m.toys.reduce((sum, t) => {
    const b = s.toys[t.id];
    return sum + 0.5 * toyMass(t) * (b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
  }, 0);
}
function gap(m: WorldMap, s: Simulation, i: number, j: number) {
  const a = m.toys[i],
    b = m.toys[j],
    pa = s.toys[a.id],
    pb = s.toys[b.id];
  return (
    Math.hypot(pa.x - pb.x, pa.y + a.radius - pb.y - b.radius, pa.z - pb.z) -
    a.radius -
    b.radius
  );
}

test("opposing fast small balls cannot cross; elastic equal masses exchange normal momentum", () => {
  const m = arena();
  m.toys.forEach((t) => (t.radius = 0.1));
  const s = initialSimulation(m),
    a = s.toys["ball-0"],
    b = s.toys["ball-1"];
  a.x = -0.25;
  b.x = 0.25;
  a.vx = 30;
  b.vx = -30;
  stepWorld(m, s, {});
  assert.ok(a.x < b.x);
  assert.ok(gap(m, s, 0, 1) >= -1e-6);
  assert.ok(a.vx < -29.9 && b.vx > 29.9);
  assert.ok(Math.abs(a.vx + b.vx) < 1e-8);
  assert.ok(energy(m, s) <= 30 ** 2 * toyMass(m.toys[0]) + 1e-8);
});

test("authored masses give the analytic elastic result and radius defaults preserve equal density", () => {
  const m = arena();
  m.toys[0].mass = 1;
  m.toys[1].mass = 3;
  validateMap(m);
  const s = initialSimulation(m),
    a = s.toys["ball-0"],
    b = s.toys["ball-1"];
  a.x = -0.31;
  b.x = 0.31;
  a.vx = 12;
  stepWorld(m, s, {});
  assert.ok(Math.abs(a.vx + 6) < 1e-8);
  assert.ok(Math.abs(b.vx - 6) < 1e-8);
  assert.ok(Math.abs(a.vx + 3 * b.vx - 12) < 1e-8);
  assert.ok(Math.abs(energy(m, s) - 72) < 1e-8);
  assert.equal(toyMass({ ...m.toys[0], mass: undefined, radius: 0.6 }), 8);
  for (const mass of [0, -1, NaN, Infinity, 1001])
    assert.throws(() => validateMap({ ...m, toys: [{ ...m.toys[0], mass }] }));
});

test("glancing balls resolve a geometric normal without increasing energy or losing pair momentum", () => {
  const m = arena(),
    s = initialSimulation(m),
    a = s.toys["ball-0"],
    b = s.toys["ball-1"];
  a.x = -0.7;
  a.z = 0.3;
  b.x = 0;
  b.z = 0;
  a.vx = 8;
  let previous = energy(m, s);
  for (let i = 0; i < 8; i++) {
    stepWorld(m, s, {});
    assert.ok(energy(m, s) <= previous + 1e-8);
    previous = energy(m, s);
    assert.ok(gap(m, s, 0, 1) >= -1e-6);
  }
  assert.ok(a.vz > 0 && b.vz < 0);
  assert.ok(Math.abs(a.vx + b.vx - 8) < 1e-8);
  assert.ok(Math.abs(a.vz + b.vz) < 1e-8);
});

test("three resting spheres settle without jitter even with the full supported mass ratio", () => {
  for (const masses of [
    [1, 1, 1],
    [0.01, 1, 1000],
    [1000, 1, 0.01],
  ]) {
    const m = arena(3);
    m.toys.forEach((t, i) => {
      t.restitution = 0.5;
      t.mass = masses[i];
    });
    const s = initialSimulation(m);
    m.toys.forEach((t, i) =>
      Object.assign(s.toys[t.id], { x: 0, y: i * 0.6, z: 0 }),
    );
    for (let tick = 0; tick < 300; tick++) {
      stepWorld(m, s, {});
      assert.ok(s.toys["ball-0"].y >= 0);
      for (let i = 0; i < 3; i++)
        for (let j = i + 1; j < 3; j++)
          assert.ok(
            gap(m, s, i, j) > -0.001,
            `pile gap ${gap(m, s, i, j)} at ${tick}, masses ${masses}`,
          );
      assert.ok(
        energy(m, s) < 0.001,
        `pile energy ${energy(m, s)}, masses ${masses}`,
      );
    }
    assert.ok(Math.abs(s.toys["ball-2"].y - 1.2) < 0.002);
  }
});

test("a collision chain remains outside a thin wall and map bounds without energy growth", () => {
  const m = arena(3);
  m.blockers = [{ x: 1, z: -2, width: 0.01, depth: 4, y: 0, height: 2 }];
  const s = initialSimulation(m);
  m.toys.forEach((t, i) =>
    Object.assign(s.toys[t.id], { x: -0.5 + i * 0.6, z: 0 }),
  );
  s.toys["ball-0"].vx = 25;
  let previous = energy(m, s);
  for (let i = 0; i < 80; i++) {
    stepWorld(m, s, {});
    const next = energy(m, s);
    assert.ok(next <= previous + 1e-7, `energy ${previous} -> ${next}`);
    previous = next;
    for (const b of Object.values(s.toys)) {
      assert.ok(b.x <= 0.70001 && b.x >= -9.70001);
      assert.ok(b.y >= 0);
    }
    for (let a = 0; a < 3; a++)
      for (let b = a + 1; b < 3; b++) assert.ok(gap(m, s, a, b) > -0.001);
  }
});

test("sphere centre heights handle unlike radii, vertical impact, and bridge separation", () => {
  const m = arena();
  m.toys[0].radius = 0.15;
  m.toys[1].radius = 0.45;
  m.toys.forEach((t) => (t.restitution = 0));
  const s = initialSimulation(m);
  Object.assign(s.toys["ball-0"], { x: 0, y: 1.2, z: 0, vy: -20 });
  Object.assign(s.toys["ball-1"], { x: 0, y: 0, z: 0 });
  for (let i = 0; i < 20; i++) {
    stepWorld(m, s, {});
    assert.ok(gap(m, s, 0, 1) > -0.001);
  }
  assert.ok(Math.abs(s.toys["ball-0"].y - 0.9) < 0.002);
  const bridge = arena();
  bridge.surfaces.push({
    id: "bridge",
    x: -3,
    z: -3,
    width: 6,
    depth: 6,
    y: 2,
    thickness: 0.3,
    rollingResistance: 0,
  });
  const state = initialSimulation(bridge);
  Object.assign(state.toys["ball-0"], { x: 0, y: 0, z: 0, vx: 4 });
  Object.assign(state.toys["ball-1"], { x: 0, y: 2, z: 0, vx: -4 });
  for (let i = 0; i < 15; i++) {
    stepWorld(bridge, state, {});
    assert.equal(state.toys["ball-0"].y, 0);
    assert.equal(state.toys["ball-1"].y, 2);
  }
  assert.equal(state.toys["ball-0"].vx, 4);
  assert.equal(state.toys["ball-1"].vx, -4);
});

test("slope contacts preserve support and replay identically regardless of toy record/catalog ordering", () => {
  const m = arena(3);
  m.surfaces[0].slope = 0.2;
  m.surfaces[0].y = -2;
  m.toys.forEach((t, i) => {
    t.home = { x: 0, y: i * 0.14, z: i * 0.7 };
    t.restitution = 0.3;
  });
  const a = initialSimulation(m);
  a.toys["ball-2"].vz = -6;
  const reverse = { ...m, toys: [...m.toys].reverse() },
    b = structuredClone(a);
  b.toys = Object.fromEntries(Object.entries(b.toys).reverse());
  for (let i = 0; i < 90; i++) {
    stepWorld(m, a, {});
    stepWorld(reverse, b, {});
    assert.deepEqual(a, b);
    for (const body of Object.values(a.toys))
      assert.ok(body.y >= body.z * 0.2 - 1e-7);
    for (let j = 0; j < 3; j++)
      for (let k = j + 1; k < 3; k++) assert.ok(gap(m, a, j, k) > -0.001);
  }
});
