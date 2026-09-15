import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  AvatarLibrary,
  ComicStyle,
  defaultRecipe,
  WieldLibrary,
  WieldController,
  emptyWieldLoadout,
  fieldToolBehaviors,
  type Catalog,
  type WieldCatalog,
} from "../../avatar-studio/src/index";

/** Inspection-only source mesh. The runtime package never loads this mannequin. */
const sourceURLs = [
  new URL(
    "../../avatar-studio/assets/source/locomotion/kaykit/Rig_Medium_MovementBasic.glb",
    import.meta.url,
  ).href,
  new URL(
    "../../avatar-studio/assets/source/locomotion/kaykit/Rig_Medium_MovementAdvanced.glb",
    import.meta.url,
  ).href,
];
const walkingURL = new URL(
  "../../avatar-studio/assets/source/performances/UAL1_Standard.glb",
  import.meta.url,
).href;
const sourceSamplesURL = new URL(
  "../../avatar-studio/assets/source/locomotion/kaykit/source-samples.json",
  import.meta.url,
).href;
const paces = [
  { name: "Walk", clips: ["Walk_Loop"], speed: 1.2, x: 0, z: 1 },
  {
    name: "Brisk walk",
    clips: ["Walk_Loop"],
    speed: 2.2,
    x: 0,
    z: 1,
  },
  { name: "Jog", clips: ["Running_A"], speed: 4, x: 0, z: 1 },
  { name: "Sprint", clips: ["Running_A"], speed: 5.4, x: 0, z: 1 },
  {
    name: "Backward walk",
    clips: ["Walk_Loop"],
    speed: 2.2,
    x: 0,
    z: -1,
  },
  {
    name: "Strafe left",
    clips: ["Running_Strafe_Left"],
    speed: 4,
    x: -1,
    z: 0,
  },
  {
    name: "Strafe right",
    clips: ["Running_Strafe_Right"],
    speed: 4,
    x: 1,
    z: 0,
  },
  { name: "Backward sprint", clips: ["Running_A"], speed: 5.4, x: 0, z: -1 },
] as const;

type LocomotionDiagnostic = {
  clip: string;
  phase: number;
  playbackRate?: number;
  reversed?: boolean;
};
type Drive = { x: number; z: number; heading: number; label: string };
function driveAt(time: number): Drive {
  if (time < 0.8) return { x: 0, z: 0, heading: 0, label: "Idle" };
  if (time < 2.8)
    return { x: 0, z: 2.2, heading: 0, label: "Default walk · 2.2 m/s" };
  if (time < 4.8) return { x: 0, z: 4, heading: 0, label: "Jog · 4 m/s" };
  if (time < 6.8)
    return { x: 0, z: 5.4, heading: 0, label: "Sprint · 5.4 m/s" };
  if (time < 8)
    return {
      x: 0,
      z: 4,
      heading: (((time - 6.8) / 1.2) * Math.PI) / 2,
      label: "Moving turn · 90°",
    };
  if (time < 9)
    return { x: 0, z: 0, heading: Math.PI / 2, label: "Stop and settle" };
  if (time < 10.4)
    return {
      x: 0,
      z: -2.2,
      heading: 0,
      label: "Backward walk · relaxed reverse",
    };
  if (time < 11.3)
    return {
      x: -4,
      z: 0,
      heading: 0,
      label: "Left strafe · authored crossover",
    };
  if (time < 12.2)
    return {
      x: 4,
      z: 0,
      heading: 0,
      label: "Right strafe · authored crossover",
    };
  return {
    x: 0,
    z: -5.4,
    heading: 0,
    label: "Backward sprint · reversed Running_A",
  };
}

