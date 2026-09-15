import {
  bodyAt,
  inside,
  supportAt,
  top,
  validVec,
  type Body,
  type ItemType,
  type Placement,
  type Rect,
  type Toy,
  type Vec3,
  type WorldMap,
} from "./core.js";
import type { WorldToyCollider } from "./world-objects.js";
const GRAVITY = 18;
function reflect(body: Body, nx: number, nz: number, restitution: number) {
  const approach = body.vx * nx + body.vz * nz;
  if (approach < 0) {
    body.vx -= (1 + restitution) * approach * nx;
    body.vz -= (1 + restitution) * approach * nz;
  }
}
function circleContact(
  body: Body,
  x: number,
  z: number,
  radius: number,
  restitution: number,
) {
  const dx = body.x - x,
    dz = body.z - z,
    distance = Math.hypot(dx, dz);
  if (distance >= radius) return;
  const nx = distance > 1e-8 ? dx / distance : 1,
    nz = distance > 1e-8 ? dz / distance : 0;
  body.x = x + nx * (radius + 1e-6);
  body.z = z + nz * (radius + 1e-6);
  reflect(body, nx, nz, restitution);
}
function rectangleContact(
  body: Body,
  rect: Rect,
  radius: number,
  restitution: number,
) {
  const x = Math.max(rect.x, Math.min(rect.x + rect.width, body.x));
  const z = Math.max(rect.z, Math.min(rect.z + rect.depth, body.z));
  if (Math.hypot(body.x - x, body.z - z) > 1e-8) {
    circleContact(body, x, z, radius, restitution);
    return;
  }
  const sides = [
    { d: body.x - rect.x, nx: -1, nz: 0 },
    { d: rect.x + rect.width - body.x, nx: 1, nz: 0 },
    { d: body.z - rect.z, nx: 0, nz: -1 },
    { d: rect.z + rect.depth - body.z, nx: 0, nz: 1 },
  ];
  const side = sides.sort((a, b) => a.d - b.d)[0];
  body.x += side.nx * (side.d + radius + 1e-6);
  body.z += side.nz * (side.d + radius + 1e-6);
  reflect(body, side.nx, side.nz, restitution);
}
/** Resistance acts on the whole tangent velocity. It cannot reverse or steer a flat-ground roll. */
export function rollingResistance(
  body: Body,
  deceleration: number,
  dt: number,
) {
  const speed = Math.hypot(body.vx, body.vz),
    remaining = Math.max(0, speed - deceleration * dt);
  if (!speed) return;
  body.vx *= remaining / speed;
  body.vz *= remaining / speed;
}
/** Equal density by default; authored mass can express a light beach ball or heavy toy. */
export const toyMass = (toy: Toy) => toy.mass ?? (toy.radius / 0.3) ** 3;

