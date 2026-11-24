// The ground of the ocean resort, as a height (metres) at any point, shared by the ball's
// physics and the scenery. The range itself (fairway, rough and the strip beside them) is flat;
// beyond it the land rolls up into hills on the left, and slopes down through dunes and a beach
// into the sea on the right and past the far end. Game space: x right of the tee, z downrange.
import { TUNING, YD } from './tuning.js'
import { HOLE } from './course.js'
import { greenHeight, greenSurface } from './green.js'

export const SEA_LEVEL = -1.1
/** Half-width of the fairway (m) this far downrange: it fans out. */
export const fairwayHalf = (z, R = TUNING.range) => R.fairway + Math.max(0, z) * R.fairwayGrow
const END = () => TUNING.range.length * YD // the back of the range (m)
const smooth = (a, b, v) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Rolling hills: a few slow sine waves, always above ground (about 6–26 m). */
const hills = (x, z) => 15 + 6 * Math.sin(x * 0.021 + z * 0.013) + 4 * Math.sin(z * 0.029 - x * 0.017 + 1.3) + 2 * Math.sin(x * 0.05 + 2.1)
/** Little dunes along the shore. */
const dunes = (x, z) => 0.9 + 0.6 * Math.sin(z * 0.11 + x * 0.05) + 0.4 * Math.sin(z * 0.23 - 1)

/** Ground height at (x, z), metres. 0 on the range; under SEA_LEVEL is water. */
export const groundHeight = (x, z) => landHeight(x, z) + greenHeight(x, z, HOLE.green)

/**
 * The land without the course's green (the scenery's big ground mesh, which is too coarse to
 * shape a green: the green is its own mesh on top).
 */
export function landHeight(x, z) {
  const edge = fairwayHalf(Math.max(0, z)) + 18 // the rough's outer edge
  const left = -x - edge
  const right = x - edge
  const back = z - (END() + 14)
  let h = 0
  // Left: hills rise over 70 m.
  if (left > 0) h += smooth(0, 70, left) * hills(x, z)
  // Right and far end: dunes, then the beach slopes into the sea.
  const shore = Math.max(right, back)
  if (shore > 0) h += smooth(0, 10, shore) * (1 - smooth(18, 34, shore)) * dunes(x, z) - smooth(24, 70, shore) * 4.5
  // Behind the tee: a low grassy bank closes the view.
  if (z < -12) h += smooth(-12, -40, z) * 3
  return h
}

/**
 * How the ball lies at a point, for the course and the ball's bounce and roll: 'green' | 'fringe'
 * (the course's green) | 'fairway' (the mown range) | 'rough' (beside it) | 'hill' | 'sand' | 'water'.
 */
export function lieAt(x, z) {
  if (groundHeight(x, z) < SEA_LEVEL) return 'water'
  const g = greenSurface(x, z, HOLE.green)
  if (g !== 'off') return g
  const s = surfaceAt(x, z)
  if (s !== 'range') return s
  return Math.abs(x) <= fairwayHalf(Math.max(0, z)) && z > -8 ? 'fairway' : 'rough'
}

/** What's under a point: 'range' | 'hill' | 'sand' | 'water'. */
export function surfaceAt(x, z) {
  const h = groundHeight(x, z)
  if (h < SEA_LEVEL) return 'water'
  const edge = fairwayHalf(Math.max(0, z)) + 18
  if (x - edge > 14 || z - (END() + 14) > 14) return h < 0.8 ? 'sand' : 'hill'
  if (-x - edge > 0) return 'hill'
  return 'range'
}
