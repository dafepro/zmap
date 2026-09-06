import { defineConfig } from "vite";
export default defineConfig({
  root: "examples/hub",
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/room": { target: "ws://127.0.0.1:8787", ws: true } },
  },
  build: { outDir: "../../dist", emptyOutDir: true },
});