function constrainToy(
  map: WorldMap,
  body: Body,
  toy: Toy,
  oldY: number,
  items: Placement[],
  catalog: ItemType[],
  bounce: boolean,
  colliders: readonly WorldToyCollider[] = [],
) {
  const restitution = bounce ? (toy.restitution ?? 0.65) : 0,
    bounds = map.bounds,
    r = toy.radius,
    diameter = r * 2;
  if (body.x < bounds.x + r) {
    body.x = bounds.x + r;
    reflect(body, 1, 0, restitution);
  }
  if (body.x > bounds.x + bounds.width - r) {
    body.x = bounds.x + bounds.width - r;
    reflect(body, -1, 0, restitution);
  }
  if (body.z < bounds.z + r) {
    body.z = bounds.z + r;
    reflect(body, 0, 1, restitution);
  }
  if (body.z > bounds.z + bounds.depth - r) {
    body.z = bounds.z + bounds.depth - r;
    reflect(body, 0, -1, restitution);
  }
  for (const blocker of map.blockers)
    if (body.y < blocker.y + blocker.height && body.y + diameter > blocker.y)
      rectangleContact(body, blocker, r, restitution);
  for (const surface of map.surfaces)
    if (
      top(surface, body.z) > oldY + 0.08 &&
      top(surface, body.z) - surface.thickness < oldY + diameter - 0.01
    )
      rectangleContact(body, surface, r, restitution);
  for (const item of items) {
    const type = catalog.find((t) => t.id === item.type);
    if (
      type?.blocking &&
      body.y < item.position.y + type.height &&
      body.y + diameter > item.position.y
    )
      circleContact(
        body,
        item.position.x,
        item.position.z,
        r + type.radius,
        restitution,
      );
  }
  for (const collider of colliders) {
    const bottom = collider.center.y - collider.size.y / 2;
    if (body.y >= bottom + collider.size.y || body.y + diameter <= bottom)
      continue;
    const s = Math.sin(collider.rotation),
      c = Math.cos(collider.rotation),
      dx = body.x - collider.center.x,
      dz = body.z - collider.center.z;
    const local = {
      ...body,
      x: dx * c - dz * s,
      z: dx * s + dz * c,
      vx: body.vx * c - body.vz * s,
      vz: body.vx * s + body.vz * c,
    };
    rectangleContact(
      local,
      {
        x: -collider.size.x / 2,
        z: -collider.size.z / 2,
        width: collider.size.x,
        depth: collider.size.z,
      },
      r,
      restitution,
    );
    body.x = collider.center.x + local.x * c + local.z * s;
    body.z = collider.center.z - local.x * s + local.z * c;
    body.vx = local.vx * c + local.vz * s;
    body.vz = -local.vx * s + local.vz * c;
  }
  for (const surface of map.surfaces) {
    const bottom = top(surface, body.z) - surface.thickness;
    if (
      surface.thickness > 0 &&
      inside(surface, body.x, body.z) &&
      oldY + diameter <= bottom + 0.01 &&
      body.y + diameter >= bottom
    ) {
      body.y = bottom - diameter;
      if (body.vy > 0) body.vy = -body.vy * restitution;
    }
  }
  const support = supportAt(map, body.x, body.z, Math.max(oldY, body.y) + 0.08);
  if (support && body.y <= top(support, body.z)) {
    body.y = top(support, body.z);
    const slope = support.slope ?? 0,
      n = Math.hypot(1, slope),
      impact = (body.vy - slope * body.vz) / n;
    if (impact < 0) {
      const e = bounce && impact < -1.4 ? restitution : 0;
      body.vy -= ((1 + e) * impact) / n;
      body.vz += ((1 + e) * impact * slope) / n;
    }
  }
}

/** A 3D sphere contact uses centre heights, never the bottom-of-ball Body.y. */
function sphereContact(
  a: Body,
  ta: Toy,
  b: Body,
  tb: Toy,
  bounce: boolean,
  held: ReadonlySet<string>,
) {
  const dx = b.x - a.x,
    dy = b.y + tb.radius - a.y - ta.radius,
    dz = b.z - a.z,
    radius = ta.radius + tb.radius,
    distance = Math.hypot(dx, dy, dz);
  if (distance > radius + 1e-7) return;
  // Stable ID ordering supplied by advanceToys makes coincident recovery deterministic.
  const nx = distance > 1e-9 ? dx / distance : 1,
    ny = distance > 1e-9 ? dy / distance : 0,
    nz = distance > 1e-9 ? dz / distance : 0,
    ia = held.has(ta.id) ? 0 : 1 / toyMass(ta),
    ib = held.has(tb.id) ? 0 : 1 / toyMass(tb),
    sum = ia + ib;
  if (!sum) return;
  if (distance < radius) {
    const correction = (radius - distance) / sum;
    a.x -= nx * correction * ia;
    a.y -= ny * correction * ia;
    a.z -= nz * correction * ia;
    b.x += nx * correction * ib;
    b.y += ny * correction * ib;
    b.z += nz * correction * ib;
  }
  const approach = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz;
  if (approach >= 0) return;
  // Resting contacts are inelastic. Repeated solver passes never reapply restitution.
  const e =
      bounce &&
      approach < -0.75 &&
      !(held.has(ta.id) && Math.hypot(a.vx, a.vy, a.vz) > 0.001) &&
      !(held.has(tb.id) && Math.hypot(b.vx, b.vy, b.vz) > 0.001)
        ? Math.min(ta.restitution ?? 0.65, tb.restitution ?? 0.65)
        : 0,
    impulse = (-(1 + e) * approach) / sum;
  a.vx -= nx * impulse * ia;
  a.vy -= ny * impulse * ia;
  a.vz -= nz * impulse * ia;
  b.vx += nx * impulse * ib;
  b.vy += ny * impulse * ib;
  b.vz += nz * impulse * ib;
}

