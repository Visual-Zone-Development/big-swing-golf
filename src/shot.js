// From a swing to a ball in the air. The phone reads club speed, face and path (degrees,
// + = right of the target line); a controller's meter, a mouse flick or the phone's touch pad
// give power and face directly. Here they become the ball: power sets the distance (a full
// swing carries the club's distance), the face sets where it starts, face minus path sets the
// curve, and the result gets a name (Straight!, Draw, Slice, Push fade…).
import { TUNING, YD } from './tuning.js'
import { simulate, speedFor } from './flight.js'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

/**
 * The power of a phone swing (or putting stroke): the backswing sets it, the downswing delivers it.
 * back: degrees back; speed: club speed at impact (deg/s); backFull: degrees back for power 1;
 * full: club speed (deg/s) of a power-1 swing. A downswing at `commit` of the speed the backswing
 * asked for, or faster, delivers all of it; slower and it's softer in proportion (lazy). With no
 * backswing reading (an older phone page), power is club speed alone.
 */
export function strokePower({ back, speed }, { backFull, full, commit = TUNING.swing.commit, maxBack = TUNING.swing.maxBack }) {
  const sp = Math.max(0, Number(speed) || 0)
  if (!Number.isFinite(Number(back)) || back === null) return { power: sp / full, want: sp / full, lazy: false }
  const want = Math.min(Math.max(0, Number(back)) / backFull, maxBack)
  const needed = want * full * commit
  const lazy = sp < needed
  return { power: lazy ? (want * sp) / needed : want, want, lazy }
}

/** A phone swing { speed deg/s, back deg, face, path, hand } → { power, face, path, mph, hand, lazy }. */
export function readPhoneSwing(sw, { strength = 'normal', T = TUNING.swing } = {}) {
  const full = T.full[strength] ?? T.full.normal
  const backFull = T.backFull[strength] ?? T.backFull.normal
  const speed = Math.max(0, Number(sw.speed) || 0)
  const { power, lazy } = strokePower({ back: sw.back, speed }, { backFull, full, commit: T.commit, maxBack: T.maxBack })
  return {
    power,
    lazy,
    face: Number(sw.face) || 0,
    path: (Number(sw.path) || 0) * T.pathWeight,
    mph: Math.round(speed * T.mphPerDps),
    hand: sw.hand === 'L' ? 'L' : 'R'
  }
}

/**
 * Straighten and clamp: small errors count as square, "Straight shot help" scales the rest,
 * and swinging past full power makes the face wilder.
 */
export function settle({ power, face, path }, { assist = 'off', T = TUNING.swing } = {}) {
  const k = T.assist[assist] ?? 1
  const p = clamp(power, 0, T.maxPower)
  const wild = 1 + Math.max(0, power - 1) * T.overswingWild
  const tidy = (v, max) => {
    const a = Math.abs(v) <= T.deadzone ? 0 : (Math.abs(v) - T.deadzone) * Math.sign(v)
    return clamp(a * k, -max, max)
  }
  return { power: Math.max(T.minPower, p), face: tidy(face * wild, T.maxFace), path: tidy(path, T.maxPath), over: power > 1 }
}

/** The shot's name, from where it started and how it curved (+ = right), for this hand. */
export function shapeName(start, curve, hand = 'R') {
  const s = hand === 'L' ? -1 : 1 // a left-hander's slice curves left
  const c = curve * s
  const st = start * s
  const bend = Math.abs(c) < 2.5 ? '' : Math.abs(c) < 7 ? (c > 0 ? 'Fade' : 'Draw') : c > 0 ? 'Slice' : 'Hook'
  const line = Math.abs(st) < 3 ? '' : st > 0 ? 'Push' : 'Pull'
  if (!bend && !line) return 'Straight!'
  if (bend && line) return `${line} ${bend.toLowerCase()}`
  return bend || line
}

/** Softer swings fly a little lower. */
const launchAt = (club, power) => club.launch * (0.85 + 0.15 * Math.min(1, power))
const speedCache = new Map()
/** Ball speed for this club and power (carry = power × the club's distance), cached per 1%. */
function ballSpeed(club, power) {
  const p = Math.round(power * 100) / 100
  const key = `${club.id}:${p}`
  if (!speedCache.has(key)) speedCache.set(key, speedFor(club, club.carry * p, launchAt(club, p)))
  return speedCache.get(key)
}

/**
 * The ball: { speed, launch, dir, tilt } plus its whole flight (simulate()) and a summary in yards.
 * aim is the player's aim (deg from downrange, + right); face and path are relative to it.
 * o.from: where it's struck (the tee by default); o.cup: a hole it can roll into.
 */
export function strike({ power, face, path }, club, aim = 0, hand = 'R', B = TUNING.ball, { from = null, cup = null } = {}) {
  const start = B.startShare * face + (1 - B.startShare) * path
  const curve = face - path
  const ball = { speed: ballSpeed(club, power), launch: launchAt(club, Math.round(power * 100) / 100), dir: aim + start, tilt: clamp(curve * B.curvePerDeg, -B.maxTilt, B.maxTilt) }
  const flight = simulate(ball, club, B, { from, cup })
  const aimRad = (aim * Math.PI) / 180
  const ox = from?.x ?? 0
  const oz = from?.z ?? 0
  // Offline: how far the ball came to rest from the aim line (yards, + right).
  const offline = (p) => ((p.x - ox) * Math.cos(aimRad) - (p.z - oz) * Math.sin(aimRad)) / YD
  return {
    ...ball,
    flight,
    start,
    curve,
    shape: shapeName(start, curve, hand),
    carry: Math.round(Math.hypot(flight.carry.x - ox, flight.carry.z - oz) / YD),
    total: Math.round(Math.hypot(flight.rest.x - ox, flight.rest.z - oz) / YD),
    offline: Math.round(offline(flight.rest)) || 0,
    apex: Math.round(flight.apex / YD)
  }
}