export async function createLocomotionReview() {
  const [catalog, equipment, sources, sourceSamples, walkingSource] =
    await Promise.all([
      fetch("/avatars/catalog.json").then((r) => r.json() as Promise<Catalog>),
      fetch("/avatars/action/catalog.json").then(
        (r) => r.json() as Promise<WieldCatalog>,
      ),
      Promise.all(sourceURLs.map((url) => new GLTFLoader().loadAsync(url))),
      fetch(sourceSamplesURL).then((response) => response.json()),
      new GLTFLoader().loadAsync(walkingURL),
    ]);
  const library = new AvatarLibrary(
    catalog,
    new URL("/avatars/", location.href).href,
  );
  const wieldLibrary = new WieldLibrary(
    equipment,
    new URL("/avatars/action/", location.href).href,
  );
  const avatar = library.create();
  const recipe = defaultRecipe(catalog);
  recipe.parts.hair = "hair-sweep";
  Object.assign(recipe.colors, {
    skin: "#bd865f",
    hair: "#463229",
    primary: "#ebe7dc",
    secondary: "#25383f",
  });
  await avatar.setAppearance(recipe);
  const errors: string[] = [];
  const wield = new WieldController(
    avatar,
    wieldLibrary,
    fieldToolBehaviors(() => undefined),
    {
      onError: (error) => errors.push(String(error)),
    },
  );
  const source = sources[0];
  // Both packs contain the same named Rig_Medium. Keep the original Basic mesh
  // and play Advanced tracks by those original node names; no source retargeting.
  const clips = new Map(
    sources.flatMap((pack) =>
      pack.animations.map((clip) => [clip.name, clip] as const),
    ),
  );
  let sourceRoot = source.scene;
  const walkingRoot = walkingSource.scene;
  const walkingMixer = new THREE.AnimationMixer(walkingRoot);
  const mixer = new THREE.AnimationMixer(sourceRoot);
  const sourceActions = new Map(
    [...clips.values()].map((clip) => [clip.name, mixer.clipAction(clip)]),
  );
  const sourceDurations = new Map(
    [...clips.values()].map((clip) => [clip.name, clip.duration]),
  );
  const walkingClip = walkingSource.animations.find(
    (c) => c.name === "Walk_Loop",
  )!;
  sourceActions.set(walkingClip.name, walkingMixer.clipAction(walkingClip));
  sourceDurations.set(walkingClip.name, walkingClip.duration);
  // Independent loader/mixer qualification: verify that Advanced clips actually
  // animate the Basic mannequin at original keys, including physical wrists.
  // Matching only action.time would pass even with missing node bindings.
  const sourceNodes = new Map<string, THREE.Object3D>();
  for (const [object, association] of source.parser.associations) {
    if (object instanceof THREE.Object3D && association.nodes !== undefined)
      sourceNodes.set(source.parser.json.nodes[association.nodes].name, object);
  }
  const sourceVerification = {
    samples: 0,
    maxPositionError: 0,
    maxRotationErrorRadians: 0,
  };
  for (const name of [
    "Walking_A",
    "Walking_B",
    "Running_A",
    "Walking_Backwards",
    "Running_Strafe_Left",
    "Running_Strafe_Right",
  ]) {
    mixer.stopAllAction();
    const action = sourceActions.get(name)!.reset().play();
    for (const sample of sourceSamples.clips[name].samples.slice(0, -1)) {
      action.time = sample.time;
      mixer.update(0);
      sourceRoot.updateMatrixWorld(true);
      sourceSamples.joints.forEach(
        (joint: { sourceName: string }, index: number) => {
          const node = sourceNodes.get(joint.sourceName)!;
          if (!node) throw new Error(`Reference GLB lacks ${joint.sourceName}`);
          const error = node
            .getWorldPosition(new THREE.Vector3())
            .distanceTo(
              new THREE.Vector3().fromArray(sample.positions, index * 3),
            );
          const angle = node
            .getWorldQuaternion(new THREE.Quaternion())
            .normalize()
            .angleTo(
              new THREE.Quaternion()
                .fromArray(sample.rotations, index * 4)
                .normalize(),
            );
          sourceVerification.maxPositionError = Math.max(
            sourceVerification.maxPositionError,
            error,
          );
          sourceVerification.maxRotationErrorRadians = Math.max(
            sourceVerification.maxRotationErrorRadians,
            angle,
          );
        },
      );
      sourceVerification.samples++;
    }
  }
  const walkingSamples = await fetch(
    new URL(
      "../../avatar-studio/assets/source/locomotion/relaxed/source-samples.json",
      import.meta.url,
    ),
  ).then((r) => r.json());
  const walkingNodes = new Map<string, THREE.Object3D>();
  for (const [object, association] of walkingSource.parser.associations) {
    if (object instanceof THREE.Object3D && association.nodes !== undefined)
      walkingNodes.set(
        walkingSource.parser.json.nodes[association.nodes].name,
        object,
      );
  }
  const walkingAction = sourceActions.get("Walk_Loop")!.reset().play();
  for (const sample of walkingSamples.clips[
    "UAL1_Standard.glb:Walk_Loop"
  ].samples.slice(0, -1)) {
    walkingAction.time = sample.time;
    walkingMixer.update(0);
    walkingRoot.updateMatrixWorld(true);
    walkingSamples.sources["UAL1_Standard.glb"].joints.forEach(
      (joint: { sourceName: string }, index: number) => {
        const node = walkingNodes.get(joint.sourceName)!;
        sourceVerification.maxPositionError = Math.max(
          sourceVerification.maxPositionError,
          node
            .getWorldPosition(new THREE.Vector3())
            .distanceTo(
              new THREE.Vector3().fromArray(sample.positions, index * 3),
            ),
        );
        sourceVerification.maxRotationErrorRadians = Math.max(
          sourceVerification.maxRotationErrorRadians,
          node
            .getWorldQuaternion(new THREE.Quaternion())
            .normalize()
            .angleTo(
              new THREE.Quaternion()
                .fromArray(sample.rotations, index * 4)
                .normalize(),
            ),
        );
      },
    );
    sourceVerification.samples++;
  }
  walkingMixer.stopAllAction();
  if (
    sourceVerification.maxPositionError > 0.00001 ||
    sourceVerification.maxRotationErrorRadians > 0.00001
  )
    throw new Error(
      `Reference loader disagrees with original samples: ${JSON.stringify(sourceVerification)}`,
    );
  mixer.stopAllAction();
  // Presentation scale preserves source proportions and tracks. Reflect X to match
  // the target family's handedness, exactly as the documented retargeter does.
  sourceActions.get("T-Pose")!.play();
  mixer.setTime(0);
  sourceRoot.updateMatrixWorld(true);
  const sourceBounds = new THREE.Box3().setFromObject(sourceRoot);
  const avatarBounds = new THREE.Box3().setFromObject(avatar.object);
  const sourceScale =
    avatarBounds.getSize(new THREE.Vector3()).y /
    sourceBounds.getSize(new THREE.Vector3()).y;
  sourceRoot.scale.set(-sourceScale, sourceScale, sourceScale);
  const sourceFloor = -sourceBounds.min.y * sourceScale;
  const walkingBounds = new THREE.Box3().setFromObject(walkingRoot);
  const walkingScale =
    avatarBounds.getSize(new THREE.Vector3()).y /
    walkingBounds.getSize(new THREE.Vector3()).y;
  walkingRoot.scale.set(-walkingScale, walkingScale, walkingScale);
  const walkingFloor = -walkingBounds.min.y * walkingScale;
  walkingRoot.visible = false;
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(768, 576);
  renderer.setClearColor("#edece2");
  const scene = new THREE.Scene();
  scene.add(
    avatar.object,
    sourceRoot,
    walkingRoot,
    new THREE.HemisphereLight("#fff7df", "#81978d", 2),
  );
  const key = new THREE.DirectionalLight("#ffffff", 3);
  key.position.set(-3, 6, 5);
  scene.add(key);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    new THREE.MeshBasicMaterial({ color: "#e0e4d9" }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.006;
  const grid = new THREE.GridHelper(500, 500, "#bbc5b7", "#cbd3c5");
  scene.add(floor, grid);
  const style = new ComicStyle({ inkWidth: 1.5 });
  const camera = new THREE.OrthographicCamera(
    -0.85,
    0.85,
    1.275,
    -1.275,
    0.01,
    40,
  );
  let clock = 0;
  let weight = 0;
  let selectedSource = "";
  let side = false;
  let label = "Idle";
  let disposed = false;
  let hasTool = false;
  const diagnostics = () =>
    avatar.animationDiagnostics() as ReturnType<
      typeof avatar.animationDiagnostics
    > & { locomotion?: LocomotionDiagnostic };
  const matchSource = () => {
    const locomotion = diagnostics().locomotion;
    if (!locomotion)
      throw new Error(
        "The authored runtime must expose locomotion clip and phase for reference-matched review",
      );
    // Neutral target rest is an intentional authored bind pose, not a source clip.
    const clip = locomotion.clip === "Rest" ? "T-Pose" : locomotion.clip;
    const action = sourceActions.get(clip);
    if (!action) throw new Error(`Missing original reference clip ${clip}`);
    if (selectedSource !== clip) {
      mixer.stopAllAction();
      walkingMixer.stopAllAction();
      source.scene.visible = walkingRoot.visible = false;
      sourceRoot = clip === "Walk_Loop" ? walkingRoot : source.scene;
      sourceRoot.visible = true;
      action.reset().play();
      selectedSource = clip;
    }
    // Diagnostics phase is already the actual sampled source phase after phase
    // alignment/reversal. Reversing it again here would falsify the comparison.
    action.time =
      locomotion.clip === "Rest"
        ? 0
        : locomotion.phase * sourceDurations.get(clip)!;
    (sourceRoot === walkingRoot ? walkingMixer : mixer).update(0);
    return locomotion;
  };
  function tick(dt: number, drive: Drive) {
    clock += dt;
    label = drive.label;
    avatar.object.rotation.y = drive.heading;
    const dx =
      drive.x * Math.cos(drive.heading) + drive.z * Math.sin(drive.heading);
    const dz =
      drive.z * Math.cos(drive.heading) - drive.x * Math.sin(drive.heading);
    avatar.object.position.x += dx * dt;
    avatar.object.position.z += dz * dt;
    avatar.update(clock, {
      velocity: { x: drive.x, z: drive.z },
      grounded: true,
    });
    matchSource();
    sourceRoot.position.copy(avatar.object.position);
    sourceRoot.position.y =
      sourceRoot === walkingRoot ? walkingFloor : sourceFloor;
    sourceRoot.rotation.y = drive.heading;
  }
  function paint(isSide = side) {
    const origin = avatar.object.position;
    const height = 1.11;
    camera.position.set(
      origin.x + (isSide ? 5 : 0),
      height,
      origin.z + (isSide ? 0 : 5),
    );
    camera.lookAt(origin.x, height, origin.z);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    style.update(avatar.object, new THREE.Vector2(384, 576));
    renderer.setScissorTest(true);
    for (const [index, original] of [
      [0, true],
      [1, false],
    ] as const) {
      sourceRoot.visible = original;
      avatar.object.visible = !original;
      renderer.setViewport(index * 384, 0, 384, 576);
      renderer.setScissor(index * 384, 0, 384, 576);
      renderer.render(scene, camera);
    }
    avatar.object.visible = sourceRoot.visible = true;
    renderer.setScissorTest(false);
  }
  function gripError() {
    if (!hasTool) return 0;
    avatar.object.updateMatrixWorld(true);
    let error = 0;
    for (const hand of ["left", "right"] as const) {
      const item = wield.getHand(hand);
      if (!item) throw new Error(`Missing expected ${hand} grip`);
      const f = equipment.grips[hand].frame;
      const socket = avatar
        .attachmentView()!
        .sockets.get(hand === "left" ? "hand_L" : "hand_R")!;
      const expected = socket.matrixWorld
        .clone()
        .multiply(
          new THREE.Matrix4().compose(
            new THREE.Vector3(...f.position),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(...f.rotation)),
            new THREE.Vector3(1, 1, 1),
          ),
        );
      const actual = item.anchor("grip").matrixWorld;
      error = Math.max(
        error,
        ...actual.elements.map((value, index) =>
          Math.abs(value - expected.elements[index]),
        ),
      );
    }
    return error;
  }
  const api = {
    canvas: renderer.domElement,
    diagnostics,
    errors,
    sourceScale,
    sourceVerification,
    tick,
    paint,
    gripError,
    sourceReference() {
      const motion = diagnostics().locomotion!;
      return {
        clip: selectedSource,
        time: sourceActions.get(selectedSource)!.time,
        duration: sourceDurations.get(selectedSource)!,
        phase: motion.clip === "Rest" ? 0 : motion.phase,
        reversed: motion.reversed ?? false,
      };
    },
    footwear() {
      const feet = { left: Infinity, right: Infinity };
      avatar.object.updateMatrixWorld(true);
      avatar.object.traverse((object) => {
        if (
          !(object instanceof THREE.SkinnedMesh) ||
          object.userData.comicOutline
        )
          return;
        let owner: THREE.Object3D | null = object;
        while (owner && !owner.userData.assetId) owner = owner.parent;
        if (!String(owner?.userData.assetId).startsWith("shoes-")) return;
        const indices = object.geometry.getAttribute("skinIndex");
        for (let vertex = 0; vertex < indices.count; vertex++) {
          const side = object.skeleton.bones[
            indices.getX(vertex)
          ].name.endsWith("_L")
            ? "left"
            : "right";
          const point = object
            .getVertexPosition(vertex, new THREE.Vector3())
            .applyMatrix4(object.matrixWorld);
          feet[side] = Math.min(feet[side], point.y);
        }
      });
      return feet;
    },
    get label() {
      return label;
    },
    get weight() {
      return weight;
    },
    get side() {
      return side;
    },
    set side(value: boolean) {
      side = value;
    },
    async reset(nextWeight = 0) {
      weight = nextWeight;
      await avatar.setAppearance({ ...recipe, body: { weight } });
      avatar.object.position.set(0, 0, 0);
      avatar.object.rotation.set(0, 0, 0);
      // A clock discontinuity is the runtime's documented discontinuity/reset path.
      clock += 2;
      avatar.update(clock, { reducedMotion: true });
      tick(1 / 60, { x: 0, z: 0, heading: 0, label: "Idle" });
    },
    async setTool(active: boolean) {
      await wield.setLoadout(
        active
          ? {
              ...emptyWieldLoadout(equipment),
              twoHanded: { item: "wield-rebound-panel", primary: "right" },
            }
          : emptyWieldLoadout(equipment),
      );
      hasTool = active;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      style.clear();
      wield.dispose();
      avatar.dispose();
      library.dispose();
      wieldLibrary.dispose();
      for (const pack of [...sources, walkingSource])
        pack.scene.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            node.geometry.dispose();
            for (const material of Array.isArray(node.material)
              ? node.material
              : [node.material])
              material.dispose();
          }
        });
      floor.geometry.dispose();
      floor.material.dispose();
      grid.geometry.dispose();
      for (const material of Array.isArray(grid.material)
        ? grid.material
        : [grid.material])
        material.dispose();
      renderer.dispose();
    },
  };
  await api.reset();
  return api;
}

