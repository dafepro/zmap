import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
const fixture =
  "/@fs" +
  fileURLToPath(new URL("../fixtures/animation-study.ts", import.meta.url));
test("actual directional strides and authoritative two-stage Wake sequence render with stable rig ownership", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/action.html");
  const result = await page.evaluate(
    async (url) => (await import(url)).renderAnimationStudy(),
    fixture,
  );
  expect(result.errors).toEqual([]);
  expect(errors).toEqual([]);
  expect(result.diagnostics.effectTriangles).toBeLessThanOrEqual(512);
  const wake = result.records.filter((r: any) => r.kind === "wake");
  expect(new Set(wake.map((r: any) => r.phase))).toEqual(
    new Set(["charging", "leaping", "impact", "recoiling", "cooldown", "idle"]),
  );
  expect(Math.max(...wake.map((r: any) => r.bodyY))).toBeGreaterThan(0.5);
  expect(wake.filter((r: any) => r.phase === "impact")).toHaveLength(9);
  for (const r of wake.filter((r: any) => r.phase === "impact")) {
    expect(r.gripError).toBeLessThan(1e-5);
    expect(r.plateUp[1]).toBeGreaterThan(0.999999);
    expect(r.minY).toBeGreaterThanOrEqual(0);
    expect(r.minY).toBeLessThan(0.012);
  }
  await mkdir("docs/evidence/animation", { recursive: true });
  for (const key of ["front", "side", "actions"] as const)
    await writeFile(
      `docs/evidence/animation/${key}.png`,
      Buffer.from(result[key].split(",")[1], "base64"),
    );
  await writeFile(
    "docs/evidence/animation/measurements.json",
    JSON.stringify(
      { records: result.records, diagnostics: result.diagnostics },
      null,
      2,
    ) + "\n",
  );
});
