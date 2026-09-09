import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const root = process.cwd();
const dir = mkdtempSync(join(tmpdir(), "zmap-consumer-"));
const run = (bin, args, cwd = dir) =>
  execFileSync(bin, args, { cwd, stdio: "pipe" });
try {
  run("npm", ["pack", "--pack-destination", dir], root);
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "zmap-independent-consumer",
      private: true,
      type: "module",
    }),
  );
  run("npm", ["install", join(dir, "zmap-0.1.0.tgz"), "--ignore-scripts"]);
  const source =
    "import { Zoomap, findWalkPath, canWalkSegment, actionMovementLocked, WAKE_MOTION } from 'zmap'; import { createRoomService } from 'zmap/server'; import { validateMap } from 'zmap/core'; if ([Zoomap,createRoomService,validateMap,findWalkPath,canWalkSegment,actionMovementLocked,Zoomap.prototype.setWorldInput].some(f => typeof f !== 'function')) throw Error('Missing export'); if (WAKE_MOTION.jumpSpeed <= 0) throw Error('Missing motion contract');";
  writeFileSync(join(dir, "check.mjs"), source);
  run("node", ["check.mjs"]);
  writeFileSync(join(dir, "check.ts"), source);
  run(resolve("node_modules/.bin/tsc"), [
    "--noEmit",
    "--strict",
    "--module",
    "NodeNext",
    "--target",
    "ES2022",
    "--skipLibCheck",
    "check.ts",
  ]);
  writeFileSync(
    join(dir, "index.html"),
    '<div id="app"></div><script type="module" src="/main.js"></script>',
  );
  writeFileSync(
    join(dir, "main.js"),
    "import { Zoomap } from 'zmap'; document.querySelector('#app').textContent = typeof Zoomap;",
  );
  run(resolve("node_modules/.bin/vite"), ["build"]);
  console.log(
    "Packed independent consumer passed: ESM exports, TypeScript declarations, browser production build.",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
