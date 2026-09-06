# Zoomap and the Zoomigo Lounge: Product Specification

Status: Draft 0.1 for product review  
Date: September 6, 2026  
Intent: [intent.md](intent.md)  
Planning prompt: [astra-handoff.md](astra-handoff.md)

## 1. How to use this specification

This document states desired behavior, release scope, and ways to judge the result. It does not choose an engine, renderer, physics library, transport, storage system, or package layout.

**MUST** means required for the stated release once this draft is accepted. **SHOULD** means the default unless Astra records a reason and its user impact. **PROPOSED** marks an assumption or numeric target that the owner has not yet approved. The whole document remains a review draft.

The owner's current brief takes priority over earlier implementation plans. In particular, old requirements to keep Canvas as the world simulation are not binding for Zoomap. Existing product rules for access, training, privacy, and earned items remain in force.

### Release boundaries

| Stage | Purpose | What it proves |
| --- | --- | --- |
| First playable | A small working slice, not the full replacement | Direct controls, follow camera, real height, custom-avatar path, shared toy, basic placement, and host/connection recovery on phones. |
| V1 replacement | A usable Zoomigo lounge backed by a reusable Zoomap library | All V1 requirements, safe integration and migration, documented extension points, full-room tests, and measured operating cost. |
| Later | Growth after the replacement works | Extra maps, broader content, new camera modes, and features not needed by the audited current lounge. |

A first playable may use a narrow content set and test identities. It is not a production release and does not waive V1 access checks, asset quality, recovery, or migration work.

## 2. Terms and ownership

A **map** is reusable authored terrain, routes, objects, and rules. A **room** is a team's running or saved instance of a map. An **item type** defines an object; an **item instance** is one placed copy. An **owned item** is an entitlement in Zoomigo. These must not become interchangeable concepts.

A **simulation host**, if the chosen design uses one, is the browser helping run the shared world. It is not the owner of the team's inventory or a trusted source of reward grants.

| Concern | Zoomap responsibility | Zoomigo responsibility |
| --- | --- | --- |
| Player and room access | Accept trusted identity and enforce the supplied room policy | Sign-in, team membership, room eligibility, staff roles |
| World and movement | Terrain, controls, camera, spatial rules, shared interaction | Choose the experience and content |
| Avatars | Place and animate app-supplied characters in the world | Appearance choices, approved catalog, unlocks, content style |
| Items | Preview, place, manipulate, interact, synchronize, and restore state | Inventory truth, entitlement rules, catalog, player/staff permissions |
| Durable changes | Apply validated changes and support reliable storage integration | Supply trusted policy and app persistence where appropriate |
| Social features | Display approved signals and expose interaction hooks | Approved messages, moderation rules, visibility rules |
| Training and rewards | No independent authority | All workout records, credit, reward grants, and progression |

Astra may split code differently. These are product and trust boundaries, not required modules.

## 3. Functional requirements: the shared-world library

All `Z-*` requirements below apply to V1. The first playable exercises the smaller subset listed in section 8.

### Z-01. Enter, leave, and return

A player MUST enter a permitted room through the app without a second account, room-host setup, or manual network settings. The app MUST receive useful loading, ready, reconnecting, full-room, denied, and failed states.

The playable view MUST contain a valid player spawn, collision state, and initial shared state. A splash screen or a visible but uncontrollable avatar does not count as ready. Optional art may load later with clear, stable fallbacks.

Leaving MUST release the room session and runtime resources. Rejoining MUST not leave duplicate players or a second active session by accident. Define how intentional multiple tabs behave.

### Z-02. Direct character control

The player MUST control movement through intent, not drag the avatar to a new position. Movement MUST respect terrain, obstacles, boundaries, facing, and the active input state.

Desktop MUST offer keyboard movement. Phone and tablet MUST offer touch movement and reachable action controls. WASD/arrows and a thumb control are proposed starting designs; Astra owns the final interaction design. Controls SHOULD follow screen directions in the fixed-angle view.

