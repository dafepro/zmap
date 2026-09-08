# Shared field actions

Action Yard is an independent example at `/action.html`. It uses three two-handed Blender assets from the optional Avatar Studio field catalog, while the ZMap core simulates their actions without reading meshes or skeletons. App identity, access, inventory and durable policy remain outside the library.

```ts
import { Zoomap, playfulActionCatalog } from "zmap";
const map = { ...yourMap, actionCatalog: playfulActionCatalog() };
const world = new Zoomap({
  container,
  map,
  catalog,
  visuals,
  onActionRejected: (reason) => showStatus(reason),
});
await world.enter({ url, room, credential });
world.equipTool("tether-winch");
world.setToolAim(0, 1); // normalized horizontal direction
world.useTool(true); // claim/reel
world.useTool(false); // pitch/release
world.cancelTool(); // cancel on interrupted app interaction
```

The example also exposes `rebound-panel` and `wake-driver`. The action catalog configures bounded reach, strength and cooldown ticks for these three implemented behaviors. It is a declarative set of simulation presets, not downloaded executable code. New physics behaviors require a reviewed core implementation and protocol tests; new visual devices use the separate equipment factory registry.

## Rules

| Tool          | Reach / strength / cooldown at 30 Hz | Shared behavior                                                                                                                                                                                  |
| ------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tether Winch  | 5.5 m / 10 / 18 ticks                | Select an existing visible toy inside the aim cone. One player owns its transient claim. Bounded forces reel it toward a carried point; release pitches it along aim.                            |
| Rebound Panel | 1.8 m / 7 / 18 ticks                 | A finite front contact region reflects incoming toys and boosts another player. Direction, height, line of sight and contact cooldown matter.                                                    |
| Wake Driver   | 3 m / 5 / 60 ticks                   | Six-tick charge followed by a radial ground impulse. Same-level objects and other players are lifted and nudged; intervening geometry and recipient immunity prevent through-wall/repeated hits. |

Cooldowns are tracked per tool, so switching equipment cannot reset them. Reconnecting into a live room retains that identity's unexpired cooldowns but starts with no held input. These are transient room mechanics, not persistent account data.

## Protocol and lifecycle

An action-enabled map requires the `actions-v1` join capability. Legacy maps retain their prior simulation shape. Clients send equip/use/cancel/aim intents with increasing local sequence numbers. They cannot supply a target, force, another player's identity or an arbitrary world-space origin. The relay validates the selected catalog, stamps the authenticated session and a room order, and forwards commands to the current host. Action ordering is separate from latest movement input.

The relay retains unacknowledged commands until an accepted checkpoint reports its applied sequence. A new host receives the checkpoint and remaining commands. Duplicate commands and stale host epochs cannot repeat an accepted action. The queue is capped at 64 commands, with 24 action messages per player per second; rejection is surfaced to the client. Held actions require fresh movement/held heartbeats and expire after the freshness interval. Departures release target claims; interrupted controls cancel rather than producing a pitch.

Snapshots include bounded tool phases, cooldowns, external player impulses and a recent event list. Player impulses survive the ordinary walking update, so knockback changes actual movement instead of only an animation. All interaction ordering is deterministic. Analytic segments test blockers, sloping/thick surfaces and blocking placements; height gates keep a bridge occupant separate from someone underneath.

ZMap still uses browser-hosted simulation. The relay fences authority, validates contracts and bounds queues/snapshots; it does not prove a host followed every gameplay rule. Competitive anti-cheat or a dedicated authoritative game server is outside this example's guarantee.

## Integration boundary

The example's `loadActionKit` prepares approved appearances and verified assets. `Character.update` receives an optional context containing the session, display simulation, reduced-motion preference and pixel viewport. The adapter chooses equipment from accepted state, aligns it to accepted aim, draws the cable to the accepted target and illustrates pulse events. `Character.dispose` gives owned controllers, listeners and shader materials one cleanup path when a player leaves or the view closes.

The standalone workbench at port 5180 previews mechanisms and fit without a server. Shared forces are demonstrated in Action Yard at port 5173. Development uses a second room service on 8789 (`ZMAP_ACTION_PORT`), proxied through `/action-room`; both services use the same reusable room factory. Test ports are 5174/8788/8790. Each room still uses application-provided credentials and storage.

## Verification and limits

`tests/world-actions.test.ts` covers deterministic replay, claims, real displacement, cooldowns, analytic obstructions, height and cancellation. `tests/action-server.test.ts` exercises actual sockets, capability negotiation, malformed/stale/duplicate intents, late join, host-loss replay and reconnect state. `tests/browser/actions.spec.ts` drives actual browser clients in Action Yard. Avatar Studio separately checks the exported GLBs, complete two-hand grip matrices, body weights, animations, shader rendering and disposal.

These tests extend the [multiplayer coverage matrix](multiplayer-coverage.md). They do not qualify the outstanding physical-phone, WAN percentile or 15-minute fully rendered room targets. This is shared social physics with bounded impulses, not a rigid-body engine: ball-to-ball collision, rope obstacles, articulated finger animation and destructible scenery are not implemented.
