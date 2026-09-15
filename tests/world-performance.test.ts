import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bodyAt,
  idleInput,
  initialSimulation,
  stepWorld,
  validSimulation,
  validateMap,
  type WorldMap,
  type Input,
} from "../src/core";
import {
  playfulActionCatalog,
  syncActionPlayers,
  validateActionCatalog,
  validateActionIntent,
  type ActionCommand,
  type ActionIntent,
} from "../src/world-actions";
import { performanceUsable } from "../src/world-performance";
import {
  interpolateSimulation,
  presentationTickFor,
  SnapshotPresentation,
} from "../src/presentation";

function setup() {
  const map: WorldMap = {
    version: 1,
    id: "performance-test",
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
      },
    ],
    blockers: [],
    toys: [],
    triggers: [],
    placementZones: [],
    protectedZones: [],
    actionCatalog: {
      ...playfulActionCatalog(),
      performance: {
        emotes: [
          { id: "wave", durationTicks: 64 },
          { id: "dance", durationTicks: 180 },
        ],
        drawTicks: 30,
        stowTicks: 30,
      },
    },
  };
  validateMap(map);
  const state = initialSimulation(map);
  state.players.a = bodyAt(map.spawn);
  syncActionPlayers(state, map.actionCatalog!.performance);
  const inputs: Record<string, Input> = { a: idleInput() };
  let sequence = 0;
  const command = (payload: object): ActionCommand => ({
    sequence: ++sequence,
    session: "a",
    intent: { sequence, ...payload } as ActionIntent,
  });
  const step = (...commands: ActionCommand[]) =>
    stepWorld(map, state, inputs, [], [], commands);
  const advance = (ticks: number) => {
    for (let i = 0; i < ticks; i++) step();
  };
  return {
    map,
    state,
    inputs,
    command,
    step,
    advance,
    player: state.actions!.players.a,
  };
}
test("approved emotes are opt-in and unknown choices, fields, durations and forged timelines fail closed", () => {
  const s = setup(),
    catalog = s.map.actionCatalog!;
  assert.throws(() =>
    validateActionIntent(
      { sequence: 1, kind: "emote", emote: "dance" },
      playfulActionCatalog(),
    ),
  );
  for (const intent of [
    { sequence: 1, kind: "emote", emote: "unapproved" },
    { sequence: 1, kind: "emote", emote: "wave", duration: 900 },
    { sequence: 1, kind: "draw", drawn: "yes" },
  ])
    assert.throws(() => validateActionIntent(intent, catalog));
  for (const durationTicks of [0, 901, Infinity, 1.5])
    assert.throws(() =>
      validateActionCatalog({
        ...catalog,
        performance: {
          ...catalog.performance,
          emotes: [{ id: "wave", durationTicks }],
        },
      }),
    );
  const socialOnly = { ...catalog, tools: [] };
  validateActionCatalog(socialOnly);
  s.step(s.command({ kind: "emote", emote: "wave" }));
  assert.ok(validSimulation(s.state, s.map, ["a"]));
  for (const mutate of [
    (p: any) => p.emote.untilTick++,
    (p: any) => (p.emote.id = "unapproved"),
    (p: any) => (p.drawn = true),
    (p: any) => (p.emote.redraw = true),
    (p: any) => (p.equipmentUntil = 500),
    (p: any) => (p.extra = "payload"),
  ]) {
    const copy = structuredClone(s.state);
    mutate(copy.actions!.players.a.performance);
    assert.equal(validSimulation(copy, s.map, ["a"]), false);
  }
});
test("draw and stow retain a tool, gate use, and run before/after an accepted emote exactly once", () => {
  const s = setup();
  s.step(s.command({ kind: "equip", tool: "rebound-panel" }));
  assert.equal(s.player.performance!.drawn, true);
  assert.equal(performanceUsable(s.player.performance, s.state.tick), false);
  for (const duration of [0, 1, 29, 31]) {
    const forged = structuredClone(s.state);
    const performance = forged.actions!.players.a.performance!;
    performance.equipmentUntil = performance.equipmentStarted + duration;
    assert.equal(
      validSimulation(forged, s.map, ["a"]),
      false,
      "equipment readiness cannot use a duration different from the approved render timeline",
    );
  }
  s.step(s.command({ kind: "use", pressed: true }));
  assert.equal(s.player.phase, "idle");
  s.advance(29);
  assert.equal(performanceUsable(s.player.performance, s.state.tick), true);
  s.step(s.command({ kind: "use", pressed: true }));
  assert.equal(s.player.phase, "braced");
  const emote = s.command({ kind: "emote", emote: "wave" });
  s.step(emote);
  assert.equal(s.player.held, false);
  assert.equal(s.player.tool, "rebound-panel");
  const start = s.player.performance!.emote!.startedTick;
  assert.equal(start, s.state.tick + 30);
  assert.equal(s.player.performance!.drawn, false);
  s.step(emote);
  assert.equal(
    s.player.performance!.emote!.startedTick,
    start,
    "duplicate delivery cannot restart stow or clip",
  );
  s.advance(92);
  assert.ok(s.player.performance!.emote);
  s.step();
  assert.equal(s.player.performance!.emote, null);
  assert.equal(s.player.performance!.drawn, true);
  assert.equal(performanceUsable(s.player.performance, s.state.tick), false);
  s.advance(30);
  assert.equal(performanceUsable(s.player.performance, s.state.tick), true);
  assert.ok(validSimulation(s.state, s.map, ["a"]));
});
test("movement, kick, use and explicit stop cancel a performance; a manually stowed selection stays stowed", () => {
  for (const interruption of ["move", "kick", "use", "stop"]) {
    const s = setup();
    s.step(s.command({ kind: "equip", tool: "rebound-panel" }));
    s.advance(30);
    s.step(s.command({ kind: "emote", emote: "dance" }));
    s.advance(40);
    if (interruption === "move") s.inputs.a.x = 1;
    if (interruption === "kick") s.inputs.a.kick = true;
    s.step(
      ...(interruption === "use"
        ? [s.command({ kind: "use", pressed: true })]
        : interruption === "stop"
          ? [s.command({ kind: "emote", emote: null })]
          : []),
    );
    assert.equal(s.player.performance!.emote, null, interruption);
    assert.equal(s.player.performance!.drawn, true, interruption);
    assert.ok(validSimulation(s.state, s.map, ["a"]));
  }
  const s = setup();
  s.step(s.command({ kind: "equip", tool: "rebound-panel" }));
  s.advance(30);
  s.step(s.command({ kind: "draw", drawn: false }));
  s.advance(30);
  s.step(s.command({ kind: "emote", emote: "wave" }));
  assert.equal(s.player.performance!.emote!.startedTick, s.state.tick);
  s.advance(64);
  assert.equal(s.player.performance!.drawn, false);
  assert.equal(s.player.tool, "rebound-panel");
});

