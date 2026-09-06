import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExampleStore } from "../examples/store";
import { courtyard, catalog, identities } from "../examples/content";
import type { EditCommand } from "zmap/core";
const command = (id = "command-1"): EditCommand => ({
  id,
  operation: "place",
  itemId: "ari-planter",
  type: "planter",
  position: { x: 10, y: 0, z: 4 },
  rotation: 0,
  expectedRevision: 0,
});
test("durable ownership, retries, CAS and restart preserve exactly one acknowledged placement", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zmap-store-"));
  try {
    const store = new ExampleStore(dir, () => true);
    const first = await store.commit(
      "test",
      identities.ari,
      command(),
      courtyard,
      catalog,
    );
    assert.equal(first.items.length, 1);
    assert.equal(
      (
        await store.commit(
          "test",
          identities.ari,
          command(),
          courtyard,
          catalog,
        )
      ).revision,
      1,
    );
    await assert.rejects(
      store.commit(
        "test",
        identities.ari,
        { ...command(), rotation: 1 },
        courtyard,
        catalog,
      ),
      /different content/,
    );
    await assert.rejects(
      store.commit(
        "test",
        identities.sam,
        { ...command("forged"), operation: "remove", expectedRevision: 1 },
        courtyard,
        catalog,
      ),
      /Only the owner/,
    );
    await assert.rejects(
      store.commit(
        "test",
        identities.ari,
        { ...command("stale"), operation: "move", expectedRevision: 0 },
        courtyard,
        catalog,
      ),
      /refresh/,
    );
    const restarted = new ExampleStore(dir, () => true);
    assert.deepEqual(await restarted.load("test", courtyard), first);
    await restarted.commit(
      "test",
      identities.ari,
      { ...command("return"), operation: "remove", expectedRevision: 1 },
      courtyard,
      catalog,
    );
    assert.equal((await restarted.load("test", courtyard)).items.length, 0);
    // Late retry after return cannot resurrect the original item.
    assert.equal(
      (
        await restarted.commit(
          "test",
          identities.ari,
          command(),
          courtyard,
          catalog,
        )
      ).items.length,
      0,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("concurrent inventory claims, invalid support, protected routes and missing entitlement reject", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zmap-store-"));
  try {
    const store = new ExampleStore(dir, () => true);
    const result = await Promise.allSettled([
      store.commit("test", identities.ari, command("one"), courtyard, catalog),
      store.commit(
        "test",
        identities.ari,
        { ...command("two"), itemId: "duplicate" },
        courtyard,
        catalog,
      ),
    ]);
    assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
    await assert.rejects(
      store.commit(
        "other",
        identities.ari,
        { ...command(), position: { x: 0, y: 0, z: 10 } },
        courtyard,
        catalog,
      ),
      /garden/,
    );
    await assert.rejects(
      store.commit(
        "other",
        identities.ari,
        { ...command(), position: { x: 10, y: 3, z: 4 } },
        courtyard,
        catalog,
      ),
      /surface/,
    );
    const locked = new ExampleStore(dir, () => false);
    await assert.rejects(
      locked.commit("other", identities.sam, command(), courtyard, catalog),
      /inventory/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
