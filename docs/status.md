# Integration readiness

This is an independent v3 foundation, not a production Zoomigo release. Use this page for current scope; [development history](development-history.md) retains earlier measurements and superseded implementation notes.

## Repository boundaries

- `dafepro/zmap`: reusable world runtime, trusted room-service contract, two maintained integration examples, and world-level tests.
- `dafepro/zmap-avatar-studio`: modular avatar runtime, standalone editor, approved asset catalogs, Blender sources and avatar tests. zmap pins this repository at `avatar-studio/` as a development submodule.
- `dafepro/fc-workout-pwa`: the future consuming application. Team access, identity, inventory, appearance persistence and durable authorization remain its responsibility.

Start integration from the tested `v0.1.1` package artifacts and the public APIs, not from imports into the development submodule. See [package delivery](integration-packages.md), [repository map](repository-map.md), and [Team World handoff](zoomigo-v3-agent-prompt.md).

## Implemented

Direct movement and sprint; click/tap paths and joystick example controls; real-height terrain; shared balls and cannon; three field tools; placement and edit receipts; browser-host election/epoch fencing and reconnection; approved performance timelines; modular avatars with fitting, animation, hand ownership and resource cleanup.

Walking now uses adapted Quaternius `Walk_Loop`, with full-stride reverse walking; runs and strafes retain KayKit sources. Old compact-walk notes in development history are superseded. The current art/animation workflow belongs to the avatar repository.

## Evidence and limits

Cleanup validation passed 109 world unit/socket tests, 154 avatar unit tests, 30 world browser journeys and 44 avatar browser journeys locally. Independent Avatar Studio Linux CI passed once, but another run of the same commit timed out in two browser tests; repeatability remains open. Both public release tarballs were installed together in an empty consumer, with working public imports and catalog resolution. See [repository cleanup](repository-cleanup.md) for scope.

**Open integration qualification blocker:** the world Linux CI run at `a58a1e9` passed builds, units, package checks and isolated entry, but failed 17 of 31 browser tests (including the new entry diagnostic). In a multi-client trace the second client stayed at “Connecting…”. Local browser success does not resolve this discrepancy. [CI investigation](ci-browser-investigation.md) records evidence and next checks; do not claim cross-platform multiplayer qualification until resolved.

[Multiplayer coverage](multiplayer-coverage.md) distinguishes tests from requirements. Host loss, late join, input replay, room isolation, durable retry/restart and selected message-shaped browser journeys have evidence. Twenty connected sockets is not twenty rendered avatars on a phone.

## Still required for Zoomigo

Real authentication and membership adapters; approved saved appearance resolution; transactional database persistence with bounded writes and unknown-outcome reconciliation; service restart and release deployment drills; graphics-context recovery; representative physical-phone load, thermal, input/entry/recovery percentiles, transport impairment and operating-cost measurements.

The relay is currently one process/writer per room, with no distributed coordinator. Browser simulation is untrusted for rewards. Linked travel and map-generation switching are unfinished. No Canvas data migration or legacy fallback is required for this fresh v3.
