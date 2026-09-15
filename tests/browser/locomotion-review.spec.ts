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
  const steady = result.records.filter(
    (record: any) => record.kind === "steady",
  );
  expect(steady).toHaveLength(48);
  expect(new Set(steady.map((record: any) => record.weight))).toEqual(
    new Set([-1, 0, 1]),
  );
  expect(new Set(steady.map((record: any) => record.locomotion.clip))).toEqual(
    new Set(["Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop"]),
  );
  for (const record of steady) {
    for (const height of Object.values(record.footwear) as number[]) {
      expect(Number.isFinite(height)).toBe(true);
      expect(height).toBeGreaterThanOrEqual(-0.0001);
    }
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
        source: "Quaternius Universal Animation Library Standard v3, CC0 1.0",
        capture:
          "Actual GLB meshes, actual AvatarInstance runtime at controlled 60/120 Hz, matched source clip phase",
        note: "The source display is X-mirrored to match target handedness; source tracks are unchanged. Backward and strafe are adaptations; the imported archive has only authored forward locomotion.",
        sourceScale: result.sourceScale,
        records: result.records,
      },
      null,
      2,
    ) + "\n",
  );
});
