import { defineConfig } from "vite";
export default defineConfig({
  root: "examples/hub",
  // The linked standalone studio has its own dev install; both consumers must share Three.
  resolve: { dedupe: ["three"] },
  server: {
    port: Number(process.env.ZMAP_PORT ?? 5173),
    strictPort: true,
    proxy: {
      "/action-room": {
        target: `ws://127.0.0.1:${process.env.ZMAP_ACTION_PORT ?? 8789}`,
        ws: true,
        rewrite: (path) => path.replace(/^\/action-room/, "/room"),
      },
      "/room": {
        target: `ws://127.0.0.1:${process.env.ZMAP_RELAY_PORT ?? 8787}`,
        ws: true,
      },
    },
  },
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: "examples/hub/index.html",
        action: "examples/hub/action.html",
      },
    },
  },
});
