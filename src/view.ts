import { rollingMotion } from "./presentation.js";
import * as THREE from "three";
import {
  top,
  type Body,
  type Identity,
  type ItemType,
  type Placement,
  type Simulation,
  type WorldMap,
  type Vec3,
} from "./core.js";
export type Character = {
  object: THREE.Group;
  update: (body: Body, time: number) => void;
};
export type VisualOptions = {
  character?: (identity: Identity) => Character;
  decoration?: (placement: Placement) => THREE.Object3D;
  scenery?: (scene: THREE.Scene, map: WorldMap) => void;
  toy?: (id: string) => THREE.Object3D;
};
export const screenToWorld = (x: number, y: number) => ({
  x: (x + y) / Math.SQRT2,
  z: (-x + y) / Math.SQRT2,
});
export function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  root.traverse((o) => {
    // Custom scenery may also contain lines, points or sprites.
    const renderable = o as THREE.Mesh;
    if (renderable.geometry) geometries.add(renderable.geometry);
    if (renderable.material)
      for (const material of Array.isArray(renderable.material)
        ? renderable.material
        : [renderable.material])
        materials.add(material);
    if (o instanceof THREE.SkinnedMesh) skeletons.add(o.skeleton);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) {
    for (const value of Object.values(material))
      if (value instanceof THREE.Texture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
  for (const skeleton of skeletons) skeleton.dispose();
}
export class WorldView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-12, 12, 9, -9, 0.1, 150);
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  private observer: ResizeObserver;
  private characters = new Map<string, Character>();
  private toys = new Map<string, THREE.Object3D>();
  private decorations = new THREE.Group();
  private preview?: THREE.Object3D;
  private previewFocus?: Vec3;
  private slabMaterials: {
    surface: WorldMap["surfaces"][number];
    material: THREE.MeshStandardMaterial;
  }[] = [];
  private target = new THREE.Vector3();
  private initialized = false;
  private revision = -1;
  private marker: THREE.Mesh;
  private frameTimes: number[] = [];
  private lastFrame = 0;
  private toyPositions = new Map<string, Vec3>();
  constructor(
    readonly container: HTMLElement,
    readonly map: WorldMap,
    readonly catalog: ItemType[],
    readonly visuals: VisualOptions = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "low-power",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setClearColor("#dbe5de");
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.renderer.domElement;
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute(
      "aria-label",
      "Zoomap world. Use WASD or arrow keys to move, Space to kick, E to wave.",
    );
    this.container.append(this.canvas);
    this.scene.add(new THREE.HemisphereLight("#fff5dd", "#62736c", 2.0));
    const sun = new THREE.DirectionalLight("#fff3d6", 2.1);
    sun.position.set(-12, 22, 12);
    this.scene.add(sun);
    for (const s of map.surfaces) {
      const thickness = Math.max(0.15, s.thickness);
      const geo = new THREE.BoxGeometry(s.width, thickness, s.depth);
      const positions = geo.attributes.position;
      for (let i = 0; i < positions.count; i++)
        positions.setY(
          i,
          positions.getY(i) +
            (s.slope ?? 0) * (positions.getZ(i) + s.depth / 2),
        );
      geo.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({
        color: s.color ?? "#d8cfb6",
        roughness: 1,
        flatShading: true,
      });
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(
        s.x + s.width / 2,
        s.y - thickness / 2,
        s.z + s.depth / 2,
      );
      this.scene.add(mesh);
      if (s.y > 1 && s.thickness < 1)
        this.slabMaterials.push({ surface: s, material });
    }
    for (const t of map.toys) {
      const mesh =
        visuals.toy?.(t.id) ??
        new THREE.Mesh(
          new THREE.IcosahedronGeometry(t.radius, 1),
          new THREE.MeshStandardMaterial({ color: t.color, flatShading: true }),
        );
      this.toys.set(t.id, mesh);
      this.scene.add(mesh);
    }
    this.scene.add(this.decorations);
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.46, 32),
      new THREE.MeshBasicMaterial({
        color: "#6a233c",
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.scene.add(this.marker);
    visuals.scenery?.(this.scene, map);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
  }
  reset() {
    this.revision = -1;
    this.initialized = false;
    this.lastFrame = 0;
    this.frameTimes = [];
    this.toyPositions.clear();
  }
  private resize() {
    const width = Math.max(1, this.container.clientWidth),
      height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height);
    const halfHeight = width < 600 ? 8.5 : 10;
    this.camera.left = (-halfHeight * width) / height;
    this.camera.right = (halfHeight * width) / height;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
  }
  render(
    state: Simulation,
    roster: { session: string; identity: Identity }[],
    localId: string,
    local: Body | undefined,
    items: Placement[],
    revision: number,
    time: number,
    reducedMotion: boolean,
  ) {
    const dt = this.lastFrame
      ? Math.max(0, Math.min(0.1, (time - this.lastFrame) / 1000))
      : 0;
    if (this.lastFrame && time > this.lastFrame) {
      this.frameTimes.push(time - this.lastFrame);
      if (this.frameTimes.length > 300) this.frameTimes.shift();
    }
    this.lastFrame = time;
    const ids = new Set(roster.map((p) => p.session));
    for (const [id, c] of this.characters)
      if (!ids.has(id)) {
        this.scene.remove(c.object);
        disposeObject(c.object);
        this.characters.delete(id);
      }
    for (const p of roster) {
      let c = this.characters.get(p.session);
      if (!c) {
        try {
          c = this.visuals.character?.(p.identity);
        } catch {
          /* Geometry fallback keeps failed cosmetics playable. */
        }
        if (!c) {
          const object = new THREE.Group();
          const mesh = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.28, 0.8, 2, 6),
            new THREE.MeshStandardMaterial({ color: "#72253d" }),
          );
          mesh.position.y = 0.7;
          object.add(mesh);
          c = { object, update: () => {} };
        }
        this.characters.set(p.session, c);
        this.scene.add(c.object);
      }
      const b = p.session === localId ? local : state.players[p.session];
      if (!b) continue;
      c.object.position.set(b.x, b.y, b.z);
      c.object.rotation.y = b.facing;
      c.update(b, reducedMotion ? 0 : time / 1000);
    }
    for (const t of this.map.toys) {
      const b = state.toys[t.id],
        mesh = this.toys.get(t.id)!;
      mesh.position.set(b.x, b.y + t.radius, b.z);
      const previous = this.toyPositions.get(t.id);
      if (
        previous &&
        !reducedMotion &&
        Math.hypot(b.x - previous.x, b.z - previous.z) < 2
      ) {
        const roll = rollingMotion(previous, b, t.radius);
        if (roll.angle)
          mesh.quaternion.premultiply(
            new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(roll.axis.x, 0, roll.axis.z),
              roll.angle,
            ),
          );
      }
      this.toyPositions.set(t.id, { x: b.x, y: b.y, z: b.z });
    }
    for (const trigger of this.map.triggers) {
      const object = this.scene.getObjectByName(`trigger-${trigger.id}`);
      if (object) {
        const active = state.triggers[trigger.id] > 0;
        object.scale.y = active && !reducedMotion ? 1.3 : 1;
        const material = (object as THREE.Mesh)
          .material as THREE.MeshStandardMaterial;
        if (material?.emissive)
          material.emissive.set(active ? "#e6a543" : "#000000");
      }
    }
    if (revision !== this.revision) {
      disposeObject(this.decorations);
      this.decorations.clear();
      for (const p of items) {
        const object = this.makeDecoration(p);
        this.decorations.add(object);
      }
      this.revision = revision;
    }
    if (local) {
      const focus = this.previewFocus ?? local;
      const desired = new THREE.Vector3(focus.x, focus.y + 0.8, focus.z);
      if (!this.initialized || reducedMotion) this.target.copy(desired);
      else this.target.lerp(desired, 1 - Math.exp(-8 * dt));
      this.initialized = true;
      this.camera.position.copy(this.target).add(new THREE.Vector3(16, 19, 16));
      this.camera.lookAt(this.target);
      this.marker.position.set(local.x, local.y + 0.025, local.z);
      for (const { surface: s, material } of this.slabMaterials) {
        const hidden =
          local.y < s.y - 1 &&
          Math.abs(local.x - (s.x + s.width / 2)) < s.width / 2 + 2 &&
          Math.abs(local.z - (s.z + s.depth / 2)) < s.depth / 2 + 2;
        material.transparent = hidden;
        material.opacity = hidden ? 0.23 : 1;
        material.depthWrite = !hidden;
      }
    }
    this.renderer.render(this.scene, this.camera);
  }
  private makeDecoration(p: Placement) {
    const type = this.catalog.find((t) => t.id === p.type)!;
    const object =
      this.visuals.decoration?.(p) ??
      new THREE.Mesh(
        new THREE.BoxGeometry(
          type.radius * 1.4,
          type.height,
          type.radius * 1.4,
        ).translate(0, type.height / 2, 0),
        new THREE.MeshStandardMaterial({ color: "#548c68" }),
      );
    object.position.set(p.position.x, p.position.y, p.position.z);
    object.rotation.y = p.rotation;
    return object;
  }
  showPreview(p?: Placement, valid = true) {
    this.previewFocus = p ? { ...p.position } : undefined;
    if (this.preview) {
      this.scene.remove(this.preview);
      disposeObject(this.preview);
      this.preview = undefined;
    }
    if (!p) return;
    this.preview = this.makeDecoration(p);
    this.preview.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        for (const material of Array.isArray(o.material)
          ? o.material
          : [o.material])
          material.dispose();
        o.material = new THREE.MeshStandardMaterial({
          color: valid ? "#498f68" : "#c63743",
          transparent: true,
          opacity: 0.55,
        });
      }
    });
    this.scene.add(this.preview);
  }
  pick(clientX: number, clientY: number, height = 0): Vec3 | undefined {
    const bounds = this.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((clientX - bounds.left) / bounds.width) * 2 - 1,
        (-(clientY - bounds.top) / bounds.height) * 2 + 1,
      ),
      this.camera,
    );
    const p = ray.ray.intersectPlane(
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -height),
      new THREE.Vector3(),
    );
    return p
      ? { x: Math.round(p.x * 2) / 2, y: height, z: Math.round(p.z * 2) / 2 }
      : undefined;
  }
  diagnostics() {
    const frames = [...this.frameTimes].sort((a, b) => a - b);
    return {
      frameP95Ms: frames[Math.floor(frames.length * 0.95)] ?? 0,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
    };
  }
  dispose() {
    this.observer.disconnect();
    disposeObject(this.scene);
    this.characters.clear();
    this.toys.clear();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
