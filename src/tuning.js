// Every gameplay number. Distances in metres inside the game (yards on screen), angles in degrees,
// times in seconds. Arcade, not a simulator: carries are tidy, curves are big and readable.
export const YD = 0.9144

export const CLUBS = [
  // carry: yards at a full, square swing. launch: degrees up. lift: how much backspin holds it up.
  // land: how much speed it keeps when it lands (low = it stops quickly). roll: rolling drag.
  { id: 'dr', short: 'DR', name: 'Driver', carry: 240, launch: 12, lift: 0.0021, land: 0.5, roll: 3.2 },
  { id: '3w', short: '3W', name: '3 Wood', carry: 215, launch: 14, lift: 0.0023, land: 0.45, roll: 3.4 },
  { id: '5i', short: '5i', name: '5 Iron', carry: 180, launch: 17, lift: 0.0026, land: 0.4, roll: 3.8 },
  { id: '7i', short: '7i', name: '7 Iron', carry: 155, launch: 21, lift: 0.0029, land: 0.36, roll: 4.2 },
  { id: '9i', short: '9i', name: '9 Iron', carry: 130, launch: 26, lift: 0.0032, land: 0.32, roll: 4.6 },
  { id: 'pw', short: 'PW', name: 'Pitching Wedge', carry: 110, launch: 30, lift: 0.0034, land: 0.28, roll: 5 },
  { id: 'sw', short: 'SW', name: 'Sand Wedge', carry: 80, launch: 36, lift: 0.0036, land: 0.24, roll: 5.5 }
]

/**
 * The bean crew: every golfer is a bean (characters.js). Seats take them in this order: their
 * name and colour (so the TV, the phone and the shot map agree on who's who), and the outfit
 * they wear until the player picks their own on the phone (Wardrobe).
 */
export const CREW = [
  { id: 'pip', name: 'Pip', color: '#ff8a3d', outfit: { hat: 'bucket', top: 'polo', acc: 'none' } },
  { id: 'coral', name: 'Coral', color: '#ff5c8a', outfit: { hat: 'none', top: 'hawaiian', acc: 'lei' } },
  { id: 'finn', name: 'Finn', color: '#2ab7b0', outfit: { hat: 'shark', top: 'polo', acc: 'none' } },
  { id: 'bobo', name: 'Bobo', color: '#8f6bff', outfit: { hat: 'none', top: 'none', acc: 'snorkel' } },
  { id: 'sunny', name: 'Sunny', color: '#f2c12e', outfit: { hat: 'bucket', top: 'hawaiian', acc: 'none' } }
]

/** The wardrobe: what a bean can wear, slot by slot ('none' first). The phone builds its buttons from this. */
export const OUTFITS = {
  hat: [
    { id: 'none', label: 'No hat' },
    { id: 'bucket', label: 'Bucket hat' },
    { id: 'shark', label: 'Shark-fin cap' }
  ],
  top: [
    { id: 'none', label: 'No top' },
    { id: 'polo', label: 'Golf polo' },
    { id: 'hawaiian', label: 'Hawaiian shirt' }
  ],
  acc: [
    { id: 'none', label: 'Nothing' },
    { id: 'lei', label: 'Flower lei' },
    { id: 'snorkel', label: 'Snorkel mask' }
  ]
}

