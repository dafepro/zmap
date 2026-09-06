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
  type WorldMap,
} from "./core.js";
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
export function advanceToy(
  map: WorldMap,
  body: Body,
  toy: Toy,
  dt: number,
  items: Placement[],
  catalog: ItemType[],
) {
  if (!validVec(body) || body.y < -8) {
    Object.assign(body, bodyAt(toy.home));
    return;
  }
  const restitution = toy.restitution ?? 0.65;
  // Travel less than a fraction of a radius per contact solve, including very thin obstacles.
  const count = Math.max(
    1,
    Math.ceil(
      (Math.hypot(body.vx, body.vy, body.vz) * dt) / (toy.radius * 0.3),
    ),
  );
  const h = dt / count,
    diameter = toy.radius * 2;
  for (let i = 0; i < count; i++) {
    const oldY = body.y;
    const previous = supportAt(map, body.x, body.z, oldY + 0.025);
    const slope = previous?.slope ?? 0;
    const grounded =
      !!previous &&
      Math.abs(oldY - top(previous, body.z)) < 0.025 &&
      body.vy - slope * body.vz <= 0.2;
    if (grounded) {
      body.vz -= ((((GRAVITY * 5) / 7) * slope) / (1 + slope * slope)) * h;
      rollingResistance(body, previous.rollingResistance ?? 0.65, h);
      body.vy = slope * body.vz;
    } else {
      const drag = Math.exp(-0.04 * h);
      body.vx *= drag;
      body.vz *= drag;
      body.vy -= GRAVITY * h;
    }
    body.x += body.vx * h;
    body.z += body.vz * h;
    body.y += body.vy * h;
    const bounds = map.bounds,
      r = toy.radius;
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
    if (body.vy > 0)
      for (const surface of map.surfaces) {
        const bottom = top(surface, body.z) - surface.thickness;
        if (
          inside(surface, body.x, body.z) &&
          oldY + diameter <= bottom + 0.01 &&
          body.y + diameter >= bottom
        ) {
          body.y = bottom - diameter;
          body.vy = -Math.abs(body.vy) * restitution;
        }
      }
    const support = supportAt(
      map,
      body.x,
      body.z,
      Math.max(oldY, body.y) + 0.08,
    );
    if (
      support &&
      (body.y <= top(support, body.z) ||
        (grounded && Math.abs(body.y - top(support, body.z)) < 0.1))
    ) {
      body.y = top(support, body.z);
      const slope = support.slope ?? 0,
        n = Math.hypot(1, slope),
        impact = (body.vy - slope * body.vz) / n;
      if (!grounded && impact < -1.4) {
        body.vy -= ((1 + restitution) * impact) / n;
        body.vz += ((1 + restitution) * impact * slope) / n;
      } else body.vy = slope * body.vz;
    }
    if (body.y < -8) {
      Object.assign(body, bodyAt(toy.home));
      break;
    }
  }
}
