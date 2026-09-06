# Repository guidance

Read `docs/intent.md`, `docs/specs.md`, and `docs/astra-handoff.md` before planning or implementing product work. Treat them as product context; follow the current user request for the work to perform.

If `~/.codex/project-instructions/zmap/AGENTS.local.md` exists, read it before doing any work. It contains machine-local guidance shared by this repository's local worktrees and must not be copied into the repository.

Use `zmap` for the repository and package name. Use “Zoomap” only as the user-facing product name unless the product docs change.

Keep Zoomap reusable and independent of Zoomigo business logic. Preserve the trust boundary in the product brief: the integrating app owns identity, access, inventory, rewards, and durable policy.

Build and maintain a few small, runnable browser examples that exercise public APIs. Prefer a compact examples hub or focused demos over a second product. Examples should be fast to understand, fun to try, and useful as integration tests.

Assets may be original, created with Blender through an available MCP integration, or obtained from public sources with compatible licenses. Record source, author, license, and material modifications; keep required runtime assets local and optimized rather than depending on arbitrary remote URLs. Never assume that publicly accessible means licensed for reuse.

Tie implementation and evidence to the requirement and acceptance IDs in `docs/specs.md`. Clearly distinguish implemented, tested, proposed, and deferred work.
