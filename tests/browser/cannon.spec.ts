import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { networkProxy } from "../helpers/network-proxy";

async function ready(page: Page, identity: string) {
  await page.goto(`/action.html?as=${identity}`);
  await expect(page.locator("#connection")).toHaveText("Live together");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).zoomapActionYard.cannon.diagnostics().ready,
      ),
    )
    .toBe(true);
}
async function walk(page: Page, x: number, z: number) {
  await page.evaluate(
    ({ x, z }) => {
      const app = (window as any).zoomapActionYard;
      if (!app.movement.moveTo({ x, y: 0, z }))
        throw Error("No walking route to cannon");
    },
    { x, z },
  );
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ x, z }) => {
            const body = (window as any).zoomapActionYard.world.local;
            return Math.hypot(body.x - x, body.z - z);
          },
          { x, z },
        ),
      { timeout: 12000 },
    )
    .toBeLessThan(0.2);
}
const events = (page: Page) =>
  page.evaluate(
    () => (window as any).zoomapActionYard.world.state.objects.events,
  );

test("a kicked existing ball completes one shared cannon fuse across late join and host loss", async ({
  browser,
}) => {
  test.setTimeout(70000);
  const proxy = await networkProxy("ws://127.0.0.1:8790/room");
  const context = await browser.newContext();
  const errors: string[] = [];
  try {
    const pages: Page[] = [];
    for (const identity of ["ari", "sam", "jo"]) {
      const page = await context.newPage();
      pages.push(page);
      page.on("pageerror", (error) => errors.push(error.message));
      await ready(page, identity);
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
    // Preloaded Jo really leaves and rejoins during the accepted fuse.
    await c.evaluate(() => (window as any).zoomapActionYard.world.leave());
    await expect(a.locator("#people")).toHaveText("2 PLAYERS");
    await walk(b, 7.8, -5.2);
    await a.locator("#visit-cannon").click();
    await expect
      .poll(
        () =>
          a.evaluate(() => {
            const body = (window as any).zoomapActionYard.world.local;
            return Math.hypot(body.x - 6, body.z + 7.22);
          }),
        { timeout: 12000 },
      )
      .toBeLessThan(0.2);
    const before = await a.evaluate(() => {
      const app = (window as any).zoomapActionYard;
      return {
        ids: Object.keys(app.world.state.toys).sort(),
        epoch: app.world.epoch,
        asset: app.cannon.diagnostics(),
      };
    });
    const peerSessions = new Map<string, Page>();
    for (const [index, session] of (
      await Promise.all(
        [a, b].map((page) =>
          page.evaluate(() => (window as any).zoomapActionYard.world.session),
        ),
      )
    ).entries())
      peerSessions.set(session, [a, b][index]);
    expect(before.asset.assetBytes).toBeLessThan(2 * 1024 * 1024);
    await a.locator("#kick-ball").click();
    await expect
      .poll(
        async () =>
          (await events(b)).find((event: any) => event.kind === "fuse"),
        { intervals: [20, 20, 30] },
      )
      .toBeTruthy();
    const fused = (await events(b)).find((event: any) => event.kind === "fuse");
    expect(fused.data.toy).toBe("cannon-ball");
    await c.evaluate(async (url) => {
      await (window as any).zoomapActionYard.world.enter({
        url,
        room: "action-yard",
        credential: async () => "jo",
      });
    }, proxy.url);
    await expect
      .poll(
        () =>
          c.evaluate(
            () =>
              (window as any).zoomapActionYard.world.state.objects.instances[
                "courtyard-cannon"
              ].balls["cannon-ball"]?.phase,
          ),
        { intervals: [10, 20, 20], timeout: 1500 },
      )
      .toBe("fuse");
    const joining = await c.evaluate(() => {
      const w = (window as any).zoomapActionYard.world;
      return {
        tick: w.state.tick,
        session: w.session,
        object: w.state.objects.instances["courtyard-cannon"],
        events: w.state.objects.events,
      };
    });
    expect(joining.object.balls["cannon-ball"]).toMatchObject({
      phase: "fuse",
      startedTick: fused.tick,
      untilTick: fused.tick + 24,
    });
    peerSessions.set(joining.session, c);
    const hostId = await b.evaluate(
      () => (window as any).zoomapActionYard.world.host,
    );
    const closing = peerSessions.get(hostId)!;
    expect(closing).toBeTruthy();
    const authority = await closing.evaluate(() => {
      const world = (window as any).zoomapActionYard.world;
      const ball =
        world.state.objects.instances["courtyard-cannon"].balls["cannon-ball"];
      return {
        host: world.host,
        session: world.session,
        epoch: world.epoch,
        tick: world.state.tick,
        phase: ball?.phase,
        remainingTicks: (ball?.untilTick ?? 0) - world.state.tick,
      };
    });
    expect(authority.host).toBe(authority.session);
    expect(authority.phase).toBe("fuse");
    expect(authority.remainingTicks).toBeGreaterThanOrEqual(3);
    const survivors = [a, b, c].filter((page) => page !== closing);
    const [observer, follower] = survivors;
    const recoveryStart = Date.now();
    await closing.close();
    await expect
      .poll(() =>
        observer.evaluate(() => (window as any).zoomapActionYard.world.epoch),
      )
      .toBeGreaterThan(authority.epoch);
    await expect
      .poll(
        async () =>
          (await events(observer)).filter((event: any) => event.kind === "fire")
            .length,
        { timeout: 5000, intervals: [20, 30, 50] },
      )
      .toBe(1);
    const recoveryMs = Date.now() - recoveryStart;
    await expect
      .poll(
        async () =>
          (await events(follower)).filter((event: any) => event.kind === "fire")
            .length,
      )
      .toBe(1);
    const [bEvents, cEvents] = await Promise.all([
      events(observer),
      events(follower),
    ]);
    const launch = bEvents.find((event: any) => event.kind === "fire");
    expect(cEvents.find((event: any) => event.kind === "fire")).toEqual(launch);
    expect(launch.tick - fused.tick).toBe(24);
    expect(launch.data).toMatchObject({
      toy: "cannon-ball",
      velocity: { x: 0, y: 0, z: 14 },
    });
    expect(launch.data.position.x).toBeCloseTo(6);
    expect(launch.data.position.y).toBeCloseTo(0.85);
    expect(launch.data.position.z).toBeCloseTo(-2.68);
    const record = await observer.evaluate(() => {
      const app = (window as any).zoomapActionYard;
      return {
        ids: Object.keys(app.world.state.toys).sort(),
        state: app.world.state,
        cannon: app.cannon.diagnostics(),
        renderer: app.world.view.diagnostics(),
      };
    });
    expect(record.ids).toEqual(before.ids);
    expect(record.state.toys["cannon-ball"].teleportEpoch).toBe(1);
    expect(record.state.toys["cannon-ball"].vz).toBeGreaterThan(8);
    expect(record.state.objects.events.length).toBeLessThanOrEqual(32);
    expect(JSON.stringify(record.state).length).toBeLessThan(65536);
    expect(recoveryMs).toBeLessThan(5000);
    expect(errors).toEqual([]);
    await mkdir("docs/evidence/cannon", { recursive: true });
    await observer
      .locator(".field")
      .screenshot({ path: "docs/evidence/cannon/shared-launch.png" });
    await writeFile(
      "docs/evidence/cannon/multiplayer.json",
      JSON.stringify(
        {
          provenance:
            "Three actual browser clients, public navigation and Kick button only; 75ms each direction ±15ms jitter and every50th snapshot dropped. Jo rejoined during the fuse; the actual elected host closed with fuse ticks remaining. One desktop sample, not a physical-phone or p95 claim.",
          before,
          fused,
          joining,
          launch,
          recoveryMs,
          departedHost: authority,
          ...record,
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

test("cannon asset failure stops room entry with an actionable message", async ({
  page,
}) => {
  await page.route("**/models/ball-cannon.glb", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.goto("/action.html?as=ari");
  await expect(page.locator("#loading")).toContainText(
    "Ball cannon model unavailable (503)",
  );
  await expect(page.locator("#loading")).toContainText("Reload to retry");
  await expect(page.locator("#visit-cannon")).toBeDisabled();
  expect(
    await page.evaluate(() => !!(window as any).zoomapActionYard?.world),
  ).toBe(false);
});

test("reduced motion preserves the cannon timeline and removes recoil and particles", async ({
  browser,
}) => {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    await ready(page, "ari");
    await page.locator("#visit-cannon").click();
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const body = (window as any).zoomapActionYard.world.local;
            return Math.hypot(body.x - 6, body.z + 7.22);
          }),
        { timeout: 12000 },
      )
      .toBeLessThan(0.2);
    await page.locator("#kick-ball").click();
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as any).zoomapActionYard.cannon.diagnostics().instances[0]
                .phase,
          ),
        { intervals: [20, 30] },
      )
      .toBe("fusing");
    const fuse = await page.evaluate(
      () => (window as any).zoomapActionYard.cannon.diagnostics().instances[0],
    );
    expect(fuse.sparks).toBe(0);
    expect(fuse.recoil).toBe(0);
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as any).zoomapActionYard.cannon.diagnostics().instances[0]
                .phase,
          ),
        { intervals: [20, 30] },
      )
      .toBe("fired");
    const fired = await page.evaluate(
      () => (window as any).zoomapActionYard.cannon.diagnostics().instances[0],
    );
    expect(fired.smoke).toBe(0);
    expect(fired.trail).toBe(0);
    expect(fired.recoil).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  } finally {
    await context.close();
  }
});

