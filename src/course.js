// The course: three holes on their own ground south of the driving range, played as real golf:
// everyone tees off, then whoever is farthest from the pin plays next, until all have holed out;
// then on to the next tee. Fewest strokes over the round wins. Plain numbers and rules only (no
// drawing), so it can be tested. The ground itself (coast, hills) is links.js.
//
// Game space as everywhere: x right of the range's tee, z downrange, metres. The course lies
// behind the range (z below −100): the sea to the east, the hills to the west.
import { YD } from './tuning.js'

/**
 * The holes, in the order they're played: a loop out from the clubhouse and back.
 *   tee, cup: {x, z}
 *   green: described like the practice green (green.js): a centre, half-widths, a fringe, a base
 *     height, a tilt (rise per metre along +x, and along +z) and soft humps
 *   fairway: the mown line from the tee to the green, as points (a par 3 has none: its green has
 *     an apron); `via` is where the tee shot is aimed, and clubbed for, on a hole that bends
 *   sand: bunkers, each an ellipse { x, z, rx, rz, rot (degrees, +x toward +z) } with a lobed,
 *     irregular edge (trapEdge); beaches are the shore's (links.js)
 *   water: ponds, the same way with a gentler edge (the sea is links.js's coast)
 */
export const HOLES = [
  {
    // Along the clifftop out to the headland, bending right, the sea all down the right and the
    // lighthouse behind the green.
    name: 'Lighthouse Point',
    par: 4,
    tee: { x: -95, z: -366 },
    via: { x: 112, z: -267 }, // where a full drive comes down, round the bend
    fairway: [{ x: -95, z: -366 }, { x: 23, z: -298 }, { x: 151, z: -253 }],
    green: {
      x: 151,
      z: -253,
      rx: 13.5,
      rz: 12,
      fringe: 0.22,
      base: 0.3,
      tilt: [-0.012, -0.01], // falls toward the sea, to the east and south
      bumps: [
        { x: -5, z: 3, h: 0.14, r: 3 }, // a shoulder on the way in
        { x: 4, z: -4, h: -0.1, r: 3.2 } // a hollow by the cliff
      ]
    },
    cup: { x: 154, z: -251 },
    sand: [
      { x: 5, z: -277, rx: 13.5, rz: 7, rot: 28 }, // left of where drives land
      { x: 129, z: -240, rx: 8.5, rz: 5, rot: 35 }, // short left of the green
      { x: 174, z: -247, rx: 5, rz: 8.5, rot: 0 } // beyond it
    ],
    water: []
  },
  {
    // From the headland across the bay to a green on the beach, the huts behind it.
    name: 'Beach Hut Bay',
    par: 3,
    tee: { x: 147, z: -220 },
    fairway: [],
    green: {
      x: 23,
      z: -161,
      rx: 12,
      rz: 11,
      fringe: 0.22,
      base: 0.35,
      tilt: [0.014, 0.008], // rises away from the tee, toward the huts
      bumps: [
        { x: 4, z: -3, h: 0.12, r: 2.8 },
        { x: -4, z: 3, h: -0.09, r: 3 }
      ]
    },
    cup: { x: 21, z: -160 },
    // The beach between the bay and the green is the shore's own sand (links.js), wider here.
    sand: [
      { x: 2, z: -145, rx: 7.5, rz: 4.6, rot: -30 }, // a pot bunker behind
      { x: 5, z: -174, rx: 6, rz: 4.2, rot: 40 } // and one short left
    ],
    water: []
  },
  {
    // Back inland down a valley between the hills, bending left, to a green by the clubhouse
    // with a pond across its front.
    name: 'Shady Hill',
    par: 4,
    tee: { x: -25, z: -132 },
    via: { x: -120, z: -236 }, // a lay-up past the bend, short of the pond; the pin is a driver away over the hill
    fairway: [{ x: -25, z: -132 }, { x: -118, z: -207 }, { x: -123, z: -326 }],
    green: {
      x: -123,
      z: -326,
      rx: 13,
      rz: 12,
      fringe: 0.24,
      base: 0.45,
      tilt: [0.012, 0.01], // falls toward the front left
      bumps: [
        { x: 3, z: 0, h: 0.16, r: 3 }, // a ridge through the middle
        { x: -5, z: -4, h: -0.1, r: 2.8 }
      ]
    },
    cup: { x: -125, z: -328 },
    sand: [
      { x: -138, z: -203, rx: 7.5, rz: 13.5, rot: -35 }, // on the outside of the bend
      { x: -99, z: -329, rx: 5, rz: 9, rot: 0 }, // left of the green
      { x: -130, z: -348, rx: 8.5, rz: 4.6, rot: 0 } // behind it
    ],
    water: [{ x: -136, z: -288, rx: 23, rz: 12, rot: 0 }] // carry it, lay up, or skirt it on the left
  }
]

for (const h of HOLES) {
  for (const e of h.sand) e.wobble ??= 1
  for (const e of h.water) e.wobble ??= 0.45
}

/**
 * A trap's edge isn't a plain oval: how far out it reaches (1 = the ellipse) in the direction
 * `a` (radians, in the ellipse's own axes). Lobes of 2, 3 and 5 to a turn, different for every trap.
 */
export function trapEdge(e, a) {
  const k = e.x * 0.37 + e.z * 0.61
  return 1 + (e.wobble ?? 0) * (0.17 * Math.sin(3 * a + k) + 0.09 * Math.sin(2 * a + k * 1.7) + 0.05 * Math.sin(5 * a + k * 0.6))
}

/** How far out of a trap (or any ellipse) a point is: < 1 inside. */
export function ellipseReach(x, z, e) {
  const a = ((e.rot ?? 0) * Math.PI) / 180
  const u = ((x - e.x) * Math.cos(a) + (z - e.z) * Math.sin(a)) / e.rx
  const v = (-(x - e.x) * Math.sin(a) + (z - e.z) * Math.cos(a)) / e.rz
  return Math.hypot(u, v) / (e.wobble ? trapEdge(e, Math.atan2(v, u)) : 1)
}

/** A trap's outline as n points in game space ({x, z}), pushed `grow` metres outward. */
export function trapOutline(e, n = 64, grow = 0) {
  const r = ((e.rot ?? 0) * Math.PI) / 180
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const f = trapEdge(e, a)
    const u = (e.rx * f + grow) * Math.cos(a)
    const v = (e.rz * f + grow) * Math.sin(a)
    pts.push({ x: e.x + u * Math.cos(r) - v * Math.sin(r), z: e.z + u * Math.sin(r) + v * Math.cos(r) })
  }
  return pts
}

/** Distance (m) from a point to a line of points. */
export function distToLine(x, z, pts) {
  let best = Infinity
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)))
    best = Math.min(best, Math.hypot(x - a.x - dx * t, z - a.z - dz * t))
  }
  return best
}

/** Half the width of a mown fairway (m), and how far round a green its apron is mown (in reach). */
export const FAIRWAY_HALF = 16
export const APRON = 1.75

/** The course as a whole. */
export const COURSE = { name: 'Seaside', par: HOLES.reduce((a, h) => a + h.par, 0) }

/** A hole's length in yards, along its fairway from the tee to the pin (straight, on a par 3). */
export function holeYards(h) {
  const pts = h.fairway.length ? [...h.fairway.slice(0, -1), h.cup] : [h.tee, h.cup]
  let m = 0
  for (let i = 0; i + 1 < pts.length; i++) m += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z)
  return Math.round(m / YD)
}

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
