import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { createRoomService } from "zmap/server";
import { ExampleStore } from "./store";
import { courtyard, catalog, identities } from "./content";
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
server.listen(8787, "0.0.0.0", () => {
  console.log("Zoomap DEVELOPMENT relay :8787 — mock identities only.");
  console.log("Examples: http://localhost:5173");
  for (const addresses of Object.values(networkInterfaces()))
    for (const a of addresses ?? [])
      if (a.family === "IPv4" && !a.internal)
        console.log(`LAN examples: http://${a.address}:5173`);
});
async function close() {
  await service.close();
  server.close();
}
process.on("SIGTERM", () => void close());
process.on("SIGINT", () => void close());
