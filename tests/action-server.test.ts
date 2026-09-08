import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { WebSocket } from "ws";
import { createRoomService } from "../src/server";
import {
  idleInput,
  stepWorld,
  type Simulation,
  type WorldMap,
} from "../src/core";
import { playfulActionCatalog, type ActionCommand } from "../src/world-actions";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const map: WorldMap = {
  version: 1,
  id: "action-sockets",
  bounds: { x: -10, z: -10, width: 20, depth: 20 },
  spawn: { x: 0, y: 0, z: 0 },
  surfaces: [
    { id: "floor", x: -10, z: -10, width: 20, depth: 20, y: 0, thickness: 0.2 },
  ],
  toys: [
    {
      id: "ball",
      home: { x: 0, y: 0, z: 3 },
      radius: 0.3,
      color: "white",
      sleep: "home",
    },
  ],
  blockers: [],
  triggers: [],
  placementZones: [],
  protectedZones: [],
  actionCatalog: playfulActionCatalog(),
};
function connect(url: string, credential: string, capable = true) {
  const ws = new WebSocket(url),
    messages: any[] = [];
  const closed = new Promise<number>((resolve) =>
    ws.on("close", (code) => resolve(code)),
  );
  ws.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
  ws.on("open", () =>
    ws.send(
      JSON.stringify({
        type: "join",
        version: 1,
        room: "yard",
        credential,
        ...(capable ? { capabilities: ["actions-v1"] } : {}),
      }),
    ),
  );
  return {
    ws,
    messages,
    closed,
    send: (message: unknown) => ws.send(JSON.stringify(message)),
    async wait(
      type: string,
      predicate: (message: any) => boolean = () => true,
    ) {
      for (let i = 0; i < 200; i++) {
        const found = messages.find((m) => m.type === type && predicate(m));
        if (found) return found;
        await sleep(10);
      }
      throw Error(`Missing ${type}: ${JSON.stringify(messages)}`);
    },
  };
}
async function setup() {
  const http = createServer();
  const service = createRoomService({
    server: http,
    map,
    catalog: [],
    leaseMs: 5000,
    authenticate: async (credential) => ({
      id: credential,
      name: credential,
      appearance: "default",
    }),
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
        throw Error("No durable actions");
      },
    },
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const url = `ws://127.0.0.1:${(http.address() as { port: number }).port}/room`;
  const peers: ReturnType<typeof connect>[] = [];
  return {
    service,
    join: (id: string, capable = true) => {
      const peer = connect(url, id, capable);
      peers.push(peer);
      return peer;
    },
    close: async () => {
      for (const peer of peers) peer.ws.terminate();
      await service.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
test("action relay stamps identity, rejects malformed/stale intents, checkpoints effects and replays pending work through host loss and reconnect", async (t) => {
  const s = await setup();
  t.after(s.close);
  const incompatible = s.join("old", false);
  assert.equal(await incompatible.closed, 4400);
  const a = s.join("ari"),
    aid = (await a.wait("welcome")).session;
  const b = s.join("sam"),
    bid = (await b.wait("welcome")).session;
  const room = await a.wait("room", (m) => m.roster.length === 2),
    epoch = room.epoch;
  b.send({
    type: "action",
    epoch,
    session: aid,
    intent: { sequence: 1, kind: "equip", tool: "wake-driver" },
  });
  b.send({
    type: "action",
    epoch,
    intent: { sequence: 2, kind: "use", pressed: true },
  });
  const start = await a.wait("action", (m) => m.command.sequence === 2);
  assert.equal(start.command.session, bid);
  b.send({
    type: "action",
    epoch,
    intent: { sequence: 2, kind: "use", pressed: true },
  });
  b.send({
    type: "action",
    epoch: epoch - 1,
    intent: { sequence: 3, kind: "cancel" },
  });
  await b.wait(
    "rejected",
    (m) => m.actionSequence === 3 && /epoch/.test(m.reason),
  );
  b.send({
    type: "action",
    epoch,
    intent: { sequence: 3, kind: "use", pressed: true, target: aid },
  });
  await b.wait(
    "rejected",
    (m) => m.actionSequence === 3 && /intent/.test(m.reason),
  );
  const state: Simulation = structuredClone(room.state),
    commands: ActionCommand[] = a.messages
      .filter((m) => m.type === "action")
      .map((m) => m.command);
  assert.equal(commands.length, 2);
  for (let i = 0; i < 8; i++)
    stepWorld(
      map,
      state,
      { [aid]: idleInput(), [bid]: { ...idleInput(), toolHeld: true } },
      [],
      [],
      i === 0 ? commands : [],
    );
  assert.ok(
    state.players[aid].y > 0,
    "the shared pulse must move the other actual player",
  );
  a.send({ type: "snapshot", epoch, state });
  const snapshot = await b.wait("snapshot", (m) => m.state.tick === state.tick);
  assert.equal(snapshot.state.actions.appliedSequence, 2);
  assert.equal(
    snapshot.state.actions.events.filter((e: any) => e.kind === "pulse").length,
    1,
  );
  const c = s.join("lee"),
    cid = (await c.wait("welcome")).session;
  const late = await c.wait("room", (m) => m.roster.length === 3);
  assert.deepEqual(
    late.state.actions.players[bid],
    state.actions!.players[bid],
  );
  assert.equal(late.actionCommands.length, 0);
  b.send({
    type: "action",
    epoch,
    intent: { sequence: 3, kind: "equip", tool: "rebound-panel" },
  });
  await a.wait("action", (m) => m.command.sequence === 3);
  a.ws.terminate();
  const recovery = await b.wait(
    "room",
    (m) => m.host === bid && m.epoch > epoch,
  );
  assert.equal(recovery.actionCommands.length, 1);
  assert.equal(recovery.actionCommands[0].sequence, 3);
  const continued: Simulation = structuredClone(recovery.state);
  stepWorld(map, continued, {}, [], [], recovery.actionCommands);
  b.send({ type: "snapshot", epoch: recovery.epoch, state: continued });
  await c.wait("snapshot", (m) => m.epoch === recovery.epoch);
  assert.equal(continued.actions!.players[bid].tool, "rebound-panel");
  c.send({
    type: "snapshot",
    epoch,
    state: { ...continued, tick: continued.tick + 1 },
  });
  await c.wait("rejected", (m) => /authority/.test(m.reason));
  const next = s.join("sam"),
    nextId = (await next.wait("welcome")).session;
  const replaced = await next.wait("room", (m) =>
    m.roster.some((p: any) => p.session === nextId),
  );
  assert.equal(await b.closed, 4410);
  assert.equal(replaced.state.actions.players[nextId].held, false);
  assert.equal(replaced.state.actions.players[nextId].tool, null);
  assert.equal(
    replaced.state.actions.players[nextId].cooldowns["wake-driver"],
    continued.actions!.players[bid].cooldowns["wake-driver"],
  );
  assert.equal(replaced.state.actions.players[bid], undefined);
  assert.ok(replaced.state.players[cid]);
  assert.equal(replaced.actionCommands.length, 0);
});
test("action snapshots cannot acknowledge future commands, inject unknown state, or overflow the bounded queue", async (t) => {
  const s = await setup();
  t.after(s.close);
  const a = s.join("ari"),
    room = await a.wait("room"),
    epoch = room.epoch;
  const invalid = structuredClone(room.state);
  invalid.tick = 1;
  invalid.actions.appliedSequence = 99;
  a.send({ type: "snapshot", epoch, state: invalid });
  await a.wait("rejected", (m) => /snapshot/.test(m.reason));
  invalid.actions.appliedSequence = 0;
  invalid.actions.arbitrary = { script: "run" };
  a.send({ type: "snapshot", epoch, state: invalid });
  for (let i = 1; i <= 28; i++)
    a.send({
      type: "action",
      epoch,
      intent: { sequence: i, kind: "aim", x: 0, z: 1 },
    });
  await a.wait("rejected", (m) => /rate limit/.test(m.reason));
  const b = s.join("sam"),
    metadata = await b.wait("room");
  assert.ok(metadata.actionCommands.length <= 24);
  assert.equal(metadata.state.actions.appliedSequence, 0);
  assert.equal(metadata.state.actions.arbitrary, undefined);
});

test("20 capable socket peers hit the 64-command room bound and a checkpoint drains the queue", async (t) => {
  const s = await setup();
  t.after(s.close);
  const peers = [];
  for (let i = 0; i < 20; i++) {
    const peer = s.join(`actor-${i}`);
    await peer.wait("welcome");
    peers.push(peer);
  }
  const host = peers[0],
    full = await host.wait("room", (m) => m.roster.length === 20);
  for (const peer of peers) {
    peer.send({
      type: "action",
      epoch: full.epoch,
      intent: { sequence: 1, kind: "equip", tool: "wake-driver" },
    });
    peer.send({
      type: "action",
      epoch: full.epoch,
      intent: { sequence: 2, kind: "aim", x: 0, z: 1 },
    });
    peer.send({
      type: "action",
      epoch: full.epoch,
      intent: { sequence: 3, kind: "use", pressed: true },
    });
    peer.send({
      type: "action",
      epoch: full.epoch,
      intent: { sequence: 4, kind: "cancel" },
    });
  }
  await host.wait("action", (m) => m.command.sequence === 64);
  await peers[19].wait("rejected", (m) => /queue/.test(m.reason));
  host.send({ type: "heartbeat", eligible: false });
  const next = peers[1],
    nextId = (await next.wait("welcome")).session;
  const recovery = await next.wait(
    "room",
    (m) => m.host === nextId && m.epoch > full.epoch,
  );
  assert.equal(recovery.actionCommands.length, 64);
  assert.ok(Buffer.byteLength(JSON.stringify(recovery)) < 65536);
  const state: Simulation = structuredClone(recovery.state);
  stepWorld(map, state, {}, [], [], recovery.actionCommands);
  next.send({ type: "snapshot", epoch: recovery.epoch, state });
  const accepted = await peers[2].wait(
    "snapshot",
    (m) => m.epoch === recovery.epoch,
  );
  assert.equal(accepted.state.actions.appliedSequence, 64);
  assert.ok(Buffer.byteLength(JSON.stringify(accepted)) < 65536);
  next.send({ type: "heartbeat", eligible: false });
  const drained = await peers[2].wait("room", (m) => m.epoch > recovery.epoch);
  assert.equal(drained.actionCommands.length, 0);
});