The player MUST be able to stop with a predictable result. Lost focus, an interrupted touch, a menu, or a suspended app MUST NOT leave movement stuck on. Diagonal movement MUST not grant an unintended speed advantage.

Pointer-based movement, gamepad input, jump, dodge, and sprint are not required by default. The first map MUST be usable without a precise jump or platforming sequence.

### Z-03. A player-following camera

The normal view MUST follow the local avatar and keep it near the visual center, with room for useful look-ahead and the app's controls. The player need not sit at the exact center on every frame.

The map MUST be able to extend beyond the viewport. Do not solve small screens by shrinking the whole map until the characters are tiny.

The default camera SHOULD keep a stable angle. It MUST handle changes in terrain height and map edges without abrupt jumps or empty off-map views. Walls, bridges, or scenery MUST not leave the local player and required actions unreadable. Astra chooses how to handle blocked views.

Placement mode may use a limited alternate view. Returning to play MUST restore a useful follow view without moving the character by mistake. Literal first-person play is unresolved, not a V1 deliverable in this draft.

### Z-04. Height that changes the world

Maps MUST support flat ground, slopes or ramps, traversable steps, raised surfaces, and blocked edges. The appearance and traversal rules MUST agree.

The proposed V1 height proof is a route over a bridge and a separate route below it. Players and objects on these routes MUST remain on their own surfaces even when they overlap on screen. An action below the bridge MUST not hit an object above it just because their screen positions overlap.

Objects MUST rest on valid surfaces. Movable objects MUST react to slopes, edges, and impacts in ways that fit the map's declared rules. Falling or leaving a playable area MUST have a safe, clear outcome. A player must not remain trapped beneath the map.

This specifies spatial behavior, not a general-purpose 3D physics implementation. Flat maps MUST remain possible within the chosen model. Arbitrary climbing, flight, swimming, and deformable terrain are not required.

### Z-05. Shared presence

A player MUST see permitted teammates join, move, face, gesture, idle, and leave. The app supplies visible identity; peers must not invent identities for themselves.

Joining an active room MUST reveal its current state, including an interaction already in progress. A late join must not restart a toy for everyone.

Active, idle, reconnecting, and absent players MUST not be confused. Idle or disconnected avatars MUST not block key routes. The first lounge SHOULD avoid hard player-to-player body blocking; Astra may choose a pass-through or soft response.

The system MUST handle a full room with a clear message rather than allow an unbounded load. The proposed capacity is in section 6.

### Z-06. Shared physical play

Players MUST be able to push or bump a shared movable object and use at least one deliberate action, such as a kick. Contact, explicit action, and object editing are distinct intents.

Two players acting on the same object MUST reach one shared result. Normal play MUST not produce two durable copies of a ball, conflicting item owners, or worlds that stay out of sync.

The result must feel responsive for the local player while other players can follow it. The implementation may correct motion; it must not trade all immediate response for a distant authority round trip.

The interaction rules MUST account for height, reach, blockers, permissions, and item-specific behavior. A decoration need not be a movable rigid body to take part in the world.

### Z-07. Authored toys and map events

The library MUST support static decoration, blocking objects, movable objects, non-blocking trigger zones, and objects with a small sequence of states. A map author must be able to make more than a loose pile of physics props.

A reference toy MUST show a cause, a state change, a timed or contact-driven response, and a visible effect. A bumper, launcher, pressure pad, or similar playful object is enough; this does not require a scripting game for players.

Authored rules SHOULD support map zones that change an object's behavior, such as a low-friction patch or launch area. Persistent state and one-shot visual effects MUST have clear, different meanings.

A developer MUST be able to add an item type and a map through documented public extension points, without editing Zoomap's core for each content addition. Content validation MUST catch invalid references, unsafe limits, and unsupported versions before normal players encounter them.

### Z-08. Place and edit owned items

