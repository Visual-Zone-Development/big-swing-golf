// The beans' reaction motion (src/reactions.js), checked by numbers (pushplay-kit's animate-asset:
// nothing dips below the floor, each motion ends where it started, no snaps between frames).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { REACTIONS, reactionPose } from '../src/reactions.js'

const KINDS = ['cheer', 'happy', 'sad', 'wince']
const STEP = 1 / 120
const frames = (kind) => {
  const out = []
  for (let t = 0; t <= REACTIONS[kind].duration + STEP; t += STEP) out.push({ t, ...reactionPose(kind, t) })
  return out
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))

test('no reaction ever puts the bean below the ground', () => {
  for (const kind of KINDS) for (const f of frames(kind)) assert.ok(f.hop >= 0, `${kind} at ${f.t.toFixed(3)} s: hop ${f.hop}`)
})

test('every reaction starts and ends at rest, so it hands back to idle without a snap', () => {
  for (const kind of KINDS) {
    const all = frames(kind)
    for (const f of [all[0], all.at(-1)]) {
      assert.equal(f.hop, 0, `${kind} hop at ${f.t}`)
      assert.ok(Math.abs(f.sy - 1) < 1e-3, `${kind} squash at ${f.t}: ${f.sy}`)
      assert.ok(Math.abs(f.tilt) < 1e-3, `${kind} tilt at ${f.t}: ${f.tilt}`)
      assert.ok(Math.abs(wrap(f.spin)) < 1e-3, `${kind} spin at ${f.t}: ${f.spin}`)
    }
    assert.equal(reactionPose(kind, REACTIONS[kind].duration).done, true)
  }
})

test('the motion is continuous: no frame jumps (at 120 frames a second)', () => {
  for (const kind of KINDS) {
    const all = frames(kind)
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1]
      const b = all[i]
      assert.ok(Math.abs(b.hop - a.hop) < 0.05, `${kind} hop jumps at ${b.t.toFixed(3)} s`)
      assert.ok(Math.abs(b.sy - a.sy) < 0.06, `${kind} squash jumps at ${b.t.toFixed(3)} s: ${a.sy.toFixed(3)} → ${b.sy.toFixed(3)}`)
      assert.ok(Math.abs(b.tilt - a.tilt) < 0.05, `${kind} tilt jumps at ${b.t.toFixed(3)} s`)
      assert.ok(Math.abs(wrap(b.spin - a.spin)) < 0.2, `${kind} spin jumps at ${b.t.toFixed(3)} s`)
    }
  }
})

test('a cheer crouches before it leaves the ground, then squashes when it lands', () => {
  const all = frames('cheer')
  const takeoff = all.findIndex((f) => f.hop > 0)
  assert.ok(takeoff > 0)
  assert.ok(Math.min(...all.slice(0, takeoff).map((f) => f.sy)) < 0.9, 'anticipation: squats before the hop')
  const landing = all.findIndex((f, i) => i > takeoff && f.hop === 0)
  assert.ok(Math.min(...all.slice(landing, landing + 12).map((f) => f.sy)) < 0.85, 'squashes on landing')
  assert.ok(Math.max(...all.slice(takeoff, takeoff + 18).map((f) => f.sy)) > 1.05, 'stretches on the way up')
})

test('the hops follow a real arc to their height, and the first spins the bean right round', () => {
  for (const kind of ['cheer', 'happy']) {
    const R = REACTIONS[kind]
    const apex = Math.max(...frames(kind).map((f) => f.hop))
    assert.ok(Math.abs(apex - R.hops[0]) < 0.01, `${kind} apex ${apex.toFixed(3)} m, meant ${R.hops[0]}`)
  }
  const spin = frames('cheer').map((f) => f.spin)
  assert.ok(Math.abs(Math.max(...spin) - Math.PI * 2) < 1e-6)
  // The arc is symmetric: as high a quarter of the way through the air as three quarters.
  const R = REACTIONS.cheer
  const air = 2 * Math.sqrt((2 * R.hops[0]) / REACTIONS.gravity)
  const h = (k) => reactionPose('cheer', R.crouch + k * air).hop
  assert.ok(Math.abs(h(0.25) - h(0.75)) < 1e-9)
})
