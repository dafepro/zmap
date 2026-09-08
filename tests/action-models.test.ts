import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { WieldController } from "@zmap/avatar-studio";
import { initialSimulation, bodyAt } from "../src/core";
import { syncActionPlayers } from "../src/world-actions";
import { disposeObject } from "../src/view";
import { actionYard } from "../examples/action-content";
import { loadActionKit } from "../examples/action-models";
import "../avatar-studio/tests/helpers/node-image";
const base = new URL("https://assets.test/avatars/");
const nativeFetch = globalThis.fetch;
const fetcher: typeof fetch = async (input) => {
  const url = new URL(String(input));
  if (url.protocol === "blob:") return nativeFetch(input);
  assert.equal(url.origin, base.origin);
  return new Response(
    await readFile(
      new URL(
        "../avatar-studio/public/" + url.pathname.replace(/^\/avatars\//, ""),
        import.meta.url,
      ),
    ),
  );
};
async function settled(kit: Awaited<ReturnType<typeof loadActionKit>>) {
  for (let count = 0; count < 100 && kit.diagnostics().pending; count++)
    await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal(kit.diagnostics().pending, 0);
}

test("action visual adapter keeps cable/pulse effects in world space and disposes a departed character's pending equipment without ghost errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetcher;
  const errors: unknown[] = [],
    scene = new THREE.Scene(),
    kit = await loadActionKit((error) => errors.push(error), base);
  try {
    kit.scenery(scene, actionYard);
    const character = kit.character({
        id: "test",
        name: "Test",
        appearance: "burgundy",
      }),
      state = initialSimulation(actionYard),
      body = bodyAt({ x: 4, y: 1, z: -2 });
    scene.add(character.object);
    state.players.test = body;
    syncActionPlayers(state);
    const action = state.actions!.players.test;
    action.tool = "tether-winch";
    action.phase = "reeling";
    action.target = "blue-ball";
    action.aim = { x: 0, z: 1 };
    const update = (time: number, reducedMotion = false) => {
      character.object.position.set(body.x, body.y, body.z);
      character.object.rotation.y = body.facing;
      character.update(body, time, {
        session: "test",
        state,
        reducedMotion,
        viewport: new THREE.Vector2(1000, 800),
      });
    };
    update(0.1);
    await settled(kit);
    update(0.15);
    const cable = character.object.getObjectByName("field-cable") as THREE.Line;
    assert.equal(cable.visible, true);
    character.object.updateMatrixWorld(true);
    const endpoint = new THREE.Vector3()
      .fromBufferAttribute(cable.geometry.getAttribute("position"), 1)
      .applyMatrix4(cable.matrixWorld);
    const toy = state.toys["blue-ball"],
      radius = actionYard.toys.find((toy) => toy.id === "blue-ball")!.radius;
    assert.ok(
      endpoint.distanceTo(new THREE.Vector3(toy.x, toy.y + radius, toy.z)) <
        1e-6,
    );
    state.tick = 10;
    state.actions!.events.push({
      id: 1,
      tick: 10,
      session: "test",
      tool: "wake-driver",
      kind: "pulse",
      position: { x: 2, y: 0.02, z: 3 },
    });
    update(0.2, true);
    const pulse = character.object.getObjectByName("field-pulse") as THREE.Mesh;
    assert.equal(pulse.visible, true);
    assert.equal(pulse.scale.x, 3);
    body.x = -3;
    body.z = 6;
    body.facing = 0.8;
    update(0.25, true);
    assert.ok(
      pulse
        .getWorldPosition(new THREE.Vector3())
        .distanceTo(new THREE.Vector3(2, 0.02, 3)) < 1e-6,
    );
    let disposed = 0;
    cable.geometry.addEventListener("dispose", () => disposed++);
    action.tool = "wake-driver";
    action.phase = "charging";
    action.target = null;
    update(0.3);
    character.dispose!();
    scene.remove(character.object);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(kit.diagnostics().characters, 0);
    assert.equal(kit.diagnostics().pending, 0);
    assert.equal(disposed, 1);
    assert.equal(character.object.children.length, 0);
    character.dispose!();
    assert.equal(disposed, 1);
    assert.deepEqual(errors, []);
  } finally {
    kit.dispose();
    disposeObject(scene);
    globalThis.fetch = originalFetch;
  }
});

test("visual readiness rejects a failed accepted tool, explicit retry preserves its intent, and stale errors cannot overwrite the latest request", async () => {
  const originalFetch = globalThis.fetch,
    originalSet = WieldController.prototype.setLoadout;
  globalThis.fetch = fetcher;
  let reject!: (error: Error) => void,
    delayedFailure = false,
    failPanel = true;
  const delayed = new Promise<never>((_, fail) => (reject = fail)),
    errors: unknown[] = [],
    kit = await loadActionKit((error) => errors.push(error), base);
  try {
    WieldController.prototype.setLoadout = async function (loadout) {
      if (loadout.twoHanded?.item === "wield-rebound-panel" && failPanel)
        throw Error("simulated verified load failure");
      const result = await originalSet.call(this, loadout);
      return loadout.twoHanded?.item === "wield-tether-winch" && delayedFailure
        ? delayed
        : result;
    };
    const character = kit.character({
        id: "test",
        name: "Test",
        appearance: "burgundy",
      }),
      state = initialSimulation(actionYard),
      body = bodyAt({ x: 0, y: 0, z: 0 });
    state.players.test = body;
    syncActionPlayers(state);
    const action = state.actions!.players.test;
    const update = () =>
      character.update(body, 0.1, {
        session: "test",
        state,
        reducedMotion: false,
        viewport: new THREE.Vector2(100, 100),
      });
    action.tool = "tether-winch";
    update();
    await settled(kit);
    assert.equal(kit.diagnostics().readiness[0].ready, true);
    action.tool = "rebound-panel";
    update();
    await settled(kit);
    assert.deepEqual(kit.diagnostics().readiness[0], {
      session: "test",
      desired: "rebound-panel",
      ready: false,
      pending: false,
      error: "simulated verified load failure",
    });
    assert.equal(errors.length, 1);
    failPanel = false;
    kit.retryFailed("different-session");
    assert.equal(
      kit.diagnostics().readiness[0].error,
      "simulated verified load failure",
    );
    kit.retryFailed("test");
    await settled(kit);
    assert.equal(kit.diagnostics().readiness[0].ready, true);
    assert.equal(kit.diagnostics().readiness[0].desired, "rebound-panel");
    delayedFailure = true;
    action.tool = "tether-winch";
    update();
    await new Promise((resolve) => setTimeout(resolve, 10));
    action.tool = "wake-driver";
    update();
    await settled(kit);
    reject(Error("obsolete failed request"));
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(errors.length, 1);
    assert.equal(kit.diagnostics().readiness[0].ready, true);
    assert.equal(kit.diagnostics().readiness[0].desired, "wake-driver");
    character.dispose!();
  } finally {
    WieldController.prototype.setLoadout = originalSet;
    kit.dispose();
    globalThis.fetch = originalFetch;
  }
});
