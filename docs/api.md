# Public integration contract — version 1

The product iteration is v3; package `0.1.0` and map/wire version `1` identify this first public contract. Breaking changes must increment the affected version and document the consumer change. There is no Canvas wire or data compatibility.

## Ownership

| ZMap                                                | Consuming application                                    |
| --------------------------------------------------- | -------------------------------------------------------- |
| Movement, surfaces, collision, camera, poses        | Identity, team membership, access and privacy projection |
| Toy simulation, trigger state, gesture presentation | Approved maps, toys, characters and gestures             |
| Placement preview and room synchronization          | Inventory UI, entitlements and durable authorization     |
| Host election, epoch fencing and reconnect          | Transactional persistence and service deployment         |

Browser-hosted simulation is intentionally untrusted for valuable outcomes. A modified host can fake bounded movement, toy motion and trigger state. It cannot update durable layouts through snapshots, change peer identities, admit users or grant rewards. Apps must never turn these transient results into training credit or inventory grants.

## Browser lifecycle

Import `Zoomap` from `zmap`. Construct it with `{ container, map, catalog, visuals?, onStatus?, onChange? }`. The element must have a nonzero size. Construction creates WebGL2 resources and can throw; catch this at the consuming route boundary. No world code needs to load on unrelated app routes.

`await world.enter({ url, room, credential })` obtains a fresh credential, opens a room and resolves only when the local character has valid shared state and its first frame is drawn. Entry rejects on denied/full/failed status or a ten-second timeout. The credential callback is called again on reconnect. It must return a short-lived app-issued credential in a real integration; the sample uses explicit fixture tokens.

`onStatus(state, detail)` reports `idle`, `connecting`, `ready`, `paused`, `reconnecting`, `denied`, `full`, `failed`, `left`. `paused` means no usable simulation host; no fake local shared progress is presented. Reconnection occurs after ordinary socket loss. Terminal denial, duplicate identity, room-full and rate-limit outcomes require a deliberate new entry.

`leave()` stops animation, inputs, retries and the room connection. It retains the mounted renderer for re-entry. `dispose()` also disconnects resize/input handlers, disposes geometry/materials/textures, releases the WebGL context and removes the canvas. Both can be called repeatedly. Dispose on route unmount. One identity may have one live session in a room; another tab replaces it with an explicit failure in the older tab.

Movement keys are captured only on the world canvas. `setInput(x, y)` takes screen-relative axes for a touch controller; `setWorldInput(x,z)` accepts normalized world-space directions for [click/tap navigation](navigation.md); `action('kick' | 'wave')` sends a bounded action. `setInputEnabled(false)` clears held input for menus. Blur, visibility loss and interrupted pointer control stop movement. Pointer capture for custom touch UI is the consumer's responsibility; see the hub implementation.

Maps can opt into `actionCatalog: playfulActionCatalog()` for the three implemented field actions. `equipTool(id | null)`, `setToolAim(x,z)`, `useTool(pressed)` and `cancelTool()` send ordered, bounded intents; `onActionRejected` reports rejection. See [shared field actions](field-tools.md) for capability negotiation, host replay and cooldown rules. Optional `Character.update(body,time,context)` context supplies session, display state, reduced-motion preference and viewport; `Character.dispose()` releases owned controllers and graphics on removal.

Read `roster`, `local`, `state`, `durable`, `session`, `host`, `epoch`, `traffic`, and `joinMs` for presentation/diagnostics. Treat snapshots as read-only in consuming code. `onChange` reports room, durable edit and result changes; it is deliberately not a render-frequency callback.

## Decorating

`preview(placement)` shows a local ghost and returns an invalid-placement reason or `undefined`; `preview()` cancels it. Preview focuses the placement camera but does not commit. Pair preview mode with `setInputEnabled(false)` and restore input on exit. `view.pick(clientX, clientY, height)` projects onto an explicit surface height. The example gardens use ground height zero; stacked editing interfaces must choose a surface intentionally.

`await edit(command)` sends a durable request and resolves to a saved room revision only after the store commits. Commands contain:

```ts
{
  id,                 // Stable idempotency key. Reuse on unknown outcomes.
  operation,          // 'place' | 'move' | 'remove'
  itemId, type,
  position: { x, y, z }, rotation,
  expectedRevision,   // 0 for new placement; current item revision otherwise.
}
```

