import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { networkProxy } from "../helpers/network-proxy";

const evidence = "docs/evidence/performances";
async function player(page: Page, session?: string) {
  return page.evaluate((id) => {
    const app = (window as any).zoomapActionYard,
      who = id ?? app.world.session;
    return {
      tick: app.world.state.tick,
      session: who,
      host: app.world.host,
      body: app.world.state.players[who],
      action: app.world.state.actions.players[who],
      rendered: app.kit
        .diagnostics()
        .readiness.find((entry: any) => entry.session === who),
    };
  }, session);
}
test("friends see the same stow, emote and redraw through late join, host loss and movement cancellation", async ({
  browser,
}) => {
  test.setTimeout(65000);
  const proxy = await networkProxy("ws://127.0.0.1:8790/room");
  const context = await browser.newContext(),
    errors: string[] = [];
  try {
    const pages: Page[] = [];
    for (const identity of ["ari", "sam", "jo"]) {
      const page = await context.newPage();
      pages.push(page);
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`/action.html?as=${identity}`);
      await expect(page.locator("#connection")).toHaveText("Live together");
      await page.evaluate(
        async ({ url, identity }) => {
          await (window as any).zoomapActionYard.world.enter({
            url,
            room: "action-yard",
            credential: async () => identity,
          });
        },
        { url: proxy.url, identity },
      );
    }
    const [a, b, c] = pages;
    await c.evaluate(() => (window as any).zoomapActionYard.world.leave());
    await expect(a.locator("#people")).toHaveText("2 PLAYERS");
    const first = await player(a);
    const host = first.host === first.session ? a : b;
    const performer = host === a ? b : a,
      observer = host;
    const performerId = (await player(performer)).session;
    const spawn = (await player(performer)).body;
    // Separate the performer using normal movement so the shared picture is
    // actually readable, rather than three avatars overlapping at spawn.
    await performer.evaluate(() =>
      (window as any).zoomapActionYard.world.setInput(0.7, 0),
    );
    await expect
      .poll(async () => {
        const body = (await player(performer)).body;
        return Math.hypot(body.x - spawn.x, body.z - spawn.z);
      })
      .toBeGreaterThan(2.2);
    await performer.evaluate(() =>
      (window as any).zoomapActionYard.world.setInput(0, 0),
    );
    await expect
      .poll(async () => {
        const body = (await player(observer, performerId)).body;
        return Math.hypot(body.vx, body.vz);
      })
      .toBe(0);
    await performer.locator("#pick-rebound-panel").click();
    await expect(performer.locator("#use-tool")).toBeEnabled();
    await performer.locator("#draw-tool").click();
    await expect
      .poll(
        async () =>
          (await player(observer, performerId)).action.performance.drawn,
      )
      .toBe(false);
    await expect
      .poll(async () => (await player(observer, performerId)).rendered.drawn)
      .toBe(false);
    expect((await player(observer, performerId)).action.tool).toBe(
      "rebound-panel",
    );
    await expect(performer.locator("#use-tool")).toBeDisabled();
    await expect(performer.locator("#tool-phase")).toContainText("Tool stowed");
    await performer.locator("#draw-tool").click();
    await expect(performer.locator("#use-tool")).toBeEnabled();
    const stationary = (await player(performer)).body;
    await performer.locator("#emote-dance").click();
    await expect
      .poll(
        async () =>
          (await player(observer, performerId)).action.performance.emote?.id,
      )
      .toBe("dance");
    const accepted = (await player(observer, performerId)).action.performance
      .emote;
    await c.evaluate(async (url) => {
      await (window as any).zoomapActionYard.world.enter({
        url,
        room: "action-yard",
        credential: async () => "jo",
      });
    }, proxy.url);
    await expect(c.locator("#connection")).toHaveText("Live together");
    await expect
      .poll(
        async () =>
          (await player(c, performerId)).action.performance.emote?.startedTick,
      )
      .toBe(accepted.startedTick);
    await expect
      .poll(async () => (await player(c, performerId)).rendered?.emote?.id)
      .toBe("dance");
    await expect
      .poll(async () => (await player(c, performerId)).rendered?.emote?.elapsed)
      .toBeGreaterThan(0.35);
    await mkdir(evidence, { recursive: true });
    await c.screenshot({
      path: `${evidence}/shared-dance.png`,
      fullPage: true,
    });
    const beforeLoss = await player(host, performerId);
    expect(beforeLoss.host, "close the still-elected authority").toBe(
      first.host,
    );
    expect(
      beforeLoss.action.performance.emote.untilTick - beforeLoss.tick,
    ).toBeGreaterThan(30);
    const lossAt = Date.now();
    await host.close();
    await expect(performer.locator("#connection")).toHaveText("Live together");
    await expect
      .poll(async () => (await player(performer)).host)
      .not.toBe(first.host);
    await expect.poll(async () => (await player(c)).host).not.toBe(first.host);
    const recovered = await player(c, performerId);
    expect(recovered.action.performance.emote.startedTick).toBe(
      accepted.startedTick,
    );
    expect(recovered.body.x).toBeCloseTo(stationary.x, 4);
    expect(recovered.body.z).toBeCloseTo(stationary.z, 4);
    const recoveryMs = Date.now() - lossAt;
    expect(recoveryMs).toBeLessThan(4000);
    await performer.evaluate(() =>
      (window as any).zoomapActionYard.world.setInput(0.5, 0),
    );
    await expect
      .poll(async () => (await player(c, performerId)).action.performance.emote)
      .toBeNull();
    await performer.evaluate(() =>
      (window as any).zoomapActionYard.world.setInput(0, 0),
    );
    await expect(performer.locator("#use-tool")).toBeEnabled();
    await expect
      .poll(async () => (await player(c, performerId)).rendered.drawn)
      .toBe(true);
    expect(errors).toEqual([]);
    await writeFile(
      `${evidence}/shared-timeline.json`,
      JSON.stringify(
        {
          beforeLoss,
          accepted,
          recovered,
          recoveryMs,
          final: await player(c, performerId),
          shapedTraffic: "75 ms ±15 ms each way; every 50th snapshot omitted",
          errors,
        },
        null,
        2,
      ),
    );
  } finally {
    await context.close();
    await proxy.close();
  }
});
