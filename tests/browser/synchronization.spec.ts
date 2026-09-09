import { test, expect, type Page } from "@playwright/test";
import { networkProxy } from "../helpers/network-proxy";
import { mkdir, writeFile } from "node:fs/promises";

const read = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).zoomapActionYard.world;
    return {
      session: w.session,
      host: w.host,
      epoch: w.epoch,
      tick: w.state.tick,
      local: { ...w.local },
      players: w.state.players,
    };
  });
async function enter(page: Page, identity: string, url?: string) {
  await page.goto(`/action.html?as=${identity}`);
  await expect(page.locator("#connection")).toHaveText("Live together");
  if (url)
    await page.evaluate(
      async ({ url, identity }) => {
        await (window as any).zoomapActionYard.world.enter({
          url,
          room: "action-yard",
          credential: async () => identity,
        });
      },
      { url, identity },
    );
}
async function observe(page: Page, session: string) {
  await page.evaluate((session) => {
    const samples: { time: number; x: number; z: number; facing: number }[] =
      [];
    (window as any).motionSamples = samples;
    const end = performance.now() + 1800;
    const sample = (time: number) => {
      const w = (window as any).zoomapActionYard.world;
      const object = w.view.scene.children.find(
        (item: any) => item.userData.zoomapSession === session,
      );
      if (object)
        samples.push({
          time,
          x: object.position.x,
          z: object.position.z,
          facing: object.rotation.y,
        });
      if (time < end) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, session);
}

test("both actual peers retain sustained keyboard movement after release, latency and host handoff; rendered poses advance between simulation ticks", async ({
  browser,
}) => {
  test.setTimeout(40000);
  const context = await browser.newContext(),
    proxy = await networkProxy("ws://127.0.0.1:8790/room");
  try {
    const a = await context.newPage(),
      b = await context.newPage();
    await enter(a, "ari", proxy.url);
    await enter(b, "sam", proxy.url);
    const initial = await read(b),
      sid = initial.session;
    await b.locator("canvas").focus();
    await b.keyboard.down("d");
    await observe(a, sid);
    await observe(b, sid);
    await b.waitForTimeout(1500);
    await b.keyboard.up("d");
    await expect
      .poll(async () => (await read(a)).players[sid].x)
      .toBeGreaterThan(initial.local.x + 2.5);
    await b.waitForTimeout(1200);
    const settled = await Promise.all([read(a), read(b)]);
    expect(
      Math.hypot(
        settled[1].local.x - settled[0].players[sid].x,
        settled[1].local.z - settled[0].players[sid].z,
      ),
    ).toBeLessThan(0.18);
    const stopped = { ...settled[0].players[sid] };
    await b.waitForTimeout(1200);
    const retained = await read(a);
    expect(
      Math.hypot(
        retained.players[sid].x - stopped.x,
        retained.players[sid].z - stopped.z,
      ),
    ).toBeLessThan(0.03);
    const samples = await Promise.all(
      [a, b].map((page) =>
        page.evaluate(
          () =>
            (window as any).motionSamples as {
              time: number;
              x: number;
              z: number;
              facing: number;
            }[],
        ),
      ),
    );
    const cadence = samples.map((frames) => {
      const steady = frames.filter(
        (frame) =>
          frame.time > frames[0].time + 300 &&
          frame.time < frames[0].time + 1250,
      );
      const deltas = steady
        .slice(1)
        .map((frame, i) => ({
          dt: frame.time - steady[i].time,
          distance: Math.hypot(frame.x - steady[i].x, frame.z - steady[i].z),
          forward: (frame.x - steady[i].x - frame.z + steady[i].z) / Math.SQRT2,
        }))
        .filter((frame) => frame.dt > 5 && frame.dt < 30);
      return {
        frames: deltas.length,
        movingFraction:
          deltas.filter((frame) => frame.distance > 0.002).length /
          deltas.length,
        maximumStep: Math.max(...deltas.map((frame) => frame.distance)),
        minimumForwardStep: Math.min(...deltas.map((frame) => frame.forward)),
      };
    });
    for (const result of cadence) {
      expect(result.frames).toBeGreaterThan(20);
      expect(result.movingFraction).toBeGreaterThan(0.75);
      expect(result.maximumStep).toBeLessThan(0.3);
      expect(result.minimumForwardStep).toBeGreaterThan(-0.01);
    }
    const hostInitial = await read(a);
    await a.locator("canvas").focus();
    await a.keyboard.down("a");
    await a.waitForTimeout(1100);
    await a.keyboard.up("a");
    await expect
      .poll(async () => (await read(b)).players[hostInitial.session].x)
      .toBeLessThan(hostInitial.local.x - 1.8);
    const epoch = (await read(b)).epoch;
    await a.close();
    await expect.poll(async () => (await read(b)).epoch).toBeGreaterThan(epoch);
    const promoted = await read(b);
    expect(promoted.host).toBe(promoted.session);
    await b.locator("canvas").focus();
    await b.keyboard.down("a");
    await b.waitForTimeout(1000);
    await b.keyboard.up("a");
    await b.waitForTimeout(900);
    const final = await read(b);
    expect(final.local.x).toBeLessThan(promoted.local.x - 1.6);
    expect(final.local.x).toBeCloseTo(final.players[sid].x, 4);
    await mkdir("docs/evidence/synchronization", { recursive: true });
    await writeFile(
      "docs/evidence/synchronization/movement.json",
      JSON.stringify(
        {
          provenance:
            "Two actual Chrome peers, 75ms ±15ms each direction, every50th snapshot dropped; actual rendered transforms sampled at animation frames",
          cadence,
          initial,
          settled,
          final,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await context.close();
    await proxy.close();
  }
});

test("a visible host stalled to one frame per second yields authority instead of repeatedly rolling a friend back", async ({
  browser,
}) => {
  test.setTimeout(25000);
  const context = await browser.newContext();
  try {
    const a = await context.newPage(),
      b = await context.newPage();
    await a.addInitScript(() => {
      const native = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) =>
        native(() => {
          setTimeout(() => callback(performance.now()), 850);
        });
    });
    await enter(a, "ari");
    await enter(b, "sam");
    const start = await read(b);
    await b.locator("canvas").focus();
    await b.keyboard.down("d");
    await expect
      .poll(
        async () => {
          const state = await read(b);
          return state.host === state.session;
        },
        { timeout: 4000 },
      )
      .toBe(true);
    await b.waitForTimeout(1300);
    await b.keyboard.up("d");
    await b.waitForTimeout(1200);
    const final = await read(b);
    expect(final.local.x).toBeGreaterThan(start.local.x + 2);
    expect(final.local.x).toBeCloseTo(final.players[final.session].x, 4);
    await expect
      .poll(async () => (await read(a)).players[final.session].x)
      .toBeCloseTo(final.local.x, 1);
    expect(final.epoch).toBeGreaterThan(start.epoch);
  } finally {
    await context.close();
  }
});
