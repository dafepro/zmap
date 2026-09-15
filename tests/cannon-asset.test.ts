import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { cannonConfig } from "../src/cannon";

const file = new URL(
  "../examples/hub/public/models/ball-cannon.glb",
  import.meta.url,
);
async function asset() {
  const bytes = await readFile(file);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const { scene } = await new GLTFLoader().parseAsync(buffer, "");
  scene.updateMatrixWorld(true);
  return { bytes, json, scene };
}

test("the real cannon export has a stable mechanical ABI, isolated contents and bounded rendering cost", async () => {
  const { bytes, json, scene } = await asset();
  assert.ok(
    bytes.length < 1024 * 1024,
    "one original prop must remain below 1 MiB",
  );
  assert.equal(json.scenes.length, 1);
  assert.equal(
    json.scenes[0].nodes.length,
    1,
    "no selected objects from unrelated Blender scenes",
  );
  assert.equal(scene.children[0].name, "ball_cannon");
  assert.equal(json.skins, undefined);
  assert.equal(
    json.images,
    undefined,
    "packed concept sheets do not belong in runtime GLB",
  );
  assert.ok(json.meshes.length <= 12);
  assert.ok(
    json.meshes.reduce((n: number, m: any) => n + m.primitives.length, 0) <= 45,
  );
  let triangles = 0;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const positions = object.geometry.getAttribute("position");
    assert.ok(Array.from(positions.array).every(Number.isFinite));
    triangles += (object.geometry.index?.count ?? positions.count) / 3;
  });
  assert.ok(triangles <= 16000);
  const config = cannonConfig(["ball"]);
  for (const name of ["intake", "muzzle"] as const) {
    const node = scene.getObjectByName(name);
    assert.ok(node);
    const p = config[name];
    assert.ok(
      node
        .getWorldPosition(new THREE.Vector3())
        .distanceTo(new THREE.Vector3(p.x, p.y, p.z)) < 1e-5,
    );
  }
  for (const name of [
    "barrel_recoil",
    "gauge_needle",
    "fuse_tip",
    "indicator_0",
    "indicator_1",
    "indicator_2",
  ])
    assert.ok(
      scene.getObjectByName(name),
      `${name} must survive every Blender iteration`,
    );
  const bounds = new THREE.Box3().setFromObject(scene);
  assert.ok(
    bounds.min.y >= -0.015 && bounds.min.y <= 0.015,
    "wheels sit on ground",
  );
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(size.x >= 1.65 && size.x <= 1.85);
  assert.ok(size.z >= 2.58 && size.z <= 2.68);
});

test("both cannon apertures and the whole bore clear a .8 metre ball plus radial tolerance", async () => {
  const { scene } = await asset();
  const meshes: THREE.Mesh[] = [];
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes.push(object);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material])
      material.side = THREE.DoubleSide;
  });
  const ray = new THREE.Raycaster();
  // Both directions, concentric rings and angular samples catch support pieces,
  // capped tubes and polygon corners crossing the loading/launch envelope.
  for (const direction of [-1, 1])
    for (const radius of [0, 0.2, 0.4, 0.425])
      for (let i = 0; i < 64; i++) {
        const theta = (i * Math.PI * 2) / 64;
        ray.set(
          new THREE.Vector3(
            radius * Math.cos(theta),
            0.85 + radius * Math.sin(theta),
            -direction * 1.4,
          ),
          new THREE.Vector3(0, 0, direction),
        );
        ray.near = 0;
        ray.far = 2.8;
        assert.equal(
          ray.intersectObjects(meshes, false).length,
          0,
          `bore obstruction at radius ${radius}, angle ${i}, direction ${direction}`,
        );
      }
});
