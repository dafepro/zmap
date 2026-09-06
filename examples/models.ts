import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Body, Character, Identity, Placement } from "zmap";
import { box } from "./characters";
const names = [
  "athlete-v1",
  "match-ball-v1",
  "bench-v1",
  "planter-v1",
] as const;
type ModelName = (typeof names)[number];
let templates: Promise<Map<ModelName, THREE.Group>> | undefined;
function loadTemplates() {
  return (templates ??= Promise.all(
    names.map(async (name) => {
      const response = await fetch(
        `${import.meta.env.BASE_URL}models/${name}.glb`,
        { signal: AbortSignal.timeout(10000) },
      );
      if (!response.ok)
        throw Error(`Model ${name} could not load (${response.status})`);
      return [
        name,
        (await new GLTFLoader().parseAsync(await response.arrayBuffer(), ""))
          .scene,
      ] as const;
    }),
  )
    .then((entries) => new Map(entries))
    .catch((error) => {
      templates = undefined;
      throw error;
    }));
}
export type ModelKit = Awaited<ReturnType<typeof loadModelKit>>;
export async function loadModelKit() {
  const models = await loadTemplates();
  function instance(name: ModelName) {
    const object = models.get(name)!.clone(true);
    const materials = new Map<THREE.Material, THREE.Material>();
    object.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry = o.geometry.clone();
        const copy = (m: THREE.Material) => {
          if (!materials.has(m)) materials.set(m, m.clone());
          return materials.get(m)!;
        };
        o.material = Array.isArray(o.material)
          ? o.material.map(copy)
          : copy(o.material);
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return object;
  }
  function character(identity: Identity): Character {
    const object = instance("athlete-v1");
    const palette = (
      {
        burgundy: ["#70263d", "#c88d65", "#30251e"],
        saffron: ["#db923e", "#855638", "#211f21"],
        sage: ["#648570", "#edba8a", "#8d5534"],
      } as Record<string, string[]>
    )[identity.appearance];
    if (!palette) throw Error("Unknown approved appearance");
    object.traverse((o) => {
      if (o instanceof THREE.Mesh)
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          const index = ["kit", "skin", "hair"].indexOf(m.name);
          if (index >= 0)
            (m as THREE.MeshStandardMaterial).color.set(palette[index]);
        }
    });
    const pivots = ["leg_L", "leg_R", "arm_L", "arm_R", "head"].map((name) => {
      const pivot = object.getObjectByName(name);
      if (!pivot) throw Error(`Athlete is missing ${name}`);
      return pivot;
    });
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.4, 24),
      new THREE.MeshBasicMaterial({
        color: "#374139",
        transparent: true,
        opacity: 0.17,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.008;
    object.add(shadow);
    let phase = 0,
      lastTime: number | undefined;
    return {
      object,
      update(body: Body, time: number) {
        const dt =
          lastTime === undefined
            ? 0
            : Math.max(0, Math.min(0.1, time - lastTime));
        lastTime = time;
        const speed = Math.min(1, Math.hypot(body.vx, body.vz) / 4);
        phase += dt * 10.5 * speed;
        const swing = Math.sin(phase) * 0.42 * speed;
        pivots[0].rotation.x = swing;
        pivots[1].rotation.x = -swing;
        pivots[2].rotation.x = -swing * 0.7;
        pivots[3].rotation.x = body.gesture > 0 ? -2.5 : swing * 0.7;
        pivots[3].rotation.z =
          body.gesture > 0 ? 0.25 + Math.sin(time * 13) * 0.12 : 0;
        pivots[4].rotation.z = Math.sin(time * 2) * 0.012;
      },
    };
  }
  function decoration(p: Placement) {
    if (p.type === "planter") return instance("planter-v1");
    if (p.type === "bench") return instance("bench-v1");
    const g = new THREE.Group();
    box(g, [0.55, 0.13, 0.55], [0, 0.065, 0], "#3c4948");
    box(g, [0.34, 0.6, 0.34], [0, 0.48, 0], "#f7c46d");
    box(g, [0.57, 0.15, 0.57], [0, 0.86, 0], "#3c4948");
    return g;
  }
  return {
    character,
    decoration,
    ball: () => instance("match-ball-v1"),
    bench: () => instance("bench-v1"),
    planter: () => instance("planter-v1"),
  };
}
