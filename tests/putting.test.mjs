// The putting green (src/putting.js): the ball rolling, breaking and dropping, and how a stroke
// becomes a putt. Run: node --test games/big-swing-golf/tests/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bearing, describePutt, FT, GREEN, holeAt, HOLES, planPutt, practicePutt, puttHeight, puttSpeed, puttStandings, puttStroke, readPutt, rollPutt, settlePutt, surfaceOf } from '../src/putting.js'
import { TUNING } from '../src/tuning.js'

const P = TUNING.putting
// A flat, level green for the plain physics (same size and place, no tilt or humps).
const FLAT = { ...GREEN, tilt: [0, 0], bumps: [] }
const from = { x: GREEN.x, z: GREEN.z - 4 }
const cupAhead = (m) => ({ x: from.x, z: from.z + m })
/** The speed that rolls d metres on a flat green. */
const speedFor = (d) => Math.sqrt(2 * P.roll * d)
const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} not within ${tol} of ${expected}`)

test('on a flat green a putt rolls straight and stops where its speed says', () => {
  const far = { x: from.x + 20, z: from.z } // a cup well out of the way
  const r = rollPutt(from, 0, speedFor(5), far, P, FLAT)
  assert.equal(r.holed, false)
  near(r.rest.z - from.z, 5, 0.1, 'distance rolled')
  near(r.rest.x, from.x, 0.001, 'sideways')
})

test('a putt at the right pace straight at the cup drops', () => {
  const cup = cupAhead(4)
  const r = rollPutt(from, 0, speedFor(4.3), cup, P, FLAT)
  assert.equal(r.holed, true)
  near(r.rest.x, cup.x, 1e-9, 'in the cup x')
  near(r.rest.z, cup.z, 1e-9, 'in the cup z')
  assert.ok(r.rest.y < puttHeight(cup.x, cup.z, FLAT), 'the ball ends below the green')
})

test('too firm and dead centre, it hops the cup and runs past', () => {
  const cup = cupAhead(3)
  const r = rollPutt(from, 0, speedFor(12), cup, P, FLAT)
  assert.equal(r.holed, false)
  assert.equal(r.hopped, true)
  assert.ok(r.rest.z > cup.z + 3, 'ran on past the cup')
})

test('off the very edge of the cup and too firm, it lips out, swung away', () => {
  const cup = cupAhead(3)
  // Aimed to catch the right edge of the cup, too fast to drop there.
  const edge = (Math.atan2(P.cup * 0.85, 3) * 180) / Math.PI
  const r = rollPutt(from, edge, speedFor(5), cup, P, FLAT)
  assert.equal(r.holed, false)
  assert.equal(r.lipped, true)
  assert.ok(r.rest.x > cup.x + 0.1, 'swung out to the right')
})

test('forgiving: a firm putt into the side of the cup still drops', () => {
  const cup = cupAhead(3)
  const side = (Math.atan2(P.cup * 0.7, 3) * 180) / Math.PI
  assert.equal(rollPutt(from, side, speedFor(4.2), cup, P, FLAT).holed, true)
})

test('forgiving: a ball dying just past the rim is drawn in', () => {
  const cup = cupAhead(4)
  // Rolling 4.15 m a hand's width wide of the cup: it would stop beside it.
  const wide = (Math.atan2(P.cup + 0.08, 4) * 180) / Math.PI
  assert.equal(rollPutt(from, wide, speedFor(4.15), cup, P, FLAT).holed, true)
  assert.equal(rollPutt(from, wide, speedFor(4.15), { x: cup.x + 50, z: cup.z }, P, FLAT).holed, false, 'with no cup there, it stops')
})

test('a putt clearly wide of the cup still misses', () => {
  const cup = cupAhead(4)
  const r = rollPutt(from, 9, speedFor(4.3), cup, P, FLAT)
  assert.equal(r.holed, false)
  assert.equal(r.lipped, false)
})

test('the help reads every challenge hole: its aim and pace hole the putt', () => {
  HOLES.forEach((_, i) => {
    const { cup, start } = holeAt(i)
    const plan = planPutt(start, cup)
    const r = rollPutt(start, bearing(start, cup) + plan.aim, plan.speed, cup)
    assert.ok(r.holed, `hole ${i + 1}: aim ${plan.aim}°, ${plan.speed.toFixed(2)} m/s missed`)
  })
})

test('the help aims uphill of the cup on a side slope', () => {
  const tilted = { ...FLAT, tilt: [-0.02, 0] } // lower to the right: the putt breaks right
  assert.ok(planPutt(from, cupAhead(5), P, tilted).aim < -1, 'aims left of the cup')
  assert.equal(planPutt(from, cupAhead(5), P, FLAT).aim, 0)
})

test('on a side slope the ball breaks downhill', () => {
  const tilted = { ...FLAT, tilt: [-0.02, 0] } // lower to the right
  const r = rollPutt(from, 0, speedFor(5), { x: from.x + 20, z: from.z }, P, tilted)
  assert.ok(r.rest.x > from.x + 0.3, `broke right by ${r.rest.x - from.x}`)
})

test('uphill putts come up short and downhill ones run on', () => {
  const far = { x: from.x + 20, z: from.z }
  const up = rollPutt(from, 0, speedFor(5), far, P, { ...FLAT, tilt: [0, 0.02] })
  const down = rollPutt(from, 0, speedFor(5), far, P, { ...FLAT, tilt: [0, -0.02] })
  assert.ok(up.rest.z - from.z < 4.5, 'uphill not short')
  assert.ok(down.rest.z - from.z > 5.5, 'downhill not long')
})

test('off the green the fringe slows it hard', () => {
  const edge = { x: GREEN.x, z: GREEN.z + GREEN.rz - 1 }
  const r = rollPutt(edge, 0, speedFor(6), { x: edge.x + 30, z: edge.z }, P, FLAT)
  assert.ok(r.rest.z - edge.z < 3.5, `rolled ${r.rest.z - edge.z} m through the fringe`)
  assert.notEqual(surfaceOf(r.rest.x, r.rest.z, FLAT), 'green')
})

test('every challenge hole can be holed, and its start and cup are on the green', () => {
  HOLES.forEach((_, i) => {
    const { cup, start } = holeAt(i)
    assert.equal(surfaceOf(cup.x, cup.z), 'green', `hole ${i + 1} cup`)
    assert.equal(surfaceOf(start.x, start.z), 'green', `hole ${i + 1} start`)
    let holed = false
    for (let d = -12; d <= 12 && !holed; d += 0.5) for (let v = 1; v < 5 && !holed; v += 0.05) holed = rollPutt(start, bearing(start, cup) + d, v, cup).holed
    assert.ok(holed, `hole ${i + 1} can't be holed`)
  })
})