A player MUST be able to select an available item, preview its placement, see whether the position is valid, confirm, cancel, move, rotate, and remove it within their rights. Definitions may allow bounded scale and configuration controls; not every item needs them.

Placement MUST resolve the intended world surface and height. It MUST respect map bounds, support, protected areas, item limits, and the item's collision rules. Items MUST NOT make spawn points, required routes, or exits unusable.

Normal play and editing MUST be distinct enough that moving a character or kicking a ball does not move a decoration by mistake. Editing MUST work on touch as well as with a mouse.

The app's definition of “remove,” “return,” and “consume” MUST govern inventory. Placing an item is not a reward grant. A retry, double tap, or reconnect MUST NOT duplicate, consume twice, or lose the item. A rejected change MUST explain the result and restore a valid state.

### Z-09. Separate play rights from edit rights

An item may allow every teammate to kick or activate it while only its owner or staff can edit or remove it. These permissions MUST remain separate.

The trusted integration MUST validate durable edits, room access, entitlements, quotas, and staff actions. Hiding a button is not an authorization check.

Concurrent edits, a stale inventory view, an ownership change, or access revoked during a session MUST have a defined outcome. A former simulation host MUST NOT regain permission by sending an old checkpoint.

Staff MUST have a route to remove disruptive placements or reset the room under the app's policy. Actions that change other players' saved items SHOULD leave an audit record through the app.

### Z-10. Custom characters and animation

The library MUST support app-defined, animated characters with visible appearance changes. It MUST NOT hard-code a single human model, soccer uniform, reward system, or third-party avatar account.

The initial animation set MUST cover idle, locomotion, facing changes, a gesture, and an interaction response. Foot placement and motion must look grounded enough for the intended style; this does not mandate a specific animation technique.

Zoomigo's chosen appearance MUST carry into the lounge. Missing or incompatible cosmetics MUST fall back without blocking movement or the rest of the app. Cosmetic choices MUST NOT alter movement speed, reach, collision advantage, or access.

Reuse the existing avatar work where it fits. The current status of that work must be audited; this draft does not assume it is built. Do not create a second appearance or entitlement system to make the demo easier.

### Z-11. Save durable state, not endless activity

Rooms MUST retain their saved map/version, item identities, owners, layout, settings, and declared durable behavior state. A change shown as saved MUST survive a service restart under the documented persistence contract.

The design MUST distinguish a decoration's saved placement from a toy's temporary motion. Each relevant item type MUST define what happens on room sleep and map reset: preserve a resting position, return to a home position, or reset transient behavior.

When no players remain, the world MUST stop active simulation. The next visit MUST start in a valid, settled state rather than replay hours of missed motion. Required app jobs, storage, and shared service costs are separate from world simulation.

Abrupt failure may lose a bounded amount of transient motion, but not acknowledged inventory or layout changes. Astra MUST state the recovery limits and how accepted edits differ from pending previews.

### Z-12. Recover from ordinary browser and network failures

The room MUST recover when a player disconnects, a browser suspends, or the browser doing shared simulation leaves. Remaining players MUST not have to agree who hosts or reload as a group.

Loss of authority MUST NOT leave two conflicting state publishers accepted by the room. Recovery MUST protect durable item state and avoid repeating one-time actions as new grants.

If no eligible browser can continue simulation, a paused or reconnecting state is acceptable. Fake progress, hidden drift, or a claim of a live shared room while offline is not. Re-entry MUST lead to one valid room state.

Test mobile app backgrounding and abrupt browser loss, not only a clean Leave button. Do not assume a final save or visibility event will always arrive.

### Z-13. Linked spaces and content changes

Zoomap MUST provide a path for authored travel to a spawn point or another permitted room. Use by the current lounge will determine its rollout priority, but it must not be lost without an explicit scope decision.

Travel MUST check destination access, prevent duplicate presence, and recover if the destination cannot load. A failed move must leave the player somewhere valid. A return route MUST work when the content calls for one.

