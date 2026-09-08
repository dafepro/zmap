import { advanceToy } from "./toy-physics.js";
import {
  initialActionState,
  stepActions,
  validActionState,
  validateActionCatalog,
  type WorldActionCatalog,
  type WorldActionState,
  type ActionCommand,
} from "./world-actions.js";
/** Version 1 contracts: metres, Y-up, radians, fixed simulation seconds. */
export type Vec3 = { x: number; y: number; z: number };
export type Rect = { x: number; z: number; width: number; depth: number };
export type Surface = Rect & {
  id: string;
  y: number;
  slope?: number;
  thickness: number;
  color?: string;
  rollingResistance?: number;
};
export type Blocker = Rect & { y: number; height: number };
export type Toy = {
  id: string;
  home: Vec3;
  radius: number;
  color: string;
  sleep: "home";
  restitution?: number;
};
export type Trigger = {
  id: string;
  position: Vec3;
  radius: number;
  impulse: Vec3;
  cooldown: number;
};
export type WorldMap = {
  version: 1;
  id: string;
  bounds: Rect;
  spawn: Vec3;
  surfaces: Surface[];
  blockers: Blocker[];
  toys: Toy[];
  triggers: Trigger[];
  placementZones: Rect[];
  protectedZones: Rect[];
  actionCatalog?: WorldActionCatalog;
};
export type Identity = { id: string; name: string; appearance: string };
export type Input = {
  x: number;
  z: number;
  kick: boolean;
  wave: boolean;
  toolHeld?: boolean;
};
export type Body = Vec3 & {
  vx: number;
  vy: number;
  vz: number;
  facing: number;
  gesture: number;
};
export type Simulation = {
  tick: number;
  players: Record<string, Body>;
  toys: Record<string, Body>;
  triggers: Record<string, number>;
  actions?: WorldActionState;
};
export type ItemType = {
  id: string;
  radius: number;
  height: number;
  blocking: boolean;
};
export type Placement = {
  id: string;
  type: string;
  owner: string;
  position: Vec3;
  rotation: number;
  revision: number;
};
export type EditCommand = {
  id: string;
  operation: "place" | "move" | "remove";
  itemId: string;
  type: string;
  position: Vec3;
  rotation: number;
  expectedRevision: number;
};
export type DurableState = {
  version: 1;
  mapId: string;
  revision: number;
  items: Placement[];
  receipts: Record<string, { fingerprint: string; revision: number }>;
};
export type RoomLayout = Omit<DurableState, "receipts">;
export const STEP = 1 / 30;
export const idleInput = (): Input => ({
  x: 0,
  z: 0,
  kick: false,
  wave: false,
});
export const bodyAt = (p: Vec3): Body => ({
  ...p,
  vx: 0,
  vy: 0,
  vz: 0,
  facing: 0,
  gesture: 0,
});
export const inside = (r: Rect, x: number, z: number, margin = 0) =>
  x >= r.x + margin &&
  x <= r.x + r.width - margin &&
  z >= r.z + margin &&
  z <= r.z + r.depth - margin;
export const top = (s: Surface, z: number) => s.y + (s.slope ?? 0) * (z - s.z);
export const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 10000;
export const validVec = (v: any): v is Vec3 =>
  v && finite(v.x) && finite(v.y) && finite(v.z);
export const validId = (v: unknown): v is string =>
  typeof v === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(v);
