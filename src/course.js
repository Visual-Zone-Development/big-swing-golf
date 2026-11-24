// The course: three holes on the resort's range (a straight par 4 to the sea, a short par 3 over
// sand toward the dunes, and a par 4 back home), played as real golf: everyone tees off, then
// whoever is farthest from the pin plays next, until all have holed out. Fewest strokes over the
// three wins. Also here: the sand, how a lie saps a swing, the wind, and Closest to the pin.
// Plain numbers and rules only (no drawing), so it can be tested.
//
// Game space as everywhere: x right of the tee, z downrange, metres.
import { TUNING, YD } from './tuning.js'

/**
 * The holes. Each green is described like the practice green (green.js): a centre, half-widths, a
 * fringe, a base height, a tilt (rise per metre right, and downrange) and soft humps. They all
 * lie on the flat of the range, so only the hole being played is part of the ground (setHole()).
 * bunkers: ellipses of sand ({ x, z, rx, rz }); wind: the range (mph) it's drawn from each round.
 */
export const HOLES = [
  {
    // Straight down the range to a raised green by the sea, the lighthouse behind it.
    name: 'Lighthouse Point',
    par: 4,
    tee: { x: 0, z: 0 },
    green: {
      x: -12,
      z: 260,
      rx: 12,
      rz: 11,
      fringe: 0.22,
      base: 0.3,
      tilt: [0.012, -0.01], // rises to the right, falls toward the back (the sea)
      bumps: [
        { x: -5, z: -3, h: 0.14, r: 3 }, // a shoulder on the front left
        { x: 4, z: 4, h: -0.1, r: 3.2 } // a hollow on the back right
      ]
    },
    cup: { x: -9, z: 263 },
    bunkers: [
      { x: 15, z: 206, rx: 8, rz: 7 }, // where a pushed drive lands
      { x: 7, z: 251, rx: 4.5, rz: 5 } // front right of the green
    ],
    wind: [0, 4]
  },
  {
    // A short one across the range toward the dunes: carry the sand, don't fly the green (the sea).
    name: 'Palm Cove',
    par: 3,
    tee: { x: -30, z: 70 },
    green: {
      x: 36,
      z: 160,
      rx: 11,
      rz: 10,
      fringe: 0.22,
      base: 0.34,
      tilt: [-0.014, 0.008], // falls toward the dunes, rises to the back
      bumps: [
        { x: 3, z: -4, h: 0.13, r: 3 },
        { x: -4, z: 3, h: -0.09, r: 3 }
      ]
    },
    cup: { x: 38, z: 162 },
    bunkers: [
      { x: 25, z: 144.5, rx: 5, rz: 4 },
      { x: 37.5, z: 142.5, rx: 5, rz: 3.5 }
    ],
    wind: [3, 9]
  },
  {
    // From the far end back toward the tee box: reachable with a big drive, sand all round the green.
    name: 'Homeward',
    par: 4,
    tee: { x: 30, z: 268 },
    green: {
      x: -14,
      z: 62,
      rx: 12,
      rz: 10,
      fringe: 0.22,
      base: 0.32,
      tilt: [0.01, 0.012],
      bumps: [
        { x: 4, z: 2, h: 0.15, r: 3.2 },
        { x: -5, z: -3, h: -0.1, r: 3 },
        { x: -1, z: 5, h: 0.08, r: 2.4 }
      ]
    },
    cup: { x: -16, z: 59 },
    bunkers: [
      { x: -2, z: 83, rx: 5.5, rz: 4.5 }, // short, on the line in
      { x: 5.5, z: 60, rx: 4, rz: 5.5 }, // right of the green
      { x: -30, z: 72, rx: 4, rz: 4.5 } // long and left
    ],
    wind: [5, 12]
  }
]

/** The driving range: the first hole's green at the far end, and no sand. */
export const RANGE = { ...HOLES[0], bunkers: [], wind: [0, 0] }

/**
 * The hole whose green and sand are part of the ground right now (terrain.js reads it): the
 * range's until the course or Closest to the pin sets another.
 */
export let HOLE = RANGE
/** Make hole i (of HOLES) the ground's; -1 is the range. Returns it. */
export function setHole(i) {
  HOLE = HOLES[i] ?? RANGE
  return HOLE
}

/** Is (x, z) in one of this hole's bunkers? */
export const inBunker = (x, z, hole = HOLE) => hole.bunkers.some((b) => Math.hypot((x - b.x) / b.rx, (z - b.z) / b.rz) <= 1)

/**
 * Closest to the pin: Palm Cove's green, six balls from six spots (yards out, and the bearing in
 * degrees the shot is played along: 0 = downrange, + right). The third is from the rough.
 */
export const PIN = {
  hole: 1,
  miss: 100, // feet scored for a ball that doesn't stop on the green
  wind: [0, 10],
  spots: [
    { yards: 60, deg: 45 },
    { yards: 85, deg: 15 },
    { yards: 110, deg: 60 },
    { yards: 125, deg: 36.5 },
    { yards: 100, deg: 161 },
    { yards: 150, deg: 26 }
  ]
}
/** Where ball i of Closest to the pin is played from: { x, z }. */
export function pinSpot(i, P = PIN) {
  const sp = P.spots[((i % P.spots.length) + P.spots.length) % P.spots.length]
  const cup = HOLES[P.hole].cup
  const a = (sp.deg * Math.PI) / 180
  return { x: cup.x - Math.sin(a) * sp.yards * YD, z: cup.z - Math.cos(a) * sp.yards * YD }
}
/** A ball's score in Closest to the pin: feet from the pin where it stopped (0 holed, `miss` off the green). */
export function pinScore(rest, { holed = false, lie = 'green' } = {}, P = PIN) {
  if (holed) return 0
  if (lie !== 'green') return P.miss
  const cup = HOLES[P.hole].cup
  return Math.round((Math.hypot(rest.x - cup.x, rest.z - cup.z) / 0.3048) * 10) / 10
}
/** Closest to the pin's scoreboard: fewest feet first (ties keep seat order). */
export function pinStandings(seats) {
  return seats
    .map((s, i) => ({ s, i, total: Math.round(s.shots.reduce((a, x) => a + (x.feet ?? 0), 0) * 10) / 10 }))
    .sort((a, b) => a.total - b.total || a.i - b.i)
    .map(({ s, total }) => ({ id: s.id, name: s.name, total }))
}