test("accepted reversals retain their current draw fraction instead of jumping between endpoints", () => {
  const s = setup();
  s.step(s.command({ kind: "equip", tool: "rebound-panel" }));
  s.advance(9);
  s.step(s.command({ kind: "emote", emote: "wave" }));
  assert.ok(Math.abs(s.player.performance!.equipmentFrom - 1 / 3) < 1e-12);
  s.advance(9);
  s.step(s.command({ kind: "emote", emote: null }));
  assert.ok(Math.abs(s.player.performance!.equipmentFrom - 2 / 9) < 1e-12);
  assert.equal(s.player.performance!.drawn, true);
  assert.ok(validSimulation(s.state, s.map, ["a"]));
  const forged = structuredClone(s.state);
  forged.actions!.players.a.performance!.equipmentFrom = 1.01;
  assert.equal(validSimulation(forged, s.map, ["a"]), false);
});

test("twenty simultaneous performers stay bounded through two minutes of emote and equipment cycles", (t) => {
  const s = setup();
  delete s.state.players.a;
  const ids = Array.from({ length: 20 }, (_, i) => `actor-${i}`);
  for (const id of ids) s.state.players[id] = bodyAt(s.map.spawn);
  const inputs = Object.fromEntries(ids.map((id) => [id, idleInput()]));
  const durations: number[] = [];
  let sequence = 0,
    maxBytes = 0;
  const batch = (payload: object) =>
    ids.map((session) => ({
      sequence: ++sequence,
      session,
      intent: { sequence, ...payload } as ActionIntent,
    }));
  for (let tick = 0; tick < 3600; tick++) {
    const commands =
      tick === 0
        ? batch({ kind: "equip", tool: "rebound-panel" })
        : tick % 360 === 31
          ? batch({ kind: "emote", emote: "dance" })
          : [];
    const start = performance.now();
    stepWorld(s.map, s.state, inputs, [], [], commands);
    durations.push(performance.now() - start);
    if (tick % 30 === 0) {
      assert.ok(validSimulation(s.state, s.map, ids));
      maxBytes = Math.max(maxBytes, Buffer.byteLength(JSON.stringify(s.state)));
    }
  }
  durations.sort((a, b) => a - b);
  const p95StepMs = durations[Math.floor(durations.length * 0.95)];
  assert.ok(p95StepMs < 4, `performance step p95 ${p95StepMs} ms`);
  assert.ok(maxBytes < 24000, `performance checkpoint ${maxBytes} bytes`);
  t.diagnostic(
    JSON.stringify({
      provenance:
        "Node deterministic simulation; no renderer, socket traffic or physical phone claim",
      actors: 20,
      seconds: 120,
      maxBytes,
      p95StepMs,
    }),
  );
});
test("checkpoint handoff resumes each stow/emote/draw phase without restarting; displayed metadata changes atomically", () => {
  const s = setup();
  s.step(s.command({ kind: "equip", tool: "rebound-panel" }));
  s.advance(30);
  s.step(s.command({ kind: "emote", emote: "wave" }));
  for (let i = 0; i < 125; i++) {
    const before = structuredClone(s.state),
      checkpoint = structuredClone(before);
    s.step();
    stepWorld(s.map, checkpoint, s.inputs);
    assert.deepEqual(checkpoint, s.state);
    assert.ok(validSimulation(checkpoint, s.map, ["a"]));
    const shown = interpolateSimulation(before, s.state, 0.5);
    assert.deepEqual(shown.actions, before.actions);
  }
});

