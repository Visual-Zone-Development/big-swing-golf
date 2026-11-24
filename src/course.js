// The course: for now one test hole, a par 4 down the range to a green by the sea, played as
// real golf: everyone tees off, then whoever is farthest from the pin plays next, until all have
// holed out. Fewest strokes wins. Plain numbers and rules only (no drawing), so it can be tested.
//
// Game space as everywhere: x right of the tee, z downrange, metres.
import { YD } from './tuning.js'

/**
 * The hole. Its green is described like the practice green (green.js): a centre, half-widths, a
 * fringe, a base height, a tilt (rise per metre right, and downrange) and soft humps. This one
 * sits at the far end of the range, just short of the dunes, falling gently toward the sea.
 */
export const HOLE = {
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
export function nextToPlay(seats, turn, cup = HOLE.cup, live = () => true) {
  const n = seats.length
  const after = (i) => (i - turn + n) % n || n
  const far = (s) => Math.hypot(cup.x - s.ball.x, cup.z - s.ball.z)
  const left = seats.map((s, i) => ({ s, i })).filter(({ s }) => !s.done && s.ball && live(s))
  if (!left.length) return -1
  left.sort((a, b) => far(b.s) - far(a.s) || after(a.i) - after(b.i))
  return left[0].i
}

/** The scoreboard: fewest strokes first (ties keep seat order). */
export function courseStandings(seats) {
  return seats
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.strokes - b.s.strokes || a.i - b.i)
    .map(({ s }) => ({ id: s.id, name: s.name, total: s.strokes }))
}
