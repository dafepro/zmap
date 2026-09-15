import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";

const fixture =
  "/@fs" +
  fileURLToPath(new URL("../fixtures/directional-review.ts", import.meta.url));

test("all movement directions retain continuous joints, athletic posture, extension and fitted equipment", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Same-origin asset access, without another courtyard or review RAF loop.
  await page.route("**/directional-test.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Directional rig qualification</title>",
    }),
  );
  await page.goto("/directional-test.html");
  const result = await page.evaluate(
    async ({ url, record }) =>
      (await import(url)).captureDirectionalReview({ record }),
    { url: fixture, record: process.env.ZMAP_RECORD_DIRECTIONAL === "1" },
  );
  const directory = "docs/evidence/directional-locomotion";
  await mkdir(directory, { recursive: true });
  for (const [name, image] of Object.entries(result.images) as [
    string,
    string,
  ][]) {
    await writeFile(
      `${directory}/${name}.png`,
      Buffer.from(image.split(",")[1], "base64"),
    );
  }
  if (result.video)
    await writeFile(
      `${directory}/directions.webm`,
      Buffer.from(result.video.split(",")[1], "base64"),
    );
  await writeFile(
    `${directory}/metrics.json`,
    JSON.stringify(
      {
        capture:
          "Actual modular avatar at 60 Hz. Joint rotations are measured in world space; knee angles come from evaluated FK, floor clearance from skinned shoe vertices.",
        cases: result.cases,
        errors: result.errors,
      },
      null,
      2,
    ) + "\n",
  );
  expect(errors).toEqual([]);
  expect(result.errors).toEqual([]);
  expect(result.cases).toHaveLength(120);
  for (const sample of result.cases) {
    const label = `${sample.name}, ${sample.speed} m/s, weight ${sample.weight}, ${sample.tool ? "two hand panel" : "free hands"}`;
    expect
      .soft(
        Number.isFinite(sample.minFloor),
        `${label}: actual shoe vertices must be present`,
      )
      .toBe(true);
    expect
      .soft(sample.minFloor, `${label}: actual shoe floor clearance`)
      .toBeGreaterThanOrEqual(-0.003);
    expect
      .soft(
        sample.minFloor,
        `${label}: grounded movement must include shoe support`,
      )
      .toBeLessThan(0.012);
    expect
      .soft(
        sample.maxFloor,
        `${label}: walking support and bounded running flight`,
      )
      .toBeLessThan(sample.speed < 3 ? 0.035 : 0.12);
    expect
      .soft(sample.maxGrip, `${label}: both equipment grip frames`)
      .toBeLessThan(1e-5);
    if (sample.tool) {
      expect
        .soft(
          sample.maxCarrierYaw,
          `${label}: carrier keeps avatar-facing aim despite hip twist`,
        )
        .toBeLessThan(0.1);
      expect
        .soft(
          sample.maxToolAimError,
          `${label}: panel face keeps the neutral avatar-relative aim frame`,
        )
        .toBeLessThan(0.1);
    }
    expect
      .soft(
        sample.maxTrunkPitch,
        `${label}: torso must not remain folded forward`,
      )
      .toBeLessThan(24);
    expect
      .soft(sample.minTrunkPitch, `${label}: torso must not fold backward`)
      .toBeGreaterThan(-20);
    for (const frame of sample.frames) {
      expect
        .soft(
          Math.abs(frame.headPitch),
          `${label}: head posture at frame ${frame.frame}`,
        )
        .toBeLessThan(35);
    }
    // 25 degrees in a 16.7 ms frame already permits quick authored motion. A
    // 60–140 degree one-frame reversal is a retarget/IK failure, not animation.
    for (const [joint, jump] of Object.entries(sample.maxJump) as [
      string,
      number,
    ][]) {
      expect
        .soft(jump, `${label}: ${joint} rotation per 60 Hz frame`)
        .toBeLessThan(sample.name === "Abrupt direction changes" ? 40 : 25);
    }
    if (sample.name !== "Abrupt direction changes")
      for (const [side, minimum] of sample.kneeMinimum.entries()) {
        const crossover =
          (sample.name === "Left" && side === 0) ||
          (sample.name === "Right" && side === 1);
        const diagonalCrossover =
          sample.speed > 4 &&
          ((sample.name === "Backward left" && side === 0) ||
            (sample.name === "Backward right" && side === 1));
        expect
          .soft(
            minimum,
            `${label}: ${side === 0 ? "left" : "right"} knee needs an extension phase`,
          )
          // The authored strafe's trailing crossover leg stays around30°;
          // the support leg and both ordinary walk/run legs must extend.
          .toBeLessThan(crossover ? 35 : diagonalCrossover ? 25 : 20);
      }
    expect
      .soft(sample.maxKnee, `${label}: knees must retain useful flexion`)
      .toBeGreaterThan(25);
    expect
      .soft(sample.maxKnee, `${label}: reject folded or inverted leg poses`)
      // The authored KayKit strafe intentionally crosses the trailing leg and
      // reaches 155.1 degrees of flexion; crossing alone is not an IK defect.
      .toBeLessThan(165);
  }
});
