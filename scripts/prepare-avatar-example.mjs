import { cp, mkdir } from "node:fs/promises";
const source = new URL(
  "./",
  import.meta.resolve("@zmap/avatar-studio/assets/catalog.json"),
);
const destination = new URL("../examples/hub/public/avatars/", import.meta.url);
await mkdir(destination, { recursive: true });
await cp(new URL("catalog.json", source), new URL("catalog.json", destination));
await cp(new URL("models/", source), new URL("models/", destination), {
  recursive: true,
});
await cp(new URL("action/", source), new URL("action/", destination), {
  recursive: true,
});