The app MUST be able to select and change a team's map without changing its team identity or inventory. Old, moved, or incompatible decorations MUST be restored, archived, or returned under an explicit policy, never silently deleted.

A weekly content change is an app scheduling choice, not a demand for each empty world to keep running. V1 needs a demonstrated map-change path, not a large rotation catalog.

### Z-14. Reusable integration

Zoomap MUST be usable from an independent browser app that does not import Zoomigo's business code. It MUST expose enough state and lifecycle feedback for the app to own surrounding UI, inventory views, and approved player actions.

The library MUST allow the app to mount, enter, leave, and dispose of a world. It MUST NOT take over unrelated routes, global account state, or all pointer and keyboard input.

Public contracts, supported content versions, errors, extension points, and upgrade rules MUST be documented. A separate sample consumer MUST prove basic use through public interfaces. A full visual editor and compatibility with every frontend framework are not required.

## 4. Functional requirements: the Zoomigo lounge

### L-01. A bounded team space

The lounge MUST use Zoomigo's existing sign-in and team-access model. It must not create public rooms, public player discovery, or a second player identity. Team boundaries and staff access MUST hold during joining, reconnecting, and travel.

Keep the lounge separate from core training flows. A failure to render or join MUST not prevent check-ins, workout records, or access to the player's existing data.

### L-02. The first map

PROPOSED: build one compact, authored team hangout with a clear arrival point, a lower play area, a raised overlook, a route over and under a bridge, and space to place decorations. At a normal avatar scale, exploring it requires the camera to move.

Use one or two main activities, not a map full of competing tasks. Include a shared ball or similar toy and one authored interactive feature. The map must be enjoyable alone, with obvious ways for another player to join in.

The world need not look like a literal dungeon. Use the owner's reference for space and traversal, with Zoomigo's own playful look. A blockout is an early test, not the final art standard.

### L-03. Avatars, inventory, and earned content

Players MUST enter as their Zoomigo character and recognize teammates. Approved appearance changes and gestures MUST show to the group without a second customization workflow.

The placement flow MUST use existing inventory and unlock rules. Locked items may be shown by the app, but players cannot place them. Staff and player actions MUST use the existing ownership policy where one exists.

The first release needs a small but representative set of cosmetics, decorations, and interactive items. It does not require a large new catalog, new currency, trading, or a rewritten reward economy.

### L-04. Safe social play

Use approved gestures and preset messages. V1 MUST NOT add open text chat, voice chat, direct messaging, arbitrary uploads, or player-supplied scripts.

The app MUST control which names, details, and actions peers can see. Do not expose private workout measures through avatar appearance payloads or room metadata.

Effects and messages MUST be bounded to limit spam. Players SHOULD be able to reduce disruptive effects, and staff must retain room cleanup controls. Avoid mechanics that let a player trap, displace, or exclude a teammate from the main activity.

### L-05. Training remains the purpose

Time in the lounge MUST NOT count as exercise or grant training credit. A browser-hosted play result MUST NOT, by itself, create a valuable reward or change a workout record.

The lounge SHOULD support a short visit, a shared joke, a new decoration, or a small discovery. Do not optimize the feature around long sessions or require attendance in the lounge to keep earned goods.

### L-06. App fit

The experience MUST work inside Zoomigo's mobile layout, including portrait use, safe areas, menus, and a clear way to leave. Landscape may improve the view but MUST NOT be required for basic play.

Players MUST be able to open an inventory or settings panel without the underlying game also acting on that input. An unavailable or unsupported world view MUST have a plain fallback message and route back to the app, not a broken screen.

## 5. Non-functional requirements

### N-01. Browser reach

Support the release's agreed iOS Safari and installed-PWA paths, Android Chrome, and desktop Chrome, Safari, and Firefox. Astra MUST name the tested devices, operating systems, and browser versions. “Modern browser” is not a test matrix.

No native game install, browser plug-in, or high-end gaming device may be required. Choose capabilities and fallbacks to fit the supported phones. This specification does not mandate a particular graphics API.

