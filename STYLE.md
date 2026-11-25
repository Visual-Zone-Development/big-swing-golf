# Big Swing Golf: style

The look the art-direction, environments and lighting passes work to. The concept board (rounds 1 and 3) is the reference: a sunny ocean resort, saturated and soft, nothing boxy.

## Scene look
- **Bean shape:** a chunky jelly-bean capsule, like a vinyl toy: about half as wide as it is tall (0.72 m wide for 1.45 m), sides almost parallel from the hips to a round dome (no neck, never an egg), a softer round underneath; short thick legs (each about a quarter of the body's width), chubby arms, white gloves sized to hold a golf grip (about 0.7 of the sculpt's own), chunky white sneakers. The hand-built stand-in (`makeBean()`) is the same capsule (`BEAN` in `src/characters.js`).
- **Materials:** soft matte vinyl for the beans (sculpted, a little velvety), short mown grass with a fine blade grain, painted wood (yardage boards, beach huts), smooth sea-worn rock, soft puffy foliage.
- **Values:** lightest = the clouds, the beans' white gloves and shoes, the ball; darkest = the pupils, brows and tree trunks. The grass sits in the middle; the sky is a strong blue that fades to pale at the horizon.
- **Palette:** grass `#4aa437` (rough) / `#6cc843` (fairway) / `#5fb93b` (stripe) / `#78d551` (tee); sky `#2f86ee` → `#cdeeff`; sand `#f5dfa5`; sea `#1f9fd6`. Bean colours are the hero colours: orange `#ff8a3d`, pink `#ff5c8a`, teal `#2ab7b0`, purple `#8f6bff`, yellow `#f2c12e`. Beach huts in pastels (mint, coral, butter, sky, lilac).
- **Hero colour:** each player's bean colour, on the green of the course; the HUD's gold `#ffd23f` marks what's selected.
- **Surfaces:** grass detail tiles every 1.6 m (blade strokes, a bump map), soft patches at 55 m and 14 m, mowing stripes every 10 yards on the fairway and 0.9 m across the tee.
- **Type:** Lilita One for the logo and big numbers, Rubik for everything else (700 for labels, 500 for body).
- **UI objects:** the clubhouse rail (a navy column, rounded on the right) with rounded tiles, gold when selected; cream cards with navy text for explanations. Settings use the same tiles, with values drawn as what they are: level bars, switches, ‹ choices ›. Dark text on light panels has no outline; light text over the 3D view keeps its navy outline.
- **Light:** a warm high sun from the back left (`#fff1d6`), sky light from a CC0 midday sky, a cool rim light from behind what the camera looks at, soft shadows, a soft shadow under every bean. Neutral tone mapping, a touch of warmth and saturation, a soft vignette.

## Environment style: the resort
- **Camera:** behind the golfer at address, chasing the ball, looking down where it lands; low and behind on the green; the crew beside the rail on the title.
- **Depth:** haze toward the horizon colour from 150 m to 950 m; the hills, the sea and the lighthouse point fade into it.
- **Life:** one breeze sways the tree crowns and bushes and flutters the palm fronds (each instance at its own phase), the tufts sway, flags ripple from the pole to the tip, clouds drift (smooth puffs heaped in two rows, flat underneath, white on top shading to lavender-blue `#c6cff0` below), gulls wheel over the beach and flap in bursts between glides, the sea's foam laps and its waves glint, boats bob, the crew blinks, breathes and watches the ball; reactions are hops, spins, flinches and droops.
- **Dressing:** tufts thick in the rough near the tee and around the greens, thinning downrange; beds of five-petal blossoms (pink, yellow, white, lilac, coral) by and behind the tee and along the rough, clumped toward each bed's middle; candy-striped posts topped with a soft ball either side of every yardage board (pink, yellow, teal, purple, orange); beach huts in a row on the dunes; rocks along the waterline; one tree in five and one bush in three in flower.
- **Sea:** shallow `#56dccf` over the sand, `#1f9fd6` (the sea colour) further out, deep `#1670c4` offshore; white foam at the waterline about 2 m wide, a surf line rolling in behind it.

## Forms (pushplay-kit's model-asset rules)
Nothing in the resort is a bare sphere, box or cylinder: taper, flare, lump or round it; three or more overlapping parts; a darker trim and one accent.

| Asset | File | Built as | Accent |
|---|---|---|---|
| Broadleaf tree (8.5 m) | `src/flora.js` `treeGeometry` | trunk lofted, flared at the root (r 0.8 → 0.24 m), leaning 0.36 m; three tapered branches; eight lumpy clusters (r 1.15–2.3 m), each shaded as a ball: leaf `#24702f` → `#9be063` | coral `#ff6f86` / pale pink blossoms on one tree in five |
| Coconut palm (9 m) | `src/flora.js` `palmGeometry` | curving trunk, flared at the foot, scalloped rings every 0.45 m (`#7f5532` grooves, `#d1a066` ridges); nine fronds 4.4–5.3 m, folded along a `#b9dc66` midrib, serrated leaflets `#237f3a` → `#6fcc4e` | four coconuts |
| Bush (1.4 m) | `src/flora.js` `bushGeometry` | five lumpy clusters, flatter than the trees' | red / yellow hibiscus dots on one in three |
| Pennant | `src/cloth.js` | a curved grid that ripples, deepest at the tip (12 % of its length) | — |
| Gull (1.3 m across) | `src/gulls.js` | lofted body, inner wing and swept grey tip as thin slabs | yellow beak |

Far copies use each piece's `detail: 'low'` version (the five biggest clusters, no branches, painted rings); the detailed version is drawn within 70 m of the camera (bushes 45 m).

## Animation
Timing for the beans' reactions (`REACTIONS` in `src/reactions.js`); gravity in the air is 16 m/s², a little floatier than real.

| Reaction | Timing |
|---|---|
| Cheer (1.6 s) | crouch 0.14 s to 86 %; hop 0.42 m with a full spin over 1.3 × its air time; landing squash to 80 % in 0.11 s; a second hop 0.16 m; spring back over 0.4 s with a small overshoot |
| Happy (1.2 s) | crouch 0.1 s; one 0.2 m hop; squash to 88 %; spring back |
| Sad (2 s) | droop 12 % and tilt forward 0.25 rad over 0.35 s (ease out), a slow sigh, back over 0.4 s (ease in-out) |
| Wince (1.6 s) | flinch 7 % and lean back 0.12 rad in 0.08 s, a tremble that dies within 0.5 s, back over 0.5 s |

Take-off blends out of the crouch over 0.1 s, the stretch is up to 14 % and follows the speed; nothing dips below the ground and every reaction ends exactly at rest. Ambient motion: breeze sway 0.9 Hz with gusts, frond flutter 3.1 Hz, flag wave 7 rad/s travelling to the tip, gull wingbeat about 1.4 Hz in bursts.

## Faces
3D eyes on every sculpted bean: eyeballs with pupils and a shine, lids in the bean's colour, brows as soft dark bars; a painted mouth. The ten expressions and their eye settings are `EXPRESSIONS` in the bean kit (`src/beans/beans.js`); the mouths are in `faces.js`. Expressions ease into each other; blinks are instant; shut eyes squeeze into slits.
