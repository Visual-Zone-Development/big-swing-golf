// The phone screen (public/controller.html) in a headless browser, with a stub `controller` in
// place of the party connection and the join page's sensor messages faked from a simulated
// golfer (swing-sim.mjs). Holds SET with the mouse, swings, and checks what goes to the TV.
// Run: node --test games/big-swing-golf/tests/
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { simulateSwing } from './swing-sim.mjs'
import { TUNING } from '../src/tuning.js'

const PAGE = 'file://' + join(import.meta.dirname, '../public/controller.html')
const D = 180 / Math.PI
let browser
let page

before(async () => {
  browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
})
after(() => browser?.close())

async function open(pub = {}) {
  page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: false })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript((pub) => {
    window.__sent = []
    const listeners = {}
    window.controller = {
      public: { phase: 'aim', clubs: [{ short: 'DR', carry: 240 }, { short: '7i', carry: 155 }], swing: {}, ...pub },
      mine: { active: true, club: 0, aim: 0, safe: true },
      me: { name: 'Ada', color: '#ffd23f' },
      players: [],
      on(type, fn) {
        ;(listeners[type] ??= []).push(fn)
      },
      emit(type, v) {
        for (const fn of listeners[type] ?? []) fn(v)
      },
      input(d) {
        window.__input = d
      },
      send(d) {
        window.__sent.push(d)
      },
      vibrate() {}
    }
  }, pub)
  await page.goto(PAGE)
  return errors
}

/** The join page's message: every sample, with its age and the phone's orientation. */
function toJoinPage(samples) {
  const end = samples[samples.length - 1].t
  return samples.map((s) => {
    const [ux, uy, uz] = s.up
    const beta = Math.asin(Math.max(-1, Math.min(1, uy))) * D
    const gamma = Math.atan2(-ux, uz) * D
    // rotationRate is alpha (about x), beta (about y), gamma (about z): the spec's order.
    return { age: end - s.t, a: [0, 0, 0], g: [0, 0, 9.8], w: [s.w[0], s.w[1], s.w[2]], o: [beta, gamma, 0] }
  })
}

async function holdSet() {
  const box = await page.locator('#set').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
}

test('holding SET and swinging sends the shot with its face and club speed', async () => {
  const errors = await open()
  await page.evaluate(() => window.postMessage({ type: 'motion', state: 'on' }, '*'))
  await holdSet()
  const { samples, truth } = simulateSwing({ face: 6, hz: 100 })
  await page.evaluate((s) => window.postMessage({ type: 'motion', s }, '*'), toJoinPage(samples))
  await page.waitForFunction(() => window.__sent.some((d) => d.shot), null, { timeout: 3000 })
  const shot = (await page.evaluate(() => window.__sent)).find((d) => d.shot).shot
  assert.ok(Math.abs(shot.face - truth.face) < 2, `face ${shot.face} vs ${truth.face}`)
  assert.ok(Math.abs(shot.speed - truth.speed) < truth.speed * 0.08, `speed ${shot.speed} vs ${truth.speed}`)
  assert.equal(shot.hand, 'R')
  assert.match(await page.locator('#readout').textContent(), /face 6° right|face 5° right|face 7° right/)
  await page.mouse.up()
  assert.deepEqual(errors, [])
  await page.close()
})

test('while SET is held the TV sees it, and the live swing angle', async () => {
  await open()
  await page.evaluate(() => window.postMessage({ type: 'motion', state: 'on' }, '*'))
  await holdSet()
  // Only the backswing so far.
  const { samples } = simulateSwing({ back: 200 })
  const back = samples.filter((s) => s.t < 1150)
  await page.evaluate((s) => window.postMessage({ type: 'motion', s }, '*'), toJoinPage(back))
  await page.waitForTimeout(100)
  const inp = await page.evaluate(() => window.__input)
  assert.equal(inp.a, true)
  assert.equal(inp.swp, 'back')
  assert.ok(inp.sw > 120, `swing angle ${inp.sw}`)
  await page.mouse.up()
  await page.waitForTimeout(50)
  assert.equal((await page.evaluate(() => window.__input)).a, false)
  assert.equal((await page.evaluate(() => window.__sent)).filter((d) => d.shot).length, 0)
  assert.match(await page.locator('#readout').textContent(), /No swing read/)
  await page.close()
})

