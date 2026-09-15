import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { WebSocket } from "ws";
import { createRoomService } from "../src/server";
import {
  idleInput,
  stepWorld,
  type WorldMap,
  type Simulation,
} from "../src/core";
import { playfulActionCatalog, type ActionCommand } from "../src/world-actions";

test("emotes retain an approved timeline across late join and host loss; legacy peers and forged performance snapshots are rejected", async (t) => {
  const map: WorldMap = {
    version: 1,
    id: "performance-sockets",
    bounds: { x: -5, z: -5, width: 10, depth: 10 },
    spawn: { x: 0, y: 0, z: 0 },
    surfaces: [
      { id: "floor", x: -5, z: -5, width: 10, depth: 10, y: 0, thickness: 0.2 },
    ],
    blockers: [],
    toys: [],
    triggers: [],
    placementZones: [],
    protectedZones: [],
    actionCatalog: {
      ...playfulActionCatalog(),
      performance: {
        emotes: [{ id: "dance", durationTicks: 180 }],
        drawTicks: 30,
        stowTicks: 30,
      },
    },
  };
  const http = createServer();
  const service = createRoomService({
    server: http,
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
        throw Error("No durable edits");
      },
    },
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const url = `ws://127.0.0.1:${(http.address() as { port: number }).port}/room`;
  const sockets: WebSocket[] = [];
  t.after(async () => {
    sockets.forEach((ws) => ws.terminate());
    await service.close();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  function connect(id: string, capable = true) {
    const ws = new WebSocket(url),
      messages: any[] = [];
    sockets.push(ws);
    const closed = new Promise<number>((resolve) => ws.on("close", resolve));
    ws.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
    ws.on("open", () =>
      ws.send(
        JSON.stringify({
          type: "join",
          version: 1,
          room: "test",
          credential: id,
          capabilities: ["actions-v1", ...(capable ? ["performance-v1"] : [])],
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
        for (let i = 0; i < 300; i++) {
          const found = messages.find(
            (message) => message.type === type && predicate(message),
          );
          if (found) return found;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        throw Error(`Missing ${type}`);
      },
    };
  }
  assert.equal(await connect("old", false).closed, 4400);
  const a = connect("ari"),
    aid = (await a.wait("welcome")).session;
  const b = connect("sam"),
    bid = (await b.wait("welcome")).session;
  const room = await a.wait("room", (m) => m.roster.length === 2);
  assert.equal(room.host, aid);
  const state: Simulation = structuredClone(room.state);
  const inputs = { [aid]: idleInput(), [bid]: idleInput() };
  b.send({
    type: "action",
    epoch: room.epoch,
    intent: { sequence: 1, kind: "equip", tool: "rebound-panel" },
  });
  const equip: ActionCommand = (
    await a.wait("action", (m) => m.command.sequence === 1)
  ).command;
  stepWorld(map, state, inputs, [], [], [equip]);
  for (let i = 0; i < 30; i++) stepWorld(map, state, inputs);
  b.send({
    type: "action",
    epoch: room.epoch,
    session: aid,
    intent: { sequence: 2, kind: "emote", emote: "dance" },
  });
  const emote: ActionCommand = (
    await a.wait("action", (m) => m.command.sequence === 2)
  ).command;
  assert.equal(
    emote.session,
    bid,
    "relay stamps the performer from its authenticated session",
  );
  stepWorld(map, state, inputs, [], [], [emote]);
  const accepted = structuredClone(state.actions!.players[bid].performance);
  a.send({ type: "snapshot", epoch: room.epoch, state });
  await b.wait("snapshot", (m) => m.state.tick === state.tick);
  const c = connect("jo"),
    welcome = await c.wait("welcome"),
    cid = welcome.session;
  const joined = await c.wait("room", (m) => m.roster.length === 3);
  assert.deepEqual(joined.state.actions.players[bid].performance, accepted);
  assert.ok(
    joined.state.tick < accepted!.emote!.startedTick,
    "late join sees the active stow before the clip",
  );
  const forged = structuredClone(joined.state);
  forged.tick++;
  forged.actions.players[bid].performance.emote.untilTick++;
  a.send({ type: "snapshot", epoch: joined.epoch, state: forged });
  await a.wait("rejected", (m) => /snapshot/.test(m.reason));
  a.ws.close();
  const recovered = await b.wait(
    "room",
    (m) => m.host === bid && m.epoch > joined.epoch,
  );
  assert.deepEqual(recovered.state.actions.players[bid].performance, accepted);
  const resumed: Simulation = structuredClone(recovered.state);
  for (let i = 0; i < 45; i++)
    stepWorld(map, resumed, { [bid]: idleInput(), [cid]: idleInput() });
  assert.equal(
    resumed.actions!.players[bid].performance!.emote!.startedTick,
    accepted!.emote!.startedTick,
  );
  b.send({ type: "snapshot", epoch: recovered.epoch, state: resumed });
  const seen = await c.wait("snapshot", (m) => m.state.tick === resumed.tick);
  assert.deepEqual(
    seen.state.actions.players[bid].performance,
    resumed.actions!.players[bid].performance,
  );
  b.send({
    type: "action",
    epoch: recovered.epoch,
    intent: { sequence: 3, kind: "emote", emote: "unapproved" },
  });
  await b.wait(
    "rejected",
    (m) => m.actionSequence === 3 && /intent/.test(m.reason),
  );
});
