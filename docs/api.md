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

Movement keys are captured only on the world canvas. `setInput(x, y)` takes screen-relative axes for a touch controller; `action('kick' | 'wave')` sends a bounded action. `setInputEnabled(false)` clears held input for menus. Blur, visibility loss and interrupted pointer control stop movement. Pointer capture for custom touch UI is the consumer's responsibility; see the hub implementation.

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

`createRoomService({ server, map, catalog, store, authenticate, canAccess, allowedOrigins?, capacity?, leaseMs? })` attaches `/room` to an HTTP server. `authenticate(credential, room)` returns the app's safe `Identity` or null. `canAccess(identity, room)` is rechecked during activity and periodic liveness checks. Production adapters should make these callbacks bounded and fast. Set an explicit origin allowlist and terminate TLS at the app boundary.

`store.load(room, map)` returns a versioned durable record. `store.commit(room, identity, command, map, catalog)` must revalidate current app policy and commit atomically before resolving. The relay does not invent entitlement rules. The required callbacks have no permissive production default. `examples/store.ts` is an app adapter showing real file durability and owner/quota/CAS/idempotency checks; it is not core policy.

The reference service is a single writer. Do not run several copies over one data directory. Coordination leases are server-issued, session-specific and epoch-fenced. The default lease is 2.4 seconds, checked every 250 ms; snapshots arriving after a new epoch are rejected. Snapshot poses do not carry durable items or identity metadata. Hidden hosts yield; missing state publication causes election without relying on a final leave event. The last player leaving discards transient motion and unloads the room; toys sleep at their authored home. No server physics runs.

Protocol caps: 20 peers by default, 5 toys, 100 loaded rooms, 64 KiB messages, 100 inbound messages/second per socket, 256 KiB outbound backpressure cutoff. Inputs expire at the browser host after 250 ms. These are practical prototype limits, not a production capacity certification. The example store caps durable items at 50 and receipts at 10,000 per room, then refuses new edits rather than evicting retry protection.

## Known integration limits

The current renderer is Three.js/WebGL2 and current relay transport is WebSocket; those are separate modules but no second transport/renderer is supplied. Server callback work is serialized; a slow app adapter can delay unrelated rooms. There is no distributed service coordinator, schema migration utility, production session store, travel transaction or Zoomigo-specific adapter yet. Local prediction covers character motion; peers receive 15 Hz toy snapshots without interpolated presentation. These are named engineering follow-ups, not hidden legacy fallbacks.
