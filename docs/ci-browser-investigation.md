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
