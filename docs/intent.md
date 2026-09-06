# Zoomap: Product Intent

Status: Draft 0.1 for product review  
Date: September 6, 2026  
Companion: [specs.md](specs.md)

## 1. Purpose

Zoomap is a reusable browser library for small, shared worlds that players enter through their own avatars.

It will replace Canvas in the Zoomigo team lounge. The key change is not just better graphics. A player should feel that they are **inside a place**, moving through it, rather than moving a token across a surface.

Zoomap should combine direct character control, a player-following view, terrain with real height, shared objects, and custom characters. It must feel quick on a phone and cost little to run.

Zoomigo, in `dafepro/fc-workout-pwa`, is the first customer. Zoomap must remain useful without Zoomigo's accounts, training rules, rewards, branding, or database.

## 2. What the player should experience

A player opens the lounge from Zoomigo and sees their own character. They move with simple controls while the view follows them.

The space extends beyond the screen. Paths, ramps, raised areas, and landmarks make it feel like a small world, not one large board squeezed into a viewport. Height affects where players and objects can go and what they can touch.

A teammate is kicking a ball in the lower court. The player walks down to join them. Both see the same ball and the same result. The player can then explore a raised path, use a playful object, or place a decoration they own.

They can leave without saving the room by hand. A return visit keeps the room's saved layout and their owned items. No child needs to choose a host, start a server, or repair a session.

This experience must work for one player as well as a group. It should support brief visits, not demand long play sessions.

## 3. Product goals

### A place to inhabit

Movement, the camera, and terrain should work together. The player controls a character with a position, facing, and presence in the world. Dragging the character is not the main movement model.

### Shared, playful interaction

Keep the useful parts of Canvas: objects players can hit and push, authored toys and triggers, item placement, ownership rules, shared state, and recovery when connections change. Better visuals must not turn the lounge into a static display.

### Personal and team expression

Players should recognize themselves and their teammates. Custom avatars, outfits, gestures, and decorations should help the room feel like their team's space. Appearance must not change athletic rank or grant movement advantages.

### Fast browser access

The lounge should load quickly, respond at once, and stay smooth during a full-team visit. It must not slow down workout logging or make the rest of Zoomigo depend on a game runtime.

### Low cost and low upkeep

Do not require a dedicated, always-running simulation server for every room. Empty rooms need no active world simulation. Preserve Canvas's low-cost aim, while letting Astra choose the best design and prove its cost.

### Room to grow without a new engine project

The product should support new maps, toys, themes, and avatar content through documented extension points. It is not a request to build an all-purpose game engine, a world-building platform, or an MMO.

## 4. Initial view and world direction

The starting direction is a **visible-avatar, mostly fixed-angle, isometric-style view of a world with real height**. The camera follows the local player instead of keeping the entire map on screen.

Use the owner's Minecraft Dungeons reference for the desired sense of paths, levels, compact spaces, and a readable view from above. Do not treat it as a request to copy assets, combat, loot, a voxel engine, or a whole game.

“2.5D” describes the presentation here. It does not allow height to be only a drawing trick. A player on a bridge and a player below it must occupy different spaces and interact with the correct surfaces.

The original brief also mentions first-person 3D. This draft uses the visible-avatar view as the initial product default. Literal first-person play remains an open scope choice. Do not build several camera systems before resolving that choice. Do not promise future first-person support without assessing it.

Exact projection, camera angle, movement tuning, rendering method, and world representation belong to Astra.

## 5. Starting art direction

Use the recent avatar direction as a starting point: angular forms, inked facets, and a light hand-drawn or sketch feel. Characters should be expressive, athletic, and fun, without looking childish or trying too hard to look tough.

Start with simple athletic clothes, clear contours, readable faces and poses, and a restrained color palette. Avoid glossy, rounded emoji-like characters, realistic bodies, and detail that disappears on a phone.

The world should share that visual language. Use clear shapes and useful landmarks. Paths, edges, heights, interactive objects, and other players must be easy to read at normal play size.

This is visual guidance, not a shader requirement. Astra may use any approach that achieves the look within the performance budget. A quieter low-quality mode is better than unstable lines, visual noise, or slow controls.

## 6. Product boundary

**Zoomap owns the shared-world capability:** moving through a map, following a player, spatial interaction, shared objects, room lifecycle, placement mechanics, and ways for an app to supply content and rules.

**Zoomigo owns the product policy:** player identity, team membership, room access, inventory, unlocks, approved assets, avatar choices, training data, reward rules, and staff permissions.

Zoomap uses identity and permissions supplied through trusted app integration. It must not become a second account system or a second source of inventory truth.

A browser that helps simulate the room does not gain the right to grant items, change ownership, admit players, or award rewards.

## 7. What “replacement” and “upgrade” mean

This is a functional successor, not a promise of a drop-in package swap.

Astra may reuse, adapt, or replace Canvas code. There is no requirement to keep its API, wire format, renderer, or world model. There is a requirement to inspect how Zoomigo uses Canvas and account for each relevant capability before switching over.

The new lounge must add direct character control, a following camera, useful terrain height, and a stronger sense of space. It must also preserve the shared-play and low-cost outcomes that made Canvas useful.

Existing ownership and unlocks must survive. Any limits on moving old maps, assets, placed items, or behaviors must be explicit. Do not discard a feature or user data just because it does not fit the new design.

## 8. Zoomigo's role

The lounge supports Zoomigo's training purpose. It should help teammates connect, express themselves, and enjoy small shared moments. It must not make time spent in the lounge a substitute for physical activity or a source of training credit.

Keep team spaces private. Use approved gestures and preset messages, not new open chat or public matchmaking. A player who cannot load the lounge must still be able to use the core app.

New maps and themes should give the team something to discover without resetting their identity or taking away earned items.

## 9. What we are not asking for now

The initial release does not need combat, enemies, crafting, destructible terrain, infinite maps, user-built terrain, public rooms, voice chat, free-text chat, player scripts, or a full visual map editor.

It does not need every old Canvas presentation mode, every possible camera mode, or a broad asset catalog on day one. Flat maps should remain possible within the chosen world model; a separate legacy 2D engine is not required.

These exclusions narrow the first product. They do not excuse losing a feature that the migration audit finds Zoomigo relies on without a named decision.

## 10. What success looks like

A child can enter, understand how to move, find a teammate, play with a shared object, and place an owned decoration without help. A full team can do this on supported phones without a fragile host setup or poor frame rate.

A developer can add a small map and an authored toy through documented public extension points. Zoomigo retains control of access, content, ownership, and rewards.

The room survives normal browser and network failures. The system proves its speed and cost through measurements, not just a desktop demo.

## 11. Decision rights

This document states product intent. `specs.md` turns it into proposed release scope and testable outcomes.

Astra owns technical choices and most interaction design. It should state assumptions, test the risky parts early, and explain tradeoffs that change user outcomes.

This is a review draft, not a record that all details have been approved. The camera scope, first map, movement extras, and numeric targets called out in `specs.md` are proposed defaults. Do not silently turn those defaults into claims from the owner, or weaken agreed requirements to suit a chosen tool.
