import {
  finite,
  inside,
  validVec,
  type ItemType,
  type Placement,
  type Simulation,
  type Vec3,
  type WorldMap,
} from "./core.js";

/** Content is data. Executable behavior implementations are installed by the app,
 * on both the client and the room service, never received from another browser. */
export type ObjectValue =
  | null
  | boolean
  | number
  | string
  | ObjectValue[]
  | { [key: string]: ObjectValue };
export type ObjectCollider = { center: Vec3; size: Vec3 };
export type WorldObject = {
  id: string;
  behavior: string;
  version: number;
  position: Vec3;
  rotation: number;
  config: ObjectValue;
  /** Local boxes affect balls only. Avatar navigation and collisions ignore them. */
  toyColliders?: ObjectCollider[];
};
export type ObjectEvent = {
  id: number;
  tick: number;
  object: string;
  kind: string;
  data: ObjectValue;
};
export type WorldObjectState = {
  version: 1;
  eventSequence: number;
  instances: Record<string, ObjectValue>;
  events: ObjectEvent[];
};
export type ObjectBehaviorContext = {
  object: WorldObject;
  state: ObjectValue;
  map: WorldMap;
  simulation: Simulation;
  items: Placement[];
  catalog: ItemType[];
  /** A captured toy stays in pair contacts but has infinite mass for this step. */
  holdToy(id: string, target?: Vec3): boolean;
  toyHeld(id: string): boolean;
  emit(kind: string, data: ObjectValue): void;
};
export type ObjectBehavior = {
  id: string;
  version: number;
  validateConfig(config: ObjectValue, object: WorldObject, map: WorldMap): void;
  initialState(object: WorldObject): ObjectValue;
  validState(
    state: ObjectValue,
    object: WorldObject,
    map: WorldMap,
    tick: number,
  ): boolean;
  /** Events must be safe for the consuming renderer, not just bounded JSON. */
  validEvent(event: ObjectEvent, object: WorldObject, map: WorldMap): boolean;
  /** One deterministic fixed step. No wall clock, random source, sockets, or renderer. */
  step(context: ObjectBehaviorContext): void;
};
export type ObjectBehaviors = readonly ObjectBehavior[];
export type WorldToyCollider = ObjectCollider & { rotation: number };
const ID = /^[a-zA-Z0-9_-]{1,80}$/;
export const objectId = (value: unknown): value is string =>
  typeof value === "string" &&
  ID.test(value) &&
  !["__proto__", "constructor", "prototype"].includes(value);
