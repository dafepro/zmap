/** App-approved presentation choices; no avatar assets, inventory or identity policy. */
export type WorldPerformanceCatalog = {
  emotes: { id: string; durationTicks: number }[];
  drawTicks: number;
  stowTicks: number;
};
export type PlayerPerformance = {
  drawn: boolean;
  equipmentStarted: number;
  equipmentUntil: number;
  equipmentFrom: number;
  emote: {
    id: string;
    /** Actual clip start, after a selected tool finishes stowing. */
    startedTick: number;
    untilTick: number;
    redraw: boolean;
  } | null;
};
const exact = (v: any, keys: string[]) =>
  v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.keys(v).length === keys.length &&
  keys.every((key) => Object.hasOwn(v, key));
const tick = (v: unknown): v is number =>
  Number.isSafeInteger(v) && (v as number) >= 0;
export function validatePerformanceCatalog(
  value: unknown,
): asserts value is WorldPerformanceCatalog {
  const c = value as WorldPerformanceCatalog;
  if (
    !exact(c, ["emotes", "drawTicks", "stowTicks"]) ||
    !Array.isArray(c.emotes) ||
    c.emotes.length > 16 ||
    !tick(c.drawTicks) ||
    c.drawTicks < 1 ||
    c.drawTicks > 90 ||
    !tick(c.stowTicks) ||
    c.stowTicks < 1 ||
    c.stowTicks > 90
  )
    throw Error("Invalid performance catalog");
  const seen = new Set<string>();
  for (const e of c.emotes) {
    if (
      !exact(e, ["id", "durationTicks"]) ||
      typeof e.id !== "string" ||
      !/^[a-z][a-z0-9-]{0,39}$/.test(e.id) ||
      seen.has(e.id) ||
      !tick(e.durationTicks) ||
      e.durationTicks < 1 ||
      e.durationTicks > 900
    )
      throw Error("Invalid approved emote");
    seen.add(e.id);
  }
}
export const initialPerformance = (): PlayerPerformance => ({
  drawn: false,
  equipmentStarted: 0,
  equipmentUntil: 0,
  equipmentFrom: 0,
  emote: null,
});
export function setPerformanceDrawn(
  p: PlayerPerformance,
  drawn: boolean,
  now: number,
  c: WorldPerformanceCatalog,
) {
  if (p.drawn === drawn) return;
  const duration = p.equipmentUntil - p.equipmentStarted;
  const progress = duration
    ? Math.max(0, Math.min(1, (now - p.equipmentStarted) / duration))
    : 1;
  p.equipmentFrom += ((p.drawn ? 1 : 0) - p.equipmentFrom) * progress;
  p.drawn = drawn;
  p.equipmentStarted = now;
  p.equipmentUntil = now + (drawn ? c.drawTicks : c.stowTicks);
}
export function cancelPerformance(
  p: PlayerPerformance,
  hasTool: boolean,
  now: number,
  c: WorldPerformanceCatalog,
) {
  const redraw = p.emote?.redraw;
  p.emote = null;
  if (redraw && hasTool) setPerformanceDrawn(p, true, now, c);
}
export function startPerformance(
  p: PlayerPerformance,
  id: string,
  hasTool: boolean,
  now: number,
  c: WorldPerformanceCatalog,
) {
  const choice = c.emotes.find((e) => e.id === id)!;
  const redraw = hasTool && (p.emote?.redraw ?? p.drawn);
  if (hasTool) setPerformanceDrawn(p, false, now, c);
  const startedTick = hasTool ? Math.max(now, p.equipmentUntil) : now;
  p.emote = {
    id,
    startedTick,
    untilTick: startedTick + choice.durationTicks,
    redraw,
  };
}
export function performanceUsable(
  p: PlayerPerformance | undefined,
  now: number,
) {
  return !p || (p.drawn && now >= p.equipmentUntil && !p.emote);
}
export function validPerformanceState(
  value: unknown,
  c: WorldPerformanceCatalog | undefined,
  hasTool: boolean,
  now: number,
): value is PlayerPerformance | undefined {
  if (!c) return value === undefined;
  const p = value as PlayerPerformance;
  if (
    !exact(p, [
      "drawn",
      "equipmentStarted",
      "equipmentUntil",
      "equipmentFrom",
      "emote",
    ]) ||
    typeof p.drawn !== "boolean" ||
    !Number.isFinite(p.equipmentFrom) ||
    p.equipmentFrom < 0 ||
    p.equipmentFrom > 1 ||
    (p.drawn && !hasTool) ||
    !tick(p.equipmentStarted) ||
    p.equipmentStarted > now ||
    !tick(p.equipmentUntil) ||
    p.equipmentUntil < p.equipmentStarted ||
    (p.equipmentUntil - p.equipmentStarted !==
      (p.drawn ? c.drawTicks : c.stowTicks) &&
      !(
        p.equipmentUntil === p.equipmentStarted &&
        !p.drawn &&
        p.equipmentFrom === 0
      )) ||
    (!hasTool &&
      (p.equipmentFrom !== 0 || p.equipmentUntil !== p.equipmentStarted))
  )
    return false;
  if (p.emote === null) return true;
  const e = p.emote,
    choice = c.emotes.find((entry) => entry.id === e?.id);
  return (
    !!choice &&
    exact(e, ["id", "startedTick", "untilTick", "redraw"]) &&
    typeof e.redraw === "boolean" &&
    (!e.redraw || hasTool) &&
    !p.drawn &&
    tick(e.startedTick) &&
    e.startedTick <= now + c.stowTicks &&
    tick(e.untilTick) &&
    e.untilTick > now &&
    e.untilTick - e.startedTick === choice.durationTicks &&
    (!hasTool || e.startedTick >= p.equipmentUntil)
  );
}
