// The phone's swing reader (createSwingReader in public/controller.html), fed the sensor stream
// of a simulated golfer (swing-sim.mjs). Run: node --test games/big-swing-golf/tests/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { simulateSwing } from './swing-sim.mjs'
import { TUNING } from '../src/tuning.js'

const html = readFileSync(join(import.meta.dirname, '../public/controller.html'), 'utf8')
const block = html.slice(html.indexOf('// ==== swing reader'), html.indexOf('// ==== end swing reader'))
const createSwingReader = new Function(`${block}; return createSwingReader`)()

/** Holds SET from the first sample (armAt ms later) and returns the first shot read, if any. */
function swing(opts, { armAt = 0, release = Infinity, cfg = {} } = {}) {
  const { samples, truth } = simulateSwing(opts)
  const r = createSwingReader(() => cfg)
  let shot = null
  for (const s of samples) {
    if (!r.armed && s.t >= armAt && s.t < release) r.arm()
    if (r.armed && s.t >= release) r.disarm()
    shot ??= r.push(s)
  }
  return { shot, truth }
}
const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} not within ${tol} of ${expected}`)

test('a square, on-plane swing reads as square with the club speed at impact', () => {
  const { shot, truth } = swing({})
  assert.ok(shot, 'no shot read')
  near(shot.face, 0, 1.5, 'face')
  near(shot.path, 0, 1.5, 'path')
  near(shot.speed, truth.speed, truth.speed * 0.06, 'speed')
  near(shot.ms, truth.ms, 12, 'impact time')
  assert.equal(shot.hand, 'R')
})

test('an open face at impact reads as pointing right of the target', () => {
  for (const face of [4, 10, 18]) {
    const { shot, truth } = swing({ face })
    near(shot.face, truth.face, 1.5, `face ${face}`)
    assert.ok(shot.face > 0)
  }
})

test('a closed face reads as pointing left', () => {
  const { shot, truth } = swing({ face: -9 })
  near(shot.face, truth.face, 1.5, 'face')
  assert.ok(shot.face < 0)
})

test('a swing path across the line reads its direction', () => {
  for (const path of [-8, 6]) {
    const { shot, truth } = swing({ path })
    near(shot.path, truth.path, 1.5, `path ${path}`)
    near(shot.face, truth.face, 1.5, `face with path ${path}`)
  }
})

test('a left-hander is read the same way, mirrored', () => {
  const { shot, truth } = swing({ lefty: true, face: 7 })
  assert.equal(shot.hand, 'L')
  near(shot.face, truth.face, 1.5, 'face')
  near(shot.path, truth.path, 1.5, 'path')
  near(shot.speed, truth.speed, truth.speed * 0.06, 'speed')
})

test('the face reading does not depend on how the phone is twisted in the hands', () => {
  const { shot, truth } = swing({ holdTwist: 25, face: 6 })
  near(shot.face, truth.face, 2, 'face')
})

test('works at the 60 readings a second an iPhone sends', () => {
  const { shot, truth } = swing({ hz: 60, face: -5 })
  near(shot.face, truth.face, 2, 'face')
  near(shot.speed, truth.speed, truth.speed * 0.1, 'speed')
  near(shot.ms, truth.ms, 20, 'impact time')
})

test('a harder swing reads faster, a gentle one slower', () => {
  const soft = swing({ back: 120, downTime: 0.4 }).shot
  const hard = swing({ back: 240, downTime: 0.26 }).shot
  assert.ok(hard.speed > soft.speed * 2, `${hard.speed} vs ${soft.speed}`)
})

test('a swing faster than the gyro can measure still hits, at its fastest moment', () => {
  const { shot } = swing({ back: 260, downTime: 0.22, clip: 1000 })
  assert.ok(shot, 'no shot read')
  assert.ok(shot.speed >= 900, `speed ${shot.speed}`)
})

test('letting go of SET before the downswing takes no shot', () => {
  const { samples } = simulateSwing({})
  const top = samples.find((s) => s.t > 1250).t // during the backswing
  assert.equal(swing({}, { release: top }).shot, null)
})

test('a backswing that stops and waits is a waggle: the real swing after it still reads', () => {
  const r = createSwingReader(() => ({}))
  r.arm()
  // A small waggle, held still, then a full swing.
  const waggle = simulateSwing({ back: 40, backTime: 0.3, downTime: 0.3, still: 0.2 }).samples.filter((s) => s.t < 650)
  let shot = null
  for (const s of waggle) shot ??= r.push(s)
  const end = waggle.at(-1)
  for (let i = 1; i <= 60; i++) shot ??= r.push({ t: end.t + i * 10, dt: 0.01, w: [0, 0, 0], up: end.up })
  assert.equal(shot, null, 'the waggle took a shot')
  const real = simulateSwing({ face: 5, t0: end.t + 600 })
  for (const s of real.samples) shot ??= r.push(s)
  assert.ok(shot, 'the swing after the waggle was missed')
})

test('the live angle shows the backswing growing, then coming down', () => {
  const { samples } = simulateSwing({ back: 200 })
  const r = createSwingReader(() => ({}))
  r.arm()
  let most = 0
  for (const s of samples) {
    r.push(s)
    if (r.phase === 'back') most = Math.max(most, r.angle)
  }
  near(most, 200, 15, 'backswing angle')
})

// ---- putting: a small, slow pendulum stroke, read with the putting green's reader settings ----
const PUTT = TUNING.putting.reader
const stroke = (o) => ({ back: 12, backTime: 0.55, downTime: 0.36, follow: 18, roll: 3, noise: 1, ...o })

test('a putting stroke reads with the putter settings: its speed and a square face', () => {
  const { shot, truth } = swing(stroke({}), { cfg: PUTT })
  assert.ok(shot, 'no putt read')
  near(shot.speed, truth.speed, truth.speed * 0.08, 'speed')
  near(shot.face, 0, 1, 'face')
  near(shot.ms, truth.ms, 20, 'impact time')
})

test('a longer putting stroke reads faster, and an open face reads right', () => {
  const short = swing(stroke({ back: 8 }), { cfg: PUTT }).shot
  const long = swing(stroke({ back: 22, downTime: 0.42 }), { cfg: PUTT }).shot
  assert.ok(short && long, 'a putt was missed')
  assert.ok(long.speed > short.speed * 1.6, `long ${long.speed} vs short ${short.speed}`)
  const open = swing(stroke({ face: 3 }), { cfg: PUTT })
  near(open.shot.face, open.truth.face, 1, 'open face')
})

test('the full-swing settings ignore a putting stroke: the putting green needs its own', () => {
  const { shot } = swing(stroke({}), { cfg: TUNING.swing.reader })
  assert.equal(shot, null)
})
