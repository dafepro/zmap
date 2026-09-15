import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
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
  run("npm", [
    "install",
    join(
      dir,
      `zmap-${JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version}.tgz`,
    ),
    "--ignore-scripts",
  ]);
  const source = `
import { Zoomap, findWalkPath, canWalkSegment, actionMovementLocked, WAKE_MOTION,
  cannonBehavior, cannonObject, objectPoint, spherePathClear, CANNON_LOADING_TICKS } from 'zmap';
import { createRoomService } from 'zmap/server';
import { validateMap, initialSimulation, stepWorld } from 'zmap/core';
if ([Zoomap, createRoomService, validateMap, findWalkPath, canWalkSegment,
  actionMovementLocked, Zoomap.prototype.setWorldInput, cannonObject,
  objectPoint, spherePathClear, cannonBehavior.validEvent].some(f => typeof f !== 'function'))
  throw Error('Missing export');
if (WAKE_MOTION.jumpSpeed <= 0 || CANNON_LOADING_TICKS !== 12) throw Error('Missing motion contract');
const map = JSON.parse('${JSON.stringify({
    version: 1,
    id: "consumer-cannon",
    bounds: { x: -10, z: -10, width: 20, depth: 20 },
    spawn: { x: -4, y: 0, z: -4 },
    surfaces: [
      {
        id: "ground",
        x: -10,
        z: -10,
        width: 20,
        depth: 20,
        y: 0,
        thickness: 0.3,
      },
    ],
    blockers: [],
    toys: [
      {
        id: "ball",
        home: { x: 0, y: 0, z: -1.7 },
        radius: 0.35,
        color: "white",
        sleep: "home",
      },
    ],
    triggers: [],
    placementZones: [],
    protectedZones: [],
  })}');
map.objects = [cannonObject('consumer-cannon', { x: 0, y: 0, z: 0 }, 0, ['ball'])];
validateMap(map, [cannonBehavior]);
const state = initialSimulation(map, [cannonBehavior]);
for (let i = 0; i < 26; i++) stepWorld(map, state, {}, [], [], [], [cannonBehavior]);
if (state.objects?.events.filter(event => event.kind === 'fire').length !== 1)
  throw Error('Independent consumer did not load and fire its existing ball');
`;
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
