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
