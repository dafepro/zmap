import * as THREE from "three";
import {
  AvatarLibrary,
  ComicStyle,
  WieldController,
  WieldLibrary,
  defaultRecipe,
  emptyWieldLoadout,
  fieldToolBehaviors,
  disposeAvatarResources,
  type AvatarInstance,
} from "@zmap/avatar-studio";
import type { Character, Identity, PlayerActionState, WorldMap } from "zmap";

/** App integration: identity selects appearance; accepted simulation state selects equipment. */
export async function loadActionKit(
  onError: (error: unknown) => void,
  base = new URL(`${import.meta.env.BASE_URL}avatars/`, location.href),
) {
  const equipmentBase = new URL("action/", base);
  const json = async (url: URL) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok)
      throw Error(`Field components unavailable (${response.status})`);
    return response.json();
  };
  const [catalog, equipment] = await Promise.all([
    json(new URL("catalog.json", base)),
    json(new URL("catalog.json", equipmentBase)),
  ]);
  const library = new AvatarLibrary(catalog, base.href),
    wieldLibrary = new WieldLibrary(equipment, equipmentBase.href);
  const appearances = new Map<string, () => AvatarInstance>();
  const choices = [
    {
      id: "burgundy",
      hair: "hair-sweep",
      skin: "#c68b60",
      color: "#ece8dd",
      weight: 0,
    },
    {
      id: "saffron",
      hair: "hair-halo",
      skin: "#855538",
      color: "#d4a149",
      weight: 0.55,
    },
    {
      id: "sage",
      hair: "hair-pony",
      skin: "#edc39d",
      color: "#547780",
      weight: -0.35,
    },
  ];
  try {
    // Await all settled before releasing a failed batch's shared source libraries.
    const prepared = await Promise.allSettled(
      choices.map(async (choice) => {
        const recipe = defaultRecipe(catalog);
        recipe.parts.hair = choice.hair;
        recipe.body = { weight: choice.weight };
        recipe.colors = {
          skin: choice.skin,
          hair: choice.id === "sage" ? "#ac793e" : "#302922",
          primary: choice.color,
          secondary: "#29383d",
        };
        appearances.set(choice.id, await library.prepare(recipe));
      }),
    );
    const failure = prepared.find((r) => r.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    const loaded = await Promise.allSettled(
      [
        ...wieldLibrary.catalog.items,
        ...Object.values(wieldLibrary.catalog.grips),
      ].map(async (item) => {
        const root = await wieldLibrary.instantiate(item);
        disposeAvatarResources(root);
      }),
    );
    const failed = loaded.find((r) => r.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  } catch (error) {
    library.dispose();
    wieldLibrary.dispose();
    throw error;
  }
  let closed = false;
  const toyRadii = new Map<string, number>();
  const report = (error: unknown) => {
    if (!closed) {
      try {
        onError(error);
      } catch {
        /* the host cannot interrupt visual cleanup */
      }
    }
  };
  const owned = new Set<{
    dispose(): void;
    wield: WieldController;
    get pending(): boolean;
    readiness(): {
      session: string | null;
      desired: string | null;
      ready: boolean;
      pending: boolean;
      error: string | null;
    };
    retry(): void;
  }>();
  function character(identity: Identity): Character {
    if (closed) throw Error("Field kit is disposed");
    const create = appearances.get(identity.appearance);
    if (!create) throw Error("Appearance is not approved for this yard");
    const avatar = create(),
      root = new THREE.Group(),
      style = new ComicStyle({ inkWidth: 1.5 });
    root.add(avatar.object);
    let action: PlayerActionState | undefined,
      tick = 0,
      desired: string | null = null,
      pending = false,
      disposed = false,
      revision = 0;
    let session: string | null = null,
      loadError: string | null = null;
    const wield = new WieldController(
      avatar,
      wieldLibrary,
      fieldToolBehaviors((id) =>
        action?.tool && id === `wield-${action.tool}`
          ? {
              phase: action.phase,
              time: tick / 30,
              progress: Math.min(
                1,
                Math.max(0, 1 - (action.phaseUntil - tick) / 6),
              ),
            }
          : undefined,
      ),
      {
        onError: (error, hand) => {
          if (!disposed && hand) {
            loadError = error instanceof Error ? error.message : String(error);
            report(error);
          }
        },
      },
    );
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.38, 24),
      new THREE.MeshBasicMaterial({
        color: "#344a48",
        transparent: true,
        opacity: 0.17,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.009;
    root.add(shadow);
    const cableGeometry = new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(new Float32Array(6), 3),
    );
    const cable = new THREE.Line(
      cableGeometry,
      new THREE.LineBasicMaterial({ color: "#d4a149" }),
    );
    cable.name = "field-cable";
    cable.visible = false;
    root.add(cable);
    const pulse = new THREE.Mesh(
      new THREE.RingGeometry(0.94, 1, 64),
      new THREE.MeshBasicMaterial({
        color: "#6999ac",
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    pulse.name = "field-pulse";
    pulse.rotation.x = -Math.PI / 2;
    pulse.visible = false;
    root.add(pulse);
    const aim = new THREE.Mesh(
      new THREE.ConeGeometry(0.045, 0.15, 3),
      new THREE.MeshBasicMaterial({ color: "#cb993e" }),
    );
    aim.name = "field-aim";
    aim.rotation.x = Math.PI / 2;
    aim.position.set(0, 0.06, 1.05);
    avatar.object.add(aim);
    const start = new THREE.Vector3(),
      end = new THREE.Vector3(),
      point = new THREE.Vector3();
    const setTool = (tool: string | null) => {
      if (disposed) return;
      desired = tool;
      pending = true;
      loadError = null;
      const current = ++revision;
      const loadout = emptyWieldLoadout(equipment);
      if (tool) loadout.twoHanded = { item: `wield-${tool}`, primary: "right" };
      // Transaction retains the last complete pair until the new pair is verified.
      void wield
        .setLoadout(loadout)
        .catch((error) => {
          if (!disposed && current === revision) {
            loadError = error instanceof Error ? error.message : String(error);
            report(error);
          }
        })
        .finally(() => {
          if (!disposed && current === revision) pending = false;
        });
    };
    const instance = {
      wield,
      get pending() {
        return pending;
      },
      readiness() {
        const held = wield.getHand("right");
        const matches =
          desired === null
            ? !wield.getHand("left") && !held
            : held?.state === "ready" &&
              held.item.id === `wield-${desired}` &&
              wield.getHand("left")?.object === held.object;
        return {
          session,
          desired,
          ready: !disposed && !pending && !loadError && !!matches,
          pending,
          error: loadError,
        };
      },
      retry() {
        if (loadError && !pending && !disposed) setTool(desired);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        pending = false;
        revision++;
        style.clear();
        wield.dispose();
        avatar.dispose();
        for (const object of [shadow, cable, pulse, aim]) {
          object.geometry.dispose();
          object.material.dispose();
          object.removeFromParent();
        }
        root.clear();
        owned.delete(instance);
      },
    };
    owned.add(instance);
    return {
      object: root,
      dispose: instance.dispose,
      update(body, time, context) {
        if (disposed || !context) return;
        session = context.session;
        action = context.state.actions?.players[context.session];
        tick = context.state.tick;
        const tool = action?.tool ?? null;
        if (tool !== desired) setTool(tool);
        avatar.object.rotation.y = action?.tool
          ? Math.atan2(action.aim.x, action.aim.z) - body.facing
          : 0;
        avatar.update(time, {
          reducedMotion: context.reducedMotion,
          speed: Math.min(1, Math.hypot(body.vx, body.vz) / 4),
          gesture: body.gesture > 0 ? "wave" : "idle",
        });
        root.updateWorldMatrix(true, true);
        cable.visible = false;
        pulse.visible = false;
        aim.visible = !!tool;
        const held = wield.getHand("right");
        if (
          action?.phase === "reeling" &&
          action.target &&
          held?.state === "ready" &&
          held.item.id === "wield-tether-winch"
        ) {
          const target = context.state.toys[action.target];
          if (target) {
            held.anchor("cable").getWorldPosition(start);
            end.set(
              target.x,
              target.y + (toyRadii.get(action.target) ?? 0),
              target.z,
            );
            root.worldToLocal(start);
            root.worldToLocal(end);
            const positions = cableGeometry.attributes.position;
            positions.setXYZ(0, start.x, start.y, start.z);
            positions.setXYZ(1, end.x, end.y, end.z);
            positions.needsUpdate = true;
            cableGeometry.computeBoundingSphere();
            cable.visible = true;
          }
        }
        let last;
        const events = context.state.actions?.events ?? [];
        for (let index = events.length - 1; index >= 0; index--)
          if (
            events[index].session === context.session &&
            events[index].kind === "pulse"
          ) {
            last = events[index];
            break;
          }
        if (last) {
          const age = tick - last.tick;
          if (age >= 0 && age < 20) {
            point.set(last.position.x, last.position.y, last.position.z);
            root.worldToLocal(point);
            pulse.position.copy(point);
            pulse.scale.setScalar(
              context.reducedMotion ? 3 : 0.2 + (2.8 * age) / 20,
            );
            pulse.material.opacity = context.reducedMotion
              ? 0.5
              : 0.8 * (1 - age / 20);
            pulse.visible = true;
          }
        }
        style.update(avatar.object, context.viewport);
      },
    };
  }
  function scenery(scene: THREE.Scene, map: WorldMap) {
    for (const toy of map.toys) toyRadii.set(toy.id, toy.radius);
    for (const b of map.blockers) {
      const object = new THREE.Mesh(
        new THREE.BoxGeometry(b.width, b.height, b.depth),
        new THREE.MeshStandardMaterial({
          color: "#54717a",
          roughness: 1,
          flatShading: true,
        }),
      );
      object.position.set(
        b.x + b.width / 2,
        b.y + b.height / 2,
        b.z + b.depth / 2,
      );
      scene.add(object);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(object.geometry),
        new THREE.LineBasicMaterial({ color: "#23373d" }),
      );
      object.add(edges);
    }
    const grid = new THREE.GridHelper(
      Math.max(map.bounds.width, map.bounds.depth),
      20,
      "#abb7ad",
      "#c4ccc0",
    );
    grid.position.set(
      map.bounds.x + map.bounds.width / 2,
      0.011,
      map.bounds.z + map.bounds.depth / 2,
    );
    scene.add(grid);
    for (const toy of map.toys) {
      const target = new THREE.Mesh(
        new THREE.RingGeometry(0.62, 0.66, 40),
        new THREE.MeshBasicMaterial({
          color: "#c29243",
          side: THREE.DoubleSide,
        }),
      );
      target.rotation.x = -Math.PI / 2;
      target.position.set(toy.home.x, toy.home.y + 0.014, toy.home.z);
      scene.add(target);
    }
  }
  return {
    character,
    scenery,
    retryFailed(session?: string) {
      for (const character of owned)
        if (session === undefined || character.readiness().session === session)
          character.retry();
    },
    diagnostics: () => ({
      characters: owned.size,
      readiness: [...owned].map((character) => character.readiness()),
      pending: [...owned].filter((c) => c.pending).length,
      equipment: [...owned].map((c) => c.wield.diagnostics()),
    }),
    dispose() {
      if (closed) return;
      closed = true;
      for (const item of [...owned]) item.dispose();
      toyRadii.clear();
      library.dispose();
      wieldLibrary.dispose();
    },
  };
}
