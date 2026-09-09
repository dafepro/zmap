import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rollingMotion,
  SnapshotPresentation,
  interpolateSimulation,
} from "../src/presentation";
import { bodyAt, type Simulation } from "zmap/core";
test("rolling angle is distance / radius, independent of frame subdivision", () => {
  const radius = 0.38,
    start = { x: 0, y: 0, z: 0 },
    end = { x: 2, y: 0, z: 1 };
  const whole = rollingMotion(start, end, radius);
  let sum = 0;
  for (let i = 0; i < 120; i++) {
    const roll = rollingMotion(
      { x: (2 * i) / 120, y: 0, z: i / 120 },
      { x: (2 * (i + 1)) / 120, y: 0, z: (i + 1) / 120 },
      radius,
    );
    sum += roll.angle;
    assert.ok(Math.abs(roll.axis.x - whole.axis.x) < 1e-12);
  }
  assert.ok(Math.abs(sum - whole.angle) < 1e-10);
  assert.equal(rollingMotion(end, end, radius).angle, 0);
});
test("30 Hz authority produces continuous 60 Hz player and toy poses while display history owns immutable snapshots", () => {
  const state: Simulation = {
    tick: 0,
    players: { sam: bodyAt({ x: 0, y: 0, z: 0 }) },
    toys: { ball: bodyAt({ x: 0, y: 0, z: 0 }) },
    triggers: {},
  };
  const history = new SnapshotPresentation();
  history.push(state, 0);
  state.tick = 1;
  state.players.sam.x = 4 / 30;
  state.toys.ball.x = 8 / 30;
  history.push(state, 1000 / 30);
  state.players.sam.x = 99;
  const half = history.sample(1000 / 60, 0)!;
  assert.ok(Math.abs(half.players.sam.x - 4 / 60) < 1e-12);
  assert.ok(Math.abs(half.toys.ball.x - 8 / 60) < 1e-12);
  assert.equal(history.sample(0, 0)!.players.sam.x, 0);
  const previous = history.sample(0, 0)!,
    current = history.sample(1000 / 30, 0)!;
  const quarter = interpolateSimulation(previous, current, 0.25),
    threeQuarter = interpolateSimulation(previous, current, 0.75);
  assert.ok(
    Math.abs(threeQuarter.players.sam.x - quarter.players.sam.x - 4 / 60) <
      1e-12,
  );
  assert.ok(
    Math.abs(threeQuarter.toys.ball.x - quarter.toys.ball.x - 8 / 60) < 1e-12,
  );
  assert.equal(current.players.sam.x, 4 / 30);
});
test("snapshot presentation interpolates position and shortest facing arc without mutating authority", () => {
  const frame = (x: number, facing: number): Simulation => ({
    tick: x,
    players: { ari: { ...bodyAt({ x, y: 0, z: 0 }), facing } },
    toys: {},
    triggers: {},
  });
  const a = frame(0, 3.1),
    b = frame(1, -3.1),
    p = new SnapshotPresentation();
  p.push(a, 0);
  p.push(b, 100);
  const result = p.sample(130)!;
  assert.equal(result.players.ari.x, 0.5);
  assert.ok(Math.abs(result.players.ari.facing - Math.PI) < 1e-10);
  assert.equal(a.players.ari.x, 0);
  assert.equal(p.sample(1000)!.players.ari.x, 1);
  p.reset();
  assert.equal(p.sample(1000), undefined);
});
