// The putting green: a sloped green just in front of the tee, a cup, and the ball rolling on it.
// Everything here is plain numbers (no drawing), so it can be tested on its own.
//
// The green is an ellipse with a gentle tilt and a few soft humps and hollows; around it a fringe
// slopes down to the range. A putt starts at a speed (m/s) in a direction (degrees, 0 = downrange,
// + = right) and rolls: the green's friction slows it, the slope pulls it downhill (the break).
// At the cup it drops if it's slow enough for how close to the middle it came; a bit too fast and
// near the edge it lips out; much too fast and it hops over.
//
// Game space as everywhere: x right of the tee, z downrange, metres. Distances on screen in feet.
import { TUNING } from './tuning.js'
import { strokePower } from './shot.js'
import { greenHeight, greenReach as reachOf, greenSurface } from './green.js'

export const FT = 0.3048
const G_ACC = 9.81

/** The green: centre, half-widths, height and shape. */
export const GREEN = {
  x: 1,
  z: 26,
  rx: 10.5, // half-width across (m)
  rz: 9, // half-length downrange (m)
  fringe: 0.2, // the fringe reaches this much further out (a fraction of the size)
  base: 0.22, // the green sits this high above the range
  tilt: [-0.016, 0.011], // falls to the right, rises toward the back
  bumps: [
    { x: 4, z: 3, h: 0.16, r: 3.2 }, // a ridge on the back right
    { x: -5, z: -1, h: -0.12, r: 3 }, // a hollow on the left
    { x: -2, z: 5, h: 0.1, r: 2.5 } // a little crown at the back
  ]
}

/**
 * The Putting challenge's nine holes: where the cup is and where everyone starts, in metres from
 * the green's middle. Short ones and long ones, straight ones and big breakers, all putting
 * roughly downrange (the sea behind the cup).
 */
export const HOLES = [
  { cup: [0, 4], start: [-1, -3] },
  { cup: [4, 3], start: [-3, -2] },
  { cup: [-5, 2], start: [-1, -1] },
  { cup: [2, -1], start: [-2, -6] },
  { cup: [-3, 5], start: [3, -4] },
  { cup: [6, -2], start: [1, -5] },
  { cup: [0, 6], start: [0, 2.5] },
  { cup: [-6, -2], start: [-1, -7] },
  { cup: [3, 5.5], start: [-4, -5] }
]

/** A hole of HOLES in game space: { cup: {x, z}, start: {x, z} }. */
export function holeAt(i, G = GREEN) {
  const h = HOLES[((i % HOLES.length) + HOLES.length) % HOLES.length]
  return { cup: { x: G.x + h.cup[0], z: G.z + h.cup[1] }, start: { x: G.x + h.start[0], z: G.z + h.start[1] } }
}

/** How far out from the middle a point is: < 1 on the green, < 1 + fringe on the fringe. */
export const greenReach = (x, z, G = GREEN) => reachOf(x, z, G)

/** Height (m) of the ground at (x, z) around the green: the green, its fringe sloping down, then the range. */
export const puttHeight = (x, z, G = GREEN) => greenHeight(x, z, G)

/** 'green' | 'fringe' | 'off'. */
export const surfaceOf = (x, z, G = GREEN) => greenSurface(x, z, G)

/** The way downhill and how steep (rise over run) at a point. */
export function slopeAt(x, z, G = GREEN) {
  const d = 0.05
  const gx = (puttHeight(x + d, z, G) - puttHeight(x - d, z, G)) / (2 * d)
  const gz = (puttHeight(x, z + d, G) - puttHeight(x, z - d, G)) / (2 * d)
  return { gx, gz, steep: Math.hypot(gx, gz) }
}

/** The direction (degrees, 0 = downrange, + right) from a to b. */
export const bearing = (a, b) => (Math.atan2(b.x - a.x, b.z - a.z) * 180) / Math.PI