export async function captureLocomotionReview() {
  const review = await createLocomotionReview();
  const images: Record<string, string> = {};
  const records: any[] = [];
  function sheet(title: string, rows: number, cols = 4) {
    const canvas = document.createElement("canvas");
    canvas.width = cols * 384;
    canvas.height = 80 + rows * 318;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#f5f3ea";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#203139";
    ctx.font = "bold 24px Arial";
    ctx.fillText(title, 16, 30);
    ctx.font = "14px Arial";
    ctx.fillText(
      "Each pair: Quaternius walk / KayKit run source, X mirrored (left) / actual Zoomap avatar (right). Same evaluated source phase.",
      16,
      53,
    );
    return { canvas, ctx };
  }
  function cell(
    target: ReturnType<typeof sheet>,
    row: number,
    col: number,
    label: string,
    side: boolean,
  ) {
    review.paint(side);
    target.ctx.drawImage(review.canvas, col * 384, 80 + row * 318, 384, 288);
    target.ctx.fillStyle = "#203139";
    target.ctx.font = "13px Arial";
    target.ctx.fillText(label, col * 384 + 8, 80 + row * 318 + 308);
  }
  try {
    for (const pace of paces) {
      const target = sheet(
        `${pace.name} · ${pace.speed} m/s · original clip and retarget`,
        6,
        8,
      );
      for (const [weightIndex, weight] of [-1, 0, 1].entries()) {
        await review.reset(weight);
        const drive = {
          x: pace.x * pace.speed,
          z: pace.z * pace.speed,
          heading: 0,
          label: pace.name,
        };
        for (let i = 0; i < 120; i++) review.tick(1 / 60, drive);
        const captured = new Set<number>();
        for (let i = 0; i < 600 && captured.size < 8; i++) {
          review.tick(1 / 120, drive);
          const d = review.diagnostics();
          const motion = d.locomotion!;
          if (!(pace.clips as readonly string[]).includes(motion.clip))
            throw new Error(
              `${pace.name} selected ${motion.clip} instead of ${pace.clips.join("/")}`,
            );
          const col = Math.floor(motion.phase * 8) % 8;
          if (captured.has(col)) continue;
          captured.add(col);
          const label = `Weight ${weight > 0 ? "+" : ""}${weight} · phase ${motion.phase.toFixed(3)}`;
          cell(target, weightIndex, col, `${label} · front`, false);
          cell(target, weightIndex + 3, col, `${label} · side`, true);
          records.push({
            kind: "steady",
            pace: pace.name,
            weight,
            footwear: review.footwear(),
            sourceReference: review.sourceReference(),
            ...d,
          });
        }
        if (captured.size !== 8)
          throw new Error(`Did not capture a full ${pace.name} cycle`);
      }
      images[pace.name.toLowerCase().replaceAll(" ", "-")] =
        target.canvas.toDataURL();
    }
    const transitions = sheet(
      "Transitions and two-hand attachment ownership",
      2,
      9,
    );
    for (const weight of [-1, 0, 1]) {
      await review.reset(weight);
      await review.setTool(true);
      for (let frame = 0; frame < 840; frame++) {
        const time = frame / 60;
        review.tick(1 / 60, driveAt(time));
        if (frame % 3 === 0)
          records.push({
            kind: "transition",
            time,
            weight,
            label: review.label,
            gripError: review.gripError(),
            sourceReference: review.sourceReference(),
            ...review.diagnostics(),
          });
        if (
          weight === 0 &&
          [90, 210, 330, 450, 510, 570, 650, 705, 795].includes(frame)
        ) {
          const col = [90, 210, 330, 450, 510, 570, 650, 705, 795].indexOf(
            frame,
          );
          cell(transitions, 0, col, review.label, false);
          cell(transitions, 1, col, review.label, true);
        }
      }
      await review.setTool(false);
    }
    images.transitions = transitions.canvas.toDataURL();
    return {
      images,
      records,
      errors: review.errors,
      sourceScale: review.sourceScale,
      sourceVerification: review.sourceVerification,
    };
  } finally {
    review.dispose();
  }
}