### N-02. Fast start and response

Measure from the user's Enter action to a controllable local character in a valid shared room. Include required downloads, decode/compile work, room join, and initial presentation. Report cold and warm runs separately.

Required local control MUST not wait for optional cosmetics or the whole content catalog. Deferred assets MUST not cause collisions to appear late or make saved items impossible to identify.

Lounge code and assets MUST NOT be part of the required download for a player who only uses training screens. App navigation and scrolling must remain usable during loading.

### N-03. Full-team and sustained performance

Test the full target room with distinct characters and representative items, not only an empty map or 20 copies of a cheap placeholder. Include authored terrain and scenery in the measured scene.

Quality may reduce to keep play usable. It MUST NOT change collision rules, ownership, visibility permissions, or the meaning of an action. Important paths, teammates, and toys must remain readable at low quality.

Test a sustained phone session and repeated entry/exit. Record memory, resource cleanup, and visible performance drift. A route exit MUST stop world work and release its connections and owned resources. Background behavior must not consume an unbounded share of device resources.

### N-04. Network resilience

The product MUST tolerate ordinary latency, jitter, brief loss, and reconnects with understandable feedback. Testing MUST include the browser helping simulate the world under those conditions, not only a non-host peer.

No durable edit may be acknowledged twice as two different item changes. Late, repeated, or stale-authority messages MUST not restore removed items or overwrite newer rights.

Offline availability of training features is separate from a live lounge. Do not imply an offline player is interacting with connected teammates. Cached local previews may exist, but they must be labeled and cannot grant shared outcomes.

### N-05. Trust and child data

Treat peers, including a simulation host, as untrusted for access, identity, item rights, rewards, and protected app data. Validate durable commands and checkpoint content against the current trusted record and policy.

Validate content and message sizes, allowed actions, and resource limits. Do not accept peer-provided scripts or arbitrary asset URLs as trusted catalog content. Keep logs and room data limited to what the app needs.

Client-hosted physics does not promise cheat-proof play. Astra MUST explain which transient results a modified host could fake and why those results cannot become inventory, reward, or access changes. Cosmetic play is not a secure source of real-world achievement.

### N-06. Cost and operation

The default deployment MUST avoid mandatory always-on world simulation for empty rooms and a dedicated active server process per room. Preserve a viable low-server-compute approach. Browser-hosted simulation is the preferred starting direction, not a demand for a full peer mesh.

Astra may choose the topology and service shape. Any proposal that materially increases server simulation, hosting burden, or recurring service costs MUST show measurements and call out the product tradeoff before adoption.

The cost report MUST include active client and server CPU, memory, relay traffic, persistence work, asset delivery, and any fallback relay service. Low simulation CPU alone does not prove low cost. Report assumptions for representative active-team and idle-team loads; no monthly cost ceiling has been supplied.

### N-07. Readability and access

Touch targets and menus MUST work at normal phone size. Do not use color alone for invalid placement, locks, connection status, or save state. Show readable labels and feedback outside the world view where needed.

Support reduced motion and muted audio. Avoid intense flashing, mandatory camera shake, and effects that hide actions. Keyboard users must be able to reach and operate the surrounding menus without being trapped by movement controls.

The core training app MUST remain available without the world view. Do not claim full accessibility based solely on making a rendered canvas focusable; document remaining lounge access limits.

### N-08. Maintainability and evidence

Use versioned, documented public contracts. Add a map or ordinary item type without a core fork. The app's product content must not become hidden engine assumptions.

Astra MUST provide a runnable independent example, useful failures, tests for public behavior, and operating notes for deploy, rollback, diagnosis, and restore. Name dependencies and licenses before adopting assets or packages.

Diagnostics SHOULD expose join time, frame time, disconnect/recovery events, and rejected durable changes without logging private training data. The app must be able to distinguish a bad asset, lack of access, network loss, and an unsupported device.

