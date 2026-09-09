import * as THREE from "three";
import {
  AvatarLibrary,
  ComicStyle,
  defaultRecipe,
  WieldLibrary,
  WieldController,
  emptyWieldLoadout,
  type Motion,
} from "../../avatar-studio/src/index";
import {
  fieldToolBehaviors,
  type FieldToolPresentation,
} from "../../avatar-studio/src/field-tools";
import { fieldCharacterMotion } from "../../examples/action-models";
import {
  bodyAt,
  initialSimulation,
  stepWorld,
  idleInput,
  type WorldMap,
} from "../../src/core";
import {
  playfulActionCatalog,
  syncActionPlayers,
} from "../../src/world-actions";
export async function renderAnimationStudy() {
  const [catalog, equipment] = await Promise.all(
    ["/avatars/catalog.json", "/avatars/action/catalog.json"].map((url) =>
      fetch(url).then((r) => r.json()),
    ),
  );
  const library = new AvatarLibrary(
      catalog,
      new URL("/avatars/", location.href).href,
    ),
    wieldLibrary = new WieldLibrary(
      equipment,
      new URL("/avatars/action/", location.href).href,
    ),
    avatar = library.create();
  const recipe = defaultRecipe(catalog);
  recipe.parts.hair = "hair-sweep";
  Object.assign(recipe.colors, {
    skin: "#c08a64",
    hair: "#4c392d",
    primary: "#e7e3d8",
    secondary: "#303b40",
  });
  await avatar.setAppearance(recipe);
  let presentation: FieldToolPresentation | undefined;
  const errors: string[] = [],
    wield = new WieldController(
      avatar,
      wieldLibrary,
      fieldToolBehaviors(
        () =>
          presentation && {
            ...presentation,
            carrierPitch:
              avatar.animationDiagnostics().pose.lean * 0.36 -
              avatar.animationDiagnostics().pose.recoil * 0.12,
          },
      ),
      { onError: (error) => errors.push(String(error)) },
    );
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(240, 360);
  renderer.setPixelRatio(1);
  renderer.setClearColor("#efeee4");
  const scene = new THREE.Scene(),
    style = new ComicStyle({ inkWidth: 1.5 }),
    camera = new THREE.OrthographicCamera(-1, 1, 1.5, -1.5, 0.01, 30);
  scene.add(avatar.object, new THREE.HemisphereLight("#fff5dc", "#859088", 2));
  const sun = new THREE.DirectionalLight("#ffffff", 3);
  sun.position.set(-3, 6, 5);
  scene.add(sun);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshBasicMaterial({ color: "#e1e3d6" }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.005;
  scene.add(floor);
  const grid = new THREE.GridHelper(100, 100, "#c1c8ba", "#d2d5c8");
  scene.add(grid);
  let time = 0;
  const records: any[] = [];
  function sheet(rows: number, title: string) {
    const canvas = document.createElement("canvas");
    canvas.width = 1440;
    canvas.height = rows * 390 + 70;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#f5f2ea";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#243238";
    ctx.font = "bold 24px Arial";
    ctx.fillText(title, 20, 32);
    ctx.font = "15px Arial";
    ctx.fillText(
      "Actual GLB meshes · analytic leg IK · rigid two-hand fit · physical simulation jumps",
      20,
      56,
    );
    return { canvas, ctx };
  }
  function paint(
    target: ReturnType<typeof sheet>,
    row: number,
    col: number,
    label: string,
    side = false,
  ) {
    const origin = avatar.object.position,
      center = target === front || target === sideSheet ? 1.06 : 1.42,
      half = target === front || target === sideSheet ? 1.18 : 1.62;
    camera.top = half;
    camera.bottom = -half;
    camera.left = (-half * 2) / 3;
    camera.right = -camera.left;
    camera.position.set(
      origin.x + (side ? 5 : 0),
      center,
      origin.z + (side ? 0 : 5),
    );
    camera.lookAt(origin.x, center, origin.z);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    style.update(avatar.object, new THREE.Vector2(240, 360));
    renderer.render(scene, camera);
    target.ctx.drawImage(renderer.domElement, col * 240, 70 + row * 390);
    target.ctx.fillStyle = "#243238";
    target.ctx.font = "bold 14px Arial";
    target.ctx.fillText(label, col * 240 + 10, 70 + row * 390 + 380);
  }
  const front = sheet(4, "Directional locomotion — front"),
    sideSheet = sheet(4, "Directional locomotion — side");
  for (const [row, x, z, label] of [
    [0, 0, 2, "Forward"],
    [1, 0, -2, "Backward"],
    [2, 2, 0, "Right strafe"],
    [3, -2, 0, "Left strafe"],
  ] as const) {
    avatar.object.position.set(0, 0, 0);
    avatar.update((time += 1), { reducedMotion: true });
    for (let i = 0; i < 100; i++) {
      avatar.object.position.x += x / 60;
      avatar.object.position.z += z / 60;
      avatar.update((time += 1 / 60), { velocity: { x, z } });
      if (i >= 60 && (i - 60) % 7 === 0) {
        const col = (i - 60) / 7;
        paint(front, row, col, `${label} · ${(i / 60).toFixed(2)}s`);
        paint(sideSheet, row, col, `${label} · ${(i / 60).toFixed(2)}s`, true);
        records.push({
          kind: label,
          frame: i,
          ...avatar.animationDiagnostics(),
        });
      }
    }
  }
  const actions = sheet(4, "Wake Driver and Rebound Panel — accepted actions");
  await wield.setLoadout({
    ...emptyWieldLoadout(equipment),
    twoHanded: { item: "wield-wake-driver", primary: "right" },
  });
  const map: WorldMap = {
    version: 1,
    id: "animation-proof",
    bounds: { x: -10, z: -10, width: 20, depth: 20 },
    spawn: { x: 0, y: 0, z: 0 },
    surfaces: [
      {
        id: "ground",
        x: -10,
        z: -10,
        width: 20,
        depth: 20,
        y: 0,
        thickness: 0.2,
      },
    ],
    blockers: [],
    toys: [],
    triggers: [],
    placementZones: [],
    protectedZones: [],
    actionCatalog: playfulActionCatalog(),
  };
  for (const weight of [-1, 0, 1]) {
    await avatar.setAppearance({ ...recipe, body: { weight } });
    avatar.object.position.set(0, 0, 0);
    presentation = undefined;
    avatar.update((time += 1), { reducedMotion: true });
    const state = initialSimulation(map);
    state.players.a = bodyAt(map.spawn);
    syncActionPlayers(state);
    let sequence = 0;
    const step = (kind?: "equip" | "use") =>
      stepWorld(
        map,
        state,
        { a: { ...idleInput(), toolHeld: true } },
        [],
        [],
        kind
          ? [
              {
                sequence: ++sequence,
                session: "a",
                intent:
                  kind === "equip"
                    ? { sequence, kind, tool: "wake-driver" }
                    : { sequence, kind, pressed: true },
              },
            ]
          : [],
      );
    step("equip");
    step("use");
    let actioncol = 0;
    const captures = new Set<string>();
    for (let i = 0; i < 65; i++) {
      step();
      const body = state.players.a,
        action = state.actions!.players.a;
      const event = [...state.actions!.events]
        .reverse()
        .find((e) => e.kind === "pulse");
      presentation = {
        phase: action.phase,
        time: state.tick / 30,
        progress: Math.min(1, (state.tick - action.phaseStarted) / 6),
        impact: event
          ? { id: event.id, kind: "pulse", age: (state.tick - event.tick) / 30 }
          : undefined,
      };
      for (let frame = 0; frame < 2; frame++) {
        avatar.object.position.set(body.x, body.y, body.z);
        avatar.update(
          (time += 1 / 60),
          fieldCharacterMotion(body, action, state.tick),
        );
      }
      const ground = wield
          .getHand("right")!
          .anchor("ground")
          .getWorldPosition(new THREE.Vector3()),
        lowest = new THREE.Vector3(0, Infinity, 0);
      wield.getHand("right")!.object.traverse((node) => {
        if (node instanceof THREE.Mesh && !node.userData.comicOutline) {
          for (
            let vertex = 0;
            vertex < node.geometry.attributes.position.count;
            vertex++
          ) {
            const point = node
              .getVertexPosition(vertex, new THREE.Vector3())
              .applyMatrix4(node.matrixWorld);
            if (point.y < lowest.y) lowest.copy(point);
          }
        }
      });
      let gripError = 0;
      for (const hand of ["left", "right"] as const) {
        const f = equipment.grips[hand].frame,
          w = avatar
            .attachmentView()!
            .sockets.get(hand === "left" ? "hand_L" : "hand_R")!;
        const expected = w.matrixWorld
          .clone()
          .multiply(
            new THREE.Matrix4().compose(
              new THREE.Vector3(...f.position),
              new THREE.Quaternion().setFromEuler(
                new THREE.Euler(...f.rotation),
              ),
              new THREE.Vector3(1, 1, 1),
            ),
          );
        gripError = Math.max(
          gripError,
          ...wield
            .getHand(hand)!
            .anchor("grip")
            .matrixWorld.elements.map((v, i) =>
              Math.abs(v - expected.elements[i]),
            ),
        );
      }
      records.push({
        kind: "wake",
        weight,
        gripError,
        plateUp: new THREE.Vector3(0, 1, 0)
          .transformDirection(wield.getHand("right")!.object.matrixWorld)
          .toArray(),
        tick: state.tick,
        phase: action.phase,
        bodyY: body.y,
        ground: ground.toArray(),
        minY: lowest.y,
        contact: lowest.toArray(),
        ...avatar.animationDiagnostics(),
      });
      const key =
        action.phase === "leaping"
          ? body.vy > 0
            ? "ascending"
            : "descending"
          : action.phase;
      const capture =
        (key === "charging" && state.tick - action.phaseStarted >= 3) ||
        (key === "ascending" && body.y > 0.45) ||
        (key === "descending" && body.y < 0.35) ||
        ["impact", "recoiling", "cooldown"].includes(key);
      if (weight === 0 && capture && !captures.has(key) && actioncol < 6) {
        captures.add(key);
        paint(actions, 0, actioncol, key);
        paint(actions, 1, actioncol, key, true);
        actioncol++;
      }
    }
  }
  await avatar.setAppearance(recipe);
  await wield.setLoadout({
    ...emptyWieldLoadout(equipment),
    twoHanded: { item: "wield-rebound-panel", primary: "right" },
  });
  for (let col = 0; col < 6; col++) {
    presentation = {
      phase: col === 0 ? "idle" : "braced",
      time: col,
      impact:
        col >= 3
          ? { id: 1, kind: "rebound", age: (col - 3) * 0.12 }
          : undefined,
    };
    for (let i = 0; i < 25; i++)
      avatar.update((time += 1 / 60), {
        velocity: { x: 0, z: 0 },
        pose: col ? { crouch: 0.24, lean: 0.15, stance: 0.7 } : {},
      });
    avatar.object.position.set(0, 0, 0);
    avatar.update((time += 1 / 60), {
      pose: col ? { crouch: 0.24, lean: 0.15, stance: 0.7 } : {},
    });
    paint(
      actions,
      2,
      col,
      ["Ready", "Brace", "Active field", "Accepted hit", "Ripple", "Settle"][
        col
      ],
    );
    paint(
      actions,
      3,
      col,
      ["Ready", "Brace", "Active field", "Accepted hit", "Ripple", "Settle"][
        col
      ],
      true,
    );
  }
  const result = {
    front: front.canvas.toDataURL(),
    side: sideSheet.canvas.toDataURL(),
    actions: actions.canvas.toDataURL(),
    records,
    errors,
    diagnostics: wield.diagnostics(),
  };
  style.clear();
  wield.dispose();
  avatar.dispose();
  library.dispose();
  wieldLibrary.dispose();
  floor.geometry.dispose();
  floor.material.dispose();
  grid.geometry.dispose();
  (grid.material as THREE.Material).dispose();
  renderer.dispose();
  return result;
}
