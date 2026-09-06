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

test("slow app authentication does not block another room and times out", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zmap-isolation-"));
  const http = createServer();
  const service = createRoomService({
    server: http,
    map: courtyard,
    catalog,
    adapterTimeoutMs: 100,
    store: new ExampleStore(dir, () => true),
    authenticate: async (token) =>
      token === "stalled" ? new Promise(() => {}) : (identities[token] ?? null),
    canAccess: async () => true,
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const url = `ws://127.0.0.1:${(http.address() as { port: number }).port}/room`;
  try {
    const slow = connect(url, "stalled", "slow");
    const good = connect(url, "ari", "healthy");
    await good.wait("welcome");
    await slow.wait("rejected", (m) => m.reason.includes("timed out"));
    assert.equal(service.diagnostics().peers, 1);
    good.ws.terminate();
    slow.ws.terminate();
  } finally {
    await service.close();
    await new Promise<void>((r) => http.close(() => r()));
    await rm(dir, { recursive: true, force: true });
  }
});
test("a pending durable commit cannot stall another room or produce a premature saved receipt", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zmap-pending-"));
  const http = createServer();
  const store = new ExampleStore(dir, () => true);
  let resolveCommit: (() => void) | undefined;
  const service = createRoomService({
    server: http,
    map: courtyard,
    catalog,
    adapterTimeoutMs: 100,
    store: {
      load: (...args) => store.load(...args),
      commit: async (...args) => {
        await new Promise<void>((r) => {
          resolveCommit = r;
        });
        return store.commit(...args);
      },
    },
    authenticate: async (token) => identities[token] ?? null,
    canAccess: async () => true,
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const url = `ws://127.0.0.1:${(http.address() as { port: number }).port}/room`;
  try {
    const slow = connect(url, "ari", "slow");
    await slow.wait("welcome");
    slow.send({
      type: "edit",
      command: {
        id: "pending",
        operation: "place",
        itemId: "pot",
        type: "planter",
        position: { x: 10, y: 0, z: 4 },
        rotation: 0,
        expectedRevision: 0,
      },
    });
    const good = connect(url, "sam", "healthy");
    await good.wait("welcome");
    assert.equal(
      slow.messages.some((m) => m.type === "saved"),
      false,
    );
    assert.ok(resolveCommit);
    resolveCommit();
    await slow.wait("saved");
    slow.ws.terminate();
    good.ws.terminate();
  } finally {
    resolveCommit?.();
    await service.close();
    await new Promise<void>((r) => http.close(() => r()));
    await rm(dir, { recursive: true, force: true });
  }
});
test("concurrent room loads reserve capacity before awaiting the store", async () => {
  const http = createServer();
  let release!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  let loading = 0;
  const service = createRoomService({
    server: http,
    map: courtyard,
    catalog,
    store: {
      load: async () => {
        loading++;
        await held;
        return {
          version: 1,
          mapId: courtyard.id,
          revision: 0,
          items: [],
          receipts: {},
        };
      },
      commit: async () => {
        throw Error("Unused");
      },
    },
    authenticate: async () => identities.ari,
    canAccess: async () => true,
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const url = `ws://127.0.0.1:${(http.address() as { port: number }).port}/room`;
  const clients = Array.from({ length: 100 }, (_, i) =>
    connect(url, "ari", `room-${i}`),
  );
  try {
    for (let i = 0; i < 100 && loading < 100; i++) await sleep(10);
    assert.equal(loading, 100);
    const extra = connect(url, "ari", "room-extra");
    await new Promise<void>((r) =>
      extra.ws.once("close", (code) => {
        assert.equal(code, 4429);
        r();
      }),
    );
    release();
    await Promise.all(clients.map((c) => c.wait("welcome")));
    assert.equal(service.diagnostics().rooms, 100);
  } finally {
    release();
    for (const c of clients) c.ws.terminate();
    await service.close();
    await new Promise<void>((r) => http.close(() => r()));
  }
});
