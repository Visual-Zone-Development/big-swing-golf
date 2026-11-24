// The course: the hole, its rules and a ball played down it. No browser needed.
// Run: node --test games/seaside-swing/tests/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clubFor, courseStandings, HOLE, nextToPlay, scoreName, yardsToPin } from '../src/course.js'
import { simulate } from '../src/flight.js'
import { bearing } from '../src/putting.js'
import { strike } from '../src/shot.js'
import { groundHeight, lieAt } from '../src/terrain.js'
import { CLUBS } from '../src/tuning.js'

test('the hole is a par 4 of about 290 yards, its green raised at the far end of the range with the pin on it', () => {
  assert.equal(HOLE.par, 4)
  const yd = yardsToPin(HOLE.tee)
  assert.ok(yd > 270 && yd < 310, `${Math.round(yd)} yd`)
  assert.equal(lieAt(HOLE.cup.x, HOLE.cup.z), 'green')
  assert.ok(groundHeight(HOLE.cup.x, HOLE.cup.z) > 0.1, 'raised')
  assert.equal(lieAt(HOLE.tee.x, HOLE.tee.z + 100), 'fairway')
})

test('a good drive finds the fairway, and the club the game picks from there gets onto the green', () => {
  const drive = strike({ power: 1, face: 0, path: 0 }, CLUBS[0], bearing(HOLE.tee, HOLE.cup), 'R')
  const lie = drive.flight.rest
  assert.equal(lieAt(lie.x, lie.z), 'fairway')
  const from = { x: lie.x, z: lie.z }
  const left = yardsToPin(from)
  const c = clubFor(left, CLUBS)
  const club = CLUBS[c]
  // A swing of about the right size for the distance (carry ≈ what's left, short of the roll).
  const approach = strike({ power: Math.min(1, (left - 4) / club.carry), face: 0, path: 0 }, club, bearing(from, HOLE.cup), 'R', undefined, { from, cup: HOLE.cup })
  const rest = approach.flight.rest
  assert.ok(['green', 'fringe'].includes(lieAt(rest.x, rest.z)) || approach.flight.holed, `${club.name} from ${Math.round(left)} yd stopped ${Math.round(yardsToPin(rest))} yd away, ${lieAt(rest.x, rest.z)}`)
})

test('a ball running slowly over the cup drops in (a chip-in); a fast one runs past', () => {
  const from = { x: HOLE.cup.x, z: HOLE.cup.z - 10 }
  const club = CLUBS[CLUBS.length - 1]
  const roll = (speed) => simulate({ speed, launch: 8, dir: 0, tilt: 0 }, club, undefined, { from, cup: HOLE.cup })
  let dropped = null
  for (let v = 3; v <= 30 && !dropped; v += 0.25) if (roll(v).holed) dropped = v
  assert.ok(dropped, 'some pace drops it')
  assert.equal(roll(40).holed, false, "much too fast: it flies over")
})

test('farthest from the pin plays next; on the tee, seat order after whoever just played; holed-out players are skipped', () => {
  const tee = { ...HOLE.tee }
  const seats = [{ ball: tee }, { ball: tee }, { ball: tee }]
  assert.equal(nextToPlay(seats, 0), 1, 'all on the tee: the next seat')
  assert.equal(nextToPlay(seats, 2), 0, 'and round again')
  seats[0].ball = { x: 0, z: 230 }
  seats[1].ball = { x: 0, z: 150 }
  seats[2].ball = { x: -10, z: 250 }
  assert.equal(nextToPlay(seats, 0), 1, 'the farthest out')
  seats[1].done = true
  assert.equal(nextToPlay(seats, 1), 0, 'the holed-out one is skipped')
  seats[0].done = seats[2].done = true
  assert.equal(nextToPlay(seats, 0), -1, 'everyone in: the round is over')
  assert.equal(nextToPlay([{ ball: tee }, { ball: { x: 0, z: 200 } }], 1, HOLE.cup, (s) => s.ball !== tee), 1, 'a disconnected player is passed over')
})

test('scores have golf names, and the scoreboard puts the fewest strokes first', () => {
  assert.equal(scoreName(1), 'Hole in one!')
  assert.equal(scoreName(3), 'Birdie!')
  assert.equal(scoreName(4), 'Par')
  assert.equal(scoreName(5), 'Bogey')
  assert.equal(scoreName(9), '+5')
  const board = courseStandings([{ id: 'a', name: 'Ada', strokes: 6 }, { id: 'b', name: 'Bo', strokes: 4 }, { id: 'c', name: 'Cy', strokes: 6 }])
  assert.deepEqual(board.map((r) => r.id), ['b', 'a', 'c'])
})

test('the game picks the shortest club that gets there, and a wedge for anything short', () => {
  assert.equal(CLUBS[clubFor(285, CLUBS)].id, 'dr')
  assert.equal(CLUBS[clubFor(150, CLUBS)].id, '7i')
  assert.equal(CLUBS[clubFor(30, CLUBS)].id, 'sw')
})

test('a ball that runs up onto the hills or dunes settles within a few seconds, never rolling on and on', () => {
  const line = bearing(HOLE.tee, HOLE.cup)
  for (const face of [-25, -18, 25]) {
    const r = strike({ power: 1, face, path: 0 }, CLUBS[0], line, 'R', undefined, { from: HOLE.tee, cup: HOLE.cup })
    const f = r.flight
    const rolling = f.rest.t - f.carry.t
    assert.ok(rolling < 9, `face ${face}: still going ${rolling.toFixed(1)} s after landing, on the ${lieAt(f.rest.x, f.rest.z)}`)
  }
})
