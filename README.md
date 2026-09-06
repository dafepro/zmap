# Zoomap / zmap

A reusable browser library for small shared worlds: direct character control, a following camera, real height, shared toys and app-controlled decorating.

This is an **independent v3 first playable**. Canvas informed the audit; there is no Canvas dependency, compatibility layer or legacy migration. Zoomigo is the first intended consumer, not a dependency of the library.

## Run the examples

Node 22.12+:

```sh
npm ci
npm run dev
```

Open [the courtyard](http://localhost:5173). The development server also prints a LAN URL for a phone on the same network. Vite proxies the WebSocket relay; the phone only needs port 5173. These are development fixtures with three predefined identities, not a public deployment.

- **Explore:** keyboard/touch movement, follow camera, ramp, overlook, bridge and underpass.
- **Play together:** open the friend link for another real client. Kick the ball onto the golden pad. Close the host's tab and keep playing.
- **Make it yours:** app-owned inventory; preview, move, rotate, save and return decorations. Ari owns a bench and planter; Sam owns a lantern and planter; Jo owns a planter. Save, leave and return to prove persistence.

WASD/arrows move relative to the screen. Space kicks, E waves. Click the world to focus keyboard controls. Touch controls appear in the portrait layout. Decorating pauses local movement and focuses the candidate placement. The same identity in a second tab replaces the previous session explicitly; choose another demo identity to play together.

The athlete, ball, bench and planter are original Blender models. [Editable source and rebuild instructions](docs/provenance.md) and [the kit render](docs/evidence/blender-kit.png) are included.

## Integrate

```ts
const { Zoomap } = await import("zmap");
const world = new Zoomap({
  container,
  map,
  catalog,
  visuals,
  onStatus: (state, detail) => showConnection(state, detail),
});
await world.enter({
  url: "wss://your-app.example/room",
  room: roomId,
  credential: () => yourApp.issueRoomCredential(roomId),
}); // Resolves after the controllable character's first rendered frame.

// When opening app menus:
world.setInputEnabled(false);
// On route exit:
world.dispose();
```

`zmap` supplies the browser view and lifecycle. `zmap/core` supplies the headless content and simulation contracts. `zmap/server` supplies a single-process relay/coordinator with required app authentication, current-access and transactional storage adapters. Identity, inventory, rewards and content approval remain with the app.

The package is private pending release decisions. `npm run build:lib` produces ESM and declarations; `npm pack` creates an installable local package. The example imports public package exports, with the development export condition selecting source during local work.

## Verify

```sh
npm test
npm run build
npm run test:package
npx playwright install chromium
ZMAP_BROWSER_CHANNEL=chromium npm run test:e2e
```

The browser suite defaults to installed Google Chrome; set the environment variable above to use downloaded Chromium. Tests cover geometry/height, friction and collision regression, remote interpolation, Blender asset contracts, durable corruption/retries, room isolation/capacity, real WebSocket authority, browser multiplayer, decorating, portrait input, model-failure recovery and 20 lifecycle cycles. Tests use synthetic data and local services only.

## Working notes

- [Public API and app boundaries](docs/api.md)
- [Map, character and toy authoring](docs/content.md)
- [Design and staged plan](docs/implementation-plan.md)
- [Source audit](docs/source-audit.md)
- [Acceptance evidence and remaining work](docs/status.md)
- [Operation and measurement](docs/operations.md)
- [Asset and dependency provenance](docs/provenance.md)

Physical-phone qualification, representative full-room load, WAN fault/cost measurement and the actual Zoomigo adapter remain unfinished. This first playable is not a production-ready V1 replacement.

## Modular avatar studio

The independent [Avatar Studio](avatar-studio/README.md) provides 22 original Blender parts, a versioned appearance contract and an editor at `http://localhost:5180` (`npm --prefix avatar-studio ci`, then `npm --prefix avatar-studio run dev`). It includes a comic view with toon lighting, outlines and orthographic projection.

The hub consumes the same package through approved prepared factories in `examples/models.ts`. `npm run dev` and `npm run typecheck` build that package and copy its catalog/models into the example's generated public assets. Application identity selects approved recipes; ZMap still receives only character visuals. The standalone studio builds and tests independently of the parent repository.

See [multiplayer coverage](docs/multiplayer-coverage.md) for the tested functional boundaries, impaired-network method and the remaining full-room/device performance qualification.
