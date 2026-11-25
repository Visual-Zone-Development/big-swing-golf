// The course: its holes, their rules and a ball played down them. No browser needed.
// Run: node --test games/big-swing-golf/tests/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clubFor, COURSE, courseStandings, HOLES, holeYards, nextToPlay, roundTotal, scoreName, toPar, yardsToPin } from '../src/course.js'
import { simulate } from '../src/flight.js'
import { bearing } from '../src/putting.js'
import { strike } from '../src/shot.js'
import { groundHeight, lieAt } from '../src/terrain.js'
import { greenHeight, greenReach } from '../src/green.js'
import { CLUBS } from '../src/tuning.js'

/** The first hole, which the single-hole tests below play. */
const HOLE = HOLES[0]

test('the first hole is a par 4 of about 290 yards, its green raised at the far end of the range with the pin on it', () => {
  assert.equal(HOLE.par, 4)
  const yd = yardsToPin(HOLE.tee, HOLE.cup)
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
  const left = yardsToPin(from, HOLE.cup)
  const c = clubFor(left, CLUBS)
  const club = CLUBS[c]
  // A swing of about the right size for the distance (carry ≈ what's left, short of the roll).
  const approach = strike({ power: Math.min(1, (left - 4) / club.carry), face: 0, path: 0 }, club, bearing(from, HOLE.cup), 'R', undefined, { from, cup: HOLE.cup })
  const rest = approach.flight.rest
  assert.ok(['green', 'fringe'].includes(lieAt(rest.x, rest.z)) || approach.flight.holed, `${club.name} from ${Math.round(left)} yd stopped ${Math.round(yardsToPin(rest, HOLE.cup))} yd away, ${lieAt(rest.x, rest.z)}`)
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
  assert.equal(nextToPlay(seats, 0, HOLE.cup), 1, 'all on the tee: the next seat')
  assert.equal(nextToPlay(seats, 2, HOLE.cup), 0, 'and round again')
  seats[0].ball = { x: 0, z: 230 }
  seats[1].ball = { x: 0, z: 150 }
  seats[2].ball = { x: -10, z: 250 }
  assert.equal(nextToPlay(seats, 0, HOLE.cup), 1, 'the farthest out')
  seats[1].done = true
  assert.equal(nextToPlay(seats, 1, HOLE.cup), 0, 'the holed-out one is skipped')
  seats[0].done = seats[2].done = true
  assert.equal(nextToPlay(seats, 0, HOLE.cup), -1, 'everyone in: the round is over')
  assert.equal(nextToPlay([{ ball: tee }, { ball: { x: 0, z: 200 } }], 1, HOLE.cup, (s) => s.ball !== tee), 1, 'a disconnected player is passed over')
})

test('scores have golf names, and the scoreboard puts the fewest strokes first', () => {
  assert.equal(scoreName(1, 4), 'Hole in one!')
  assert.equal(scoreName(3, 4), 'Birdie!')
  assert.equal(scoreName(4, 4), 'Par')
  assert.equal(scoreName(5, 4), 'Bogey')
  assert.equal(scoreName(9, 4), '+5')
  const board = courseStandings([{ id: 'a', name: 'Ada', strokes: 6 }, { id: 'b', name: 'Bo', strokes: 4 }, { id: 'c', name: 'Cy', strokes: 6 }])
  assert.deepEqual(board.map((r) => r.id), ['b', 'a', 'c'])
  assert.equal(scoreName(2, 3), 'Birdie!', 'against the hole’s own par')
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

test('the course is three holes, par 11: each with its tee on flat ground and its pin on its own raised green, none overlapping', () => {
  assert.equal(HOLES.length, 3)
  assert.deepEqual(HOLES.map((h) => h.par), [4, 3, 4])
  assert.equal(COURSE.par, 11)
  assert.equal(new Set(HOLES.map((h) => h.name)).size, 3, 'each has its own name')
  for (const h of HOLES) {
    assert.equal(groundHeight(h.tee.x, h.tee.z), 0, `${h.name}: the tee is on the flat`)
    assert.ok(greenReach(h.cup.x, h.cup.z, h.green) < 0.6, `${h.name}: the pin is well onto its green`)
    assert.equal(lieAt(h.cup.x, h.cup.z), 'green')
    assert.ok(groundHeight(h.cup.x, h.cup.z) > 0.1, `${h.name}: raised`)
    // A par 3 is one full club from the tee; a par 4 is more than the driver carries by itself.
    const yd = holeYards(h)
    if (h.par === 3) assert.ok(yd >= 120 && yd <= 200, `${h.name}: ${yd} yd`)
    else assert.ok(yd >= 240 && yd <= 310, `${h.name}: ${yd} yd`)
    // The whole green and its fringe sit on the range's flat ground: nothing else under them.
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const e = 1 + h.green.fringe
      const [x, z] = [h.green.x + Math.cos(a) * h.green.rx * e * 1.02, h.green.z + Math.sin(a) * h.green.rz * e * 1.02]
      assert.equal(groundHeight(x, z), 0, `${h.name}: flat just outside the fringe at ${Math.round(x)}, ${Math.round(z)}`)
    }
    for (const o of HOLES) if (o !== h) assert.equal(greenHeight(h.green.x, h.green.z, o.green), 0, `${h.name} and ${o.name} overlap`)
  }
})

test('every hole can be played: the club the game picks from the tee, swung square, reaches the green on the par 3 and leaves a short shot from grass on the par 4s', () => {
  for (const h of HOLES) {
    const yd = yardsToPin(h.tee, h.cup)
    const club = CLUBS[clubFor(yd, CLUBS)]
    const shot = strike({ power: Math.min(1, (yd - 4) / club.carry), face: 0, path: 0 }, club, bearing(h.tee, h.cup), 'R', undefined, { from: h.tee, cup: h.cup })
    const rest = shot.flight.rest
    const lie = lieAt(rest.x, rest.z)
    assert.equal(shot.flight.water, false, `${h.name}: dry`)
    if (h.par === 3) assert.ok(shot.flight.holed || greenReach(rest.x, rest.z, h.green) < 1 + h.green.fringe + 0.35, `${h.name}: ${club.name} stopped ${Math.round(yardsToPin(rest, h.cup))} yd away, ${lie}`)
    else assert.ok(['fairway', 'rough', 'green', 'fringe'].includes(lie) && yardsToPin(rest, h.cup) < 60, `${h.name}: ${club.name} stopped ${Math.round(yardsToPin(rest, h.cup))} yd away, ${lie}`)
  }
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
