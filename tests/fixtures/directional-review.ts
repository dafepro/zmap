import * as THREE from "three";
import {
  AvatarLibrary,
  ComicStyle,
  defaultRecipe,
  WieldLibrary,
  WieldController,
  emptyWieldLoadout,
  fieldToolBehaviors,
} from "../../avatar-studio/src/index";

const jointNames = [
  "hips",
  "chest",
  "head",
  "arm_L",
  "arm_R",
  "forearm_L",
  "forearm_R",
  "leg_L",
  "leg_R",
  "shin_L",
  "shin_R",
  "foot_L",
  "foot_R",
];
const directions = [
  "Forward",
  "Forward right",
  "Right",
  "Backward right",
  "Backward",
  "Backward left",
  "Left",
  "Forward left",
];
type Drive = { x: number; z: number };
type Pose = {
  joints: Record<string, { q: number[]; p: number[] }>;
  knees: number[];
  chestPitch: number;
  headPitch: number;
  trunkPitch: number;
  floor: number;
  grip: number;
  rootY: number;
  legSideAxis: number;
  kneeSeparation: number;
  hipYaw: number;
  carrierYaw: number;
  toolAimError: number;
};

/** Independent eight-direction visual/geometry qualification of the shipped rig.
 * Measures actual world joints and skinned shoe vertices, not diagnostic claims. */