## 6. Proposed test targets

These are starting budgets for review and profiling, not measured results or hidden promises. Astra MUST propose changes with evidence rather than silently lower the bar. Choose exact reference devices during planning before accepting performance claims.

| Measure | Proposed target | Test conditions and meaning |
| --- | --- | --- |
| Room capacity | 20 connected avatars; 50 placed items total, including up to 5 complex active toys | Includes 20 distinct equipped avatars. Terrain and authored scenery are additional measured content, not unbounded free detail. |
| Cold entry | p95 at or below 6 seconds | From Enter to controllable shared room; cold browser asset cache, pre-authenticated app; 10 Mbps down, 2 Mbps up, 80 ms round-trip delay. |
| Warm entry | p95 at or below 2 seconds | Same path and network; required immutable assets cached; fresh room join. |
| Critical download | At or below 4 MB transferred for initial playable view | Includes required runtime and first-view content, not just JavaScript. Additional content may stream without blocking control. Report total visit bytes as well. |
| Rendering | Aim for 60 frames per second; full-room low-quality floor of p95 frame time at or below 33.3 ms | Named baseline phone, 15-minute active scene, representative art and toys. Report stalls separately. |
| Local response | p95 at or below 100 ms from input to visible movement/action response | Baseline device and network; measure the local response, not final agreement from every peer. |
| Host recovery | p95 at or below 5 seconds after abrupt host loss | At least one eligible foreground peer and a reachable service; no loss of acknowledged durable edits. |
| Impaired network | Stay usable at 150 ms round-trip delay with jitter and 2% loss; remain safe and recover under worse faults | State exact loss/jitter model and transport. Exercise shared objects, edits, reconnect, and authority changes. |
| Empty room | No active world simulation after room sleep | Shared service, storage, and scheduled app-job costs may still exist; measure them separately. |
| Resource cleanup | No accumulating world sessions or unbounded retained world resources across 20 enter/leave cycles | Record baseline and post-cycle resources; do not require garbage collection to return every byte on an exact clock. |

For p95 claims, use a documented repeat count and test method. A single run is a sample, not a percentile. Report emulated tests and physical-device tests separately.

## 7. Art and interaction acceptance

Use `intent.md` as the style brief: expressive angular characters, inked facets, a light sketch feel, simple athletic clothes, and fun rather than babyish or aggressive styling.

Astra SHOULD present a small in-engine style sample before creating a large content set. Judge it at actual phone play size, in motion, beside terrain and other characters. Do not approve the whole approach from a close-up still alone.

The sample MUST make heights, edges, interactive objects, and the local character clear. Sketch lines must not shimmer enough to distract. Optional visual effects must have a quieter form for low quality and reduced motion.

The art test must include a custom character and a shared toy. Gray blocks may prove geometry, but cannot prove avatar cost or final readability. Do not copy Minecraft models, textures, branding, or maps; make original or properly licensed content.

## 8. First playable scope

The first playable is the smallest honest test of the new experience:

- One map larger than the phone viewport, with a flat area, ramp, raised surface, and the proposed over/under route.
- Direct keyboard and touch controls; a stable player-following view; safe recovery from leaving the map.
- One representative custom-character path, a few distinct appearances, and basic movement and gesture animation.
- At least two real connected clients, one shared ball/toy, one trigger-driven feature, and one placeable decoration with an ownership check.
- A normal join, an abrupt host/connection loss, recovery, and a leave/rejoin that retains an acknowledged decoration edit.

This stage addresses `Z-01` through `Z-12` in a narrow form and probes `N-01` through `N-06`. It does not claim to finish them. Use it to test camera scope, mobile feel, true height, asset cost, and the trust model before expanding content.

After that, V1 adds the full Zoomigo integration, all requirement outcomes, linked travel and map-change proof, migration, fuller content, operating tools, and the full-room evidence. Do not defer those under a “prototype complete” label.

## 9. Acceptance journeys

