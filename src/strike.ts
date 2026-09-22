import type { Body, Vec3 } from "./core.js";

export type StrikeProfile = { speed: number; closeLift: number };
export type StrikeKind = "ground" | "header" | "bicycle";
export type StrikeState = {
  toy: string;
  kind: StrikeKind;
  /** Sphere centre in world metres; the rig can aim its head or boot here. */
  target: Vec3;
  /** Committed physical apex above the player's supporting surface. */
  jumpHeight: number;
};

const GRAVITY = 18;
const HEAD_HEIGHT = 1.55;
const OVERHEAD_FOOT_HEIGHT = 2.15;
const CLOSE = 0.65;
const FAR = 1.3;

function kindAt(height: number): StrikeKind | undefined {
  if (height <= 1) return "ground";
  if (height <= 2.35) return "header";
  if (height <= 3.2) return "bicycle";
}
export function anticipateStrike(
  player: Body,
  ball: Body,
  toy: string,
  radius: number,
  ground: number,
  untilContact: number,
): StrikeState | undefined {
  const future = Math.max(0, untilContact);
  const target = {
    x: ball.x + ball.vx * future,
    y:
      Math.max(
        ground,
        ball.y + ball.vy * future - (GRAVITY / 2) * future ** 2,
      ) + radius,
    z: ball.z + ball.vz * future,
  };
  const distance = Math.hypot(
    target.x - player.x - player.vx * future,
    target.z - player.z - player.vz * future,
  );
  const kind = kindAt(target.y - ground);
  if (!kind || distance > (kind === "ground" ? 1.65 : 1.1)) return;
  return {
    toy,
    kind,
    target,
    jumpHeight: kind === "ground" ? 0 : kind === "header" ? 0.44 : 0.69,
  };
}

export function resolveStrike(
  player: Body,
  ball: Body,
  radius: number,
  ground: number,
  profile: StrikeProfile,
  attempt: StrikeState | undefined,
): { kind: StrikeKind; target: Vec3; velocity: Vec3 } | undefined {
  const target = { x: ball.x, y: ball.y + radius, z: ball.z };
  const kind = kindAt(target.y - ground);
  if (!kind) return;
  const dx = ball.x - player.x,
    dz = ball.z - player.z;
  const distance = Math.hypot(dx, dz);
  const aerial = kind !== "ground";
  if (distance > (aerial ? 1.1 : 1.65)) return;
  if (aerial) {
    if (!attempt?.jumpHeight || player.y - ground < 0.12) return;
    const strikingHeight =
      player.y + (kind === "header" ? HEAD_HEIGHT : OVERHEAD_FOOT_HEIGHT);
    if (Math.abs(target.y - strikingHeight) > (kind === "header" ? 0.55 : 0.5))
      return;
  } else if (player.y - ground > 0.55 || ball.y - ground > 0.8) return;
  const direction =
    distance > 0.1
      ? { x: dx / distance, z: dz / distance }
      : { x: Math.sin(player.facing), z: Math.cos(player.facing) };
  const speed =
    kind === "header"
      ? profile.speed * 0.82
      : kind === "bicycle"
        ? profile.speed * 1.15
        : profile.speed;
  const closeness = Math.max(0, Math.min(1, (FAR - distance) / (FAR - CLOSE)));
  const lift =
    kind === "header"
      ? 2.2
      : kind === "bicycle"
        ? 4.2
        : 0.25 + closeness * (profile.closeLift - 0.25);
  return {
    kind,
    target,
    velocity: { x: direction.x * speed, y: lift, z: direction.z * speed },
  };
}
