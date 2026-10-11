import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bodyAt,
  idleInput,
  initialSimulation,
  stepWorld,
  validateMap,
  type WorldMap,
} from "zmap/core";
import { courtyard } from "../examples/content";
import { anticipateStrike } from "../src/strike";

const sky = (): WorldMap => ({
  ...courtyard,
  kickWindup: 0.2,
  toys: courtyard.toys.map((toy) => ({
    ...toy,
    gravity: 5.4,
    rollingResistance: 1,
    strike: { speed: 6.1, closeSpeed: 2.8, closeLift: 8.4 },
  })),
});

function kick(distance: number) {
  const map = sky(),
    state = initialSimulation(map);
  state.players.player = bodyAt({ x: 0, y: 0, z: 13 });
  state.toys.ball = bodyAt({ x: distance, y: 0, z: 13 });
  stepWorld(map, state, { player: { ...idleInput(), kick: true } });
  for (let i = 0; i < 6; i++) stepWorld(map, state, {});
  return { map, state, ball: state.toys.ball };
}

test("a very close kick rises above three avatar heights and stays airborne long enough to chase", () => {
  const { map, state, ball } = kick(0.55);
  validateMap(map);
  assert.ok(ball.vy > 8, "close lift is applied at the shared contact tick");
  assert.ok(
    Math.hypot(ball.vx, ball.vz) < 3.3,
    "close horizontal travel is slow",
  );
  let apex = ball.y + map.toys[0].radius,
    airborneTicks = 0;
  for (let tick = 0; tick < 120; tick++) {
    stepWorld(map, state, {});
    apex = Math.max(apex, ball.y + map.toys[0].radius);
    if (ball.y > 0.1) airborneTicks++;
  }
  assert.ok(apex > 6, `ball centre reached ${apex.toFixed(2)} m`);
  assert.ok(airborneTicks > 75, `ball stayed up for ${airborneTicks / 30} s`);
});

test("distant kicks still travel across the pitch while legacy toys retain 18 m/s² gravity", () => {
  const { ball } = kick(1.4);
  assert.ok(ball.vx > 5.8 && ball.vx < 6.3);
  assert.ok(ball.vy < 1);
  const legacy = { ...courtyard, triggers: [] },
    legacyState = initialSimulation(legacy),
    tuned = {
      ...legacy,
      toys: legacy.toys.map((toy) => ({ ...toy, gravity: 5.4 })),
    },
    tunedState = initialSimulation(tuned);
  for (const state of [legacyState, tunedState])
    Object.assign(state.toys.ball, { y: 4, vy: 8 });
  stepWorld(legacy, legacyState, {});
  stepWorld(tuned, tunedState, {});
  assert.ok(legacyState.toys.ball.vy < tunedState.toys.ball.vy - 0.3);
});

test("a second player can run under a sky ball and head it on descent", () => {
  const map = { ...sky(), blockers: [], triggers: [] },
    state = initialSimulation(map);
  state.players.shooter = bodyAt({ x: 0, y: 0, z: 13 });
  state.players.chaser = bodyAt({ x: -5, y: 0, z: 13 });
  state.toys.ball = bodyAt({ x: 0.55, y: 0, z: 13 });
  stepWorld(map, state, { shooter: { ...idleInput(), kick: true } });
  let attempted = false,
    connected = false;
  for (let tick = 0; tick < 120; tick++) {
    const ball = state.toys.ball,
      chaser = state.players.chaser,
      chase = chaser.x < ball.x - 0.35;
    const press =
      !attempted &&
      ball.vy < -4 &&
      ball.y >= 2.9 &&
      ball.y <= 3.05 &&
      Math.abs(ball.x - chaser.x) < 0.95;
    const previousVY = ball.vy;
    stepWorld(map, state, {
      chaser: { ...idleInput(), x: chase ? 1 : 0, sprint: chase, kick: press },
    });
    if (press) {
      attempted = true;
      assert.equal(
        chaser.strike?.kind,
        "header",
        JSON.stringify({ ball, chaser, chase }),
      );
    }
    if (attempted && ball.vy > previousVY + 1) connected = true;
  }
  assert.ok(attempted, "the chaser reached the descending ball at head height");
  assert.ok(connected, "the timed header gave the ball a second impulse");
});

test("strike anticipation uses the ball's authored gravity", () => {
  const player = bodyAt({ x: 0, y: 0, z: 13 }),
    ball = { ...bodyAt({ x: 0.7, y: 1.5, z: 13 }), vy: 6 };
  const low = anticipateStrike(player, ball, "ball", 0.3, 0, 0.2, 5.4),
    normal = anticipateStrike(player, ball, "ball", 0.3, 0, 0.2, 18);
  assert.ok(low && normal);
  assert.ok(low.target.y > normal.target.y + 0.2);
});

test("bad authored gravity and close travel speed fail map validation", () => {
  for (const gravity of [0, -1, 31, Number.NaN])
    assert.throws(() =>
      validateMap({
        ...sky(),
        toys: sky().toys.map((toy) => ({ ...toy, gravity })),
      }),
    );
  for (const closeSpeed of [0, -1, 21, Number.NaN])
    assert.throws(() =>
      validateMap({
        ...sky(),
        toys: sky().toys.map((toy) => ({
          ...toy,
          strike: { speed: 6.1, closeSpeed, closeLift: 8.4 },
        })),
      }),
    );
});