Record a pass, fail, or not-yet-tested result for each journey with evidence. Automated checks should cover invariants; human play checks should cover controls, readability, and the sense of space.

| ID | Scenario and expected result | Main requirements |
| --- | --- | --- |
| A-01 | A permitted player enters on a phone and a desktop. Their character is controllable, the view follows, menus do not leak input, and leaving cleans up the session. | Z-01, Z-02, Z-03, L-01, L-06, N-01 |
| A-02 | Two players use the bridge and the route below at the same screen position. They stay on the correct surfaces; neither hits a toy on the other level. A ball behaves correctly on a slope. | Z-04, Z-06 |
| A-03 | Two clients act on one toy while a third joins mid-action. All converge on one result and the join does not restart the interaction. | Z-05, Z-06, Z-07 |
| A-04 | An owner places, rotates, moves, and returns a decoration. Cancel, double tap, retry, and a dropped reply do not duplicate or lose the owned item. | Z-08, Z-09, Z-11, L-03 |
| A-05 | A teammate may play with an item but cannot edit it. Forged peer commands, stale host data, expired access, and an attempted cross-team join are rejected. | Z-09, L-01, N-05 |
| A-06 | The simulation host closes without warning or a phone is suspended. Eligible peers recover within the target; saved edits and rights remain intact; no two accepted authorities remain. | Z-12, N-04, N-06 |
| A-07 | The last player leaves, the service restarts, and a player returns. Layout and ownership remain; transient motion follows the item's sleep policy; the empty room ran no world simulation. | Z-11, N-06 |
| A-08 | A cosmetic asset fails and the graphics path is unavailable on another device. The first player gets a playable fallback; the second gets a clear app-safe state. Training still works. | Z-10, L-01, L-06, N-02 |
| A-09 | Players travel to a permitted destination and return. Failed loading, denied access, and a connection loss leave no duplicate avatar or stranded player. | Z-13, Z-01, Z-12 |
| A-10 | Staff change the map. Compatible items survive; incompatible items follow the stated restore/archive/return policy. No earned ownership disappears. | Z-13, L-03 |
| A-11 | Run the full target room on the named phone and browser matrix under normal and impaired networks, then repeat entry/exit. Publish timing, resource, traffic, and cost results. | N-01, N-02, N-03, N-04, N-06 |
| A-12 | A developer uses public interfaces to embed Zoomap in a separate sample app and add a map and authored toy without importing Zoomigo business code or forking the core. | Z-07, Z-14, N-08 |
| A-13 | Play on a small portrait screen with reduced motion, muted audio, low quality, and keyboard-only menus. Routes, status, actions, and exit remain clear. | Z-03, L-06, N-07 |
| A-14 | Roll a pilot team forward and back under the migration plan. Identity and inventory remain valid; new placements are handled by the stated rollback policy, not silently discarded. | Section 10, Z-11, L-03, N-08 |

## 10. Replacement and migration

Before choosing the final implementation, Astra MUST audit the current Canvas and Zoomigo source and record the inspected commits. Find the actual lounge entry points, extension hooks, item definitions, avatar work, auth checks, inventory paths, and persistent room state.

Create a capability inventory with: current source evidence, who uses it, the proposed Zoomap outcome, migration needs, and one of keep/change/replace/defer/remove. A documented example is not proof that Zoomigo uses the feature. An earlier plan is not proof that the code implements it.

At minimum, examine movement and camera assumptions, shared physics and triggers, item editing and ownership, effects, room travel, host recovery, transport options, saved state, and lazy loading. Do not assume “mesh” describes the current topology.

Preserve identity, team membership, unlocks, and inventory. For old maps, coordinates, assets, and placed objects, define what is portable and what must be rebuilt or returned. A fresh 3D scene is allowed; unexplained loss of earned goods is not.

Run a controlled pilot. A given room MUST NOT have Canvas and Zoomap independently accepting competing live writes. Use a deliberate handover or isolation policy.

