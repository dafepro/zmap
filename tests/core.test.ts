import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bodyAt,
  idleInput,
  initialSimulation,
  movePlayer,
  stepWorld,
  validateMap,
  validSimulation,
  WALK_SPEED,
} from "zmap/core";
import { courtyard } from "../examples/content";
test("ramp connects ground to overlook without jumping; bridge and underpass remain separate", () => {
  validateMap(courtyard);
  const player = bodyAt({ x: -7, y: 0, z: 6 });
  for (let i = 0; i < Math.ceil((9.6 / WALK_SPEED) * 30); i++)
    movePlayer(courtyard, player, { ...idleInput(), z: -1 }, 1 / 30);
  assert.ok(player.y > 2.99);
  assert.ok(player.z < -3);
  const upper = bodyAt({ x: 0, y: 3, z: 1 }),
    lower = bodyAt({ x: 0, y: 0, z: 1 });
  for (let i = 0; i < 30; i++) {
    movePlayer(courtyard, upper, idleInput(), 1 / 30);
    movePlayer(courtyard, lower, idleInput(), 1 / 30);
  }
  assert.equal(upper.y, 3);
  assert.equal(lower.y, 0);
});
test("height prevents kick through bridge; slope accelerates a resting toy downhill", () => {
  const s = initialSimulation(courtyard);
  s.players.player = bodyAt({ x: 0, y: 0, z: 1 });
  s.toys.ball = bodyAt({ x: 0.5, y: 3, z: 1 });
  stepWorld(courtyard, s, { player: { ...idleInput(), kick: true } });
  assert.equal(s.toys.ball.vx, 0);
  assert.equal(s.toys.ball.y, 3);
  s.toys.ball = bodyAt({ x: -7, y: 1.5, z: 2 });
  stepWorld(courtyard, s, {});
  assert.ok(s.toys.ball.vz > 0);
});
test("diagonal speed is normalized; solid terrace side blocks entry", () => {
  const a = bodyAt({ x: 0, y: 0, z: 13 }),
    b = bodyAt({ x: 0, y: 0, z: 13 });
  movePlayer(courtyard, a, { ...idleInput(), x: 1 }, 1 / 30);
  movePlayer(courtyard, b, { ...idleInput(), x: 1, z: 1 }, 1 / 30);
  assert.ok(
    Math.abs(Math.hypot(a.x, a.z - 13) - Math.hypot(b.x, b.z - 13)) < 1e-8,
  );
  const p = bodyAt({ x: 5, y: 0, z: -1 });
  for (let i = 0; i < 30; i++)
    movePlayer(courtyard, p, { ...idleInput(), z: -1 }, 1 / 30);
  assert.ok(p.z > -2);
  assert.equal(p.y, 0);
});
test("launcher is authored content with cooldown; snapshots reject forged participants and NaN", () => {
  const s = initialSimulation(courtyard);
  s.toys.ball = bodyAt({ x: 5, y: 0, z: 6 });
  stepWorld(courtyard, s, {});
  assert.ok(s.triggers.launcher > 0);
  assert.ok(s.toys.ball.vy > 0);
  assert.ok(validSimulation(s, courtyard, []));
  s.players.forged = bodyAt(courtyard.spawn);
  assert.equal(validSimulation(s, courtyard, []), false);
  delete s.players.forged;
  s.toys.ball.x = NaN;
  assert.equal(validSimulation(s, courtyard, []), false);
});

test("launched toys collide with bridge underside instead of passing through it", () => {
  const state = initialSimulation(courtyard);
  state.toys.ball = { ...bodyAt({ x: 0, y: 1.7, z: 1 }), vy: 8 };
  let bounced = false;
  for (let i = 0; i < 12; i++) {
    stepWorld(courtyard, state, {});
    assert.ok(state.toys.ball.y + 0.76 <= 2.601);
    bounced ||= state.toys.ball.vy < 0;
  }
  assert.ok(bounced);
});

test("kick pose is shared, bounded and returns to rest", () => {
  const s = initialSimulation(courtyard);
  s.players.player = bodyAt(courtyard.spawn);
  stepWorld(courtyard, s, { player: { ...idleInput(), kick: true } });
  assert.ok(s.players.player.kick! > 0.4);
  assert.equal(validSimulation(s, courtyard, ["player"]), true);
  const roundTrip = JSON.parse(JSON.stringify(s));
  assert.equal(roundTrip.players.player.kick, s.players.player.kick);
  for (let i = 0; i < 20; i++) stepWorld(courtyard, s, {});
  assert.equal(s.players.player.kick, 0);
  s.players.player.kick = 100;
  assert.equal(validSimulation(s, courtyard, ["player"]), false);
});
