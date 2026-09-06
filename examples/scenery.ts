import * as THREE from "three";
import type { WorldMap } from "zmap";
import { box } from "./characters";
import type { ModelKit } from "./models";
const material = (color: string) =>
  new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
function label(
  scene: THREE.Scene,
  text: string,
  position: number[],
  width = 3,
  color = "#60283b",
) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = "#fff4d9";
  ctx.font = "bold 35px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 64);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 4),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      side: THREE.DoubleSide,
    }),
  );
  mesh.position.set(position[0], position[1], position[2]);
  scene.add(mesh);
}
export function scenery(scene: THREE.Scene, map: WorldMap, kit: ModelKit) {
  const tileGeo = new THREE.BoxGeometry(1.92, 0.03, 1.92),
    tileMat = material("#e7ddc8");
  const tiles = new THREE.InstancedMesh(tileGeo, tileMat, 160);
  const m = new THREE.Matrix4();
  let n = 0;
  for (let x = -6; x <= 6; x += 2)
    for (let z = 6; z <= 16; z += 2) {
      m.makeTranslation(x, 0.017, z);
      tiles.setMatrixAt(n++, m);
    }
  for (let x = -10; x <= 10; x += 2)
    for (let z = -8; z <= -4; z += 2) {
      m.makeTranslation(x, 3.02, z);
      tiles.setMatrixAt(n++, m);
    }
  tiles.count = n;
  scene.add(tiles);
  for (const zone of map.placementZones) {
    const patch = new THREE.Mesh(
      new THREE.BoxGeometry(zone.width, 0.025, zone.depth),
      material("#a7b77c"),
    );
    patch.position.set(zone.x + zone.width / 2, 0.03, zone.z + zone.depth / 2);
    scene.add(patch);
  }
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.75, 2.8, 64),
    new THREE.MeshBasicMaterial({ color: "#f9f1d9", side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(1, 0.047, 11);
  scene.add(ring);
  for (const x of [-1.84, 1.84]) {
    box(scene, [0.08, 0.1, 7], [x, 4, -0.0 + 1.5], "#a67e50");
    for (let z = -2; z <= 5; z += 1.4)
      box(scene, [0.07, 1, 0.07], [x, 3.5, z], "#697878");
  }
  for (const x of [-9, -5.5]) {
    const rail = box(scene, [0.08, 0.09, 8.55], [x, 2.48, 2], "#a67e50");
    rail.rotation.x = Math.atan(0.375);
    for (let z = -2; z <= 6; z += 2)
      box(
        scene,
        [0.07, 0.8, 0.07],
        [x, 3 - (z + 2) * 0.375 + 0.4, z],
        "#697878",
      );
  }
  box(scene, [22, 0.12, 0.12], [0, 4, -8.9], "#a67e50");
  for (let x = -11; x <= 11; x += 2)
    box(scene, [0.08, 1, 0.08], [x, 3.5, -8.9], "#697878");
  const treePositions = [
    [-14, -9],
    [-14, -5],
    [-14, 0],
    [-13, 5],
    [13, -9],
    [13, -5],
    [14, 10],
    [12, 15],
    [-13, 16],
    [-7, -10],
    [7, -10],
  ];
  for (let i = 0; i < treePositions.length; i++) {
    const [x, z] = treePositions[i];
    box(scene, [0.22, 1.5, 0.22], [x, 0.7, z], "#79614b");
    for (let j = 0; j < 2; j++) {
      const tree = new THREE.Mesh(
        new THREE.ConeGeometry(1.1 - j * 0.2, 2.7, 5),
        material(i % 2 ? "#688861" : "#89985b"),
      );
      tree.position.set(x, 2 + j * 0.9, z);
      tree.rotation.y = i;
      scene.add(tree);
    }
  }
  for (const [x, y, z] of [
    [-4, 3, -6],
    [5, 3, -6],
    [-5, 0, 14],
    [8.6, 0, 14.5],
  ]) {
    const b = kit.bench();
    b.position.set(x, y, z);
    scene.add(b);
  }
  for (const [x, y, z] of [
    [-10, 3, -3],
    [10, 3, -3],
    [-3, 0, 7.7],
    [6.8, 0, 14.5],
  ]) {
    const p = kit.planter();
    p.position.set(x, y, z);
    scene.add(p);
  }
  // The fire bowl is an authored blocker; flame is quiet procedural geometry, no flashing.
  const fire = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 0.8, 0.7, 8),
    material("#56625c"),
  );
  fire.position.set(8.5, 0.35, 12.5);
  scene.add(fire);
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.45, 1.1, 5),
    material("#f4b44f"),
  );
  flame.position.set(8.5, 1.1, 12.5);
  scene.add(flame);
  for (const trigger of map.triggers) {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(trigger.radius, trigger.radius, 0.1, 12),
      material("#e5aa54"),
    );
    pad.name = `trigger-${trigger.id}`;
    pad.position.set(trigger.position.x, 0.06, trigger.position.z);
    scene.add(pad);
  }
  label(scene, "PLAY TOGETHER", [0, 3.6, 5.06], 3.4);
  label(scene, "THE OVERLOOK", [3, 4, -8.75], 4);
  label(scene, "YOUR LITTLE CORNER", [11, 0.8, 7.8], 3);
  label(scene, "↑  UP & OVER", [-7.2, 0.75, 6.1], 2.7, "#5d7466");
  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: "#526144",
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
  });
  for (const [x, z] of treePositions) {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.15, 8),
      shadowMaterial,
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1, 1.6, 1);
    shadow.position.set(x + 0.3, 0.046, z + 0.25);
    scene.add(shadow);
  }
  const underpass = new THREE.Mesh(
    new THREE.PlaneGeometry(3.5, 7),
    new THREE.MeshBasicMaterial({
      color: "#435b50",
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    }),
  );
  underpass.rotation.x = -Math.PI / 2;
  underpass.position.set(0, 0.042, 1.5);
  scene.add(underpass);
  for (let i = 0; i < 5; i++) {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.6 + (i % 2) * 0.3),
      material("#a4aa98"),
    );
    rock.scale.y = 0.6;
    rock.position.set(-11 + i * 0.8, 0.2, -10.5);
    scene.add(rock);
  }
}
