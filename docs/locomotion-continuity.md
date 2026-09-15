# Locomotion continuity review

The playback path reconstructs the baked CC0 gait with periodic cubic curves.
Rotation controls remain unfiltered so knee extension and the source silhouette
survive. Root and contact curves use a symmetric five-sample filter without a
phase delay. The original sampler/data remain unchanged for source verification.

Ground fitting previously selected the lowest shoe vertex and the lowest foot
with hard minima. Switching vertices or supporting feet introduced velocity
corners into the entire avatar, even with smooth bone rotations. The runtime now
uses a conservative smooth sole minimum and a C3 transition between feet. These
only raise support, never lower a shoe through the floor, and fade out for idle
and full-weight emotes. The two-foot rounding adds at most 18.75 mm clearance;
the sole term is bounded by 4 mm times log(hull vertex count). Rendered walking
clearance is checked against 35 mm, with a separate requirement to return within
12 mm of the floor during each cycle. Running retains its bounded flight phase.

An initially stronger rotation filter was rejected: it reduced knee extension.
The retained cubic reconstruction changes the backward diagonal crossover
minimum by less than one degree (25.72 degrees measured); its reviewed limit is
26 degrees. Other extension, posture, grip, and angular-jump limits are unchanged.
No joint translations, limb scaling, or independent joint damping were added.

## Validation

`avatar-studio/tests/locomotion-continuity.test.ts` measures actual rendered
pelvis, chest, head, wrists and ankles at 60 and 120 Hz, after support fitting.
It checks vertical jerk (third finite difference), checks loop acceleration
continuity, and requires real head movement so a frozen pose cannot pass.
These are deterministic animation regression limits, not physiological limits
or a claim about device rendering performance. Impacts and action poses require
their own limits. Existing tests cover direction changes, stopping, repeated
identical timestamps, fixed limb lengths, contact sliding, and actual shoe
geometry; browser reviews cover three body weights and equipped/free hands.

[Before/after measurements](evidence/locomotion-continuity/metrics.json) retain
all seven joints plus carrier height. Example maximum head vertical jerk at
120 Hz (metres/second³):

| Movement                |  Before |  After |
| ----------------------- | ------: | -----: |
| Forward walk, 2.2 m/s   |  71,376 | 11,847 |
| Backward walk, 2.2 m/s  | 125,375 | 42,532 |
| Forward sprint, 5.4 m/s |  68,834 | 10,747 |
| Side sprint, 5.4 m/s    | 124,907 | 27,409 |

Backward walking still has the strongest contact acceleration. Its separate
regression bound makes that visible rather than hiding it in a global average.
This review does not claim every transition has a universal bounded jerk.

The table above records the initial continuity pass. The later compact-backward-walk update lowers head and rebound-panel travel to 6.54 cm and peak jerk to about 6,790 m/s³ at 120 Hz. The new panel-specific gate requires less than 8 cm travel and 10,000 m/s³ jerk in held/braced states. See [current panel measurements](evidence/locomotion-continuity/backward-panel.json).