/** Run from the review HTML page or import in a browser for real RAF playback. */
export async function mountLocomotionReview(
  container: HTMLElement = document.body,
) {
  const review = await createLocomotionReview();
  container.replaceChildren();
  container.style.cssText =
    "margin:0;padding:24px;background:#f5f3ea;color:#203139;font:16px system-ui";
  const title = document.createElement("h1");
  title.textContent = "Authored locomotion review";
  title.style.fontSize = "24px";
  const caption = document.createElement("p");
  caption.textContent =
    "Quaternius walk / KayKit run source on the left (X mirrored to match avatar handedness). Zoomap retarget on the right. Moving clips share evaluated source phase; neutral rest is compared with source T-pose. Walking uses Walk_Loop with 15% wider hip swing, preserving knee flexion and foot orientation; backward walking reverses it. Strafes are authored; backward sprint reverses Running_A. The source mannequin has different proportions and some native sole penetration.";
  const controls = document.createElement("div");
  controls.style.cssText =
    "display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap";
  const status = document.createElement("pre");
  review.canvas.style.cssText =
    "width:768px;max-width:100%;height:auto;border:1px solid #c1c8ba";
  let paused = false;
  let elapsed = 0;
  let mode: "timeline" | (typeof paces)[number]["name"] = "timeline";
  let alive = true;
  let tool = false;
  let busy = false;
  const button = (text: string, click: () => void | Promise<void>) => {
    const button = document.createElement("button");
    button.textContent = text;
    button.style.cssText =
      "padding:9px 14px;border:1px solid #adb7aa;border-radius:8px;background:#fffdf4;cursor:pointer";
    button.onclick = () => void click();
    controls.append(button);
    return button;
  };
  const pause = button("Pause", () => {
    paused = !paused;
    pause.textContent = paused ? "Play" : "Pause";
  });
  button("Front / side", () => {
    review.side = !review.side;
  });
  for (const nextMode of [
    "timeline",
    ...paces.map((pace) => pace.name),
  ] as const)
    button(nextMode === "timeline" ? "Transitions" : nextMode, async () => {
      busy = true;
      mode = nextMode;
      elapsed = 0;
      await review.reset(review.weight);
      busy = false;
    });
  for (const weight of [-1, 0, 1])
    button(`Weight ${weight}`, async () => {
      busy = true;
      await review.reset(weight);
      elapsed = 0;
      busy = false;
    });
  button("Two-hand panel", async () => {
    busy = true;
    tool = !tool;
    await review.setTool(tool);
    busy = false;
  });
  container.append(title, caption, controls, review.canvas, status);
  let last = performance.now();
  let animationFrame = 0;
  const animate = (now: number) => {
    if (!alive) return;
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    if (!paused && !busy) {
      elapsed += dt;
      const pace = paces.find((p) => p.name === mode);
      review.tick(
        dt,
        pace
          ? {
              x: pace.x * pace.speed,
              z: pace.z * pace.speed,
              heading: 0,
              label: pace.name,
            }
          : driveAt(elapsed % 14),
      );
    }
    review.paint();
    status.textContent = `${review.label} · ${review.side ? "side" : "front"} · weight ${review.weight}\n${JSON.stringify(review.diagnostics().locomotion)}\nTwo-hand matrix error: ${review.gripError().toExponential(2)}`;
    animationFrame = requestAnimationFrame(animate);
  };
  animationFrame = requestAnimationFrame(animate);
  return {
    review,
    dispose: () => {
      alive = false;
      cancelAnimationFrame(animationFrame);
      review.dispose();
    },
  };
}

