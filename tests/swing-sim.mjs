// A golfer swinging a phone held like a club grip, as the phone's sensors would report it.
// The world: X toward the target for a right-hander, Y up, Z = X × Y (out toward the ball,
// away from the golfer's body). The phone at address: top pointing down the shaft to the ball,
// screen facing the golfer's eyes (over the ball), so its x axis lies along the target line.
// The swing turns the club about the swing plane's normal (back, then down through address,
// then a follow-through); the wrists roll the face open on the way back and return it to
// `face` degrees (about the shaft) at impact; `path` yaws the swing plane (degrees, + = the
// club head travels right of the target). A left-hander is the mirror image.
// Every sample is { t ms, dt s, w [x,y,z] deg/s, up [x,y,z] } in the phone's axes, like
// createPhoneMotion()'s onSample.

const D = Math.PI / 180

const mmul = (a, b) => a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]))
const mT = (a) => [0, 1, 2].map((i) => [a[0][i], a[1][i], a[2][i]])
const mv = (a, v) => a.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2])
const norm = (v) => {
  const l = Math.hypot(...v)
  return v.map((x) => x / l)
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
/** Rotation by `deg` about the unit axis n (right-hand rule). */
function rot(n, deg) {
  const [x, y, z] = norm(n)
  const c = Math.cos(deg * D)
  const s = Math.sin(deg * D)
  const k = 1 - c
  return [
    [c + x * x * k, x * y * k - z * s, x * z * k + y * s],
    [y * x * k + z * s, c + y * y * k, y * z * k - x * s],
    [z * x * k - y * s, z * y * k + x * s, c + z * z * k]
  ]
}
/** The turn from a to b as a body-frame rate (deg/s) over dt seconds. */
function rate(a, b, dt) {
  const r = mmul(mT(a), b)
  const c = Math.max(-1, Math.min(1, (r[0][0] + r[1][1] + r[2][2] - 1) / 2))
  const ang = Math.acos(c)
  if (ang < 1e-9) return [0, 0, 0]
  const k = ang / (2 * Math.sin(ang)) / D / dt
  return [(r[2][1] - r[1][2]) * k, (r[0][2] - r[2][0]) * k, (r[1][0] - r[0][1]) * k]
}
const smooth = (x) => x * x * (3 - 2 * x)

/**
 * @param {object} o
 *   hz          sensor rate (60 iPhone-ish, 100-200 Android)
 *   back        backswing size, degrees of club turn (a full swing turns the club ~250°)
 *   backTime    seconds
 *   downTime    seconds from the top to impact (speed builds all the way down)
 *   face        face at impact, degrees about the shaft (+ opens it: right for a right-hander)
 *   path        degrees the swing plane is yawed (+ = club head travels right of the target)
 *   lefty       mirror the golfer
 *   lie         shaft lean from vertical toward the ball, degrees
 *   holdTwist   the phone twisted in the hands about the shaft, degrees (a sloppy grip)
 *   roll        how far the wrists roll the face open on the way back, degrees (45; a putt: a few)
 *   noise       deg/s of gyro noise
 *   clip        gyro range, deg/s (each axis clips there)
 *   still       seconds held still at address before the backswing
 * @returns {{ samples, truth }} truth: impact time (ms), club speed at impact (deg/s), face and path (deg, + right)
 */
export function simulateSwing(o = {}) {
  const hz = o.hz ?? 100
  const back = o.back ?? 220
  const backTime = o.backTime ?? 0.85
  const downTime = o.downTime ?? 0.3
  const follow = o.follow ?? 160
  const lie = (o.lie ?? 30) * D
  const still = o.still ?? 0.4
  const mirror = o.lefty ? -1 : 1
  let seed = o.seed ?? 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1

  // Right-handed geometry, mirrored at the end for a left-hander (x → -x).
  const X = [1, 0, 0]
  const Y = [0, 1, 0]
  const shaft = [0, -Math.cos(lie), Math.sin(lie)]
  const screen = [0, Math.sin(lie), Math.cos(lie)]
  const xb = cross(shaft, screen)
  // Body → world at address: columns are the phone's x, y (top, down the shaft), z (screen).
  const R0 = mmul([[xb[0], shaft[0], screen[0]], [xb[1], shaft[1], screen[1]], [xb[2], shaft[2], screen[2]]], rot([0, 1, 0], o.holdTwist ?? 0))
  const axis = mv(rot(Y, -(o.path ?? 0)), norm(cross(shaft, X))) // + path: travel turns toward +Z (right)
  const top = 0.05
  const wDown = (2 * back) / downTime // deg/s at impact: theta = -back + back (s/downTime)^2
  const decel = (wDown * wDown) / (2 * follow)
  const tImpact = still + backTime + top + downTime
  const tEnd = tImpact + wDown / decel + 0.3
  const roll = o.roll ?? 45 // how far the wrists roll the face open on the way back (a putt: hardly)
  const swingAt = (t) => {
    if (t < still) return { th: 0, tw: 0 }
    if (t < still + backTime) {
      const p = smooth((t - still) / backTime)
      return { th: -back * p, tw: roll * p }
    }
    if (t < still + backTime + top) return { th: -back, tw: roll }
    if (t < tImpact) {
      const s = (t - still - backTime - top) / downTime
      const th = -back + back * s * s
      return { th, tw: roll + ((o.face ?? 0) - roll) * (s * s) }
    }
    const s = Math.min(t - tImpact, wDown / decel)
    return { th: wDown * s - 0.5 * decel * s * s, tw: (o.face ?? 0) - roll * 0.9 * Math.min(1, s / 0.3) }
  }
  const pose = (t) => {
    const { th, tw } = swingAt(t)
    let R = mmul(mmul(rot(axis, th), R0), rot([0, 1, 0], tw))
    if (o.lefty) {
      // Mirror the world (x → -x) and keep the phone a right-handed frame: flip its x axis.
      const M = [[-1, 0, 0], [0, 1, 0], [0, 0, 1]]
      R = mmul(mmul(M, R), M)
    }
    return R
  }
  const samples = []
  const dt = 1 / hz
  let prev = pose(0)
  for (let t = dt; t <= tEnd; t += dt) {
    const R = pose(t)
    const clip = o.clip ?? 2000
    const w = rate(prev, R, dt).map((v) => Math.max(-clip, Math.min(clip, v + rnd() * (o.noise ?? 2))))
    samples.push({ t: Math.round(t * 1000 * 100) / 100 + (o.t0 ?? 0), dt, w, up: mv(mT(R), Y) })
    prev = R
  }
  // Truth at impact, in the same terms the reader reports.
  const Ri = pose(tImpact)
  const target = [mirror, 0, 0]
  const right = cross(target, Y)
  const yaw = (v) => Math.atan2(v[0] * right[0] + v[2] * right[2], v[0] * target[0] + v[2] * target[2]) / D
  const faceNow = mv(Ri, mv(mT(pose(0)), target)) // what pointed at the target at address
  // The path is the swing plane's direction along the ground: where the club head travels
  // through the bottom of the plane (the shaft at impact sits in that plane, pointing down).
  const down = [0, -1, 0]
  const inPlane = norm(down.map((v, i) => v - axis[i] * (down[0] * axis[0] + down[1] * axis[1] + down[2] * axis[2])))
  const headDir = mv(o.lefty ? [[-1, 0, 0], [0, 1, 0], [0, 0, 1]] : [[1, 0, 0], [0, 1, 0], [0, 0, 1]], cross(axis, inPlane))
  return {
    samples,
    truth: { ms: tImpact * 1000 + (o.t0 ?? 0), speed: wDown, face: yaw(faceNow), path: yaw(headDir), hand: o.lefty ? 'L' : 'R' }
  }
}
