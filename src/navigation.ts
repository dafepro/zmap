import {
  canOccupyPlayer,
  inside,
  supportAt,
  top,
  type ItemType,
  type Placement,
  type Vec3,
  type WorldMap,
} from "./core.js";

export interface NavigationOptions {
  items?: Placement[];
  catalog?: ItemType[];
  /** Metres between search samples. Routes are still collision checked at 10 cm. */
  spacing?: number;
  /** Hard limit on sampled surface candidates, segment samples and search expansions. */
  maxNodes?: number;
}
export type NavigationResult =
  | { status: "ready"; points: Vec3[]; visited: number }
  | { status: "unreachable" | "budget-exceeded"; points: []; visited: number };
const distance = (a: Vec3, b: Vec3) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const footingOffsets = [
  [0, 0],
  [0.1, 0],
  [-0.1, 0],
  [0, 0.1],
  [0, -0.1],
] as const;

/** Grounded traversal only: stairs/ramps are allowed, unsupported jumps and bridge drops are not. */
export function canWalkSegment(
  map: WorldMap,
  from: Vec3,
  to: Vec3,
  options: NavigationOptions = {},
): boolean {
  if (![from.x, from.y, from.z, to.x, to.y, to.z].every(Number.isFinite))
    return false;
  const horizontal = Math.hypot(to.x - from.x, to.z - from.z);
  // Bound work even when called directly with coordinates outside a validated map.
  if (horizontal > Math.hypot(map.bounds.width, map.bounds.depth) + 1)
    return false;
  const count = Math.ceil(horizontal / 0.1);
  const limit = options.maxNodes ?? 20000;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100000 ||
    count + 1 > limit
  )
    return false;
  const stations = new Set<number>();
  for (let i = 0; i <= count; i++) stations.add(count ? i / count : 0);
  // Uniform samples alone can alias a narrow gap, even with the footprint
  // offsets: all five probes can repeatedly land on the same 10cm lattice.
  // Partition where any footprint probe enters/leaves a surface and inspect
  // every interval between those exact boundaries.
  const boundaries = new Set<number>(count ? [0, 1] : [0]);
  for (const surface of map.surfaces)
    for (const [ox, oz] of footingOffsets) {
      for (const [start, delta, edges] of [
        [from.x + ox, to.x - from.x, [surface.x, surface.x + surface.width]],
        [from.z + oz, to.z - from.z, [surface.z, surface.z + surface.depth]],
      ] as const) {
        if (Math.abs(delta) < 1e-12) continue;
        for (const edge of edges) {
          const t = (edge - start) / delta;
          if (t > 0 && t < 1) boundaries.add(t);
        }
      }
      if (boundaries.size > limit) return false;
    }
  const sorted = [...boundaries].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    stations.add(sorted[i]);
    if (i) stations.add((sorted[i - 1] + sorted[i]) / 2);
    if (stations.size > limit) return false;
  }
  let y = from.y;
  for (const t of [...stations].sort((a, b) => a - b)) {
    const x = from.x + (to.x - from.x) * t,
      z = from.z + (to.z - from.z) * t,
      surface = supportAt(map, x, z, y + 0.23);
    if (!surface) return false;
    const nextY = top(surface, z);
    if (
      Math.abs(nextY - y) > 0.23 ||
      !canOccupyPlayer(map, { x, y: nextY, z }, options.items, options.catalog)
    )
      return false;
    // Keep a small support footprint: a route along an exact platform edge
    // becomes unreachable as soon as ordinary steering stops a few cm short.
    for (const [ox, oz] of footingOffsets.slice(1)) {
      const footing = supportAt(map, x + ox, z + oz, nextY + 0.23);
      if (!footing || Math.abs(top(footing, z + oz) - nextY) > 0.12)
        return false;
    }
    y = nextY;
  }
  return Math.abs(y - to.y) < 0.08;
}

