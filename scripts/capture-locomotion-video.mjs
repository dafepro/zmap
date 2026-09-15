/** Run with the local Vite review server available; source mannequin stays dev-only. */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const browser = await chromium.launch({
  channel: process.env.ZMAP_BROWSER_CHANNEL || "chrome",
});
const page = await browser.newPage({ viewport: { width: 1050, height: 900 } });
const fixture =
  "/@fs" +
  fileURLToPath(
    new URL("../tests/fixtures/locomotion-review.ts", import.meta.url),
  );
try {
  await page.goto(process.argv[2] || "http://127.0.0.1:5174/action.html");
  const videos = [
    ["side", true, false],
    ["front-held", false, true],
  ];
  await mkdir("docs/evidence/locomotion", { recursive: true });
  for (const [name, side, held] of videos) {
    const data = await page.evaluate(
      async ({ fixture, side, held }) =>
        (await import(fixture)).recordLocomotionReview(side, held),
      { fixture, side, held },
    );
    await writeFile(
      `docs/evidence/locomotion/${name}.webm`,
      Buffer.from(data.split(",")[1], "base64"),
    );
    process.stdout.write(`Recorded ${name}.webm\n`);
  }
} finally {
  await browser.close();
}
