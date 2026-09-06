import * as THREE from "three";
/** Small authored scenery primitives; characters and furniture come from the Blender model kit. */
export function box(
  parent: THREE.Object3D,
  size: number[],
  position: number[],
  color: string,
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }),
  );
  mesh.position.set(position[0], position[1], position[2]);
  parent.add(mesh);
  return mesh;
}