/** A bounded, deterministic path on actual collision surfaces, retaining overlapping height layers. */
export function findWalkPath(
  map: WorldMap,
  from: Vec3,
  to: Vec3,
  options: NavigationOptions = {},
): NavigationResult {
  const limit = options.maxNodes ?? 20000,
    spacing = options.spacing ?? 0.4;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100000 ||
    !Number.isFinite(spacing) ||
    spacing < 0.15 ||
    spacing > 1
  )
    throw new Error(
      "Navigation requires spacing 0.15–1 and a node budget 1–100000",
    );
  if (
    !canWalkSegment(map, from, from, options) ||
    !canWalkSegment(map, to, to, options)
  )
    return { status: "unreachable", points: [], visited: 0 };
  if (canWalkSegment(map, from, to, options))
    return { status: "ready", points: [{ ...from }, { ...to }], visited: 0 };
  const cols = Math.ceil(map.bounds.width / spacing),
    rows = Math.ceil(map.bounds.depth / spacing);
  if (cols * rows * map.surfaces.length > limit)
    return { status: "budget-exceeded", points: [], visited: 0 };
  const points: Vec3[] = [],
    cells = new Map<string, number[]>(),
    coordinates: [number, number][] = [];
  for (let iz = 0; iz < rows; iz++)
    for (let ix = 0; ix < cols; ix++) {
      const x = map.bounds.x + (ix + 0.5) * spacing,
        z = map.bounds.z + (iz + 0.5) * spacing,
        ids: number[] = [];
      for (const surface of map.surfaces) {
        if (!inside(surface, x, z)) continue;
        const point = { x, y: top(surface, z), z };
        if (
          ids.some((id) => Math.abs(points[id].y - point.y) < 0.02) ||
          !canWalkSegment(map, point, point, options)
        )
          continue;
        ids.push(points.length);
        points.push(point);
        coordinates.push([ix, iz]);
      }
      if (ids.length) cells.set(`${ix},${iz}`, ids);
    }
  // Exact endpoints connect to nearby samples on their own reachable surface layer.
  const near = (point: Vec3) => {
    const ix = Math.floor((point.x - map.bounds.x) / spacing),
      iz = Math.floor((point.z - map.bounds.z) / spacing);
    const result: number[] = [];
    for (let z = iz - 2; z <= iz + 2; z++)
      for (let x = ix - 2; x <= ix + 2; x++)
        result.push(...(cells.get(`${x},${z}`) ?? []));
    return result;
  };
  const start = points.length,
    end = start + 1;
  const starts = near(from).filter((id) =>
    canWalkSegment(map, from, points[id], options),
  );
  const ends = new Set(
    near(to).filter((id) => canWalkSegment(map, points[id], to, options)),
  );
  points.push({ ...from }, { ...to });
  if (!starts.length || !ends.size)
    return { status: "unreachable", points: [], visited: 0 };
  const costs = new Float64Array(points.length).fill(Infinity),
    previous = new Int32Array(points.length).fill(-1),
    closed = new Set<number>(),
    heap: { id: number; score: number; cost: number }[] = [];
  const push = (id: number, cost: number) => {
    const entry = { id, cost, score: cost + distance(points[id], to) };
    heap.push(entry);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].score <= entry.score) break;
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = entry;
  };
  const pop = () => {
    const result = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (
          child + 1 < heap.length &&
          heap[child + 1].score < heap[child].score
        )
          child++;
        if (last.score <= heap[child].score) break;
        heap[i] = heap[child];
        i = child;
      }
      heap[i] = last;
    }
    return result;
  };
  costs[start] = 0;
  push(start, 0);
  while (heap.length && closed.size < limit) {
    const current = pop();
    if (closed.has(current.id) || current.cost > costs[current.id]) continue;
    if (current.id === end) {
      const route: Vec3[] = [];
      for (let id = end; id !== -1; id = previous[id]) route.push(points[id]);
      route.reverse();
      const smooth = [route[0]];
      for (let i = 0; i < route.length - 1;) {
        let next = i + 1;
        // Limit smoothing work on long paths; legality is always rechecked.
        for (let j = Math.min(route.length - 1, i + 20); j > i + 1; j--)
          if (canWalkSegment(map, route[i], route[j], options)) {
            next = j;
            break;
          }
        smooth.push(route[next]);
        i = next;
      }
      return { status: "ready", points: smooth, visited: closed.size };
    }
    closed.add(current.id);
    const neighbors: number[] = [];
    if (current.id === start) neighbors.push(...starts);
    else {
      const [ix, iz] = coordinates[current.id];
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++)
          if (dx || dz)
            neighbors.push(...(cells.get(`${ix + dx},${iz + dz}`) ?? []));
      if (ends.has(current.id)) neighbors.push(end);
    }
    for (const id of neighbors) {
      if (closed.has(id)) continue;
      const cost = current.cost + distance(points[current.id], points[id]);
      if (
        cost >= costs[id] ||
        !canWalkSegment(map, points[current.id], points[id], options)
      )
        continue;
      costs[id] = cost;
      previous[id] = current.id;
      push(id, cost);
    }
  }
  return {
    status: heap.length ? "budget-exceeded" : "unreachable",
    points: [],
    visited: closed.size,
  };
}