test("the authored cannon visibly anticipates and recoils on its accepted shared timeline", async ({
  page,
}) => {
  await ready(page, "ari");
  await page.locator("#visit-cannon").click();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const body = (window as any).zoomapActionYard.world.local;
          return Math.hypot(body.x - 6, body.z + 7.22);
        }),
      { timeout: 12000 },
    )
    .toBeLessThan(0.2);
  await mkdir("docs/evidence/cannon", { recursive: true });
  await page
    .locator(".field")
    .screenshot({ path: "docs/evidence/cannon/courtyard-hero.png" });
  // Capture the real drawn mesh at three precise accepted phases. The extra render
  // only reads the scene and never changes physics, room state or input.
  await page.evaluate(() => {
    const app = (window as any).zoomapActionYard;
    const frame = app.world.options.visuals.frame;
    const captures: Record<
      string,
      { image: string; diagnostics: unknown; tick: number }
    > = {};
    (window as any).cannonCaptures = captures;
    app.world.options.visuals.frame = (context: any) => {
      frame(context);
      const diagnostics = app.cannon.diagnostics().instances[0];
      const phase =
        diagnostics.phase === "fusing" && diagnostics.progress > 0.4
          ? "fuse"
          : diagnostics.phase === "fired" && diagnostics.fireAge > 0.13
            ? "burst"
            : diagnostics.phase === "fired" && diagnostics.recoil < -0.12
              ? "fire"
              : null;
      if (phase && !captures[phase]) {
        app.world.view.renderer.render(
          app.world.view.scene,
          app.world.view.camera,
        );
        captures[phase] = {
          image: app.world.view.canvas.toDataURL("image/png"),
          diagnostics,
          tick: context.state.tick,
        };
      }
      if (captures.fuse && captures.fire && captures.burst)
        app.world.options.visuals.frame = frame;
    };
  });
  await page.locator("#kick-ball").click();
  await expect
    .poll(
      () =>
        page.evaluate(() => Object.keys((window as any).cannonCaptures).sort()),
      { intervals: [20, 30] },
    )
    .toEqual(["burst", "fire", "fuse"]);
  const captures = await page.evaluate(() => (window as any).cannonCaptures);
  expect(captures.fuse.diagnostics.sparks).toBe(10);
  expect(captures.fire.diagnostics.smoke).toBe(16);
  expect(captures.fire.diagnostics.recoil).toBeLessThan(-0.12);
  for (const phase of ["fuse", "fire", "burst"]) {
    await writeFile(
      `docs/evidence/cannon/courtyard-${phase}.png`,
      Buffer.from(captures[phase].image.split(",")[1], "base64"),
    );
    delete captures[phase].image;
  }
  await writeFile(
    "docs/evidence/cannon/render-timeline.json",
    JSON.stringify(captures, null, 2) + "\n",
  );
});

