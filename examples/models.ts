import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  AvatarLibrary,
  defaultRecipe,
  type AvatarInstance,
} from "@zoomap/avatar-studio";
import type { Character, Identity, Placement } from "zmap";
import { box } from "./characters";
const names = ["match-ball-v1", "bench-v1", "planter-v1"] as const;
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
  const appearances = await loadAppearances();
  function character(identity: Identity): Character {
    const create = appearances.get(identity.appearance);
    if (!create) throw Error("Unknown approved appearance");
    const avatar = create();
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
    avatar.object.add(shadow);
    return avatar.asCharacter(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
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

// App policy maps an identity's approved appearance to a recipe. ZMap only sees Character.
// Preloading makes its synchronous visual factory deterministic, with no partial avatars.
let appearances: Promise<Map<string, () => AvatarInstance>> | undefined;
function loadAppearances() {
  return (appearances ??= (async () => {
    const base = new URL(`${import.meta.env.BASE_URL}avatars/`, location.href);
    const response = await fetch(new URL("catalog.json", base), {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw Error(`Avatar collection could not load (${response.status})`);
    const library = new AvatarLibrary(await response.json(), base.href);
    try {
      const choices = [
        {
          id: "burgundy",
          hair: "hair-sweep",
          shirt: "shirt-jersey",
          face: "face-focus",
          skin: "#c68b60",
          primary: "#782e43",
          hairColor: "#312821",
        },
        {
          id: "saffron",
          hair: "hair-curls",
          shirt: "shirt-hoodie",
          face: "face-grin",
          skin: "#855538",
          primary: "#d29339",
          hairColor: "#171d23",
        },
        {
          id: "sage",
          hair: "hair-pony",
          shirt: "shirt-track",
          face: "face-wink",
          skin: "#edc39d",
          primary: "#496d65",
          hairColor: "#c89144",
        },
      ];
      const results = await Promise.allSettled(
        choices.map(async (look) => {
          const recipe = defaultRecipe(library.catalog);
          Object.assign(recipe.parts, {
            hair: look.hair,
            shirt: look.shirt,
            face: look.face,
          });
          recipe.colors = {
            skin: look.skin,
            primary: look.primary,
            hair: look.hairColor,
          };
          return [look.id, await library.prepare(recipe)] as const;
        }),
      );
      const failure = results.find((r) => r.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
      return new Map(
        results.map(
          (r) =>
            (
              r as PromiseFulfilledResult<
                readonly [string, () => AvatarInstance]
              >
            ).value,
        ),
      );
    } catch (error) {
      library.dispose();
      throw error;
    }
  })().catch((error) => {
    appearances = undefined;
    throw error;
  }));
}
