// The course: its holes on their own ground, their traps, their rules and balls played down them.
// No browser needed. Run: node --test tests/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clubFor, COURSE, courseStandings, distToLine, ellipseReach, FAIRWAY_HALF, HOLES, holeYards, nextToPlay, roundTotal, scoreName, toPar, trapOutline, yardsToPin } from '../src/course.js'
import { simulate } from '../src/flight.js'
import { greenHeight, greenReach } from '../src/green.js'
import { shoreDistance } from '../src/links.js'
import { bearing } from '../src/putting.js'
import { strike } from '../src/shot.js'
import { groundHeight, lieAt, SEA_LEVEL } from '../src/terrain.js'
import { CLUBS, TUNING, YD } from '../src/tuning.js'

const [FIRST, BAY, HILL] = HOLES
/** A square swing at this power with the club the game picks for the distance, from a spot along a line. */
const play = (from, to, cup, { power = null, club = null } = {}) => {
  const yd = Math.hypot(to.x - from.x, to.z - from.z) / YD
  const c = club ?? CLUBS[clubFor(yd, CLUBS)]
  const shot = strike({ power: power ?? Math.min(1, (yd - 4) / c.carry), face: 0, path: 0 }, c, bearing(from, to), 'R', undefined, { from, cup })
  return { ...shot.flight, club: c }
}

test('the course is three holes, par 11, on its own ground south of the range: each tee on the flat, each pin on its own raised green', () => {
  assert.deepEqual(HOLES.map((h) => [h.name, h.par]), [['Lighthouse Point', 4], ['Beach Hut Bay', 3], ['Shady Hill', 4]])
  assert.equal(COURSE.par, 11)
  for (const h of HOLES) {
    assert.ok(h.tee.z < -100 && h.cup.z < -100, `${h.name}: off the range`)
    assert.equal(groundHeight(h.tee.x, h.tee.z), 0, `${h.name}: the tee is on the flat`)
    assert.ok(greenReach(h.cup.x, h.cup.z, h.green) < 0.6, `${h.name}: the pin is well onto its green`)
    assert.equal(lieAt(h.cup.x, h.cup.z), 'green')
    assert.ok(groundHeight(h.cup.x, h.cup.z) > 0.1, `${h.name}: raised`)
    const yd = holeYards(h)
    if (h.par === 3) assert.ok(yd >= 120 && yd <= 200, `${h.name}: ${yd} yd`)
    else assert.ok(yd >= 240 && yd <= 320, `${h.name}: ${yd} yd`)
    // The ground round the green is level (its apron), so the green's own shape is all there is.
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const e = 1 + h.green.fringe
      const [x, z] = [h.green.x + Math.cos(a) * h.green.rx * e * 1.02, h.green.z + Math.sin(a) * h.green.rz * e * 1.02]
      assert.equal(groundHeight(x, z), 0, `${h.name}: level just outside the fringe at ${Math.round(x)}, ${Math.round(z)}`)
    }
    for (const o of HOLES) if (o !== h) assert.equal(greenHeight(h.green.x, h.green.z, o.green), 0, `${h.name} and ${o.name} overlap`)
  }
  // The range is as it was: flat and mown, no course green on it.
  assert.equal(groundHeight(0, 0), 0)
  assert.equal(lieAt(0, 100), 'fairway')
  assert.equal(lieAt(-12, 260), 'fairway')
})

test('every hole has sand, the third has a pond, and the traps lie as they should', () => {
  for (const h of HOLES) {
    assert.ok(h.sand.length >= 2, `${h.name} has bunkers`)
    for (const e of h.sand) {
      assert.equal(lieAt(e.x, e.z), 'bunker', `${h.name}: the bunker at ${e.x}, ${e.z}`)
    }
    // A fairway runs unbroken along its line (apart from the pond on the third).
    for (const p of h.fairway.slice(0, -1)) assert.equal(lieAt(p.x, p.z), 'fairway', `${h.name}: the fairway at ${p.x}, ${p.z}`)
  }
  const pond = HILL.water[0]
  assert.equal(lieAt(pond.x, pond.z), 'water')
  assert.ok(groundHeight(pond.x, pond.z) < SEA_LEVEL, 'the pond is deep enough to keep a ball')
  assert.equal(groundHeight(pond.x + pond.rx + 3, pond.z), 0, 'and its bank is level ground')
  // The pond lies across the front of the green, with dry fairway to its left (the east).
  assert.ok(ellipseReach(-123, -288, pond) < 1, 'on the line in')
  assert.equal(lieAt(-110, -288), 'fairway')
})