/**
 * Roll a putt. from {x, z}, dir degrees (0 = downrange, + right), speed m/s, cup {x, z}.
 * Returns { points: [{t, x, y, z}], rest: {t, x, y, z}, holed, lipped, hopped, length } where y
 * is the ball's centre and t is seconds.
 */
export function rollPutt(from, dir, speed, cup, P = TUNING.putting, G = GREEN) {
  const dt = 1 / 240
  const R = P.cup
  const rb = TUNING.ball.radius
  const a = (dir * Math.PI) / 180
  let x = from.x
  let z = from.z
  let vx = Math.sin(a) * speed
  let vz = Math.cos(a) * speed
  let t = 0
  let length = 0
  let holed = false
  let lipped = false
  let hopped = false
  let overCup = false // inside the cup's rim now (one meeting per pass)
  const points = [{ t: 0, x, y: puttHeight(x, z, G) + rb, z }]
  const friction = (sx, sz) => P.roll * ({ green: 1, fringe: P.fringeDrag, off: P.offDrag }[surfaceOf(sx, sz, G)] ?? 1)
  for (let i = 1; i < 240 * 30; i++) {
    const sl = slopeAt(x, z, G)
    const pull = (5 / 7) * G_ACC // a rolling ball feels 5/7 of the slope's pull
    let ax = -pull * sl.gx
    let az = -pull * sl.gz
    // Near the cup and slow: the cup draws it in (forgiving, so near misses drop).
    const toCup = Math.hypot(cup.x - x, cup.z - z)
    if (toCup < P.pull.r && toCup > 1e-6 && Math.hypot(vx, vz) < P.pull.speed) {
      const k = (P.pull.acc * (1 - toCup / P.pull.r)) / toCup
      ax += (cup.x - x) * k
      az += (cup.z - z) * k
    }
    const v = Math.hypot(vx, vz)
    const f = friction(x, z)
    // Stopped: too slow to keep going, and the slope can't start it again.
    if (v < P.stop && Math.hypot(ax, az) < f) {
      vx = vz = 0
      break
    }
    // Friction slows it along its way (never past a stop); the slope pulls it downhill.
    const slow = v > 1e-6 ? Math.min(v, f * dt) / v : 0
    vx = vx - vx * slow + ax * dt
    vz = vz - vz * slow + az * dt
    x += vx * dt
    z += vz * dt
    t += dt
    length += Math.hypot(vx, vz) * dt
    // The cup: the ball's centre passes over the hole.
    const cx = x - cup.x
    const cz = z - cup.z
    const d = Math.hypot(cx, cz)
    if (d < R && !overCup) {
      overCup = true
      const sp = Math.hypot(vx, vz)
      // How far from the middle it's travelling: the closer, the faster it can go and still drop.
      const off = sp > 1e-6 ? Math.abs(cx * vz - cz * vx) / sp : 0
      const catchSpeed = P.catch * Math.sqrt(Math.max(0, 1 - (off / R) ** 2))
      if (sp <= catchSpeed) {
        holed = true
        break
      }
      const side = Math.sign(cx * vz - cz * vx) || 1 // which side of the middle it's passing
      if (off > R * P.lipEdge && sp < catchSpeed * P.lipRange + 0.4) {
        // Lip out: the rim swings it round and out, slower.
        lipped = true
        turn(side * P.lipTurn * (1 - (off / R) * 0.4), P.lipKeep)
      } else {
        // Much too fast: it hops over, a little off line.
        hopped = true
        turn(side * 6 * (off / R), P.hopKeep)
      }
    } else if (d >= R) overCup = false
    if (i % 4 === 0) points.push({ t, x, y: puttHeight(x, z, G) + rb, z })
    if (greenReach(x, z, G) > 1.8) break
  }
  function turn(deg, keep) {
    const r = (deg * Math.PI) / 180
    const c = Math.cos(r)
    const s = Math.sin(r)
    ;[vx, vz] = [(vx * c + vz * s) * keep, (-vx * s + vz * c) * keep]
  }
  // The ball drops: a little fall into the cup.
  if (holed) {
    x = cup.x
    z = cup.z
    const y0 = puttHeight(x, z, G) + rb
    points.push({ t: t + 0.05, x, y: y0 - rb, z }, { t: t + 0.15, x, y: y0 - rb * 2.5, z })
    t += 0.15
  }
  const rest = holed ? points[points.length - 1] : { t, x, y: puttHeight(x, z, G) + rb, z }
  if (!holed) points.push(rest)
  return { points, rest, holed, lipped, hopped, length }
}