Rollback MUST account for data created after cutover. A flag that launches the old renderer is not a rollback plan if new items or edits cannot be read. Define what is restored, preserved separately, translated, or held pending. Do not promise lossless format conversion without proving it.

Existing Canvas package compatibility is not required. Existing user rights and a safe app experience are required. Keep unrelated training and account code out of the replacement unless a specific integration change is necessary.

## 11. Decisions for product review

These proposed defaults allow Astra to plan without asking the owner to pick libraries or low-level designs. They are not recorded approvals.

| Choice | Proposed starting position | What needs to be settled |
| --- | --- | --- |
| Camera scope | Visible avatar, mostly fixed-angle isometric-style follow view | Whether literal first-person mode is a near-term requirement. Do not build both by default. |
| Real-height proof | Include a usable bridge and independent path below it | Confirm this is the right minimum for the desired world, rather than raised areas only. |
| Movement extras | Walk/run presentation, contact play, and a context action; no required jump or dodge | Add extra controls only if they improve the lounge rather than make it a platform game. |
| Decorating reach | Clear edit mode within map-defined permitted areas; protect shared routes | Decide whether players can edit anywhere permitted or only near their avatar. |
| Collision between players | Pass-through or soft response | Keep social presence without body-blocking or griefing. |
| First map | A compact social play area with an overlook and one or two focal activities | Astra proposes the layout and theme; it need not be a literal dungeon. |
| Old placed items | Preserve ownership; migrate positions only where meaningful, otherwise restore/archive/return under policy | Audit current records and assets before promising exact scene conversion. |
| Cost and speed budgets | Use section 6 and measure all delivery/relay costs | Confirm baseline devices and revise numeric targets with evidence. |
| Offline lounge | No claim of a live shared world offline | Local previews are optional and must not create trusted shared rewards. |

Astra owns the engine, world representation, physics approach, renderer, animation implementation, networking topology, synchronization method, storage design, package structure, asset tooling, and testing tools. Choose them to satisfy this brief. Do not turn implementation convenience into an unannounced product limit.

## 12. Required planning and release evidence

Before major implementation, provide a scope summary, source-backed capability audit, chosen design with tradeoffs, staged work plan, benchmark plan, and migration/rollback plan. Call out any proposed product changes in plain language.

For V1, provide the working library and Zoomigo integration, independent consumer example, public contract and content-authoring docs, acceptance results, physical-device performance results, cost estimates with assumptions, and deploy/restore/rollback instructions.

Track work against the requirement IDs. Record what is implemented, tested, still proposed, and known not to work. Do not claim full completion based on mock data, a single-user demonstration, or an unmeasured desktop run.

## Appendix: source context and limits

This brief draws on the owner's September 6, 2026 request, prior Canvas and avatar planning, and the accessible repository landing-page READMEs.

The Canvas README describes a single browser simulation host, backend coordination and saved checkpoints, public client/server integration surfaces, and several interaction examples. The earlier Canvas specification proposed a relay-first approach with a possible later host-star transport. Neither is evidence of a full peer mesh.

The Zoomigo README describes a youth training PWA with a Canvas team lounge, app-owned player access, and rewards. The owner's brief places identity, inventory, unlocks, and assets on the Zoomigo side. Earlier avatar plans supply product direction, not proof of a shipped avatar runtime.

Source locations:

- `https://github.com/dafepro/canvas` and its maintained docs, including `docs/realtime_multiplayer_2d_canvas_spec.docx`.
- `https://github.com/dafepro/fc-workout-pwa`, its `AGENTS.md`, and its maintained documentation index.
- Prior `avatar-architecture.md` and avatar `intent.md` drafts. Locate their current repo equivalents before relying on them.

The repository landing pages and earlier library documents were readable in this drafting session. Deeper repository pages and a Git checkout were not available. No implementation was run, no commit was pinned, and current code-level parity was not verified. Astra must perform that audit rather than treat these notes as one.
