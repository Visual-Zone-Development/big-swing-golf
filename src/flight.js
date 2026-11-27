// The ball's flight, bounce and roll, worked out in one go when it's struck, so the game knows
// where it lands and stops before it is drawn. Space: x to the right of the tee, y up, z
// downrange, metres. Gravity, drag and backspin lift (fading over the flight); the spin axis
// tilts to curve it. Arcade: each club is calibrated so a full, square swing carries its
// listed distance (calibrate()), whatever the drag and lift numbers are.
import { TUNING, YD } from './tuning.js'
import { fairwayHalf, groundHeight, lieAt, SEA_LEVEL } from './terrain.js'

const STEP = 1 / 120
const RECORD = 2 // keep every 2nd step: 60 points a second for drawing

export { fairwayHalf }

/**
 * @param {object} shot { speed m/s, launch deg up, dir deg (+ right), tilt deg spin-axis tilt (+ curves right) }
 * @param {object} club a row of CLUBS
 * The ground is terrain.js's: balls land on the hills, roll back down their slopes, and stop dead in the sea.
 * o.from: where it's struck ({x, z}; the tee by default, where it sits on a tee); o.cup: a hole
 *   ({x, z}) a rolling ball can drop into, if it's slow enough (a chip-in).
 * @returns {{ points: {t,x,y,z}[], carry: {x,y,z,t}, rest: {x,y,z,t}, apex: number, rough: boolean, water: boolean, holed: boolean }}
 */
export function simulate(shot, club, B = TUNING.ball, { from = null, cup = null } = {}) {
  const la = (shot.launch * Math.PI) / 180
  const di = (shot.dir * Math.PI) / 180
  const ti = ((shot.tilt ?? 0) * Math.PI) / 180
  let x = from?.x ?? 0
  let z = from?.z ?? 0
  let y = groundHeight(x, z) + (from ? B.radius : 0.13) // on the tee, or sitting on the grass
  let vx = shot.speed * Math.cos(la) * Math.sin(di)
  let vy = shot.speed * Math.sin(la)
  let vz = shot.speed * Math.cos(la) * Math.cos(di)
  let t = 0
  let carry = null
  let apex = 0
  let rolling = false
  let rolledFor = 0 // seconds on the ground
  let rough = false
  let water = false
  let holed = false
  const P = TUNING.putting
  const isRough = (lie) => lie !== 'fairway' && lie !== 'green' && lie !== 'fringe'
  const isSand = (lie) => lie === 'sand' || lie === 'bunker'
  let sand = false
  const points = [{ t, x, y, z }]
  for (let n = 1; n < 60 * 120; n++) {
    if (!rolling) {
      const v = Math.hypot(vx, vy, vz)
      const lift = club.lift * v * v * Math.exp(-t / B.spinFade)
      // "Up" across the flight, and "right" across it (levelled).
      const h = Math.hypot(vx, vz) || 1
      const ux = (-vy * vx) / (v * h)
      const uy = h / v
      const uz = (-vy * vz) / (v * h)
      const rx = vz / h
      const rz = -vx / h
      const ax = -B.drag * v * vx + lift * (Math.cos(ti) * ux + Math.sin(ti) * rx)
      const ay = -B.gravity - B.drag * v * vy + lift * Math.cos(ti) * uy
      const az = -B.drag * v * vz + lift * (Math.cos(ti) * uz + Math.sin(ti) * rz)
      vx += ax * STEP
      vy += ay * STEP
      vz += az * STEP
      x += vx * STEP
      y += vy * STEP
      z += vz * STEP
      apex = Math.max(apex, y)
      const g = groundHeight(x, z)
      if (y <= Math.max(g, SEA_LEVEL) && vy < 0) {
        if (g < SEA_LEVEL) {
          // Splash: the sea keeps it.
          y = SEA_LEVEL
          water = true
          carry ??= { x, y, z, t: t + STEP }
          t += STEP
          points.push({ t, x, y, z })
          break
        }
        y = g
        const lie = lieAt(x, z)
        rough = isRough(lie)
        sand = isSand(lie)
        carry ??= { x, y, z, t: t + STEP }
        // Sand swallows it: no bounce, and almost all its pace gone.
        const keep = sand ? B.sandKeep : club.land * (rough ? 0.8 : 1)
        vy = sand ? 0 : -vy * (rough ? B.roughBounce : B.bounce)
        vx *= keep
        vz *= keep
        if (vy < B.hopMin) {
          vy = 0
          rolling = true
        }
      }
    } else {
      const g = groundHeight(x, z)
      const lie = lieAt(x, z)
      rough = isRough(lie)
      sand = isSand(lie)
      // On a slope, gravity pulls it downhill.
      const gx = (groundHeight(x + 0.5, z) - groundHeight(x - 0.5, z)) / 1
      const gz = (groundHeight(x, z + 0.5) - groundHeight(x, z - 0.5)) / 1
      vx -= B.gravity * gx * 0.6 * STEP
      vz -= B.gravity * gz * 0.6 * STEP
      const v = Math.hypot(vx, vz)
      // Rolling drag eases off as it slows, so it trickles the last bit rather than stopping dead.
      const ease = B.rollEase + (1 - B.rollEase) * Math.min(1, v / B.rollEaseBelow)
      const nv = v - (club.roll + (sand ? B.sandRoll : rough ? B.roughRoll : 0)) * ease * STEP
      rolledFor += STEP
      // It stops when it's slow and the slope can't beat the grass's grip (or it has rolled long
      // enough: on rolling hills it would otherwise rock in a dip, or creep, for a minute).
      const grip = club.roll + (sand ? B.sandRoll : rough ? B.roughRoll : 0)
      const pull = B.gravity * 0.6 * Math.hypot(gx, gz)
      if ((nv <= B.stopSpeed && pull <= grip) || rolledFor > B.maxRoll) {
        t += STEP
        points.push({ t, x, y: g, z })
        break
      }
      if (v > 0) {
        vx *= Math.max(0, nv) / v
        vz *= Math.max(0, nv) / v
      }
      x += vx * STEP
      z += vz * STEP
      y = groundHeight(x, z)
      // Rolling over the cup slowly enough: it drops (a chip-in).
      if (cup && Math.hypot(x - cup.x, z - cup.z) < P.cup && nv < P.catch) {
        holed = true
        x = cup.x
        z = cup.z
        y = groundHeight(x, z) - 0.08
        t += STEP
        points.push({ t, x, y, z })
        break
      }
      if (y < SEA_LEVEL) {
        y = SEA_LEVEL
        water = true
        t += STEP
        points.push({ t, x, y, z })
        break
      }
    }
    t += STEP
    if (n % RECORD === 0) points.push({ t, x, y, z })
  }
  const last = points[points.length - 1]
  return { points, carry: carry ?? { x: last.x, y: last.y, z: last.z, t: last.t }, rest: { x: last.x, y: last.y, z: last.z, t: last.t }, apex, rough, water, holed }
}

/** Ball speed (m/s) at which this club, struck square at this launch, carries `yards`. */
export function speedFor(club, yards, launch = club.launch) {
  let lo = 3
  let hi = 140
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2
    const c = simulate({ speed: mid, launch, dir: 0, tilt: 0 }, club).carry
    if (c.z / YD < yards) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Where a point lands, in yards: { out (downrange), side (+ right) }. */
export const toYards = (p) => ({ out: p.z / YD, side: p.x / YD })
