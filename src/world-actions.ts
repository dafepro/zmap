import {
  supportAt,
  top,
  type Body,
  type Input,
  type ItemType,
  type Placement,
  type Simulation,
  type Vec3,
  type WorldMap,
} from "./core.js";

/** Presentation assets use `wield-${id}`; physics never reads meshes or rig anchors. */
export const TOOL_IDS = [
  "tether-winch",
  "rebound-panel",
  "wake-driver",
] as const;
export type ToolId = (typeof TOOL_IDS)[number];
export type WorldActionCatalog = {
  version: 1;
  tools: {
    id: ToolId;
    range: number;
    strength: number;
    cooldownTicks: number;
  }[];
};
export type ActionIntent = { sequence: number } & (
  | { kind: "equip"; tool: ToolId | null }
  | { kind: "use"; pressed: boolean }
  | { kind: "cancel" }
  | { kind: "aim"; x: number; z: number }
);
export type ActionCommand = {
  sequence: number;
  session: string;
  intent: ActionIntent;
};
export type ToolPhase =
  | "idle"
  | "reeling"
  | "braced"
  | "charging"
  | "leaping"
  | "impact"
  | "recoiling"
  | "cooldown";
export const WAKE_MOTION = {
  chargeTicks: 6,
  jumpSpeed: 4.8,
  leapTimeoutTicks: 45,
  impactTicks: 3,
  recoilSpeed: 2.7,
  recoilTimeoutTicks: 30,
} as const;
export function actionMovementLocked(action: PlayerActionState | undefined) {
  return (
    !!action &&
    ["charging", "leaping", "impact", "recoiling"].includes(action.phase)
  );
}
function grounded(map: WorldMap, body: Body) {
  const surface = supportAt(map, body.x, body.z, body.y + 0.01);
  return (
    !!surface &&
    Math.abs(body.y - top(surface, body.z)) < 0.001 &&
    Math.abs(body.vy) < 0.001
  );
}
function transition(
  p: PlayerActionState,
  phase: ToolPhase,
  currentTick: number,
  duration = 0,
) {
  p.phase = phase;
  p.phaseStarted = currentTick;
  p.phaseUntil = currentTick + duration;
}
export type PlayerActionState = {
  tool: ToolId | null;
  phase: ToolPhase;
  held: boolean;
  aim: { x: number; z: number };
  aimManual: boolean;
  cooldownUntil: number;
  cooldowns: Record<ToolId, number>;
  phaseStarted: number;
  phaseUntil: number;
  lastHeldTick: number;
  target: string | null;
  sequence: number;
  impulse: { x: number; z: number };
  immuneUntil: number;
};
export type WorldActionEvent = {
  id: number;
  tick: number;
  session: string;
  tool: ToolId;
  kind: "reel" | "pitch" | "release" | "rebound" | "boost" | "charge" | "pulse";
  position: Vec3;
  target?: string;
};
export type WorldActionState = {
  version: 1;
  appliedSequence: number;
  eventSequence: number;
  players: Record<string, PlayerActionState>;
  events: WorldActionEvent[];
};
const DT = 1 / 30;
// Code-point ordering stays identical across host browsers with different locales.
const compareIds = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;
const record = (v: any) =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const number = (v: any, max = 10000) =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= max;
const tick = (v: any) => Number.isSafeInteger(v) && v >= 0;
const id = (v: any) =>
  typeof v === "string" &&
  /^[a-zA-Z0-9_-]{1,80}$/.test(v) &&
  !["__proto__", "constructor", "prototype"].includes(v);
