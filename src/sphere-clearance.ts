import {
  inside,
  type ItemType,
  type Placement,
  type Vec3,
  type WorldMap,
} from "./core.js";
import { worldToyColliders } from "./world-objects.js";

const EPSILON = 1e-6;
type Box = { min: Vec3; max: Vec3 };

/** The open interval matters: exactly tangent motion remains valid. */
function intersectsRanges(ranges: [number, number, number, number][]) {
  let enter = 0,
    exit = 1;
  for (const [origin, delta, min, max] of ranges) {
    if (Math.abs(delta) < 1e-12) {
      if (origin <= min || origin >= max) return false;
    } else {
      const a = (min - origin) / delta,
        b = (max - origin) / delta;
      enter = Math.max(enter, Math.min(a, b));
      exit = Math.min(exit, Math.max(a, b));
      if (enter >= exit) return false;
    }
  }
  return enter < 1 && exit > 0;
}
function expandedBoxHit(from: Vec3, to: Vec3, box: Box, radius: number) {
  return intersectsRanges(
    (["x", "y", "z"] as const).map((axis) => [
      from[axis],
      to[axis] - from[axis],
      box.min[axis] - radius,
      box.max[axis] + radius,
    ]),
  );
}
function boxDistanceSquared(point: Vec3, box: Box) {
  return (["x", "y", "z"] as const).reduce(
    (sum, axis) =>
      sum +
      Math.max(box.min[axis] - point[axis], point[axis] - box.max[axis], 0) **
        2,
    0,
  );
}
/** Squared distance to a convex solid is convex along a segment. A convex search of
 * this minimum includes faces, edges and corners; no finite ray bundle can. */
function sweepHits(
  from: Vec3,
  to: Vec3,
  radius: number,
  distanceSquared: (point: Vec3) => number,
) {
  const limit = radius * radius;
  if (distanceSquared(from) < limit || distanceSquared(to) < limit) return true;
  const at = (t: number) => ({
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    z: from.z + (to.z - from.z) * t,
  });
  let low = 0,
    high = 1;
  for (let i = 0; i < 40; i++) {
    const a = low + (high - low) / 3,
      b = high - (high - low) / 3;
    if (distanceSquared(at(a)) < distanceSquared(at(b))) high = b;
    else low = a;
  }
  return distanceSquared(at((low + high) / 2)) < limit;
}
function boxSweepHits(from: Vec3, to: Vec3, box: Box, radius: number) {
  return (
    expandedBoxHit(from, to, box, radius) &&
    sweepHits(from, to, radius, (point) => boxDistanceSquared(point, box))
  );
}

/** Clearance for a sphere's CENTER swept along one segment. Exact for boxes and
 * upright cylinders; ramps use conservatively expanded face planes, including
 * the slope-normal radius. Tangency with a floor/wall is allowed. This matches
 * authored toy blockers and ignores non-blocking placements and avatars. */
export function spherePathClear(
  map: WorldMap,
  from: Vec3,
  to: Vec3,
  radius: number,
  items: Placement[] = [],
  catalog: ItemType[] = [],
): boolean {
  if (
    !Number.isFinite(radius) ||
    radius <= EPSILON ||
    ![from.x, from.y, from.z, to.x, to.y, to.z].every(Number.isFinite)
  )
    return false;
  const r = Math.max(0, radius - EPSILON);
  if (
    !inside(map.bounds, from.x, from.z, r) ||
    !inside(map.bounds, to.x, to.z, r)
  )
    return false;
  for (const blocker of map.blockers) {
    const box = {
      min: { x: blocker.x, y: blocker.y, z: blocker.z },
      max: {
        x: blocker.x + blocker.width,
        y: blocker.y + blocker.height,
        z: blocker.z + blocker.depth,
      },
    };
    if (boxSweepHits(from, to, box, r)) return false;
  }
  for (const surface of map.surfaces) {
    const slope = surface.slope ?? 0;
    if (!slope) {
      const box = {
        min: { x: surface.x, y: surface.y - surface.thickness, z: surface.z },
        max: {
          x: surface.x + surface.width,
          y: surface.y,
          z: surface.z + surface.depth,
        },
      };
      if (boxSweepHits(from, to, box, r)) return false;
      continue;
    }
    const fromHeight = from.y - slope * (from.z - surface.z),
      toHeight = to.y - slope * (to.z - surface.z),
      normalRadius = r * Math.hypot(1, slope);
    if (
      intersectsRanges([
        [from.x, to.x - from.x, surface.x - r, surface.x + surface.width + r],
        [from.z, to.z - from.z, surface.z - r, surface.z + surface.depth + r],
        [
          fromHeight,
          toHeight - fromHeight,
          surface.y - surface.thickness - normalRadius,
          surface.y + normalRadius,
        ],
      ])
    )
      return false;
  }
  for (const placement of items) {
    const type = catalog.find((type) => type.id === placement.type);
    if (!type?.blocking) continue;
    const p = placement.position,
      box = {
        min: { x: p.x - type.radius, y: p.y, z: p.z - type.radius },
        max: {
          x: p.x + type.radius,
          y: p.y + type.height,
          z: p.z + type.radius,
        },
      };
    if (
      expandedBoxHit(from, to, box, r) &&
      sweepHits(
        from,
        to,
        r,
        (point) =>
          Math.max(0, Math.hypot(point.x - p.x, point.z - p.z) - type.radius) **
            2 +
          Math.max(p.y - point.y, point.y - p.y - type.height, 0) ** 2,
      )
    )
      return false;
  }
  for (const collider of worldToyColliders(map)) {
    const s = Math.sin(collider.rotation),
      c = Math.cos(collider.rotation);
    const local = (point: Vec3) => ({
      x: (point.x - collider.center.x) * c - (point.z - collider.center.z) * s,
      y: point.y - collider.center.y,
      z: (point.x - collider.center.x) * s + (point.z - collider.center.z) * c,
    });
    const box = {
      min: {
        x: -collider.size.x / 2,
        y: -collider.size.y / 2,
        z: -collider.size.z / 2,
      },
      max: {
        x: collider.size.x / 2,
        y: collider.size.y / 2,
        z: collider.size.z / 2,
      },
    };
    if (boxSweepHits(local(from), local(to), box, r)) return false;
  }
  return true;
}