export function validateCatalog(catalog: ItemType[]) {
  if (!Array.isArray(catalog) || catalog.length > 100)
    throw Error("Invalid catalog");
  const ids = new Set<string>();
  for (const t of catalog) {
    if (
      !validId(t.id) ||
      ids.has(t.id) ||
      !finite(t.radius) ||
      t.radius < 0.1 ||
      t.radius > 4 ||
      !finite(t.height) ||
      t.height <= 0 ||
      t.height > 5 ||
      typeof t.blocking !== "boolean"
    )
      throw Error("Invalid item type");
    ids.add(t.id);
  }
}
export function validateMap(map: WorldMap) {
  if (map.actionCatalog !== undefined) validateActionCatalog(map.actionCatalog);
  const rect = (r: Rect) =>
    r &&
    [r.x, r.z, r.width, r.depth].every(finite) &&
    r.width > 0 &&
    r.depth > 0;
  if (
    map.version !== 1 ||
    !validId(map.id) ||
    !rect(map.bounds) ||
    !validVec(map.spawn) ||
    !inside(map.bounds, map.spawn.x, map.spawn.z) ||
    !Array.isArray(map.surfaces) ||
    map.surfaces.length > 100 ||
    !map.surfaces.length ||
    !Array.isArray(map.blockers) ||
    map.blockers.length > 200 ||
    !Array.isArray(map.toys) ||
    map.toys.length > 5 ||
    !Array.isArray(map.triggers) ||
    map.triggers.length > 20 ||
    !map.placementZones.every(rect) ||
    !map.protectedZones.every(rect)
  )
    throw Error("Invalid map or unsupported version");
  const ids = new Set<string>();
  for (const s of map.surfaces) {
    if (
      !validId(s.id) ||
      ids.has(s.id) ||
      !rect(s) ||
      !finite(s.y) ||
      !finite(s.thickness) ||
      s.thickness < 0 ||
      !finite(s.slope ?? 0) ||
      Math.abs(s.slope ?? 0) > 1 ||
      !finite(s.rollingResistance ?? 0.65) ||
      (s.rollingResistance ?? 0.65) < 0 ||
      (s.rollingResistance ?? 0.65) > 10
    )
      throw Error("Invalid surface");
    ids.add(s.id);
  }
  for (const b of map.blockers)
    if (!rect(b) || !finite(b.y) || !finite(b.height) || b.height <= 0)
      throw Error("Invalid blocker");
  for (const t of map.toys) {
    if (
      !validId(t.id) ||
      ids.has(t.id) ||
      !validVec(t.home) ||
      !finite(t.radius) ||
      t.radius < 0.1 ||
      t.radius > 2 ||
      !inside(map.bounds, t.home.x, t.home.z, t.radius) ||
      !supportAt(map, t.home.x, t.home.z, t.home.y + 0.01) ||
      t.sleep !== "home" ||
      !finite(t.restitution ?? 0.65) ||
      (t.restitution ?? 0.65) < 0 ||
      (t.restitution ?? 0.65) > 1
    )
      throw Error("Invalid toy");
    ids.add(t.id);
  }
  for (const t of map.triggers) {
    if (
      !validId(t.id) ||
      ids.has(t.id) ||
      !validVec(t.position) ||
      !validVec(t.impulse) ||
      !finite(t.radius) ||
      t.radius <= 0 ||
      t.radius > 4 ||
      !finite(t.cooldown) ||
      t.cooldown < 0.2 ||
      t.cooldown > 60 ||
      Math.hypot(t.impulse.x, t.impulse.y, t.impulse.z) > 25
    )
      throw Error("Invalid trigger");
    ids.add(t.id);
  }
  const support = supportAt(map, map.spawn.x, map.spawn.z, map.spawn.y + 0.01);
  if (!support || Math.abs(top(support, map.spawn.z) - map.spawn.y) > 0.02)
    throw Error("Spawn has no support");
}
export function supportAt(map: WorldMap, x: number, z: number, maxY: number) {
  return map.surfaces
    .filter((s) => inside(s, x, z) && top(s, z) <= maxY)
    .sort((a, b) => top(b, z) - top(a, z))[0];
}
function blocked(
  map: WorldMap,
  items: Placement[],
  catalog: ItemType[],
  x: number,
  y: number,
  z: number,
  radius: number,
  height: number,
) {
  if (!inside(map.bounds, x, z, radius)) return true;
  if (
    map.blockers.some(
      (b) =>
        inside(b, x, z, -radius) &&
        y < b.y + b.height - 0.02 &&
        y + height > b.y + 0.02,
    )
  )
    return true;
  if (
    map.surfaces.some(
      (s) =>
        inside(s, x, z, -radius * 0.3) &&
        top(s, z) > y + 0.26 &&
        top(s, z) - s.thickness < y + height - 0.05,
    )
  )
    return true;
  return items.some((p) => {
    const t = catalog.find((t) => t.id === p.type);
    return (
      t?.blocking &&
      Math.hypot(p.position.x - x, p.position.z - z) < t.radius + radius &&
      y < p.position.y + t.height &&
      y + height > p.position.y
    );
  });
}
function moveBody(
  map: WorldMap,
  body: Body,
  radius: number,
  height: number,
  dt: number,
  items: Placement[],
  catalog: ItemType[],
) {
  const oldY = body.y;
  const nx = body.x + body.vx * dt;
  if (!blocked(map, items, catalog, nx, body.y, body.z, radius, height))
    body.x = nx;
  else body.vx *= -0.35;
  const nz = body.z + body.vz * dt;
  if (!blocked(map, items, catalog, body.x, body.y, nz, radius, height))
    body.z = nz;
  else body.vz *= -0.35;
  body.vy -= 18 * dt;
  body.y += body.vy * dt;
  if (body.vy > 0) {
    const ceiling = map.surfaces
      .filter(
        (s) =>
          inside(s, body.x, body.z) &&
          oldY + height <= top(s, body.z) - s.thickness + 0.01 &&
          body.y + height >= top(s, body.z) - s.thickness,
      )
      .sort(
        (a, b) => top(a, body.z) - a.thickness - (top(b, body.z) - b.thickness),
      )[0];
    if (ceiling) {
      body.y = top(ceiling, body.z) - ceiling.thickness - height;
      body.vy *= -0.2;
    }
  }
  const s = supportAt(map, body.x, body.z, oldY + 0.25);
  if (s && body.y <= top(s, body.z) && body.vy <= 0) {
    body.y = top(s, body.z);
    body.vy = 0;
  }
  if (body.y < -8 || !validVec(body)) Object.assign(body, bodyAt(map.spawn));
  body.gesture = Math.max(0, body.gesture - dt);
}
export function normalizeInput(input: Input): Input {
  const x = finite(input?.x) ? Math.max(-1, Math.min(1, input.x)) : 0;
  const z = finite(input?.z) ? Math.max(-1, Math.min(1, input.z)) : 0;
  const length = Math.max(1, Math.hypot(x, z));
  return {
    x: x / length,
    z: z / length,
    kick: input?.kick === true,
    wave: input?.wave === true,
    ...(typeof input?.toolHeld === "boolean"
      ? { toolHeld: input.toolHeld }
      : {}),
  };
}
export function movePlayer(
  map: WorldMap,
  body: Body,
  input: Input,
  dt: number,
  items: Placement[] = [],
  catalog: ItemType[] = [],
  impulse?: { x: number; z: number },
) {
  const i = normalizeInput(input);
  body.vx = i.x * 4 + (impulse?.x ?? 0);
  body.vz = i.z * 4 + (impulse?.z ?? 0);
  if (i.x || i.z) body.facing = Math.atan2(i.x, i.z);
  if (i.wave) body.gesture = 1.2;
  moveBody(map, body, 0.28, 1.5, Math.min(dt, 0.05), items, catalog);
}
export function initialSimulation(map: WorldMap): Simulation {
  return {
    tick: 0,
    players: {},
    toys: Object.fromEntries(map.toys.map((t) => [t.id, bodyAt(t.home)])),
    triggers: Object.fromEntries(map.triggers.map((t) => [t.id, 0])),
    ...(map.actionCatalog ? { actions: initialActionState() } : {}),
  };
}
export function stepWorld(
  map: WorldMap,
  state: Simulation,
  inputs: Record<string, Input>,
  items: Placement[] = [],
  catalog: ItemType[] = [],
  commands: readonly ActionCommand[] = [],
) {
  state.tick++;
  stepActions(map, state, inputs, commands, items, catalog);
  for (const [id, b] of Object.entries(state.players))
    movePlayer(
      map,
      b,
      inputs[id] ?? idleInput(),
      STEP,
      items,
      catalog,
      state.actions?.players[id]?.impulse,
    );
  for (const t of map.toys) {
    const b = state.toys[t.id];
    for (const [id, p] of Object.entries(state.players)) {
      const dx = b.x - p.x,
        dz = b.z - p.z,
        distance = Math.hypot(dx, dz);
      if (Math.abs(b.y - p.y) > 0.8 || distance > 1.65) continue;
      // Check blockers along the short reach segment as well as vertical distance.
      if (
        [0.2, 0.4, 0.6, 0.8].some((f) =>
          blocked(
            map,
            items,
            catalog,
            p.x + dx * f,
            p.y + 0.4,
            p.z + dz * f,
            0.01,
            0.2,
          ),
        )
      )
        continue;
      if (inputs[id]?.kick) {
        b.vx = (dx / Math.max(0.1, distance)) * 8;
        b.vz = (dz / Math.max(0.1, distance)) * 8;
        b.vy = 3;
      } else if (distance < t.radius + 0.28 && Math.hypot(p.vx, p.vz) > 0.1) {
        const nx = dx / Math.max(0.01, distance),
          nz = dz / Math.max(0.01, distance);
        const closing = (p.vx - b.vx) * nx + (p.vz - b.vz) * nz;
        if (closing > 0) {
          b.vx += nx * closing;
          b.vz += nz * closing;
        }
      }
    }
    for (const trigger of map.triggers) {
      if (
        state.triggers[trigger.id] <= 0 &&
        Math.hypot(b.x - trigger.position.x, b.z - trigger.position.z) <
          trigger.radius &&
        Math.abs(b.y - trigger.position.y) < 0.7
      ) {
        b.vx = trigger.impulse.x;
        b.vy = trigger.impulse.y;
        b.vz = trigger.impulse.z;
        state.triggers[trigger.id] = trigger.cooldown;
      }
    }
    advanceToy(map, b, t, STEP, items, catalog);
  }
  for (const key of Object.keys(state.triggers))
    state.triggers[key] = Math.max(0, state.triggers[key] - STEP);
}
export function placementError(
  map: WorldMap,
  catalog: ItemType[],
  items: Placement[],
  candidate: Placement,
): string | undefined {
  const type = catalog.find((t) => t.id === candidate.type);
  if (!type || !validVec(candidate.position) || !finite(candidate.rotation))
    return "Unknown item or invalid position";
  const p = candidate.position;
  if (!map.placementZones.some((z) => inside(z, p.x, p.z, type.radius)))
    return "Place inside a decorating garden";
  if (map.protectedZones.some((z) => inside(z, p.x, p.z, -type.radius)))
    return "Keep this route clear";
  const s = supportAt(map, p.x, p.z, p.y + 0.03);
  if (
    !s ||
    Math.abs(top(s, p.z) - p.y) > 0.03 ||
    (s.slope ?? 0) !== 0 ||
    !inside(s, p.x, p.z, type.radius)
  )
    return "Choose a flat supported surface";
  if (
    blocked(
      map,
      items.filter((i) => i.id !== candidate.id),
      catalog,
      p.x,
      p.y,
      p.z,
      type.radius,
      type.height,
    )
  )
    return "This space is occupied";
  if (
    items.some(
      (i) =>
        i.id !== candidate.id &&
        Math.abs(i.position.y - p.y) < type.height &&
        Math.hypot(i.position.x - p.x, i.position.z - p.z) <
          type.radius + (catalog.find((t) => t.id === i.type)?.radius ?? 0),
    )
  )
    return "Leave space between decorations";
  return undefined;
}
export function validSimulation(
  state: any,
  map: WorldMap,
  playerIds: string[],
): state is Simulation {
  const body = (b: any) =>
    b &&
    [b.x, b.y, b.z].every(finite) &&
    ["vx", "vy", "vz", "facing", "gesture"].every((k) => finite(b[k])) &&
    Math.abs(b.vx) <= 30 &&
    Math.abs(b.vy) <= 30 &&
    Math.abs(b.vz) <= 30 &&
    inside(map.bounds, b.x, b.z) &&
    b.y >= -8 &&
    b.y <= 30 &&
    b.gesture >= 0 &&
    b.gesture <= 2;
  return (
    state &&
    Number.isSafeInteger(state.tick) &&
    state.tick >= 0 &&
    state.players &&
    state.toys &&
    state.triggers &&
    Object.keys(state.players).length === playerIds.length &&
    playerIds.every((id) => body(state.players[id])) &&
    Object.keys(state.toys).length === map.toys.length &&
    map.toys.every((t) => body(state.toys[t.id])) &&
    Object.keys(state.triggers).length === map.triggers.length &&
    map.triggers.every(
      (t) =>
        finite(state.triggers[t.id]) &&
        state.triggers[t.id] >= 0 &&
        state.triggers[t.id] <= t.cooldown,
    ) &&
    validActionState(state.actions, map, playerIds, state.tick)
  );
}

