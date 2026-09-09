import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { networkProxy } from "../helpers/network-proxy";

async function position(page: Page) {
  return page.evaluate(() => {
    const app = (window as any).zoomapActionYard;
    return {
      local: { ...app.world.local },
      authoritative: { ...app.world.state.players[app.world.session] },
      navigation: app.movement.state(),
    };
  });
}
async function groundPixel(page: Page, x: number, y: number, z: number) {
  return page.evaluate(
    ({ x, y, z }) => {
      const { view } = (window as any).zoomapActionYard.world,
        point = view.camera.position.clone().set(x, y, z).project(view.camera),
        rect = view.canvas.getBoundingClientRect();
      return {
        x: rect.left + ((point.x + 1) * rect.width) / 2,
        y: rect.top + ((1 - point.y) * rect.height) / 2,
      };
    },
    { x, y, z },
  );
}
async function clickGround(
  page: Page,
  x: number,
  y: number,
  z: number,
  touch = false,
) {
  const pixel = await groundPixel(page, x, y, z);
  if (touch) await page.touchscreen.tap(pixel.x, pixel.y);
  else await page.mouse.click(pixel.x, pixel.y);
}

test("click to walk persists under shaped traffic; new targets redirect and Escape cancels", async ({
  browser,
}) => {
  test.setTimeout(40000);
  const proxy = await networkProxy("ws://127.0.0.1:8790/room");
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  });
  try {
    const a = await context.newPage(),
      b = await context.newPage();
    for (const [page, actor] of [
      [a, "ari"],
      [b, "sam"],
    ] as const) {
      await page.goto(`/action.html?as=${actor}`);
      await expect(page.locator("#connection")).toHaveText("Live together");
      await page.evaluate(
        async ({ url, actor }) => {
          await (window as any).zoomapActionYard.world.enter({
            url,
            room: "action-yard",
            credential: async () => actor,
          });
        },
        { url: proxy.url, actor },
      );
    }
    await expect(a.locator("#people")).toHaveText("2 PLAYERS");
    await clickGround(b, 0, 0, -3);
    await expect
      .poll(async () => (await position(b)).navigation.target, {
        timeout: 7000,
      })
      .toBeNull();
    const moved = await position(b);
    expect(Math.hypot(moved.local.x, moved.local.z + 3)).toBeLessThan(0.16);
    const session = await b.evaluate(
      () => (window as any).zoomapActionYard.world.session,
    );
    await expect
      .poll(() =>
        a.evaluate((session) => {
          const p = (window as any).zoomapActionYard.world.state.players[
            session
          ];
          return p ? Math.hypot(p.x, p.z + 3) : Infinity;
        }, session),
      )
      .toBeLessThan(0.2);
    // A full three-second release window catches the old periodic reset.
    await b.waitForTimeout(3000);
    const released = await position(b);
    expect(
      Math.hypot(released.authoritative.x, released.authoritative.z + 3),
    ).toBeLessThan(0.2);
    await clickGround(b, 0, 0, 1);
    await expect(b.locator("#stop-moving")).toBeVisible();
    await clickGround(b, -1, 0, -2);
    await expect
      .poll(async () => (await position(b)).navigation.target)
      .toBeNull();
    expect(
      Math.hypot(
        (await position(b)).local.x + 1,
        (await position(b)).local.z + 2,
      ),
    ).toBeLessThan(0.16);
    await clickGround(b, -1, 0, 2);
    await b.keyboard.press("Escape");
    await expect(b.locator("#stop-moving")).toBeHidden();
    const stopped = (await position(b)).local;
    await b.waitForTimeout(1000);
    const still = (await position(b)).local;
    expect(Math.hypot(stopped.x - still.x, stopped.z - still.z)).toBeLessThan(
      0.2,
    );
  } finally {
    await context.close();
    await proxy.close();
  }
});

