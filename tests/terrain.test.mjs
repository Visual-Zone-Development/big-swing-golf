// The resort's ground: a flat range, hills on the left, the sea on the right and past the far
// end, and balls that land on it. No browser needed. Run: node --test games/big-swing-golf/tests/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HOLES } from '../src/course.js'
import { greenSurface } from '../src/green.js'
import { CLUBS, TUNING, YD } from '../src/tuning.js'
import { simulate } from '../src/flight.js'
import { fairwayHalf, groundHeight, SEA_LEVEL, surfaceAt } from '../src/terrain.js'

const driver = CLUBS[0]

test('the whole range is flat, out to the rough and to the back of it (apart from the course’s greens)', () => {
  for (let z = 0; z <= TUNING.range.length * YD; z += 20) {
    for (const x of [-fairwayHalf(z) - 15, 0, fairwayHalf(z) + 15]) {
      if (HOLES.some((h) => greenSurface(x, z, h.green) !== 'off')) continue // the course's greens sit raised
      assert.equal(groundHeight(x, z), 0, `not flat at x ${x.toFixed(0)}, z ${z}`)
      assert.equal(surfaceAt(x, z), 'range')
    }
  }
})

test('hills rise on the left; the sea lies off the right side and past the far end', () => {
  assert.ok(groundHeight(-200, 100) > 5, 'no hills on the left')
  assert.equal(surfaceAt(-200, 100), 'hill')
  assert.ok(groundHeight(250, 100) < SEA_LEVEL, 'no sea on the right')
  assert.equal(surfaceAt(250, 100), 'water')
  assert.ok(groundHeight(0, TUNING.range.length * YD + 120) < SEA_LEVEL, 'no sea past the end')
})

test('a big slice off the right side splashes into the sea and stays there', () => {
  const f = simulate({ speed: 78, launch: 12, dir: 30, tilt: 30 }, driver)
  assert.equal(f.water, true)
  assert.equal(f.rest.y, SEA_LEVEL)
  assert.deepEqual([f.rest.x, f.rest.z], [f.carry.x, f.carry.z], 'it rolled on the sea')
})

test('a hook into the hills lands on the hillside, at its height', () => {
  const f = simulate({ speed: 70, launch: 12, dir: -35, tilt: -10 }, driver)
  assert.equal(f.water, false)
  assert.equal(surfaceAt(f.carry.x, f.carry.z), 'hill')
  assert.ok(Math.abs(f.carry.y - groundHeight(f.carry.x, f.carry.z)) < 0.5, `landed at ${f.carry.y}, ground ${groundHeight(f.carry.x, f.carry.z)}`)
  assert.ok(f.rest.y > 2, 'it ended up at the bottom')
})

test('a straight drive stays on the range, dry', () => {
  const f = simulate({ speed: 78, launch: 12, dir: 0, tilt: 0 }, driver)
  assert.equal(f.water, false)
  assert.equal(surfaceAt(f.rest.x, f.rest.z), 'range')
})