/**
 * A putting stroke's settings for strokePower(), scaled to the putt: a full backstroke (backFull
 * degrees, by the player's level) rolls `range` metres on the flat, and the distance
 * goes in proportion to the backstroke, so halfway back rolls half of it. The game sets the range
 * to twice the putt, so the middle of the bar is the cup whether it's 3 ft or 30: the same stroke
 * for every putt, and a wobble of a degree or two costs the same small share of any of them.
 * full is the club speed (deg/s) that rolls a full one; the through-stroke has to reach `commit`
 * of the speed its backstroke asks for. The phone's bar uses the same numbers (party.public.swing).
 */
export function puttStroke(strength = 'normal', { range, P = TUNING.putting, T = TUNING.swing } = {}) {
  const k = (T.backFull[strength] ?? T.backFull.normal) / T.backFull.normal
  const r = range ?? P.full * FT
  const vFull = Math.sqrt(2 * P.roll * r)
  return { backFull: P.backFull * k, full: (vFull / P.mpsPerDps) * k, vFull, range: r, commit: P.commit }
}

/**
 * How the stroke becomes the ball's speed (m/s). A phone stroke: the backstroke sets how far it
 * rolls (in proportion, up to `range` m for a full one), if the through-stroke commits to it
 * (strokePower). Anything else: power, where 1 rolls `range` m. On the flat.
 */
export function puttSpeed({ how, speed, back, power }, { strength = 'normal', range, P = TUNING.putting } = {}) {
  const st = puttStroke(strength, { range, P })
  if (how === 'phone' && Number.isFinite(speed)) return Math.sqrt(strokePower({ back, speed }, st).power) * st.vFull
  const dist = Math.max(0, Math.min(power ?? 0, 1.2)) * st.range
  return Math.sqrt(2 * P.roll * dist)
}

/** Small face errors count as square; "Straight putt help" scales the rest; never wilder than maxFace. */
export function settlePutt({ face = 0, path = 0 }, { assist = 'off', P = TUNING.putting, T = TUNING.swing } = {}) {
  const k = T.assist[assist] ?? 1
  const tidy = (v) => {
    const a = Math.abs(v) <= P.deadzone ? 0 : (Math.abs(v) - P.deadzone) * Math.sign(v)
    return Math.max(-P.maxFace, Math.min(P.maxFace, a * k))
  }
  return { face: tidy(face), path: tidy(path) }
}

/** Where the ball starts rolling relative to the aim (degrees): almost all face. */
export const startLine = ({ face, path }, P = TUNING.putting) => face * P.faceShare + path * (1 - P.faceShare)

/**
 * How it finished, against the line from where it was putted to the cup: { left: feet from the
 * cup, long: feet past (+) or short (-), side: feet right (+) or left (-), text }.
 */
export function describePutt(from, rest, cup, holed) {
  if (holed) return { left: 0, long: 0, side: 0, text: 'Holed!' }
  const a = (bearing(from, cup) * Math.PI) / 180
  const dx = rest.x - cup.x
  const dz = rest.z - cup.z
  const long = (dx * Math.sin(a) + dz * Math.cos(a)) / FT
  const side = (dx * Math.cos(a) - dz * Math.sin(a)) / FT
  const left = Math.hypot(dx, dz) / FT
  const ft = (v) => (Math.abs(v) < 10 ? Math.abs(v).toFixed(1) : String(Math.round(Math.abs(v))))
  const parts = []
  if (Math.abs(long) >= 0.3) parts.push(`${ft(long)} ft ${long > 0 ? 'long' : 'short'}`)
  if (Math.abs(side) >= 0.3) parts.push(`${ft(side)} ft ${side > 0 ? 'right' : 'left'}`)
  return { left, long, side, text: parts.length ? parts.join(', ') : 'Right by the cup' }
}