test("closing during avatar preparation releases its eventual result and never starts a cannon load", async ({
  page,
}) => {
  let releaseCatalog!: () => void,
    catalogStarted!: () => void,
    cannonRequests = 0;
  const held = new Promise<void>((resolve) => {
    releaseCatalog = resolve;
  });
  const started = new Promise<void>((resolve) => {
    catalogStarted = resolve;
  });
  await page.route("**/avatars/catalog.json", async (route) => {
    catalogStarted();
    await held;
    await route.continue();
  });
  await page.route("**/models/ball-cannon.glb", async (route) => {
    cannonRequests++;
    await route.fulfill({ status: 503, body: "should not load after close" });
  });
  try {
    await page.goto("/action.html?as=ari");
    await started;
    await page.evaluate(async () => {
      const moduleURL = performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .find((url) =>
          /(?:\/avatar-studio\/lib\/index\.js|@zmap_avatar-studio\.js)(?:\?|$)/.test(
            url,
          ),
        );
      if (!moduleURL) throw Error("Missing Avatar Studio public module");
      const { AvatarLibrary, WieldLibrary } = await import(moduleURL);
      const calls = { avatar: 0, wield: 0 };
      (window as any).startupDisposals = calls;
      for (const [name, library] of [
        ["avatar", AvatarLibrary],
        ["wield", WieldLibrary],
      ] as const) {
        const dispose = library.prototype.dispose;
        library.prototype.dispose = function () {
          calls[name]++;
          return dispose.call(this);
        };
      }
      window.dispatchEvent(new PageTransitionEvent("pagehide"));
    });
    releaseCatalog();
    await expect
      .poll(() => page.evaluate(() => (window as any).startupDisposals))
      .toEqual({ avatar: 1, wield: 1 });
    expect(cannonRequests).toBe(0);
    expect(await page.evaluate(() => !!(window as any).zoomapActionYard)).toBe(
      false,
    );
  } finally {
    releaseCatalog();
  }
});

