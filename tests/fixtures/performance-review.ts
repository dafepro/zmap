import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  AvatarLibrary,
  ComicStyle,
  defaultRecipe,
  WieldLibrary,
  WieldController,
  emptyWieldLoadout,
  emoteDescriptors,
  WIELD_TRANSITION_SECONDS,
  type Catalog,
  type WieldCatalog,
  type EmoteId,
  type Motion,
} from "../../avatar-studio/src/index";
import { performanceData } from "../../avatar-studio/src/performance-data";

const publicRoot = new URL(
  "../../avatar-studio/public/",
  import.meta.url,
).href.replace(/\/?$/, "/");
const sourceRoot = new URL(
  "../../avatar-studio/assets/source/performances/",
  import.meta.url,
).href.replace(/\/?$/, "/");
const joints = [
  "hips",
  "chest",
  "head",
  "arm_L",
  "forearm_L",
  "hand_L",
  "arm_R",
  "forearm_R",
  "hand_R",
  "leg_L",
  "shin_L",
  "foot_L",
  "leg_R",
  "shin_R",
  "foot_R",
];
type Clip = keyof typeof performanceData.clips;
type Row = {
  id: string;
  weight: number;
  duration: number;
  minFloor: number;
  maxFloor: number;
  maxGrip: number;
  maxJointStep: number;
  maxRootDrift: number;
  poseP95Ms: number;
  poseMaxMs: number;
  visibilityFlips: number;
  finalDrawn: boolean;
  samples: {
    time: number;
    visible: boolean;
    phase: string;
    progress: number;
    floor: number | null;
    root: number[];
    head: number[];
    hands: number[][];
  }[];
};
function presented(object: THREE.Object3D, root: THREE.Object3D) {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
    if (node === root) return true;
  }
  return false;
}
/** Independent original GLB playback beside the actual modular target. Asset
 * transactions remain async, while accepted animation clocks are sampled at60Hz. */
