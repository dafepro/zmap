import type { Body, Simulation, Vec3 } from "./core.js";
export function rollingMotion(previous: Vec3, next: Vec3, radius: number) {
  const dx = next.x - previous.x,
    dz = next.z - previous.z,
    distance = Math.hypot(dx, dz);
  return {
    axis: {
      x: distance ? dz / distance : 0,
      y: 0,
      z: distance ? -dx / distance : 0,
    },
    angle: distance / radius,
  };
}
function mixBody(a: Body, b: Body, alpha: number): Body {
  if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 3) return { ...b };
  const mix = (x: number, y: number) => x + (y - x) * alpha;
  const angle = Math.atan2(
    Math.sin(b.facing - a.facing),
    Math.cos(b.facing - a.facing),
  );
  return {
    x: mix(a.x, b.x),
    y: mix(a.y, b.y),
    z: mix(a.z, b.z),
    vx: mix(a.vx, b.vx),
    vy: mix(a.vy, b.vy),
    vz: mix(a.vz, b.vz),
    facing: a.facing + angle * alpha,
    gesture: mix(a.gesture, b.gesture),
  };
}
/** Bounded display-only interpolation. Never feed delayed poses back into simulation or durable writes. */
export class SnapshotPresentation {
  private frames: { time: number; state: Simulation }[] = [];
  reset() {
    this.frames = [];
  }
  push(state: Simulation, time: number) {
    this.frames.push({ time, state });
    if (this.frames.length > 8) this.frames.shift();
  }
  sample(now: number, delayMs = 80): Simulation | undefined {
    if (!this.frames.length) return;
    const target = now - delayMs;
    let a = this.frames[0],
      b = a;
    for (const f of this.frames) {
      if (f.time <= target) a = f;
      if (f.time >= target) {
        b = f;
        break;
      }
      b = f;
    }
    if (a === b || b.time <= a.time) return a.state;
    const alpha = Math.max(
      0,
      Math.min(1, (target - a.time) / (b.time - a.time)),
    );
    const interpolate = (
      left: Record<string, Body>,
      right: Record<string, Body>,
    ) =>
      Object.fromEntries(
        Object.entries(right).map(([id, body]) => [
          id,
          left[id] ? mixBody(left[id], body, alpha) : { ...body },
        ]),
      );
    return {
      tick: a.state.tick,
      players: interpolate(a.state.players, b.state.players),
      toys: interpolate(a.state.toys, b.state.toys),
      triggers: { ...a.state.triggers },
    };
  }
}