export function validateDurableState(
  state: unknown,
  map: WorldMap,
  catalog?: ItemType[],
): asserts state is DurableState {
  const record = (v: any) =>
    v !== null && typeof v === "object" && !Array.isArray(v);
  const s = state as DurableState;
  if (
    !record(s) ||
    s.version !== 1 ||
    s.mapId !== map.id ||
    !Number.isSafeInteger(s.revision) ||
    s.revision < 0 ||
    !Array.isArray(s.items) ||
    s.items.length > 50 ||
    !record(s.receipts) ||
    Object.keys(s.receipts).length > 10000
  )
    throw Error("Saved room is invalid or incompatible");
  const ids = new Set<string>();
  for (const p of s.items) {
    if (
      !record(p) ||
      !validId(p.id) ||
      ids.has(p.id) ||
      !validId(p.type) ||
      !validId(p.owner) ||
      !validVec(p.position) ||
      !finite(p.rotation) ||
      !Number.isSafeInteger(p.revision) ||
      p.revision < 1 ||
      p.revision > s.revision ||
      !inside(map.bounds, p.position.x, p.position.z) ||
      Object.keys(p).some(
        (k) =>
          !["id", "type", "owner", "position", "rotation", "revision"].includes(
            k,
          ),
      )
    )
      throw Error("Saved placement is invalid");
    ids.add(p.id);
    if (catalog && placementError(map, catalog, s.items, p))
      throw Error("Saved placement does not match current content");
  }
  for (const [key, r] of Object.entries(s.receipts))
    if (
      !/^[a-zA-Z0-9_-]{1,80}:[a-zA-Z0-9_-]{1,80}$/.test(key) ||
      !record(r) ||
      typeof r.fingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(r.fingerprint) ||
      !Number.isSafeInteger(r.revision) ||
      r.revision < 1 ||
      r.revision > s.revision
    )
      throw Error("Saved receipt is invalid");
}