const exact = (v: any, keys: string[]) =>
  record(v) &&
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
export function playfulActionCatalog(): WorldActionCatalog {
  return {
    version: 1,
    tools: [
      { id: "tether-winch", range: 5.5, strength: 10, cooldownTicks: 18 },
      { id: "rebound-panel", range: 1.8, strength: 7, cooldownTicks: 18 },
      { id: "wake-driver", range: 3, strength: 5, cooldownTicks: 60 },
    ],
  };
}
export function validateActionCatalog(
  value: unknown,
): asserts value is WorldActionCatalog {
  const c = value as WorldActionCatalog;
  if (
    !exact(c, ["version", "tools"]) ||
    c.version !== 1 ||
    !Array.isArray(c.tools) ||
    !c.tools.length ||
    c.tools.length > 3
  )
    throw Error("Invalid action catalog");
  const seen = new Set<string>();
  for (const tool of c.tools) {
    if (
      !exact(tool, ["id", "range", "strength", "cooldownTicks"]) ||
      !TOOL_IDS.includes(tool.id) ||
      seen.has(tool.id) ||
      !number(tool.range, 8) ||
      tool.range < 0.5 ||
      !number(tool.strength, 12) ||
      tool.strength < 1 ||
      !tick(tool.cooldownTicks) ||
      tool.cooldownTicks < 12 ||
      tool.cooldownTicks > 300
    )
      throw Error("Invalid action preset");
    seen.add(tool.id);
  }
}
export function validateActionIntent(
  value: unknown,
  catalog: WorldActionCatalog,
): asserts value is ActionIntent {
  const v = value as ActionIntent;
  if (!record(v) || !tick(v.sequence) || v.sequence === 0)
    throw Error("Invalid action sequence");
  if (
    v.kind === "equip" &&
    exact(v, ["sequence", "kind", "tool"]) &&
    (v.tool === null || catalog.tools.some((t) => t.id === v.tool))
  )
    return;
  if (v.kind === "cancel" && exact(v, ["sequence", "kind"])) return;
  if (
    v.kind === "use" &&
    exact(v, ["sequence", "kind", "pressed"]) &&
    typeof v.pressed === "boolean"
  )
    return;
  if (
    v.kind === "aim" &&
    exact(v, ["sequence", "kind", "x", "z"]) &&
    number(v.x, 1) &&
    number(v.z, 1) &&
    Math.abs(Math.hypot(v.x, v.z) - 1) < 0.001
  )
    return;
  throw Error("Invalid action intent");
}
export function initialActionState(): WorldActionState {
  return {
    version: 1,
    appliedSequence: 0,
    eventSequence: 0,
    players: {},
    events: [],
  };
}
function playerState(body: Body): PlayerActionState {
  return {
    tool: null,
    phase: "idle",
    held: false,
    aim: { x: Math.sin(body.facing), z: Math.cos(body.facing) },
    aimManual: false,
    cooldownUntil: 0,
    cooldowns: { "tether-winch": 0, "rebound-panel": 0, "wake-driver": 0 },
    phaseStarted: 0,
    phaseUntil: 0,
    lastHeldTick: 0,
    target: null,
    sequence: 0,
    impulse: { x: 0, z: 0 },
    immuneUntil: 0,
  };
}
export function syncActionPlayers(state: Simulation) {
  if (!state.actions) return;
  for (const session of Object.keys(state.actions.players))
    if (!Object.hasOwn(state.players, session))
      delete state.actions.players[session];
  for (const session of Object.keys(state.players).sort())
    state.actions.players[session] ??= playerState(state.players[session]);
  state.actions.events = state.actions.events.filter((event) =>
    Object.hasOwn(state.players, event.session),
  );
}
/** Analytic segment/solid test, including sloping slabs and placed cylinders. */
export function actionLineClear(
  map: WorldMap,
  from: Vec3,
  to: Vec3,
  items: Placement[] = [],
  catalog: ItemType[] = [],
): boolean {
  const slab = (ranges: [number, number, number, number][]) => {
    let enter = 0,
      exit = 1;
    for (const [origin, delta, min, max] of ranges) {
      if (Math.abs(delta) < 1e-10) {
        if (origin <= min + 1e-6 || origin >= max - 1e-6) return false;
      } else {
        const a = (min - origin) / delta,
          b = (max - origin) / delta;
        enter = Math.max(enter, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
      }
      if (enter >= exit - 1e-7) return false;
    }
    return exit > 1e-4 && enter < 1 - 1e-4;
  };
  const dx = to.x - from.x,
    dy = to.y - from.y,
    dz = to.z - from.z;
  for (const b of map.blockers)
    if (
      slab([
        [from.x, dx, b.x, b.x + b.width],
        [from.z, dz, b.z, b.z + b.depth],
        [from.y, dy, b.y, b.y + b.height],
      ])
    )
      return false;
  for (const s of map.surfaces)
    if (
      s.thickness > 0 &&
      slab([
        [from.x, dx, s.x, s.x + s.width],
        [from.z, dz, s.z, s.z + s.depth],
        [
          from.y - s.y - (s.slope ?? 0) * (from.z - s.z),
          dy - (s.slope ?? 0) * dz,
          -s.thickness,
          0,
        ],
      ])
    )
      return false;
  for (const item of items) {
    const type = catalog.find((t) => t.id === item.type);
    if (!type?.blocking) continue;
    const ox = from.x - item.position.x,
      oz = from.z - item.position.z,
      a = dx * dx + dz * dz;
    let lo = 0,
      hi = 1;
    if (a < 1e-12) {
      if (ox * ox + oz * oz >= type.radius ** 2) continue;
    } else {
      const b = 2 * (ox * dx + oz * dz),
        c = ox * ox + oz * oz - type.radius ** 2,
        d = b * b - 4 * a * c;
      if (d <= 0) continue;
      lo = Math.max(0, (-b - Math.sqrt(d)) / (2 * a));
      hi = Math.min(1, (-b + Math.sqrt(d)) / (2 * a));
    }
    if (
      lo < hi &&
      slab([
        [from.y, dy, item.position.y, item.position.y + type.height],
        [0, 1, lo, hi],
      ])
    )
      return false;
  }
  return true;
}
function emit(
  state: Simulation,
  session: string,
  kind: WorldActionEvent["kind"],
  position: Vec3,
  target?: string,
) {
  const a = state.actions!,
    tool = a.players[session].tool;
  if (!tool) return;
  a.events.push({
    id: ++a.eventSequence,
    tick: state.tick,
    session,
    tool,
    kind,
    position: { x: position.x, y: position.y, z: position.z },
    ...(target ? { target } : {}),
  });
  if (a.events.length > 32) a.events.shift();
}
function cancel(state: Simulation, session: string) {
  const p = state.actions!.players[session];
  if (p.target)
    emit(state, session, "release", state.players[session], p.target);
  p.held = false;
  p.target = null;
  transition(p, state.tick < p.cooldownUntil ? "cooldown" : "idle", state.tick);
}
function clampVelocity(body: Body) {
  const n = Math.hypot(body.vx, body.vy, body.vz);
  if (n > 20) {
    body.vx *= 20 / n;
    body.vy *= 20 / n;
    body.vz *= 20 / n;
  }
}
/** Called exactly once per fixed world step, before player/toy integration. */
export function stepActions(
  map: WorldMap,
  state: Simulation,
  inputs: Record<string, Input>,
  commands: readonly ActionCommand[] = [],
  items: Placement[] = [],
  catalog: ItemType[] = [],
) {
  if (!map.actionCatalog || !state.actions) return;
  syncActionPlayers(state);
  const a = state.actions;
  const origin = (b: Body): Vec3 => ({ x: b.x, y: b.y + 0.7, z: b.z });
  const visible = (b: Body, to: Vec3) =>
    actionLineClear(map, origin(b), to, items, catalog);
  for (const command of [...commands].sort((l, r) => l.sequence - r.sequence)) {
    if (command.sequence <= a.appliedSequence) continue;
    a.appliedSequence = command.sequence;
    const p = a.players[command.session],
      body = state.players[command.session],
      intent = command.intent;
    if (!p || !body) continue;
    validateActionIntent(intent, map.actionCatalog);
    if (intent.sequence <= p.sequence) continue;
    p.sequence = intent.sequence;
    if (intent.kind === "equip") {
      if (p.tool !== intent.tool) {
        cancel(state, command.session);
        p.tool = intent.tool;
        p.cooldownUntil = p.tool ? p.cooldowns[p.tool] : 0;
        transition(
          p,
          state.tick < p.cooldownUntil ? "cooldown" : "idle",
          state.tick,
        );
      }
      continue;
    }
    if (intent.kind === "aim") {
      p.aim = { x: intent.x, z: intent.z };
      p.aimManual = true;
      continue;
    }
    if (intent.kind === "cancel") {
      cancel(state, command.session);
      continue;
    }
    if (!p.tool) continue;
    const tool = map.actionCatalog.tools.find((t) => t.id === p.tool)!;
    if (!intent.pressed) {
      if (p.held && p.target && p.tool === "tether-winch") {
        const toy = state.toys[p.target];
        if (toy) {
          toy.vx = p.aim.x * tool.strength;
          toy.vz = p.aim.z * tool.strength;
          toy.vy = 3;
          clampVelocity(toy);
          emit(state, command.session, "pitch", toy, p.target);
        }
        p.cooldownUntil = p.cooldowns[p.tool] = state.tick + tool.cooldownTicks;
        p.target = null;
      }
      // A pulse is a press action: releasing the button does not cancel its windup.
      p.held = false;
      if (!actionMovementLocked(p)) cancel(state, command.session);
      continue;
    }
    if (p.held || state.tick < p.cooldownUntil || actionMovementLocked(p))
      continue;
    if (p.tool === "wake-driver" && !grounded(map, body)) continue;
    p.held = true;
    p.lastHeldTick = state.tick;
    if (p.tool === "wake-driver") {
      transition(p, "charging", state.tick, WAKE_MOTION.chargeTicks);
      p.cooldownUntil = p.cooldowns[p.tool] = state.tick + tool.cooldownTicks;
      emit(state, command.session, "charge", body);
    } else if (p.tool === "rebound-panel") transition(p, "braced", state.tick);
    else {
      const locked = new Set(
        Object.values(a.players)
          .filter((other) => other !== p && other.held)
          .map((other) => other.target),
      );
      const candidates = map.toys
        .filter((t) => {
          const b = state.toys[t.id],
            dx = b.x - body.x,
            dz = b.z - body.z,
            d = Math.hypot(dx, dz);
          return (
            !locked.has(t.id) &&
            d <= tool.range &&
            Math.abs(b.y - body.y) < 1.2 &&
            (d < 0.1 || (dx * p.aim.x + dz * p.aim.z) / d > 0.65) &&
            visible(body, { x: b.x, y: b.y + t.radius, z: b.z })
          );
        })
        .sort(
          (l, r) =>
            Math.hypot(
              state.toys[l.id].x - body.x,
              state.toys[l.id].z - body.z,
            ) -
              Math.hypot(
                state.toys[r.id].x - body.x,
                state.toys[r.id].z - body.z,
              ) || compareIds(l.id, r.id),
        );
      p.target = candidates[0]?.id ?? null;
      transition(p, p.target ? "reeling" : "idle", state.tick);
      if (p.target)
        emit(state, command.session, "reel", state.toys[p.target], p.target);
      else p.held = false;
    }
  }
  for (const session of Object.keys(a.players).sort()) {
    const p = a.players[session],
      body = state.players[session];
    p.impulse.x *= Math.exp(-5 * DT);
    p.impulse.z *= Math.exp(-5 * DT);
    if (
      Math.hypot(inputs[session]?.x ?? 0, inputs[session]?.z ?? 0) > 0.01 &&
      !p.held &&
      !actionMovementLocked(p) &&
      !p.aimManual
    )
      p.aim = { x: Math.sin(body.facing), z: Math.cos(body.facing) };
    if (p.held && inputs[session]?.toolHeld) p.lastHeldTick = state.tick;
    if (p.held && state.tick - p.lastHeldTick > 8 && !actionMovementLocked(p))
      cancel(state, session);
    if (p.phase === "cooldown" && state.tick >= p.cooldownUntil)
      transition(p, "idle", state.tick);
    if (!p.tool) continue;
    const tool = map.actionCatalog.tools.find((t) => t.id === p.tool)!;
    if (p.phase === "reeling" && p.target) {
      const target = map.toys.find((t) => t.id === p.target),
        b = state.toys[p.target];
      if (
        !target ||
        !b ||
        Math.hypot(b.x - body.x, b.y - body.y, b.z - body.z) >
          tool.range + 0.5 ||
        !visible(body, { x: b.x, y: b.y + target.radius, z: b.z })
      ) {
        cancel(state, session);
        continue;
      }
      const reach = 1.05 + target.radius;
      b.vx +=
        ((body.x + p.aim.x * reach - b.x) * tool.strength * 3 - b.vx * 7) * DT;
      b.vz +=
        ((body.z + p.aim.z * reach - b.z) * tool.strength * 3 - b.vz * 7) * DT;
      b.vy += ((body.y + 0.55 - b.y) * tool.strength * 3 - b.vy * 7 + 18) * DT;
      clampVelocity(b);
    }
    if (p.phase === "braced") {
      const center = {
        x: body.x + p.aim.x * 0.8,
        y: body.y + 0.7,
        z: body.z + p.aim.z * 0.8,
      };
      for (const t of [...map.toys].sort((l, r) => compareIds(l.id, r.id))) {
        const b = state.toys[t.id],
          dx = b.x - center.x,
          dz = b.z - center.z;
        const normal = dx * p.aim.x + dz * p.aim.z,
          along = Math.abs(dx * p.aim.z - dz * p.aim.x),
          incoming = b.vx * p.aim.x + b.vz * p.aim.z;
        if (
          incoming < -0.15 &&
          normal >= -0.1 &&
          normal + incoming * DT <= t.radius + 0.08 &&
          along <= tool.range / 2 + t.radius &&
          Math.abs(b.y + t.radius - center.y) < 0.8 + t.radius &&
          actionLineClear(
            map,
            center,
            { x: b.x, y: b.y + t.radius, z: b.z },
            items,
            catalog,
          )
        ) {
          const impulse = Math.max(tool.strength, -incoming * 1.75);
          b.vx += p.aim.x * impulse;
          b.vz += p.aim.z * impulse;
          b.vy = Math.max(b.vy, 1.5);
          clampVelocity(b);
          emit(state, session, "rebound", b, t.id);
        }
      }
      for (const other of Object.keys(a.players).sort()) {
        if (other === session) continue;
        const b = state.players[other],
          recipient = a.players[other],
          dx = b.x - center.x,
          dz = b.z - center.z;
        if (
          recipient.immuneUntil <= state.tick &&
          Math.abs(dx * p.aim.x + dz * p.aim.z) < 0.4 &&
          Math.abs(dx * p.aim.z - dz * p.aim.x) < tool.range / 2 &&
          Math.abs(b.y - body.y) < 0.6 &&
          visible(body, origin(b))
        ) {
          recipient.impulse = {
            x: p.aim.x * Math.min(4, tool.strength),
            z: p.aim.z * Math.min(4, tool.strength),
          };
          recipient.immuneUntil = state.tick + Math.max(30, tool.cooldownTicks);
          b.vy = Math.max(b.vy, 1);
          emit(state, session, "boost", b, other);
        }
      }
    }
    if (p.phase === "charging" && state.tick >= p.phaseUntil) {
      p.held = false;
      if (!grounded(map, body)) {
        cancel(state, session);
        continue;
      }
      body.vy = WAKE_MOTION.jumpSpeed;
      transition(p, "leaping", state.tick, WAKE_MOTION.leapTimeoutTicks);
    } else if (p.phase === "impact" && state.tick >= p.phaseUntil) {
      body.vy = WAKE_MOTION.recoilSpeed;
      transition(p, "recoiling", state.tick, WAKE_MOTION.recoilTimeoutTicks);
    } else if (
      (p.phase === "leaping" || p.phase === "recoiling") &&
      state.tick >= p.phaseUntil
    ) {
      cancel(state, session);
    }
  }
  a.events = a.events.filter((event) => state.tick - event.tick <= 90);
}
/** Called after player collision integration: only a real landing can produce a strike. */
export function finishActions(
  map: WorldMap,
  state: Simulation,
  items: Placement[] = [],
  catalog: ItemType[] = [],
) {
  if (!map.actionCatalog || !state.actions) return;
  const a = state.actions;
  for (const session of Object.keys(a.players).sort()) {
    const p = a.players[session],
      body = state.players[session];
    if (p.tool !== "wake-driver" || !grounded(map, body)) continue;
    if (p.phase === "recoiling") {
      transition(
        p,
        state.tick < p.cooldownUntil ? "cooldown" : "idle",
        state.tick,
      );
      continue;
    }
    if (p.phase !== "leaping") continue;
    const tool = map.actionCatalog.tools.find((t) => t.id === p.tool)!;
    const center = {
      x: body.x + p.aim.x * 0.6,
      y: body.y + 0.08,
      z: body.z + p.aim.z * 0.6,
    };
    transition(p, "impact", state.tick, WAKE_MOTION.impactTicks);
    const ground = supportAt(map, center.x, center.z, body.y + 0.65);
    // A landing at a ledge cannot strike a different storey or create a wave
    // inside a wall. Sloped ground also determines the event's real height.
    if (!ground || Math.abs(top(ground, center.z) - body.y) > 0.65) continue;
    center.y = top(ground, center.z) + 0.08;
    if (
      !actionLineClear(
        map,
        { x: body.x, y: body.y + 0.7, z: body.z },
        center,
        items,
        catalog,
      )
    )
      continue;
    emit(state, session, "pulse", center);
    const hit = (b: Body, height: number) =>
      Math.hypot(b.x - center.x, b.z - center.z) <= tool.range &&
      Math.abs(b.y - body.y) < 0.8 &&
      actionLineClear(
        map,
        center,
        { x: b.x, y: b.y + height, z: b.z },
        items,
        catalog,
      );
    const direction = (b: Body) => {
      const dx = b.x - center.x,
        dz = b.z - center.z,
        d = Math.hypot(dx, dz);
      return d < 0.05 ? p.aim : { x: dx / d, z: dz / d };
    };
    for (const t of map.toys) {
      const b = state.toys[t.id];
      if (hit(b, t.radius)) {
        const n = direction(b);
        b.vx += n.x * tool.strength;
        b.vz += n.z * tool.strength;
        b.vy = Math.max(b.vy, tool.strength);
        clampVelocity(b);
      }
    }
    for (const other of Object.keys(a.players).sort()) {
      const b = state.players[other],
        recipient = a.players[other];
      if (
        other !== session &&
        recipient.immuneUntil <= state.tick &&
        hit(b, 0.65)
      ) {
        const n = direction(b);
        recipient.impulse = {
          x: n.x * Math.min(4, tool.strength),
          z: n.z * Math.min(4, tool.strength),
        };
        b.vy = Math.max(b.vy, Math.min(5, tool.strength));
        recipient.immuneUntil = state.tick + 30;
      }
    }
  }
}
export function validActionState(
  value: unknown,
  map: WorldMap,
  sessions: string[],
  currentTick: number,
): value is WorldActionState {
  if (!map.actionCatalog) return value === undefined;
  const a = value as WorldActionState;
  if (
    !exact(a, [
      "version",
      "appliedSequence",
      "eventSequence",
      "players",
      "events",
    ]) ||
    a.version !== 1 ||
    !tick(a.appliedSequence) ||
    !tick(a.eventSequence) ||
    !record(a.players) ||
    Object.keys(a.players).length !== sessions.length ||
    !Array.isArray(a.events) ||
    a.events.length > 32
  )
    return false;
  for (const session of sessions) {
    const p = a.players[session];
    if (
      !exact(p, [
        "tool",
        "phase",
        "held",
        "aim",
        "aimManual",
        "cooldownUntil",
        "cooldowns",
        "phaseStarted",
        "phaseUntil",
        "lastHeldTick",
        "target",
        "sequence",
        "impulse",
        "immuneUntil",
      ]) ||
      (p.tool !== null &&
        !map.actionCatalog.tools.some((t) => t.id === p.tool)) ||
      ![
        "idle",
        "reeling",
        "braced",
        "charging",
        "leaping",
        "impact",
        "recoiling",
        "cooldown",
      ].includes(p.phase) ||
      typeof p.held !== "boolean" ||
      typeof p.aimManual !== "boolean" ||
      !exact(p.aim, ["x", "z"]) ||
      !number(p.aim.x, 1) ||
      !number(p.aim.z, 1) ||
      Math.abs(Math.hypot(p.aim.x, p.aim.z) - 1) > 0.001 ||
      !exact(p.impulse, ["x", "z"]) ||
      !number(p.impulse.x, 8) ||
      !number(p.impulse.z, 8) ||
      !exact(p.cooldowns, [...TOOL_IDS]) ||
      !TOOL_IDS.every(
        (k) => tick(p.cooldowns[k]) && p.cooldowns[k] <= currentTick + 300,
      ) ||
      ![p.cooldownUntil, p.phaseUntil, p.immuneUntil].every(
        (v) => tick(v) && v <= currentTick + 300,
      ) ||
      !tick(p.phaseStarted) ||
      p.phaseStarted > currentTick ||
      p.phaseUntil < p.phaseStarted ||
      !tick(p.lastHeldTick) ||
      p.lastHeldTick > currentTick ||
      !tick(p.sequence) ||
      (p.target !== null && !map.toys.some((t) => t.id === p.target))
    )
      return false;
    if (
      (!p.tool &&
        (p.held || p.target || !["idle", "cooldown"].includes(p.phase))) ||
      (p.phase === "reeling" && (p.tool !== "tether-winch" || !p.target)) ||
      (p.phase === "braced" && p.tool !== "rebound-panel") ||
      (actionMovementLocked(p) && p.tool !== "wake-driver")
    )
      return false;
  }
  let last = 0;
  return a.events.every((e) => {
    if (
      !record(e) ||
      Object.keys(e).some(
        (k) =>
          ![
            "id",
            "tick",
            "session",
            "tool",
            "kind",
            "position",
            "target",
          ].includes(k),
      ) ||
      !tick(e.id) ||
      e.id <= last ||
      e.id > a.eventSequence ||
      !tick(e.tick) ||
      e.tick > currentTick ||
      !sessions.includes(e.session) ||
      !map.actionCatalog!.tools.some((t) => t.id === e.tool) ||
      ![
        "reel",
        "pitch",
        "release",
        "rebound",
        "boost",
        "charge",
        "pulse",
      ].includes(e.kind) ||
      !exact(e.position, ["x", "y", "z"]) ||
      !Object.values(e.position).every((v) => number(v)) ||
      (e.target !== undefined && !id(e.target))
    )
      return false;
    last = e.id;
    return true;
  });
}
