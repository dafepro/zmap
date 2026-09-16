# Open: world browser qualification on Linux

Discovered during repository cleanup, September 15, 2026. This is a release qualification gap; no runtime fix has been established. The v0.1.1 releases are integration prereleases.

## Reproduction and evidence

- [GitHub run 35032929855](https://github.com/dafepro/zmap/actions/runs/35032929855), world commit `a58a1e9c0dbf54541bf5e9b05d9f2a8214f13392`, pinned avatar `7361debfa55a70762ca64b4fc1b694f031d5ad3d`.
- Ubuntu runner, Node 22, installed Playwright Chromium; one worker, 1440 × 1050 viewport, retained failure traces. Reproduce with `ZMAP_BROWSER_CHANNEL=chromium npm run test:e2e` after the documented clean install/build.
- Build, unit/socket tests and package smoke passed. The separate entry diagnostic passed; the full suite then had 14 passing and 17 failing tests. Before adding the diagnostic, local macOS passed all 30 existing world journeys; a local Playwright Chromium run of the three-client action case also passed.
- The isolated diagnostic received a room message about 1.25 seconds after navigation, with no page errors. In the full run the diagnostic also passed, receiving a room message at about 1.19 seconds.
- The three-client action trace shows Ari completing entry before Sam is opened. Sam remains at “Connecting…” through the five-second assertion. Other cases fail on disabled controls or movement expectations. This is not established to be only an assertion timeout.
- The action trace logs WebGL GPU stalls associated with `ReadPixels`. That is evidence of rendering overhead, not proof of the cause. Tracing/screencasts, software rendering, host eligibility and lifecycle behavior need controlled comparison.

The workflow now retains `world-browser-evidence` (Playwright traces/error contexts plus application evidence) on failure. Artifacts expire according to GitHub retention; this page preserves the observed failure details. The added entry test records bounded timings and message types without credentials.

## Next checks before pilot qualification

1. Reproduce the two-client entry with per-client room messages, lifecycle/visibility state, frame timing and host-eligibility transitions. Distinguish slow scene construction from an absent eligible simulation host or transport/lifecycle failure.
2. Compare tracing with and without screenshots on the same runner and record the renderer/backend. Preserve the original failing configuration as a diagnostic; do not quietly redefine a passing load envelope.
3. Fix the demonstrated cause with a focused regression, then rerun the complete world suite and document the runner/rendering conditions. Do not loosen recovery deadlines or bypass eligibility to make CI green.
4. Qualify the real Zoomigo deployment and representative phones separately. CI success alone will not prove mobile performance or trusted application policy.

## Independent avatar CI repeatability

At the same avatar commit `7361debfa55a70762ca64b4fc1b694f031d5ad3d`, [main run 35031750380](https://github.com/dafepro/zmap-avatar-studio/actions/runs/35031750380) passed all checks, but [tag run 35031926151](https://github.com/dafepro/zmap-avatar-studio/actions/runs/35031926151) passed 42 browser tests and failed two with 45-second timeouts. `performance-controls.spec.ts` attempted to click a disabled Stop expression button after taking a screenshot; investigate whether the finite expression had already completed before the click. `studio.spec.ts` exhausted its test budget while checking a primary-color change. Neither cause is proven. Resolve these in the avatar repository and verify repeatability; a single green run is insufficient evidence of stable CI. Local validation passed all 44 cases.

## September 15 preintegration follow-up

The controlled `Entry diagnostics` workflow compares the same two-/three-client
cases with trace screenshots enabled and disabled. Both configurations reproduced
host eligibility withdrawal, so trace screenshots alone are not the cause.

A concrete relay bug was fixed: repeated ineligible heartbeats while the host was
already null incremented the epoch and broadcast full room resets. The new real
socket regression observed seven metadata messages where two were sufficient;
with the fix, hostless heartbeats leave the epoch/state alone, and eligibility
recovery creates exactly one new epoch. Linux diagnostics reduced the room-reset
storm, but still show both software-rendered clients withdrawing eligibility and
movement tests failing. This fix does **not** close Linux graphics qualification.

Preintegration validation passed 111 world unit/socket tests and five focused
Chromium browser cases locally, including the three-client actions journey. The
v0.1.2 integration prerelease also retains original private authentication context
for continuing `canAccess` checks, independently of the public roster projection.

## September 15 deployed-client diagnosis and clock isolation

The real dev Team World journey now has an independent, credential-scoped Linux
workflow in the consuming repository. Both clients obtain tickets, load all 17
assets, receive room traffic and remain visible. The failure is an empty host
set after graphics stalls, rather than rejected access or missing assets.

Run `35045563496` in `dafepro/fc-workout-pwa` reports SwiftShader, a 984 × 396
canvas, and repeated frames over 100 ms (175/316 and 132/204 samples for the two
clients). CPU samples are dominated by browser/native work. Disabling MSAA in
run `35045966304` reduced frame cost but did not restore play; that diagnostic
setting must not become a release-gate exception.

The development branch now advances simulation on its own 30 Hz timer and draws
on animation frames. This preserves fixed-step physics, snapshot cadence and
interpolation. A simulation interval above 250 ms still withdraws eligibility;
recovery still needs one second of intervals below 100 ms. Drawing is suspended
during recovery so graphics work cannot repeatedly interrupt that quiet window.
This is main-thread scheduling isolation, not a worker or protection from every
GPU stall. Entry timeout and leave cancel both schedules.

The regression delays drawing callbacks while retaining a working simulation
clock. The authority-handoff regression now stalls the simulation timer itself.
Clock isolation alone failed both Linux matrix configurations in run
`35046799049`; the drawing suspension change is still under qualification.
All 111 unit/socket tests and TypeScript checks pass. No clock changes are yet
released or deployed, and neither mobile rendering budgets nor Linux multiplayer
qualification are claimed satisfied.

Follow-up run `35047640276` at `c7c8c11` remains red: screenshots enabled passed
2/4 cases (including slow drawing), while screenshots disabled passed 1/4.
The three-client action and simulation-stall handoff cases remain unreliable.
Membership messages now also respect the recovery drawing suspension. This is
insufficient evidence to release the scheduling changes. The next controlled
comparison should measure simulation intervals and host transitions with the
same art in isolated browser processes versus shared-process software rendering,
then address the measured rendering/scheduling bottleneck without weakening the
existing real-client release gate. The consuming diagnostic has restored normal
MSAA settings; no quality override is part of qualification.

## v0.1.3 dev evaluation follow-up

The host-stall test now selects the elected host after both peers join; shader
loading can legitimately change election order. A local movement regression also
caught stale RAF timestamps after timer ticks. Rendering now samples
`performance.now()` to use the simulation clock's current time.

At release commit `540e0e4`, the independent packed consumer and 111 unit/socket
tests pass. Local Chrome passed all three synchronization journeys (18.7 s), the
three-player action journey, five cannon/performance checks, and both visual-kit
cleanup checks (2.8 s). The initial static-bundle harness could not support those
two source-module instrumentation checks; they passed through Vite after moving
the temporary harness outside Documents. An esbuild stack sample showed its
local hang while opening the parent Documents directory; no OS permission or
security settings were changed.

The complete Linux release run `35048915479` still reports 18 passing and 15
failing browser tests. v0.1.3 is therefore an explicitly limited dev evaluation
prerelease, not Linux or physical-device qualification. The consuming app pins
both browser and relay to its immutable tarball and SHA-512 integrity. Dev update
`35049549374` targets application `ab5d47c`; consult its completed result and the
consuming app's maintained Team World guide for deployment verification.