/** The read for a putt: feet to the cup, inches up (+) or down (-). */
export function readPutt(from, cup, G = GREEN) {
  const dist = Math.hypot(cup.x - from.x, cup.z - from.z) / FT
  const rise = (puttHeight(cup.x, cup.z, G) - puttHeight(from.x, from.z, G)) / 0.0254
  return { feet: dist, rise }
}

/**
 * The help's read of a putt: the aim (degrees off the straight line to the cup, + right) and the
 * ball speed (m/s) that roll it into the cup at a good pace (P.planPast beyond it), break and
 * slope included. Found by rolling it: pace by halving, then aim by how far it passes the cup.
 */
export function planPutt(from, cup, P = TUNING.putting, G = GREEN) {
  const line = bearing(from, cup)
  const dist = Math.hypot(cup.x - from.x, cup.z - from.z)
  const a = (line * Math.PI) / 180
  const ux = Math.sin(a)
  const uz = Math.cos(a)
  const nowhere = { x: cup.x + 1e4, z: cup.z + 1e4 } // a roll with no cup to drop into
  let aim = 0
  let speed = Math.sqrt(2 * P.roll * (dist + P.planPast))
  for (let k = 0; k < 6; k++) {
    let lo = 0.1
    let hi = 9
    let r
    for (let i = 0; i < 14; i++) {
      speed = (lo + hi) / 2
      r = rollPutt(from, line + aim, speed, nowhere, P, G)
      const along = (r.rest.x - from.x) * ux + (r.rest.z - from.z) * uz
      if (along < dist + P.planPast) lo = speed
      else hi = speed
    }
    // Where it passes the cup: right of it (+) or left, at the closest point.
    let best = Infinity
    let side = 0
    for (const p of r.points) {
      const d = Math.hypot(p.x - cup.x, p.z - cup.z)
      if (d < best) {
        best = d
        side = (p.x - cup.x) * uz - (p.z - cup.z) * ux
      }
    }
    if (best < 0.01) break
    aim -= (Math.atan2(side, dist) * 180) / Math.PI
  }
  return { aim: Math.round(aim * 10) / 10, speed }
}

/** The roll a putt would take at this aim and the help's pace (no cup), for the guide line. */
export function previewPutt(from, dir, speed, P = TUNING.putting, G = GREEN) {
  return rollPutt(from, dir, speed, { x: from.x + 1e4, z: from.z + 1e4 }, P, G).points
}

/** A practice putt: one of the holes, from a spot short / middling / long (by n), on the green. */
export function practicePutt(n, rand = Math.random, G = GREEN) {
  const bands = [
    [2.5, 4],
    [4, 7],
    [7, 11]
  ]
  const [lo, hi] = bands[n % bands.length]
  for (let k = 0; k < 40; k++) {
    const { cup } = holeAt(Math.floor(rand() * HOLES.length), G)
    const dist = lo + rand() * (hi - lo)
    const a = ((rand() - 0.5) * 110 * Math.PI) / 180 // within 55° of putting downrange
    const start = { x: cup.x - Math.sin(a) * dist, z: cup.z - Math.cos(a) * dist }
    if (greenReach(start.x, start.z, G) < 0.85) return { cup, start }
  }
  return holeAt(n, G)
}

/** The Putting challenge's scoreboard: fewest putts first (ties keep seat order). */
export function puttStandings(seats) {
  return seats
    .map((s, i) => ({ s, i, total: (s.card ?? []).reduce((a, x) => a + x, 0) }))
    .sort((a, b) => a.total - b.total || a.i - b.i)
    .map(({ s, total }) => ({ id: s.id, name: s.name, total }))
}
