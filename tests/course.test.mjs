// The course: the hole, its rules and a ball played down it. No browser needed.
// Run: node --test games/seaside-swing/tests/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clubFor, courseStandings, HOLE, HOLES, honour, liePower, nextToPlay, PIN, pinScore, pinSpot, pinStandings, rollWind, roundStrokes, scoreName, setHole, toPar, windVector, windWords, yardsToPin } from '../src/course.js'
import { greenReach } from '../src/green.js'
import { simulate } from '../src/flight.js'
import { bearing } from '../src/putting.js'
import { powerFor, strike } from '../src/shot.js'
import { groundHeight, lieAt } from '../src/terrain.js'
import { CLUBS, YD } from '../src/tuning.js'

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

// ---- 0.10.0: three holes, sand, lies, wind, the pin's mark, Closest to the pin -------------------

test('the course is three holes, each with its cup on its own raised green and a tee on dry land', () => {
  assert.equal(HOLES.length, 3)
  assert.deepEqual(HOLES.map((h) => h.par), [4, 3, 4])
  HOLES.forEach((h, i) => {
    setHole(i)
    assert.equal(lieAt(h.cup.x, h.cup.z), 'green', h.name)
    assert.ok(groundHeight(h.cup.x, h.cup.z) > 0.1, `${h.name} is raised`)
    assert.notEqual(lieAt(h.tee.x, h.tee.z), 'water', h.name)
    assert.ok(h.bunkers.length >= 2, `${h.name} has sand`)
  })
  // Only the hole being played is part of the ground: the others' greens aren't there.
  setHole(1)
  assert.notEqual(lieAt(HOLES[0].cup.x, HOLES[0].cup.z), 'green')
  setHole(-1)
})

test('sand is sand only on the hole being played, never on the driving range, and never on a green or its fringe', () => {
  HOLES.forEach((h, i) => {
    setHole(i)
    for (const b of h.bunkers) {
      assert.equal(lieAt(b.x, b.z), 'bunker', h.name)
      for (let a = 0; a < 6.3; a += 0.2) assert.ok(greenReach(b.x + Math.cos(a) * b.rx, b.z + Math.sin(a) * b.rz, h.green) > 1 + h.green.fringe, `${h.name}: a bunker runs into the green`)
    }
  })
  setHole(-1)
  for (const b of HOLES[0].bunkers) assert.notEqual(lieAt(b.x, b.z), 'bunker')
})

test('a ball that lands in a bunker all but stops there', () => {
  setHole(0)
  const b = HOLES[0].bunkers[0]
  const from = { x: b.x, z: b.z - 155 * YD }
  const r = strike({ power: 1, face: 0, path: 0 }, CLUBS[3], 0, 'R', undefined, { from })
  assert.equal(lieAt(r.flight.rest.x, r.flight.rest.z), 'bunker')
  assert.ok(r.total - r.carry <= 3, `rolled ${r.total - r.carry} yd in the sand`)
  setHole(-1)
})

test('the lie saps the swing: nothing from the tee or fairway, a little from the rough, a lot from sand unless it’s a wedge', () => {
  const [dr, , , i7, , pw, sw] = CLUBS
  assert.equal(liePower('tee', dr), 1)
  assert.equal(liePower('fairway', i7), 1)
  assert.equal(liePower('green', i7), 1)
  assert.ok(liePower('rough', i7) < 1 && liePower('rough', i7) >= 0.85)
  assert.ok(liePower('bunker', i7) <= 0.65)
  assert.ok(liePower('bunker', sw) >= 0.9)
  assert.ok(liePower('bunker', pw) > liePower('bunker', i7) && liePower('bunker', pw) < liePower('bunker', sw))
  assert.equal(liePower('sand', sw), liePower('bunker', sw))
  // From the rough the game picks a longer club for the same distance.
  assert.ok(clubFor(150, CLUBS, 'rough') < clubFor(150, CLUBS, 'fairway'))
  // From sand, inside a sand wedge's reach, it picks the sand wedge.
  assert.equal(CLUBS[clubFor(60, CLUBS, 'bunker')].id, 'sw')
})

test('the wind: in your face it comes up short, behind you it flies on, across it drifts downwind, and calm changes nothing', () => {
  const seven = CLUBS[3]
  const hit = (wind) => strike({ power: 1, face: 0, path: 0 }, seven, 0, 'R', undefined, { wind: windVector(wind) })
  const calm = hit({ mph: 0, dir: 0 })
  assert.equal(windVector({ mph: 0, dir: 90 }), null)
  assert.equal(calm.carry, strike({ power: 1, face: 0, path: 0 }, seven, 0, 'R').carry)
  const into = hit({ mph: 10, dir: 180 })
  const behind = hit({ mph: 10, dir: 0 })
  assert.ok(into.carry <= calm.carry - 6 && into.carry >= calm.carry - 25, `into the wind: ${into.carry} vs ${calm.carry}`)
  assert.ok(behind.carry >= calm.carry + 6 && behind.carry <= calm.carry + 25, `downwind: ${behind.carry} vs ${calm.carry}`)
  const right = hit({ mph: 10, dir: 90 })
  const left = hit({ mph: 10, dir: 270 })
  assert.ok(right.offline >= 4 && right.offline <= 16, `blown ${right.offline} yd right`)
  assert.ok(left.offline <= -4)
  // Twice the wind, about twice the drift.
  assert.ok(hit({ mph: 20, dir: 90 }).offline > right.offline * 1.6)
})