test('practice putts cycle short, middling and long, all from the green', () => {
  let seed = 3
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let n = 0; n < 30; n++) {
    const p = practicePutt(n, rand)
    const ft = readPutt(p.start, p.cup).feet
    const [lo, hi] = [[2.5, 4], [4, 7], [7, 11]][n % 3].map((m) => m / FT)
    assert.ok(ft >= lo - 0.01 && ft <= hi + 0.01, `putt ${n}: ${ft} ft`)
    assert.equal(surfaceOf(p.start.x, p.start.z), 'green')
  }
})

test('the backstroke sets how far it rolls, in proportion: halfway back rolls half a full bar', () => {
  const big = { ...FLAT, rx: 40, rz: 40 }
  const range = 6 // m: a full bar for this putt
  const v = (back, strength) => puttSpeed({ how: 'phone', speed: 400, back }, { strength, range })
  const rolls = (speed) => rollPutt(from, 0, speed, { x: from.x + 20, z: from.z }, P, big).rest.z - from.z
  near(rolls(v(P.backFull)), range, 0.05, 'a full backstroke (m)')
  near(rolls(v(P.backFull / 2)), range / 2, 0.05, 'halfway back (m)')
  near(rolls(v(P.backFull / 4)), range / 4, 0.05, 'a quarter (m)')
  assert.ok(v(10, 'easy') > v(10) && v(10, 'strong') < v(10), '"Swing power needed" scales it')
})

