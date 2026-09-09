import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { WebSocket } from "ws";
import { createRoomService } from "../src/server";
import { idleInput, stepWorld, type WorldMap } from "../src/core";
import { mergeUnconsumedInput } from "../src/client";

const map: WorldMap = {
  version: 1,
  id: "input-sync",
  bounds: { x: -10, z: -10, width: 20, depth: 20 },
  spawn: { x: 0, y: 0, z: 0 },
  surfaces: [
    { id: "floor", x: -10, z: -10, width: 20, depth: 20, y: 0, thickness: 0.2 },
  ],
  toys: [],
  blockers: [],
  triggers: [],
  placementZones: [],
  protectedZones: [],
};
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function setup() {
  const server = createServer(),
    peers: WebSocket[] = [];
  const service = createRoomService({
    server,
    map,
    catalog: [],
    leaseMs: 5000,
    authenticate: async (id) => ({ id, name: id, appearance: "default" }),
    canAccess: async () => true,
    store: {
      load: async () => ({
        version: 1,
        mapId: map.id,
        revision: 0,
        items: [],
        receipts: {},
      }),
      commit: async () => {
        throw Error("No writes");
      },
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `ws://127.0.0.1:${(server.address() as { port: number }).port}/room`;
  return {
    join(id: string, capable = true) {
      const ws = new WebSocket(url),
        messages: any[] = [];
      peers.push(ws);
      ws.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
      ws.on("open", () =>
        ws.send(
          JSON.stringify({
            type: "join",
            version: 1,
            room: "test",
            credential: id,
            capabilities: capable ? ["input-ack-v1"] : [],
          }),
        ),
      );
      return {
        ws,
        messages,
        closed: new Promise<{ code: number; reason: string }>((resolve) =>
          ws.on("close", (code, reason) =>
            resolve({ code, reason: reason.toString() }),
          ),
        ),
        send: (message: unknown) => ws.send(JSON.stringify(message)),
        async wait(
          type: string,
          predicate: (message: any) => boolean = () => true,
        ) {
          for (let n = 0; n < 250; n++) {
            const value = messages.find(
              (message) => message.type === type && predicate(message),
            );
            if (value) return value;
            await delay(10);
          }
          throw Error(`Missing ${type}: ${JSON.stringify(messages)}`);
        },
      };
    },
    async close() {
      for (const peer of peers) peer.terminate();
      await service.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
test("relay validates input sequence acknowledgements and transfers the fresh accepted movement sample to a new host", async (t) => {
  const s = await setup();
  t.after(s.close);
  const a = s.join("ari"),
    aid = (await a.wait("welcome")).session;
  const b = s.join("sam"),
    bid = (await b.wait("welcome")).session;
  const room = await a.wait("room", (message) => message.roster.length === 2);
  b.send({
    type: "input",
    sequence: 4,
    input: { ...idleInput(), x: 1, kick: true, wave: true, toolHeld: true },
  });
  const input = await a.wait("input", (message) => message.session === bid);
  assert.equal(input.sequence, 4);
  assert.equal(input.input.x, 1);
  b.send({ type: "input", sequence: 3, input: idleInput() });
  b.send({ type: "input", sequence: 0, input: idleInput() });
  await b.wait("rejected", (message) => /sequence/.test(message.reason));
  const state = structuredClone(room.state);
  stepWorld(map, state, { [bid]: input.input });
  for (const inputAcks of [{ [bid]: 5 }, { unknown: 1 }])
    a.send({ type: "snapshot", epoch: room.epoch, state, inputAcks });
  await a.wait("rejected", (message) => /acknowledg/.test(message.reason));
  a.send({
    type: "snapshot",
    epoch: room.epoch,
    state,
    inputAcks: { [aid]: 0, [bid]: 4 },
  });
  const accepted = await b.wait("snapshot");
  assert.equal(accepted.inputAcks[bid], 4);
  assert.ok(accepted.state.players[bid].x > 0);
  a.send({
    type: "snapshot",
    epoch: room.epoch,
    state: { ...state, tick: state.tick + 1 },
    inputAcks: { [bid]: 3 },
  });
  await a.wait("rejected", (message) => /range/.test(message.reason));
  a.send({ type: "heartbeat", eligible: false });
  const next = await b.wait("room", (message) => message.host === bid);
  assert.equal(next.inputAcks[bid], 4);
  assert.equal(next.inputs[bid].sequence, 4);
  assert.equal(next.inputs[bid].input.x, 1);
  assert.equal(next.inputs[bid].input.toolHeld, true);
  assert.equal(
    next.inputs[bid].input.kick,
    false,
    "acknowledged kick cannot fire again on handoff",
  );
  assert.equal(
    next.inputs[bid].input.wave,
    false,
    "acknowledged wave cannot restart on handoff",
  );
  const resumed = structuredClone(next.state),
    gesture = resumed.players[bid].gesture;
  stepWorld(map, resumed, { [bid]: next.inputs[bid].input });
  assert.ok(
    resumed.players[bid].gesture < gesture,
    "the accepted wave should finish, not restart",
  );
  assert.ok(next.inputs[bid].ageMs < 250);
  assert.equal(
    a.messages.filter(
      (message) => message.type === "input" && message.session === bid,
    ).length,
    1,
  );
});
test("an unacknowledged kick and wave survive a host handoff exactly as pending input", async (t) => {
  const s = await setup();
  t.after(s.close);
  const a = s.join("ari");
  await a.wait("welcome");
  const b = s.join("sam"),
    bid = (await b.wait("welcome")).session;
  await a.wait("room", (message) => message.roster.length === 2);
  b.send({
    type: "input",
    sequence: 1,
    input: { ...idleInput(), kick: true, wave: true },
  });
  await a.wait("input", (message) => message.session === bid);
  b.send({
    type: "input",
    sequence: 2,
    input: { ...idleInput(), x: -1, toolHeld: true },
  });
  await a.wait(
    "input",
    (message) => message.session === bid && message.sequence === 2,
  );
  a.send({ type: "heartbeat", eligible: false });
  const next = await b.wait("room", (message) => message.host === bid);
  assert.equal(next.inputAcks[bid] ?? 0, 0);
  assert.equal(next.inputs[bid].input.kick, true);
  assert.equal(next.inputs[bid].input.wave, true);
  assert.equal(next.inputs[bid].sequence, 2);
  assert.equal(next.inputs[bid].input.x, -1);
  assert.equal(next.inputs[bid].input.toolHeld, true);
});
test("newer held samples cannot erase pending edges, and consuming one step prevents another wave", () => {
  const moving = {
    ...idleInput(),
    x: 1,
    kick: true,
    wave: true,
    toolHeld: true,
  };
  const stopped = { ...idleInput(), z: -1 };
  const pending = mergeUnconsumedInput(moving, stopped);
  assert.deepEqual(pending, { ...stopped, kick: true, wave: true });
  pending.kick = false;
  pending.wave = false;
  assert.deepEqual(mergeUnconsumedInput(pending, stopped), stopped);
  assert.deepEqual(
    moving,
    { ...idleInput(), x: 1, kick: true, wave: true, toolHeld: true },
    "mailbox merging does not mutate received samples",
  );
});
test("legacy and input-ack clients cannot share one transient room in either join order", async (t) => {
  for (const firstModern of [false, true]) {
    const s = await setup();
    t.after(s.close);
    const first = s.join("ari", firstModern),
      welcome = await first.wait("welcome");
    assert.equal(welcome.capabilities.includes("input-ack-v1"), firstModern);
    const incompatible = s.join("sam", !firstModern),
      closed = await incompatible.closed;
    assert.equal(closed.code, 4400);
    assert.match(closed.reason, /Incompatible room input protocol/);
    const compatible = s.join("jo", firstModern);
    const room = await compatible.wait("room");
    assert.equal(room.roster.length, 2);
    assert.equal(room.host, welcome.session);
  }
});
test("a host cannot retain authority by publishing slow token snapshots while acknowledging heartbeats", async (t) => {
  const s = await setup();
  t.after(s.close);
  const a = s.join("ari");
  await a.wait("welcome");
  const b = s.join("sam"),
    bid = (await b.wait("welcome")).session;
  const room = await a.wait("room", (message) => message.roster.length === 2),
    state = structuredClone(room.state);
  const timer = setInterval(() => {
    state.tick += 2;
    a.send({ type: "heartbeat", eligible: true });
    a.send({ type: "snapshot", epoch: room.epoch, state, inputAcks: {} });
  }, 350);
  t.after(() => clearInterval(timer));
  const recovery = await b.wait(
    "room",
    (message) => message.host === bid && message.epoch > room.epoch,
  );
  assert.ok(
    recovery.state.tick < 15,
    "under-speed progress should be detected before a second of gameplay accumulates",
  );
});
