import { exactObject, type ObjectBehavior } from "./world-objects.js";
/** Transient shared switch; renderer decides whether this powers a lamp or another prop. */
export const switchBehavior: ObjectBehavior = {
  id: "switch",
  version: 1,
  interactions: ["toggle"],
  validateConfig(config) {
    if (
      !exactObject(config, ["initialOn"]) ||
      typeof (config as any).initialOn !== "boolean"
    )
      throw Error("Invalid switch configuration");
  },
  initialState(object) {
    return {
      on: (object.config as { initialOn: boolean }).initialOn,
      changedTick: 0,
    };
  },
  validState(state, _object, _map, tick) {
    return (
      exactObject(state, ["on", "changedTick"]) &&
      typeof (state as any).on === "boolean" &&
      Number.isSafeInteger((state as any).changedTick) &&
      (state as any).changedTick >= 0 &&
      (state as any).changedTick <= tick
    );
  },
  validEvent: () => false,
  step() {},
  interact(value, _action, _session, tick) {
    const state = value as { on: boolean; changedTick: number };
    if (state.changedTick && tick - state.changedTick < 9) return;
    state.on = !state.on;
    state.changedTick = tick;
  },
};
