import { test, expect, type Page } from "@playwright/test";
import { networkProxy } from "../helpers/network-proxy";

const read = (page: Page) =>
  page.evaluate(() => {
    const world = (window as any).zoomapActionYard.world;
    return {
      session: world.session,
      host: world.host,
      local: { ...world.local },
      players: world.state.players,
      sprinting: world.sprinting,
    };
  });
const speed = (body: { vx: number; vz: number }) =>
  Math.hypot(body.vx, body.vz);
async function enter(page: Page, actor: string, url?: string) {
  await page.goto(`/action.html?as=${actor}`);
  await expect(page.locator("#connection")).toHaveText("Live together");
  if (url)
    await page.evaluate(
      async ({ actor, url }) => {
        await (window as any).zoomapActionYard.world.enter({
          url,
          room: "action-yard",
          credential: async () => actor,
        });
      },
      { actor, url },
    );
}

test("Shift sprint and release agree under shaped traffic, survive host loss, and clear on blur", async ({
  browser,
}) => {
  test.setTimeout(40000);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  });
  const proxy = await networkProxy("ws://127.0.0.1:8790/room");
  try {
    const a = await context.newPage(),
      b = await context.newPage();
    await enter(a, "ari", proxy.url);
    await enter(b, "sam", proxy.url);
    const initial = await read(b),
      sid = initial.session;
    await b.locator("canvas").focus();
    await b.keyboard.down("Shift");
    await b.keyboard.down("d");
    await expect
      .poll(async () => speed((await read(b)).local))
      .toBeCloseTo(5.4, 4);
    await expect
      .poll(async () => speed((await read(a)).players[sid]))
      .toBeCloseTo(5.4, 4);
    await b.keyboard.up("Shift");
    await expect
      .poll(async () => speed((await read(b)).local))
      .toBeCloseTo(2.2, 4);
    await expect
      .poll(async () => speed((await read(a)).players[sid]))
      .toBeCloseTo(2.2, 4);
    await b.keyboard.up("d");
    await expect.poll(async () => speed((await read(a)).players[sid])).toBe(0);
    const stopped = (await read(b)).local;
    expect(
      Math.hypot(stopped.x - initial.local.x, stopped.z - initial.local.z),
    ).toBeGreaterThan(1);
    await b.waitForTimeout(1100);
    const settled = await read(b),
      remote = (await read(a)).players[sid];
    expect(
      Math.hypot(settled.local.x - stopped.x, settled.local.z - stopped.z),
    ).toBeLessThan(0.25);
    expect(
      Math.hypot(settled.local.x - remote.x, settled.local.z - remote.z),
    ).toBeLessThan(0.2);
    await b.keyboard.down("Shift");
    await b.keyboard.down("a");
    await expect
      .poll(async () => speed((await read(a)).players[sid]))
      .toBeCloseTo(5.4, 4);
    await a.evaluate(() => (window as any).zoomapActionYard.world.leave());
    await expect.poll(async () => (await read(b)).host).toBe(sid);
    await expect
      .poll(async () => speed((await read(b)).local))
      .toBeCloseTo(5.4, 4);
    await b.evaluate(() => window.dispatchEvent(new Event("blur")));
    await b.keyboard.up("a");
    await b.keyboard.up("Shift");
    await expect.poll(async () => speed((await read(b)).local)).toBe(0);
    expect((await read(b)).sprinting).toBe(false);
    const after = (await read(b)).local;
    await b.waitForTimeout(800);
    const retained = (await read(b)).local;
    expect(Math.hypot(retained.x - after.x, retained.z - after.z)).toBeLessThan(
      0.1,
    );
  } finally {
    await context.close();
    await proxy.close();
  }
});

