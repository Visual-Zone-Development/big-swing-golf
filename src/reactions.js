// How a bean's body moves when it reacts (characters.js plays these on both bean builds). Written to
// pushplay-kit's animate-asset principles: anticipation before a hop (a crouch), a real gravity arc
// in the air (stretched going up, a hang at the top), a squash on landing that settles with a small
// overshoot, eased droops and flinches, and every reaction ending exactly at rest so nothing snaps
// when it hands back to the idle breathing.
//
// reactionPose(kind, t) → { hop (m off the ground), sy (height squash: 1 = rest; the caller keeps the
// volume), spin (rad about the bean's up axis), tilt (rad forward), done }.

export const REACTIONS = {
  // A hop is: crouch (anticipation) → air (height h, cartoon gravity g) → land (squash, settle).
  gravity: 16, // m/s², a little floatier than real so a hop reads from the couch
  cheer: { crouch: 0.14, hops: [0.42, 0.16], spin: true, squash: 0.8, duration: 1.6 },
  happy: { crouch: 0.1, hops: [0.2], spin: false, squash: 0.88, duration: 1.2 },
  sad: { droop: 0.12, tilt: 0.25, in: 0.35, hold: 1.25, out: 0.4, duration: 2 },
  wince: { flinch: 0.07, tilt: -0.12, in: 0.08, hold: 0.8, out: 0.5, shake: 0.03, duration: 1.6 }
}

const REST = { hop: 0, sy: 1, spin: 0, tilt: 0, done: true }
const clamp01 = (x) => Math.min(1, Math.max(0, x))
const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
const easeOut = (x) => 1 - Math.pow(1 - x, 3)
/** A squash that springs back: 1 at k = 0, 0 by k = 1, with a small overshoot on the way. */
const settle = (k) => (k >= 1 ? 0 : Math.cos(k * Math.PI * 1.5) * Math.pow(1 - k, 2))

/** How long a hop of height h stays in the air. */
const airTime = (h, g) => 2 * Math.sqrt((2 * h) / g)

/**
 * The hop reactions, as one continuous timeline: a crouch; each hop takes off out of the squat into a
 * stretch, flies a real arc (stretched while fast, round at the top) and hits with a squash; between
 * hops the squash is the next take-off's anticipation; the last landing springs back to rest with a
 * small overshoot. The first hop carries the spin.
 */
function hops(R, t, g) {
  const STRETCH = 0.14
  const TAKEOFF = 0.1 // s to go from the squat into the stretch
  const IMPACT = 0.11 // s to go from the stretch into the squash
  const SETTLE = 0.4 // s for the last squash to spring back
  const crouch = (1 - R.squash) * 0.7
  const spun = R.spin ? Math.PI * 2 : 0
  // The spin starts with the first hop and finishes into its landing (follow-through), so it reads.
  const spinning = (t) => (R.spin ? spun * easeInOut(clamp01((t - R.crouch) / (airTime(R.hops[0], g) * 1.3))) : 0)
  if (t < R.crouch) {
    const k = easeInOut(t / R.crouch)
    return { hop: 0, sy: 1 - crouch * k, spin: 0, tilt: 0.04 * k, done: false }
  }
  let at = R.crouch
  let from = 1 - crouch
  for (let i = 0; i < R.hops.length; i++) {
    const h = R.hops[i]
    const size = Math.min(1, h / 0.3)
    const air = airTime(h, g)
    const v0 = Math.sqrt(2 * g * h)
    if (t < at + air) {
      const k = t - at
      const stretch = 1 + STRETCH * size * (Math.abs(v0 - g * k) / v0)
      const sy = from + (stretch - from) * easeInOut(clamp01(k / TAKEOFF))
      const tilt = (i === 0 ? 0.04 : 0) * (1 - easeInOut(clamp01(k / TAKEOFF)))
      return { hop: Math.max(0, v0 * k - 0.5 * g * k * k), sy, spin: spinning(t), tilt, done: false }
    }
    at += air
    const last = i === R.hops.length - 1
    const touch = 1 + STRETCH * size
    const squash = 1 - (1 - R.squash) * size
    if (last || t < at + IMPACT + 0.05) {
      const k = t - at
      const sy = k < IMPACT ? touch + (squash - touch) * easeInOut(k / IMPACT) : last ? 1 - (1 - squash) * settle(clamp01((k - IMPACT) / SETTLE)) : squash
      return { hop: 0, sy, spin: spinning(t), tilt: 0, done: false }
    }
    at += IMPACT + 0.05
    from = squash
  }
  return { ...REST, spin: spun }
}

/** An eased pose in, a hold, an eased way back to rest. */
function hold(R, t) {
  return t < R.in ? easeOut(t / R.in) : t < R.in + R.hold ? 1 : 1 - easeInOut(clamp01((t - R.in - R.hold) / R.out))
}

export function reactionPose(kind, t) {
  const R = REACTIONS[kind]
  if (!R || t >= R.duration) return { ...REST, spin: R?.spin ? Math.PI * 2 : 0 }
  if (kind === 'cheer' || kind === 'happy') return hops(R, t, REACTIONS.gravity)
  const w = hold(R, t)
  if (kind === 'sad') {
    // Droop down and forward, and let out one slow sigh partway through.
    const sigh = Math.sin(clamp01((t - R.in) / R.hold) * Math.PI) * 0.025
    return { hop: 0, sy: 1 - (R.droop + sigh) * w, spin: 0, tilt: R.tilt * w, done: false }
  }
  // Wince: a sharp flinch back with a quick tremble that dies away.
  const shake = Math.sin(t * 55) * R.shake * Math.max(0, 1 - t / 0.5) * w
  return { hop: 0, sy: 1 - R.flinch * w, spin: shake, tilt: R.tilt * w, done: false }
}