The trusted store must validate shape, entitlement, current owner, quota, revision, placement and idempotency, and atomically commit both receipt and new state. A dropped acknowledgment can be retried with the same command ID. Different content with an already-used ID must fail. Pending commands are resent after reconnect; after ten seconds an unknown-outcome error instructs the caller to retry that same command. Never display “saved” for an unacknowledged preview. Returning a decoration is an app inventory policy, not an engine reward.

## Trusted service

`createRoomService({ server, map, catalog, store, authenticate, canAccess, allowedOrigins?, capacity?, leaseMs?, adapterTimeoutMs? })` attaches `/room` to an HTTP server. `authenticate(credential, room)` returns the app's safe `Identity` or null. `canAccess(identity, room)` is rechecked during activity and periodic liveness checks. Read-only callbacks (`authenticate`, `canAccess`, and `store.load`) time out after `adapterTimeoutMs` (default 2,000 ms). The adapter must also bound its own work; timing out the wait does not cancel an external request. Set an explicit origin allowlist and terminate TLS at the app boundary.

`store.load(room, map)` returns a versioned durable record. `store.commit(room, identity, command, map, catalog)` must revalidate current app policy and commit atomically before resolving. The relay validates persisted placement/receipt structure on load and after commit, and verifies layout against the current map/catalog. The relay does not invent entitlement rules. The required callbacks have no permissive production default. `examples/store.ts` is an app adapter showing real file durability and owner/quota/CAS/idempotency checks; it is not core policy.

The reference service is a single writer. Do not run several copies over one data directory. Coordination leases are server-issued, session-specific and epoch-fenced. The default lease is 2.4 seconds, checked every 250 ms; snapshots arriving after a new epoch are rejected. Snapshot poses do not carry durable items or identity metadata. Hidden hosts yield; a visible browser stalled beyond 250 ms also withdraws eligibility until it has rendered consistently for a second. The relay checks publication and simulation progress, so occasional token snapshots cannot retain a slow host. Missing state publication causes election without relying on a final leave event. The last player leaving discards transient motion and unloads the room; toys sleep at their authored home. No server physics runs.

Protocol caps: 20 peers by default, 5 toys, 100 loaded or loading rooms, 64 queued operations per room, 64 KiB messages, 100 inbound messages/second per socket, 256 KiB outbound backpressure cutoff. Inputs expire at the browser host after 250 ms. These are practical prototype limits, not a production capacity certification. The example store caps durable items at 50 and receipts at 10,000 per room, then refuses new edits rather than evicting retry protection.

## Known integration limits

The current renderer is Three.js/WebGL2 and current relay transport is WebSocket; those are separate modules but no second transport/renderer is supplied. Each room has its own serialized queue. A pending durable commit holds that room’s queue until its outcome is known; other rooms continue. Writes are never timed out into a false failure or acknowledged early. Queued close cleanup remains ordered behind writes. There is no distributed service coordinator, schema migration utility, production session store, travel transaction or Zoomigo-specific adapter yet. Local prediction covers character motion; remote player and toy presentation interpolates a bounded snapshot buffer with an 80 ms display delay. It never extrapolates past the latest snapshot or feeds delayed poses into authority. Local prediction and host-rendered bodies interpolate their two most recent fixed steps on animation frames; facing interpolates over the shortest angle. Sequenced input acknowledgements discard consumed prediction samples and replay only outstanding movement, with bounded display correction. Simulation remains 30 Hz and snapshots 15 Hz; these display poses never enter physics. These are named engineering follow-ups, not hidden legacy fallbacks.

## Movement protocol capability

Current clients and relays negotiate `input-ack-v1` explicitly in join/welcome. A room uses one movement protocol; mixing an old client and an acknowledgement-capable client is rejected with a clear terminal protocol error. Deploy the matching browser bundle and relay together. A stale development relay must be restarted before opening the new client.

Movement input has a monotonically increasing sequence outside `Input`/`Simulation`. Host snapshots carry the last consumed sequence per live session. The relay validates integer bounds, nonregression and that acknowledgements cannot exceed received input. Host transfer includes the latest still-fresh movement samples and acknowledged checkpoint. Browser prediction is bounded to 90 samples; rendering history is independently bounded. Action phases additionally carry `phaseStarted`, including Wake leap/impact/recoil. The prototype has no durable avatar or user-data conversion requirement.