/** Ground reactions propagate upward through resting contacts, including extreme
 * mass ratios. This prevents a heavy top sphere from numerically crushing a light
 * supported sphere while an iterative pair solver converges. Moving impacts still
 * use the finite-mass impulse solver above. */
function settleSupports(
  map: WorldMap,
  bodies: Record<string, Body>,
  toys: Toy[],
) {
  const ordered = [...toys].sort(
      (a, b) => bodies[a.id].y + a.radius - bodies[b.id].y - b.radius,
    ),
    supported = new Set<string>();
  for (const toy of ordered) {
    const b = bodies[toy.id],
      surface = supportAt(map, b.x, b.z, b.y + 0.001);
    if (
      surface &&
      Math.abs(b.y - top(surface, b.z)) < 0.001 &&
      Math.abs(b.vy - (surface.slope ?? 0) * b.vz) < 0.2
    )
      supported.add(toy.id);
    for (const lower of ordered) {
      if (!supported.has(lower.id) || lower === toy) continue;
      const a = bodies[lower.id],
        dx = b.x - a.x,
        dy = b.y + toy.radius - a.y - lower.radius,
        dz = b.z - a.z,
        d = Math.hypot(dx, dy, dz),
        r = toy.radius + lower.radius;
      if (d < 1e-9 || d > r + 0.002 || dy / d < 0.5) continue;
      const nx = dx / d,
        ny = dy / d,
        nz = dz / d,
        approach = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz;
      if (Math.abs(approach) > 0.75) continue;
      if (d < r) {
        b.x += nx * (r - d);
        b.y += ny * (r - d);
        b.z += nz * (r - d);
      }
      if (approach < 0) {
        b.vx -= nx * approach;
        b.vy -= ny * approach;
        b.vz -= nz * approach;
      }
      supported.add(toy.id);
    }
  }
}

/**
 * All balls share each time slice. Relative travel is below 0.4 of the smallest
 * radius, so even opposing fast balls cannot cross between contact checks.
 * Sequential impulses conserve pair momentum; position projection has no velocity
 * bias and alternating world/pair constraints settle piles without energy injection.
 */
