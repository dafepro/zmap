import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bodyAt,
  initialSimulation,
  stepWorld,
  validateMap,
  validSimulation,
  type WorldMap,
} from "../src/core";
import { switchBehavior } from "../src/switch";
import { validateActionIntent, type ActionCommand } from "../src/world-actions";
const map: WorldMap = {
  version: 1,
  id: "light-test",
  bounds: { x: -5, z: -5, width: 10, depth: 10 },
  spawn: { x: 0, y: 0, z: 0 },
  surfaces: [
    {
      id: "floor",
      x: -5,
      z: -5,
      width: 10,
      depth: 10,
      y: 0,
      thickness: 0.2,
      color: "#ffffff",
    },
  ],
  placementZones: [],
  protectedZones: [],
  blockers: [],
  toys: [],
  triggers: [],
  objects: [
    {
      id: "lamp",
      behavior: "switch",
      version: 1,
      position: { x: 1, y: 0, z: 0 },
      rotation: 0,
      config: { initialOn: false },
    },
  ],
  actionCatalog: {
    version: 1,
    tools: [],
    interactions: [
      {
        object: "lamp",
        action: "toggle",
        range: 2,
        point: { x: 0, y: 0.8, z: 0 },
      },
    ],
  },
};
const behaviors = [switchBehavior];
function setup() {
  const s = initialSimulation(map, behaviors);
  s.players.a = bodyAt(map.spawn);
  return s;
}
const command = (n: number): ActionCommand => ({
  sequence: n,
  session: "a",
  intent: { sequence: n, kind: "interact", object: "lamp", action: "toggle" },
});
test("shared switch accepts once, survives snapshots, and rejects stale/repeated commands", () => {
  validateMap(map, behaviors);
  const s = setup();
  stepWorld(map, s, {}, [], [], [command(1), command(1)], behaviors);
  assert.equal((s.objects!.instances.lamp as any).on, true);
  assert.ok(validSimulation(s, map, ["a"], behaviors));
  const restored = structuredClone(s);
  stepWorld(map, restored, {}, [], [], [command(1)], behaviors);
  assert.equal((restored.objects!.instances.lamp as any).on, true);
  for (let i = 0; i < 10; i++)
    stepWorld(map, restored, {}, [], [], [], behaviors);
  stepWorld(map, restored, {}, [], [], [command(2)], behaviors);
  assert.equal((restored.objects!.instances.lamp as any).on, false);
});
test("range, floor separation, and walls are checked by simulation", () => {
  for (const position of [
    { x: 4, y: 0, z: 0 },
    { x: 0, y: 3, z: 0 },
  ]) {
    const s = setup();
    s.players.a = bodyAt(position);
    stepWorld(map, s, {}, [], [], [command(1)], behaviors);
    assert.equal((s.objects!.instances.lamp as any).on, false);
  }
  const blocked = {
    ...map,
    blockers: [{ x: 0.4, z: -1, width: 0.2, depth: 2, y: 0, height: 2 }],
  };
  const s = setup();
  stepWorld(blocked, s, {}, [], [], [command(1)], behaviors);
  assert.equal((s.objects!.instances.lamp as any).on, false);
});
test("interaction catalog rejects unknown actions, objects and extra payloads", () => {
  for (const intent of [
    { ...command(1).intent, action: "explode" },
    { ...command(1).intent, object: "missing" },
    { ...command(1).intent, on: true },
  ])
    assert.throws(() => validateActionIntent(intent, map.actionCatalog!));
  assert.throws(() => validateMap({ ...map, objects: [] }, behaviors));
});
