import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
function glb(name: string) {
  const data = readFileSync(`examples/hub/public/models/${name}-v1.glb`);
  assert.equal(data.readUInt32LE(0), 0x46546c67);
  assert.equal(data.readUInt32LE(4), 2);
  const size = data.readUInt32LE(12);
  return { data, json: JSON.parse(data.subarray(20, 20 + size).toString()) };
}
test("Blender exports are bounded self-contained GLBs with the required animation pivots", () => {
  let bytes = 0;
  for (const name of ["athlete", "match-ball", "bench", "planter"]) {
    const { data, json } = glb(name);
    bytes += data.length;
    assert.ok(json.meshes.length > 0);
    assert.ok((json.buffers ?? []).every((b: any) => !b.uri));
    assert.ok(!(json.images ?? []).some((i: any) => i.uri));
    if (name === "athlete")
      for (const joint of ["leg_L", "leg_R", "arm_L", "arm_R", "head"])
        assert.ok(json.nodes.some((n: any) => n.name === joint));
  }
  assert.ok(bytes < 500_000);
});
