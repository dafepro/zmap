# Running and measuring

## Local development

`npm ci && npm run dev` runs the development relay on 8787 and Vite on 5173, both on the LAN. Open the printed LAN URL from a phone on the same network. Browser traffic uses the same-origin Vite WebSocket proxy. `ZMAP_DATA_DIR` selects the demo persistence directory; default `.data/examples-v1` is ignored by Git.

Browser tests run separate servers on 5174/8788 with `.data/browser-tests`, so they do not replace a visitor in the live 5173 example. Override development ports with `ZMAP_PORT` and `ZMAP_RELAY_PORT`.

The fixture server intentionally accepts Ari/Sam/Jo tokens. Use it only for development. Public hosting requires app-issued credentials, current access checks, an origin allowlist, TLS, bounded app callbacks and an appropriate transactional persistence adapter. There is no mandatory per-room server simulation process.

## Persistence and restart

Accepted file-store edits write a temporary file, fsync it, rename it and fsync the directory before acknowledging. The persisted JSON includes map/version, room revision, items and idempotency receipts. Back up the whole room record, including receipts. Do not copy only placements and discard retry protection. The example requires one process/writer on a local filesystem with working rename/fsync semantics. It does not claim distributed transaction safety or arbitrary network-filesystem durability.

To rehearse restore: stop the example service, copy the selected `.data/examples-v1` directory, start with a separate `ZMAP_DATA_DIR`, and verify owner/item/revision counts plus retry behavior before returning traffic. Do not modify files while the service accepts writes. Unknown map/version fails rather than silently reinterpreting content. Malformed owners, duplicate item IDs, invalid revisions and receipts fail closed; service loading also checks placements against the current content.

On server restart, browsers reconnect with fresh credentials and restore durable layouts. Transient balls return home; the last accepted browser snapshot is memory-only and is lost with service failure. Browser-host loss while the service survives uses the most recent accepted snapshot (15 Hz nominal). Acknowledged durable state is separate from that transient recovery window.

Read-only app waits default to two seconds. Room queues are isolated and bounded; a hanging durable write stalls its room until the adapter settles. Set database/network deadlines inside the app adapter, preserving a stable command ID when the result is unknown. The service never cancels a durable write and then accepts a competing write based on an assumed failure. Concurrent room loads reserve capacity before touching storage.

## Diagnostics

The example `/health` on relay port 8787 returns loaded rooms, peer counts, input/output bytes, snapshot/election/rejection/commit counters. The hub's “Under the hood” panel exposes join sample, recent frame p95, draw count, triangle count, traffic, host epoch and layout revision. Logs do not include credentials or workout records.

Interpretation: `ready` means a visible controllable player; `paused` means host recovery or no foreground host; `reconnecting` freezes shared progress; denied/full/failed requires an explicit next entry. A second tab with the same app identity replaces the earlier one. Use distinct fixture identities for multiple players.

## Cost measurement plan

The relay forwards input only to the elected host and sends accepted snapshots to room peers. Each snapshot includes current players/toys. Estimate measured snapshot egress as snapshots/sec × average encoded bytes × connected recipients; add inputs, lifecycle messages, durable records, TLS/TCP overhead and reconnection retries. Compression/delta transport is not implemented. Do not extrapolate a one-player frame rate to 20 players.

An empty room is removed from memory and runs no physics. The shared service still has a small coordination timer and base CPU/RSS; include that baseline in operating cost. The browser host performs physics, and every visible client renders. Measure both roles separately.

Before publishing a monthly number, record client/server CPU and memory, active/idle team counts and visit lengths, relay bytes, durable transactions/storage, static delivery, backup work and actual provider rates. No dedicated simulation server cost is hidden in this design, but relay/asset bandwidth can dominate. Current evidence includes a brief desktop sample only; monetary cost and full-team loads are unmeasured.

## Release scope

Use `npm run build` for declarations/ESM plus static example output in `dist`. The relay must be deployed separately with a same-origin `/room` WebSocket reverse proxy. Packaging is locally smoke-tested; no package, website or production Zoomigo deployment was published. This is independent v3: fresh app adoption does not require legacy migration tools or a Canvas fallback. Retain current-format durable records when rolling application code back and refuse unsupported versions explicitly.