test("fractional performance display time stays between accepted snapshots and freezes with a stalled host", () => {
  const s = setup();
  s.step(s.command({ kind: "emote", emote: "wave" }));
  const before = structuredClone(s.state);
  s.advance(2);
  const frames = new SnapshotPresentation();
  frames.push(before, 1000);
  frames.push(s.state, 1060);
  const half = frames.sample(1030, 0)!;
  assert.equal(presentationTickFor(half), before.tick + 1);
  assert.equal(half.tick, before.tick);
  assert.deepEqual(half.actions, before.actions);
  assert.equal(presentationTickFor(frames.sample(1045, 0)!), before.tick + 1.5);
  assert.equal(presentationTickFor(frames.sample(9000, 0)!), s.state.tick);
  assert.equal(JSON.stringify(half).includes("presentationTick"), false);
  assert.equal(presentationTickFor(structuredClone(half)), half.tick);
});

test("equip, stow, draw and emotes preserve authoritative facing instead of switching to stale aim", () => {
  for (const facing of [-Math.PI / 2, 0, Math.PI / 2, Math.PI]) {
    const s = setup(),
      body = s.state.players.a;
    body.facing = facing;
    s.player.aim = { x: 1, z: 0 };
    s.player.aimManual = true;
    s.step(s.command({ kind: "equip", tool: "rebound-panel" }));
    assert.ok(Math.abs(body.facing - facing) < 1e-8);
    s.advance(32);
    const aim = facing + 0.4;
    s.step(s.command({ kind: "aim", x: Math.sin(aim), z: Math.cos(aim) }));
    const expected = Math.atan2(Math.sin(aim), Math.cos(aim));
    assert.ok(Math.abs(body.facing - expected) < 1e-8);
    s.step(s.command({ kind: "draw", drawn: false }));
    s.advance(32);
    assert.ok(Math.abs(body.facing - expected) < 1e-8);
    s.step(s.command({ kind: "draw", drawn: true }));
    s.advance(32);
    assert.ok(Math.abs(body.facing - expected) < 1e-8);
    s.step(s.command({ kind: "emote", emote: "wave" }));
    s.advance(45);
    assert.ok(Math.abs(body.facing - expected) < 1e-8);
  }
});
