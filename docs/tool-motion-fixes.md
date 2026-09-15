# Tool motion and cannon collision follow-up

Equipment appearance no longer chooses between two independent headings. The
accepted player body owns facing; explicit tool aim updates that heading during
use, and prediction applies the same rule. Equip/draw initialize aim from the
current body heading. Stow and emotes retain it. The renderer only smooths the
accepted heading, so changing hand ownership cannot trigger a quarter turn.

Panel bracing and winch reeling previously selected the full-body crouch solver,
replacing the walking legs. They now supply an eased upper-body lean. A regression
runs both actual item behaviors through forward and backward diagonal walking,
checking identical leg rotations/support against the ordinary gait and exact
visible grips. Another test checks equip, manual aim, stow, draw and emote from
four starting headings.

Backward diagonal blends now favor the backward stride and rotate the pelvis/
leg chain coherently while retaining the upper-body aim frame. Existing 360°
directional seam, rendered posture/extension, ground contact, and jerk gates
remain enforced. Updated front/side renders are under
`docs/evidence/directional-locomotion`.

The cannon's player hull participates in movement, prediction and path planning.
Separate wheel/front ball colliders preserve its intake and loading path. The
multiplayer test positions its observer clear of the intake and verifies the
same fuse/fire timeline across late join and host loss. The cannon approach can
avoid loose balls so navigating around the solid body does not push the staged
ball away before the kick.