/**
 * How much of a swing's power the lie lets through: all of it from the tee, the fairway and the
 * green; a little less from the rough and the hills; much less from sand, unless it's a wedge.
 */
export function liePower(lie, club, L = TUNING.lie) {
  if (lie === 'bunker' || lie === 'sand') return L.sand[club?.id] ?? L.sand.other
  if (lie === 'rough' || lie === 'hill') return L.rough
  return 1
}

/**
 * The wind for a hole or a ball: a speed from [lo, hi] mph and any direction. rand: () => 0..1.
 * dir is where it blows toward, in degrees (0 = downrange, + right).
 */
export function rollWind([lo, hi], rand = Math.random) {
  const mph = Math.round(lo + (hi - lo) * rand())
  return { mph, dir: mph ? Math.round(rand() * 360) : 0 }
}
/** A wind as metres a second along x and z (what flight.js takes). */
export function windVector(w, W = TUNING.wind) {
  if (!w?.mph) return null
  const a = (w.dir * Math.PI) / 180
  return { x: Math.sin(a) * w.mph * W.mps, z: Math.cos(a) * w.mph * W.mps }
}
/** A wind in words for a shot played along `line` degrees: '8 mph, left to right'. */
export function windWords(w, line = 0) {
  if (!w?.mph) return 'No wind'
  const rel = ((((w.dir - line) % 360) + 540) % 360) - 180
  const a = Math.abs(rel)
  const how = a < 30 ? 'behind you' : a > 150 ? 'in your face' : (a < 60 ? 'helping, ' : a > 120 ? 'against, ' : '') + (rel > 0 ? 'left to right' : 'right to left')
  return `${w.mph} mph ${how}`
}

/** After this many strokes on a hole, the ball is picked up. */
export const MAX_STROKES = 10

/** Yards from a point to the pin. */
export const yardsToPin = (p, cup = HOLE.cup) => Math.hypot(cup.x - p.x, cup.z - p.z) / YD

/** The name for a score on a hole: 'Hole in one!', 'Eagle!', 'Birdie!', 'Par', 'Bogey', '+3'… */
export function scoreName(strokes, par = HOLE.par) {
  if (strokes === 1) return 'Hole in one!'
  const d = strokes - par
  return { [-3]: 'Albatross!', [-2]: 'Eagle!', [-1]: 'Birdie!', 0: 'Par', 1: 'Bogey', 2: 'Double bogey', 3: 'Triple bogey' }[d] ?? (d < 0 ? `${d}` : `+${d}`)
}

/**
 * The club for this distance: the shortest one whose full carry gets there, so the bar's full
 * swing is about right (a wedge for anything inside its carry). clubs: CLUBS, longest first.
 * lie: how the ball lies; a club counts for what that lie lets through (liePower()).
 */
export function clubFor(yards, clubs, lie = 'fairway') {
  for (let i = clubs.length - 1; i >= 0; i--) if (clubs[i].carry * liePower(lie, clubs[i]) >= yards) return i
  return 0
}

/**
 * Who plays next: of the seats still playing (not holed out, still connected), whoever is farthest
 * from the pin; ties (everyone on the tee) go round in seat order after the one who just played.
 * Returns the seat index, or -1 when everyone has holed out.
 */
export function nextToPlay(seats, turn, cup = HOLE.cup, live = () => true) {
  const n = seats.length
  const after = (i) => (i - turn + n) % n || n
  const far = (s) => Math.hypot(cup.x - s.ball.x, cup.z - s.ball.z)
  const left = seats.map((s, i) => ({ s, i })).filter(({ s }) => !s.done && s.ball && live(s))
  if (!left.length) return -1
  left.sort((a, b) => far(b.s) - far(a.s) || after(a.i) - after(b.i))
  return left[0].i
}

/** A seat's strokes over the round so far: the holes on its card, plus the one being played. */
export const roundStrokes = (s) => (s.card ?? []).reduce((a, x) => a + (x ?? 0), 0) + (s.carded ? 0 : (s.strokes ?? 0))

/** The scoreboard: fewest strokes over the round first (ties keep seat order). */
export function courseStandings(seats) {
  return seats
    .map((s, i) => ({ s, i, total: roundStrokes(s) }))
    .sort((a, b) => a.total - b.total || a.i - b.i)
    .map(({ s, total }) => ({ id: s.id, name: s.name, total }))
}

/** A score against par, as golf says it: 'E', '+2', '-1'. */
export const toPar = (strokes, par) => (strokes === par ? 'E' : strokes > par ? `+${strokes - par}` : `${strokes - par}`)

/** Who tees off first on the next hole: the best score on the one just played (ties: seat order). */
export function honour(seats, hole, live = () => true) {
  let best = -1
  seats.forEach((s, i) => {
    if (!live(s)) return
    if (best < 0 || (s.card?.[hole] ?? Infinity) < (seats[best].card?.[hole] ?? Infinity)) best = i
  })
  return Math.max(0, best)
}
