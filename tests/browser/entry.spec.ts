import { test, expect } from "@playwright/test";

// Qualify the real entry path separately so a renderer/proxy failure does not
// masquerade as dozens of unrelated interaction failures on another platform.
test("room entry completes without browser errors through the real demo proxy", async ({
  page,
}) => {
  const started = Date.now();
  const events: { ms: number; kind: string; detail: string }[] = [];
  const errors: string[] = [];
  const record = (kind: string, detail: string) => {
    if (events.length < 80)
      events.push({ ms: Date.now() - started, kind, detail });
  };
  page.on("pageerror", (error) => {
    errors.push(error.message);
    record("pageerror", error.message);
  });
  page.on("requestfailed", (request) =>
    record(
      "requestfailed",
      new URL(request.url()).pathname + ": " + request.failure()?.errorText,
    ),
  );
  page.on("websocket", (socket) => {
    record("websocket", new URL(socket.url()).pathname);
    socket.on("socketerror", (error) => record("socketerror", String(error)));
    socket.on("framereceived", ({ payload }) => {
      try {
        const m = JSON.parse(String(payload));
        record("message", String(m.type));
      } catch {
        record("message", "invalid JSON");
      }
    });
  });
  try {
    await page.goto("/action.html?as=ari");
    await expect(page.locator("#connection")).toHaveText("Live together", {
      timeout: 10000,
    });
    expect(errors).toEqual([]);
  } finally {
    console.log("Entry diagnostics: " + JSON.stringify(events));
  }
});

test("two clients enter with frame and host diagnostics", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const events: unknown[] = [];
  try {
    for (const identity of ["ari", "sam"]) {
      const page = await context.newPage();
      page.on("pageerror", (e) => events.push({ identity, error: e.message }));
      page.on("websocket", (socket) => {
        if (!socket.url().includes("action-room")) return;
        socket.on("framereceived", ({ payload }) => {
          const m = JSON.parse(String(payload));
          if (["room", "welcome", "error"].includes(m.type))
            events.push({
              identity,
              type: m.type,
              host: m.host,
              epoch: m.epoch,
              code: m.code,
            });
        });
        socket.on("framesent", ({ payload }) => {
          const m = JSON.parse(String(payload));
          if (m.type === "heartbeat")
            events.push({ identity, type: m.type, eligible: m.eligible });
        });
      });
      await page.goto(`/action.html?as=${identity}`);
      await expect(page.locator("#connection")).toHaveText("Live together", {
        timeout: 10000,
      });
    }
    for (const page of context.pages())
      await expect(page.locator("#people")).toHaveText("2 PLAYERS");
  } finally {
    for (const page of context.pages()) {
      events.push(
        await page
          .evaluate(() => {
            const w = (window as any).zoomapActionYard?.world;
            return {
              status: w?.status,
              host: w?.host,
              session: w?.session,
              hidden: document.hidden,
              tick: w?.state?.tick,
            };
          })
          .catch(() => ({ unresponsive: true })),
      );
    }
    console.log(
      "Two-client diagnostics: " + JSON.stringify(events.slice(-100)),
    );
    await context.close();
  }
});
