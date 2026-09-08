import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bodyAt,
  idleInput,
  initialSimulation,
  stepWorld,
  validSimulation,
  validateMap,
  type Input,
  type WorldMap,
} from "../src/core";
import {
  actionLineClear,
  playfulActionCatalog,
  syncActionPlayers,
  validateActionCatalog,
  validateActionIntent,
  type ActionCommand,
  type ActionIntent,
} from "../src/world-actions";
import { SnapshotPresentation } from "../src/presentation";

const map = (): WorldMap => ({
  version: 1,
  id: "action-test",
  bounds: { x: -10, z: -10, width: 20, depth: 20 },
  spawn: { x: 0, y: 0, z: 0 },
  surfaces: [
    {
      id: "ground",
      x: -10,
      z: -10,
      width: 20,
      depth: 20,
      y: 0,
      thickness: 0.2,
    },
  ],
  blockers: [],
  toys: [
    {
      id: "ball",
      home: { x: 0, y: 0, z: 3 },
      radius: 0.3,
      color: "#fff",
      sleep: "home",
    },
  ],
  triggers: [],
  placementZones: [],
  protectedZones: [],
  actionCatalog: playfulActionCatalog(),
});
function setup(m = map()) {
  validateMap(m);
  const state = initialSimulation(m);
  state.players.a = bodyAt(m.spawn);
  state.players.b = bodyAt({ x: 1.4, y: 0, z: 1 });
  syncActionPlayers(state);
  const inputs: Record<string, Input> = {
    a: { ...idleInput(), toolHeld: true },
    b: { ...idleInput(), toolHeld: true },
  };
  let relay = 0;
  const sequences: Record<string, number> = { a: 0, b: 0 };
  const command = (session: string, payload: object): ActionCommand => ({
    sequence: ++relay,
    session,
    intent: { sequence: ++sequences[session], ...payload } as ActionIntent,
  });
  const step = (...commands: ActionCommand[]) =>
    stepWorld(m, state, inputs, [], [], commands);
  const advance = (n: number) => {
    for (let i = 0; i < n; i++) step();
  };
  return { m, state, inputs, command, step, advance };
}
test("action catalogs and intent fields fail closed; legacy maps keep their original state shape", () => {
  const m = map();
  delete m.actionCatalog;
  assert.equal(initialSimulation(m).actions, undefined);
  assert.throws(() =>
    validateActionCatalog({ ...playfulActionCatalog(), code: "run" }),
  );
  for (const payload of [
    { sequence: 0, kind: "cancel" },
    { sequence: 1, kind: "equip", tool: "rocket" },
    { sequence: 1, kind: "use", pressed: true, target: "b" },
    { sequence: 1, kind: "aim", x: NaN, z: 1 },
    { sequence: 1, kind: "aim", x: 100, z: 0 },
  ])
    assert.throws(() => validateActionIntent(payload, playfulActionCatalog()));
});
test("tether reels a real toy, resolves one shared lock, pitches on release and does not replay a duplicate command", () => {
  const s = setup();
  s.state.players.b = bodyAt({ x: 0.2, y: 0, z: 0 });
  s.step(
    s.command("a", { kind: "equip", tool: "tether-winch" }),
    s.command("b", { kind: "equip", tool: "tether-winch" }),
  );
  const start = s.command("a", { kind: "use", pressed: true });
  s.step(start, s.command("b", { kind: "use", pressed: true }));
  assert.equal(s.state.actions!.players.a.target, "ball");
  assert.equal(s.state.actions!.players.b.target, null);
  s.advance(30);
  assert.ok(s.state.toys.ball.z < 2);
  assert.ok(s.state.toys.ball.y > 0.15);
  s.step(start);
  assert.equal(
    s.state.actions!.events.filter((e) => e.kind === "reel").length,
    1,
  );
  s.step(s.command("a", { kind: "use", pressed: false }));
  assert.ok(s.state.toys.ball.vz > 5);
  assert.equal(s.state.actions!.players.a.target, null);
  assert.ok(s.state.actions!.players.a.cooldownUntil > s.state.tick);
  assert.ok(validSimulation(s.state, s.m, ["a", "b"]));
});
test("wake pulse moves another player's actual body over multiple ticks, preserves per-tool cooldown through switching, and respects height and walls", () => {
  const s = setup();
  s.step(
    s.command("a", { kind: "equip", tool: "wake-driver" }),
    s.command("a", { kind: "use", pressed: true }),
  );
  s.step(s.command("a", { kind: "use", pressed: false }));
  s.advance(5);
  assert.equal(
    s.state.actions!.events.filter((e) => e.kind === "pulse").length,
    1,
  );
  const x = s.state.players.b.x;
  assert.ok(s.state.players.b.vy > 0);
  assert.ok(s.state.actions!.players.b.impulse.x > 0);
  s.advance(4);
  assert.ok(s.state.players.b.x > x + 0.1);
  s.step(
    s.command("a", { kind: "equip", tool: "tether-winch" }),
    s.command("a", { kind: "equip", tool: "wake-driver" }),
    s.command("a", { kind: "use", pressed: true }),
  );
  s.advance(8);
  assert.equal(
    s.state.actions!.events.filter((e) => e.kind === "pulse").length,
    1,
  );
  const blocked = setup();
  blocked.m.blockers.push({
    x: 0.6,
    z: 0,
    width: 0.015,
    depth: 2,
    y: 0,
    height: 2,
  });
  blocked.step(
    blocked.command("a", { kind: "equip", tool: "wake-driver" }),
    blocked.command("a", { kind: "use", pressed: true }),
  );
  blocked.advance(7);
  assert.equal(blocked.state.actions!.players.b.impulse.x, 0);
  assert.equal(blocked.state.players.b.vy, 0);
  const raised = setup();
  raised.m.surfaces.push({
    id: "bridge",
    x: 1,
    z: 0.5,
    width: 2,
    depth: 2,
    y: 3,
    thickness: 0.3,
  });
  raised.state.players.b.y = 3;
  raised.step(
    raised.command("a", { kind: "equip", tool: "wake-driver" }),
    raised.command("a", { kind: "use", pressed: true }),
  );
  raised.advance(7);
  assert.equal(raised.state.players.b.y, 3);
  assert.equal(raised.state.actions!.players.b.impulse.x, 0);
});
test("rebound reflects incoming toys and boosts another player once within its contact cooldown", () => {
  const s = setup();
  s.state.toys.ball.z = 2;
  s.state.toys.ball.vz = -10;
  s.state.players.b = bodyAt({ x: 0.5, y: 0, z: 0.8 });
  s.step(
    s.command("a", { kind: "equip", tool: "rebound-panel" }),
    s.command("a", { kind: "use", pressed: true }),
  );
  s.advance(6);
  assert.ok(s.state.toys.ball.vz > 0);
  assert.equal(
    s.state.actions!.events.filter((e) => e.kind === "rebound").length,
    1,
  );
  assert.equal(
    s.state.actions!.events.filter((e) => e.kind === "boost").length,
    1,
  );
  assert.ok(s.state.players.b.z > 0.8);
  s.advance(10);
  assert.equal(
    s.state.actions!.events.filter((e) => e.kind === "boost").length,
    1,
  );
});
test("analytic reach detects thin walls, sloping slabs and blocking placements without excluding clear air", () => {
  const m = map(),
    from = { x: 0, y: 0.5, z: 0 },
    to = { x: 2, y: 0.5, z: 0 };
  assert.equal(actionLineClear(m, from, to), true);
  m.blockers.push({
    x: 0.717,
    z: -0.1,
    width: 0.001,
    depth: 0.2,
    y: 0,
    height: 1,
  });
  assert.equal(actionLineClear(m, from, to), false);
  assert.equal(actionLineClear(m, { ...from, y: 2 }, { ...to, y: 2 }), true);
  m.blockers = [];
  const item = {
    id: "bench",
    type: "bench",
    owner: "a",
    position: { x: 0.8, y: 0, z: 0 },
    rotation: 0,
    revision: 1,
  };
  assert.equal(
    actionLineClear(
      m,
      from,
      to,
      [item],
      [{ id: "bench", radius: 0.2, height: 1, blocking: true }],
    ),
    false,
  );
  m.surfaces.push({
    id: "ramp",
    x: -0.2,
    z: -0.2,
    width: 0.4,
    depth: 3,
    y: 0.6,
    thickness: 0.2,
    slope: 0.5,
  });
  assert.equal(
    actionLineClear(m, { x: 0, y: 0.2, z: 1 }, { x: 0, y: 2, z: 1 }),
    false,
  );
});
test("held input expires; cancelled wake windup and departed tethers cannot leave an ongoing action", () => {
  const s = setup();
  s.step(
    s.command("a", { kind: "equip", tool: "wake-driver" }),
    s.command("a", { kind: "use", pressed: true }),
  );
  s.step(s.command("a", { kind: "cancel" }));
  s.advance(8);
  assert.equal(
    s.state.actions!.events.filter((e) => e.kind === "pulse").length,
    0,
  );
  s.step(
    s.command("b", { kind: "equip", tool: "rebound-panel" }),
    s.command("b", { kind: "use", pressed: true }),
  );
  s.inputs.b.toolHeld = false;
  s.advance(10);
  assert.equal(s.state.actions!.players.b.held, false);
  delete s.state.players.b;
  syncActionPlayers(s.state);
  assert.equal(s.state.actions!.players.b, undefined);
});
test("a checkpoint replay is deterministic, bounded, validated, and preserved by display interpolation", () => {
  const s = setup();
  s.step(
    s.command("a", { kind: "equip", tool: "wake-driver" }),
    s.command("a", { kind: "use", pressed: true }),
  );
  s.advance(2);
  const checkpoint = structuredClone(s.state),
    later = structuredClone(checkpoint);
  for (let i = 0; i < 120; i++) {
    stepWorld(s.m, s.state, s.inputs);
    stepWorld(s.m, later, s.inputs);
  }
  assert.deepEqual(s.state, later);
  assert.ok(validSimulation(later, s.m, ["a", "b"]));
  const bad = structuredClone(later);
  bad.actions!.players.a.cooldowns["wake-driver"] = later.tick + 999;
  assert.equal(validSimulation(bad, s.m, ["a", "b"]), false);
  const presentation = new SnapshotPresentation();
  presentation.push(checkpoint, 0);
  presentation.push(later, 200);
  assert.deepEqual(presentation.sample(150, 0)?.actions, checkpoint.actions);
  assert.ok(later.actions!.events.length <= 32);
});

