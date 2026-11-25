// The course's own ground, south of the driving range: a stretch of coast with a headland and a
// bay, hills inland, and valleys mown through them for the holes. Plain numbers (no drawing), shared
// by the ball's physics and the scenery through terrain.js. Game space: x right of the range's tee,
// z downrange, metres; the course lies at z below about −80.
import { APRON, distToLine, ellipseReach, FAIRWAY_HALF, HOLES } from './course.js'
import { greenReach } from './green.js'

/** Where the range's ground gives way to the course's: all range above FROM, all course below TO. */
export const LINKS = { from: -55, to: -80 }

const smooth = (a, b, v) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * The shore, north to south: the land is to its west. It runs down from the range's own shore,
 * cuts in for the bay, out round the headland (the lighthouse is on its tip), and back along the
 * cliff the first hole follows.
 */
export const COAST = [
  [83, -40], [80, -107], [70, -139], [60, -161], [60, -184], [83, -203], [115, -207], [151, -200], [193, -203], [220, -221], [220, -252], [180, -273],
  [118, -293], [37, -330], [-36, -388], [-91, -500], [-150, -640], [-150, -1200]
]
/** The sea as a closed shape: the shore, closed far out to the east. */
const SEA = [...COAST, [1500, -1200], [1500, -40]]

/** Signed distance (m) to the shore: positive on land, negative out at sea. */
export function shoreDistance(x, z) {
  let d = Infinity
  for (let i = 0; i + 1 < COAST.length; i++) {
    const [ax, az] = COAST[i]
    const [bx, bz] = COAST[i + 1]
    const dx = bx - ax
    const dz = bz - az
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
    d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t))
  }
  let wet = false
  for (let i = 0, j = SEA.length - 1; i < SEA.length; j = i++) {
    const [xi, zi] = SEA[i]
    const [xj, zj] = SEA[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) wet = !wet
  }
  return wet ? -d : d
}

/** The hills: soft mounds { x, z, rx, rz, h }. The holes' valleys are cut through them. */
export const HILLS = [
  { x: -170, z: -150, rx: 100, rz: 72, h: 20 }, // the big one, north-west: the third hole runs under it
  { x: -52, z: -222, rx: 44, rz: 56, h: 12 }, // inside the third hole's bend
  { x: -190, z: -268, rx: 44, rz: 62, h: 15 }, // west of the pond
  { x: -84, z: -92, rx: 66, rz: 30, h: 9 }, // between the course and the range
  { x: 60, z: -250, rx: 46, rz: 26, h: 5 }, // a low rise inside the first hole's bend
  { x: -200, z: -420, rx: 60, rz: 60, h: 14 } // behind the clubhouse
]

/** Gentle rolls everywhere off the mown ground: 0 to about 1.8 m. */
const rolls = (x, z) => 0.9 + 0.6 * Math.sin(x * 0.045 + z * 0.03) + 0.3 * Math.sin(z * 0.07 - x * 0.02 + 1)
/** The far hills that close the view, inland to the west and beyond the clubhouse to the south. */
const farHills = (x, z) => 14 + 6 * Math.sin(x * 0.021 + z * 0.013) + 4 * Math.sin(z * 0.029 - x * 0.017 + 1.3)

/**
 * How far (m) a point is from anything that has to lie flat: a fairway, a green and its apron, a
 * tee, a bunker or a pond. 0 on them.
 */
export function mownDistance(x, z) {
  let d = Infinity
  for (const h of HOLES) {
    if (h.fairway.length) d = Math.min(d, distToLine(x, z, h.fairway) - FAIRWAY_HALF)
    d = Math.min(d, (greenReach(x, z, h.green) - APRON) * Math.min(h.green.rx, h.green.rz))
    d = Math.min(d, Math.hypot(x - h.tee.x, z - h.tee.z) - 6)
    for (const e of [...h.sand, ...h.water]) d = Math.min(d, (ellipseReach(x, z, e) - 1) * Math.min(e.rx, e.rz) - 2)
  }
  return Math.max(0, d)
}

/**
 * The course's land (m), without its greens: 0 on everything mown, rolling up into the hills away
 * from it, a strip of beach, then down under the sea.
 */
export function linksHeight(x, z) {
  const shore = shoreDistance(x, z)
  if (shore <= 0) return -0.6 - smooth(0, 5, -shore) * 0.9 - smooth(4, 60, -shore) * 3.4
  const open = smooth(2, 34, mownDistance(x, z)) // 0 on the mown ground, 1 well away from it
  let h = rolls(x, z) * 0.7
  for (const m of HILLS) {
    const e = Math.hypot((x - m.x) / m.rx, (z - m.z) / m.rz)
    if (e < 1) h += m.h * (1 - smooth(0.15, 1, e))
  }
  h += (smooth(-230, -330, x) + smooth(-470, -570, z)) * farHills(x, z)
  // Level by the shore, then the beach dips to the water's edge.
  return h * open * smooth(6, 40, shore) - 0.6 * (1 - smooth(0, 7, shore))
}

/** Down in a pond (m, 0 outside): deep enough to be water, with a short bank. */
export function pondDip(x, z) {
  for (const h of HOLES) for (const e of h.water) {
    const r = ellipseReach(x, z, e)
    if (r < 1) return -3 * smooth(1, 0.88, r)
  }
  return 0
}

/**
 * How the ball lies on the course's ground (greens aside, which terrain.js checks first):
 * 'water' | 'bunker' | 'sand' (a beach) | 'fairway' | 'hill' | 'rough'.
 */
export function linksLie(x, z) {
  const shore = shoreDistance(x, z)
  if (shore < -1.5) return 'water'
  for (const h of HOLES) for (const e of h.water) if (ellipseReach(x, z, e) < 1) return 'water'
  for (const h of HOLES) for (const e of h.sand) if (ellipseReach(x, z, e) < 1) return e.rx * e.rz > 250 ? 'sand' : 'bunker'
  if (shore < 7) return 'sand'
  for (const h of HOLES) {
    if (h.fairway.length && distToLine(x, z, h.fairway) < FAIRWAY_HALF) return 'fairway'
    if (greenReach(x, z, h.green) < APRON) return 'fairway'
  }
  return linksHeight(x, z) > 3 ? 'hill' : 'rough'
}
