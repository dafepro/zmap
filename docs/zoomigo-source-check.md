# Zoomigo integration source check

Read-only survey of `dafepro/fc-workout-pwa` main at **7853c13a4e2c6c15fe6a27e1bb7a3f1ad32cc437**, September 15, 2026. This identifies concrete starting files; it is not a complete authorization/deployment audit or a tested Zoomigo integration. No Zoomigo files were changed.

## Observed

- `package.json` identifies `zoomigo-pwa`, Node ≥22.13, React 19, Next-compatible **Vinext/Vite** scripts, Cloudflare tooling, and three vendored Canvas 0.6.2 tarballs. No zmap or standalone avatar runtime dependency is present at this revision.
- `worker/index.ts` is a **Cloudflare Worker** entry around the Vinext app-router handler, with development access gating. Do not assume zmap's Node `createRoomService` can be imported directly into that Worker. Choose a supported relay deployment and connect it to app authority, or implement and qualify a new host-platform adapter upstream.
- `app/team-lounge/TeamLounge.tsx`, `SharedLoungeCanvas.tsx`, `LocalLoungeCanvas.tsx`, and `README.md` are current lounge entry points. The README distinguishes stamps from real interactive items, names weekly placement policy and server-verified unlocks, and already describes a clean generation cutover.
- `app/team-lounge/lounge-room-transport.ts` wraps Canvas-specific protocol/transport types. zmap has a different protocol and reconnect lifecycle; do not layer this old transport around the new client.
- `app/team-lounge/lounge-gateway.ts` defines tickets, room IDs, server URLs, allowed visitors, placement credits/capacity and editable IDs. It also tracks pending idempotent placements. Preserve relevant product policy through new adapters; do not copy Canvas wire/state assumptions.
- `app/data/avatar-gateway.ts` loads the old avatar configuration from the session and saves through `PUT /api/zoomigo/v1/me/avatar`. That schema is distinct from an Avatar Studio `Recipe`; define a fresh versioned v3 appearance contract and server validation. No old-avatar conversion is required.
- The tree contains `backend/internal/authn/`, `backend/internal/teamlounge/room_coordinator.go`, `mutation_authority.go`, and placement-authority migrations. These are specific next audit targets; their implementation and deployment were not reviewed in this limited survey.

## Instructions for the integrating agent

Recheck the current commit and follow Zoomigo's required reading list in AGENTS.md, including its authoritative `docs/README.md` index. Propose the new route/adapter file tree before changes. Account for the split between the Vinext/Worker frontend and the existing backend rather than treating the app as a generic Node-hosted Next server. Keep the existing account/training system intact and integrate against trusted product policy.

Start from [the released packages](integration-packages.md) and [the Team World handoff](zoomigo-v3-agent-prompt.md). The current Canvas packages are source context; they are not compatibility dependencies for v3.
