// The ground of the ocean resort, as a height (metres) at any point, shared by the ball's
// physics and the scenery. The range itself (fairway, rough and the strip beside them) is flat;
// beyond it the land rolls up into hills on the left, and slopes down through dunes and a beach
// into the sea on the right and past the far end. Game space: x right of the tee, z downrange.
import { TUNING, YD } from './tuning.js'
import { HOLES } from './course.js'
import { greenHeight, greenSurface } from './green.js'
import { LINKS, linksHeight, linksLie, pondDip } from './links.js'

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

/** How much of the ground at this z is the course's (links.js): 0 on the range, 1 on the course. */
const onLinks = (z) => smooth(LINKS.from, LINKS.to, z)

/** Ground height at (x, z), metres. 0 on the range and on the course's mown ground; under SEA_LEVEL is water. */
export const groundHeight = (x, z) => {
  let h = landHeight(x, z)
  for (const hole of HOLES) h += greenHeight(x, z, hole.green)
  return z < LINKS.from ? h + pondDip(x, z) : h
}

/**
 * The land without the course's greens and ponds (the scenery's big ground meshes, which are too
 * coarse to shape them: they are their own meshes on top). The range's land north of the course's,
 * blended where they meet behind the range's tee.
 */
export function landHeight(x, z) {
  const w = onLinks(z)
  if (w >= 1) return linksHeight(x, z)
  return w <= 0 ? rangeHeight(x, z) : rangeHeight(x, z) * (1 - w) + linksHeight(x, z) * w
}

/** The range's own land: flat, hills to the left, the shore to the right and past the far end. */
function rangeHeight(x, z) {
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
 * (any of the course's greens) | 'fairway' | 'rough' | 'hill' | 'sand' (a beach) | 'bunker' | 'water'.
 */
export function lieAt(x, z) {
  for (const hole of HOLES) {
    const g = greenSurface(x, z, hole.green)
    if (g !== 'off') return g
  }
  if (onLinks(z) > 0.5) return linksLie(x, z)
  if (groundHeight(x, z) < SEA_LEVEL) return 'water'
  const s = surfaceAt(x, z)
  if (s !== 'range') return s
  return Math.abs(x) <= fairwayHalf(Math.max(0, z)) && z > -8 ? 'fairway' : 'rough'
}

/** What's under a point: 'range' | 'hill' | 'sand' | 'water'. */
export function surfaceAt(x, z) {
  const h = groundHeight(x, z)
  if (h < SEA_LEVEL) return 'water'
  if (onLinks(z) > 0.5) {
    const lie = linksLie(x, z)
    return lie === 'sand' || lie === 'hill' || lie === 'water' ? lie : 'range'
  }
  const edge = fairwayHalf(Math.max(0, z)) + 18
  if (x - edge > 14 || z - (END() + 14) > 14) return h < 0.8 ? 'sand' : 'hill'
  if (-x - edge > 0) return 'hill'
  return 'range'
}
