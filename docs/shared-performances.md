# Shared expressions and equipment presentation

The Action Yard demonstrates approved expressions alongside its field tools.
Wave, Cheer, Dance, Yes and No use the same authored clips as Avatar Studio.
Selecting an expression stows a drawn tool first; the selection stays intact.
Completing or stopping the expression draws it again. A selection that was
already stowed stays stowed. Movement or a kick ends the expression immediately.
Using a tool ends it and starts drawing; physical use waits until drawing ends.

The independent Avatar Studio, one-hand playground and two-hand workbench also
expose expression and draw/stow controls. Left and right items can be stowed
independently; a two-handed item remains one object with both grip constraints.
These controls do not change the saved wardrobe or grant ownership.

## Room contract

Enable presentation on the existing action catalog. IDs and durations are
supplied by the consuming application; the core does not import avatar assets:

```ts
const actionCatalog = {
  ...playfulActionCatalog(),
  performance: {
    emotes: emoteDescriptors.map(({ id, duration }) => ({
      id,
      durationTicks: Math.ceil(duration * 30),
    })),
    drawTicks: 30,
    stowTicks: 30,
  },
};

world.emote("cheer");
world.emote(null); // Stop and restore the prior equipment target.
world.setToolDrawn(false); // Keep selection while stowing it.
world.setToolDrawn(true);
```

The catalog permits at most sixteen approved IDs, each with a bounded duration
of at most 900 ticks. Draw/stow durations are bounded to 1–90 ticks. A catalog
may contain only expressions and no field tools. Existing maps without this
configuration retain their earlier state and immediate equipment selection.
Enabled rooms negotiate `performance-v1`; incompatible peers are rejected at
join, before they can host or receive a partially understood room.

Commands use the existing authenticated, sequenced and rate-limited action
relay. Only the session sending an intent becomes its performer. Approved IDs,
exact field shapes and bounded timelines are validated before relaying and
again in accepted snapshots. No free text, scripts, inventory or entitlement
policy enters the simulation.

`state.actions.players[session].performance` contains the draw target, equipment
start/end ticks, its starting draw fraction, and an optional emote timeline.
An emote's `startedTick` is its actual clip start after required stowing; it can
therefore be in the near future. `untilTick` is fixed by the approved catalog.
Checkpoint recovery retains both values, so a late join or new host resumes the
current phase. Repeated delivery of the same command cannot restart it.

## Rendering without restarting animations

The Action Yard passes accepted equipment time into the public controller:

```ts
wield.setDrawn(performance.drawn, {
  elapsed: (presentationTick - performance.equipmentStarted) / 30,
  from: performance.equipmentFrom,
});
```

The starting fraction preserves continuity if a player reverses a partial draw
or cancels an expression while still stowing. Keep the complete loadout while
holstered. `isDrawn()` is the physical-use readiness check; model readiness and
selected equipment remain separate.

Once an emote reaches its start, pass its approved ID and elapsed seconds through
`Motion.emote`. The rendering context's `presentationTick` is fractional time
between two accepted checkpoints. It is never extrapolated from a wall clock;
a stopped host freezes the clip. Simulation tick and event metadata retain their
atomic checkpoint semantics, and this display clock adds no serialized fields.

For a local workbench, `avatar.playEmote(id)` and `avatar.cancelEmote()` handle
the local presentation lifecycle through the same public hand-layer contract.
`WieldController.setDrawn(drawn, { hand })` addresses an independent left/right
item; either hand of a two-handed item addresses the shared object.

## Verification

`tests/world-performance.test.ts` covers approval, forged state, duplicate intent,
stow-before-expression ordering, use gating, cancellation, partial reversals,
checkpoint replay and fractional display time. Its 20-performer, 120-second
simulation measured an 11,137-byte maximum checkpoint and roughly 0.023 ms p95
core step on the development machine. These are simulation measurements, not
renderer, network-throughput or physical-phone results.

`tests/performance-server.test.ts` uses real sockets to test capability rejection,
authenticated performer stamping, late join, host loss and forged timelines.
`tests/browser/performances.spec.ts` exercises the actual shared Action Yard UI
under ordered 75 ms ±15 ms delays each way and omitted snapshots. The Avatar
Studio's `tests/browser/performance-controls.spec.ts` exercises local one-hand,
two-hand and wardrobe integrations. Browser evidence is written beneath each
repository's `docs/evidence/performances/` directory when those checks pass.