test("a room-entry failure releases navigation frames and every prepared visual kit", async ({
  page,
}) => {
  let releaseModel!: () => void, modelStarted!: () => void;
  const held = new Promise<void>((resolve) => {
    releaseModel = resolve;
  });
  const started = new Promise<void>((resolve) => {
    modelStarted = resolve;
  });
  await page.route("**/models/ball-cannon.glb", async (route) => {
    modelStarted();
    await held;
    await route.continue();
  });
  try {
    await page.goto("/action.html?as=ari");
    await started;
    await page.evaluate(async () => {
      const moduleURL = performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .find((url) => /\/src\/index\.ts(?:\?|$)/.test(url));
      if (!moduleURL) throw Error("Missing Zoomap public module");
      const { Zoomap } = await import(moduleURL);
      Zoomap.prototype.enter = async function () {
        throw Error("Injected room-entry failure");
      };
      const pending = new Set<number>();
      (window as any).startupFrames = pending;
      const request = window.requestAnimationFrame.bind(window),
        cancel = window.cancelAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => {
        const id = request((time) => {
          pending.delete(id);
          callback(time);
        });
        pending.add(id);
        return id;
      };
      window.cancelAnimationFrame = (id) => {
        pending.delete(id);
        cancel(id);
      };
    });
    releaseModel();
    await expect(page.locator("#loading")).toContainText(
      "Injected room-entry failure",
    );
    await expect(page.locator("#yard canvas")).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => (window as any).startupFrames.size))
      .toBe(0);
    expect(
      await page.evaluate(() => {
        const app = (window as any).zoomapActionYard;
        return {
          cannonReady: app.cannon.diagnostics().ready,
          characters: app.kit.diagnostics().characters,
          target: app.movement.state().target,
          status: app.world.status,
        };
      }),
    ).toEqual({
      cannonReady: false,
      characters: 0,
      target: null,
      status: "left",
    });
    await expect(page.locator("#visit-cannon")).toBeDisabled();
  } finally {
    releaseModel();
  }
});
