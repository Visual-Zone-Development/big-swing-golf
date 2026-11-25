// The course: three holes at the seaside resort, played as real golf: everyone tees off, then
// whoever is farthest from the pin plays next, until all have holed out; then on to the next tee.
// Fewest strokes over the round wins. Plain numbers and rules only (no drawing), so it can be tested.
//
// Game space as everywhere: x right of the first tee, z downrange, metres.
import { YD } from './tuning.js'

/**
 * The holes, in the order they're played. Each has its own tee and its own green on the range's
 * flat ground. A green is described like the practice green (green.js): a centre, half-widths, a
 * fringe, a base height, a tilt (rise per metre right, and downrange) and soft humps.
 */
export const HOLES = [
  {
    // Straight down the range to the far end, just short of the dunes, the lighthouse behind.
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
    cup: { x: -9, z: 263 }
  },
  {
    // From a forward tee on the left, across the fairway to a green against the dunes: the beach
    // and the sea are just beyond it, so a slice finds sand or water.
    name: 'Beach Hut Bay',
    par: 3,
    tee: { x: -26, z: 22 },
    green: {
      x: 40,
      z: 160,
      rx: 11,
      rz: 10,
      fringe: 0.22,
      base: 0.35,
      tilt: [-0.014, 0.008], // falls toward the sea on the right, rises to the back
      bumps: [
        { x: 4, z: -3, h: 0.12, r: 2.8 }, // a knuckle on the front right
        { x: -4, z: 3, h: -0.09, r: 3 } // a dip on the back left
      ]
    },
    cup: { x: 42, z: 161 }
  },
  {
    // From the back tee on the right, the long diagonal the other way to a green tucked under the
    // hills, on a shelf higher than the others.
    name: 'Shady Hill',
    par: 4,
    tee: { x: 36, z: -2 },
    green: {
      x: -48,
      z: 206,
      rx: 11,
      rz: 11,
      fringe: 0.24,
      base: 0.6,
      tilt: [0.018, 0.006], // falls away from the hills, to the left
      bumps: [
        { x: 3, z: 0, h: 0.16, r: 3 }, // a ridge through the middle
        { x: -5, z: -4, h: -0.1, r: 2.8 }
      ]
    },
    cup: { x: -51, z: 208 }
  }
]

/** The course as a whole. */
export const COURSE = { name: 'Seaside', par: HOLES.reduce((a, h) => a + h.par, 0) }

/** A hole's length in yards, tee to pin. */
export const holeYards = (h) => Math.round(Math.hypot(h.cup.x - h.tee.x, h.cup.z - h.tee.z) / YD)

/** After this many strokes on a hole, the ball is picked up. */
export const MAX_STROKES = 10

/** Yards from a point to the pin. */
export const yardsToPin = (p, cup) => Math.hypot(cup.x - p.x, cup.z - p.z) / YD

/** The name for a score on a hole: 'Hole in one!', 'Eagle!', 'Birdie!', 'Par', 'Bogey', '+3'… */
export function scoreName(strokes, par) {
  if (strokes === 1) return 'Hole in one!'
  const d = strokes - par
  return { [-3]: 'Albatross!', [-2]: 'Eagle!', [-1]: 'Birdie!', 0: 'Par', 1: 'Bogey', 2: 'Double bogey', 3: 'Triple bogey' }[d] ?? (d < 0 ? `${d}` : `+${d}`)
}

/**
 * The club for this distance: the shortest one whose full carry gets there, so the bar's full
 * swing is about right (a wedge for anything inside its carry). clubs: CLUBS, longest first.
 */
export function clubFor(yards, clubs) {
  for (let i = clubs.length - 1; i >= 0; i--) if (clubs[i].carry >= yards - 5) return i
  return 0
}

/**
 * Who plays next: of the seats still playing (not holed out, still connected), whoever is farthest
 * from the pin; ties (everyone on the tee) go round in seat order after the one who just played.
 * Returns the seat index, or -1 when everyone has holed out.
 */
export function nextToPlay(seats, turn, cup, live = () => true) {
  const n = seats.length
  const after = (i) => (i - turn + n) % n || n
  const far = (s) => Math.hypot(cup.x - s.ball.x, cup.z - s.ball.z)
  const left = seats.map((s, i) => ({ s, i })).filter(({ s }) => !s.done && s.ball && live(s))
  if (!left.length) return -1
  left.sort((a, b) => far(b.s) - far(a.s) || after(a.i) - after(b.i))
  return left[0].i
}

/**
 * A seat's strokes over the round so far: the holes on its card, plus the hole being played
 * (a finished hole is on the card already).
 */
export const roundTotal = (s) => (s.card ?? []).reduce((a, x) => a + (x ?? 0), 0) + (s.done ? 0 : (s.strokes ?? 0))

/** How a round's total reads against par: 'Level par', '2 under', '3 over'. */
export function toPar(total, par = COURSE.par) {
  const d = total - par
  return d === 0 ? 'Level par' : d < 0 ? `${-d} under` : `${d} over`
}

/** The scoreboard: fewest strokes over the round first (ties keep seat order). */
export function courseStandings(seats) {
  return seats
    .map((s, i) => ({ s, i, total: roundTotal(s) }))
    .sort((a, b) => a.total - b.total || a.i - b.i)
    .map(({ s, total }) => ({ id: s.id, name: s.name, total }))
}
