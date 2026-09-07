import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { disposeObject } from "../src/view.js";

test("scene cleanup releases a shared avatar skeleton and each geometry, material and texture once", () => {
  const root = new THREE.Group();
  const bone = new THREE.Bone();
  root.add(bone);
  const skeleton = new THREE.Skeleton([bone]);
  skeleton.computeBoneTexture();
  const geometry = new THREE.BoxGeometry();
  const texture = new THREE.DataTexture(
    new Uint8Array([255, 255, 255, 255]),
    1,
    1,
  );
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    emissiveMap: texture,
  });
  const body = new THREE.SkinnedMesh(geometry, material);
  body.bind(skeleton);
  // A modular part can have several material primitives and an ink shell
  // sharing its skeleton; leaving a room must not leak the GPU bone texture.
  const ink = new THREE.SkinnedMesh(geometry, material);
  ink.bind(skeleton);
  body.add(ink);
  root.add(body, new THREE.Mesh(geometry, [material, material]));
  const counts = { geometry: 0, material: 0, texture: 0, bones: 0 };
  geometry.addEventListener("dispose", () => counts.geometry++);
  material.addEventListener("dispose", () => counts.material++);
  texture.addEventListener("dispose", () => counts.texture++);
  skeleton.boneTexture!.addEventListener("dispose", () => counts.bones++);
  disposeObject(root);
  assert.deepEqual(counts, { geometry: 1, material: 1, texture: 1, bones: 1 });
  assert.equal(skeleton.boneTexture, null);
});

test("scene cleanup retains support for custom line and point scenery", () => {
  const root = new THREE.Group();
  const line = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial(),
  );
  const points = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial(),
  );
  root.add(line, points);
  let disposed = 0;
  for (const resource of [
    line.geometry,
    line.material,
    points.geometry,
    points.material,
  ])
    resource.addEventListener("dispose", () => disposed++);
  disposeObject(root);
  assert.equal(disposed, 4);
});
