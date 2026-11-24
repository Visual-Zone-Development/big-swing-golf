// From a swing to a ball: distances, curves, names and target scoring. No browser needed.
// Run: node --test games/seaside-swing/tests/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CLUBS, TUNING, YD } from '../src/tuning.js'
import { readPhoneSwing, settle, shapeName, strike, strokePower } from '../src/shot.js'
import { scoreLanding, standings } from '../src/targets.js'

const club = (id) => CLUBS.find((c) => c.id === id)
const square = { power: 1, face: 0, path: 0 }

test('a full, square swing carries each club its listed distance, straight', () => {
  for (const c of CLUBS) {
    const s = strike(square, c)
    assert.ok(Math.abs(s.carry - c.carry) <= 2, `${c.name} carried ${s.carry}, not ${c.carry}`)
    assert.ok(s.total >= s.carry, `${c.name} rolled backwards`)
    assert.equal(s.offline, 0)
    assert.equal(s.shape, 'Straight!')
  }
})

test('the longer the club, the further it goes', () => {
  const carries = CLUBS.map((c) => strike(square, c).carry)
  for (let i = 1; i < carries.length; i++) assert.ok(carries[i] < carries[i - 1], carries.join(' > '))
})

test('a half swing goes about half as far', () => {
  const s = strike({ power: 0.5, face: 0, path: 0 }, club('7i'))
  assert.ok(Math.abs(s.carry - 155 / 2) <= 3, `carried ${s.carry}`)
})

test('an open face starts right and curves right; a closed one goes left', () => {
  const open = strike({ power: 1, face: 6, path: 0 }, club('dr'))
  const shut = strike({ power: 1, face: -6, path: 0 }, club('dr'))
  assert.ok(open.offline > 15, `open face finished ${open.offline} yd right`)
  assert.ok(shut.offline < -15, `closed face finished ${shut.offline} yd left`)
})

test('aiming turns the whole shot: a straight shot aimed 10° right finishes on that line', () => {
  const s = strike(square, club('7i'), 10)
  const angle = (Math.atan2(s.flight.rest.x, s.flight.rest.z) * 180) / Math.PI
  assert.ok(Math.abs(angle - 10) < 0.5, `finished at ${angle.toFixed(1)}°`)
  assert.equal(s.offline, 0)
})

test('shots are named by how they start and curve, mirrored for left-handers', () => {
  assert.equal(shapeName(0, 0), 'Straight!')
  assert.equal(shapeName(0, 4), 'Fade')
  assert.equal(shapeName(0, 10), 'Slice')
  assert.equal(shapeName(0, -4), 'Draw')
  assert.equal(shapeName(0, -10), 'Hook')
  assert.equal(shapeName(5, 0), 'Push')
  assert.equal(shapeName(-5, -10), 'Pull hook')
  assert.equal(shapeName(0, -10, 'L'), 'Slice')
  assert.equal(shapeName(-5, 0, 'L'), 'Push')
})

test('the backswing sets the power, and a committed downswing delivers all of it', () => {
  const full = { speed: 1050, back: 200, face: 0, path: 0, hand: 'R' }
  assert.equal(readPhoneSwing(full).power, 1)
  assert.equal(readPhoneSwing({ ...full, back: 100 }).power, 0.5)
  // Swinging down harder than the backswing needs adds nothing: the bar is the power.
  assert.equal(readPhoneSwing({ ...full, back: 100, speed: 1400 }).power, 0.5)
  // Just committed: half the full speed for that power is enough.
  assert.equal(readPhoneSwing({ ...full, speed: 525 }).power, 1)
  assert.equal(readPhoneSwing({ ...full, speed: 525 }).lazy, false)
})

test('a downswing too lazy for the backswing is softer in proportion, and says so', () => {
  const lazy = readPhoneSwing({ speed: 262.5, back: 200, face: 0, path: 0 })
  assert.equal(lazy.lazy, true)
  assert.equal(lazy.power, 0.5) // half the speed it needed
})