test('the wind is drawn from the hole’s range, and said the way the player sees it', () => {
  assert.deepEqual(rollWind([0, 0]), { mph: 0, dir: 0 })
  for (let i = 0; i < 20; i++) {
    const w = rollWind([5, 12])
    assert.ok(w.mph >= 5 && w.mph <= 12 && w.dir >= 0 && w.dir <= 360)
  }
  assert.equal(windWords({ mph: 0, dir: 0 }), 'No wind')
  assert.equal(windWords({ mph: 8, dir: 0 }, 0), '8 mph behind you')
  assert.equal(windWords({ mph: 8, dir: 180 }, 0), '8 mph in your face')
  assert.equal(windWords({ mph: 8, dir: 90 }, 0), '8 mph left to right')
  assert.equal(windWords({ mph: 8, dir: 270 }, 0), '8 mph right to left')
  // The same wind, playing the other way (the third hole comes home): it's reversed.
  assert.equal(windWords({ mph: 8, dir: 0 }, 180), '8 mph in your face')
  assert.equal(windWords({ mph: 8, dir: 90 }, 180), '8 mph right to left')
})

test('the pin’s mark on the bar: a square swing to it finishes by the pin, from any lie and in any wind; out of reach there is no mark', () => {
  setHole(1)
  const h = HOLES[1]
  const line = bearing(h.tee, h.cup)
  const yards = yardsToPin(h.tee, h.cup)
  const nine = CLUBS[4]
  for (const wind of [null, windVector({ mph: 10, dir: line + 180 }), windVector({ mph: 10, dir: line })]) {
    for (const lie of [1, 0.9]) {
      const p = powerFor(yards, nine, line, { from: h.tee, wind, lie })
      if (p === null) continue
      assert.ok(p > 0.3 && p <= 1)
      const r = strike({ power: p * lie, face: 0, path: 0 }, nine, line, 'R', undefined, { from: h.tee, wind })
      assert.ok(Math.abs(yardsToPin(r.flight.rest, h.cup)) <= 5, `finished ${yardsToPin(r.flight.rest, h.cup).toFixed(1)} yd from the pin`)
    }
  }
  // Into the wind it takes more of the bar than downwind.
  assert.ok(powerFor(yards, nine, line, { from: h.tee, wind: windVector({ mph: 8, dir: line + 180 }) }) > powerFor(yards, nine, line, { from: h.tee, wind: windVector({ mph: 8, dir: line }) }))
  // A sand wedge can't get there: no mark.
  assert.equal(powerFor(yards, CLUBS[6], line, { from: h.tee }), null)
  setHole(-1)
})

test('Closest to the pin: six spots on dry land at their distances, feet from the pin as the score, 100 for a miss, fewest feet first', () => {
  setHole(PIN.hole)
  const cup = HOLES[PIN.hole].cup
  PIN.spots.forEach((sp, i) => {
    const p = pinSpot(i)
    assert.ok(Math.abs(yardsToPin(p, cup) - sp.yards) < 0.5)
    assert.ok(['fairway', 'rough'].includes(lieAt(p.x, p.z)), `spot ${i} is on the ${lieAt(p.x, p.z)}`)
    assert.ok(Math.abs(bearing(p, cup) - sp.deg) < 0.5)
  })
  assert.equal(pinScore({ x: cup.x, z: cup.z - 3.048 }, { lie: 'green' }), 10)
  assert.equal(pinScore({ x: cup.x, z: cup.z }, { holed: true, lie: 'green' }), 0)
  assert.equal(pinScore({ x: cup.x + 2, z: cup.z }, { lie: 'fringe' }), PIN.miss)
  assert.equal(pinScore({ x: cup.x + 2, z: cup.z }, { lie: 'bunker' }), PIN.miss)
  const board = pinStandings([{ id: 'a', name: 'Ada', shots: [{ feet: 30 }, { feet: 100 }] }, { id: 'b', name: 'Bo', shots: [{ feet: 12.5 }, { feet: 40 }] }])
  assert.deepEqual(board.map((r) => [r.id, r.total]), [['b', 52.5], ['a', 130]])
  setHole(-1)
})

test('the round: strokes add up over the holes, the best score on a hole tees off first on the next, and scores read against par', () => {
  const seats = [
    { id: 'a', name: 'Ada', card: [5, 3], strokes: 2, carded: false },
    { id: 'b', name: 'Bo', card: [4, 4], strokes: 1, carded: false },
    { id: 'c', name: 'Cy', card: [5, 2, 4], strokes: 4, carded: true }
  ]
  assert.deepEqual(seats.map(roundStrokes), [10, 9, 11])
  assert.deepEqual(courseStandings(seats).map((r) => r.id), ['b', 'a', 'c'])
  assert.equal(honour(seats, 0), 1)
  assert.equal(honour(seats, 1), 2)
  assert.equal(honour(seats, 1, (s) => s.id !== 'c'), 0, 'someone who left doesn’t tee off first')
  assert.equal(toPar(11, 11), 'E')
  assert.equal(toPar(13, 11), '+2')
  assert.equal(toPar(9, 11), '-2')
})
