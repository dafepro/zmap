import { test } from "node:test";
import assert from "node:assert/strict";
import { initialSimulation, stepWorld, type WorldMap } from "../src/core";
import type { ObjectBehavior } from "../src/world-objects";

test("afterStep observes final contacts and can constrain a toy before publication", () => {
  const calls: string[] = [];
  const behavior: ObjectBehavior = {
    id: "boundary",
    version: 1,
    validateConfig() {},
    initialState: () => ({}),
    validState: () => true,
    validEvent: () => true,
    step({ simulation }) {
      calls.push("before");
      assert.equal(simulation.toys.ball.x, 0);
    },
    afterStep({ simulation, emit, toyHeld }) {
      calls.push("after");
      assert.ok(simulation.toys.ball.x > 0);
      assert.equal(toyHeld("ball"), false);
      simulation.toys.ball.x = 0;
      emit("bounded", null);
    },
  };
  const map: WorldMap = {
    version: 1,
    id: "after-step",
    bounds: { x: -5, z: -5, width: 10, depth: 10 },
    spawn: { x: 0, y: 0, z: 0 },
    surfaces: [
      { id: "floor", x: -5, z: -5, width: 10, depth: 10, y: 0, thickness: 0.2 },
    ],
    blockers: [],
    toys: [
      {
        id: "ball",
        home: { x: 0, y: 0, z: 0 },
        radius: 0.3,
        color: "#fff",
        sleep: "home",
      },
    ],
    triggers: [],
    placementZones: [],
    protectedZones: [],
    objects: [
      {
        id: "boundary",
        behavior: "boundary",
        version: 1,
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
        config: {},
      },
    ],
  };
  const state = initialSimulation(map, [behavior]);
  state.toys.ball.vx = 6;
  stepWorld(map, state, {}, [], [], [], [behavior]);
  assert.deepEqual(calls, ["before", "after"]);
  assert.equal(state.toys.ball.x, 0);
  assert.equal(state.objects!.events[0].kind, "bounded");
});
