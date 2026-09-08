import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { networkProxy } from "../helpers/network-proxy";

async function driveTo(page: Page, x: number, z: number) {
  await page.evaluate(
    async (target) => {
      const world = (window as any).zoomapActionYard.world,
        start = performance.now();
      world.cancelTool();
      while (performance.now() - start < 6000) {
        const dx = target.x - world.local.x,
          dz = target.z - world.local.z,
          length = Math.hypot(dx, dz);
        if (length < 0.16) break;
        const speed = Math.min(1, length * 2);
        world.setInput(
          ((dx - dz) / length / Math.SQRT2) * speed,
          ((dx + dz) / length / Math.SQRT2) * speed,
        );
        await new Promise(requestAnimationFrame);
      }
      world.setInput(0, 0);
      if (Math.hypot(target.x - world.local.x, target.z - world.local.z) > 0.4)
        throw Error("Could not reach the shared action test position");
    },
    { x, z },
  );
}
async function equip(page: Page, tool: string) {
  await page.locator(`#pick-${tool}`).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const w = (window as any).zoomapActionYard.world;
        return w.state.actions.players[w.session]?.tool;
      }),
    )
    .toBe(tool);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).zoomapActionYard.kit.diagnostics().pending,
      ),
    )
    .toBe(0);
  await expect(page.locator("#use-tool")).toBeEnabled();
}
test("three real clients share a winch pass, panel return, player-moving pulse, late join and host recovery under shaped traffic", async ({
  browser,
}) => {
  test.setTimeout(65000);
  const proxy = await networkProxy("ws://127.0.0.1:8790/room"),
    context = await browser.newContext(),
    errors: string[] = [];
  try {
    const pages: Page[] = [];
    for (const identity of ["ari", "sam"]) {
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
    const [a, b] = pages;
    await expect(a.locator("#people")).toHaveText("2 PLAYERS");
    const aid = await a.evaluate(
        () => (window as any).zoomapActionYard.world.session,
      ),
      bid = await b.evaluate(
        () => (window as any).zoomapActionYard.world.session,
      );
    // Walk around the ball using only public movement input; no test teleports or state injection.
    await driveTo(b, -0.3, -3);
    await driveTo(b, -0.3, 5);
    await driveTo(b, -2, 5);
    await equip(b, "rebound-panel");
    await b.evaluate(() => {
      const w = (window as any).zoomapActionYard.world;
      w.setToolAim(0, -1);
      w.useTool(true);
    });
    await equip(a, "tether-winch");
    await a.evaluate(() =>
      (window as any).zoomapActionYard.world.setToolAim(0, 1),
    );
    await a.locator("#yard canvas").focus();
    await a.keyboard.down("q");
    await expect
      .poll(() =>
        a.evaluate(() => {
          const w = (window as any).zoomapActionYard.world;
          return w.state.actions.players[w.session].target;
        }),
      )
      .toBe("ball");
    await expect
      .poll(() =>
        b.evaluate(
          () => (window as any).zoomapActionYard.world.state.toys.ball.z,
        ),
      )
      .toBeLessThan(-0.7);
    await a.keyboard.up("q");
    await expect
      .poll(
        () =>
          b.evaluate(() =>
            (window as any).zoomapActionYard.world.state.actions.events.some(
              (event: any) => event.kind === "rebound",
            ),
          ),
        { timeout: 7000 },
      )
      .toBe(true);
    const pass = await b.evaluate(() =>
      (window as any).zoomapActionYard.world.state.actions.events.map(
        (event: any) => ({ kind: event.kind, session: event.session }),
      ),
    );
    expect(pass).toEqual(
      expect.arrayContaining([
        { kind: "pitch", session: aid },
        { kind: "rebound", session: bid },
      ]),
    );
    await b.evaluate(() =>
      (window as any).zoomapActionYard.world.useTool(false),
    );
    await driveTo(b, -2, -1.1);
    await equip(a, "wake-driver");
    await a.evaluate(() =>
      (window as any).zoomapActionYard.world.setToolAim(0, 1),
    );
    const before = await a.evaluate(
      (session) => ({
        ...(window as any).zoomapActionYard.world.state.players[session],
      }),
      bid,
    );
    // Observe each rendered frame: a short, real jump can occur entirely between polling intervals.
    await a.evaluate((session) => {
      const observation = { maximumHeight: 0, until: performance.now() + 4000 };
      (window as any).actionObservation = observation;
      const observe = () => {
        const body = (window as any).zoomapActionYard.world.state.players[
          session
        ];
        observation.maximumHeight = Math.max(
          observation.maximumHeight,
          body?.y ?? 0,
        );
        if (performance.now() < observation.until)
          requestAnimationFrame(observe);
      };
      observe();
    }, bid);
    await a.locator("#use-tool").focus();
    await a.keyboard.down("Space");
    await a.keyboard.up("Space");
    await expect
      .poll(() =>
        a.evaluate(() => (window as any).actionObservation.maximumHeight),
      )
      .toBeGreaterThan(0.1)
      .catch(async (error) => {
        console.log(
          "PULSE FAILURE",
          JSON.stringify({
            before,
            current: await a.evaluate(() => {
              const app = (window as any).zoomapActionYard;
              return {
                state: app.world.state,
                readiness: app.kit.diagnostics().readiness,
                focus: document.activeElement?.id,
                observation: (window as any).actionObservation,
              };
            }),
          }),
        );
        throw error;
      });
    await expect
      .poll(() =>
        b.evaluate(() => {
          const w = (window as any).zoomapActionYard.world;
          return w.state.players[w.session].z;
        }),
      )
      .toBeGreaterThan(before.z + 0.2);
    const pulse = await a.evaluate(() =>
      (window as any).zoomapActionYard.world.state.actions.events.findLast(
        (event: any) => event.kind === "pulse",
      ),
    );
    expect(pulse.session).toBe(aid);
    const c = await context.newPage();
    c.on("pageerror", (error) => errors.push(error.message));
    await c.goto("/action.html?as=jo");
    await expect(c.locator("#connection")).toHaveText("Live together");
    await c.evaluate(async (url) => {
      await (window as any).zoomapActionYard.world.enter({
        url,
        room: "action-yard",
        credential: async () => "jo",
      });
    }, proxy.url);
    await expect(b.locator("#people")).toHaveText("3 PLAYERS");
    await expect
      .poll(() =>
        c.evaluate(
          (session) =>
            (window as any).zoomapActionYard.world.state.actions.players[
              session
            ]?.tool,
          aid,
        ),
      )
      .toBe("wake-driver");
    const previousEpoch = await b.evaluate(
        () => (window as any).zoomapActionYard.world.epoch,
      ),
      started = Date.now();
    await a.close();
    await expect
      .poll(() =>
        b.evaluate(() => (window as any).zoomapActionYard.world.epoch),
      )
      .toBeGreaterThan(previousEpoch);
    await expect(b.locator("#connection")).toHaveText("Live together");
    const recoveryMs = Date.now() - started;
    expect(recoveryMs).toBeLessThan(5000);
    await expect
      .poll(async () => {
        const [one, two] = await Promise.all(
          [b, c].map((page) =>
            page.evaluate(
              () => (window as any).zoomapActionYard.world.state.toys.ball,
            ),
          ),
        );
        return Math.hypot(one.x - two.x, one.y - two.y, one.z - two.z);
      })
      .toBeLessThan(0.6);
    const record = await b.evaluate(() => {
      const app = (window as any).zoomapActionYard;
      return {
        bytes: new TextEncoder().encode(
          JSON.stringify({
            type: "snapshot",
            epoch: app.world.epoch,
            state: app.world.state,
          }),
        ).length,
        state: app.world.state,
        field: app.kit.diagnostics(),
        traffic: app.world.traffic,
      };
    });
    expect(record.bytes).toBeLessThan(65536);
    expect(record.state.actions.events.length).toBeLessThanOrEqual(32);
    expect(errors).toEqual([]);
    await mkdir("docs/evidence/actions", { recursive: true });
    await b
      .locator(".field")
      .screenshot({ path: "docs/evidence/actions/shared-yard.png" });
    await writeFile(
      "docs/evidence/actions/multiplayer.json",
      JSON.stringify(
        {
          provenance:
            "Three actual browser peers; public movement and shared action APIs; 75 ms each direction ±15 ms jitter, every 50th snapshot dropped by ordered application-message proxy. One recovery sample, not p95 or a phone claim.",
          recoveryMs,
          pass,
          pulse,
          ...record,
        },
        null,
        2,
      ) + "\n",
    );
    // A separate review view uses live player movement and equipment, after gameplay assertions.
    await driveTo(b, -1, -3);
    await driveTo(c, -3, -1);
    await equip(c, "wake-driver");
    for (const page of [b, c])
      await page.evaluate(() =>
        (window as any).zoomapActionYard.world.setToolAim(1, 1),
      );
    await expect
      .poll(() =>
        b.evaluate(() => {
          const players = (window as any).zoomapActionYard.world.state.actions
            .players;
          return Object.values(players).every(
            (player: any) => player.aim.x > 0.7 && player.aim.z > 0.7,
          );
        }),
      )
      .toBe(true);
    await expect
      .poll(() =>
        b.evaluate(
          () =>
            (window as any).zoomapActionYard.kit
              .diagnostics()
              .equipment.filter((e: any) => e.equippedHands === 2).length,
        ),
      )
      .toBe(2);
    await b
      .locator(".field")
      .screenshot({ path: "docs/evidence/actions/two-tools-review.png" });
  } finally {
    await context.close();
    await proxy.close();
  }
});

test("Action Yard holds focused keyboard actions, cancels interrupted input, and remains usable on a portrait screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/action.html?as=ari");
  await expect(page.locator("#connection")).toHaveText("Live together");
  await expect(page.locator("#camera-scale")).toHaveText("2×");
  await page.getByRole("button", { name: "See more of the yard" }).click();
  await expect(page.locator("#camera-scale")).toHaveText("1.8×");
  await page.getByRole("button", { name: "See the tools closer" }).click();
  await expect(page.locator("#camera-scale")).toHaveText("2×");
  await equip(page, "rebound-panel");
  await page.locator("#use-tool").focus();
  await page.keyboard.down("Space");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const w = (window as any).zoomapActionYard.world;
        return w.state.actions.players[w.session].held;
      }),
    )
    .toBe(true);
  await page.keyboard.up("Space");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const w = (window as any).zoomapActionYard.world;
        return w.state.actions.players[w.session].held;
      }),
    )
    .toBe(false);
  await page.locator("#use-tool").hover();
  await page.mouse.down();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const w = (window as any).zoomapActionYard.world;
        return w.state.actions.players[w.session].phase;
      }),
    )
    .toBe("braced");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const w = (window as any).zoomapActionYard.world;
        return w.state.actions.players[w.session].held;
      }),
    )
    .toBe(false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await mkdir("docs/evidence/actions", { recursive: true });
  await page.screenshot({
    path: "docs/evidence/actions/portrait-yard.png",
    fullPage: true,
  });
});

