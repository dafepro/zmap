import { test, expect } from "@playwright/test";
import { networkProxy } from "../helpers/network-proxy";
import { writeFile } from "node:fs/promises";
test("three real browsers converge through shaped traffic, host loss and a dropped durable acknowledgment", async ({
  browser,
}) => {
  test.setTimeout(45000);
  const proxy = await networkProxy("ws://127.0.0.1:8788/room");
  const context = await browser.newContext();
  const pages = [];
  try {
    for (const identity of ["ari", "sam"]) {
      const page = await context.newPage();
      pages.push(page);
      await page.goto(`/?mode=shared&as=${identity}`);
      await expect(page.locator("#status")).toHaveText("Live together");
      await page.evaluate(
        async ({ url, identity }) => {
          await (window as any).zoomapExample.world.enter({
            url,
            room: "shared",
            credential: async () => identity,
          });
        },
        { url: proxy.url, identity },
      );
    }
    const [a, b] = pages;
    await expect(a.locator("#count")).toHaveText("2 / 20");
    const inputAt = Date.now();
    await a.locator("canvas").focus();
    await a.keyboard.down("d");
    const start = await a.evaluate(
      () => (window as any).zoomapExample.world.local.x,
    );
    await expect
      .poll(() => a.evaluate(() => (window as any).zoomapExample.world.local.x))
      .toBeGreaterThan(start + 0.1);
    await a.keyboard.up("d");
    const localResponseSample = Date.now() - inputAt;
    await a.evaluate(() => {
      const w = (window as any).zoomapExample.world;
      w.action("kick");
    });
    await b.evaluate(() => {
      (window as any).zoomapExample.world.action("kick");
    });
    const c = await context.newPage();
    pages.push(c);
    await c.goto("/?mode=shared&as=jo");
    await expect(c.locator("#status")).toHaveText("Live together");
    await c.evaluate(async (url) => {
      await (window as any).zoomapExample.world.enter({
        url,
        room: "shared",
        credential: async () => "jo",
      });
    }, proxy.url);
    await expect(b.locator("#count")).toHaveText("3 / 20");
    const before = await b.evaluate(() => {
      const w = (window as any).zoomapExample.world;
      return { epoch: w.epoch, host: w.host, session: w.session };
    });
    const at = Date.now();
    await a.close();
    await expect
      .poll(() => b.evaluate(() => (window as any).zoomapExample.world.epoch))
      .toBeGreaterThan(before.epoch);
    await expect(b.locator("#status")).toHaveText("Live together");
    const recoveryMs = Date.now() - at;
    expect(recoveryMs).toBeLessThan(5000);
    // Identical content command is resent after the proxy drops its saved reply AND connection.
    const revision = await b.evaluate(
      () => (window as any).zoomapExample.world.durable.revision,
    );
    const existing = await b.evaluate(() =>
      (window as any).zoomapExample.world.durable.items.find(
        (i: any) => i.id === "network-pot",
      ),
    );
    const command = {
      id: `network-${Date.now()}`,
      operation: existing ? "move" : "place",
      itemId: "network-pot",
      type: "planter",
      position: { x: 10, y: 0, z: 4 },
      rotation: 0,
      expectedRevision: existing?.revision ?? 0,
    };
    proxy.dropNextSaved();
    await b.evaluate(async (command) => {
      await (window as any).zoomapExample.world.edit(command);
    }, command);
    await expect
      .poll(() =>
        c.evaluate(() => (window as any).zoomapExample.world.durable.revision),
      )
      .toBe(revision + 1);
    expect(
      await c.evaluate(
        () =>
          (window as any).zoomapExample.world.durable.items.filter(
            (i: any) => i.id === "network-pot",
          ).length,
      ),
    ).toBe(1);
    await expect
      .poll(
        async () => {
          const poses = await Promise.all(
            [b, c].map((p) =>
              p.evaluate(() => {
                const t = (window as any).zoomapExample.world.state.toys.ball;
                return { x: t.x, y: t.y, z: t.z };
              }),
            ),
          );
          return Math.hypot(
            poses[0].x - poses[1].x,
            poses[0].y - poses[1].y,
            poses[0].z - poses[1].z,
          );
        },
        { timeout: 15000 },
      )
      .toBeLessThan(0.15);
    const placed = await b.evaluate(() =>
      (window as any).zoomapExample.world.durable.items.find(
        (i: any) => i.id === "network-pot",
      ),
    );
    await b.evaluate(
      async (command) => {
        await (window as any).zoomapExample.world.edit(command);
      },
      {
        ...command,
        id: `return-${Date.now()}`,
        operation: "remove",
        expectedRevision: placed.revision,
      },
    );
    await writeFile(
      "docs/evidence/network-sample.json",
      JSON.stringify(
        {
          date: new Date().toISOString(),
          browser: browser.version(),
          clients: 3,
          method:
            "Real browser clients, ordered application-message proxy, 75 ms per direction ±15 ms jitter; every 50th snapshot dropped. Not packet-level loss. One recovery sample, not p95. No full-room/phone claim.",
          recoveryMs,
          localResponseSampleMs: localResponseSample,
          durableCommitsForRetriedCommand: 1,
          ...proxy.stats(),
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
