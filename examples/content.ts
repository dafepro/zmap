import type { WorldMap, ItemType, Identity } from "zmap/core";
export const courtyard: WorldMap = {
  version: 1,
  id: "courtyard-v1",
  bounds: { x: -16, z: -12, width: 32, depth: 30 },
  spawn: { x: 2, y: 0, z: 10 },
  surfaces: [
    {
      id: "court",
      x: -16,
      z: -12,
      width: 32,
      depth: 30,
      y: 0,
      thickness: 1,
      color: "#c6cdb8",
    },
    {
      id: "overlook",
      x: -11,
      z: -9,
      width: 22,
      depth: 7,
      y: 3,
      thickness: 3,
      color: "#e2d5bb",
    },
    {
      id: "ramp",
      x: -9,
      z: -2,
      width: 3.5,
      depth: 8,
      y: 3,
      slope: -0.375,
      thickness: 0.25,
      color: "#e7d6b5",
    },
    {
      id: "bridge",
      x: -1.8,
      z: -2,
      width: 3.6,
      depth: 7,
      y: 3,
      thickness: 0.4,
      color: "#ead9ba",
    },
    {
      id: "landing",
      x: -2.5,
      z: 5,
      width: 5,
      depth: 2.5,
      y: 3,
      thickness: 3,
      color: "#d9cbb5",
    },
  ],
  blockers: [
    { x: -11, z: -9, width: 22, depth: 0.25, y: 3, height: 1 },
    { x: 7.5, z: 11.5, width: 2, depth: 2, y: 0, height: 1.1 },
  ],
  toys: [
    {
      id: "ball",
      home: { x: 2, y: 0, z: 8.7 },
      radius: 0.38,
      color: "#f7f3e5",
      sleep: "home",
    },
  ],
  triggers: [
    {
      id: "launcher",
      position: { x: 5, y: 0, z: 6 },
      radius: 1.1,
      impulse: { x: -5, y: 6, z: 4 },
      cooldown: 1.5,
    },
  ],
  placementZones: [
    { x: 8, z: -1, width: 6, depth: 9 },
    { x: -14, z: 8, width: 5, depth: 7 },
  ],
  protectedZones: [
    { x: -5, z: 7.5, width: 12, depth: 8 },
    { x: -3, z: -3, width: 6, depth: 10 },
  ],
};
export const catalog: ItemType[] = [
  { id: "planter", radius: 0.7, height: 1.5, blocking: true },
  { id: "bench", radius: 1.3, height: 1.1, blocking: true },
  { id: "lantern", radius: 0.5, height: 1.1, blocking: true },
];
export const identities: Record<string, Identity> = {
  ari: { id: "ari", name: "Ari", appearance: "burgundy" },
  sam: { id: "sam", name: "Sam", appearance: "saffron" },
  jo: { id: "jo", name: "Jo", appearance: "sage" },
};