test("20 players and five toys sustain all presets for 120 simulated seconds within state and fixed-step budgets", (t) => {
  const m = map();
  m.toys = Array.from({ length: 5 }, (_, i) => ({
    ...m.toys[0],
    id: `ball-${i}`,
    home: { x: i * 2 - 4, y: 0, z: 3 },
  }));
  const state = initialSimulation(m),
    inputs: Record<string, Input> = {},
    sequences: Record<string, number> = {};
  const sessions = Array.from({ length: 20 }, (_, i) => `player-${i}`),
    kinds = ["tether-winch", "rebound-panel", "wake-driver"] as const;
  for (const [i, session] of sessions.entries()) {
    state.players[session] = bodyAt({
      x: (i % 5) * 1.2 - 2.4,
      y: 0,
      z: Math.floor(i / 5) * 1.1 - 1,
    });
    inputs[session] = { ...idleInput(), toolHeld: true };
    sequences[session] = 0;
  }
  syncActionPlayers(state);
  let relay = 0,
    maximumBytes = 0,
    maximumEvents = 0;
  const samples: number[] = [];
  for (let frame = 0; frame < 3600; frame++) {
    const commands: ActionCommand[] = [],
      add = (session: string, payload: object) =>
        commands.push({
          session,
          sequence: ++relay,
          intent: {
            sequence: ++sequences[session],
            ...payload,
          } as ActionIntent,
        });
    for (const [i, session] of sessions.entries()) {
      if (frame % 300 === 0)
        add(session, { kind: "equip", tool: kinds[(i + frame / 300) % 3] });
      if (frame % 90 === 0) {
        add(session, { kind: "use", pressed: false });
        add(session, { kind: "use", pressed: true });
      }
    }
    const started = performance.now();
    stepWorld(m, state, inputs, [], [], commands);
    samples.push(performance.now() - started);
    assert.ok(
      validSimulation(state, m, sessions),
      `invalid bounded state at frame ${frame}`,
    );
    assert.ok(state.actions!.events.length <= 32);
    maximumEvents = Math.max(maximumEvents, state.actions!.events.length);
    const bytes = Buffer.byteLength(
      JSON.stringify({ type: "snapshot", epoch: 1, state }),
    );
    maximumBytes = Math.max(maximumBytes, bytes);
    assert.ok(bytes < 65536);
    for (const body of [
      ...Object.values(state.players),
      ...Object.values(state.toys),
    ]) {
      assert.ok(Object.values(body).every(Number.isFinite));
      assert.ok(
        Math.max(Math.abs(body.vx), Math.abs(body.vy), Math.abs(body.vz)) <= 30,
      );
    }
  }
  samples.sort((a, b) => a - b);
  const p95StepMs = samples[Math.floor(samples.length * 0.95)];
  assert.ok(
    p95StepMs < 1000 / 30,
    `p95 simulation step ${p95StepMs}ms exceeds 33.3ms`,
  );
  assert.ok(
    state.actions!.eventSequence > 32,
    "all presets should perform sustained actions",
  );
  t.diagnostic(
    JSON.stringify({
      provenance:
        "Node deterministic core, 20 actors, five toys, all three tools, 120 simulated seconds; not rendering, relay traffic or a physical phone result",
      p95StepMs,
      maximumBytes,
      maximumEvents,
      events: state.actions!.eventSequence,
    }),
  );
});