test("a failed approved equipment instance gates use and Retry prepares the same accepted tool", async ({
  page,
}) => {
  await page.goto("/action.html?as=ari");
  await expect(page.locator("#connection")).toHaveText("Live together");
  await equip(page, "rebound-panel");
  // Tools are prefetched. Fail the public instantiation dependency once, after a valid old pair exists.
  await page.evaluate(async () => {
    const moduleURL = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .find((url) =>
        /(?:\/avatar-studio\/lib\/index\.js|@zmap_avatar-studio\.js)(?:\?|$)/.test(
          url,
        ),
      );
    if (!moduleURL)
      throw Error("Could not find the loaded Avatar Studio public module");
    const { WieldLibrary } = await import(moduleURL);
    const instantiate = WieldLibrary.prototype.instantiate;
    WieldLibrary.prototype.instantiate = function (asset: any) {
      if (asset.id === "wield-tether-winch") {
        WieldLibrary.prototype.instantiate = instantiate;
        return Promise.reject(
          Error("Injected approved equipment instance failure"),
        );
      }
      return instantiate.call(this, asset);
    };
  });
  await page.locator("#pick-tether-winch").click();
  await expect(page.locator("#retry-equipment")).toBeVisible();
  await expect(page.locator("#use-tool")).toBeDisabled();
  await expect(page.locator("#tool-phase")).toHaveText(
    "Equipment needs attention",
  );
  await page.locator("#yard canvas").focus();
  await page.keyboard.press("q");
  const failed = await page.evaluate(() => {
    const app = (window as any).zoomapActionYard;
    return {
      state: app.world.state.actions.players[app.world.session],
      readiness: app.kit
        .diagnostics()
        .readiness.find((entry: any) => entry.session === app.world.session),
    };
  });
  expect(failed.state.tool).toBe("tether-winch");
  expect(failed.state.held).toBe(false);
  expect(failed.readiness.ready).toBe(false);
  await page.getByRole("button", { name: "Retry equipment" }).click();
  await expect(page.locator("#use-tool")).toBeEnabled();
  await expect(page.locator("#retry-equipment")).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const app = (window as any).zoomapActionYard;
        return app.kit
          .diagnostics()
          .readiness.find((entry: any) => entry.session === app.world.session);
      }),
    )
    .toMatchObject({
      desired: "tether-winch",
      ready: true,
      pending: false,
      error: null,
    });
  await expect(page.locator("#feedback")).toContainText(
    "Tether winch is ready",
  );
});
