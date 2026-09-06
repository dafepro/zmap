import * as THREE from "three";
import type { Character, Body, Identity, Placement } from "zmap";
const mat = (color: string) =>
  new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
export function box(
  parent: THREE.Object3D,
  size: number[],
  position: number[],
  color: string,
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    mat(color),
  );
  mesh.position.set(position[0], position[1], position[2]);
  parent.add(mesh);
  return mesh;
}
export function character(identity: Identity): Character {
  const palettes: Record<string, string[]> = {
    burgundy: ["#70263d", "#c88d65", "#30251e"],
    saffron: ["#e5a249", "#855638", "#211f21"],
    sage: ["#789b88", "#edba8a", "#8d5534"],
  };
  const [shirt, skin, hair] =
    palettes[identity.appearance] ?? palettes.burgundy;
  const object = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.23, 0.51, 5),
    mat(shirt),
  );
  torso.position.y = 0.94;
  object.add(torso);
  box(object, [0.18, 0.07, 0.035], [0, 1.09, 0.245], "#faf1d5");
  box(object, [0.12, 0.13, 0.035], [0, 0.91, 0.255], "#faf1d5");
  box(object, [0.4, 0.2, 0.28], [0, 0.64, 0], "#283337");
  const head = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.31, 0),
    mat(skin),
  );
  head.scale.set(1, 1.06, 0.92);
  head.position.y = 1.42;
  object.add(head);
  const hairMesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.34, 0),
    mat(hair),
  );
  hairMesh.scale.set(1, 0.65, 0.97);
  hairMesh.position.set(0, 1.63, -0.035);
  object.add(hairMesh);
  for (const x of [-0.29, 0.29]) {
    const ear = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.13, 0.12),
      mat(skin),
    );
    ear.position.set(x, 1.42, 0);
    object.add(ear);
  }
  for (const x of [-0.1, 0.1]) {
    box(object, [0.075, 0.065, 0.04], [x, 1.45, 0.26], "#faf8ec");
    box(object, [0.028, 0.04, 0.05], [x, 1.45, 0.28], "#302624");
  }
  box(object, [0.12, 0.025, 0.045], [0, 1.32, 0.255], "#713e32");
  const limbs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.13, 0.59, 0);
    object.add(leg);
    box(leg, [0.15, 0.28, 0.16], [0, -0.13, 0], skin);
    box(leg, [0.15, 0.16, 0.17], [0, -0.34, 0], "#f2eee0");
    box(leg, [0.19, 0.12, 0.29], [0, -0.47, 0.04], "#29333a");
    box(leg, [0.2, 0.025, 0.3], [0, -0.525, 0.04], "#fcf3dd");
    limbs.push(leg);
    const arm = new THREE.Group();
    arm.position.set(side * 0.3, 1.1, 0);
    object.add(arm);
    box(arm, [0.17, 0.2, 0.21], [side * 0.025, -0.075, 0], shirt);
    box(arm, [0.13, 0.29, 0.13], [side * 0.035, -0.27, 0], skin);
    limbs.push(arm);
  }
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.38, 16),
    new THREE.MeshBasicMaterial({
      color: "#374139",
      transparent: true,
      opacity: 0.17,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  object.add(shadow);
  return {
    object,
    update(body: Body, time: number) {
      const stride = Math.min(1, Math.hypot(body.vx, body.vz) / 4);
      const swing = Math.sin(time * 11) * 0.48 * stride;
      limbs[0].rotation.x = swing;
      limbs[2].rotation.x = -swing;
      limbs[1].rotation.x = -swing;
      limbs[3].rotation.x = body.gesture > 0 ? -2.4 : swing;
      limbs[3].rotation.z =
        body.gesture > 0 ? 0.3 + Math.sin(time * 15) * 0.15 : 0;
      torso.rotation.z = Math.sin(time * 5) * 0.012;
    },
  };
}
export function planter() {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48, 0.34, 0.65, 5),
    mat("#aa937b"),
  );
  pot.position.y = 0.325;
  g.add(pot);
  const dirt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.43, 0.43, 0.03, 5),
    mat("#4d5038"),
  );
  dirt.position.y = 0.66;
  g.add(dirt);
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.8, 3),
      mat(i % 2 ? "#6e8854" : "#9bab62"),
    );
    leaf.position.set(Math.cos(i * 1.3) * 0.18, 1, Math.sin(i * 1.3) * 0.18);
    leaf.rotation.z = Math.cos(i) * 0.35;
    g.add(leaf);
  }
  return g;
}
export function bench() {
  const g = new THREE.Group();
  for (const z of [-0.2, 0, 0.2])
    box(g, [2, 0.12, 0.15], [0, 0.58, z], "#b9804f");
  for (const y of [0.9, 1.14]) box(g, [2, 0.17, 0.1], [0, y, -0.3], "#c3915e");
  for (const x of [-0.76, 0.76]) {
    box(g, [0.11, 0.58, 0.5], [x, 0.29, 0], "#3c4948");
    box(g, [0.09, 1.1, 0.1], [x, 0.6, -0.32], "#3c4948");
  }
  return g;
}
export function decoration(p: Placement) {
  if (p.type === "planter") return planter();
  if (p.type === "bench") return bench();
  const g = new THREE.Group();
  box(g, [0.55, 0.13, 0.55], [0, 0.065, 0], "#3c4948");
  box(g, [0.34, 0.6, 0.34], [0, 0.48, 0], "#f7c46d");
  box(g, [0.57, 0.15, 0.57], [0, 0.86, 0], "#3c4948");
  return g;
}
export function ball() {
  const geometry = new THREE.IcosahedronGeometry(0.38, 1);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const color = new THREE.Color(
      Math.floor(i / 3) % 7 === 0 ? "#303a3a" : "#faf3df",
    );
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 1,
    }),
  );
}