export async function capturePerformanceReview(
  options: { record?: boolean } = {},
) {
  const json = async (url: string) => (await fetch(url)).json();
  const [catalog, one, two, sourceSamples] = await Promise.all([
    json(publicRoot + "catalog.json") as Promise<Catalog>,
    json(publicRoot + "wield/catalog.json") as Promise<WieldCatalog>,
    json(publicRoot + "action/catalog.json") as Promise<WieldCatalog>,
    json(sourceRoot + "source-samples.json"),
  ]);
  const equipment: WieldCatalog = {
    ...one,
    id: "zoomap-performance-review",
    items: [...one.items, ...two.items],
  };
  const gearPaths = new Map([
    ...[...one.items, ...Object.values(one.grips)].map(
      (item) => [item.url, publicRoot + "wield/" + item.url] as const,
    ),
    ...two.items.map(
      (item) => [item.url, publicRoot + "action/" + item.url] as const,
    ),
  ]);
  const gearFetch: typeof fetch = async (input, init) =>
    fetch(gearPaths.get(new URL(String(input)).pathname.slice(1))!, init);
  const library = new AvatarLibrary(catalog, publicRoot);
  const gear = new WieldLibrary(
    equipment,
    "https://performance.test/",
    gearFetch,
  );
  const recipe = defaultRecipe(catalog);
  recipe.parts.hair = "hair-sweep";
  Object.assign(recipe.colors, {
    skin: "#bd865f",
    hair: "#463229",
    primary: "#ebe7dc",
    secondary: "#25383f",
  });
  const errors: string[] = [];
  const actors = await Promise.all(
    [-1, 0, 1].map(async (weight) => {
      const avatar = library.create();
      await avatar.setAppearance({ ...recipe, body: { weight } });
      const registry = Object.fromEntries(
        equipment.items.map((item) => [item.behavior, { create: () => ({}) }]),
      );
      const wield = new WieldController(avatar, gear, registry, {
        onError: (e) => errors.push(String(e)),
      });
      avatar.update(0);
      return { avatar, wield, weight, clock: 0 };
    }),
  );
  const packs = await Promise.all(
    Object.keys(sourceSamples.sources).map(async (file) => {
      const gltf = await new GLTFLoader().loadAsync(sourceRoot + file);
      const mixer = new THREE.AnimationMixer(gltf.scene);
      const actions = new Map(
        gltf.animations.map((clip) => [
          clip.name,
          mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1),
        ]),
      );
      const nodes = new Map<string, THREE.Object3D>();
      for (const [object, association] of gltf.parser.associations)
        if (object instanceof THREE.Object3D && association.nodes !== undefined)
          nodes.set(gltf.parser.json.nodes[association.nodes].name, object);
      return { file, gltf, mixer, actions, nodes, scale: 1, floor: 0 };
    }),
  );
  const verification = { samples: 0, maxPositionError: 0, maxRotationError: 0 };
  // Compare loader-bound original nodes with the independently sampled original
  // binary. A matching timeline alone would miss missing animation bindings.
  for (const pack of packs) {
    const manifest = sourceSamples.sources[pack.file];
    for (const selected of Object.values(performanceData.clips)) {
      if (selected.source.file !== pack.file) continue;
      const original =
        sourceSamples.clips[pack.file + ":" + selected.source.clip];
      const action = pack.actions.get(selected.source.clip)!;
      pack.mixer.stopAllAction();
      action.reset().play();
      for (const sample of original.samples.filter(
        (_: unknown, i: number) => i % 6 === 0,
      )) {
        action.time = sample.time;
        pack.mixer.update(0);
        pack.gltf.scene.updateMatrixWorld(true);
        manifest.joints.forEach((joint: { sourceName: string }, i: number) => {
          const node = pack.nodes.get(joint.sourceName)!;
          if (!node)
            throw new Error("Missing original source node " + joint.sourceName);
          verification.maxPositionError = Math.max(
            verification.maxPositionError,
            node
              .getWorldPosition(new THREE.Vector3())
              .distanceTo(
                new THREE.Vector3().fromArray(sample.positions, i * 3),
              ),
          );
          verification.maxRotationError = Math.max(
            verification.maxRotationError,
            node
              .getWorldQuaternion(new THREE.Quaternion())
              .normalize()
              .angleTo(
                new THREE.Quaternion()
                  .fromArray(sample.rotations, i * 4)
                  .normalize(),
              ),
          );
        });
        verification.samples++;
      }
    }
    pack.mixer.stopAllAction();
    const rest = pack.actions.get("T-Pose");
    if (rest) {
      rest.reset().play();
      pack.mixer.update(0);
    }
    pack.gltf.scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(pack.gltf.scene);
    const targetBounds = new THREE.Box3().setFromObject(
      actors[1].avatar.object,
    );
    pack.scale =
      targetBounds.getSize(new THREE.Vector3()).y /
      bounds.getSize(new THREE.Vector3()).y;
    pack.floor = -bounds.min.y * pack.scale;
    pack.gltf.scene.scale.set(-pack.scale, pack.scale, pack.scale);
    pack.gltf.scene.position.y = pack.floor;
    pack.gltf.scene.visible = false;
    pack.mixer.stopAllAction();
  }
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(1024, 306);
  renderer.setClearColor("#eeeee5");
  const scene = new THREE.Scene();
  scene.add(
    ...actors.map((a) => a.avatar.object),
    ...packs.map((p) => p.gltf.scene),
    new THREE.HemisphereLight("#fff7df", "#81978d", 2),
  );
  const sun = new THREE.DirectionalLight("#ffffff", 3);
  sun.position.set(-3, 6, 5);
  scene.add(sun);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshBasicMaterial({ color: "#dee3d8" }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.003;
  scene.add(floor);
  const grid = new THREE.GridHelper(8, 16, "#c0cbbd", "#d0d8ca");
  grid.position.y = -0.002;
  scene.add(grid);
  const style = new ComicStyle({ inkWidth: 1.5 });
  const camera = new THREE.OrthographicCamera(-5.6, 5.6, 1.68, -1.68, 0.01, 50);
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 718;
  document.body.style.margin = "0";
  document.body.append(canvas);
  const ctx = canvas.getContext("2d")!;
  const stream = options.record
    ? renderer.domElement.captureStream(0)
    : undefined;
  const recorder = stream
    ? new MediaRecorder(stream, {
        mimeType: "video/webm",
        videoBitsPerSecond: 2600000,
      })
    : undefined;
  const chunks: BlobPart[] = [];
  let recordingComplete: Promise<Blob> | undefined;
  if (recorder) {
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recordingComplete = new Promise((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
      recorder.onerror = () =>
        reject(new Error("Performance video recording failed"));
    });
  }
  const images: Record<string, string> = {};
  const cases: Row[] = [];
  const movieEntries: { id: string; clip: Clip; duration: number }[] = [];
  const recordingFrames: {
    id: string;
    view: string;
    frames: number;
    seconds: number;
  }[] = [];
  const movieLabels: THREE.Sprite[] = [];
  const v = new THREE.Vector3(),
    q = new THREE.Quaternion();
  const empty = () => emptyWieldLoadout(equipment);
  let activePack = packs[0];
  let activeSource = performanceData.clips.wave.source;
  let activeClip: Clip = "wave";
  const sampleSource = (clip: Clip, elapsed: number) => {
    const info = performanceData.clips[clip];
    if (clip !== activeClip || activeSource !== info.source) {
      activePack.mixer.stopAllAction();
      activePack = packs.find((pack) => pack.file === info.source.file)!;
      activePack.mixer.stopAllAction();
      activePack.actions.get(info.source.clip)!.reset().play();
      activeClip = clip;
      activeSource = info.source;
    }
    const progress =
      clip === "dance"
        ? (elapsed % info.duration) / info.duration
        : THREE.MathUtils.clamp(elapsed / info.duration, 0, 1);
    const action = activePack.actions.get(info.source.clip)!;
    if (!action.isScheduled()) action.reset().play();
    action.time =
      (info.source.reverse ? 1 - progress : progress) * info.source.duration;
    activePack.mixer.update(0);
  };
  function renderComposite(
    title: string,
    elapsed: number,
    detail: string,
    recording = false,
  ) {
    if (!recording) {
      ctx.fillStyle = "#eeeee5";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#21373c";
      ctx.font = "bold 19px Arial";
      ctx.fillText(title, 16, 26);
      ctx.font = "13px Arial";
      ctx.fillText(detail + ` · ${elapsed.toFixed(2)}s`, 16, 47);
    }
    const labels = [
      `SOURCE · ${activeSource.rig}`,
      "ZOOMAP · weight −1",
      "ZOOMAP · weight 0",
      "ZOOMAP · weight +1",
    ];
    for (const pack of packs) pack.gltf.scene.visible = false;
    activePack.gltf.scene.visible = true;
    // One scene pass per view avoids eight synchronous GPU readbacks per frame.
    // Temporary display transforms are restored before every measured update.
    for (const [row, view] of [0, 1].entries()) {
      for (let col = 0; col < 4; col++) {
        const object =
          col === 0 ? activePack.gltf.scene : actors[col - 1].avatar.object;
        object.visible = true;
        object.position.x = (col - 1.5) * 2.8;
        object.rotation.y = view ? -Math.PI / 2 : 0;
        if (col > 0) style.update(object, new THREE.Vector2(1024, 306));
      }
      camera.position.set(0, 1.29, 5);
      camera.lookAt(0, 1.29, 0);
      camera.updateMatrixWorld(true);
      if (recording) {
        renderer.setViewport(0, (1 - row) * 306, 1024, 306);
        renderer.setScissor(0, (1 - row) * 306, 1024, 306);
      }
      renderer.render(scene, camera);
      if (!recording) {
        ctx.drawImage(renderer.domElement, 0, 70 + row * 322);
        for (let col = 0; col < 4; col++) {
          ctx.fillStyle = "#21373c";
          ctx.font = "12px Arial";
          ctx.fillText(
            labels[col] + (view ? " · SIDE" : " · FRONT"),
            col * 256 + 8,
            66 + row * 322,
          );
        }
      }
    }
    for (const actor of actors) {
      actor.avatar.object.position.x = 0;
      actor.avatar.object.rotation.y = 0;
    }
    activePack.gltf.scene.position.x = 0;
    activePack.gltf.scene.rotation.y = 0;
    for (const pack of packs) pack.gltf.scene.visible = false;
  }
  function measure(actor: (typeof actors)[number], scan: boolean) {
    const { avatar, wield } = actor;
    avatar.object.updateMatrixWorld(true);
    const sockets = avatar.attachmentView()!.sockets;
    let lowest = Infinity,
      grip = 0;
    if (scan)
      avatar.object.traverse((object) => {
        if (
          !(object instanceof THREE.SkinnedMesh) ||
          object.userData.comicOutline
        )
          return;
        let owner: THREE.Object3D | null = object;
        while (owner && !owner.userData.assetId) owner = owner.parent;
        if (!String(owner?.userData.assetId).startsWith("shoes-")) return;
        for (let i = 0; i < object.geometry.attributes.position.count; i++)
          lowest = Math.min(
            lowest,
            object.getVertexPosition(i, v).applyMatrix4(object.matrixWorld).y,
          );
      });
    for (const hand of ["left", "right"] as const) {
      const item = wield.getHand(hand);
      if (!item || !presented(item.object, avatar.object)) continue;
      const frame = equipment.grips[hand].frame;
      const expected = sockets
        .get(hand === "left" ? "hand_L" : "hand_R")!
        .matrixWorld.clone()
        .multiply(
          new THREE.Matrix4().compose(
            new THREE.Vector3(...frame.position),
            new THREE.Quaternion().setFromEuler(
              new THREE.Euler(...frame.rotation),
            ),
            new THREE.Vector3(1, 1, 1),
          ),
        );
      const actual = item.anchor("grip").matrixWorld;
      grip = Math.max(
        grip,
        ...actual.elements.map((value, i) =>
          Math.abs(value - expected.elements[i]),
        ),
      );
    }
    const owner = wield.getHand("right") ?? wield.getHand("left");
    const state =
      wield.diagnostics().presentation.right ??
      wield.diagnostics().presentation.left;
    return {
      floor: lowest,
      grip,
      visible: !!owner && presented(owner.object, avatar.object),
      phase: state?.phase ?? "empty",
      progress: state?.progress ?? 0,
      root: avatar.object.position.toArray(),
      head: sockets.get("head")!.getWorldPosition(v).toArray(),
      hands: ["hand_L", "hand_R"].map((name) =>
        sockets.get(name)!.getWorldPosition(v).toArray(),
      ),
      quats: joints.map((name) =>
        sockets.get(name)!.getWorldQuaternion(q).clone(),
      ),
    };
  }
  async function run(
    id: string,
    clip: Clip,
    duration: number,
    motion: (elapsed: number) => Motion,
    record: boolean,
  ) {
    if (record) movieEntries.push({ id, clip, duration });
    const rows = actors.map(
      (actor) =>
        ({
          id,
          weight: actor.weight,
          duration,
          minFloor: Infinity,
          maxFloor: -Infinity,
          maxGrip: 0,
          maxJointStep: 0,
          maxRootDrift: 0,
          poseP95Ms: 0,
          poseMaxMs: 0,
          visibilityFlips: 0,
          finalDrawn: false,
          samples: [],
        }) as Row,
    );
    let previous = actors.map((actor) => measure(actor, true));
    const poseTimes = actors.map(() => [] as number[]);
    const sheet = document.createElement("canvas");
    sheet.width = 1024;
    sheet.height = 718 * 3;
    const sheetContext = sheet.getContext("2d")!;
    const snapshots = [0.25, 0.5, 0.75].map((fraction) =>
      Math.floor(fraction * duration * 60),
    );
    for (let frame = 0; frame <= Math.ceil(duration * 60); frame++) {
      const elapsed = Math.min(duration, frame / 60);
      document.title = `${id} ${elapsed.toFixed(2)}s`;
      for (const [index, actor] of actors.entries()) {
        const start = performance.now();
        actor.avatar.update((actor.clock += 1 / 60), motion(elapsed));
        poseTimes[index].push(performance.now() - start);
      }
      for (const [i, actor] of actors.entries()) {
        const pose = measure(actor, frame % 6 === 0),
          before = previous[i],
          row = rows[i];
        row.maxGrip = Math.max(row.maxGrip, pose.grip);
        row.maxRootDrift = Math.max(
          row.maxRootDrift,
          ...pose.root.map(Math.abs),
        );
        row.maxJointStep = Math.max(
          row.maxJointStep,
          ...pose.quats.map((value, j) =>
            THREE.MathUtils.radToDeg(value.angleTo(before.quats[j])),
          ),
        );
        if (pose.visible !== before.visible) row.visibilityFlips++;
        if (Number.isFinite(pose.floor)) {
          row.minFloor = Math.min(row.minFloor, pose.floor);
          row.maxFloor = Math.max(row.maxFloor, pose.floor);
        }
        if (frame % 6 === 0 || frame === Math.ceil(duration * 60))
          row.samples.push({
            time: elapsed,
            visible: pose.visible,
            phase: pose.phase,
            progress: pose.progress,
            floor: Number.isFinite(pose.floor) ? pose.floor : null,
            root: pose.root,
            head: pose.head,
            hands: pose.hands,
          });
        previous[i] = pose;
      }
      const snapshot = snapshots.indexOf(frame);
      if (snapshot >= 0) {
        sampleSource(clip, elapsed);
        renderComposite(
          id,
          elapsed,
          activeSource.clip +
            (clip.startsWith("equip") || clip.startsWith("stow")
              ? " · target adapts reach + exact item grips"
              : " · original authored performance"),
        );
        if (snapshot >= 0) sheetContext.drawImage(canvas, 0, snapshot * 718);
      }
    }
    rows.forEach((row, i) => {
      row.finalDrawn = actors[i].wield.isDrawn();
      const times = poseTimes[i].sort((a, b) => a - b);
      row.poseP95Ms = times[Math.floor(times.length * 0.95)];
      row.poseMaxMs = times.at(-1)!;
    });
    cases.push(...rows);
    images[id] = sheet.toDataURL();
  }
  async function recordTimeline() {
    // This is a separate real-time presentation pass. Deterministic 60Hz
    // geometry qualification above must not slow authored playback whenever
    // software WebGL readback takes longer than a display frame.
    renderer.setSize(1024, 612);
    renderer.setScissorTest(true);
    canvas.style.display = "none";
    document.body.append(renderer.domElement);
    // Static GPU labels retain the source/weight legend in the native movie;
    // upload once per clip, without reading the WebGL canvas back to the CPU.
    const labelCanvases = Array.from({ length: 4 }, (_, col) => {
      const label = document.createElement("canvas");
      label.width = 512;
      label.height = 72;
      const texture = new THREE.CanvasTexture(label);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, depthTest: false }),
      );
      sprite.position.set((col - 1.5) * 2.8, 2.76, 0);
      sprite.scale.set(2.7, 0.38, 1);
      scene.add(sprite);
      movieLabels.push(sprite);
      return label;
    });
    for (const entry of movieEntries) {
      const equipmentEntry = entry.id.startsWith("wield-");
      const drawn = entry.id.endsWith("-equip");
      const item = equipmentEntry
        ? equipment.items.find(
            (item) => entry.id === `${item.id}-${drawn ? "equip" : "stow"}`,
          )
        : undefined;
      labelCanvases.forEach((label, col) => {
        const context = label.getContext("2d")!;
        context.clearRect(0, 0, label.width, label.height);
        context.fillStyle = "#21373c";
        context.font = "bold 25px Arial";
        context.textAlign = "center";
        context.fillText(
          col === 0
            ? `${entry.clip} / SOURCE`
            : `ZOOMAP / WEIGHT ${actors[col - 1].weight}`,
          256,
          42,
        );
        movieLabels[col].material.map!.needsUpdate = true;
      });
      for (const actor of actors) {
        actor.avatar.update((actor.clock += 1 / 60));
        await actor.wield.setLoadout(
          item
            ? item.twoHanded
              ? { ...empty(), twoHanded: { item: item.id, primary: "right" } }
              : { ...empty(), right: item.id }
            : empty(),
        );
        if (item) actor.wield.setDrawn(!drawn, { immediate: true });
      }
      const start = performance.now();
      let previous = start,
        frames = 0,
        elapsed = 0;
      do {
        const now = performance.now();
        elapsed = Math.min(entry.duration, (now - start) / 1000);
        const dt = Math.max(1 / 1000, (now - previous) / 1000);
        previous = now;
        for (const actor of actors) {
          if (item) actor.wield.setDrawn(drawn, { elapsed });
          actor.avatar.update(
            (actor.clock += dt),
            item ? {} : { emote: { id: entry.clip as EmoteId, elapsed } },
          );
        }
        sampleSource(entry.clip, elapsed);
        renderComposite(
          entry.id,
          elapsed,
          `${activeSource.clip} · real-time source clock`,
          true,
        );
        if (recorder?.state === "inactive") recorder.start();
        (
          stream!.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack
        ).requestFrame();
        frames++;
        if (elapsed < entry.duration)
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
      } while (elapsed < entry.duration);
      recordingFrames.push({
        id: entry.id,
        view: "front and side",
        frames,
        seconds: (performance.now() - start) / 1000,
      });
    }
  }
  try {
    for (const descriptor of emoteDescriptors) {
      for (const actor of actors) {
        await actor.wield.setLoadout(empty());
        actor.avatar.cancelEmote();
        for (let f = 0; f < 15; f++)
          actor.avatar.update((actor.clock += 1 / 60));
      }
      await run(
        descriptor.id,
        descriptor.id,
        descriptor.duration,
        (t) => ({ emote: { id: descriptor.id, elapsed: t } }),
        true,
      );
    }
    for (const item of equipment.items) {
      const shared = !!item.twoHanded;
      for (const actor of actors) {
        actor.avatar.update((actor.clock += 1 / 60));
        await actor.wield.setLoadout(
          shared
            ? { ...empty(), twoHanded: { item: item.id, primary: "right" } }
            : { ...empty(), right: item.id },
        );
        actor.wield.setDrawn(false, { immediate: true });
        for (let f = 0; f < 12; f++)
          actor.avatar.update((actor.clock += 1 / 60));
      }
      const seconds = shared
        ? WIELD_TRANSITION_SECONDS.twoHand
        : WIELD_TRANSITION_SECONDS.oneHand;
      const record =
        shared ||
        item.id === "wield-doodle-rocket" ||
        item.id === "wield-firefly-lantern";
      for (const drawn of [true, false]) {
        for (const actor of actors) actor.wield.setDrawn(drawn);
        await run(
          `${item.id}-${drawn ? "equip" : "stow"}`,
          `${drawn ? "equip" : "stow"}${shared ? "Two" : "One"}` as Clip,
          seconds + 0.1,
          () => ({}),
          record,
        );
      }
    }
    if (options.record) await recordTimeline();
    if (recorder?.state === "recording") recorder.stop();
    const blob = recordingComplete ? await recordingComplete : undefined;
    const video = blob
      ? await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        })
      : undefined;
    return { cases, errors, verification, images, video, recordingFrames };
  } finally {
    if (recorder?.state === "recording") recorder.stop();
    for (const track of stream?.getTracks() ?? []) track.stop();
    style.clear();
    for (const label of movieLabels) {
      label.material.map?.dispose();
      label.material.dispose();
      label.removeFromParent();
    }
    for (const actor of actors) {
      actor.wield.dispose();
      actor.avatar.dispose();
    }
    gear.dispose();
    library.dispose();
    renderer.dispose();
    floor.geometry.dispose();
    floor.material.dispose();
    grid.geometry.dispose();
    for (const pack of packs) {
      pack.mixer.stopAllAction();
      pack.mixer.uncacheRoot(pack.gltf.scene);
      pack.gltf.scene.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose();
          for (const mat of Array.isArray(node.material)
            ? node.material
            : [node.material])
            mat.dispose();
        }
      });
    }
  }
}