test('the bar is scaled to the putt, so a 3-footer and a 30-footer take the same stroke, and a 2° wobble costs under a foot on a 3-footer', () => {
  const big = { ...FLAT, rx: 40, rz: 40 }
  const rolls = (speed) => (rollPutt(from, 0, speed, { x: from.x + 20, z: from.z }, P, big).rest.z - from.z) / FT
  for (const feet of [3, 30]) {
    const range = feet * FT * 2 // twice the putt
    const half = rolls(puttSpeed({ how: 'phone', speed: 400, back: P.backFull / 2 }, { range }))
    near(half, feet, 0.2, `halfway back on a ${feet}-footer (ft)`)
  }
  const range = 3 * FT * 2
  const wobble = rolls(puttSpeed({ how: 'phone', speed: 400, back: P.backFull / 2 + 2 }, { range })) - 3
  assert.ok(Math.abs(wobble) < 1, `2° more on a 3-footer: ${wobble.toFixed(2)} ft further`)
})

test('a putting through-stroke too gentle for the backstroke comes up softer', () => {
  const range = 6
  const st = puttStroke('normal', { range })
  const back = P.backFull / 2
  const needed = 0.5 * st.full * P.commit
  near(puttSpeed({ how: 'phone', speed: needed, back }, { range }) ** 2, (st.vFull ** 2) / 2, 1e-9, 'committed: half the bar')
  near(puttSpeed({ how: 'phone', speed: needed / 2, back }, { range }) ** 2, (st.vFull ** 2) / 4, 1e-9, 'half as fast as it needed: a quarter')
})

test('the meter, flick and pad putt by power: power 1 is a full bar', () => {
  // With no putt to scale to, a full bar rolls P.full feet on a flat green (a big one: that's off the end of ours).
  const far = { x: from.x + 20, z: from.z }
  const r = rollPutt(from, 0, puttSpeed({ how: 'meter', power: 1 }), far, P, { ...FLAT, rx: 40, rz: 40 })
  near((r.rest.z - from.z) / FT, P.full, 1, 'full meter putt (ft)')
  const half = rollPutt(from, 0, puttSpeed({ how: 'meter', power: 0.5 }, { range: 4 }), far, P, { ...FLAT, rx: 40, rz: 40 })
  near(half.rest.z - from.z, 2, 0.05, 'half power on a 4 m bar (m)')
})

test('small face errors count as square, and help shrinks the rest', () => {
  assert.equal(settlePutt({ face: 0.3 }).face, 0)
  assert.ok(Math.abs(settlePutt({ face: 4 }, { assist: 'lots' }).face) < Math.abs(settlePutt({ face: 4 }).face))
  assert.equal(settlePutt({ face: 40 }).face, P.maxFace)
})

test('a miss is described against the line: short or long, left or right', () => {
  const cup = cupAhead(4)
  assert.equal(describePutt(from, { x: cup.x, z: cup.z - 0.6 }, cup, false).text, '2.0 ft short')
  assert.equal(describePutt(from, { x: cup.x - 0.3, z: cup.z + 0.3 }, cup, false).text, '1.0 ft long, 1.0 ft left')
  assert.equal(describePutt(from, cup, cup, true).text, 'Holed!')
})

test('the Putting challenge ranks fewest putts first', () => {
  const order = puttStandings([
    { id: 'a', name: 'A', card: [2, 3, 2] },
    { id: 'b', name: 'B', card: [1, 2, 2] },
    { id: 'c', name: 'C', card: [2, 2, 3] }
  ])
  assert.deepEqual(order.map((r) => r.id), ['b', 'a', 'c'])
  assert.deepEqual(order.map((r) => r.total), [5, 7, 7])
})
