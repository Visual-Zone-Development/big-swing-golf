# Big Swing Golf: style

The look the art-direction, environments and lighting passes work to. The concept board (rounds 1 and 3) is the reference: a sunny ocean resort, saturated and soft, nothing boxy.

## Scene look
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
- **Life:** tufts sway, flags flutter, boats bob, the crew blinks, breathes and watches the ball; reactions are hops, spins, flinches and droops.
- **Dressing:** tufts thick in the rough near the tee and around the greens, thinning downrange; flowers in patches by the tee; beach huts in a row on the dunes; rocks along the waterline.

## Faces
3D eyes on every sculpted bean: eyeballs with pupils and a shine, lids in the bean's colour, brows as soft dark bars; a painted mouth. The ten expressions and their eye settings are `EXPRESSIONS` in the shared bean kit (`shared/beans/beans.js`); the mouths are in `faces.js`. Expressions ease into each other; blinks are instant; shut eyes squeeze into slits.
