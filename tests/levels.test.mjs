// Difficulty levels (src/levels.js): what Easy, Normal and Pro change about a swing, a putt, the
// meter and the gimme. No browser needed. Run: node --test tests/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_LEVEL, LEVELS, levelId, levelOf } from '../src/levels.js'
import { bearing, GREEN, holeAt, HOLES, planPutt, rollPutt } from '../src/putting.js'
import { readPhoneSwing, settle } from '../src/shot.js'
import { TUNING } from '../src/tuning.js'

const FLAT = { ...GREEN, tilt: [0, 0], bumps: [] }
const from = { x: GREEN.x, z: GREEN.z - 4 }
const cup = { x: from.x, z: from.z + 4 }
/** A putt that would roll d metres on the flat, straight at a cup 4 m away, at a level. */
const straightPutt = (id, d) => {
  const P = levelOf(id).P
  return rollPutt(from, 0, Math.sqrt(2 * P.roll * d), cup, P, FLAT)
}
/** A putt dying beside the cup: `off` metres wide of its rim, rolling just past it. */
const widePutt = (id, off) => {
  const P = levelOf(id).P
  return rollPutt(from, (Math.atan2(P.cup + off, 4) * 180) / Math.PI, Math.sqrt(2 * P.roll * 4.15), cup, P, FLAT)
}

test('there are three levels, and Normal is the default', () => {
  assert.deepEqual(LEVELS, ['easy', 'normal', 'pro'])
  assert.equal(DEFAULT_LEVEL, 'normal')
  assert.deepEqual(LEVELS.map((id) => levelOf(id).label), ['Easy', 'Normal', 'Pro'])
})

test('Normal plays exactly as the game did before there were levels', () => {
  const L = levelOf('normal')
  assert.equal(L.strength, 'normal')
  assert.equal(L.assist, 'some')
  assert.equal(L.read, true)
  assert.deepEqual(L.meter, TUNING.meter)
  assert.deepEqual(L.P, TUNING.putting)
  assert.equal(L.gimme, TUNING.putting.gimme)
})

test('an unknown or missing level is played as Normal', () => {
  assert.equal(levelId('expert'), 'normal')
  assert.equal(levelId(undefined), 'normal')
  assert.equal(levelOf(null).id, 'normal')
  assert.equal(levelOf('__proto__').id, 'normal')
})

test('the same phone swing goes further on Easy and shorter on Pro', () => {
  const sw = { speed: 1100, back: 200, face: 0, path: 0 }
  const power = (id) => readPhoneSwing(sw, { strength: levelOf(id).strength }).power
  assert.ok(power('easy') > power('normal'), `${power('easy')} vs ${power('normal')}`)
  assert.ok(power('normal') > power('pro'), `${power('normal')} vs ${power('pro')}`)
  assert.equal(power('normal'), 1)
})

test('an open club face is straightened most on Easy and not at all on Pro', () => {
  const face = (id) => settle({ power: 1, face: 10, path: 0 }, { assist: levelOf(id).assist }).face
  assert.ok(face('easy') < face('normal'), `${face('easy')} vs ${face('normal')}`)
  assert.ok(face('normal') < face('pro'), `${face('normal')} vs ${face('pro')}`)
  assert.equal(face('pro'), 10 - TUNING.swing.deadzone)
})

test('Easy and Normal read the putts for you; Pro reads the green alone', () => {
  assert.equal(levelOf('easy').read, true)
  assert.equal(levelOf('normal').read, true)
  assert.equal(levelOf('pro').read, false)
})

test('a putt dying beside the cup: Easy pulls it in from further away, Pro never does', () => {
  assert.equal(widePutt('easy', 0.25).holed, true)
  assert.equal(widePutt('normal', 0.25).holed, false)
  assert.equal(widePutt('normal', 0.08).holed, true)
  assert.equal(widePutt('pro', 0.08).holed, false)
})

test('a firm putt straight at the cup: Easy still catches it, Pro needs a softer touch', () => {
  assert.equal(straightPutt('easy', 9).holed, true)
  assert.equal(straightPutt('normal', 9).holed, false)
  assert.equal(straightPutt('normal', 7).holed, true)
  assert.equal(straightPutt('pro', 7).holed, false)
  assert.equal(straightPutt('pro', 5).holed, true)
})

test('the read holes every challenge hole at every level', () => {
  for (const id of LEVELS) {
    const P = levelOf(id).P
    HOLES.forEach((_, i) => {
      const { cup, start } = holeAt(i)
      const plan = planPutt(start, cup, P)
      assert.ok(rollPutt(start, bearing(start, cup) + plan.aim, plan.speed, cup, P).holed, `${id}, hole ${i + 1}`)
    })
  }
})

test('the meter is slower with a wider sweet spot on Easy, faster and narrower on Pro', () => {
  const [easy, normal, pro] = LEVELS.map((id) => levelOf(id).meter)
  assert.ok(easy.rise > normal.rise && normal.rise > pro.rise)
  assert.ok(easy.fall > normal.fall && normal.fall > pro.fall)
  assert.ok(easy.window > normal.window && normal.window > pro.window)
  assert.equal(pro.faceAtEdge, TUNING.meter.faceAtEdge, 'the rest of the meter is shared')
})

test('the gimme is 5 ft on Easy, 3 ft on Normal and none on Pro', () => {
  assert.deepEqual(LEVELS.map((id) => levelOf(id).gimme), [5, 3, 0])
})
