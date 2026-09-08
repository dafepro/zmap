import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import {
  syncActionPlayers,
  validateActionIntent,
  type ActionCommand,
  type PlayerActionState,
} from "./world-actions.js";
import {
  bodyAt,
  initialSimulation,
  normalizeInput,
  validId,
  validSimulation,
  validateMap,
  validateCatalog,
  validateDurableState,
  type WorldMap,
  type ItemType,
  type Identity,
  type EditCommand,
  type DurableState,
  type Simulation,
} from "./core.js";

export interface DurableStore {
  load(room: string, map: WorldMap): Promise<DurableState>;
  /** Atomically validate current app policy, CAS revision, persist receipt and layout BEFORE resolving. */
  commit(
    room: string,
    identity: Identity,
    command: EditCommand,
    map: WorldMap,
    catalog: ItemType[],
  ): Promise<DurableState>;
}
export type ServiceOptions = {
  server: Server;
  map: WorldMap;
  catalog: ItemType[];
  store: DurableStore;
  authenticate: (credential: string, room: string) => Promise<Identity | null>;
  canAccess: (identity: Identity, room: string) => Promise<boolean>;
  leaseMs?: number;
  capacity?: number;
  allowedOrigins?: string[];
  adapterTimeoutMs?: number;
};
type Peer = {
  id: string;
  identity: Identity;
  ws: WebSocket;
  seen: number;
  eligible: boolean;
  actionSequence: number;
  actionWindowAt: number;
  actionCount: number;
};
type Room = {
  id: string;
  peers: Map<string, Peer>;
  host: string | null;
  epoch: number;
  lastSnapshot: number;
  state: Simulation;
  durable: DurableState;
  actionSequence: number;
  pendingActions: ActionCommand[];
  actionCooldowns: Map<string, PlayerActionState["cooldowns"]>;
};
export function createRoomService(options: ServiceOptions) {
  validateMap(options.map);
  validateCatalog(options.catalog);
  const wss = new WebSocketServer({
    server: options.server,
    path: "/room",
    maxPayload: 65536,
  });
  const rooms = new Map<string, Room>();
  const loadingRooms = new Set<string>();
  const metrics = {
    inboundBytes: 0,
    outboundBytes: 0,
    snapshots: 0,
    elections: 0,
    rejected: 0,
    commits: 0,
  };
  let closing = false;
  const lanes = new Map<string, { tail: Promise<void>; pending: number }>();
  const timeoutMs = options.adapterTimeoutMs ?? 2000;
  async function readAdapter<T>(work: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(Error("App service timed out")),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  const queue = (
    key: string,
    fn: () => Promise<void> | void,
    critical = false,
  ) => {
    let lane = lanes.get(key);
    if (!lane) {
      lane = { tail: Promise.resolve(), pending: 0 };
      lanes.set(key, lane);
    }
    if (lane.pending >= 64 && !critical) return false;
    lane.pending++;
    const current = lane;
    lane.tail = lane.tail
      .then(fn)
      .catch(() => {
        metrics.rejected++;
      })
      .finally(() => {
        current.pending--;
        if (!current.pending) lanes.delete(key);
      });
    return true;
  };
  const load = async (id: string) => {
    const state = await readAdapter(options.store.load(id, options.map));
    validateDurableState(state, options.map, options.catalog);
    return state;
  };
  const send = (ws: WebSocket, message: unknown) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 262144) {
      ws.close(1013, "Slow connection");
      return;
    }
    const raw = JSON.stringify(message);
    metrics.outboundBytes += Buffer.byteLength(raw);
    ws.send(raw);
  };
  const broadcast = (room: Room, message: unknown) => {
    for (const p of room.peers.values()) send(p.ws, message);
  };
  const layout = (state: DurableState) => ({
    version: state.version,
    mapId: state.mapId,
    revision: state.revision,
    items: state.items,
  });
  const metadata = (room: Room) => ({
    type: "room",
    version: 1,
    host: room.host,
    epoch: room.epoch,
    roster: [...room.peers.values()].map((p) => ({
      session: p.id,
      identity: p.identity,
    })),
    state: room.state,
    durable: layout(room.durable),
    ...(options.map.actionCatalog
      ? { actionCommands: room.pendingActions }
      : {}),
  });
  const elect = (room: Room) => {
    room.host =
      [...room.peers.values()].find(
        (p) => p.eligible && Date.now() - p.seen < (options.leaseMs ?? 2400),
      )?.id ?? null;
    room.epoch++;
    room.lastSnapshot = Date.now();
    metrics.elections++;
  };
  const depart = (room: Room, peer: Peer) => {
    if (!room.peers.delete(peer.id)) return;
    const actions = room.state.actions?.players[peer.id];
    if (actions) {
      room.actionCooldowns.set(peer.identity.id, { ...actions.cooldowns });
      for (const [id, cooldowns] of room.actionCooldowns)
        if (Math.max(...Object.values(cooldowns)) <= room.state.tick)
          room.actionCooldowns.delete(id);
      while (room.actionCooldowns.size > 100)
        room.actionCooldowns.delete(room.actionCooldowns.keys().next().value!);
    }
    delete room.state.players[peer.id];
    syncActionPlayers(room.state);
    room.pendingActions = room.pendingActions.filter(
      (command) => command.session !== peer.id,
    );
    if (room.host === peer.id) elect(room);
    if (!room.peers.size) {
      room.state = initialSimulation(options.map);
      rooms.delete(room.id);
    } else broadcast(room, metadata(room));
  };
  wss.on("connection", (ws, request) => {
    if (
      options.allowedOrigins &&
      !options.allowedOrigins.includes(request.headers.origin ?? "")
    ) {
      ws.close(4403, "Origin denied");
      return;
    }
    let room: Room | undefined, peer: Peer | undefined;
    let queueKey = `connection:${randomUUID()}`,
      requestedRoom: string | undefined;
    let count = 0,
      windowAt = Date.now();
    const joinTimeout = setTimeout(() => {
      if (!peer) ws.close(4408, "Join timeout");
    }, 5000);
    ws.on("error", () => {});
    ws.on("message", (raw) => {
      metrics.inboundBytes += Buffer.byteLength(raw.toString());
      if (Date.now() - windowAt > 1000) {
        count = 0;
        windowAt = Date.now();
      }
      if (++count > 100) {
        ws.close(4429, "Rate limit");
        return;
      }
      let message: any;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        ws.close(4400, "Invalid JSON");
        return;
      }
      if (!peer && message?.type === "join" && validId(message.room)) {
        if (requestedRoom && requestedRoom !== message.room) {
          ws.close(4400, "Conflicting join");
          return;
        }
        requestedRoom = message.room;
        queueKey = `room:${message.room}`;
      }
      const queued = queue(queueKey, async () => {
        if (ws.readyState !== WebSocket.OPEN || closing) return;
        try {
          if (!peer) {
            if (
              message?.type !== "join" ||
              message.version !== 1 ||
              !validId(message.room) ||
              typeof message.credential !== "string" ||
              message.credential.length > 2048
            )
              throw Error("Invalid join");
            if (
              options.map.actionCatalog &&
              (!Array.isArray(message.capabilities) ||
                !message.capabilities.includes("actions-v1"))
            ) {
              ws.close(4400, "This map requires actions-v1");
              return;
            }
            const identity = await readAdapter(
              options.authenticate(message.credential, message.room),
            );
            if (
              !identity ||
              !validId(identity.id) ||
              !(await readAdapter(options.canAccess(identity, message.room)))
            ) {
              ws.close(4403, "Access denied");
              return;
            }
            room = rooms.get(message.room);
            if (!room) {
              if (rooms.size + loadingRooms.size >= 100) {
                ws.close(4429, "Service full");
                return;
              }
              loadingRooms.add(message.room);
              let durable: DurableState;
              try {
                durable = await load(message.room);
              } finally {
                loadingRooms.delete(message.room);
              }
              if (closing || ws.readyState !== WebSocket.OPEN) return;
              room = {
                id: message.room,
                peers: new Map(),
                host: null,
                epoch: 0,
                lastSnapshot: Date.now(),
                state: initialSimulation(options.map),
                durable,
                actionSequence: 0,
                pendingActions: [],
                actionCooldowns: new Map(),
              };
              rooms.set(room.id, room);
            }
            if (ws.readyState !== WebSocket.OPEN) {
              if (!room.peers.size) rooms.delete(room.id);
              return;
            }
            const replacing = [...room.peers.values()].some(
              (p) => p.identity.id === identity.id,
            );
            if (room.peers.size >= (options.capacity ?? 20) && !replacing) {
              ws.close(4409, "Room full");
              return;
            }
            // One active connection per app identity and room; another tab explicitly replaces it.
            for (const old of room.peers.values())
              if (old.identity.id === identity.id) {
                old.ws.close(4410, "Joined in another tab");
                depart(room, old);
              }
            rooms.set(room.id, room);
            peer = {
              id: randomUUID(),
              identity: {
                id: identity.id,
                name: identity.name.slice(0, 30),
                appearance: identity.appearance.slice(0, 80),
              },
              ws,
              seen: Date.now(),
              eligible: true,
              actionSequence: 0,
              actionWindowAt: Date.now(),
              actionCount: 0,
            };
            room.peers.set(peer.id, peer);
            room.state.players[peer.id] = bodyAt(options.map.spawn);
            syncActionPlayers(room.state);
            const cooldowns = room.actionCooldowns.get(peer.identity.id);
            if (cooldowns && room.state.actions)
              room.state.actions.players[peer.id].cooldowns = { ...cooldowns };
            if (!room.host) elect(room);
            clearTimeout(joinTimeout);
            send(ws, { type: "welcome", session: peer.id });
            broadcast(room, metadata(room));
            return;
          }
          if (!room || !room.peers.has(peer.id)) return;
          if (!(await readAdapter(options.canAccess(peer.identity, room.id)))) {
            ws.close(4403, "Access expired");
            depart(room, peer);
            return;
          }
          if (!message || typeof message.type !== "string")
            throw Error("Invalid message");
          peer.seen = Date.now();
          if (message.type === "heartbeat") {
            peer.eligible = message.eligible === true;
            if ((!peer.eligible && room.host === peer.id) || !room.host) {
              elect(room);
              broadcast(room, metadata(room));
            }
          } else if (message.type === "input") {
            const host = room.host ? room.peers.get(room.host) : undefined;
            if (host)
              send(host.ws, {
                type: "input",
                session: peer.id,
                input: normalizeInput(message.input),
              });
          } else if (message.type === "action") {
            if (!options.map.actionCatalog || message.epoch !== room.epoch)
              throw Error("Unavailable action catalog or stale action epoch");
            validateActionIntent(message.intent, options.map.actionCatalog);
            if (message.intent.sequence <= peer.actionSequence) return;
            if (Date.now() - peer.actionWindowAt >= 1000) {
              peer.actionWindowAt = Date.now();
              peer.actionCount = 0;
            }
            if (++peer.actionCount > 24 || room.pendingActions.length >= 64)
              throw Error("Action queue or rate limit exceeded");
            if (room.actionSequence >= Number.MAX_SAFE_INTEGER)
              throw Error("Action sequence exhausted");
            peer.actionSequence = message.intent.sequence;
            const command: ActionCommand = {
              sequence: ++room.actionSequence,
              session: peer.id,
              intent: structuredClone(message.intent),
            };
            room.pendingActions.push(command);
            const host = room.host ? room.peers.get(room.host) : undefined;
            if (host)
              send(host.ws, { type: "action", epoch: room.epoch, command });
          } else if (message.type === "snapshot") {
            if (
              room.host !== peer.id ||
              message.epoch !== room.epoch ||
              !validSimulation(message.state, options.map, [
                ...room.peers.keys(),
              ]) ||
              message.state.tick <= room.state.tick ||
              (options.map.actionCatalog &&
                (message.state.actions.appliedSequence <
                  room.state.actions!.appliedSequence ||
                  message.state.actions.appliedSequence > room.actionSequence))
            )
              throw Error("Stale authority or invalid snapshot");
            // Copy only protocol fields; arbitrary nested host payload never reaches peers.
            const copyBody = (b: any) => ({
              x: b.x,
              y: b.y,
              z: b.z,
              vx: b.vx,
              vy: b.vy,
              vz: b.vz,
              facing: b.facing,
              gesture: b.gesture,
            });
            room.state = {
              tick: message.state.tick,
              players: Object.fromEntries(
                [...room.peers.keys()].map((id) => [
                  id,
                  copyBody(message.state.players[id]),
                ]),
              ),
              toys: Object.fromEntries(
                options.map.toys.map((t) => [
                  t.id,
                  copyBody(message.state.toys[t.id]),
                ]),
              ),
              triggers: Object.fromEntries(
                options.map.triggers.map((t) => [
                  t.id,
                  message.state.triggers[t.id],
                ]),
              ),
              ...(options.map.actionCatalog
                ? { actions: structuredClone(message.state.actions) }
                : {}),
            };
            if (room.state.actions) {
              const applied = room.state.actions.appliedSequence;
              room.pendingActions = room.pendingActions.filter(
                (command) => command.sequence > applied,
              );
            }
            room.lastSnapshot = Date.now();
            metrics.snapshots++;
            broadcast(room, {
              type: "snapshot",
              epoch: room.epoch,
              state: room.state,
            });
          } else if (message.type === "edit") {
            const next = await options.store.commit(
              room.id,
              peer.identity,
              message.command,
              options.map,
              options.catalog,
            );
            validateDurableState(next, options.map, options.catalog);
            room.durable = next;
            metrics.commits++;
            broadcast(room, { type: "durable", durable: layout(next) });
            send(ws, {
              type: "saved",
              id: message.command.id,
              revision: next.revision,
            });
          } else throw Error("Unsupported message");
        } catch (error) {
          metrics.rejected++;
          send(ws, {
            type: "rejected",
            ...(message?.type === "action"
              ? { actionSequence: message.intent?.sequence }
              : {}),
            id:
              typeof message?.command?.id === "string"
                ? message.command.id.slice(0, 80)
                : undefined,
            reason:
              error instanceof Error
                ? error.message.slice(0, 160)
                : "Request failed",
          });
        }
      });
      if (!queued) ws.close(4429, "Room queue full");
    });
    ws.on("close", () => {
      clearTimeout(joinTimeout);
      queue(
        queueKey,
        () => {
          if (room && peer) depart(room, peer);
        },
        true,
      );
    });
  });
  const timer = setInterval(() => {
    if (closing) return;
    for (const room of rooms.values())
      queue(`room:${room.id}`, async () => {
        for (const peer of room.peers.values()) {
          try {
            if (
              Date.now() - peer.seen > 8000 ||
              !(await readAdapter(options.canAccess(peer.identity, room.id)))
            ) {
              peer.ws.close(4403, "Session expired");
              depart(room, peer);
            }
          } catch {
            peer.ws.close(1013, "App service unavailable");
            depart(room, peer);
          }
        }
        if (
          room.host &&
          Date.now() - room.lastSnapshot > (options.leaseMs ?? 2400)
        ) {
          const old = room.peers.get(room.host);
          if (old) old.eligible = false;
          elect(room);
          broadcast(room, metadata(room));
        }
      });
  }, 250);
  return {
    metrics,
    diagnostics: () => ({
      rooms: rooms.size,
      peers: [...rooms.values()].reduce((n, r) => n + r.peers.size, 0),
      ...metrics,
    }),
    async close() {
      closing = true;
      clearInterval(timer);
      for (const ws of wss.clients) ws.terminate();
      // Durable writes cannot be safely cancelled; shutdown bounds waiting, never acknowledges an unknown outcome.
      try {
        await readAdapter(
          Promise.allSettled([...lanes.values()].map((l) => l.tail)),
        );
      } catch {}
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}