test('an overswing tops out a little past full', () => {
  assert.equal(readPhoneSwing({ speed: 1500, back: 400, face: 0, path: 0 }).power, TUNING.swing.maxBack)
})

test('"Swing power needed" sets how far back a full swing is', () => {
  const sw = { speed: 1400, back: 160, face: 0, path: 0 }
  assert.equal(readPhoneSwing(sw, { strength: 'easy' }).power, 1)
  assert.equal(readPhoneSwing(sw, { strength: 'strong' }).power, 160 / 240)
})

test('strokePower: with no backswing reading (an older phone page), club speed is the power', () => {
  assert.equal(strokePower({ speed: 525 }, { backFull: 200, full: 1050 }).power, 0.5)
})

test('a phone swing turns into power by the Swing power setting', () => {
  const sw = { speed: 1050, face: 2, path: 4, hand: 'R' }
  assert.equal(readPhoneSwing(sw).power, 1)
  assert.ok(readPhoneSwing(sw, { strength: 'easy' }).power > 1.3)
  assert.ok(readPhoneSwing(sw, { strength: 'strong' }).power < 0.8)
  assert.equal(readPhoneSwing(sw).path, 4 * TUNING.swing.pathWeight)
})

test('small errors count as square, and Straight shot help shrinks the rest', () => {
  assert.equal(settle({ power: 1, face: 1.2, path: -1 }).face, 0)
  const off = settle({ power: 1, face: 10, path: 0 }, { assist: 'off' }).face
  const lots = settle({ power: 1, face: 10, path: 0 }, { assist: 'lots' }).face
  assert.ok(lots < off / 2, `${lots} vs ${off}`)
})

test('swinging past full power goes a little further but wilder', () => {
  const over = settle({ power: 1.3, face: 4, path: 0 })
  assert.equal(over.power, TUNING.swing.maxPower)
  assert.ok(over.face > settle({ power: 1, face: 4, path: 0 }).face)
})

test('target challenge: a bullseye on a far green scores more than one on a near green', () => {
  const [near, , , , far] = TUNING.targets.greens
  const at = (g, dx = 0) => ({ x: (g.side + dx) * YD, z: g.yards * YD })
  const a = scoreLanding(at(near))
  const b = scoreLanding(at(far))
  assert.equal(a.name, 'Bullseye!')
  assert.equal(a.points, 30)
  assert.equal(b.points, 90)
  assert.equal(scoreLanding(at(far, 5)).name, 'Inner ring')
  assert.equal(scoreLanding(at(far, 10)).name, 'On the green')
  const miss = scoreLanding({ x: 40 * YD, z: 150 * YD })
  assert.equal(miss.points, 0)
  assert.equal(miss.green, -1)
})

test('the scoreboard ranks players by their total', () => {
  const seats = [
    { id: 'a', name: 'Ada', shots: [{ points: 20 }, { points: 0 }] },
    { id: 'b', name: 'Bo', shots: [{ points: 45 }] },
    { id: 'c', name: 'Cy', shots: [] }
  ]
  assert.deepEqual(standings(seats).map((r) => [r.name, r.total]), [['Bo', 45], ['Ada', 20], ['Cy', 0]])
})

test('a drive lands, hops twice and runs out, trickling to a stop rather than stopping dead', () => {
  const r = strike({ power: 1, face: 0, path: 0 }, CLUBS[0], 0)
  const f = r.flight
  const after = f.points.filter((q) => q.t >= f.carry.t)
  let hops = 0
  for (let i = 1; i < after.length - 1; i++) if (after[i].y > after[i - 1].y && after[i].y > after[i + 1].y) hops++
  assert.ok(hops >= 2, `${hops} hops`)
  const roll = r.total - r.carry
  assert.ok(roll >= 15 && roll <= 35, `rolled ${roll} yd`)
  // The last metre takes a good while: it eases out.
  const last = after.find((q) => Math.hypot(q.x - f.rest.x, q.z - f.rest.z) < 1)
  assert.ok(f.rest.t - last.t > 0.6, `last metre in ${(f.rest.t - last.t).toFixed(2)} s`)
})
