import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
/** Ordered application-message shaping. NOT packet-level loss or a physical WAN emulator. */
export async function networkProxy(upstream: string) {
  const http = createServer();
  const wss = new WebSocketServer({ server: http });
  const links = new Set<{
    client: WebSocket;
    server: WebSocket;
    identity: string;
  }>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let random = 17;
  let snapshotCount = 0;
  let dropped = 0;
  let dropSaved = false;
  const rng = () => {
    random = (random * 1664525 + 1013904223) >>> 0;
    return random / 4294967296;
  };
  wss.on("connection", (client) => {
    const server = new WebSocket(upstream);
    const link = { client, server, identity: "" };
    links.add(link);
    const queued: Buffer[] = [];
    const forward = (to: WebSocket) => {
      let due = 0;
      return (raw: Buffer) => {
        let message: any;
        try {
          message = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (message.type === "join") link.identity = message.credential;
        if (message.type === "snapshot" && ++snapshotCount % 50 === 0) {
          dropped++;
          return;
        }
        if (message.type === "saved" && dropSaved) {
          dropSaved = false;
          dropped++;
          client.terminate();
          server.terminate();
          return;
        }
        // 75 ms each way, ±15 ms jitter. Preserve TCP message order within a direction.
        due = Math.max(Date.now() + 75 + (rng() - 0.5) * 30, due + 1);
        const timer = setTimeout(
          () => {
            timers.delete(timer);
            if (to.readyState === WebSocket.OPEN) to.send(raw.toString());
          },
          Math.max(0, due - Date.now()),
        );
        timers.add(timer);
      };
    };
    const outbound = forward(server),
      inbound = forward(client);
    client.on("message", (raw) => {
      const bytes = Buffer.from(raw.toString());
      if (server.readyState === WebSocket.OPEN) outbound(bytes);
      else queued.push(bytes);
    });
    server.on("open", () => {
      for (const bytes of queued) outbound(bytes);
      queued.length = 0;
    });
    server.on("message", (raw) => inbound(Buffer.from(raw.toString())));
    client.on("error", () => {});
    server.on("error", () => {
      client.terminate();
    });
    client.on("close", () => {
      server.terminate();
      links.delete(link);
    });
    server.on("close", (code) => {
      if (client.readyState === WebSocket.OPEN)
        client.close(code === 1006 ? 1013 : code);
      links.delete(link);
    });
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  return {
    url: `ws://127.0.0.1:${(http.address() as { port: number }).port}`,
    dropNextSaved() {
      dropSaved = true;
    },
    disconnect(identity: string) {
      for (const l of links)
        if (l.identity === identity) {
          l.client.terminate();
          l.server.terminate();
        }
    },
    stats: () => ({ dropped, snapshotCount }),
    async close() {
      for (const timer of timers) clearTimeout(timer);
      for (const l of links) {
        l.client.terminate();
        l.server.terminate();
      }
      await new Promise<void>((r) => wss.close(() => r()));
      await new Promise<void>((r) => http.close(() => r()));
    },
  };
}