test("public path controller takes a real wall detour and ramp; unreachable target gives useful feedback", async ({
  page,
}) => {
  test.setTimeout(40000);
  await page.goto("/action.html?as=ari");
  await expect(page.locator("#connection")).toHaveText("Live together");
  // Larger destinations can be beyond the close camera. This is the same public
  // application controller used by picking, without modifying simulation state.
  await page.evaluate(() =>
    (window as any).zoomapActionYard.movement.moveTo({ x: 4, y: 0, z: 1 }),
  );
  await expect
    .poll(async () => (await position(page)).navigation.target, {
      timeout: 12000,
    })
    .toBeNull();
  let body = (await position(page)).local;
  expect(Math.hypot(body.x - 4, body.z - 1)).toBeLessThan(0.2);
  await page.evaluate(() =>
    (window as any).zoomapActionYard.movement.moveTo({ x: 0, y: 2.8, z: 8 }),
  );
  await expect
    .poll(async () => (await position(page)).navigation.target, {
      timeout: 18000,
    })
    .toBeNull();
  body = (await position(page)).local;
  expect(Math.hypot(body.x, body.y - 2.8, body.z - 8)).toBeLessThan(0.2);
  await page.evaluate(() =>
    (window as any).zoomapActionYard.movement.moveTo({ x: 2, y: 0, z: 1 }),
  );
  await expect(page.locator("#movement-status")).toHaveText(
    "No walking route to that spot",
  );
});

test("portrait tap and joystick modes move, cancel captured touches and fit the screen", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    const page = await context.newPage();
    await page.goto("/action.html?as=sam");
    await expect(page.locator("#connection")).toHaveText("Live together");
    await page.locator(".field").scrollIntoViewIfNeeded();
    const before = (await position(page)).local;
    await clickGround(page, before.x + 1, 0, before.z, true);
    await expect
      .poll(async () => (await position(page)).navigation.target, {
        timeout: 7000,
      })
      .toBeNull();
    expect((await position(page)).local.x).toBeGreaterThan(before.x + 0.75);
    await page.locator("#mode-joystick").tap();
    await expect(page.locator("#stick")).toBeVisible();
    await expect(page.locator("#mode-joystick")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const rect = await page.locator("#stick").boundingBox();
    const start = (await position(page)).local;
    await page.mouse.move(
      rect!.x + rect!.width / 2,
      rect!.y + rect!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      rect!.x + rect!.width / 2 + 34,
      rect!.y + rect!.height / 2,
    );
    await page.waitForTimeout(700);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.mouse.up();
    const end = (await position(page)).local;
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeGreaterThan(1);
    await page.waitForTimeout(900);
    const settled = (await position(page)).local;
    expect(Math.hypot(settled.x - end.x, settled.z - end.z)).toBeLessThan(0.2);
    await page.locator("#mode-path").tap();
    await expect(page.locator("#stick")).toBeHidden();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await mkdir("docs/evidence/actions", { recursive: true });
    await page
      .locator(".field")
      .screenshot({ path: "docs/evidence/actions/tap-controls-portrait.png" });
  } finally {
    await context.close();
  }
});

test("a destination queued during Wake waits for landing and disposed controls cannot restart", async ({
  page,
}) => {
  await page.goto("/action.html?as=ari");
  await expect(page.locator("#connection")).toHaveText("Live together");
  await page.locator("#pick-wake-driver").click();
  await expect(page.locator("#use-tool")).toBeEnabled();
  await page.locator("#use-tool").focus();
  await page.keyboard.press("Space");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const w = (window as any).zoomapActionYard.world;
        return w.state.actions.players[w.session].phase;
      }),
    )
    .toBe("leaping");
  const destination = await page.evaluate(() => {
    const app = (window as any).zoomapActionYard,
      destination = { x: app.world.local.x + 1, y: 0, z: app.world.local.z };
    if (!app.movement.moveTo(destination))
      throw Error("Airborne route was not queued");
    return destination;
  });
  await expect
    .poll(async () => (await position(page)).navigation.target)
    .toBeNull();
  const body = (await position(page)).local;
  expect(
    Math.hypot(body.x - destination.x, body.y, body.z - destination.z),
  ).toBeLessThan(0.2);
  expect(
    await page.evaluate(() => {
      const app = (window as any).zoomapActionYard;
      app.dispose();
      return app.movement.moveTo({ x: 2, y: 0, z: 0 });
    }),
  ).toBe(false);
});