export async function captureDirectionalReview(
  options: { record?: boolean } = {},
) {
  const [catalog, equipment] = await Promise.all(
    ["/avatars/catalog.json", "/avatars/action/catalog.json"].map(async (url) =>
      (await fetch(url)).json(),
    ),
  );
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
    { onError: (error) => errors.push(String(error)) },
  );
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(240, 312);
  let renderWidth = 240,
    renderHeight = 312;
  renderer.setClearColor("#efeee4");
  const scene = new THREE.Scene();
  scene.add(avatar.object, new THREE.HemisphereLight("#fff7df", "#81978d", 2));
  const sun = new THREE.DirectionalLight("#ffffff", 3);
  sun.position.set(-3, 6, 5);
  scene.add(sun);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    new THREE.MeshBasicMaterial({ color: "#e0e4d9" }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.005;
  scene.add(floor);
  const style = new ComicStyle({ inkWidth: 1.5 });
  const camera = new THREE.OrthographicCamera(
    -1.14,
    1.14,
    1.48,
    -1.48,
    0.01,
    50,
  );
  let clock = 0;
  let held = false;
  const neutralToolRotation = new THREE.Quaternion();
  const videoCanvas = document.createElement("canvas");
  videoCanvas.width = 768;
  videoCanvas.height = 558;
  const videoContext = videoCanvas.getContext("2d")!;
  const stream = options.record ? videoCanvas.captureStream(0) : undefined;
  const recording = stream
    ? new MediaRecorder(stream, {
        mimeType: "video/webm",
        videoBitsPerSecond: 2200000,
      })
    : undefined;
  const chunks: BlobPart[] = [];
  let startedRecording = false;
  let recordingComplete: Promise<Blob> | undefined;
  if (recording) {
    recording.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recordingComplete = new Promise((resolve, reject) => {
      recording.onstop = () =>
        resolve(new Blob(chunks, { type: "video/webm" }));
      recording.onerror = () =>
        reject(new Error("Directional video recording failed"));
    });
  }
  const point = new THREE.Vector3();
  const vector = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const previousQuat = new THREE.Quaternion();
  function tick(v: Drive) {
    avatar.object.position.x += v.x / 60;
    avatar.object.position.z += v.z / 60;
    avatar.update((clock += 1 / 60), { velocity: v, grounded: true });
  }
  function measure(scanFloor: boolean): Pose {
    avatar.object.updateMatrixWorld(true);
    const sockets = avatar.attachmentView()!.sockets;
    const joints: Pose["joints"] = {};
    for (const name of jointNames) {
      const bone = sockets.get(name)!;
      joints[name] = {
        q: bone.getWorldQuaternion(quat).toArray(),
        p: bone.getWorldPosition(point).sub(avatar.object.position).toArray(),
      };
    }
    const knees = ["L", "R"].map((side) => {
      const hip = new THREE.Vector3().fromArray(joints[`leg_${side}`].p);
      const knee = new THREE.Vector3().fromArray(joints[`shin_${side}`].p);
      const ankle = new THREE.Vector3().fromArray(joints[`foot_${side}`].p);
      return THREE.MathUtils.radToDeg(
        hip.sub(knee).angleTo(knee.clone().sub(ankle)),
      );
    });
    const pitch = (name: string) => {
      vector.set(0, 1, 0).applyQuaternion(quat.fromArray(joints[name].q));
      return THREE.MathUtils.radToDeg(Math.atan2(vector.z, vector.y));
    };
    vector.fromArray(joints.head.p).sub(point.fromArray(joints.hips.p));
    const trunkPitch = THREE.MathUtils.radToDeg(Math.atan2(vector.z, vector.y));
    let minY = Infinity;
    if (scanFloor)
      avatar.object.traverse((object) => {
        if (
          !(object instanceof THREE.SkinnedMesh) ||
          object.userData.comicOutline
        )
          return;
        let owner: THREE.Object3D | null = object;
        while (owner && !owner.userData.assetId) owner = owner.parent;
        if (!String(owner?.userData.assetId).startsWith("shoes-")) return;
        for (
          let vertex = 0;
          vertex < object.geometry.attributes.position.count;
          vertex++
        ) {
          object
            .getVertexPosition(vertex, point)
            .applyMatrix4(object.matrixWorld);
          minY = Math.min(minY, point.y);
        }
      });
    let grip = 0;
    if (held)
      for (const hand of ["left", "right"] as const) {
        const item = wield.getHand(hand)!;
        const frame = equipment.grips[hand].frame;
        const socket = sockets.get(hand === "left" ? "hand_L" : "hand_R")!;
        const expected = socket.matrixWorld
          .clone()
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
    const yaw = (name: string) => {
      vector.set(0, 0, 1).applyQuaternion(quat.fromArray(joints[name].q));
      return THREE.MathUtils.radToDeg(Math.atan2(vector.x, vector.z));
    };
    const toolAimError = held
      ? THREE.MathUtils.radToDeg(
          wield
            .getHand("right")!
            .anchor("face")
            .getWorldQuaternion(quat)
            .angleTo(neutralToolRotation),
        )
      : 0;
    const legSideAxis = Math.min(
      ...["leg_L", "leg_R", "shin_L", "shin_R"].map(
        (name) =>
          vector.set(1, 0, 0).applyQuaternion(quat.fromArray(joints[name].q)).x,
      ),
    );
    const kneeSeparation = joints.shin_R.p[0] - joints.shin_L.p[0];
    return {
      joints,
      knees,
      chestPitch: pitch("chest"),
      headPitch: pitch("head"),
      trunkPitch,
      floor: minY,
      grip,
      rootY: joints.hips.p[1],
      legSideAxis,
      kneeSeparation,
      hipYaw: yaw("hips"),
      carrierYaw: yaw("chest"),
      toolAimError,
    };
  }
  function sheet(title: string) {
    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 70 + 8 * 338;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#f5f3ea";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#203139";
    ctx.font = "bold 22px Arial";
    ctx.fillText(title, 16, 29);
    ctx.font = "14px Arial";
    ctx.fillText(
      "Actual avatar mesh · four gait phases · facing remains fixed while travel changes",
      16,
      53,
    );
    return { canvas, ctx };
  }
  function renderView(side: boolean, width = 240, height = 312) {
    const origin = avatar.object.position;
    camera.position.set(
      origin.x + (side ? 5 : 0),
      1.32,
      origin.z + (side ? 0 : 5),
    );
    camera.lookAt(origin.x, 1.32, origin.z);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    if (width !== renderWidth || height !== renderHeight) {
      renderer.setSize(width, height);
      renderWidth = width;
      renderHeight = height;
    }
    style.update(avatar.object, new THREE.Vector2(width, height));
    renderer.render(scene, camera);
  }
  function paint(
    target: ReturnType<typeof sheet>,
    row: number,
    col: number,
    name: string,
    side: boolean,
  ) {
    renderView(side);
    target.ctx.drawImage(renderer.domElement, col * 240, 70 + row * 338);
    target.ctx.fillStyle = "#203139";
    target.ctx.font = "13px Arial";
    target.ctx.fillText(
      `${name} · phase ${avatar.animationDiagnostics().locomotion.phase.toFixed(2)}`,
      col * 240 + 7,
      70 + row * 338 + 331,
    );
  }
  const sheets = Object.fromEntries(
    [2.2, 5.4].flatMap((speed) =>
      [false, true].flatMap((side) =>
        [false, true].map((tool) => [
          `${speed}-${tool ? "held-" : ""}${side ? "side" : "front"}`,
          sheet(
            `${speed === 2.2 ? "Walk" : "Sprint"} · ${speed} m/s · ${side ? "side" : "front"} · ${tool ? "two-hand panel" : "free hands"}`,
          ),
        ]),
      ),
    ),
  );
  const cases: any[] = [];
  async function reset(weight: number, tool: boolean) {
    held = tool;
    await avatar.setAppearance({ ...recipe, body: { weight } });
    await wield.setLoadout(
      tool
        ? {
            ...emptyWieldLoadout(equipment),
            twoHanded: { item: "wield-rebound-panel", primary: "right" },
          }
        : emptyWieldLoadout(equipment),
    );
    avatar.object.position.set(0, 0, 0);
    avatar.object.rotation.set(0, 0, 0);
    avatar.update((clock += 2), { reducedMotion: true });
    avatar.object.updateMatrixWorld(true);
    if (tool)
      wield
        .getHand("right")!
        .anchor("face")
        .getWorldQuaternion(neutralToolRotation);
  }
  async function audit(
    name: string,
    speed: number,
    weight: number,
    tool: boolean,
    drive: (frame: number) => Drive,
    row = -1,
  ) {
    for (let i = 0; i < 120; i++) tick(drive(0));
    let previous: Pose | undefined;
    const frames: any[] = [];
    const maxJump: Record<string, number> = {};
    let worstJump:
      | {
          degrees: number;
          joint: string;
          frame: number;
          from: number[];
          to: number[];
          velocity: number[];
          phase: number;
          clip: string;
        }
      | undefined;
    let minFloor = Infinity,
      maxFloor = -Infinity,
      maxGrip = 0,
      minKnee = 180,
      maxKnee = 0,
      maxTrunkPitch = -Infinity,
      minTrunkPitch = Infinity;
    let minRootY = Infinity,
      maxRootY = -Infinity;
    let minLegSideAxis = Infinity,
      minKneeSeparation = Infinity;
    let maxPlaybackRate = 0;
    let maxHipYaw = 0,
      maxCarrierYaw = 0,
      maxToolAimError = 0;
    const kneeMinimum = [180, 180];
    const captured = new Set<number>();
    const recordThisCase =
      !!recording &&
      weight === 0 &&
      ((!tool && (row >= 0 || name === "Backward sign seam")) ||
        (tool && row === 4));
    for (let frame = 0; frame < 180; frame++) {
      tick(drive(frame));
      // Measure shoe contact every frame; 10 Hz sampling aliases brief running contacts.
      const pose = measure(true);
      const locomotion = avatar.animationDiagnostics().locomotion;
      maxPlaybackRate = Math.max(maxPlaybackRate, locomotion.playbackRate);
      maxHipYaw = Math.max(maxHipYaw, Math.abs(pose.hipYaw));
      maxCarrierYaw = Math.max(maxCarrierYaw, Math.abs(pose.carrierYaw));
      maxToolAimError = Math.max(maxToolAimError, pose.toolAimError);
      minFloor = Math.min(minFloor, pose.floor);
      if (Number.isFinite(pose.floor))
        maxFloor = Math.max(maxFloor, pose.floor);
      minRootY = Math.min(minRootY, pose.rootY);
      maxRootY = Math.max(maxRootY, pose.rootY);
      maxGrip = Math.max(maxGrip, pose.grip);
      minKnee = Math.min(minKnee, ...pose.knees);
      maxKnee = Math.max(maxKnee, ...pose.knees);
      pose.knees.forEach(
        (value, i) => (kneeMinimum[i] = Math.min(kneeMinimum[i], value)),
      );
      maxTrunkPitch = Math.max(maxTrunkPitch, pose.trunkPitch);
      minTrunkPitch = Math.min(minTrunkPitch, pose.trunkPitch);
      minLegSideAxis = Math.min(minLegSideAxis, pose.legSideAxis);
      minKneeSeparation = Math.min(minKneeSeparation, pose.kneeSeparation);
      if (previous)
        for (const name of jointNames) {
          const jump = THREE.MathUtils.radToDeg(
            quat
              .fromArray(pose.joints[name].q)
              .angleTo(previousQuat.fromArray(previous.joints[name].q)),
          );
          maxJump[name] = Math.max(maxJump[name] ?? 0, jump);
          if (!worstJump || jump > worstJump.degrees)
            worstJump = {
              degrees: jump,
              joint: name,
              frame,
              from: previous.joints[name].q,
              to: pose.joints[name].q,
              velocity: avatar.animationDiagnostics().velocity,
              phase: locomotion.phase,
              clip: locomotion.clip,
            };
        }
      if (frame % 6 === 0)
        frames.push({
          frame,
          knees: pose.knees,
          chestPitch: pose.chestPitch,
          headPitch: pose.headPitch,
          trunkPitch: pose.trunkPitch,
          floor: pose.floor,
          rootY: pose.rootY,
          legSideAxis: pose.legSideAxis,
          kneeSeparation: pose.kneeSeparation,
          clip: locomotion.clip,
          playbackRate: locomotion.playbackRate,
          hipYaw: pose.hipYaw,
          carrierYaw: pose.carrierYaw,
          toolAimError: pose.toolAimError,
        });
      previous = pose;
      const phase = avatar.animationDiagnostics().locomotion.phase;
      const col = Math.floor(phase * 4) % 4;
      if (
        row >= 0 &&
        weight === 0 &&
        !captured.has(col) &&
        phase - col / 4 < 0.05
      ) {
        captured.add(col);
        for (const side of [false, true])
          paint(
            sheets[`${speed}-${tool ? "held-" : ""}${side ? "side" : "front"}`],
            row,
            col,
            name,
            side,
          );
      }
      if (recordThisCase && frame < 120) {
        await new Promise(requestAnimationFrame);
        if (!startedRecording) {
          recording!.start();
          startedRecording = true;
        }
        for (const side of [false, true]) {
          renderView(side, 384, 500);
          videoContext.drawImage(renderer.domElement, side ? 384 : 0, 0);
        }
        videoContext.fillStyle = "#f5f3ea";
        videoContext.fillRect(0, 500, 768, 58);
        videoContext.fillStyle = "#203139";
        videoContext.font = "bold 17px Arial";
        videoContext.fillText(
          `${name} · ${speed} m/s · ${tool ? "two-hand panel" : "free hands"}`,
          14,
          524,
        );
        videoContext.font = "14px Arial";
        videoContext.fillText(
          "Actual Zoomap avatar · front / side · fixed facing",
          14,
          547,
        );
        (
          stream!.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack
        ).requestFrame();
      }
    }
    if (recordThisCase && tool && speed === 5.4) recording!.stop();
    cases.push({
      name,
      speed,
      weight,
      tool,
      minFloor,
      maxFloor,
      minRootY,
      maxRootY,
      maxGrip,
      minKnee,
      maxKnee,
      kneeMinimum,
      maxTrunkPitch,
      minTrunkPitch,
      minLegSideAxis,
      minKneeSeparation,
      maxPlaybackRate,
      maxHipYaw,
      maxCarrierYaw,
      maxToolAimError,
      maxJump,
      worstJump,
      frames,
    });
  }
  try {
    for (const weight of [-1, 0, 1])
      for (const tool of [false, true]) {
        await reset(weight, tool);
        for (const speed of [2.2, 5.4]) {
          for (const [row, name] of directions.entries()) {
            const angle = (row * Math.PI) / 4;
            await audit(
              name,
              speed,
              weight,
              tool,
              () => ({
                x: Math.sin(angle) * speed,
                z: Math.cos(angle) * speed,
              }),
              row,
            );
          }
          await audit("Backward sign seam", speed, weight, tool, (frame) => ({
            x: frame % 2 ? 0.00001 : -0.00001,
            z: -speed,
          }));
          await audit(
            "Abrupt direction changes",
            speed,
            weight,
            tool,
            (frame) => {
              const angle = Math.floor(frame / 30) * Math.PI * 0.75;
              return { x: Math.sin(angle) * speed, z: Math.cos(angle) * speed };
            },
          );
        }
      }
    const recordedBlob = recordingComplete
      ? await recordingComplete
      : undefined;
    const video = recordedBlob
      ? await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(recordedBlob);
        })
      : undefined;
    return {
      cases,
      errors,
      video,
      images: Object.fromEntries(
        Object.entries(sheets).map(([key, value]) => [
          key,
          value.canvas.toDataURL(),
        ]),
      ),
    };
  } finally {
    if (recording?.state === "recording") recording.stop();
    for (const track of stream?.getTracks() ?? []) track.stop();
    style.clear();
    wield.dispose();
    avatar.dispose();
    library.dispose();
    wieldLibrary.dispose();
    renderer.dispose();
    floor.geometry.dispose();
    floor.material.dispose();
  }
}