/** Real requestAnimationFrame playback recorded from the actual rendered canvas. */
export async function recordLocomotionReview(side = true, held = false) {
  const review = await createLocomotionReview();
  await review.setTool(held);
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 630;
  const ctx = canvas.getContext("2d")!;
  const stream = canvas.captureStream(30);
  const mimeType = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ].find((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType)
    throw new Error("This browser cannot record the review as WebM");
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 1800000,
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  const complete = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.onerror = () => reject(new Error("Review video recording failed"));
  });
  try {
    let elapsed = 0;
    let previous = performance.now();
    recorder.start();
    while (elapsed < 14) {
      const now = await new Promise<number>(requestAnimationFrame);
      const dt = Math.min(1 / 30, (now - previous) / 1000);
      previous = now;
      elapsed += dt;
      review.tick(dt, driveAt(Math.min(13.999, elapsed)));
      review.paint(side);
      ctx.drawImage(review.canvas, 0, 0);
      ctx.fillStyle = "#f5f3ea";
      ctx.fillRect(0, 576, 768, 54);
      ctx.fillStyle = "#203139";
      ctx.font = "bold 15px Arial";
      ctx.fillText("Original reference (X mirrored)", 12, 596);
      ctx.fillText("Actual modular Zoomap avatar", 394, 596);
      ctx.font = "14px Arial";
      ctx.fillText(
        `${review.label} · ${side ? "side" : "front"} · ${held ? "two-hand panel" : "empty hands"}`,
        12,
        620,
      );
    }
    recorder.stop();
    const blob = await complete;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } finally {
    if (recorder.state !== "inactive") recorder.stop();
    for (const track of stream.getTracks()) track.stop();
    review.dispose();
  }
}
