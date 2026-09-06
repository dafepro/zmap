import { test, expect, type Page } from "@playwright/test";
async function ready(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("#status")).toHaveText("Live together");
  await page.waitForFunction(
    () => !!(window as any).zoomapExample?.world.local,
  );
}
test("real clients: keyboard control, shared ball, late join and abrupt host close", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  });
  const host = await context.newPage();
  const errors: string[] = [];
  host.on("pageerror", (e) => errors.push(e.message));
  await ready(host, "http://127.0.0.1:5173/?mode=shared&as=ari");
  const peer = await context.newPage();
  await ready(peer, "http://127.0.0.1:5173/?mode=shared&as=sam");
  await expect(host.locator("#count")).toHaveText("2 / 20");
  const start = await host.evaluate(() => {
    const w = (window as any).zoomapExample.world;
    return { x: w.state.toys.ball.x, z: w.state.toys.ball.z };
  });
  await host.locator("canvas").focus();
  await host.keyboard.press("Space");
  await expect
    .poll(() =>
      peer.evaluate(() => {
        const b = (window as any).zoomapExample.world.state.toys.ball;
        return Math.hypot(b.x - 2, b.z - 8.7);
      }),
    )
    .toBeGreaterThan(1);
  const before = await host.evaluate(() => ({
    ...(window as any).zoomapExample.world.local,
  }));
  await host.keyboard.down("d");
  await host.waitForTimeout(450);
  await host.keyboard.up("d");
  const after = await host.evaluate(() => ({
    ...(window as any).zoomapExample.world.local,
  }));
  expect(after.x).toBeGreaterThan(before.x + 0.7);
  const late = await context.newPage();
  await ready(late, "http://127.0.0.1:5173/?mode=shared&as=jo");
  await expect(late.locator("#count")).toHaveText("3 / 20");
  expect(
    await late.evaluate(() => {
      const b = (window as any).zoomapExample.world.state.toys.ball;
      return Math.hypot(b.x - 2, b.z - 8.7);
    }),
  ).toBeGreaterThan(1);
  const epoch = await peer.evaluate(
    () => (window as any).zoomapExample.world.epoch,
  );
  const at = Date.now();
  await host.close();
  await expect
    .poll(() => peer.evaluate(() => (window as any).zoomapExample.world.epoch))
    .toBeGreaterThan(epoch);
  await expect(peer.locator("#status")).toHaveText("Live together");
  console.log(
    `Abrupt host-close recovery sample: ${Date.now() - at} ms; initial ball ${JSON.stringify(start)}`,
  );
  await peer.screenshot({ path: "docs/evidence/shared-desktop.png" });
  expect(errors).toEqual([]);
  await context.close();
});
test("decorating: place, rotate, save, leave/re-enter, and return; menu input stays isolated", async ({
  page,
}) => {
  await ready(page, "/?mode=decorate&as=ari");
  // Make the recipe repeatable through the same public edit UI.
  if (await page.getByRole("button", { name: /Planter Placed/ }).count()) {
    await page.getByRole("button", { name: /Planter Placed/ }).click();
    await page.getByRole("button", { name: "Return to inventory" }).click();
    await expect(page.locator("#save-status")).toContainText("Returned");
  }
  await page.getByRole("button", { name: "Planter 1 available" }).click();
  const before = await page.evaluate(
    () => (window as any).zoomapExample.world.local.x,
  );
  await page.getByRole("button", { name: "Rotate decoration" }).click();
  await page.keyboard.press("d");
  expect(
    await page.evaluate(() => (window as any).zoomapExample.world.local.x),
  ).toBeCloseTo(before, 1);
  await expect(page.locator("#placement-status")).toContainText("Valid spot");
  await page.getByRole("button", { name: "Save placement" }).click();
  await expect(page.locator("#save-status")).toContainText("Saved");
  await page.getByRole("button", { name: /Leave courtyard/ }).click();
  await expect(page.locator("#world canvas")).toHaveCount(0);
  await page.getByRole("button", { name: /Enter courtyard/ }).click();
  await expect(page.locator("#status")).toHaveText("Live together");
  await page.getByRole("button", { name: /Planter Placed/ }).click();
  await expect(page.locator("#placement-status")).toContainText("Valid spot");
  await page.screenshot({
    path: "docs/evidence/decorate-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Return to inventory" }).click();
  await expect(page.locator("#save-status")).toContainText("Returned");
});
test("portrait: touch movement, interruption stops input, readable layout", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await ready(page, "http://127.0.0.1:5173/?mode=explore&as=jo");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  const stick = page.locator("#stick");
  await expect(stick).toBeVisible();
  const box = (await stick.boundingBox())!;
  const before = await page.evaluate(
    () => (window as any).zoomapExample.world.local.x,
  );
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2);
  await page.waitForTimeout(400);
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).zoomapExample.world.local.x),
    )
    .toBeGreaterThan(before + 0.5);
  const stopped = await page.evaluate(
    () => (window as any).zoomapExample.world.local.x,
  );
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() => (window as any).zoomapExample.world.local.x),
  ).toBeCloseTo(stopped, 1);
  await page.screenshot({
    path: "docs/evidence/explore-portrait.png",
    fullPage: true,
  });
  await context.close();
});
test("20 enter/dispose cycles release connections and canvases; isolated input focus", async ({
  page,
}) => {
  await ready(page, "/?mode=explore&as=ari");
  const first = await page.evaluate(() =>
    (window as any).zoomapExample.world.view.diagnostics(),
  );
  for (let i = 0; i < 20; i++) {
    await page.getByRole("button", { name: /Leave courtyard/ }).click();
    await expect(page.locator("#world canvas")).toHaveCount(0);
    await page.getByRole("button", { name: /Enter courtyard/ }).click();
    await expect(page.locator("#status")).toHaveText("Live together");
  }
  const final = await page.evaluate(() =>
    (window as any).zoomapExample.world.view.diagnostics(),
  );
  expect(final.geometries).toBe(first.geometries);
  expect(final.textures).toBe(first.textures);
  await expect(page.locator("#count")).toHaveText("1 / 20");
  const x = await page.evaluate(
    () => (window as any).zoomapExample.world.local.x,
  );
  await page.getByRole("link", { name: "Open a friend’s view" }).focus();
  await page.keyboard.press("d");
  expect(
    await page.evaluate(() => (window as any).zoomapExample.world.local.x),
  ).toBeCloseTo(x, 2);
  console.log(
    `20 lifecycle cycles: geometries ${first.geometries} → ${final.geometries}; textures ${first.textures} → ${final.textures}`,
  );
});