export const TUNING = {
  swing: {
    // Phone: the backswing sets the power (what the phone's bar shows): this far back (deg) is a
    // full swing, by the "Swing power needed" setting. The downswing then has to commit: reach
    // `commit` of full club speed (deg/s at impact, `full`) for that power, or the shot is softer.
    backFull: { easy: 160, normal: 200, strong: 240 },
    full: { easy: 750, normal: 1050, strong: 1400 },
    commit: 0.5,
    maxBack: 1.2, // power from the backswing tops out here (an overswing: a little further, wilder)
    minPower: 0.12, // the gentlest swing that counts still dribbles the ball out
    maxPower: 1.12, // past full: a little extra distance…
    overswingWild: 2.5, // …and this much more face error per unit over full
    mphPerDps: 0.085, // club speed shown on screen (1050 deg/s ≈ 89 mph)
    deadzone: 1.5, // face and path errors under this (deg) count as square
    assist: { off: 1, some: 0.6, lots: 0.35 }, // "Straight shot help" scales face and path
    pathWeight: 0.6, // how much the swing path counts (it relies on the hold; the face doesn't)
    maxFace: 25,
    maxPath: 15,
    // Phone swing reader (sent to phones as party.public.swing)
    reader: { still: 40, start: 90, minBack: 25, reverse: 140, minHit: 250, backMs: 4000, downMs: 1500, axisPrior: 20 }
  },
  ball: {
    startShare: 0.75, // the ball starts mostly where the face points…
    curvePerDeg: 1.8, // …and curves by face minus path: spin-axis tilt per degree
    maxTilt: 38,
    gravity: 9.81,
    drag: 0.0042, // per metre: a = drag · v²
    spinFade: 5.5, // seconds for the backspin's lift to fade to a third
    bounce: 0.34,
    roughBounce: 0.2,
    hopMin: 0.8, // m/s up after a bounce: slower than this and it's rolling
    roughRoll: 3.2, // extra rolling drag in the rough (m/s²)
    rollEase: 0.4, // rolling drag falls to this share of itself…
    rollEaseBelow: 4, // …as it slows from this speed (m/s) to a stop: it trickles out
    stopSpeed: 0.08,
    maxRoll: 7, // seconds: however hilly it is, the ball settles by then
    radius: 0.06 // drawn bigger than a real ball (0.021) so it can be seen on a TV
  },
  range: {
    fairway: 22, // half-width (m) at the tee…
    fairwayGrow: 0.12, // …widening this much per metre downrange
    length: 300, // yards to the back fence
    aimMax: 30, // degrees left or right
    aimSpeed: 18 // degrees per second while held
  },
  targets: {
    // Target challenge greens: yards out, yards left(-)/right(+), ring radii in yards, and how
    // much a landing there is worth (× the ring's points).
    greens: [
      { yards: 60, side: -8, color: '#ff5c8a', mult: 1 },
      { yards: 95, side: 10, color: '#2ad1c9', mult: 1.5 },
      { yards: 135, side: -6, color: '#ffd23f', mult: 2 },
      { yards: 175, side: 9, color: '#8f6bff', mult: 2.5 },
      { yards: 220, side: -4, color: '#ff8a3d', mult: 3 }
    ],
    rings: [
      { r: 3, points: 30, name: 'Bullseye!' },
      { r: 7, points: 20, name: 'Inner ring' },
      { r: 12, points: 10, name: 'On the green' }
    ],
    balls: 10
  },
  meter: {
    // Controller / keyboard: press to start, press to set power, press on the line for a straight shot.
    rise: 1.1, // seconds from empty to full
    fall: 0.9, // seconds for the accuracy marker to come back down
    window: 0.06, // fraction of the meter that counts as a perfect strike
    faceAtEdge: 16 // degrees of face error at the edge of the accuracy zone
  },
  putting: {
    // The green (putting.js): a real-ish green speed, a cup ~2.5× the ball (as drawn) like a real one.
    roll: 0.62, // m/s² of rolling friction on the green (about a 10 on the Stimpmeter)
    fringeDrag: 3, // the fringe slows it this many times faster…
    offDrag: 9, // …and the range beyond it this many
    stop: 0.04, // m/s: slower than this it stops (unless the slope keeps it going)
    // Forgiving on purpose (easy to pick up): a cup ~3× the ball, firm putts still drop, a ball
    // dying near the rim is pulled in, and lip-outs only off the very edge.
    cup: 0.19, // cup radius (m); the ball is TUNING.ball.radius
    catch: 2.3, // m/s: the fastest a ball dead centre can still drop
    lipEdge: 0.55, // only a ball passing further off-centre than this (× cup radius) can lip out…
    lipRange: 1.35, // …up to this much over the catch speed…
    lipTurn: 55, // …swung this many degrees round the rim…
    lipKeep: 0.55, // …keeping this much of its speed
    hopKeep: 0.8, // much too fast: it hops the cup keeping this much
    pull: { r: 0.45, speed: 1.1, acc: 1.6 }, // near the cup and slow: drawn in (m, m/s, m/s² at the rim)
    planPast: 0.35, // the help's ideal pace: rolls this far (m) past the cup
    // The stroke (puttStroke): the bar is scaled to each putt. A full backstroke (`backFull` degrees,
    // scaled by "Swing power needed") rolls `range` × the putt (its flat-green length, at the help's
    // pace when the help is on), in proportion: halfway back is the cup, for a 3-footer or a 30-footer.
    // The through-stroke has to reach `commit` of the club speed that delivers it (mpsPerDps m/s per °/s).
    // Anything else (meter, flick, pad): power 1 is a full bar. `full` ft is the bar with no putt to scale to.
    backFull: 30,
    mpsPerDps: 0.028,
    commit: 0.3,
    range: 2,
    rangeMin: 1.2, // m: the shortest full bar…
    rangeMax: 30, // …and the longest
    full: 50,
    deadzone: 1, // face errors under this (deg) count as square
    maxFace: 10,
    faceShare: 0.9, // the ball starts where the face points, nearly all of it
    aimMax: 25, // degrees either side of the line to the cup
    aimSpeed: 6, // degrees per second while held
    gimme: 3, // Putting challenge: a ball this close (ft) counts as in, one more putt
    maxPutts: 4, // after this many it's picked up, scoring one more
    holes: 9,
    rollSpeed: 1.5, // the ball rolls this much faster than real time
    // The phone's swing reader for a putting stroke (sent as party.public.swing): small and slow.
    reader: { still: 12, start: 15, minBack: 3, reverse: 12, minHit: 20, backMs: 4000, downMs: 2000, axisPrior: 3 }
  },
  // The wind (course.js): mph on screen, metres a second in the flight; `gain` exaggerates it a
  // little, 10 mph across moves a 7-iron about 8 yards, in your face costs it about 13. Putts don't feel it.
  wind: { mps: 0.447, gain: 1 },
  // How much of a swing a lie lets through (course.js liePower): sand needs a wedge.
  lie: { rough: 0.9, sand: { sw: 0.95, pw: 0.8, other: 0.6 } },
  // A ball landing in a bunker: it keeps this share of its speed, hardly hops, and the sand drags it to a stop.
  bunker: { keep: 0.3, bounce: 0.06, roll: 16 },
  course: { flyover: 4.5, card: 7 }, // seconds: the sweep down a new hole, and the scorecard between holes
  pin: { balls: 6 }, // Closest to the pin: balls each (course.js PIN has the spots)
  practice: { show: 5 }, // seconds a practice swing's read stays on the TV
  flick: { full: 2600, faceGain: 0.6 }, // mouse/touch: px/s for a full-power flick
  camera: { back: 5.2, height: 1.9, side: 0.9, follow: 14, followHeight: 4.5, fov: 52 },
  flightSpeed: 1.6, // the ball flies this much faster than real time (arcade)
  safetyMin: 2.5 // seconds the safety screen stays up before this machine can skip it
}
