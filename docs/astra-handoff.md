# Astra handoff: Zoomap product planning

Read `intent.md` and `specs.md` as the product brief for a new reusable library named Zoomap and its first integration in Zoomigo (`dafepro/fc-workout-pwa`). Follow each repository's `AGENTS.md` and current source-of-truth docs.

The aim is a fast browser lounge where players control visible avatars within a world with real height. The view follows the local player. Preserve shared toys, item rights, room recovery, and low operating cost. Do not produce only a new renderer around the old token-on-a-board experience.

Start by inspecting the current Canvas and Zoomigo source. Record the commits you inspect. Treat the brief's repo notes as leads, not as a completed code audit. Locate the current avatar work, lounge integration, identity checks, inventory flow, asset definitions, room persistence, and network behavior.

Before major implementation, produce:

1. A short scope summary that separates confirmed goals, proposed product defaults, and technical choices.
2. A keep/change/replace/defer map for the Canvas capabilities Zoomigo uses, with source paths and any migration gaps.
3. Your chosen technical approach and the main tradeoffs. Explain how it meets phone performance, real height, shared interaction, security, and cost goals. Do not ask the owner to choose ordinary implementation details.
4. A staged work plan tied to the requirement and acceptance IDs in `specs.md`. Start with the smallest playable test of movement, camera, height, shared objects, and browser-host loss.
5. A benchmark plan with named devices, browsers, content, network conditions, and cost measurements. Mark untested targets as untested.
6. A migration and rollback plan that protects existing identity, inventory, and saved placements.

Use the proposed visible-avatar isometric-style camera for planning. Flag literal first-person support as a product scope choice rather than building it by default. Choose and record sensible reversible defaults for other open design details.

Leave the engine, renderer, physics method, networking topology, package layout, and asset pipeline to your own design. Reuse existing work when it fits. Do not inherit old Canvas or avatar architecture choices just because an earlier document called them required.

Do not broaden the task into a general game engine, new account system, reward rewrite, MMO, or Minecraft clone. Do not shrink it to a single-user scene or decorative camera effect.

The initial deliverable is the plan and the proposed proof-of-concept scope. After scope review, implement in working increments with evidence for each acceptance test. Keep unimplemented work and deviations visible. Do not mark the full release complete when only the first playable test is done.
