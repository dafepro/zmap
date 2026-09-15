import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";

const fixture =
  "/@fs" +
  fileURLToPath(new URL("../fixtures/locomotion-review.ts", import.meta.url));
test("authored source and modular avatars render matched gait phases, transitions, weights, and held grips", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/action.html");
  const result = await page.evaluate(
    async (url) => (await import(url)).captureLocomotionReview(),
    fixture,
  );
  expect(errors).toEqual([]);
  expect(result.errors).toEqual([]);
  expect(result.sourceVerification.samples).toBe(208);
  expect(result.sourceVerification.maxPositionError).toBeLessThan(0.00001);
  expect(result.sourceVerification.maxRotationErrorRadians).toBeLessThan(
    0.00001,
  );
  const steady = result.records.filter(
    (record: any) => record.kind === "steady",
  );
  expect(steady).toHaveLength(192);
  expect(new Set(steady.map((record: any) => record.weight))).toEqual(
    new Set([-1, 0, 1]),
  );
  const clips = new Set(steady.map((record: any) => record.locomotion.clip));
  expect(clips.has("Walk_Loop")).toBe(true);
  for (const clip of [
    "Running_A",
    "Running_Strafe_Left",
    "Running_Strafe_Right",
  ])
    expect(clips.has(clip)).toBe(true);
  expect(
    new Set(
      steady
        .filter((record: any) => record.pace === "Backward sprint")
        .map((record: any) => record.locomotion.reversed),
    ),
  ).toEqual(new Set([true]));
  const backwardWalk = steady.filter(
    (record: any) => record.pace === "Backward walk",
  );
  expect(backwardWalk.length).toBeGreaterThan(0);
  for (const record of backwardWalk) {
    expect(record.locomotion.clip).toBe("Walk_Loop");
    expect(record.locomotion.reversed).toBe(true);
  }
  for (const record of result.records) {
    const reference = record.sourceReference;
    expect(reference.clip).toBe(
      record.locomotion.clip === "Rest" ? "T-Pose" : record.locomotion.clip,
    );
    expect(reference.time).toBeCloseTo(reference.phase * reference.duration, 6);
    expect(reference.reversed).toBe(record.locomotion.reversed ?? false);
  }
  for (const record of steady) {
    for (const height of Object.values(record.footwear) as number[]) {
      expect(Number.isFinite(height)).toBe(true);
      expect(height).toBeGreaterThanOrEqual(-0.0001);
    }
    const support = Math.min(...(Object.values(record.footwear) as number[]));
    // Rounded sole/support transitions allow bounded clearance (35 mm);
    // the directional suite separately requires contact during every cycle.
    // Running permits a modest flight phase.
    // This catches the earlier source-proportion scaling that created 0.5m hops.
    expect(support).toBeLessThanOrEqual(
      ["Walk", "Brisk walk", "Backward walk"].includes(record.pace)
        ? 0.035
        : 0.12,
    );
  }
  const transitions = result.records.filter(
    (record: any) => record.kind === "transition",
  );
  for (const record of transitions) {
    expect(record.gripError).toBeLessThan(1e-5);
    expect(Number.isFinite(record.locomotion.phase)).toBe(true);
    for (const foot of Object.values(record.feet) as any[]) {
      expect(foot.position.every(Number.isFinite)).toBe(true);
      expect(Number.isFinite(foot.kneeDegrees)).toBe(true);
    }
  }
  await mkdir("docs/evidence/locomotion", { recursive: true });
  for (const [name, data] of Object.entries(result.images) as [
    string,
    string,
  ][]) {
    await writeFile(
      `docs/evidence/locomotion/${name}.png`,
      Buffer.from(data.split(",")[1], "base64"),
    );
  }
  await writeFile(
    "docs/evidence/locomotion/visual-review.json",
    JSON.stringify(
      {
        source: "KayKit Character Animations 1.1, Rig_Medium, CC0 1.0",
        capture:
          "Actual GLB meshes, actual AvatarInstance runtime at controlled 60/120 Hz, matched source clip phase",
        note: "The source display is X-mirrored to match target handedness; source tracks are unchanged. Backward walking and lateral running use authored clips. Backward sprint reverses Running_A and is labeled derived. Source mannequin proportions and native sole penetration are not target requirements. Neutral target rest is compared with the source T-pose.",
        sourceScale: result.sourceScale,
        sourceVerification: result.sourceVerification,
        records: result.records,
      },
      null,
      2,
    ) + "\n",
  );
});