export const objectRecord = (
  value: unknown,
): value is Record<string, ObjectValue> =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);
export function exactObject(value: unknown, keys: string[]) {
  return (
    objectRecord(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
export function boundedObjectValue(
  value: unknown,
  budget = 16384,
): value is ObjectValue {
  let count = 0;
  const visit = (entry: unknown, depth: number): boolean => {
    if (++count > 2048 || depth > 8) return false;
    if (entry === null || typeof entry === "boolean") return true;
    if (typeof entry === "number")
      return (
        Number.isFinite(entry) && Math.abs(entry) <= Number.MAX_SAFE_INTEGER
      );
    if (typeof entry === "string") return entry.length <= 256;
    if (Array.isArray(entry))
      return (
        entry.length <= 128 && entry.every((item) => visit(item, depth + 1))
      );
    return (
      objectRecord(entry) &&
      Object.keys(entry).length <= 80 &&
      Object.entries(entry).every(
        ([key, item]) => objectId(key) && visit(item, depth + 1),
      )
    );
  };
  if (!visit(value, 0)) return false;
  return new TextEncoder().encode(JSON.stringify(value)).byteLength <= budget;
}
function implementation(
  object: WorldObject,
  behaviors: ObjectBehaviors,
): ObjectBehavior {
  if (!Array.isArray(behaviors))
    throw Error("World-object behaviors must be an array");
  const found = behaviors.filter(
    (behavior) =>
      behavior?.id === object.behavior && behavior.version === object.version,
  );
  if (found.length !== 1)
    throw Error(
      `Install exactly one ${object.behavior}@${object.version} world-object behavior`,
    );
  for (const hook of [
    "validateConfig",
    "initialState",
    "validState",
    "validEvent",
    "step",
  ] as const)
    if (typeof found[0][hook] !== "function")
      throw Error(
        `World-object behavior ${object.behavior}@${object.version} requires ${hook}()`,
      );
  return found[0];
}
/** Y-up transform; local +Z is forward, consistent with player facing. */
export function objectPoint(
  object: Pick<WorldObject, "position" | "rotation">,
  local: Vec3,
): Vec3 {
  const s = Math.sin(object.rotation),
    c = Math.cos(object.rotation);
  return {
    x: object.position.x + local.x * c + local.z * s,
    y: object.position.y + local.y,
    z: object.position.z - local.x * s + local.z * c,
  };
}
export function objectLocalPoint(
  object: Pick<WorldObject, "position" | "rotation">,
  point: Vec3,
): Vec3 {
  const x = point.x - object.position.x,
    z = point.z - object.position.z,
    s = Math.sin(object.rotation),
    c = Math.cos(object.rotation);
  return { x: x * c - z * s, y: point.y - object.position.y, z: x * s + z * c };
}
export function validateWorldObjects(
  map: WorldMap,
  behaviors: ObjectBehaviors = [],
) {
  if (map.objects === undefined) return;
  if (!Array.isArray(map.objects) || map.objects.length > 5)
    throw Error("At most five active world objects are supported");
  const ids = new Set<string>([
    ...map.toys.map((toy) => toy.id),
    ...map.triggers.map((trigger) => trigger.id),
    ...map.surfaces.map((surface) => surface.id),
  ]);
  for (const object of map.objects) {
    if (
      !exactObject(object, [
        "id",
        "behavior",
        "version",
        "position",
        "rotation",
        "config",
        ...(object.toyColliders === undefined ? [] : ["toyColliders"]),
      ]) ||
      !objectId(object.id) ||
      ids.has(object.id) ||
      !objectId(object.behavior) ||
      !Number.isSafeInteger(object.version) ||
      object.version < 1 ||
      !validVec(object.position) ||
      !inside(map.bounds, object.position.x, object.position.z) ||
      !finite(object.rotation) ||
      !boundedObjectValue(object.config, 2048)
    )
      throw Error("Invalid world object");
    if (
      object.toyColliders !== undefined &&
      (!Array.isArray(object.toyColliders) ||
        object.toyColliders.length > 8 ||
        object.toyColliders.some(
          (collider) =>
            !exactObject(collider, ["center", "size"]) ||
            !validVec(collider.center) ||
            !validVec(collider.size) ||
            Object.values(collider.size).some((n) => n <= 0 || n > 8) ||
            Object.values(collider.center).some((n) => Math.abs(n) > 8),
        ))
    )
      throw Error("Invalid world object toy colliders");
    implementation(object, behaviors).validateConfig(
      object.config,
      object,
      map,
    );
    ids.add(object.id);
  }
}
export function initialWorldObjects(
  map: WorldMap,
  behaviors: ObjectBehaviors = [],
): WorldObjectState | undefined {
  if (!map.objects) return;
  const state: WorldObjectState = {
    version: 1,
    eventSequence: 0,
    instances: Object.fromEntries(
      map.objects.map((object) => [
        object.id,
        implementation(object, behaviors).initialState(object),
      ]),
    ),
    events: [],
  };
  if (!validWorldObjectState(state, map, 0, behaviors))
    throw Error("Invalid initial world-object state");
  return state;
}
export function validWorldObjectState(
  value: unknown,
  map: WorldMap,
  currentTick: number,
  behaviors: ObjectBehaviors = [],
): value is WorldObjectState | undefined {
  if (!map.objects) return value === undefined;
  if (
    !exactObject(value, ["version", "eventSequence", "instances", "events"]) ||
    !boundedObjectValue(value)
  )
    return false;
  const state = value as WorldObjectState;
  if (
    state.version !== 1 ||
    !Number.isSafeInteger(state.eventSequence) ||
    state.eventSequence < 0 ||
    !objectRecord(state.instances) ||
    Object.keys(state.instances).length !== map.objects.length ||
    !Array.isArray(state.events) ||
    state.events.length > 32
  )
    return false;
  if (
    !map.objects.every(
      (object) =>
        Object.hasOwn(state.instances, object.id) &&
        implementation(object, behaviors).validState(
          state.instances[object.id],
          object,
          map,
          currentTick,
        ),
    )
  )
    return false;
  let previous = 0;
  return state.events.every((event) => {
    if (
      !exactObject(event, ["id", "tick", "object", "kind", "data"]) ||
      !Number.isSafeInteger(event.id) ||
      event.id <= previous ||
      event.id > state.eventSequence ||
      !Number.isSafeInteger(event.tick) ||
      event.tick < 0 ||
      event.tick > currentTick ||
      !map.objects!.some((object) => object.id === event.object) ||
      !objectId(event.kind) ||
      !boundedObjectValue(event.data, 512) ||
      !implementation(
        map.objects!.find((object) => object.id === event.object)!,
        behaviors,
      ).validEvent(
        event,
        map.objects!.find((object) => object.id === event.object)!,
        map,
      )
    )
      return false;
    previous = event.id;
    return true;
  });
}
export function stepWorldObjects(
  map: WorldMap,
  simulation: Simulation,
  behaviors: ObjectBehaviors,
  items: Placement[],
  catalog: ItemType[],
) {
  const held = new Set<string>(),
    targets = new Map<string, Vec3>(),
    state = simulation.objects;
  if (!state || !map.objects) return { held, targets };
  for (const object of [...map.objects].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )) {
    implementation(object, behaviors).step({
      object,
      state: state.instances[object.id],
      map,
      simulation,
      items,
      catalog,
      holdToy(id, target) {
        if (held.has(id) || !Object.hasOwn(simulation.toys, id)) return false;
        if (target && !validVec(target))
          throw Error("Invalid kinematic toy target");
        held.add(id);
        const body = target ?? simulation.toys[id];
        targets.set(id, { x: body.x, y: body.y, z: body.z });
        return true;
      },
      toyHeld: (id) => held.has(id),
      emit(kind, data) {
        if (
          !objectId(kind) ||
          !boundedObjectValue(data, 512) ||
          state.eventSequence >= Number.MAX_SAFE_INTEGER
        )
          throw Error("Invalid world object event");
        const event: ObjectEvent = {
          id: state.eventSequence + 1,
          tick: simulation.tick,
          object: object.id,
          kind,
          data: structuredClone(data),
        };
        if (!implementation(object, behaviors).validEvent(event, object, map))
          throw Error("Invalid world object event data");
        state.eventSequence++;
        state.events.push(event);
        if (state.events.length > 32) state.events.shift();
      },
    });
  }
  state.events = state.events.filter(
    (event) => simulation.tick - event.tick <= 120,
  );
  return { held, targets };
}
export function worldToyColliders(map: WorldMap): WorldToyCollider[] {
  return (map.objects ?? []).flatMap((object) =>
    (object.toyColliders ?? []).map((collider) => ({
      center: objectPoint(object, collider.center),
      size: collider.size,
      rotation: object.rotation,
    })),
  );
}
