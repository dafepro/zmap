import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { createRoomService } from "zmap/server";
import { ExampleStore } from "./store";
import { courtyard, catalog, identities } from "./content";
import { actionYard } from "./action-content";
const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(service.diagnostics()));
  } else {
    res.writeHead(404);
    res.end();
  }
});
const store = new ExampleStore(
  process.env.ZMAP_DATA_DIR ?? ".data/examples-v1",
  (identity, type) =>
    type === "planter" ||
    (type === "bench" && identity.id === "ari") ||
    (type === "lantern" && identity.id === "sam"),
);
const service = createRoomService({
  server,
  map: courtyard,
  catalog,
  store,
  authenticate: async (credential) =>
    Object.hasOwn(identities, credential) ? identities[credential] : null,
  canAccess: async (_identity, room) =>
    ["explore", "shared", "decorate"].includes(room),
});
const port = Number(process.env.ZMAP_RELAY_PORT ?? 8787);
const clientPort = Number(process.env.ZMAP_PORT ?? 5173);
const actionPort = Number(process.env.ZMAP_ACTION_PORT ?? 8789);
const actionServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(actionService.diagnostics()));
  } else {
    res.writeHead(404);
    res.end();
  }
});
const actionService = createRoomService({
  server: actionServer,
  map: actionYard,
  catalog: [],
  store: new ExampleStore(
    `${process.env.ZMAP_DATA_DIR ?? ".data/examples-v1"}/action-yard`,
    () => false,
  ),
  authenticate: async (credential) =>
    Object.hasOwn(identities, credential) ? identities[credential] : null,
  canAccess: async (_identity, room) => room === "action-yard",
});
actionServer.listen(actionPort, "0.0.0.0", () =>
  console.log(
    `Action Yard DEVELOPMENT relay :${actionPort} · http://localhost:${clientPort}/action.html`,
  ),
);
server.listen(port, "0.0.0.0", () => {
  console.log(`Zoomap DEVELOPMENT relay :${port} — mock identities only.`);
  console.log(`Examples: http://localhost:${clientPort}`);
  for (const addresses of Object.values(networkInterfaces()))
    for (const a of addresses ?? [])
      if (a.family === "IPv4" && !a.internal)
        console.log(`LAN examples: http://${a.address}:${clientPort}`);
});
async function close() {
  await service.close();
  await actionService.close();
  actionServer.close();
  server.close();
}
process.on("SIGTERM", () => void close());
process.on("SIGINT", () => void close());