test("touch Sprint toggle works with a click path and joystick; Stop and input suspension release it", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    const page = await context.newPage();
    await enter(page, "sam");
    await page.locator(".field").scrollIntoViewIfNeeded();
    const button = page.getByRole("button", { name: "Sprint", exact: true });
    await button.tap();
    await expect(page.locator("#sprint")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.evaluate(() =>
      (window as any).zoomapActionYard.movement.moveTo({ x: 0, y: 0, z: -5 }),
    );
    await expect
      .poll(async () => speed((await read(page)).local))
      .toBeGreaterThan(4.8);
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as any).zoomapActionYard.movement.state().target,
        ),
      )
      .toBeNull();
    const destination = (await read(page)).local;
    expect(Math.hypot(destination.x, destination.z + 5)).toBeLessThan(0.15);
    await expect(page.locator("#sprint")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await page.locator("#mode-joystick").tap();
    await page.locator("#sprint").tap();
    const rect = await page.locator("#stick").boundingBox();
    await page.mouse.move(
      rect!.x + rect!.width / 2,
      rect!.y + rect!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      rect!.x + rect!.width / 2 + 35,
      rect!.y + rect!.height / 2,
    );
    await expect
      .poll(async () => speed((await read(page)).local))
      .toBeGreaterThan(5.3);
    await page.mouse.up();
    await page.evaluate(() =>
      (window as any).zoomapActionYard.world.setInputEnabled(false),
    );
    expect((await read(page)).sprinting).toBe(false);
    await expect.poll(async () => speed((await read(page)).local)).toBe(0);
    await page.evaluate(() =>
      (window as any).zoomapActionYard.world.setInputEnabled(true),
    );
    await page.locator("#mode-path").tap();
    await page.locator("#sprint").tap();
    await page.evaluate(() =>
      (window as any).zoomapActionYard.movement.moveTo({ x: -2, y: 0, z: -3 }),
    );
    await page.locator("#stop-moving").tap();
    await expect(page.locator("#sprint")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect.poll(async () => speed((await read(page)).local)).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    const sprintRect = await page.locator("#sprint").boundingBox(),
      cameraRect = await page.locator(".camera-controls").boundingBox();
    expect(sprintRect!.y).toBeGreaterThan(cameraRect!.y + cameraRect!.height);
  } finally {
    await context.close();
  }
});

test("same-epoch roster changes cannot rewind the current host's sprint or replay released input", async ({
  browser,
}) => {
  test.setTimeout(30000);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  });
  const proxy = await networkProxy("ws://127.0.0.1:8790/room");
  try {
    const a = await context.newPage(),
      b = await context.newPage();
    await enter(a, "ari", proxy.url);
    await enter(b, "sam", proxy.url);
    await b.waitForTimeout(1300);
    const state = await read(a),
      host = state.host === state.session ? a : b,
      peer = host === a ? b : a;
    await host.locator("canvas").focus();
    await host.keyboard.down("Shift");
    await host.keyboard.down("a");
    await expect
      .poll(async () => speed((await read(host)).local))
      .toBeCloseTo(5.4, 4);
    await host.evaluate(() => {
      const w = (window as any).zoomapActionYard.world;
      const result = {
        epoch: w.epoch,
        samples: [] as {
          x: number;
          tick: number;
          epoch: number;
          host: string;
        }[],
      };
      (window as any).sprintRosterObservation = result;
      const end = performance.now() + 1500;
      const frame = () => {
        result.samples.push({
          x: w.local.x,
          tick: w.state.tick,
          epoch: w.epoch,
          host: w.host,
        });
        if (performance.now() < end) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    await peer.evaluate(() => (window as any).zoomapActionYard.world.leave());
    await expect(host.locator("#people")).toHaveText("1 PLAYER");
    await host.keyboard.up("a");
    await host.keyboard.up("Shift");
    await expect.poll(async () => speed((await read(host)).local)).toBe(0);
    await host.waitForTimeout(1600);
    const result = await host.evaluate(
      () => (window as any).sprintRosterObservation,
    );
    expect(result.samples.length).toBeGreaterThan(20);
    for (let i = 1; i < result.samples.length; i++) {
      expect(result.samples[i].epoch).toBe(result.epoch);
      expect(result.samples[i].tick).toBeGreaterThanOrEqual(
        result.samples[i - 1].tick,
      );
      expect(result.samples[i].x - result.samples[i - 1].x).toBeLessThan(0.001);
    }
    expect((await read(host)).sprinting).toBe(false);
  } finally {
    await context.close();
    await proxy.close();
  }
});
