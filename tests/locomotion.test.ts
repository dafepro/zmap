import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WALK_SPEED,
  SPRINT_SPEED,
  STEP,
  bodyAt,
  idleInput,
  normalizeInput,
  movePlayer,
  initialSimulation,
  stepWorld,
  type Input,
  type WorldMap,
} from "../src/core.js";
import {
  actionMovementLocked,
  playfulActionCatalog,
  type ActionCommand,
} from "../src/world-actions.js";

const map: WorldMap = {
  version: 1,
  id: "locomotion",
  bounds: { x: -20, z: -20, width: 40, depth: 40 },
  spawn: { x: 0, y: 0, z: 0 },
  surfaces: [
    { id: "floor", x: -20, z: -20, width: 40, depth: 40, y: 0, thickness: 0.2 },
  ],
  blockers: [],
  toys: [],
  triggers: [],
  placementZones: [],
  protectedZones: [],
};
test("walk and sprint cover their authored distances without a diagonal advantage", () => {
  for (const sprint of [false, true]) {
    const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
    for (const [x, z] of [
      [1, 0],
      [1, 1],
      [-1, 1],
    ]) {
      const body = bodyAt(map.spawn);
      for (let tick = 0; tick < 30; tick++)
        movePlayer(map, body, { ...idleInput(), x, z, sprint }, STEP);
      assert.ok(Math.abs(Math.hypot(body.x, body.z) - speed) < 1e-8);
      assert.ok(Math.abs(Math.hypot(body.vx, body.vz) - speed) < 1e-8);
    }
  }
});
test("sprint accepts only boolean intent, preserves analog gain, and release stops immediately", () => {
  for (const sprint of [undefined, null, 1, "true", {}, Infinity]) {
    const input = { ...idleInput(), x: 1, sprint } as Input;
    assert.equal(normalizeInput(input).sprint, undefined);
    const body = bodyAt(map.spawn);
    movePlayer(map, body, input, STEP);
    assert.equal(body.vx, WALK_SPEED);
  }
  const body = bodyAt(map.spawn);
  movePlayer(map, body, { ...idleInput(), x: 0.5, sprint: true }, STEP);
  assert.equal(body.vx, SPRINT_SPEED / 2);
  const position = { x: body.x, z: body.z };
  movePlayer(map, body, idleInput(), STEP);
  assert.deepEqual({ x: body.x, z: body.z }, position);
  assert.equal(body.vx, 0);
});
test("sprint respects thin blockers and cannot step through walls or map boundaries", () => {
  const blocked = structuredClone(map);
  blocked.blockers.push({
    x: 1,
    z: -20,
    width: 0.04,
    depth: 40,
    y: 0,
    height: 2,
  });
  const body = bodyAt(map.spawn);
  for (let tick = 0; tick < 100; tick++)
    movePlayer(blocked, body, { ...idleInput(), x: 1, sprint: true }, STEP);
  assert.ok(body.x < 0.721, `blocked at ${body.x}`);
  const edge = bodyAt({ x: 19, y: 0, z: 0 });
  for (let tick = 0; tick < 100; tick++)
    movePlayer(map, edge, { ...idleInput(), x: 1, sprint: true }, STEP);
  assert.ok(edge.x <= 19.72);
});
test("Wake action movement locks override held sprint through its physical leap and impact", () => {
  const actionMap = { ...map, actionCatalog: playfulActionCatalog() };
  const state = initialSimulation(actionMap);
  state.players.ari = bodyAt(map.spawn);
  const commands: ActionCommand[] = [
    {
      session: "ari",
      sequence: 1,
      intent: { sequence: 1, kind: "equip", tool: "wake-driver" },
    },
    {
      session: "ari",
      sequence: 2,
      intent: { sequence: 2, kind: "use", pressed: true },
    },
  ];
  stepWorld(
    actionMap,
    state,
    { ari: { ...idleInput(), toolHeld: true } },
    [],
    [],
    commands,
  );
  let locked = 0;
  for (let tick = 0; tick < 30; tick++) {
    const wasLocked = actionMovementLocked(state.actions?.players.ari);
    stepWorld(actionMap, state, {
      ari: { ...idleInput(), x: 1, sprint: true, toolHeld: true },
    });
    if (wasLocked && actionMovementLocked(state.actions?.players.ari)) {
      assert.equal(state.players.ari.vx, 0);
      assert.equal(state.players.ari.x, 0);
      locked++;
    }
  }
  assert.ok(
    locked > 10,
    "the test must exercise the complete locked animation interval",
  );
});
