import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";

const fixture =
  "/@fs" +
  fileURLToPath(new URL("../fixtures/performance-review.ts", import.meta.url));
test("source performances and all held-item transitions keep grounded, continuous modular avatars and exact visible grips", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/performance-test.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Performance source and modular target qualification</title>",
    }),
  );
  await page.goto("/performance-test.html");
  const result = await page.evaluate(
    async ({ url, record }) =>
      (await import(url)).capturePerformanceReview({ record }),
    { url: fixture, record: process.env.ZMAP_RECORD_PERFORMANCES === "1" },
  );
  const directory = "docs/evidence/avatar-performances";
  await mkdir(directory, { recursive: true });
  for (const [name, data] of Object.entries(result.images) as [
    string,
    string,
  ][])
    await writeFile(
      `${directory}/${name}.png`,
      Buffer.from(data.split(",")[1], "base64"),
    );
  if (result.video)
    await writeFile(
      `${directory}/performances.webm`,
      Buffer.from(result.video.split(",")[1], "base64"),
    );
  await writeFile(
    `${directory}/metrics.json`,
    JSON.stringify(
      {
        capture:
          "Original GLB source beside actual modular targets at weights -1/0/+1; front and side, 60Hz. Exact visible grip frames and evaluated skinned shoe geometry.",
        cases: result.cases,
        errors: result.errors,
        sourceVerification: result.verification,
        recordingFrames: result.recordingFrames,
      },
      null,
      2,
    ) + "\n",
  );
  expect(errors).toEqual([]);
  expect(result.errors).toEqual([]);
  expect(result.verification.samples).toBeGreaterThanOrEqual(80);
  expect(result.verification.maxPositionError).toBeLessThan(0.00001);
  expect(result.verification.maxRotationError).toBeLessThan(0.00001);
  expect(result.cases).toHaveLength(63);
  for (const row of result.cases) {
    const label = `${row.id}, weight ${row.weight}`;
    expect
      .soft(
        row.maxRootDrift,
        `${label}: animation cannot move physical player root`,
      )
      .toBeLessThan(1e-8);
    expect
      .soft(row.maxGrip, `${label}: every visible hand grip`)
      .toBeLessThan(1e-5);
    expect
      .soft(
        Number.isFinite(row.minFloor),
        `${label}: actual articulated shoe geometry`,
      )
      .toBe(true);
    expect
      .soft(row.minFloor, `${label}: no foot sinking`)
      .toBeGreaterThanOrEqual(-0.003);
    expect
      .soft(row.maxFloor, `${label}: bounded authored flight`)
      .toBeLessThan(0.18);
    expect
      .soft(row.maxJointStep, `${label}: continuous source and item adaptation`)
      .toBeLessThan(45);
    if (row.id.startsWith("wield-")) {
      expect
        .soft(row.visibilityFlips, `${label}: one marker, no flickering`)
        .toBe(1);
      expect
        .soft(row.finalDrawn, `${label}: settles without reappearing`)
        .toBe(row.id.endsWith("-equip"));
    }
  }
});
