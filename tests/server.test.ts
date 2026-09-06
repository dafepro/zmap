import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { WebSocket } from "ws";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRoomService } from "zmap/server";
import { ExampleStore } from "../examples/store";
import { courtyard, catalog, identities } from "../examples/content";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function connect(url: string, identity: string, room = "test") {
  const ws = new WebSocket(url);
  const messages: any[] = [];
  ws.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
  ws.on("open", () =>
    ws.send(
      JSON.stringify({ type: "join", version: 1, room, credential: identity }),
    ),
  );
  return {
    ws,
    messages,
    send: (m: unknown) => ws.send(JSON.stringify(m)),
    async wait(type: string, predicate: (m: any) => boolean = () => true) {
      for (let i = 0; i < 150; i++) {
        const m = messages.find((m) => m.type === type && predicate(m));
        if (m) return m;
        await sleep(20);
      }
      throw Error(`Timed out ${type}: ${JSON.stringify(messages)}`);
    },
  };
}
test("real sockets: late join, host fencing, abrupt loss, denied access, durable state protected from host", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zmap-server-"));
  const http = createServer();
  let revoked = false;
  const service = createRoomService({
    server: http,
    map: courtyard,
    catalog,
    store: new ExampleStore(dir, () => true),
    authenticate: async (token) => identities[token] ?? null,
    canAccess: async (identity, room) =>
      room === "test" && !(revoked && identity.id === "sam"),
    leaseMs: 600,
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const address = http.address() as { port: number };
  const url = `ws://127.0.0.1:${address.port}/room`;
  try {
    const a = connect(url, "ari");
    const initial = await a.wait("room");
    const aid = (await a.wait("welcome")).session;
    assert.equal(initial.host, aid);
    const b = connect(url, "sam");
    const bid = (await b.wait("welcome")).session;
    const joined = await a.wait("room", (m) => m.roster.length === 2);
    const next = structuredClone(joined.state);
    next.tick++;
    next.toys.ball.x = 4;
    a.send({
      type: "snapshot",
      epoch: joined.epoch,
      state: { ...next, durable: { items: [{ owner: "forged" }] } },
    });
    assert.equal(joined.durable.receipts, undefined);
    const snapshot = await b.wait("snapshot");
    assert.equal(snapshot.state.toys.ball.x, 4);
    assert.equal(snapshot.state.durable, undefined);
    b.send({
      type: "snapshot",
      epoch: joined.epoch,
      state: { ...next, tick: next.tick + 1 },
    });
    await b.wait("rejected", (m) => m.reason.includes("authority"));
    a.ws.terminate();
    const recovery = await b.wait("room", (m) => m.host === bid);
    assert.ok(recovery.epoch > joined.epoch);
    assert.equal(recovery.state.toys.ball.x, 4);
    const c = connect(url, "jo");
    const late = await c.wait("room");
    assert.equal(late.state.toys.ball.x, 4);
    assert.equal(late.roster.length, 2);
    b.send({
      type: "edit",
      command: {
        id: "save-1",
        operation: "place",
        itemId: "sam-planter",
        type: "planter",
        position: { x: 10, y: 0, z: 4 },
        rotation: 0,
        expectedRevision: 0,
      },
    });
    await b.wait("saved");
    assert.equal((await c.wait("durable")).durable.items[0].owner, "sam");
    revoked = true;
    b.send({ type: "input", input: { x: 1, z: 0 } });
    await new Promise<void>((r) =>
      b.ws.once("close", (code) => {
        assert.equal(code, 4403);
        r();
      }),
    );
    const denied = connect(url, "ari", "another-team");
    await new Promise<void>((r) =>
      denied.ws.once("close", (code) => {
        assert.equal(code, 4403);
        r();
      }),
    );
    c.ws.terminate();
    await sleep(100);
    assert.equal(service.diagnostics().rooms, 0);
  } finally {
    await service.close();
    await new Promise<void>((r) => http.close(() => r()));
    await rm(dir, { recursive: true, force: true });
  }
});
test("a silent host lease expires without a final leave message", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zmap-lease-"));
  const http = createServer();
  const service = createRoomService({
    server: http,
    map: courtyard,
    catalog,
    store: new ExampleStore(dir, () => true),
    authenticate: async (token) => identities[token] ?? null,
    canAccess: async () => true,
    leaseMs: 500,
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const url = `ws://127.0.0.1:${(http.address() as { port: number }).port}/room`;
  try {
    const a = connect(url, "ari");
    const room = await a.wait("room");
    const b = connect(url, "sam");
    const id = (await b.wait("welcome")).session;
    const heartbeat = setInterval(
      () => b.send({ type: "heartbeat", eligible: true }),
      100,
    );
    try {
      const changed = await b.wait(
        "room",
        (m) => m.host === id && m.epoch > room.epoch,
      );
      assert.ok(changed.epoch > room.epoch);
    } finally {
      clearInterval(heartbeat);
      a.ws.terminate();
      b.ws.terminate();
    }
  } finally {
    await service.close();
    await new Promise<void>((r) => http.close(() => r()));
    await rm(dir, { recursive: true, force: true });
  }
});

test("full rooms reject a new identity but allow the same identity to replace its tab", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zmap-capacity-"));
  const http = createServer();
  const service = createRoomService({
    server: http,
    map: courtyard,
    catalog,
    capacity: 1,
    store: new ExampleStore(dir, () => true),
    authenticate: async (token) => identities[token] ?? null,
    canAccess: async () => true,
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const url = `ws://127.0.0.1:${(http.address() as { port: number }).port}/room`;
  try {
    const first = connect(url, "ari");
    await first.wait("room");
    const denied = connect(url, "sam");
    await new Promise<void>((r) =>
      denied.ws.once("close", (code) => {
        assert.equal(code, 4409);
        r();
      }),
    );
    const replaced = new Promise<void>((r) =>
      first.ws.once("close", (code) => {
        assert.equal(code, 4410);
        r();
      }),
    );
    const next = connect(url, "ari");
    const room = await next.wait("room");
    await replaced;
    assert.equal(room.roster.length, 1);
    next.ws.terminate();
  } finally {
    await service.close();
    await new Promise<void>((r) => http.close(() => r()));
    await rm(dir, { recursive: true, force: true });
  }
});
