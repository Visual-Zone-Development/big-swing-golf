// The TV side with phones: a fake relay hands the TV a room and lets the test play the phones,
// joining and sending what controller.html sends ({ club }, { shot }). The game is built with
// vite (as the build does) into a temp folder and served from there.
// Run: node --test games/big-swing-golf/tests/
import { distToLine, FAIRWAY_HALF, HOLES } from '../src/course.js'
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { chromium } from 'playwright'
import { build } from 'vite'

const GAME = join(import.meta.dirname, '..')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }
let ROOT
let server
let browser
let base

before(async () => {
  ROOT = await mkdtemp(join(tmpdir(), 'big-swing-golf-'))
  await build({ root: GAME, logLevel: 'error', build: { outDir: ROOT, emptyOutDir: true } })
  server = createServer(async (req, res) => {
    let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
    if (path.endsWith('/')) path += 'index.html'
    try {
      const body = await readFile(join(ROOT, path))
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}/`
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}) })
})

after(async () => {
  await browser?.close()
  server?.close()
  if (ROOT) await rm(ROOT, { recursive: true, force: true })
})

/** The TV, with a relay the test controls: tv.phone(id, name) joins, tv.say(id, data) sends a message from it. */
async function tv({ query = '', launcher = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  // Inside the PushPlay launcher: window.pushplay.quit() goes back to the library (counted here).
  if (launcher) await page.addInitScript(() => (window.pushplay = { quit: () => (window.__quits = (window.__quits ?? 0) + 1) }))
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  let socket
  await page.routeWebSocket(/:5174\//, (ws) => {
    socket = ws
    ws.onMessage((raw) => {
      const msg = JSON.parse(String(raw))
      if (msg.t === 'party-host') ws.send(JSON.stringify({ t: 'party', room: 'TEST', join: 'http://127.0.0.1:5174/j/TEST', resume: 'r', players: [] }))
    })
  })
  await page.goto(base + query)
  await page.waitForFunction(() => window.__game?.state?.screen === 'title')
  // Arcade speed for tests: the ball flies in a blink, and the 3D frame isn't drawn (a software
  // GPU takes a third of a second per frame; the game's own timers run on frame time).
  await page.evaluate(() => {
    window.__game.TUNING.flightSpeed = 40
    window.__game.TUNING.putting.rollSpeed = 40
    window.__game.view.renderer.render = () => {}
  })
  return {
    page,
    errors,
    phone: (id, name) => socket.send(JSON.stringify({ t: 'peer-join', id, name, color: '#ffd23f' })),
    say: (id, data) => socket.send(JSON.stringify({ t: 'msg', from: id, d: { k: 'm', d: data } })),
    input: (id, i) => socket.send(JSON.stringify({ t: 'msg', from: id, d: { k: 'i', i } })),
    state: (fn) => page.evaluate(fn)
  }
}

/**
 * Open a party, let the phones join, start, and the first phone picks the game (t.mode, set by
 * chooseMode; the driving range by default); every phone then taps I'm ready on the safety card,
 * unless { ready: false }.
 */
async function startParty(t, phones, { ready = true } = {}) {
  await key(t.page, 'Enter') // Play with phones
  await t.page.waitForFunction(() => window.__game.state.screen === 'lobby' && window.__game.party.status === 'open')
  for (const [id, name] of phones) t.phone(id, name)
  await t.page.waitForFunction((n) => window.__game.party.players.length === n, phones.length)
  await key(t.page, 'Enter') // Start
  await t.page.waitForFunction(() => window.__game.state.screen === 'pick' && window.__game.party.public.menu?.title === 'What are we playing?')
  t.say(phones[0][0], { menu: { id: t.mode ?? 'practice' } })
  await t.page.waitForFunction(() => window.__game.state.screen === 'playing')
  if (!ready) return
  for (const [id] of phones) t.say(id, { safe: true })
  await t.page.waitForFunction(() => window.__game.state.phase === 'aim')
}

/** A key held for a few frames, as a person presses it. */
async function key(page, k) {
  await page.keyboard.down(k)
  await page.waitForTimeout(60)
  await page.keyboard.up(k)
  await page.waitForTimeout(60)
}

// A full swing: a full backswing (TUNING.swing.backFull.normal, 200°) and a downswing that delivers it.
const SQUARE = { speed: 1050, peak: 1100, face: 0, path: 0, back: 200, tempo: 3, hand: 'R', ms: 0 }

test('a phone picks a club and swings: the ball flies that club’s distance and the phone hears how it went', async () => {
  const t = await tv()
  await startParty(t, [['p1', 'Ada']])
  assert.equal(await t.state(() => window.__game.party.views.p1.active), true)
  t.say('p1', { club: 3 }) // 7 iron
  await t.page.waitForFunction(() => window.__game.state.seats[0].club === 3)
  t.say('p1', { shot: SQUARE })
  await t.page.waitForFunction(() => window.__game.state.phase === 'result', null, { timeout: 10000 })
  const shot = await t.state(() => ({ carry: window.__game.state.shot.result.carry, shape: window.__game.state.shot.result.shape, last: window.__game.party.views.p1.last }))
  assert.ok(Math.abs(shot.carry - 155) <= 3, `carried ${shot.carry}`)
  assert.equal(shot.shape, 'Straight!')
  assert.match(shot.last, /yd carry · Straight!/)
  assert.deepEqual(t.errors, [])
  await t.page.close()
})

test('a party starts with the safety screen, and swinging waits until every phone has read it', async () => {
  const t = await tv()
  await startParty(t, [['p1', 'Ada'], ['p2', 'Bo']], { ready: false })
  assert.equal(await t.state(() => window.__game.state.phase), 'safety')
  assert.equal(await t.state(() => window.__game.party.public.phase), 'safety')
  assert.equal(await t.state(() => window.__game.party.views.p1.safe), false)
  t.say('p1', { shot: SQUARE }) // too soon: ignored
  t.say('p1', { safe: true })
  await t.page.waitForFunction(() => window.__game.party.views.p1.safe === true)
  assert.equal(await t.state(() => window.__game.state.phase), 'safety', 'started before Bo had read it')
  t.say('p2', { safe: true })
  await t.page.waitForFunction(() => window.__game.state.phase === 'aim')
  assert.equal(await t.state(() => window.__game.state.shot), null)
  assert.deepEqual(t.errors, [])
  await t.page.close()
})

test('the TV can start anyway once the safety screen has been up a moment, and it shows once per party', async () => {
  const t = await tv()
  await startParty(t, [['p1', 'Ada']], { ready: false })
  await key(t.page, 'Enter') // straight away: too soon to skip
  assert.equal(await t.state(() => window.__game.state.phase), 'safety')
  await t.page.waitForFunction(() => window.__game.state.safetyTime > window.__game.TUNING.safetyMin)
  await key(t.page, 'Enter')
  await t.page.waitForFunction(() => window.__game.state.phase === 'aim')
  // Ada still sees the card on her phone until she taps I'm ready.
  assert.equal(await t.state(() => window.__game.party.views.p1.safe), false)
  t.say('p1', { safe: true })
  await t.page.waitForFunction(() => window.__game.party.views.p1.safe === true)
  // Choosing another game starts a new game in the same party: no safety screen again.
  await key(t.page, 'Escape')
  await t.page.waitForFunction(() => window.__game.state.screen === 'paused')
  await t.page.evaluate(() => window.__game.pauseMenu.select('pick'))
  await key(t.page, 'Enter')
  await t.page.waitForFunction(() => window.__game.state.screen === 'pick')
  t.say('p1', { menu: { id: 'targets' } })
  await t.page.waitForFunction(() => window.__game.state.mode === 'targets' && window.__game.state.screen === 'playing')
  assert.equal(await t.state(() => window.__game.state.phase), 'aim')
  await t.page.close()
})

test('playing on this screen with a controller has no safety screen: nobody swings a phone', async () => {
  const t = await tv()
  await key(t.page, 'ArrowDown')
  await key(t.page, 'Enter') // Play on this screen
  await t.page.waitForFunction(() => window.__game.state.screen === 'pick')
  await key(t.page, 'Enter') // the driving range
  await t.page.waitForFunction(() => window.__game.state.screen === 'playing')
  assert.equal(await t.state(() => window.__game.state.phase), 'aim')
  await t.page.close()
})

test('a phone can work the whole pause menu, settings included, without touching the TV', async () => {
  const t = await tv()
  await startParty(t, [['p1', 'Ada'], ['p2', 'Bo']])
  t.say('p2', { pause: true }) // anyone's phone, not just whoever is up
  await t.page.waitForFunction(() => window.__game.party.public.menu?.title === 'Paused')
  const menu = await t.state(() => window.__game.party.public.menu)
  assert.equal(menu.title, 'Paused')
  assert.deepEqual(menu.items.map((i) => i.id), ['resume', 'restart', 'pick', 'settings', 'title'])
  // Into Settings, change a value, back out, resume.
  t.say('p2', { menu: { id: 'settings' } })
  await t.page.waitForFunction(() => window.__game.state.screen === 'settings')
  await t.page.waitForFunction(() => window.__game.party.public.menu?.title === 'Settings')
  const before = await t.state(() => window.__game.settings.data.strength)
  t.say('p2', { menu: { id: 'strength', step: 1 } })
  await t.page.waitForFunction((b) => window.__game.settings.data.strength !== b, before)
  const shown = await t.state(() => window.__game.party.public.menu.items.find((i) => i.id === 'strength').value)
  assert.ok(['Less', 'Normal', 'More'].includes(shown))
  t.say('p2', { menu: { back: true } })
  await t.page.waitForFunction(() => window.__game.party.public.menu?.title === 'Paused')
  t.say('p1', { menu: { id: 'resume' } })
  await t.page.waitForFunction(() => window.__game.state.screen === 'playing' && window.__game.party.public.menu === null)
  assert.deepEqual(t.errors, [])
  await t.page.close()
})

test('each player plays as a different bean of the crew, in that bean\u2019s colour, and their phone says which', async () => {
  const t = await tv()
  await startParty(t, [['p1', 'Ada'], ['p2', 'Bo'], ['p3', 'Cy']])
  const seats = await t.state(() => window.__game.state.seats.map((s) => ({ golfer: s.crew.name, color: s.color })))
  assert.deepEqual(seats.map((s) => s.golfer), ['Pip', 'Coral', 'Finn'])
  assert.equal(new Set(seats.map((s) => s.color)).size, 3)
  assert.deepEqual(await t.state(() => window.__game.party.views.p2.golfer), { name: 'Coral', color: seats[1].color })
  // Someone joining mid-game takes the next golfer.
  t.phone('p4', 'Di')
  await t.page.waitForFunction(() => window.__game.state.seats.length === 4)
  assert.equal(await t.state(() => window.__game.state.seats[3].crew.name), 'Bobo')
  assert.deepEqual(t.errors, [])
  await t.page.close()
})

test('an open club face curves the ball right of the aim line', async () => {
  const t = await tv()
  await startParty(t, [['p1', 'Ada']])
  t.say('p1', { shot: { ...SQUARE, face: 12 } })
  await t.page.waitForFunction(() => window.__game.state.phase === 'result', null, { timeout: 10000 })
  const r = await t.state(() => window.__game.state.shot.result)
  assert.ok(r.offline > 10, `finished ${r.offline} yd offline`)
  assert.match(r.shape, /fade|slice/i)
  await t.page.close()
})

test('turns pass between phones, and a shot out of turn is ignored', async () => {
  const t = await tv()
  await startParty(t, [['p1', 'Ada'], ['p2', 'Bo']])
  t.say('p2', { shot: SQUARE }) // not Bo's turn
  await t.page.waitForTimeout(200)
  assert.equal(await t.state(() => window.__game.state.phase), 'aim')
  t.say('p1', { shot: SQUARE })
  await t.page.waitForFunction(() => window.__game.state.phase === 'result', null, { timeout: 10000 })
  await t.page.waitForTimeout(700)
  await key(t.page, 'Enter') // skip the readout
  await t.page.waitForFunction(() => window.__game.state.phase === 'aim')
  assert.equal(await t.state(() => window.__game.party.public.turnName), 'Bo')
  assert.equal(await t.state(() => window.__game.party.views.p2.active), true)
  assert.equal(await t.state(() => window.__game.party.views.p1.active), false)
  await t.page.close()
})

test('the Target challenge gives each player ten balls, then ranks them', async () => {
  const t = await tv()
  await chooseMode(t, 1)
  await startParty(t, [['p1', 'Ada']])
  assert.equal(await t.state(() => window.__game.state.mode), 'targets')
  // Aim at the 135-yard green with a 7 iron (135 / 155 = 87% power, an 87% backswing): bullseyes.
  t.say('p1', { club: 3 })
  await t.page.waitForFunction(() => window.__game.state.seats[0].club === 3)
  await t.page.evaluate(() => (window.__game.state.seats[0].aim = (Math.atan2(-6, 135) * 180) / Math.PI))
  for (let i = 0; i < 10; i++) {
    await t.page.waitForFunction(() => window.__game.state.phase === 'aim' || window.__game.state.screen === 'gameover')
    t.say('p1', { shot: { ...SQUARE, back: Math.round(200 * 0.87) } })
    await t.page.waitForFunction(() => window.__game.state.phase === 'result', null, { timeout: 10000 })
    await t.page.waitForTimeout(650)
    await key(t.page, 'Enter')
    await t.page.waitForFunction((n) => window.__game.state.phase !== 'result' || window.__game.state.screen === 'gameover', i)
  }
  await t.page.waitForFunction(() => window.__game.state.screen === 'gameover')
  const seat = await t.state(() => window.__game.state.seats[0])
  assert.equal(seat.shots.length, 10)
  assert.ok(seat.shots.every((s) => s.points > 0), JSON.stringify(seat.shots.map((s) => [s.carry, s.offline, s.points])))
  assert.equal(await t.state(() => window.__game.party.public.phase), 'over')
  await t.page.waitForFunction(() => window.__game.party.public.menu?.title === 'Challenge over')
  assert.deepEqual((await t.state(() => window.__game.party.public.menu)).items.map((i) => i.id), ['again', 'pick', 'title'])
  // The scorecard: one card in the middle of the screen, its buttons under the player's row.
  await t.page.waitForTimeout(100)
  const tiles = await t.state(() => window.__game.overMenu.items.map((_, i) => window.__game.overMenu.rect(i)))
  const cardTop = tiles[0].y - 28 - 68 - 122 // the gap, one player's row, the heading
  const cardBottom = tiles.at(-1).y + tiles.at(-1).h + 30
  assert.ok(cardTop > 0 && cardBottom < 800, `the card fits the screen: ${cardTop} to ${cardBottom}`)
  assert.ok(Math.abs((cardTop + cardBottom) / 2 - 400) <= 1, `the card is centred: ${cardTop} to ${cardBottom}`)
  // A click on its second tile opens the game picker; Back returns to the results.
  await t.page.mouse.click(tiles[1].x + tiles[1].w / 2, tiles[1].y + tiles[1].h / 2)
  await t.page.waitForFunction(() => window.__game.state.screen !== 'gameover')
  await key(t.page, 'Backspace')
  await t.page.waitForFunction(() => window.__game.state.screen === 'gameover')
  t.say('p1', { menu: { id: 'again' } })
  await t.page.waitForFunction(() => window.__game.state.screen === 'playing' && window.__game.state.seats[0].shots.length === 0)
  await t.page.close()
})

/** The game startParty's first phone picks: practice → targets → putting → putts → course, by index. */
async function chooseMode(t, steps) {
  t.mode = ['practice', 'targets', 'putting', 'putts', 'course'][steps]
}
/** A phone putt: its stroke speed at impact (deg/s), square. */
const putt = (speed) => ({ speed, peak: speed, face: 0, path: 0, back: 12, tempo: 1.6, hand: 'R', ms: 0 })
/** Send a putt, wait for it to finish, skip the readout and wait for whatever comes next. */
async function puttAndWait(t, id, speed) {
  t.say(id, { shot: putt(speed) })
  await t.page.waitForFunction(() => window.__game.state.phase === 'result', null, { timeout: 10000 })
  await t.page.waitForTimeout(650)
  await key(t.page, 'Enter')
  await t.page.waitForFunction(() => window.__game.state.phase === 'aim' || window.__game.state.screen === 'gameover')
}

test('on the putting green a phone gets the putter and the putting reader, and its stroke rolls the ball', async () => {
  const t = await tv()
  await chooseMode(t, 2)
  await startParty(t, [['p1', 'Ada']])
  assert.equal(await t.state(() => window.__game.state.mode), 'putting')
  const pub = await t.state(() => window.__game.party.public)
  assert.deepEqual(pub.clubs, [{ short: 'PT', sub: 'putter' }])
  assert.equal(pub.swing.minHit, 20) // the putting stroke's reader, not the full swing's
  assert.match(await t.state(() => window.__game.party.views.p1.putt), /^[\d.]+ ft · (flat|uphill|downhill)/)
  t.say('p1', { club: 3 }) // there's only the putter
  await t.page.waitForTimeout(150)
  assert.equal(await t.state(() => window.__game.state.seats[0].club), 0)
  const start = await t.state(() => window.__game.state.seats[0].ball)
  t.say('p1', { shot: putt(60) })
  await t.page.waitForFunction(() => window.__game.state.phase === 'result', null, { timeout: 10000 })
  const sh = await t.state(() => ({ rest: window.__game.state.shot.roll.rest, from: window.__game.state.shot.from, last: window.__game.party.views.p1.last, shots: window.__game.state.seats[0].shots }))
  assert.deepEqual(sh.from, start)
  const rolled = Math.hypot(sh.rest.x - start.x, sh.rest.z - start.z)
  // 60°/s ≈ 1.7 m/s ≈ 2.3 m on the flat; practice putts come from random spots, up or down the slope.
  assert.ok(rolled > 0.8 && rolled < 5, `rolled ${rolled} m`)
  assert.equal(sh.shots.length, 1)
  assert.match(sh.last, /ft/)
  assert.deepEqual(t.errors, [])
  await t.page.close()
})

test('the Putting challenge: farthest from the cup putts next, putts are counted per hole, fewest wins', async () => {
  const t = await tv()
  await chooseMode(t, 3)
  await t.page.evaluate(() => (window.__game.TUNING.putting.holes = 2)) // two holes keep the test short
  await startParty(t, [['p1', 'Ada'], ['p2', 'Bo']])
  assert.equal(await t.state(() => window.__game.state.mode), 'putts')
  assert.match(await t.state(() => window.__game.party.public.ballsLeft), /^Hole 1 of 2/)
  assert.equal(await t.state(() => window.__game.party.public.turnName), 'Ada')
  await puttAndWait(t, 'p1', 50) // Ada rolls it up, but not in: Bo is now farther
  assert.equal(await t.state(() => window.__game.party.public.turnName), 'Bo')
  await puttAndWait(t, 'p2', 1) // Bo barely moves it: still farthest, Bo again
  assert.equal(await t.state(() => window.__game.party.public.turnName), 'Bo')
  await puttAndWait(t, 'p2', 1)
  // From here every putt is a gimme (in, one more putt): Bo 4 on hole 1, Ada 3.
  await t.page.evaluate(() => (window.__game.TUNING.putting.gimme = 1000))
  await puttAndWait(t, 'p2', 1)
  await puttAndWait(t, 'p1', 1)
  assert.match(await t.state(() => window.__game.party.public.ballsLeft), /^Hole 2 of 2/)
  const cards = await t.state(() => window.__game.state.seats.map((s) => s.card))
  assert.deepEqual(cards, [[3], [4]])
  await puttAndWait(t, 'p1', 1)
  await puttAndWait(t, 'p2', 1)
  await t.page.waitForFunction(() => window.__game.state.screen === 'gameover')
  assert.deepEqual(await t.state(() => window.__game.state.seats.map((s) => s.card)), [[3, 2], [4, 2]])
  assert.equal(await t.state(() => window.__game.party.public.cards.map((c) => `${c.name} ${c.score}`).join(', ')), 'Ada 5, Bo 6')
  // Results on the phones; Choose a game opens the picker, and putting practice starts.
  await t.page.waitForFunction(() => window.__game.party.public.menu?.title === 'Challenge over')
  t.say('p2', { menu: { id: 'pick' } })
  await t.page.waitForFunction(() => window.__game.party.public.menu?.title === 'What are we playing?')
  t.say('p2', { menu: { id: 'putting' } })
  await t.page.waitForFunction(() => window.__game.state.screen === 'playing' && window.__game.state.mode === 'putting')
  assert.deepEqual(t.errors, [])
  await t.page.close()
})

test('with the help on, the aim allows for the break and a stroke back to the phone’s mark sinks the putt', async () => {
  const t = await tv()
  await chooseMode(t, 2)
  await startParty(t, [['p1', 'Ada']])
  for (let i = 0; i < 3; i++) {
    // Each practice putt (short, middling, long): the help has read it.
    const read = await t.state(() => ({ plan: window.__game.state.seats[0].plan, paim: window.__game.state.seats[0].paim, mark: window.__game.party.views.p1.puttMark, backFull: window.__game.party.public.swing.backFull }))
    assert.equal(read.paim, read.plan.aim)
    assert.ok(read.mark > 0 && read.mark < 1.2, `mark ${read.mark}`)
    t.say('p1', { shot: { ...putt(400), back: read.mark * read.backFull } })
    await t.page.waitForFunction(() => window.__game.state.phase === 'result', null, { timeout: 10000 })
    assert.equal(await t.state(() => window.__game.state.shot.roll.holed), true, `putt ${i + 1} missed`)
    await t.page.waitForTimeout(650)
    await key(t.page, 'Enter')
    await t.page.waitForFunction(() => window.__game.state.phase === 'aim')
  }
  assert.deepEqual(t.errors, [])
  await t.page.close()
})

test('the Wardrobe: a phone dresses its bean, the TV shows it and remembers it by name', async () => {
  const t = await tv()
  await startParty(t, [['p1', 'Ada'], ['p2', 'Bo']])
  const pub = await t.state(() => window.__game.party.public.wardrobe)
  assert.deepEqual(Object.keys(pub), ['hat', 'top', 'acc'])
  assert.deepEqual(pub.hat.map((o) => o.id), ['none', 'bucket', 'shark'])
  // Bo (not up) changes hat and extra; the bean on screen wears them.
  t.say('p2', { outfit: { hat: 'shark', acc: 'snorkel' } })
  await t.page.waitForFunction(() => window.__game.state.seats[1].look.outfit.hat === 'shark')
  const seat = await t.state(() => window.__game.state.seats[1])
  assert.deepEqual(seat.look.outfit, { hat: 'shark', top: 'hawaiian', acc: 'snorkel' })
  assert.deepEqual(await t.state(() => window.__game.party.views.p2.outfit), seat.look.outfit)
  await t.page.waitForFunction((id) => window.__game.view.lookOf(id)?.hat === 'shark' && window.__game.view.lookOf(id)?.acc === 'snorkel', seat.look.id)
  // Nonsense is ignored.
  t.say('p2', { outfit: { hat: 'crown', top: 42 } })
  await t.page.waitForTimeout(150)
  assert.deepEqual(await t.state(() => window.__game.state.seats[1].look.outfit), seat.look.outfit)
  // Remembered by name: Bo plays again in the same outfit.
  assert.deepEqual(await t.state(() => JSON.parse(localStorage.getItem('big-swing-golf-save-v1')).outfits.Bo), seat.look.outfit)
  await t.page.evaluate(() => window.__game.state.seats.length = 0)
  t.say('p1', { pause: true })
  await t.page.waitForFunction(() => window.__game.party.public.menu?.title === 'Paused')
  t.say('p1', { menu: { id: 'restart' } })
  await t.page.waitForFunction(() => window.__game.state.seats.length === 2)
  assert.deepEqual(await t.state(() => window.__game.state.seats[1].look.outfit), seat.look.outfit)
  assert.deepEqual(t.errors, [])
  await t.page.close()
})

test('faces follow the moment: focused at address, a cheer for a pure drive, idle while waiting', async () => {
  const t = await tv()
  await startParty(t, [['p1', 'Ada'], ['p2', 'Bo']])
  const ids = await t.state(() => window.__game.state.seats.map((s) => s.look.id))
  await t.page.waitForFunction((id) => window.__game.view.lookOf(id)?.face === 'focus', ids[0])
  await t.page.waitForFunction((id) => window.__game.view.lookOf(id)?.face === 'idle', ids[1])
  // Ada strains on the downswing (the phone says it's coming down).
  t.input('p1', { a: true, swp: 'down', sw: -20 })
  await t.page.waitForFunction((id) => window.__game.view.lookOf(id)?.face === 'effort', ids[0])
  t.input('p1', {})
  t.say('p1', { shot: SQUARE })
  await t.page.waitForFunction(() => window.__game.state.phase === 'result', null, { timeout: 10000 })
  await t.page.waitForFunction((id) => window.__game.view.lookOf(id)?.face === 'cheer', ids[0])
  assert.deepEqual(t.errors, [])
  await t.page.close()
})

test('the sculpted bean models load, and the wardrobe and faces work on them too', async () => {
  const t = await tv({ query: '?models' }) // no GPU here: light mode would keep the simple beans
  await t.page.waitForFunction(() => window.__game.view.modelBeans, null, { timeout: 30000 })
  await startParty(t, [['p1', 'Ada'], ['p2', 'Bo']])
  const ids = await t.state(() => window.__game.state.seats.map((s) => s.look.id))
  await t.page.waitForFunction((id) => window.__game.view.lookOf(id)?.face === 'focus', ids[0])
  t.say('p2', { outfit: { hat: 'bucket', top: 'polo', acc: 'lei' } })
  await t.page.waitForFunction((id) => {
    const l = window.__game.view.lookOf(id)
    return l?.hat === 'bucket' && l.top === 'polo' && l.acc === 'lei'
  }, ids[1])
  t.say('p2', { outfit: { hat: 'none', acc: 'none' } })
  await t.page.waitForFunction((id) => window.__game.view.lookOf(id)?.hat === 'none' && window.__game.view.lookOf(id)?.acc === 'none', ids[1])
  assert.deepEqual(t.errors, [])
  await t.page.close()
})

test('with no GPU (light mode) the game keeps the simple beans and never loads the models', async () => {
  const t = await tv()
  await t.page.waitForTimeout(1500)
  assert.equal(await t.state(() => window.__game.view.light), true)
  assert.equal(await t.state(() => window.__game.view.modelBeans), false)
  await t.page.close()
})

test('the title rail has a Wardrobe: playing on this screen, the bean wears what you picked, and it is remembered', async () => {
  const t = await tv()
  assert.deepEqual(await t.state(() => window.__game.titleMenu.items.map((i) => i.id)), ['party', 'solo', 'wardrobe', 'settings'])
  for (let i = 0; i < 2; i++) await key(t.page, 'ArrowDown')
  await key(t.page, 'Enter') // Wardrobe
  await t.page.waitForFunction(() => window.__game.state.screen === 'wardrobe')
  await key(t.page, 'ArrowRight') // Hat: from Pip's bucket hat to the next one, the shark-fin cap
  const hat = await t.state(() => JSON.parse(localStorage.getItem('big-swing-golf-save-v1')).outfits.Pip.hat)
  assert.equal(hat, 'shark')
  await key(t.page, 'Escape') // back to the rail
  await t.page.waitForFunction(() => window.__game.state.screen === 'title')
  await key(t.page, 'ArrowUp') // from Wardrobe up to Play on this screen
  await key(t.page, 'Enter') // Play on this screen
  await t.page.waitForFunction(() => window.__game.state.screen === 'pick')
  await key(t.page, 'Enter') // the driving range
  await t.page.waitForFunction(() => window.__game.state.screen === 'playing')
  assert.equal(await t.state(() => window.__game.state.seats[0].look.outfit.hat), 'shark')
  assert.deepEqual(t.errors, [])
  await t.page.close()
})

test('the sculpted golfer holds the grip with bent elbows, not arms stretched straight out', async () => {
  const t = await tv({ query: '?models' })
  await t.page.waitForFunction(() => window.__game.view.modelBeans, null, { timeout: 60000 })
  await startParty(t, [['p1', 'Ada']])
  await t.page.waitForFunction(() => window.__game.view.armsOf(window.__game.state.seats[0].look.id)?.[0])
  const arms = await t.state(() => window.__game.view.armsOf(window.__game.state.seats[0].look.id))
  for (const arm of arms) {
    assert.ok(arm.elbow >= 15 && arm.elbow <= 120, `elbow bent ${arm.elbow}° (${JSON.stringify(arms)})`)
    assert.ok(arm.grow <= 2.2, `arms grown ${arm.grow}×`)
  }
  assert.deepEqual(t.errors, [])
  await t.page.close()
})

test('the golfer holds the club that is picked: the driver, then a wedge from the phone', async () => {
  const t = await tv()
  await startParty(t, [['p1', 'Ada']])
  const held = () => t.state(() => window.__game.view.clubOf(window.__game.state.seats[0].look.id))
  await t.page.waitForFunction(() => window.__game.view.clubOf(window.__game.state.seats[0].look.id) === 'dr')
  t.say('p1', { club: 6 }) // the sand wedge
  await t.page.waitForFunction(() => window.__game.view.clubOf(window.__game.state.seats[0].look.id) === 'sw')
  assert.equal(await held(), 'sw')
  assert.deepEqual(t.errors, [])
  await t.page.close()
})

test('inside the launcher the title rail ends with Quit to library, and choosing it goes back to the games', async () => {
  const t = await tv({ launcher: true })
  assert.deepEqual(await t.state(() => window.__game.titleMenu.items.map((i) => i.id)), ['party', 'solo', 'wardrobe', 'settings', 'quit-to-library'])
  // The rail keeps its first tile under the logo, and the last one clear of the prompts.
  const [first, last] = await t.state(() => [window.__game.titleMenu.rect(0), window.__game.titleMenu.rect(4)])
  assert.ok(first.y >= 230, `first tile at ${first.y}`)
  assert.ok(last.y + last.h <= 740, `last tile ends at ${last.y + last.h}`)
  for (let i = 0; i < 4; i++) await key(t.page, 'ArrowDown')
  await key(t.page, 'Enter')
  assert.equal(await t.state(() => window.__quits), 1)
  assert.deepEqual(t.errors, [])
  await t.page.close()
})

test('paused, the menu is the clubhouse rail down the left (Quit to library in the launcher), and the course goes soft behind it', async () => {
  const t = await tv({ launcher: true })
  await soloGame(t)
  await key(t.page, 'Escape')
  await t.page.waitForFunction(() => window.__game.state.screen === 'paused')
  await frames(t.page)
  const ids = await t.state(() => window.__game.pauseMenu.items.map((i) => i.id))
  assert.deepEqual(ids, ['resume', 'restart', 'pick', 'settings', 'title', 'quit-to-library'])
  const rects = await t.state(() => window.__game.pauseMenu.items.map((_, i) => window.__game.pauseMenu.rect(i)))
  for (const r of rects) assert.ok(r.x >= 0 && r.x + r.w <= 400, `tile inside the rail: ${r.x}..${r.x + r.w}`)
  assert.ok(rects.at(-1).y + rects.at(-1).h <= 740, 'clear of the prompts')
  assert.equal(await t.state(() => window.__game.hud.pauseRail), true)
  assert.match(await t.page.evaluate(() => document.getElementById('gl').style.filter), /blur/)
  await key(t.page, 'Enter') // Resume
  await t.page.waitForFunction(() => window.__game.state.screen === 'playing')
  assert.equal(await t.page.evaluate(() => document.getElementById('gl').style.filter), '')
  assert.deepEqual(t.errors, [])
  await t.page.close()
})

test('outside the launcher the title has no Quit tile: a browser tab can’t close itself', async () => {
  const t = await tv()
  assert.ok(!(await t.state(() => window.__game.titleMenu.items.some((i) => i.id === 'quit-to-library'))))
  await t.page.close()
})

test('Graphics: Low is light mode, and High asks for full quality even on a machine with no GPU', async () => {
  const t = await tv()
  assert.equal(await t.state(() => window.__game.settings.data.graphics), 'low') // no GPU here: Low by default
  assert.equal(await t.state(() => window.__game.view.light), true)
  await t.page.evaluate(() => window.__game.view.setGraphics('high'))
  assert.equal(await t.state(() => window.__game.view.light), false)
  assert.equal(await t.state(() => window.__game.view.lighting.low), false)
  await t.page.evaluate(() => window.__game.view.setGraphics('low'))
  assert.equal(await t.state(() => window.__game.view.light), true)
  assert.equal(await t.state(() => window.__game.view.lighting.low), true)
  assert.deepEqual(t.errors, [])
  await t.page.close()
})

/** Make the browser's software renderer report a real GPU, so the game sees one. */
const realGpu = () => {
  for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
    const get = C.prototype.getParameter
    C.prototype.getParameter = function (p) {
      return p === 0x9246 || p === this.RENDERER ? 'ANGLE (NVIDIA GeForce RTX 3060)' : get.call(this, p)
    }
  }
}

test('on a machine with a GPU, Graphics starts on High, and a save that said Auto moves to High', async () => {
  for (const saved of [null, 'auto']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.addInitScript(realGpu)
    if (saved) await page.addInitScript((g) => localStorage.setItem('big-swing-golf-settings-v1', JSON.stringify({ graphics: g })), saved)
    await page.goto(base)
    await page.waitForFunction(() => window.__game?.state?.screen === 'title')
    await page.evaluate(() => (window.__game.view.renderer.render = () => {}))
    assert.equal(await page.evaluate(() => window.__game.settings.data.graphics), 'high', `saved: ${saved}`)
    assert.equal(await page.evaluate(() => window.__game.view.light), false)
    assert.deepEqual(await page.evaluate(() => window.__game.settingsMenu.items.find((i) => i.id === 'graphics').options.map((o) => o.value)), ['high', 'low'])
    await page.close()
  }
})

test('High draws at the screen\u2019s own sharpness (a 2× screen gets twice the pixels, a 4K TV is capped), Low at half', async () => {
  const t = await tv()
  await t.page.evaluate(() => window.__game.view.setGraphics('high'))
  await t.page.evaluate(() => window.__game.view.setSharpness(2))
  assert.equal(await t.state(() => window.__game.view.renderer.getPixelRatio()), 2)
  await t.page.evaluate(() => window.__game.view.setSharpness(3)) // 4K: no more than 2560 pixels across
  assert.equal(await t.state(() => window.__game.view.renderer.getPixelRatio()), 2560 / 1280)
  await t.page.evaluate(() => window.__game.view.setGraphics('low'))
  assert.equal(await t.state(() => window.__game.view.renderer.getPixelRatio()), 0.5)
  await t.page.close()
})

const frames = (page, n = 2) => page.evaluate((n) => new Promise((ok) => { const step = (k) => (k ? requestAnimationFrame(() => step(k - 1)) : ok()); step(n) }), n)

test('a phone picks left-handed: the bean turns round, swings play left-handed however the phone was held, and it is remembered by name', async () => {
  const t = await tv()
  await startParty(t, [['p1', 'Ada'], ['p2', 'Bo']])
  assert.equal(await t.state(() => window.__game.party.views.p1.hand), 'R') // until you pick: right-handed
  t.say('p1', { hand: 'L' })
  await t.page.waitForFunction(() => window.__game.state.seats[0].hand === 'L')
  assert.equal(await t.state(() => window.__game.party.views.p1.hand), 'L')
  assert.equal(await t.state(() => JSON.parse(localStorage.getItem('big-swing-golf-save-v1')).hands.Ada), 'L')
  // Restarting builds the seats afresh from the players: Ada is still left-handed.
  await t.page.evaluate(() => (window.__game.state.seats[0].hand = null))
  t.say('p1', { pause: true })
  await t.page.waitForFunction(() => window.__game.party.public.menu?.title === 'Paused')
  t.say('p1', { menu: { id: 'restart' } })
  await t.page.waitForFunction(() => window.__game.state.screen === 'playing' && window.__game.state.seats[0]?.hand === 'L')
  // A swing the phone reads as right-handed still plays left-handed: the pick wins.
  t.say('p1', { shot: { ...SQUARE, hand: 'R' } })
  await t.page.waitForFunction(() => window.__game.state.phase === 'result', null, { timeout: 10000 })
  assert.equal(await t.state(() => window.__game.state.seats[0].hand), 'L')

  assert.deepEqual(t.errors, [])
  await t.page.close()
})

test('a player who never picks stays right-handed, however each swing was held: the bean never flips sides', async () => {
  const t = await tv()
  await startParty(t, [['p1', 'Ada']])
  for (const hand of ['L', 'R', 'L']) {
    t.say('p1', { shot: { ...SQUARE, hand } })
    await t.page.waitForFunction(() => window.__game.state.phase === 'result', null, { timeout: 10000 })
    assert.equal(await t.state(() => window.__game.state.seats[0].hand), 'R')
    await t.page.evaluate(() => window.__game.state.phase === 'result' && (window.__game.state.resultTime = 99))
    await t.page.waitForFunction(() => window.__game.state.phase === 'aim')
  }
  assert.deepEqual(t.errors, [])
  await t.page.close()
})

test('playing on this screen, Swing in the title Wardrobe picks right- or left-handed', async () => {
  const t = await tv()
  for (let i = 0; i < 2; i++) await key(t.page, 'ArrowDown')
  await key(t.page, 'Enter') // Wardrobe
  await t.page.waitForFunction(() => window.__game.state.screen === 'wardrobe')
  assert.deepEqual(await t.state(() => window.__game.wardrobeMenu.items.map((i) => i.id)), ['hat', 'top', 'acc', 'hand', 'done'])
  for (let i = 0; i < 3; i++) await key(t.page, 'ArrowDown')
  await key(t.page, 'ArrowRight') // Swing: Left-handed
  assert.equal(await t.state(() => window.__game.settings.data.hand), 'L')
  await key(t.page, 'Escape')
  await t.page.waitForFunction(() => window.__game.state.screen === 'title')
  await key(t.page, 'ArrowUp')
  await key(t.page, 'Enter') // Play on this screen
  await t.page.waitForFunction(() => window.__game.state.screen === 'pick')
  await key(t.page, 'Enter') // the driving range
  await t.page.waitForFunction(() => window.__game.state.screen === 'playing')
  assert.equal(await t.state(() => window.__game.state.seats[0].hand), 'L')
  assert.deepEqual(t.errors, [])
  await t.page.close()
})

test('every menu’s words stay inside their boxes at every text size, and the Settings list scrolls to keep the selected row on screen', async () => {
  const t = await tv()
  const H = 800
  for (const size of [1, 1.25, 1.5]) {
    await t.page.evaluate((size) => (window.__game.settings.data.textScale = size), size)
    // The title rail and its card: every tile.
    for (const id of ['party', 'solo', 'wardrobe', 'settings']) {
      await t.page.evaluate((id) => window.__game.titleMenu.select(id), id)
      await frames(t.page)
      assert.deepEqual(await t.state(() => window.__game.overflow), [], `title, ${id}, text ${size}`)
    }
    // The game picker: every game, and its card.
    await t.page.evaluate(() => (window.__game.state.screen = 'pick'))
    for (const id of ['practice', 'targets', 'putting', 'putts', 'course', 'back']) {
      await t.page.evaluate((id) => window.__game.pickMenu.select(id), id)
      await frames(t.page)
      assert.deepEqual(await t.state(() => window.__game.overflow), [], `picker, ${id}, text ${size}`)
    }
    // The Wardrobe with its longest choices.
    await t.page.evaluate(() => {
      const g = window.__game
      for (const it of g.wardrobeMenu.items) if (it.type) it.value = it.options.reduce((a, b) => (b.label.length > a.label.length ? b : a)).value
      g.state.screen = 'wardrobe'
    })
    await frames(t.page)
    assert.deepEqual(await t.state(() => window.__game.overflow), [], `wardrobe, text ${size}`)
    // Settings: each row in turn is on screen, and nothing spills.
    await t.page.evaluate(() => (window.__game.state.from = 'title') && (window.__game.state.screen = 'settings'))
    const ids = await t.state(() => window.__game.settingsMenu.items.map((i) => i.id))
    for (const id of ids) {
      await t.page.evaluate((id) => window.__game.settingsMenu.select(id), id)
      await frames(t.page)
      const r = await t.page.evaluate(() => {
        const m = window.__game.settingsMenu
        return m.rect(m.items.indexOf(m.selected))
      })
      assert.ok(r.y >= 0 && r.y + r.h <= H, `${id} at y ${r.y} (text ${size})`)
      assert.deepEqual(await t.state(() => window.__game.overflow), [], `settings, ${id}, text ${size}`)
    }
    await t.page.evaluate(() => (window.__game.state.screen = 'title'))
  }
  assert.deepEqual(t.errors, [])
  await t.page.close()
})

test('the course: two phones tee off in turn, the farthest from the pin plays next, the green switches to putting, holing out moves everyone to the next tee, and the third hole ends the round with a scorecard', async () => {
  const t = await tv()
  await chooseMode(t, 4) // the course
  await startParty(t, [['p1', 'Ada'], ['p2', 'Bo']])
  assert.equal(await t.state(() => window.__game.state.mode), 'course')
  assert.equal(await t.state(() => window.__game.party.public.putting), false)
  // The driver to start (the game picks the club for the distance).
  assert.equal(await t.state(() => window.__game.state.seats[0].club), 0)
  const next = async () => {
    await t.page.evaluate(() => (window.__game.state.resultTime = 99))
    await t.page.waitForFunction(() => window.__game.state.phase === 'aim')
  }
  // Ada drives; then Bo, still on the tee, is the farthest away.
  t.say('p1', { shot: SQUARE })
  await t.page.waitForFunction(() => window.__game.state.phase === 'result', null, { timeout: 15000 })
  const ada = await t.state(() => window.__game.state.seats[0])
  assert.equal(ada.strokes, 1)
  // Aimed down the fairway round the bend (not at the pin): a full square drive finds it.
  const out = Math.hypot(ada.ball.x - HOLES[0].tee.x, ada.ball.z - HOLES[0].tee.z)
  assert.ok(out > 150, `Ada's drive stopped ${Math.round(out)} m from the tee`)
  assert.ok(distToLine(ada.ball.x, ada.ball.z, HOLES[0].fairway) < FAIRWAY_HALF, `on the fairway: ${Math.round(ada.ball.x)}, ${Math.round(ada.ball.z)}`)
  // No marker left where it stopped: the next shot is played from there, the camera right beside it.
  assert.equal(await t.state(() => window.__game.view.markCount), 0)
  await next()
  assert.equal(await t.state(() => window.__game.party.public.turn), 'p2')
  // Bo tops it: a gentle swing. Then he's still the farthest out, so he plays again.
  t.say('p2', { shot: { ...SQUARE, back: 50, speed: 300 } })
  await t.page.waitForFunction(() => window.__game.state.phase === 'result', null, { timeout: 15000 })
  await next()
  assert.equal(await t.state(() => window.__game.party.public.turn), 'p2')
  // Both on the green (placed there): Bo is farther, so he putts, with the putter.
  await t.page.evaluate(() => {
    const g = window.__game
    const cup = g.state.seats[0].cup
    g.state.seats[0].ball = { x: cup.x, z: cup.z - 0.5 }
    g.state.seats[1].ball = { x: cup.x - 0.6, z: cup.z - 0.6 }
    g.state.resultTime = 99
    g.state.phase = 'result'
  })
  await t.page.waitForFunction(() => window.__game.state.phase === 'aim' && window.__game.party.public.putting === true)
  assert.equal(await t.state(() => window.__game.party.public.turn), 'p2')
  assert.deepEqual(await t.state(() => window.__game.party.public.clubs.map((c) => c.short)), ['PT'])
  // Inside the gimme: any decent stroke finishes it.
  const back = await t.state(() => window.__game.party.views.p2.puttMark * window.__game.party.public.swing.backFull)
  t.say('p2', { shot: { ...putt(400), back } })
  await t.page.waitForFunction(() => window.__game.state.phase === 'result', null, { timeout: 10000 })
  assert.equal(await t.state(() => window.__game.state.seats[1].done), true)
  await next()
  assert.equal(await t.state(() => window.__game.party.public.turn), 'p1')
  const back1 = await t.state(() => window.__game.party.views.p1.puttMark * window.__game.party.public.swing.backFull)
  t.say('p1', { shot: { ...putt(400), back: back1 } })
  await t.page.waitForFunction(() => window.__game.state.phase === 'result', null, { timeout: 10000 })
  // Everyone is in: on to the second tee, the first hole on each card, the hole announced.
  await next()
  assert.equal(await t.state(() => window.__game.state.hole), 1)
  assert.equal(await t.state(() => window.__game.state.banner?.text), 'Hole 2')
  assert.match(await t.state(() => window.__game.state.banner?.sub), /^Beach Hut Bay · par 3 · \d+ yd$/)
  let seats = await t.state(() => window.__game.state.seats.map((s) => ({ strokes: s.strokes, done: s.done, card: s.card, ball: s.ball, cup: s.cup })))
  seats = seats.map((s) => ({ ...s }))
  assert.equal(seats[0].card[0], 2) // a drive and a putt
  assert.ok(seats.every((s) => s.strokes === 0 && !s.done && s.ball.x === HOLES[1].tee.x && s.cup.x === HOLES[1].cup.x), 'both on the second tee, playing to its pin')
  assert.match(await t.state(() => window.__game.party.public.ballsLeft), /^Hole 2 of 3 · Beach Hut Bay · par 3/)
  assert.equal(await t.state(() => window.__game.party.public.turn), 'p1')
  // Holes two and three: both placed by the pin, each holes out with one putt.
  for (const n of [1, 2]) {
    await t.page.evaluate(() => {
      const g = window.__game
      const cup = g.state.seats[0].cup
      g.state.seats[0].ball = { x: cup.x, z: cup.z - 0.5 }
      g.state.seats[1].ball = { x: cup.x - 0.6, z: cup.z - 0.6 }
      g.state.resultTime = 99
      g.state.phase = 'result'
    })
    for (const id of ['p2', 'p1']) {
      await t.page.waitForFunction((id) => window.__game.state.phase === 'aim' && window.__game.party.public.putting === true && window.__game.party.public.turn === id, id)
      const b = await t.page.evaluate((id) => window.__game.party.views[id].puttMark * window.__game.party.public.swing.backFull, id)
      t.say(id, { shot: { ...putt(400), back: b } })
      await t.page.waitForFunction(() => window.__game.state.phase === 'result', null, { timeout: 10000 })
      await t.page.evaluate(() => (window.__game.state.resultTime = 99))
    }
    if (n === 1) await t.page.waitForFunction(() => window.__game.state.hole === 2 && window.__game.state.phase === 'aim')
  }
  await t.page.waitForFunction(() => window.__game.state.screen === 'gameover')
  seats = await t.state(() => window.__game.state.seats.map((s) => ({ done: s.done, card: s.card, newBest: s.newBest })))
  assert.ok(seats.every((s) => s.done))
  assert.deepEqual(seats[0].card, [2, 1, 1]) // a drive and a putt, then a putt on each of the others
  assert.equal(seats[0].newBest, true)
  assert.equal(await t.state(() => window.__game.party.public.cards[0].score), '4 ✓')
  assert.equal(await t.state(() => JSON.parse(localStorage.getItem('big-swing-golf-save-v1')).roundBest.Ada), 4)
  assert.equal(await t.state(() => window.__game.party.public.menu?.title), 'Round over')
  assert.deepEqual(t.errors, [])
  await t.page.close()
})

test('the course: from a bunker the game takes more club and a full swing goes about two-thirds as far', async () => {
  const t = await tv()
  await chooseMode(t, 4) // the course
  await startParty(t, [['p1', 'Ada']])
  const place = (ball, hole = 0) =>
    t.page.evaluate(
      ([ball, cup, hole]) => {
        const g = window.__game.state
        g.hole = hole
        Object.assign(g.seats[0], { ball, cup, strokes: 1, done: false })
        g.resultTime = 99
        g.phase = 'result'
      },
      [ball, HOLES[hole].cup, hole]
    )
  // In the first hole's fairway bunker, about 165 yards out: more club than the 5 iron it would be from grass.
  const trap = HOLES[0].sand[0]
  await place({ x: trap.x, z: trap.z })
  await t.page.waitForFunction(() => window.__game.state.phase === 'aim' && window.__game.state.seats[0].strokes === 1)
  const club = await t.state(() => window.__game.state.seats[0].club)
  assert.ok(club <= 1, `club ${club}: a wood out of the sand`)
  t.say('p1', { shot: SQUARE })
  await t.page.waitForFunction(() => window.__game.state.shot?.result, null, { timeout: 5000 })
  const shot = await t.state(() => ({ carry: window.__game.state.shot.result.carry, club: window.__game.state.shot.club.carry }))
  assert.ok(shot.carry > shot.club * 0.55 && shot.carry < shot.club * 0.78, `carried ${shot.carry} yd with a ${shot.club} yd club`)
  assert.deepEqual(t.errors, [])
  await t.page.close()
})

test('after everyone joins, nobody is thrown onto the range: the phones get “What are we playing?” and any phone picks', async () => {
  const t = await tv()
  await key(t.page, 'Enter') // Play with phones
  await t.page.waitForFunction(() => window.__game.state.screen === 'lobby' && window.__game.party.status === 'open')
  t.phone('p1', 'Ada')
  t.phone('p2', 'Bo')
  await t.page.waitForFunction(() => window.__game.party.players.length === 2)
  await key(t.page, 'Enter') // Start
  await t.page.waitForFunction(() => window.__game.state.screen === 'pick')
  const menu = await t.state(() => window.__game.party.public.menu)
  assert.equal(menu.title, 'What are we playing?')
  assert.deepEqual(menu.items.map((i) => i.id), ['practice', 'targets', 'putting', 'putts', 'course', 'back'])
  assert.ok(menu.items.slice(0, 5).every((i) => i.sub && i.icon), 'each game has a line and an icon for its card')
  // Back to the lobby, and in again; then Bo (not the first to join) picks the course.
  t.say('p2', { menu: { id: 'back' } })
  await t.page.waitForFunction(() => window.__game.state.screen === 'lobby')
  await key(t.page, 'Enter')
  await t.page.waitForFunction(() => window.__game.state.screen === 'pick')
  t.say('p2', { menu: { id: 'course' } })
  await t.page.waitForFunction(() => window.__game.state.screen === 'playing' && window.__game.state.mode === 'course')
  assert.equal(await t.state(() => window.__game.state.seats.length), 2)
  assert.deepEqual(t.errors, [])
  await t.page.close()
})

/** Play on this screen: Enter on the title's second tile, then this game in the picker. */
async function soloGame(t, mode = 'practice') {
  await key(t.page, 'ArrowDown')
  await key(t.page, 'Enter')
  await t.page.waitForFunction(() => window.__game.state.screen === 'pick')
  await t.page.evaluate((m) => window.__game.pickMenu.select(m), mode)
  await key(t.page, 'Enter')
  await t.page.waitForFunction(() => window.__game.state.screen === 'playing' && window.__game.state.phase === 'aim')
}
/** End this turn (as if its readout were skipped) and wait for the next one. */
async function nextTurn(t) {
  await t.page.evaluate(() => Object.assign(window.__game.state, { phase: 'result', resultTime: 99 }))
  await t.page.waitForFunction(() => window.__game.state.phase === 'aim')
}

test('the how-to text shows for the first two turns, then goes quiet; it comes back for someone stood at the ball, and Button hints can force it on or off', async () => {
  const t = await tv()
  await soloGame(t)
  await frames(t.page)
  assert.equal(await t.state(() => window.__game.hud.hint), true, 'first turn')
  await nextTurn(t)
  await frames(t.page)
  assert.equal(await t.state(() => window.__game.hud.hint), true, 'second turn')
  await nextTurn(t)
  await frames(t.page)
  assert.ok(!(await t.state(() => window.__game.hud.hint)), 'third turn: quiet')
  await t.page.evaluate(() => (window.__game.state.aimFor = 8))
  await frames(t.page)
  assert.equal(await t.state(() => window.__game.hud.hint), true, 'stood at the ball a while')
  await t.page.evaluate(() => (window.__game.settings.data.hints = 'off'))
  await frames(t.page)
  assert.ok(!(await t.state(() => window.__game.hud.hint)), 'Off: never')
  await t.page.evaluate(() => Object.assign(window.__game.settings.data, { hints: 'always' }) && (window.__game.state.aimFor = 0))
  await frames(t.page)
  assert.equal(await t.state(() => window.__game.hud.hint), true, 'Always: every turn')
  assert.deepEqual(t.errors, [])
  await t.page.close()
})

test('the scoreboard shows only with two or more players, and the pause button only for mouse and touch', async () => {
  const t = await tv()
  await soloGame(t)
  await frames(t.page)
  let hud = await t.state(() => window.__game.hud)
  assert.ok(!hud.scoreboard, 'one player: no scoreboard')
  assert.ok(!hud.pause, 'keys: Esc pauses, no button')
  await t.page.mouse.move(640, 400)
  await t.page.mouse.move(660, 420)
  await frames(t.page, 3)
  assert.equal(await t.state(() => window.__game.hud.pause), true, 'a mouse: the button')
  await t.page.close()
  const t2 = await tv()
  await startParty(t2, [['p1', 'Ada'], ['p2', 'Bo']])
  await frames(t2.page)
  assert.equal(await t2.state(() => window.__game.hud.scoreboard), true, 'two players: the scoreboard')
  assert.deepEqual(t2.errors, [])
  await t2.page.close()
})

test('after a shot: a phone player’s numbers go to their phone, this screen’s go in one strip, a challenge leaves it to the banner', async () => {
  const t = await tv()
  await startParty(t, [['p1', 'Ada']])
  t.say('p1', { shot: SQUARE })
  await t.page.waitForFunction(() => window.__game.state.phase === 'result', null, { timeout: 10000 })
  await frames(t.page)
  assert.equal(await t.state(() => window.__game.hud.readout), 'phone', 'a pointer to the phone, no table on the TV')
  const banner = await t.state(() => window.__game.state.banner)
  assert.match(banner.chips[0].text, /^\d+ yd$/, 'the carry, first')
  assert.equal(banner.chips[0].gold, true, 'in gold')
  await t.page.close()
  const t1 = await tv()
  await soloGame(t1)
  await key(t1.page, 'Space') // start the meter
  await t1.page.waitForFunction(() => window.__game.state.phase === 'meter')
  await key(t1.page, 'Space')
  await t1.page.waitForTimeout(400)
  await key(t1.page, 'Space')
  await t1.page.waitForFunction(() => window.__game.state.phase === 'result', null, { timeout: 60000 })
  await frames(t1.page)
  assert.equal(await t1.state(() => window.__game.hud.readout), 'strip', 'playing on this screen: one strip')
  await t1.page.close()
  const t2 = await tv()
  await chooseMode(t2, 1) // Target challenge
  await startParty(t2, [['p1', 'Ada']])
  t2.say('p1', { shot: SQUARE })
  await t2.page.waitForFunction(() => window.__game.state.phase === 'result', null, { timeout: 10000 })
  await frames(t2.page)
  assert.ok(!(await t2.state(() => window.__game.hud.readout)), 'no table under the banner')
  assert.ok(await t2.state(() => window.__game.state.banner?.text), 'the banner says it')
  await t2.page.close()
})

test('at the ball the HUD is in the corners and the scene: a hole badge on the course (none on the range), the club card, a name tag and the distance over the flag', async () => {
  const t = await tv()
  await soloGame(t, 'course')
  await frames(t.page)
  let hud = await t.state(() => window.__game.hud)
  assert.equal(hud.badge, 'Par 4')
  assert.equal(hud.club, 'DR Driver')
  assert.equal(hud.nameTag, await t.state(() => window.__game.state.seats[0].name))
  assert.match(hud.pinTag, /^\d+ yd$/)
  await t.page.close()
  const t2 = await tv()
  await soloGame(t2)
  await frames(t2.page)
  hud = await t2.state(() => window.__game.hud)
  assert.ok(!hud.badge, 'the range has no hole to count')
  assert.ok(hud.club && hud.nameTag, 'the club card and name tag still show')
  assert.deepEqual(t2.errors, [])
  await t2.page.close()
})

test('on the putting green the club card is the putter and the flag tag is in feet', async () => {
  const t = await tv()
  await soloGame(t, 'putting')
  await frames(t.page)
  const hud = await t.state(() => window.__game.hud)
  assert.equal(hud.club, 'PT Putter')
  assert.match(hud.pinTag, /^\d+(\.\d)? ft$/)
  await t.page.close()
})

test('the shot panel sits bottom right with the how-to in a card just above it, and with a mouse it moves up clear of the touch buttons', async () => {
  const t = await tv()
  await soloGame(t)
  await frames(t.page)
  let hud = await t.state(() => window.__game.hud)
  const [W, H] = await t.page.evaluate(() => [innerWidth, innerHeight])
  assert.ok(hud.hintPill, 'the how-to shows on the first turn')
  assert.ok(hud.clubCard.x > W / 2, 'the shot panel is on the right, clear of the golfer')
  assert.ok(hud.hintPill.y + hud.hintPill.h <= hud.clubCard.y, 'the how-to is above the shot panel, not on it')
  assert.equal(Math.round(hud.hintPill.x + hud.hintPill.w), Math.round(hud.clubCard.x + hud.clubCard.w), 'their right edges line up')
  assert.ok(hud.clubCard.y + hud.clubCard.h <= H - 20, 'on the bottom edge with keys')
  await t.page.mouse.move(640, 400)
  await t.page.mouse.move(660, 420)
  await frames(t.page, 3)
  hud = await t.state(() => window.__game.hud)
  assert.ok(hud.clubCard.y + hud.clubCard.h < H - 110, 'above the aim buttons')
  await t.page.close()
})

test('the shot panel\u2019s power arc follows the meter as it builds power', async () => {
  const t = await tv()
  await soloGame(t)
  await frames(t.page)
  assert.equal(await t.state(() => window.__game.hud.power), 0, 'empty before the swing')
  await key(t.page, 'Space') // start the meter
  await t.page.waitForFunction(() => window.__game.state.phase === 'meter' && window.__game.state.meter.v > 0.2)
  await frames(t.page)
  const [power, v] = await t.state(() => [window.__game.hud.power, window.__game.state.meter.v])
  assert.ok(power > 0.15 && Math.abs(power - v) < 0.25, `arc at ${power}, meter at ${v}`)
  await t.page.close()
})

test('putting with the meter, its cup mark sits halfway: where the putt’s own bar reaches the cup', async () => {
  const t = await tv()
  await soloGame(t, 'putting')
  await key(t.page, 'Space') // start the meter
  await t.page.waitForFunction(() => window.__game.state.phase === 'meter')
  await frames(t.page)
  const k = await t.state(() => window.__game.hud.meterCup)
  assert.ok(Math.abs(k - 0.5) < 0.02, `cup mark at ${k}`)
  await t.page.close()
})