export function advanceToys(
  map: WorldMap,
  bodies: Record<string, Body>,
  toys: readonly Toy[],
  dt: number,
  items: Placement[] = [],
  catalog: ItemType[] = [],
  held: ReadonlySet<string> = new Set(),
  colliders: readonly WorldToyCollider[] = [],
  targets: ReadonlyMap<string, Vec3> = new Map(),
) {
  if (!toys.length || dt <= 0) return;
  const ordered = [...toys].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const starts = new Map<string, Vec3>();
  for (const toy of ordered) {
    const b = bodies[toy.id];
    if (!validVec(b) || b.y < -8) Object.assign(b, bodyAt(toy.home));
    if (held.has(toy.id)) {
      starts.set(toy.id, { x: b.x, y: b.y, z: b.z });
      const target = targets.get(toy.id) ?? b;
      b.vx = (target.x - b.x) / dt;
      b.vy = (target.y - b.y) / dt;
      b.vz = (target.z - b.z) / dt;
    }
  }
  const radius = Math.min(...ordered.map((t) => t.radius)),
    speed = Math.max(
      ...ordered.map((t) =>
        Math.hypot(bodies[t.id].vx, bodies[t.id].vy, bodies[t.id].vz),
      ),
    ),
    count = Math.max(
      4,
      Math.ceil(((speed + GRAVITY * dt) * dt) / (radius * 0.2)),
    ),
    h = dt / count;
  for (let step = 0; step < count; step++) {
    const previousY = ordered.map((t) => bodies[t.id].y);
    for (const toy of ordered) {
      if (held.has(toy.id)) {
        const b = bodies[toy.id],
          start = starts.get(toy.id)!,
          target = targets.get(toy.id) ?? start,
          progress = (step + 1) / count;
        b.x = start.x + (target.x - start.x) * progress;
        b.y = start.y + (target.y - start.y) * progress;
        b.z = start.z + (target.z - start.z) * progress;
        continue;
      }
      const b = bodies[toy.id],
        support = supportAt(map, b.x, b.z, b.y + 0.025),
        slope = support?.slope ?? 0,
        grounded =
          !!support &&
          Math.abs(b.y - top(support, b.z)) < 0.0001 &&
          b.vy - slope * b.vz <= 0.2;
      if (grounded) {
        b.vz -= ((((GRAVITY * 5) / 7) * slope) / (1 + slope * slope)) * h;
        rollingResistance(b, support.rollingResistance ?? 0.65, h);
        b.vy = slope * b.vz;
      } else {
        const drag = Math.exp(-0.04 * h);
        b.vx *= drag;
        b.vz *= drag;
        b.vy -= GRAVITY * h;
      }
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.z += b.vz * h;
    }
    for (let iteration = 0; iteration < 12; iteration++) {
      for (let i = 0; i < ordered.length; i++)
        if (!held.has(ordered[i].id))
          constrainToy(
            map,
            bodies[ordered[i].id],
            ordered[i],
            previousY[i],
            items,
            catalog,
            iteration === 0,
            colliders,
          );
      for (let i = 0; i < ordered.length; i++)
        for (let j = i + 1; j < ordered.length; j++)
          sphereContact(
            bodies[ordered[i].id],
            ordered[i],
            bodies[ordered[j].id],
            ordered[j],
            iteration === 0,
            held,
          );
    }
    // End with immutable terrain constraints: no pair may leave a ball inside a wall/slab.
    for (let i = 0; i < ordered.length; i++) {
      const toy = ordered[i],
        b = bodies[toy.id];
      if (held.has(toy.id)) continue;
      constrainToy(map, b, toy, previousY[i], items, catalog, false, colliders);
      if (b.y < -8) Object.assign(b, bodyAt(toy.home));
    }
    settleSupports(
      map,
      bodies,
      ordered.filter((toy) => !held.has(toy.id)),
    );
    // A propagated support reaction may also meet a nearby wall or ceiling.
    for (let i = 0; i < ordered.length; i++)
      if (!held.has(ordered[i].id))
        constrainToy(
          map,
          bodies[ordered[i].id],
          ordered[i],
          previousY[i],
          items,
          catalog,
          false,
          colliders,
        );
  }
  // Captured trajectories are driven by the mechanism, not momentum. Keep
  // checkpoint velocities at rest; substeps above used the actual sweep velocity.
  for (const id of held) {
    const b = bodies[id];
    if (b) b.vx = b.vy = b.vz = 0;
  }
}

export function advanceToy(
  map: WorldMap,
  body: Body,
  toy: Toy,
  dt: number,
  items: Placement[],
  catalog: ItemType[],
) {
  advanceToys(map, { [toy.id]: body }, [toy], dt, items, catalog);
}
