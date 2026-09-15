# Maintained examples

- **Courtyard** (`hub/index.html`): explore, shared play and app-owned decorating. Retained to qualify placement, entitlement and durable retry contracts.
- **Fieldwork** (`hub/action.html`): the primary Team World integration reference. Shared tools, cannon, modular characters, accepted performance timelines and input controls.
- **Architecture** (`hub/architecture.html`): standalone implementation guide and agent handoff.

The production example build includes those three entry points. `hub/review/` contains development-only animation inspection pages at `/review/locomotion.html` and `/review/performances.html`. Their source-reading fixtures belong to test/authoring qualification and should not be imported into Zoomigo.

Both interactive examples are fixture applications. `server.ts` and `store.ts` intentionally use demo identities and file persistence; do not deploy them as Zoomigo's auth or inventory implementation. The application owns scenery, content and policy; `models.ts` and `action-models.ts` demonstrate public avatar-package consumption.

Prepared avatar assets under `hub/public/avatars/` are generated and ignored. `scripts/prepare-avatar-example.mjs` resolves the installed package's public asset export. Editable world prop sources and their original exports remain in zmap for provenance; current player models come from the avatar package.
