import {
  inside,
  validVec,
  type Body,
  type Vec3,
  type WorldMap,
} from "./core.js";
import { spherePathClear } from "./sphere-clearance.js";
import {
  exactObject,
  objectId,
  objectLocalPoint,
  objectPoint,
  objectRecord,
  type ObjectBehavior,
  type ObjectValue,
  type WorldObject,
} from "./world-objects.js";

/** A passive ball recycler. App-approved toy IDs replace Zoomigo inventory tags. */
export type CannonConfig = {
  acceptedToys: string[];
  intake: Vec3;
  intakeSize: Vec3;
  muzzle: Vec3;
  fuseTicks: number;
  cooldownTicks: number;
  speed: number;
};
export type CannonBallState = {
  phase: "fuse" | "cooldown";
  startedTick: number;
  untilTick: number;
  position: Vec3;
};
export type CannonState = { balls: Record<string, CannonBallState> };
export const CANNON_LOADING_TICKS = 12;
/** Deterministic 3D loading: withdraw, lift/center behind the lip, then feed into
 * the bore. The checkpoint records only the initial capture pose and start tick. */
export function cannonLoadingPosition(
  object: WorldObject,
  ball: CannonBallState,
  radius: number,
  currentTick: number,
): Vec3 {
  const config = object.config as unknown as CannonConfig;
  const start = objectLocalPoint(object, {
    x: ball.position.x,
    y: ball.position.y + radius,
    z: ball.position.z,
  });
  const duration = Math.min(CANNON_LOADING_TICKS, config.fuseTicks - 1);
  const progress = Math.max(
    0,
    Math.min(1, (currentTick - ball.startedTick) / duration),
  );
  const back = {
    ...start,
    z: Math.min(start.z, config.intake.z - 0.16 - radius - 0.04),
  };
  const lifted = { x: config.intake.x, y: config.intake.y, z: back.z };
  const seated = {
    x: config.intake.x,
    y: config.intake.y,
    z: config.intake.z + 0.42,
  };
  const mix = (a: Vec3, b: Vec3, t: number) => {
    const u = t * t * (3 - 2 * t);
    return {
      x: a.x + (b.x - a.x) * u,
      y: a.y + (b.y - a.y) * u,
      z: a.z + (b.z - a.z) * u,
    };
  };
  const local =
    progress < 1 / 6
      ? mix(start, back, progress * 6)
      : progress < 0.5
        ? mix(back, lifted, (progress - 1 / 6) * 3)
        : mix(lifted, seated, (progress - 0.5) * 2);
  const center = objectPoint(object, local);
  return { x: center.x, y: center.y - radius, z: center.z };
}
export function cannonConfig(acceptedToys: string[]): CannonConfig {
  return {
    acceptedToys,
    intake: { x: 0, y: 0.85, z: -1.12 },
    intakeSize: { x: 0.76, y: 1.2, z: 0.5 },
    muzzle: { x: 0, y: 0.85, z: 1.32 },
    fuseTicks: 24,
    cooldownTicks: 23,
    speed: 14,
  };
}
function tick(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
function contains(
  config: CannonConfig,
  object: WorldObject,
  body: Body,
  radius: number,
) {
  const local = objectLocalPoint(object, {
    x: body.x,
    y: body.y + radius,
    z: body.z,
  });
  return distanceFromIntake(config, local) <= radius * radius + 1e-8;
}
function distanceFromIntake(config: CannonConfig, local: Vec3) {
  return (["x", "y", "z"] as const).reduce(
    (sum, axis) =>
      sum +
      Math.max(
        0,
        Math.abs(local[axis] - config.intake[axis]) -
          config.intakeSize[axis] / 2,
      ) **
        2,
    0,
  );
}
/** Segment entry catches a kicked ball that crosses a narrow intake in one 30Hz step. */
function intakeContact(
  config: CannonConfig,
  object: WorldObject,
  body: Body,
  radius: number,
) {
  if (contains(config, object, body, radius))
    return { x: body.x, y: body.y, z: body.z };
  const start = objectLocalPoint(object, {
    x: body.x,
    y: body.y + radius,
    z: body.z,
  });
  const end = objectLocalPoint(object, {
    x: body.x + body.vx / 30,
    y: body.y + radius + body.vy / 30,
    z: body.z + body.vz / 30,
  });
  let enter = 0,
    exit = 1;
  for (const axis of ["x", "y", "z"] as const) {
    const delta = end[axis] - start[axis],
      min = config.intake[axis] - config.intakeSize[axis] / 2 - radius,
      max = config.intake[axis] + config.intakeSize[axis] / 2 + radius;
    if (Math.abs(delta) < 1e-9) {
      if (start[axis] < min || start[axis] > max) return;
    } else {
      const a = (min - start[axis]) / delta,
        b = (max - start[axis]) / delta;
      enter = Math.max(enter, Math.min(a, b));
      exit = Math.min(exit, Math.max(a, b));
    }
    if (enter > exit) return;
  }
  // A sphere does not occupy the expanded box's square corners. Distance to an
  // AABB is convex along the segment; find its minimum then the first contact.
  const at = (t: number) => ({
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
    z: start.z + (end.z - start.z) * t,
  });
  let lo = enter,
    hi = exit;
  for (let i = 0; i < 24; i++) {
    const a = lo + (hi - lo) / 3,
      b = hi - (hi - lo) / 3;
    if (distanceFromIntake(config, at(a)) < distanceFromIntake(config, at(b)))
      hi = b;
    else lo = a;
  }
  let contact = (lo + hi) / 2;
  if (distanceFromIntake(config, at(contact)) > radius * radius + 1e-8) return;
  lo = enter;
  hi = contact;
  for (let i = 0; i < 24; i++) {
    contact = (lo + hi) / 2;
    if (distanceFromIntake(config, at(contact)) > radius * radius) lo = contact;
    else hi = contact;
  }
  return {
    x: body.x + (body.vx * hi) / 30,
    y: body.y + (body.vy * hi) / 30,
    z: body.z + (body.vz * hi) / 30,
  };
}
function validPosition(position: unknown, map: WorldMap) {
  return (
    validVec(position) &&
    inside(map.bounds, position.x, position.z) &&
    position.y >= -8 &&
    position.y <= 30
  );
}
function loadingBoundsSafe(
  config: CannonConfig,
  object: WorldObject,
  map: WorldMap,
) {
  const radius = Math.max(
    ...map.toys
      .filter((toy) => config.acceptedToys.includes(toy.id))
      .map((toy) => toy.radius),
  );
  const minZ = Math.min(
    config.intake.z - config.intakeSize.z / 2 - radius,
    config.intake.z - 0.2 - radius,
  );
  const maxZ = Math.max(
    config.intake.z + config.intakeSize.z / 2 + radius,
    config.intake.z + 0.42,
  );
  const points = [objectPoint(object, config.muzzle)];
  for (const sign of [-1, 1])
    for (const z of [minZ, maxZ])
      points.push(
        objectPoint(object, {
          x: config.intake.x + sign * (config.intakeSize.x / 2 + radius),
          y: config.intake.y,
          z,
        }),
      );
  return points.every((point) => inside(map.bounds, point.x, point.z, radius));
}
export const cannonBehavior: ObjectBehavior = {
  id: "cannon",
  version: 1,
  validateConfig(value, object, map) {
    if (
      !exactObject(value, [
        "acceptedToys",
        "intake",
        "intakeSize",
        "muzzle",
        "fuseTicks",
        "cooldownTicks",
        "speed",
      ])
    )
      throw Error("Invalid cannon config");
    const config = value as unknown as CannonConfig;
    if (
      !Array.isArray(config.acceptedToys) ||
      !config.acceptedToys.length ||
      config.acceptedToys.length > 5 ||
      new Set(config.acceptedToys).size !== config.acceptedToys.length ||
      !config.acceptedToys.every(
        (id) => objectId(id) && map.toys.some((toy) => toy.id === id),
      ) ||
      !validVec(config.intake) ||
      !validVec(config.intakeSize) ||
      !validVec(config.muzzle) ||
      Object.values(config.intakeSize).some((n) => n <= 0 || n > 3) ||
      [...Object.values(config.intake), ...Object.values(config.muzzle)].some(
        (n) => Math.abs(n) > 4,
      ) ||
      !tick(config.fuseTicks) ||
      config.fuseTicks < 6 ||
      config.fuseTicks > 180 ||
      !tick(config.cooldownTicks) ||
      config.cooldownTicks < 6 ||
      config.cooldownTicks > 300 ||
      !Number.isFinite(config.speed) ||
      config.speed < 1 ||
      config.speed > 20 ||
      config.muzzle.z <= config.intake.z ||
      !validPosition(objectPoint(object, config.intake), map) ||
      !validPosition(objectPoint(object, config.muzzle), map) ||
      !loadingBoundsSafe(config, object, map)
    )
      throw Error("Invalid cannon limits or toy references");
  },
  initialState: () => ({ balls: {} }),
  validState(value, object, map, currentTick) {
    if (!exactObject(value, ["balls"]) || !objectRecord((value as any).balls))
      return false;
    const state = value as unknown as CannonState,
      config = object.config as unknown as CannonConfig;
    if (
      Object.keys(state.balls).length > config.acceptedToys.length ||
      Object.values(state.balls).some((ball) => !objectRecord(ball)) ||
      Object.values(state.balls).filter((ball) => ball.phase === "fuse")
        .length > 1
    )
      return false;
    return Object.entries(state.balls).every(
      ([id, ball]) =>
        config.acceptedToys.includes(id) &&
        exactObject(ball, ["phase", "startedTick", "untilTick", "position"]) &&
        ["fuse", "cooldown"].includes(ball.phase) &&
        tick(ball.startedTick) &&
        ball.startedTick <= currentTick &&
        tick(ball.untilTick) &&
        ball.untilTick - ball.startedTick ===
          (ball.phase === "fuse" ? config.fuseTicks : config.cooldownTicks) &&
        ball.untilTick >= currentTick &&
        validPosition(ball.position, map) &&
        (ball.phase !== "fuse" ||
          contains(
            config,
            object,
            { ...ball.position, vx: 0, vy: 0, vz: 0, gesture: 0, facing: 0 },
            map.toys.find((toy) => toy.id === id)!.radius,
          )),
    );
  },
  validEvent(event, object, map) {
    const config = object.config as unknown as CannonConfig;
    const data = event.data;
    if (
      !["fuse", "fire", "cancel", "blocked"].includes(event.kind) ||
      !exactObject(data, [
        "toy",
        "position",
        ...(event.kind === "fire" ? ["velocity"] : []),
      ])
    )
      return false;
    const value = data as unknown as {
      toy: string;
      position: Vec3;
      velocity?: Vec3;
    };
    if (
      !config.acceptedToys.includes(value.toy) ||
      !exactObject(value.position, ["x", "y", "z"]) ||
      !validPosition(value.position, map)
    )
      return false;
    if (event.kind !== "fire") return true;
    const muzzle = objectPoint(object, config.muzzle),
      velocity = value.velocity;
    return (
      exactObject(velocity, ["x", "y", "z"]) &&
      validVec(velocity) &&
      Math.hypot(
        value.position.x - muzzle.x,
        value.position.y - muzzle.y,
        value.position.z - muzzle.z,
      ) < 1e-6 &&
      Math.abs(velocity.x - Math.sin(object.rotation) * config.speed) < 1e-6 &&
      Math.abs(velocity.y) < 1e-6 &&
      Math.abs(velocity.z - Math.cos(object.rotation) * config.speed) < 1e-6
    );
  },
  step(context) {
    const { object, simulation, map } = context,
      config = object.config as unknown as CannonConfig,
      state = context.state as unknown as CannonState;
    for (const id of [...config.acceptedToys].sort()) {
      const body = simulation.toys[id],
        toy = map.toys.find((toy) => toy.id === id)!;
      let ball: CannonBallState | undefined = state.balls[id];
      if (!body) {
        delete state.balls[id];
        continue;
      }
      if (ball?.phase === "cooldown") {
        if (simulation.tick < ball.untilTick) continue;
        delete state.balls[id];
        ball = undefined;
      }
      if (ball?.phase === "fuse") {
        // Mechanism motion is expected; an external displacement breaks ownership.
        const expected = cannonLoadingPosition(
          object,
          ball,
          toy.radius,
          simulation.tick - 1,
        );
        if (
          Math.hypot(
            body.x - expected.x,
            body.y - expected.y,
            body.z - expected.z,
          ) > 0.02 ||
          context.toyHeld(id)
        ) {
          context.emit("cancel", {
            toy: id,
            position: { x: body.x, y: body.y, z: body.z },
          });
          delete state.balls[id];
          continue;
        }
        if (simulation.tick >= ball.untilTick) {
          const muzzle = objectPoint(object, config.muzzle),
            destination = {
              x: muzzle.x,
              y: muzzle.y - toy.radius,
              z: muzzle.z,
            };
          // An obstructed outlet must not teleport a toy through a wall or over the map edge.
          const outlet = objectPoint(object, {
            ...config.muzzle,
            z: config.muzzle.z + toy.radius + 0.08,
          });
          const outletClear = spherePathClear(
            map,
            muzzle,
            outlet,
            toy.radius,
            context.items,
            context.catalog,
          );
          if (
            !inside(map.bounds, destination.x, destination.z, toy.radius) ||
            !outletClear
          ) {
            context.emit("blocked", { toy: id, position: muzzle });
            state.balls[id] = {
              phase: "cooldown",
              startedTick: simulation.tick,
              untilTick: simulation.tick + config.cooldownTicks,
              position: { x: body.x, y: body.y, z: body.z },
            };
            continue;
          }
          Object.assign(body, destination, {
            vx: Math.sin(object.rotation) * config.speed,
            vy: 0,
            vz: Math.cos(object.rotation) * config.speed,
            teleportEpoch: (body.teleportEpoch ?? 0) + 1,
          });
          state.balls[id] = {
            phase: "cooldown",
            startedTick: simulation.tick,
            untilTick: simulation.tick + config.cooldownTicks,
            position: destination,
          };
          context.emit("fire", {
            toy: id,
            position: muzzle,
            velocity: { x: body.vx, y: body.vy, z: body.vz },
          });
          continue;
        }
        const target = cannonLoadingPosition(
          object,
          ball,
          toy.radius,
          simulation.tick,
        );
        if (
          !spherePathClear(
            map,
            { x: body.x, y: body.y + toy.radius, z: body.z },
            { x: target.x, y: target.y + toy.radius, z: target.z },
            toy.radius,
            context.items,
            context.catalog,
          )
        ) {
          context.emit("blocked", {
            toy: id,
            position: { x: body.x, y: body.y, z: body.z },
          });
          state.balls[id] = {
            phase: "cooldown",
            startedTick: simulation.tick,
            untilTick: simulation.tick + config.cooldownTicks,
            position: { x: body.x, y: body.y, z: body.z },
          };
          continue;
        }
        context.holdToy(id, target);
        continue;
      }
      if (context.toyHeld(id)) continue;
      if (Object.values(state.balls).some((ball) => ball.phase === "fuse"))
        continue;
      const position = intakeContact(config, object, body, toy.radius);
      if (
        !position ||
        !spherePathClear(
          map,
          { x: body.x, y: body.y + toy.radius, z: body.z },
          { x: position.x, y: position.y + toy.radius, z: position.z },
          toy.radius,
          context.items,
          context.catalog,
        )
      )
        continue;
      if (!context.holdToy(id, position)) continue;
      state.balls[id] = {
        phase: "fuse",
        startedTick: simulation.tick,
        untilTick: simulation.tick + config.fuseTicks,
        position,
      };
      context.emit("fuse", { toy: id, position });
    }
  },
};

/** Versioned, app-owned instance. Adjust sockets to the authored model, not the renderer. */
export function cannonObject(
  id: string,
  position: Vec3,
  rotation: number,
  acceptedToys: string[],
): WorldObject {
  return {
    id,
    behavior: cannonBehavior.id,
    version: cannonBehavior.version,
    position,
    rotation,
    config: cannonConfig(acceptedToys) as unknown as ObjectValue,
    playerColliders: [
      { center: { x: 0, y: 0.9, z: 0 }, size: { x: 1.85, y: 1.8, z: 2.25 } },
    ],
    toyColliders: [
      {
        center: { x: -0.7, y: 0.36, z: 0.18 },
        size: { x: 0.25, y: 0.72, z: 0.72 },
      },
      {
        center: { x: 0.7, y: 0.36, z: 0.18 },
        size: { x: 0.25, y: 0.72, z: 0.72 },
      },
      { center: { x: 0, y: 0.5, z: 0.68 }, size: { x: 0.95, y: 1, z: 0.3 } },
    ],
  };
}