test('choosing a club and aiming reach the TV', async () => {
  await open()
  await page.locator('#clubs button').nth(1).click()
  assert.ok((await page.evaluate(() => window.__sent)).some((d) => d.club === 1))
  const right = page.locator('[data-aim="1"]')
  const box = await right.boundingBox()
  await page.mouse.move(box.x + 20, box.y + 20)
  await page.mouse.down()
  await page.waitForTimeout(60)
  assert.equal((await page.evaluate(() => window.__input)).ax, 1)
  await page.mouse.up()
  await page.waitForTimeout(60)
  assert.equal((await page.evaluate(() => window.__input)).ax, 0)
  await page.close()
})

test('a phone without motion sensors swings with the pad: pull down, flick up', async () => {
  await open()
  await page.evaluate(() => window.postMessage({ type: 'motion', state: 'unsupported' }, '*'))
  await page.waitForTimeout(50)
  assert.equal(await page.locator('#set').isVisible(), false)
  const box = await page.locator('#pad').boundingBox()
  const x = box.x + box.width / 2
  await page.mouse.move(x, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(x, box.y + box.height * 0.9, { steps: 5 })
  await page.mouse.move(x + 8, box.y + box.height * 0.1, { steps: 3 })
  await page.mouse.up()
  const flick = (await page.evaluate(() => window.__sent)).find((d) => d.flick)?.flick
  assert.ok(flick, 'no flick sent')
  assert.ok(flick.power > 0.3, `power ${flick.power}`)
  assert.ok(Math.abs(flick.face) < 10, `face ${flick.face}`)
  await page.close()
})

test('before the first swing the phone shows the safety card; I\u2019m ready sends it to the TV and shows SET', async () => {
  await open()
  await page.evaluate(() => {
    window.controller.mine.safe = false
    window.controller.emit('update', window.controller)
  })
  assert.equal(await page.locator('#safety').isVisible(), true)
  assert.match(await page.locator('#safety').textContent(), /Give yourself room.*Hold on tight.*Smooth beats hard/s)
  assert.equal(await page.locator('#set').isVisible(), false)
  await page.locator('#ready').click()
  assert.ok((await page.evaluate(() => window.__sent)).some((d) => d.safe === true))
  assert.equal(await page.locator('#safety').isVisible(), false)
  assert.equal(await page.locator('#set').isVisible(), true)
  await page.close()
})

test('the TV\u2019s menu shows on the phone as buttons, and taps go back to the TV', async () => {
  await open()
  await page.evaluate(() => {
    Object.assign(window.controller.public, {
      paused: true,
      menu: { title: 'Settings', sel: 'music', items: [{ id: 'music', label: 'Music volume', value: '80%' }, { id: 'back', label: 'Back', value: null }] }
    })
    window.controller.emit('update', window.controller)
  })
  assert.equal(await page.locator('#menu').isVisible(), true)
  assert.equal(await page.locator('#menu-title').textContent(), 'Settings')
  assert.equal(await page.locator('#playrow').isVisible(), false)
  await page.getByRole('button', { name: 'Music volume: more' }).click()
  await page.getByRole('button', { name: 'Back' }).click()
  const sent = (await page.evaluate(() => window.__sent)).filter((d) => d.menu).map((d) => d.menu)
  assert.deepEqual(sent, [{ id: 'music', step: 1 }, { id: 'back' }])
  await page.evaluate(() => {
    window.controller.public.menu = null
    window.controller.emit('update', window.controller)
  })
  assert.equal(await page.locator('#menu').isVisible(), false)
  await page.close()
})

test('the phone shows which golfer you are, in their colour', async () => {
  await open()
  await page.evaluate(() => {
    window.controller.mine.golfer = { name: 'Twirl', color: '#ff5c8a' }
    window.controller.emit('update', window.controller)
  })
  assert.equal(await page.locator('#name').textContent(), 'Ada · Twirl')
  assert.equal(await page.locator('#title').textContent(), 'Your shot, Twirl!')
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.dot')).backgroundColor), 'rgb(255, 92, 138)')
  await page.close()
})

test('when it is someone else’s shot the phone shows who is up, not the club', async () => {
  await open({ turnName: 'Bo', cards: [{ id: 'b', name: 'Bo', color: '#2ad1c9', score: '212 yd' }], turn: 'b' })
  await page.evaluate(() => {
    window.controller.mine.active = false
    window.controller.emit('update', window.controller)
  })
  assert.equal(await page.locator('#title').textContent(), 'Bo is up')
  assert.equal(await page.locator('#stage').isVisible(), false)
  assert.match(await page.locator('#scores').textContent(), /Bo212 yd/)
  await page.close()
})

test('on the putting green the phone shows the putter and the read, and a putting stroke sends the putt', async () => {
  const errors = await open({ mode: 'putting', clubs: [{ short: 'PT', sub: 'putter' }], swing: TUNING.putting.reader })
  await page.evaluate(() => {
    window.controller.mine.putt = '18 ft · uphill 3 in'
    window.controller.emit('update')
  })
  assert.match(await page.locator('#clubs').textContent(), /PTputter/)
  assert.match(await page.locator('#hint').textContent(), /^18 ft · uphill 3 in\. Grip it like a putter/)
  assert.equal(await page.locator('#aim').textContent(), 'Aim at the cup')
  await page.evaluate(() => window.postMessage({ type: 'motion', state: 'on' }, '*'))
  await holdSet()
  const { samples, truth } = simulateSwing({ back: 12, backTime: 0.55, downTime: 0.36, follow: 18, roll: 3, noise: 1, hz: 100 })
  await page.evaluate((s) => window.postMessage({ type: 'motion', s }, '*'), toJoinPage(samples))
  await page.waitForFunction(() => window.__sent.some((d) => d.shot), null, { timeout: 3000 })
  const shot = (await page.evaluate(() => window.__sent)).find((d) => d.shot).shot
  assert.ok(Math.abs(shot.speed - truth.speed) < truth.speed * 0.1, `speed ${shot.speed} vs ${truth.speed}`)
  assert.ok(Math.abs(shot.face) < 1.5, `face ${shot.face}`)
  assert.match(await page.locator('#readout').textContent(), /^Stroke \d+°\/s · square face/)
  await page.mouse.up()
  assert.deepEqual(errors, [])
  await page.close()
})

/** Swing (simulated, sent like the join page) with SET held; returns the bar and what the TV got. */
async function swingBar(o) {
  await open({ swing: { ...TUNING.swing.reader, backFull: 200, full: 1050, commit: 0.5, maxBack: 1.2 } })
  await page.evaluate(() => window.postMessage({ type: 'motion', state: 'on' }, '*'))
  await holdSet()
  const { samples } = simulateSwing(o)
  await page.evaluate((s) => window.postMessage({ type: 'motion', s }, '*'), toJoinPage(samples))
  await page.waitForFunction(() => window.__sent.some((d) => d.shot), null, { timeout: 3000 })
  await page.waitForTimeout(100) // a frame for the bar
  const bar = await page.evaluate(() => ({ width: parseFloat(document.getElementById('fill').style.width), color: getComputedStyle(document.getElementById('fill')).backgroundColor, bk: window.__input.bk }))
  await page.mouse.up()
  await page.close()
  return bar
}

test('the bar is the power the backswing set: it holds through a committed downswing and turns lime', async () => {
  const bar = await swingBar({ back: 200 })
  assert.ok(bar.width > 90, `bar ${bar.width}%`)
  assert.equal(bar.color, 'rgb(182, 240, 74)')
  assert.ok(bar.bk > 180, `the TV hears the backswing: ${bar.bk}°`)
})

test('a lazy downswing keeps the bar where the backswing put it, but not lime', async () => {
  const bar = await swingBar({ back: 200, downTime: 1.2 }) // ~330°/s at impact; a full bar needs 525
  assert.ok(bar.width > 90, `bar ${bar.width}%`)
  assert.equal(bar.color, 'rgb(255, 210, 63)')
})

test('the Wardrobe shows the TV’s choices, sends a tap, highlights what you wear, and closes on your shot', async () => {
  const wardrobe = { hat: [{ id: 'none', label: 'No hat' }, { id: 'bucket', label: 'Bucket hat' }, { id: 'shark', label: 'Shark-fin cap' }], top: [{ id: 'none', label: 'No top' }, { id: 'polo', label: 'Golf polo' }], acc: [{ id: 'none', label: 'Nothing' }, { id: 'lei', label: 'Flower lei' }] }
  const errors = await open({ wardrobe })
  await page.evaluate(() => {
    window.controller.mine.active = false
    window.controller.mine.outfit = { hat: 'bucket', top: 'none', acc: 'none' }
    window.controller.emit('update')
  })
  await page.locator('#dress').click()
  assert.equal(await page.locator('#wardrobe').isVisible(), true)
  assert.equal(await page.locator('#wardrobe button[data-slot].on').count(), 3) // one per slot (Swing has its own row)
  assert.match(await page.locator('#wardrobe button.on').first().textContent(), /Bucket hat/)
  await page.locator('#wardrobe button', { hasText: 'Shark-fin cap' }).click()
  assert.deepEqual((await page.evaluate(() => window.__sent)).at(-1), { outfit: { hat: 'shark' } })
  // The TV confirms: the highlight moves.
  await page.evaluate(() => {
    window.controller.mine.outfit = { hat: 'shark', top: 'none', acc: 'none' }
    window.controller.emit('update')
  })
  assert.match(await page.locator('#wardrobe button.on').first().textContent(), /Shark-fin cap/)
  // Your shot comes round: back to the club.
  await page.evaluate(() => {
    window.controller.mine.active = true
    window.controller.emit('update')
  })
  assert.equal(await page.locator('#wardrobe').isVisible(), false)
  assert.equal(await page.locator('#set').isVisible(), true)
  assert.deepEqual(errors, [])
  await page.close()
})

test('the Wardrobe has Swing: right- or left-handed, a tap tells the TV, and the highlight follows what the TV says', async () => {
  const wardrobe = { hat: [{ id: 'none', label: 'No hat' }], top: [{ id: 'none', label: 'No top' }], acc: [{ id: 'none', label: 'Nothing' }] }
  const errors = await open({ wardrobe })
  await page.evaluate(() => {
    window.controller.mine.active = false
    window.controller.mine.outfit = { hat: 'none', top: 'none', acc: 'none' }
    window.controller.mine.hand = 'R'
    window.controller.emit('update')
  })
  await page.locator('#dress').click()
  const swing = page.locator('#wardrobe button[data-hand]')
  assert.deepEqual(await swing.allTextContents(), ['RRight-handed', 'LLeft-handed'])
  assert.equal(await page.locator('#wardrobe button[data-hand].on').getAttribute('data-hand'), 'R')
  await page.locator('#wardrobe button[data-hand="L"]').click()
  assert.deepEqual((await page.evaluate(() => window.__sent)).at(-1), { hand: 'L' })
  await page.evaluate(() => {
    window.controller.mine.hand = 'L'
    window.controller.emit('update')
  })
  assert.equal(await page.locator('#wardrobe button[data-hand].on').getAttribute('data-hand'), 'L')
  assert.deepEqual(errors, [])
  await page.close()
})

test('a menu of games shows as big cards with a line and an icon each, and a tap picks one', async () => {
  const items = [
    { id: 'practice', label: 'Driving range', sub: 'Hit away and see every number', icon: '🏌️', value: null },
    { id: 'course', label: 'The course', sub: 'One hole by the sea, par 4', icon: '🌊', value: null },
    { id: 'back', label: 'Back', value: null }
  ]
  const errors = await open({ phase: 'menu', menu: { title: 'What are we playing?', sel: 'practice', items } })
  assert.equal(await page.locator('#menu-title').textContent(), 'What are we playing?')
  assert.equal(await page.locator('#menu-items button.card').count(), 2)
  assert.match(await page.locator('#menu-items button.card').nth(1).textContent(), /The course.*One hole by the sea/)
  const box = await page.locator('#menu-items button.card').first().boundingBox()
  assert.ok(box.height >= 80, `cards are big enough to hit: ${box.height}px`)
  await page.locator('#menu-items button.card', { hasText: 'The course' }).click()
  assert.deepEqual((await page.evaluate(() => window.__sent)).at(-1), { menu: { id: 'course' } })
  assert.deepEqual(errors, [])
  await page.close()
})
