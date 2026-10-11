import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bodyAt,
  idleInput,
  initialSimulation,
  stepWorld,
  validSimulation,
  validateMap,
} from "zmap/core";
import { courtyard } from "../examples/content";

const map = {
  ...courtyard,
  kickWindup: 0.2,
  toys: courtyard.toys.map((toy) => ({
    ...toy,
    strike: { speed: 5.5, closeLift: 5.8 },
    rollingResistance: 1.3,
  })),
};
function shoot(distance: number, height: number, verticalSpeed = 0) {
  const state = initialSimulation(map);
  state.players.player = bodyAt({ x: 0, y: 0, z: 13 });
  state.toys.ball = {
    ...bodyAt({ x: distance, y: height, z: 13 }),
    vy: verticalSpeed,
  };
  stepWorld(map, state, { player: { ...idleInput(), kick: true } });
  const anticipation = structuredClone(state.players.player.strike);
  for (let i = 0; i < 6; i++) stepWorld(map, state, {});
  return {
    state,
    anticipation,
    player: state.players.player,
    ball: state.toys.ball,
  };
}

test("close pitch kicks loft; farther contacts stay low and both travel slower", () => {
  validateMap(map);
  const close = shoot(0.65, 0),
    far = shoot(1.4, 0);
  assert.equal(close.player.strike?.kind, "ground");
  assert.equal(far.player.strike?.kind, "ground");
  assert.ok(close.ball.vy > 4);
  assert.ok(far.ball.vy < 1);
  assert.ok(close.ball.vx > 5 && close.ball.vx < 6);
  assert.ok(far.ball.vx > 5 && far.ball.vx < 6);
  for (let i = 0; i < 60; i++) stepWorld(map, far.state, {});
  assert.ok(
    far.ball.vx < 3.1,
    "the slower pitched ball must be catchable after two seconds",
  );
  const legacy = initialSimulation(courtyard);
  legacy.players.player = bodyAt({ x: 0, y: 0, z: 13 });
  legacy.toys.ball = bodyAt({ x: 1, y: 0, z: 13 });
  stepWorld(courtyard, legacy, { player: { ...idleInput(), kick: true } });
  assert.ok(legacy.toys.ball.vx > 7);
});

test("header jumps toward the predicted ball, then contacts its actual head-height position", () => {
  const { state, anticipation, player, ball } = shoot(0.7, 1.85);
  assert.equal(anticipation?.kind, "header");
  assert.equal(player.strike?.kind, "header");
  assert.ok(
    player.strike!.jumpHeight > 0.35 && player.strike!.jumpHeight < 0.5,
  );
  assert.ok(player.y > 0.25);
  assert.ok(ball.vx > 4 && ball.vy > 0);
  assert.ok(validSimulation(state, map, ["player"]));
  assert.deepEqual(
    JSON.parse(JSON.stringify(state.players.player.strike)),
    player.strike,
  );
  player.strike!.target.y = Number.NaN;
  assert.equal(validSimulation(state, map, ["player"]), false);
});

test("an overhead ball gets a bicycle strike and the physical jump lands", () => {
  const { state, anticipation, player, ball } = shoot(0.7, 3);
  assert.equal(anticipation?.kind, "bicycle");
  assert.equal(player.strike?.kind, "bicycle");
  assert.ok(player.strike!.jumpHeight > 0.6 && player.strike!.jumpHeight < 0.8);
  assert.ok(player.y > 0.4);
  assert.ok(ball.vx > 5 && ball.vy > 2);
  let apex = player.y;
  for (let i = 0; i < 28; i++) {
    stepWorld(map, state, {});
    apex = Math.max(apex, player.y);
  }
  assert.ok(apex > 0.55 && apex < 0.8);
  assert.equal(player.y, 0);
  assert.equal(player.vy, 0);
});

test("actual contact height and reach can turn a predicted header into a miss", () => {
  const state = initialSimulation(map);
  state.players.player = bodyAt({ x: 0, y: 0, z: 13 });
  state.toys.ball = bodyAt({ x: 0.7, y: 1.85, z: 13 });
  stepWorld(map, state, { player: { ...idleInput(), kick: true } });
  assert.equal(state.players.player.strike?.kind, "header");
  for (let i = 0; i < 3; i++) stepWorld(map, state, {});
  state.toys.ball.x = 3;
  for (let i = 0; i < 3; i++) stepWorld(map, state, {});
  assert.equal(state.toys.ball.vx, 0);
  assert.ok(state.players.player.y > 0, "jump remains a real committed action");
});

test("contact height can reclassify a planned header as an overhead boot strike", () => {
  const state = initialSimulation(map);
  state.players.player = bodyAt({ x: 0, y: 0, z: 13 });
  state.toys.ball = bodyAt({ x: 0.7, y: 1.85, z: 13 });
  stepWorld(map, state, { player: { ...idleInput(), kick: true } });
  assert.equal(state.players.player.strike?.kind, "header");
  for (let i = 0; i < 3; i++) stepWorld(map, state, {});
  state.toys.ball.y = 2.55;
  state.toys.ball.vy = 0;
  for (let i = 0; i < 3; i++) stepWorld(map, state, {});
  assert.equal(state.players.player.strike?.kind, "bicycle");
  assert.ok(state.toys.ball.vx > 5);
  assert.equal(
    state.players.player.strike?.jumpHeight,
    0.44,
    "the committed jump is not retroactively enlarged",
  );
});

test("invalid strike tuning and malformed shared targets are rejected", () => {
  for (const speed of [-1, 0, 31, Number.NaN])
    assert.throws(() =>
      validateMap({
        ...map,
        toys: [{ ...map.toys[0], strike: { speed, closeLift: 5 } }],
      }),
    );
  assert.throws(() => validateMap({ ...map, kickWindup: 0 }));
});
