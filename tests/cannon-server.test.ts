import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { WebSocket } from "ws";
import { cannonBehavior, cannonObject, type CannonState } from "../src/cannon";
import { createRoomService } from "../src/server";
import { stepWorld, type Simulation, type WorldMap } from "../src/core";
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const map: WorldMap = {
  version: 1,
  id: "cannon-network",
  bounds: { x: -10, z: -10, width: 20, depth: 20 },
  spawn: { x: -4, y: 0, z: -4 },
  surfaces: [
    { id: "floor", x: -10, z: -10, width: 20, depth: 20, y: 0, thickness: 0.3 },
  ],
  blockers: [],
  toys: [
    {
      id: "ball",
      home: { x: 0, y: 0, z: -1.5 },
      radius: 0.35,
      color: "white",
      sleep: "home",
    },
  ],
  triggers: [],
  placementZones: [],
  protectedZones: [],
  objects: [cannonObject("cannon", { x: 0, y: 0, z: 0 }, 0, ["ball"])],
};
async function setup() {
  const http = createServer(),
    service = createRoomService({
      server: http,
      map,
      objectBehaviors: [cannonBehavior],
      catalog: [],
      leaseMs: 5000,
      authenticate: async (identity) => ({
        id: identity,
        name: identity,
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
          throw Error("No durable cannon state");
        },
      },
    });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const url = `ws://127.0.0.1:${(http.address() as { port: number }).port}/room`,
    sockets: WebSocket[] = [];
  function join(credential: string, compatible = true) {
    const ws = new WebSocket(url),
      messages: any[] = [],
      closed = new Promise<number>((resolve) => ws.on("close", resolve));
    sockets.push(ws);
    ws.on("message", (data) => messages.push(JSON.parse(data.toString())));
    ws.on("open", () =>
      ws.send(
        JSON.stringify({
          type: "join",
          version: 1,
          room: "yard",
          credential,
          capabilities: compatible ? ["world-objects-v1"] : [],
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
        for (let i = 0; i < 250; i++) {
          const found = messages.find(
            (message) => message.type === type && predicate(message),
          );
          if (found) return found;
          await pause(10);
        }
        throw Error(`Missing ${type}: ${JSON.stringify(messages)}`);
      },
    };
  }
  return {
    join,
    close: async () => {
      sockets.forEach((ws) => ws.terminate());
      await service.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
test("late join and host loss during a cannon fuse preserve ownership and launch exactly once from the accepted checkpoint", async (t) => {
  const room = await setup();
  t.after(room.close);
  assert.equal(await room.join("old-client", false).closed, 4400);
  const host = room.join("ari"),
    hostId = (await host.wait("welcome")).session;
  const friend = room.join("sam"),
    friendId = (await friend.wait("welcome")).session;
  const start = await host.wait(
      "room",
      (message) => message.roster.length === 2,
    ),
    state: Simulation = structuredClone(start.state);
  for (let i = 0; i < 12; i++)
    stepWorld(map, state, {}, [], [], [], [cannonBehavior]);
  host.send({ type: "snapshot", epoch: start.epoch, state });
  const accepted = await friend.wait(
    "snapshot",
    (message) => message.state.tick === 12,
  );
  assert.equal(
    (accepted.state.objects.instances.cannon as CannonState).balls.ball
      .untilTick,
    25,
  );
  const late = room.join("lee"),
    lateState = await late.wait(
      "room",
      (message) => message.roster.length === 3,
    );
  assert.deepEqual(lateState.state.objects, state.objects);
  host.ws.terminate();
  const takeover = await friend.wait(
    "room",
    (message) => message.host === friendId && message.epoch > start.epoch,
  );
  const continued: Simulation = structuredClone(takeover.state);
  assert.equal(continued.players[hostId], undefined);
  for (let i = 0; i < 12; i++)
    stepWorld(map, continued, {}, [], [], [], [cannonBehavior]);
  assert.equal(
    continued.objects!.events.filter((event) => event.kind === "fire").length,
    0,
  );
  stepWorld(map, continued, {}, [], [], [], [cannonBehavior]);
  friend.send({ type: "snapshot", epoch: takeover.epoch, state: continued });
  const launched = await late.wait(
    "snapshot",
    (message) => message.state.tick === 25,
  );
  assert.equal(
    launched.state.objects.events.filter((event: any) => event.kind === "fire")
      .length,
    1,
  );
  assert.equal(launched.state.toys.ball.teleportEpoch, 1);
  assert.equal(Object.keys(launched.state.toys).length, 1);
  const newest = room.join("jo"),
    after = await newest.wait("room", (message) => message.roster.length === 3);
  assert.deepEqual(after.state.objects, continued.objects);
  assert.equal(after.state.toys.ball.teleportEpoch, 1);
  assert.ok(Buffer.byteLength(JSON.stringify(after)) < 65536);
});
test("relay rejects malformed world-object checkpoints, event rollback and missing epoch authority", async (t) => {
  const room = await setup();
  t.after(room.close);
  const host = room.join("ari"),
    start = await host.wait("room");
  const state: Simulation = structuredClone(start.state);
  stepWorld(map, state, {}, [], [], [], [cannonBehavior]);
  host.send({ type: "snapshot", epoch: start.epoch, state });
  await host.wait("snapshot", (message) => message.state.tick === 1);
  const malformed = structuredClone(state);
  malformed.tick = 2;
  (malformed.objects as any).injected = { script: "run" };
  host.send({ type: "snapshot", epoch: start.epoch, state: malformed });
  await host.wait("rejected", (message) => /snapshot/.test(message.reason));
  const rollback = structuredClone(state);
  rollback.tick = 2;
  rollback.objects!.eventSequence = 0;
  rollback.objects!.events = [];
  host.send({ type: "snapshot", epoch: start.epoch, state: rollback });
  for (
    let i = 0;
    i < 100 &&
    host.messages.filter((message) => message.type === "rejected").length < 2;
    i++
  )
    await pause(10);
  assert.equal(
    host.messages.filter((message) => message.type === "rejected").length,
    2,
  );
  const stale = structuredClone(state);
  stale.tick = 2;
  host.send({ type: "snapshot", epoch: start.epoch - 1, state: stale });
  for (
    let i = 0;
    i < 100 &&
    host.messages.filter((message) => message.type === "rejected").length < 3;
    i++
  )
    await pause(10);
  assert.equal(
    host.messages.filter((message) => message.type === "rejected").length,
    3,
  );
  const malformedEffect = structuredClone(state);
  malformedEffect.tick = 2;
  malformedEffect.objects!.events[0].kind = "fire";
  malformedEffect.objects!.events[0].data = null;
  host.send({ type: "snapshot", epoch: start.epoch, state: malformedEffect });
  for (
    let i = 0;
    i < 100 &&
    host.messages.filter((message) => message.type === "rejected").length < 4;
    i++
  )
    await pause(10);
  assert.equal(
    host.messages.filter((message) => message.type === "rejected").length,
    4,
  );
  const peer = room.join("sam"),
    accepted = await peer.wait(
      "room",
      (message) => message.roster.length === 2,
    );
  assert.equal(accepted.state.tick, 1);
  assert.equal(accepted.state.objects.eventSequence, 1);
  assert.equal(accepted.state.objects.injected, undefined);
});
