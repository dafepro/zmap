# Authoring content

Content lives with the consumer. The hub supplies `examples/content.ts`, `characters.ts` and `scenery.ts`; none is imported by ZMap core.

## Maps and physical meaning

`WorldMap` version 1 uses metres, Y-up, X/Z ground coordinates. `bounds` encloses play, `spawn` must rest on a real surface. Each rectangular surface has a top `y`, thickness and optional Z-axis slope: `height(z) = y + slope * (z - surface.z)`. Ground, ramp, terrace and bridge use the same contract. A thin raised slab allows travel below; a thick terrace is solid. Surface collision and rendering share the definition.

The fixed step is 30 Hz. Character radius, speed and reach are library rules, independent of appearance. Grounded movement can step up 0.25 m; larger faces block. Gravity handles descending edges. Players pass through one another. This is a deliberately bounded controller, not arbitrary mesh rigid-body physics. General stairs, mesh slopes, moving platforms and large dynamic assemblies need separate designs.

Authored `blockers` use X/Z rectangles and Y intervals. Add physical blockers for visible furniture that should block paths. Decorative scenery alone is nonphysical. Terrain overhangs near the local player fade to keep the character readable. Camera follows the local player; placement preview temporarily focuses its target.

`placementZones` allow editing; `protectedZones` reserve routes. `ItemType` specifies radius, height and blocking. The built-in validator requires flat support, bounds, free space and permitted zones. The trusted app adapter must also call placement validation at commit time, not only preview time.

## Toys and triggers

A toy has a stable ID, home pose, radius, color and `sleep: 'home'`. Optional `restitution` (0–1, default 0.65) controls bounce. Optional `mass` (0.01–1,000 kg) controls sphere contact response; the default uses equal density, with a 0.3 m ball weighing 1 kg. A surface may specify `rollingResistance` (0–10 m/s², default 0.65). Ground resistance reduces the whole tangent velocity to zero without reversing it or steering a flat roll. Air drag is separate; gravity supplies downhill acceleration. Contact substeps and normal reflection preserve tangential momentum at walls and circular decorations. Ceiling/floor contacts bounce, and a lost toy resets to its own home. Ball contacts and explicit kicks are distinct. Height constrains reach; slopes accelerate toys downhill. A declarative trigger contains a position, radius, bounded impulse and cooldown. Add a trigger in content to create another launcher without modifying core:

```ts
triggers: [
  {
    id: "pop-pad",
    position: { x: 5, y: 0, z: 6 },
    radius: 1.1,
    impulse: { x: -5, y: 6, z: 4 },
    cooldown: 1.5,
  },
];
```

Trigger cooldown and toy velocity are transient. A late join receives current values; sleep resets them. The scene may name an object `trigger-pop-pad` to show activation. The reference visual changes emissive color and pad height; reduced motion stops the movement treatment. A trigger is play state and emits no reward or inventory event.

Visible ball rolling uses displacement/radius and a quaternion, independent of render frame rate. This is a lightweight sphere controller: spin is visual, airborne rotation does not model angular momentum, and rotation is not part of the contact solver. Sphere-to-sphere contacts use simultaneous bounded substeps, true 3D centres, mass and restitution, with stable grounded stacks. See [physics contracts and tests](physics.md).

This first extension surface is declarative impulse/cooldown behavior. General custom behavior plugins and durable finite-state toys remain work, rather than accepting peer-provided executable scripts.

## Characters and visual adapters

Supply `visuals.character(identity) → { object: THREE.Group, update(body, time) }`. ZMap positions/faces the root and calls animation updates. Supply approved appearance IDs in the trusted identity projection. Keep all physical dimensions outside cosmetic content. The original example character supports idle, walking, facing and a wave with app-owned color palettes. The example athlete is an original Blender model with named limb/head pivots, animated by the consuming app. Its editable scene and reproducible builder live in `assets/source/`. It is not a conversion of Zoomigo’s SVG avatar catalog.

`visuals.toy(id)`, `visuals.decoration(placement)` and `visuals.scenery(scene, map)` own appearance. Geometry, materials and textures added to the scene are disposed by the view. Create per-world resources; do not share live materials across two worlds whose disposal lifetimes differ. The example preloads four self-contained GLBs from its own origin before constructing the world. Its bounded CPU template cache creates independent geometry/material instances for each disposal lifetime. A missing model fails entry explicitly; retry reloads the kit. There are no third-party model, texture or font URLs. The sample's text textures are drawn locally at runtime.

Use `validateMap` before shipping content. Unsupported versions, missing spawn support, duplicate IDs, excessive counts and invalid numeric limits fail early. Core has no account-specific asset catalog or business identity assumptions.
