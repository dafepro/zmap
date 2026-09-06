import { defineConfig } from "vite";
export default defineConfig({
  root: "examples/hub",
  // The linked standalone studio has its own dev install; both consumers must share Three.
  resolve: { dedupe: ["three"] },
  server: {
    port: Number(process.env.ZMAP_PORT ?? 5173),
    strictPort: true,
    proxy: {
      "/room": {
        target: `ws://127.0.0.1:${process.env.ZMAP_RELAY_PORT ?? 8787}`,
        ws: true,
      },
    },
  },
  build: { outDir: "../../dist", emptyOutDir: true },
});
