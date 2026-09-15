import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bodyAt,
  initialSimulation,
  movePlayer,
  idleInput,
  stepWorld,
  validateMap,
  validSimulation,
  type WorldMap,
} from "../src/core";
import {
  cannonBehavior,
  cannonObject,
  cannonLoadingPosition,
  type CannonConfig,
  type CannonState,
} from "../src/cannon";
import { interpolateBody, interpolateSimulation } from "../src/presentation";
import {
  objectPoint,
  objectLocalPoint,
  type ObjectBehavior,
} from "../src/world-objects";
import { advanceToys } from "../src/toy-physics";
import { findWalkPath, canWalkSegment } from "../src/navigation";

const behaviors = [cannonBehavior];
function fixture(rotation = 0) {
  const map: WorldMap = {
    version: 1,
    id: "cannon-test",
    bounds: { x: -12, z: -12, width: 24, depth: 24 },
    spawn: { x: -4, y: 0, z: -4 },
    surfaces: [
      {
        id: "ground",
        x: -12,
        z: -12,
        width: 24,
        depth: 24,
        y: 0,
        thickness: 0.3,
        rollingResistance: 0,
      },
    ],
    blockers: [],
    toys: [
      {
        id: "ball",
        home: { x: 0, y: 0, z: -1.7 },
        radius: 0.35,
        color: "white",
        sleep: "home",
        restitution: 0.8,
      },
    ],
    triggers: [],
    placementZones: [],
    protectedZones: [],
    objects: [cannonObject("cannon", { x: 0, y: 0, z: 0 }, rotation, ["ball"])],
  };
  const contact = objectPoint(map.objects![0], { x: 0, y: 0, z: -1.5 });
  map.toys[0].home = contact;
  validateMap(map, behaviors);
  const state = initialSimulation(map, behaviors);
  const advance = (count = 1) => {
    for (let i = 0; i < count; i++)
      stepWorld(map, state, {}, [], [], [], behaviors);
  };
  const cannon = () =>
    state.objects!.instances.cannon as unknown as CannonState;
  return { map, state, advance, cannon };
}
test("cannon loads the same ball during its 0.8 second fuse, then launches along authored rotation with per-ball cooldown", () => {
  for (const rotation of [0, Math.PI / 2, Math.PI, -Math.PI / 3]) {
    const { map, state, advance, cannon } = fixture(rotation),
      original = { ...state.toys.ball };
    advance();
    assert.equal(cannon().balls.ball.phase, "fuse");
    assert.equal(cannon().balls.ball.untilTick - state.tick, 24);
    assert.deepEqual(state.toys.ball, original);
    advance(23);
    const seated = objectPoint(map.objects![0], { x: 0, y: 0.5, z: -0.7 });
    assert.ok(
      Math.hypot(
        state.toys.ball.x - seated.x,
        state.toys.ball.y - seated.y,
        state.toys.ball.z - seated.z,
      ) < 1e-8,
    );
    assert.equal(
      state.objects!.events.filter((event) => event.kind === "fire").length,
      0,
    );
    advance();
    assert.equal(cannon().balls.ball.phase, "cooldown");
    assert.equal(cannon().balls.ball.untilTick - state.tick, 23);
    assert.equal(state.toys.ball.teleportEpoch, 1);
    assert.ok(Math.abs(state.toys.ball.vx - Math.sin(rotation) * 14) < 0.05);
    assert.ok(Math.abs(state.toys.ball.vz - Math.cos(rotation) * 14) < 0.05);
    assert.equal(Object.keys(state.toys).length, 1);
    assert.equal(
      state.objects!.events.filter((event) => event.kind === "fire").length,
      1,
    );
    assert.ok(validSimulation(state, map, [], behaviors));
    // Returning the same ball during its cooldown does not restart the fuse.
    Object.assign(state.toys.ball, original);
    advance(22);
    assert.equal(cannon().balls.ball.phase, "cooldown");
    advance();
    assert.equal(cannon().balls.ball.phase, "fuse");
  }
});
test("a high-speed rear crossing is captured without tunneling and rejected toys and avatars never arm the cannon", () => {
  const { map, state, advance, cannon } = fixture();
  Object.assign(state.toys.ball, { z: -2.2, vz: 30 });
  advance();
  assert.equal(cannon().balls.ball.phase, "fuse");
  assert.ok(state.toys.ball.z < -1.5);
  map.toys.push({ ...map.toys[0], id: "stone" });
  state.toys.stone = bodyAt({ x: 0, y: 0, z: -1.5 });
  state.players.ari = bodyAt({ x: 0, y: 0, z: -1.5 });
  advance();
  assert.equal(cannon().balls.stone, undefined);
  assert.equal(cannon().balls.ari, undefined);
  assert.equal(state.players.ari.y, 0);
});
test("one chamber owns one fuse and captured balls still repel other moving balls", () => {
  const { map, state, advance, cannon } = fixture();
  map.toys.push({ ...map.toys[0], id: "second" });
  (map.objects![0].config as unknown as CannonConfig).acceptedToys.push(
    "second",
  );
  state.toys.second = bodyAt({ x: 0, y: 0, z: -2.2 });
  state.toys.second.vz = 8;
  advance();
  assert.equal(
    Object.values(cannon().balls).filter((ball) => ball.phase === "fuse")
      .length,
    1,
  );
  assert.equal(cannon().balls.ball.phase, "fuse");
  assert.ok(
    state.toys.second.vz < 0,
    "incoming ball bounces from the captured kinematic ball",
  );
  assert.equal(state.toys.ball.z, -1.5);
  assert.equal(state.toys.ball.vz, 0);
});
test("cannon blocks approaching balls and players at arbitrary rotation", () => {
  for (const rotation of [0, Math.PI / 2, -Math.PI / 4]) {
    const { map, state, advance, cannon } = fixture(rotation),
      object = map.objects![0];
    Object.assign(
      state.toys.ball,
      bodyAt(objectPoint(object, { x: 0, y: 0, z: 1.9 })),
      { vx: -Math.sin(rotation) * 20, vz: -Math.cos(rotation) * 20 },
    );
    advance(3);
    assert.ok(
      state.toys.ball.vx * Math.sin(rotation) +
        state.toys.ball.vz * Math.cos(rotation) >
        0,
    );
    assert.equal(cannon().balls.ball, undefined);
    const player = bodyAt(objectPoint(object, { x: 0, y: 0, z: 1.5 }));
    for (let i = 0; i < 15; i++)
      movePlayer(
        map,
        player,
        { ...idleInput(), x: -Math.sin(rotation), z: -Math.cos(rotation) },
        1 / 30,
      );
    assert.ok(objectLocalPoint(object, player).z > 1.3);
  }
});
test("real displacement cancels continuous dwell and an obstructed muzzle produces no teleport", () => {
  const { map, state, advance, cannon } = fixture();
  advance(10);
  state.toys.ball.x = 3;
  advance();
  assert.equal(cannon().balls.ball, undefined);
  assert.equal(state.objects!.events.at(-1)!.kind, "cancel");
  Object.assign(state.toys.ball, bodyAt(map.toys[0].home));
  advance();
  map.blockers.push({ x: -1, z: 1.25, width: 2, depth: 0.5, y: 0, height: 2 });
  advance(24);
  assert.equal(state.objects!.events.at(-1)!.kind, "blocked");
  assert.equal(state.toys.ball.teleportEpoch, undefined);
  assert.ok(state.toys.ball.z < 0);
});
test("loading stops before a side wall clips the sphere even when the entire centerline is clear", () => {
  for (const rotation of [0, Math.PI / 2]) {
    const { map, state, advance } = fixture(rotation);
    const wall =
      rotation === 0
        ? { x: 0.25, z: -1.1, width: 0.2, depth: 0.4, y: 0, height: 2 }
        : { x: -1.1, z: -0.45, width: 0.4, depth: 0.2, y: 0, height: 2 };
    map.blockers.push(wall);
    for (let i = 0; i < 30; i++) {
      advance();
      const body = state.toys.ball,
        center = { x: body.x, y: body.y + 0.35, z: body.z };
      const dx = Math.max(wall.x - center.x, center.x - wall.x - wall.width, 0),
        dy = Math.max(wall.y - center.y, center.y - wall.y - wall.height, 0),
        dz = Math.max(wall.z - center.z, center.z - wall.z - wall.depth, 0);
      assert.ok(
        Math.hypot(dx, dy, dz) >= 0.35 - 1e-5,
        `sphere must remain clear at tick${state.tick}`,
      );
    }
    assert.ok(state.objects!.events.some((event) => event.kind === "blocked"));
    assert.equal(
      state.objects!.events.some((event) => event.kind === "fire"),
      false,
    );
    assert.equal(state.toys.ball.teleportEpoch, undefined);
  }
});
test("floor and side-wall tangency remain usable, while a corner at the outlet cannot slip between axial rays", () => {
  const tangent = fixture();
  tangent.map.blockers.push({
    x: 0.35,
    z: -1.1,
    width: 0.2,
    depth: 0.4,
    y: 0,
    height: 2,
  });
  tangent.advance(25);
  assert.ok(
    tangent.state.objects!.events.some((event) => event.kind === "fire"),
  );
  const corner = fixture();
  corner.map.blockers.push({
    x: 0.2,
    z: 1.52,
    width: 0.05,
    depth: 0.05,
    y: 0.6,
    height: 0.05,
  });
  corner.advance(25);
  assert.equal(corner.state.objects!.events.at(-1)!.kind, "blocked");
  assert.equal(corner.state.toys.ball.teleportEpoch, undefined);
});
test("swept capture checks the radius around a fast ball instead of capturing it through a side obstacle", () => {
  const { map, state, advance, cannon } = fixture();
  Object.assign(state.toys.ball, { z: -2.2, vz: 30 });
  map.blockers.push({
    x: 0.25,
    z: -1.8,
    width: 0.2,
    depth: 0.04,
    y: 0,
    height: 2,
  });
  advance();
  assert.equal(cannon().balls.ball, undefined);
  assert.equal(state.objects!.events.length, 0);
});
test("checkpoint restore resumes the exact fuse tick once, preserves cooldown, and room sleep starts fresh", () => {
  const { map, state, advance } = fixture();
  advance(13);
  const checkpoint = structuredClone(state);
  for (let i = 0; i < 30; i++) {
    advance();
    stepWorld(map, checkpoint, {}, [], [], [], behaviors);
    assert.deepEqual(checkpoint, state);
  }
  assert.equal(
    state.objects!.events.filter((event) => event.kind === "fire").length,
    1,
  );
  assert.deepEqual(
    initialSimulation(map, behaviors).objects!.instances.cannon,
    { balls: {} },
  );
});
test("world object boundary rejects missing implementations, invalid config/state, excess payloads and arbitrary metadata", () => {
  const { map, state, advance } = fixture();
  assert.throws(() => validateMap(map), /Install exactly/);
  assert.throws(
    () => validateMap(map, [cannonBehavior, cannonBehavior]),
    /exactly one/,
  );
  assert.throws(
    () =>
      validateMap(map, [
        {
          ...cannonBehavior,
          validEvent: undefined,
        } as unknown as ObjectBehavior,
      ]),
    /requires validEvent\(\)/,
  );
  const bad = structuredClone(map);
  (bad.objects![0].config as unknown as CannonConfig).acceptedToys = [
    "unknown",
  ];
  assert.throws(() => validateMap(bad, behaviors), /references/);
  advance();
  const invalid = structuredClone(state);
  (invalid.objects!.instances.cannon as any).balls.ball.untilTick += 1;
  assert.equal(validSimulation(invalid, map, [], behaviors), false);
  const malformedBall = structuredClone(state);
  (malformedBall.objects!.instances.cannon as any).balls.ball = null;
  assert.equal(validSimulation(malformedBall, map, [], behaviors), false);
  const injected = structuredClone(state);
  (injected.objects as any).script = "run";
  assert.equal(validSimulation(injected, map, [], behaviors), false);
  const extended = structuredClone(state);
  extended.objects!.events[0].data = { noise: "x".repeat(600) };
  assert.equal(validSimulation(extended, map, [], behaviors), false);
  state.tick = 18001;
  (state.objects!.instances.cannon as unknown as CannonState).balls = {};
  assert.ok(
    validSimulation(state, map, [], behaviors),
    "a long-running room does not hit an artificial 10,000-tick limit",
  );
});
test("ordinary custom world behaviors run and checkpoint through the same public contract without cannon imports", () => {
  const { map } = fixture();
  const behavior: ObjectBehavior = {
    id: "counter",
    version: 1,
    validateConfig: () => {},
    initialState: () => ({ count: 0 }),
    validEvent: (event) =>
      event.kind === "ring" && (event.data as any)?.count === 3,
    validState: (value) => typeof (value as any).count === "number",
    step: (context) => {
      (context.state as any).count++;
      if ((context.state as any).count === 3) {
        const payload = { count: 3 };
        context.emit("ring", payload);
        payload.count = 99;
      }
    },
  };
  map.objects = [
    {
      id: "clock",
      behavior: "counter",
      version: 1,
      position: map.spawn,
      rotation: 0,
      config: {},
    },
  ];
  validateMap(map, [behavior]);
  const state = initialSimulation(map, [behavior]);
  for (let i = 0; i < 4; i++) stepWorld(map, state, {}, [], [], [], [behavior]);
  assert.deepEqual(state.objects!.instances.clock, { count: 4 });
  assert.equal(state.objects!.events[0].kind, "ring");
  assert.deepEqual(
    state.objects!.events[0].data,
    { count: 3 },
    "the timeline owns its emitted data rather than retaining mutable app state",
  );
  assert.ok(validSimulation(state, map, [], [behavior]));
});
test("authored cannon clearance includes rear loading travel and the ball radius, not just socket centers", () => {
  const { map } = fixture();
  map.objects![0].position.z = -10.5;
  assert.throws(() => validateMap(map, behaviors), /Invalid cannon limits/);
  map.objects![0].position = { x: 10.5, y: 0, z: 0 };
  map.objects![0].rotation = Math.PI / 2;
  assert.throws(() => validateMap(map, behaviors), /Invalid cannon limits/);
});
test("intentional same-ball teleports never interpolate a fake journey through the barrel", () => {
  const before = bodyAt({ x: 0, y: 0, z: -1.5 });
  const after = { ...bodyAt({ x: 0, y: 0.5, z: 1.32 }), teleportEpoch: 1 };
  assert.deepEqual(interpolateBody(before, after, 0.1), before);
  assert.deepEqual(interpolateBody(before, after, 1), after);
  const next = { ...after, z: 2 };
  const shown = interpolateBody(after, next, 0.5);
  assert.ok(Math.abs(shown.z - 1.66) < 1e-10);
  assert.equal(shown.teleportEpoch, 1);
});
test("loading centers an off-axis floor ball behind the rear lip before entering the bore, and each tick restores identically", () => {
  const { map, state, advance, cannon } = fixture();
  state.toys.ball.x = 0.6;
  advance();
  const object = map.objects![0],
    capture = structuredClone(cannon().balls.ball);
  for (let age = 1; age <= 23; age++) {
    const restored = structuredClone(state);
    advance();
    stepWorld(map, restored, {}, [], [], [], behaviors);
    assert.deepEqual(restored, state);
    const expected = cannonLoadingPosition(object, capture, 0.35, state.tick),
      actual = state.toys.ball;
    assert.ok(
      Math.hypot(
        actual.x - expected.x,
        actual.y - expected.y,
        actual.z - expected.z,
      ) < 1e-8,
    );
    const local = objectLocalPoint(object, {
      x: actual.x,
      y: actual.y + 0.35,
      z: actual.z,
    });
    if (age >= 2 && age <= 6)
      assert.ok(
        local.z + 0.35 < -1.28,
        "lift and centering remain behind the actual lip",
      );
    if (age >= 6) {
      assert.ok(Math.abs(local.x) < 1e-8);
      assert.ok(Math.abs(local.y - 0.85) < 1e-8);
    }
    if (age >= 12) assert.ok(Math.abs(local.z + 0.7) < 1e-8);
    assert.equal(
      actual.teleportEpoch,
      undefined,
      "loading is continuous physical motion, not a hidden teleport",
    );
  }
});
test("a moving kinematic hold sweeps through other balls instead of teleporting over them", () => {
  const { map } = fixture();
  map.objects = [];
  const toys = [
    { ...map.toys[0], id: "held", radius: 0.1 },
    { ...map.toys[0], id: "free", radius: 0.1 },
  ];
  const bodies = {
    held: bodyAt({ x: -0.3, y: 0, z: 4 }),
    free: bodyAt({ x: 0, y: 0, z: 4 }),
  };
  advanceToys(
    map,
    bodies,
    toys,
    1 / 30,
    [],
    [],
    new Set(["held"]),
    [],
    new Map([["held", { x: 0.3, y: 0, z: 4 }]]),
  );
  assert.ok(bodies.free.x > bodies.held.x + 0.19);
  assert.ok(bodies.free.vx > 0 && bodies.free.vx <= 30);
  assert.equal(bodies.held.x, 0.3);
  assert.equal(bodies.held.vx, 0);
});
test("fire effects and ball teleport become visible in the same presentation checkpoint", () => {
  const { state, advance } = fixture();
  advance(24);
  const before = structuredClone(state);
  advance();
  const between = interpolateSimulation(before, state, 0.99),
    after = interpolateSimulation(before, state, 1);
  assert.equal(between.toys.ball.teleportEpoch, undefined);
  assert.equal(
    between.objects!.events.some((event) => event.kind === "fire"),
    false,
  );
  assert.equal(after.toys.ball.teleportEpoch, 1);
  assert.equal(
    after.objects!.events.some((event) => event.kind === "fire"),
    true,
  );
});
test("semantic event validation rejects null effects, unknown kinds and forged fire vectors before presentation", () => {
  const { map, state, advance } = fixture();
  advance(25);
  for (const change of [
    (event: any) => {
      event.data = null;
    },
    (event: any) => {
      event.kind = "unknown";
    },
    (event: any) => {
      event.data.velocity.z = 999;
    },
    (event: any) => {
      event.data.position.x = 8;
    },
    (event: any) => {
      event.data.toy = "unapproved";
    },
  ]) {
    const invalid = structuredClone(state);
    change(invalid.objects!.events.at(-1));
    assert.equal(validSimulation(invalid, map, [], behaviors), false);
  }
});
test("intake uses real sphere contact, respects height, and does not capture a ball through a thin wall", () => {
  const { map, state, advance, cannon } = fixture();
  Object.assign(state.toys.ball, bodyAt({ x: 0.7, y: 0, z: -1.7 }));
  advance();
  assert.equal(
    cannon().balls.ball,
    undefined,
    "expanded sensor corners are not sphere contact",
  );
  Object.assign(state.toys.ball, bodyAt({ x: 0, y: 2.8, z: -1.5 }));
  advance();
  assert.equal(
    cannon().balls.ball,
    undefined,
    "ball on an overpass is outside the intake",
  );
  Object.assign(state.toys.ball, bodyAt({ x: 0, y: 0, z: -2.2 }), { vz: 30 });
  map.blockers.push({
    x: -0.8,
    y: 0,
    z: -2.0,
    width: 1.6,
    height: 1,
    depth: 0.04,
  });
  advance();
  assert.equal(
    cannon().balls.ball,
    undefined,
    "swept capture must not tunnel through a thin wall",
  );
  assert.ok(state.toys.ball.z < -2);
});
test("five cannons and twenty actors sustain repeated accepted timelines inside bounded state and fixed-step budgets", (t) => {
  const { map } = fixture();
  map.objects = [];
  map.toys = [];
  for (let i = 0; i < 5; i++) {
    const x = -8 + i * 4,
      id = `ball-${i}`;
    map.toys.push({
      id,
      home: { x, y: 0, z: -1.5 },
      radius: 0.35,
      color: "white",
      sleep: "home",
    });
    map.objects.push(cannonObject(`cannon-${i}`, { x, y: 0, z: 0 }, 0, [id]));
  }
  validateMap(map, behaviors);
  const state = initialSimulation(map, behaviors),
    ids = Array.from({ length: 20 }, (_, i) => `actor-${i}`),
    timings: number[] = [];
  ids.forEach(
    (id, i) =>
      (state.players[id] = bodyAt({
        x: -8 + (i % 10) * 1.5,
        y: 0,
        z: -8 + Math.floor(i / 10) * 2,
      })),
  );
  let maximumBytes = 0;
  for (let i = 0; i < 3600; i++) {
    if (i % 80 === 0)
      for (const toy of map.toys)
        Object.assign(state.toys[toy.id], bodyAt(toy.home));
    const before = performance.now();
    stepWorld(map, state, {}, [], [], [], behaviors);
    timings.push(performance.now() - before);
    if (i % 30 === 0) {
      assert.ok(validSimulation(state, map, ids, behaviors));
      maximumBytes = Math.max(
        maximumBytes,
        Buffer.byteLength(JSON.stringify(state)),
      );
    }
  }
  const p95StepMs = timings.sort((a, b) => a - b)[
    Math.floor(timings.length * 0.95)
  ];
  assert.ok(
    state.objects!.eventSequence >= 450,
    "five independent cannons each fire 45 times",
  );
  assert.ok(state.objects!.events.length <= 32);
  assert.ok(maximumBytes < 65536);
  assert.ok(
    p95StepMs < 1000 / 30,
    "the simulation fits its 30Hz step budget on this test machine",
  );
  t.diagnostic(
    JSON.stringify({
      provenance:
        "Node deterministic core; five cannons, five balls, twenty actors, 120 simulated seconds; no browser, network or physical-phone claim",
      p95StepMs,
      maximumBytes,
      events: state.objects!.eventSequence,
    }),
  );
});

test("player collision boxes also route around the rotated cannon and reject invalid content", () => {
  for (const rotation of [0, Math.PI / 2, Math.PI / 4]) {
    const { map } = fixture(rotation),
      object = map.objects![0];
    const from = objectPoint(object, { x: -3, y: 0, z: 0 }),
      to = objectPoint(object, { x: 3, y: 0, z: 0 });
    assert.equal(canWalkSegment(map, from, to), false);
    const path = findWalkPath(map, from, to);
    assert.equal(path.status, "ready");
    if (path.status === "ready") {
      assert.ok(path.points.length > 2);
      for (let i = 1; i < path.points.length; i++)
        assert.ok(canWalkSegment(map, path.points[i - 1], path.points[i]));
    }
    object.playerColliders![0].size.x = -1;
    assert.throws(() => validateMap(map, behaviors), /colliders/);
  }
});