test('the first hole runs along the sea and the second is played across the bay', () => {
  // Right of the first fairway (south-east of it) is the sea, all the way along.
  for (const t of [0.3, 0.6, 0.9]) {
    const [a, b] = [FIRST.fairway[0], FIRST.fairway[2]]
    const [x, z] = [a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    const [rx, rz] = [(b.z - a.z) / len, -(b.x - a.x) / len] // to the right of the line of play
    assert.equal(lieAt(x + rx * 70, z + rz * 70), 'water', `70 m right of the fairway, ${Math.round(t * 100)}% along`)
    assert.ok(shoreDistance(x, z) > FAIRWAY_HALF, 'the fairway itself is dry')
  }
  // Most of the second hole's line is over water.
  let wet = 0
  for (let i = 1; i < 20; i++) if (lieAt(BAY.tee.x + ((BAY.cup.x - BAY.tee.x) * i) / 20, BAY.tee.z + ((BAY.cup.z - BAY.tee.z) * i) / 20) === 'water') wet++
  assert.ok(wet >= 8, `${wet} of 19 points along the line are water`)
})

test('the first hole: a drive down the fairway finds it, and the club the game picks from there gets onto the green', () => {
  const drive = play(FIRST.tee, FIRST.via, FIRST.cup, { power: 1, club: CLUBS[0] })
  assert.equal(lieAt(drive.rest.x, drive.rest.z), 'fairway')
  const from = { x: drive.rest.x, z: drive.rest.z }
  const approach = play(from, FIRST.cup, FIRST.cup)
  const rest = approach.rest
  assert.ok(['green', 'fringe'].includes(lieAt(rest.x, rest.z)) || approach.holed, `${approach.club.name} from ${Math.round(yardsToPin(from, FIRST.cup))} yd stopped ${Math.round(yardsToPin(rest, FIRST.cup))} yd away, ${lieAt(rest.x, rest.z)}`)
})

test('the second hole: the right club carries the bay onto the green; a half swing is a splash', () => {
  const good = play(BAY.tee, BAY.cup, BAY.cup)
  assert.equal(good.water, false)
  assert.ok(good.holed || greenReach(good.rest.x, good.rest.z, BAY.green) < 1 + BAY.green.fringe + 0.35, `${good.club.name} stopped ${Math.round(yardsToPin(good.rest, BAY.cup))} yd away, ${lieAt(good.rest.x, good.rest.z)}`)
  assert.equal(play(BAY.tee, BAY.cup, BAY.cup, { power: 0.5 }).water, true)
})

test('the third hole: the lay-up stays dry on the fairway and the pitch carries the pond; a ball into the pond is in the water', () => {
  // The tee shot the game sets up: the club for the lay-up spot, past the bend and short of the pond.
  const drive = play(HILL.tee, HILL.via, HILL.cup)
  assert.notEqual(drive.club.id, 'dr', 'a lay-up, not a driver')
  assert.equal(drive.water, false)
  assert.equal(lieAt(drive.rest.x, drive.rest.z), 'fairway')
  assert.ok(distToLine(drive.rest.x, drive.rest.z, HILL.fairway) < FAIRWAY_HALF)
  // From there the pitch carries the pond onto the green.
  const pitch = play({ x: drive.rest.x, z: drive.rest.z }, HILL.cup, HILL.cup)
  assert.equal(pitch.water, false)
  assert.ok(pitch.holed || greenReach(pitch.rest.x, pitch.rest.z, HILL.green) < 1 + HILL.green.fringe + 0.35, `${pitch.club.name} stopped ${Math.round(yardsToPin(pitch.rest, HILL.cup))} yd away, ${lieAt(pitch.rest.x, pitch.rest.z)}`)
  const pond = HILL.water[0]
  const from = { x: -121, z: -235 }
  const wet = play(from, pond, HILL.cup, { club: CLUBS.find((c) => c.id === 'sw') })
  assert.ok(wet.water, `a wedge at the pond: stopped at ${Math.round(wet.rest.x)}, ${Math.round(wet.rest.z)} on the ${lieAt(wet.rest.x, wet.rest.z)}`)
})

test('sand swallows the ball: it stops within a few metres of where it lands, far sooner than on the fairway', () => {
  const trap = FIRST.sand[0]
  const from = { x: trap.x - 60, z: trap.z - 35 }
  const club = CLUBS.find((c) => c.id === '7i')
  const yd = Math.hypot(trap.x - from.x, trap.z - from.z) / YD
  const shot = strike({ power: yd / club.carry, face: 0, path: 0 }, club, bearing(from, trap), 'R', undefined, { from, cup: FIRST.cup }).flight
  assert.equal(lieAt(shot.carry.x, shot.carry.z), 'bunker', 'it lands in the bunker')
  const ran = Math.hypot(shot.rest.x - shot.carry.x, shot.rest.z - shot.carry.z)
  assert.ok(ran < 3, `ran ${ran.toFixed(1)} m in the sand`)
  assert.equal(lieAt(shot.rest.x, shot.rest.z), 'bunker')
  // The same swing along the fairway runs on.
  const open = strike({ power: yd / club.carry, face: 0, path: 0 }, club, bearing(FIRST.tee, FIRST.via), 'R', undefined, { from: FIRST.tee, cup: FIRST.cup }).flight
  assert.ok(Math.hypot(open.rest.x - open.carry.x, open.rest.z - open.carry.z) > ran * 3)
  assert.ok(TUNING.ball.sandCarry > 0.5 && TUNING.ball.sandCarry < 0.8, 'out of sand a club goes about two-thirds as far')
})

test('a ball running slowly over the cup drops in (a chip-in); a fast one runs past', () => {
  const from = { x: FIRST.cup.x, z: FIRST.cup.z - 8 }
  const club = CLUBS[CLUBS.length - 1]
  const roll = (speed) => simulate({ speed, launch: 8, dir: 0, tilt: 0 }, club, undefined, { from, cup: FIRST.cup })
  let dropped = null
  for (let v = 3; v <= 30 && !dropped; v += 0.25) if (roll(v).holed) dropped = v
  assert.ok(dropped, 'some pace drops it')
  assert.equal(roll(40).holed, false, 'much too fast: it flies over')
})

test('farthest from the pin plays next; on the tee, seat order after whoever just played; holed-out players are skipped', () => {
  const tee = { ...FIRST.tee }
  const cup = FIRST.cup
  const seats = [{ ball: tee }, { ball: tee }, { ball: tee }]
  assert.equal(nextToPlay(seats, 0, cup), 1, 'all on the tee: the next seat')
  assert.equal(nextToPlay(seats, 2, cup), 0, 'and round again')
  seats[0].ball = { x: cup.x - 40, z: cup.z - 20 }
  seats[1].ball = { x: cup.x - 110, z: cup.z - 50 }
  seats[2].ball = { x: cup.x - 10, z: cup.z + 5 }
  assert.equal(nextToPlay(seats, 0, cup), 1, 'the farthest out')
  seats[1].done = true
  assert.equal(nextToPlay(seats, 1, cup), 0, 'the holed-out one is skipped')
  seats[0].done = seats[2].done = true
  assert.equal(nextToPlay(seats, 0, cup), -1, 'everyone in: the hole is over')
  assert.equal(nextToPlay([{ ball: tee }, { ball: { x: cup.x - 60, z: cup.z } }], 1, cup, (s) => s.ball !== tee), 1, 'a disconnected player is passed over')
})

test('scores have golf names against the hole’s par, and the scoreboard puts the fewest strokes first', () => {
  assert.equal(scoreName(1, 4), 'Hole in one!')
  assert.equal(scoreName(3, 4), 'Birdie!')
  assert.equal(scoreName(4, 4), 'Par')
  assert.equal(scoreName(5, 4), 'Bogey')
  assert.equal(scoreName(9, 4), '+5')
  assert.equal(scoreName(2, 3), 'Birdie!')
  const board = courseStandings([{ id: 'a', name: 'Ada', strokes: 6 }, { id: 'b', name: 'Bo', strokes: 4 }, { id: 'c', name: 'Cy', strokes: 6 }])
  assert.deepEqual(board.map((r) => r.id), ['b', 'a', 'c'])
})

test('a round is scored over all its holes: the card plus the hole being played, read against par, fewest first', () => {
  assert.equal(roundTotal({ card: [4, 3], strokes: 2, done: false }), 9, 'two holes on the card and two strokes into the third')
  assert.equal(roundTotal({ card: [4, 3, 5], strokes: 5, done: true }), 12, 'a finished hole is counted once')
  assert.equal(toPar(11), 'Level par')
  assert.equal(toPar(9), '2 under')
  assert.equal(toPar(14), '3 over')
  const board = courseStandings([
    { id: 'a', name: 'Ada', card: [5, 3, 4], strokes: 4, done: true },
    { id: 'b', name: 'Bo', card: [4, 2, 4], strokes: 4, done: true },
    { id: 'c', name: 'Cy', card: [4, 4, 4], strokes: 4, done: true }
  ])
  assert.deepEqual(board.map((r) => [r.id, r.total]), [['b', 10], ['a', 12], ['c', 12]])
})

test('the game picks the shortest club that gets there, and a wedge for anything short', () => {
  assert.equal(CLUBS[clubFor(285, CLUBS)].id, 'dr')
  assert.equal(CLUBS[clubFor(150, CLUBS)].id, '7i')
  assert.equal(CLUBS[clubFor(30, CLUBS)].id, 'sw')
})

test('a ball that runs up onto the hills settles within a few seconds, never rolling on and on', () => {
  for (const hole of [FIRST, HILL]) {
    const line = bearing(hole.tee, hole.via)
    for (const face of [-25, -18, 25]) {
      const r = strike({ power: 1, face, path: 0 }, CLUBS[0], line, 'R', undefined, { from: hole.tee, cup: hole.cup })
      const f = r.flight
      const rolling = f.rest.t - f.carry.t
      assert.ok(rolling < 9, `${hole.name}, face ${face}: still going ${rolling.toFixed(1)} s after landing, on the ${lieAt(f.rest.x, f.rest.z)}`)
    }
  }
})

test('a bunker or a pond has an irregular edge, lies on level ground and keeps off the greens; the beach is the shore’s own sand', () => {
  for (const h of HOLES) {
    for (const e of [...h.sand, ...h.water]) {
      const edge = trapOutline(e, 64)
      const reach = edge.map((p) => Math.hypot(p.x - e.x, p.z - e.z))
      // Not a plain oval: the edge comes in and out by more than an ellipse of its size would
      // (a pond's more gently than a bunker's).
      const plain = Math.max(e.rx, e.rz) / Math.min(e.rx, e.rz)
      assert.ok(Math.max(...reach) / Math.min(...reach) > plain * (h.sand.includes(e) ? 1.12 : 1.03), `${h.name}: the trap at ${e.x}, ${e.z} is lobed`)
      // Just inside its edge is the trap, just outside is not: the rules follow the drawn shape.
      for (const [i, p] of trapOutline(e, 16, -0.3).entries()) assert.ok(ellipseReach(p.x, p.z, e) < 1, `${h.name}: inside at point ${i}`)
      for (const p of trapOutline(e, 16, 0.3)) assert.ok(ellipseReach(p.x, p.z, e) > 1)
      // Level all round (the golfer and the ball stand on the sand, not under it), and clear of every green.
      for (const p of trapOutline(e, 32, 1.5)) {
        assert.equal(groundHeight(p.x, p.z), 0, `${h.name}: level beside the trap at ${Math.round(p.x)}, ${Math.round(p.z)}`)
        for (const o of HOLES) assert.ok(greenReach(p.x, p.z, o.green) > 1 + o.green.fringe, `${h.name}: a trap runs onto ${o.name}'s green`)
      }
    }
    for (const e of h.sand) assert.equal(groundHeight(e.x, e.z), 0, 'a bunker’s sand is at ground level')
  }
  // The beach in front of the second green: sand, sloping gently down to the water, with nothing
  // above it (it is the ground itself).
  assert.equal(lieAt(50, -168), 'sand')
  assert.ok(groundHeight(50, -168) < 0 && groundHeight(50, -168) > SEA_LEVEL)
  assert.ok(groundHeight(58, -168) < groundHeight(46, -168), 'lower toward the bay')
  assert.equal(lieAt(40, -165), 'fairway', 'the green’s apron is still mown')
})
