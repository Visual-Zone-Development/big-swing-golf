// Seaside Swing: the TV runs everything. Players join from their phones (controller.html: the
// phone is the club: pick a club, aim, hold SET and swing) or with controllers here; "Play on
// this screen" is a solo game with this machine's own controls. Two places to play: the driving
// range (Practice: hit as many as you like, see every number; the Target challenge: 10 balls each
// at five ringed greens) and the putting green (Practice: a fresh putt every turn, short, middling
// and long; the Putting challenge: nine holes, fewest putts, farthest from the cup putts first),
// plus Closest to the pin (six approach shots at one green, fewest feet) and the course (three
// holes of real golf: sand, wind, a sweep down each new hole and a scorecard between them).
// Turns rotate between seats after every shot.
//
// A shot comes from the phone's swing reader (club speed, face, path), a three-press meter
// (controller, keyboard) or a pull-and-flick (mouse, touch, a phone without sensors); shot.js
// turns it into a ball, flight.js flies it (over terrain.js's hills and into its sea), view3d.js
// draws it. Each seat plays as one of the bean crew (tuning.js CREW), in that golfer's colour,
// dressed from the phone's Wardrobe (tuning.js OUTFITS; remembered per player name).
//
// What each player sees: party.public (every phone: whose turn, the phase, the clubs, scores),
// party.view(id) (only that phone: is it your shot, your club and aim, your last shot), the rest
// stays on the TV.
import { input } from './input.js'
import { createMenu } from './menu.js'
import { fitCanvas } from './fit.js'
import { createAudio } from './audio.js'
import { createSave, createSettings } from './save.js'
import { createSettingsScreen } from './settings.js'
import { drawPrompts } from './prompts.js'
import { createParty } from './party.js'
import { createPartyLobby, drawJoinBadge } from './party-lobby.js'
import { createMotion } from './motion.js'
import { createPhoneMenus } from './phone-menus.js'
import { CLUBS, CREW, OUTFITS, TUNING, YD } from './tuning.js'
import { createView } from './view3d.js'
import { createSfx } from './sfx.js'
import { powerFor, readPhoneSwing, settle, strike, strokePower } from './shot.js'
import { fairwayHalf, groundHeight, lieAt } from './terrain.js'
import { clubFor, courseStandings, HOLE, HOLES, honour, liePower, MAX_STROKES, nextToPlay, PIN, pinScore, pinSpot, pinStandings, rollWind, roundStrokes, scoreName, setHole, toPar, windVector, windWords, yardsToPin } from './course.js'
import { greenReach } from './green.js'
import { scoreLanding, standings } from './targets.js'
import { bearing, describePutt, FT, GREEN, holeAt, planPutt, practicePutt, previewPutt, puttHeight, puttSpeed, puttStandings, puttStroke, readPutt, rollPutt, settlePutt, startLine } from './putting.js'

const ID = 'seaside-swing'
// A party game is on a TV: the drawing space grows from 1280×800 to the screen's shape (1422×800
// on 16:9, 1280×960 on a 4:3 tablet), so there are no bars. W and H follow the screen; layout()
// runs on every resize. Centred content shifts down by DY on taller screens.
const MIN_W = 1280
const MIN_H = 800
let W = MIN_W
let H = MIN_H
let DY = 0
const BG = '#16305a'
const INK = '#fff8ec'
const QUIET = '#bcd0f2'
const PINK = '#ff5c8a'
const GOLD = '#ffd23f'
const TEAL = '#2ad1c9'
const LIME = '#b6f04a'
const PANEL = 'rgba(11,26,54,0.78)'

const glCanvas = document.getElementById('gl')
const view = createView(glCanvas)
const glFit = fitCanvas(glCanvas, { w: MIN_W, h: MIN_H, context: 'webgl', buffer: false, letterbox: BG, fill: true })
const canvas = document.getElementById('game')
const fit = fitCanvas(canvas, { w: MIN_W, h: MIN_H, letterbox: BG, fill: true })
const ctx = fit.ctx
input.attach(canvas, MIN_W, MIN_H)

for (const [family, file, weight] of [
  ['Lilita One', 'lilita-one-latin-400-normal.woff2', '400'],
  ['Rubik', 'rubik-latin-700-normal.woff2', '700'],
  ['Rubik', 'rubik-latin-500-normal.woff2', '500']
]) {
  const f = new FontFace(family, `url(./fonts/${file})`, { weight })
  f.load().then((loaded) => document.fonts.add(loaded)).catch(() => {})
}

const settings = createSettings(ID, { graphics: 'auto', mode: 'practice', strength: 'normal', assist: 'some', hand: 'R', flipFace: false })
if (settings.data.graphics && settings.data.graphics !== 'auto') view.setGraphics(settings.data.graphics)
const ts = () => settings.data.textScale ?? 1
const head = (px) => `${Math.round(px * ts())}px 'Lilita One', 'Arial Rounded MT Bold', system-ui, sans-serif`
const body = (px, w = 700) => `${w} ${Math.round(px * ts())}px Rubik, system-ui, sans-serif`
/** The same faces at an exact size (no text-size setting): for fitFont() and the logo. */
const rubik = (px, w = 700) => `${w} ${Math.round(px)}px Rubik, system-ui, sans-serif`
const lilita = (px) => `${Math.round(px)}px 'Lilita One', 'Arial Rounded MT Bold', system-ui, sans-serif`
/** Text that didn't fit its box even at its smallest, this frame: [text, width, room] (tests read it). */
let overflow = []
/**
 * The font for text that must stay inside a box: make(size) at px, or smaller (down to 60%) until
 * every string fits in room. Big text-size settings and long names shrink instead of spilling.
 */
function fitFont(make, px, room, ...strs) {
  for (let size = Math.round(px); ; size--) {
    ctx.font = make(size)
    const widest = Math.max(...strs.map((str) => ctx.measureText(str).width))
    if (widest <= room) return make(size)
    if (size <= px * 0.6) {
      overflow.push([strs.join(' | '), Math.round(widest), Math.round(room)])
      return make(size)
    }
  }
}
const audio = createAudio({ settings })
const sfx = createSfx(audio)
const save = createSave(ID, 1, { longest: {}, targetsBest: {}, shots: 0, puttBest: {}, longestPutt: {}, courseBest: {}, roundBest: {}, pinBest: {} })
save.data.puttBest ??= {} // saves from before the putting green
save.data.longestPutt ??= {}
save.data.outfits ??= {} // player name → { hat, top, acc }
save.data.hands ??= {} // player name → 'R' | 'L', picked on the phone
save.data.courseBest ??= {} // player name → fewest strokes on the one-hole course (before 0.10.0)
save.data.roundBest ??= {} // player name → fewest strokes over the course's three holes
save.data.pinBest ??= {} // player name → fewest feet in Closest to the pin

const party = createParty({ input, minPlayers: 1, maxPlayers: 4 })
const lobby = createPartyLobby(party, input, { title: 'Seaside Swing', accent: GOLD, panel: 'rgba(11,26,54,0.86)' })
const motion = createMotion(party)
const phoneMenus = createPhoneMenus(party, input)

const state = {
  screen: 'title', // title | wardrobe | lobby | playing | paused | settings | gameover
  from: 'title',
  resumeTo: 'playing',
  mode: ['targets', 'pin', 'putting', 'putts', 'course'].includes(settings.data.mode) ? settings.data.mode : 'practice',
  hole: 0, // Putting challenge: which of the nine
  courseHole: 0, // the course: which of course.js HOLES
  wind: { mph: 0, dir: 0 }, // the course and Closest to the pin: this hole's (this ball's) wind
  winds: [], // Closest to the pin: the wind for each ball, the same for everyone
  fly: 0, // seconds into the sweep down a new hole
  cardTime: 0, // seconds the scorecard between holes has been up
  ghost: null, // the last practice swing's read: { id, power, text, sub, t }
  seats: [], // { id, name, color, crew, kind: 'phone' | 'local' | 'tv', club, aim, shots: [], hand }
  turn: 0,
  phase: 'aim', // safety | flyover | aim | meter | flight | result | card
  meter: null, // { stage: 'power' | 'accuracy', v, power }
  flick: null,
  shot: null, // the ball in the air: { result, t, landed, seat, input }
  swingPose: 0, // the golfer's club angle (degrees: + back, - through)
  follow: 0, // follow-through animation time left
  banner: null, // { text, sub, color, t }
  resultTime: 0,
  lit: -1, // the green that was just hit
  recent: [], // the session's shots for the map: { x, z, color }
  safe: new Set(), // phones that have read the safety card this party
  safetyTime: 0
}
window.__game = { state, TUNING, party, settings, view, get titleMenu() { return titleMenu }, get wardrobeMenu() { return wardrobeMenu }, get pickMenu() { return pickMenu }, get pauseMenu() { return pauseMenu }, get pauseButton() { return PAUSE_BUTTON }, get settingsMenu() { return settingsScreen.menu }, get overflow() { return overflow } }
const debug = new URLSearchParams(location.search).has('debug')

const MODES = [
  { value: 'practice', label: 'Driving range', title: 'Driving range: practice' },
  { value: 'targets', label: 'Target challenge', title: 'Target challenge · 10 balls' },
  { value: 'pin', label: 'Closest to the pin', title: `Closest to the pin · ${TUNING.pin.balls} balls` },
  { value: 'putting', label: 'Putting practice', title: 'Putting green: practice' },
  { value: 'putts', label: 'Putting challenge', title: 'Putting challenge · 9 holes' },
  { value: 'course', label: 'The course', title: `The course · ${HOLES.length} holes · par ${HOLES.reduce((a, h) => a + h.par, 0)}` }
]
const HANDS = [
  { value: 'R', label: 'Right-handed' },
  { value: 'L', label: 'Left-handed' }
]
const titleMenu = createMenu(
  [
    { id: 'party', label: 'Play with phones' },
    { id: 'solo', label: 'Play on this screen' },
    { id: 'wardrobe', label: 'Wardrobe' },
    { id: 'settings', label: 'Settings' }
  ],
  // The clubhouse rail: a column of tiles down the left (drawn by drawTitle()).
  { y: 250, width: 330, height: 70, gap: 12, accent: GOLD }
)
/** The TV's own wardrobe, for playing on this screen: the first crew bean's outfit (saved by name). */
const wardrobeMenu = createMenu(
  [
    ...Object.entries({ hat: 'Hat', top: 'Top', acc: 'Extra' }).map(([slot, label]) => ({
      id: slot,
      label,
      type: 'choice',
      value: 'none',
      options: OUTFITS[slot].map((o) => ({ value: o.id, label: o.label })),
      onChange: (v) => dressTitle(slot, v)
    })),
    // Which way you swing, playing on this screen (each phone picks its own in its Wardrobe).
    { id: 'hand', label: 'Swing', type: 'choice', value: 'R', options: HANDS, onChange: (v) => ((settings.data.hand = v), settings.save(), view.react(TITLE_LOOK, 'happy'), sfx.blip()) },
    { id: 'done', label: 'Done' }
  ],
  { y: 250, width: 330, height: 70, gap: 12, accent: GOLD }
)
/** What a mode is, in a line, for the picker's tiles on the phones. */
const MODE_SHORT = {
  practice: 'Hit away and see every number',
  targets: 'Ten balls at five ringed greens',
  pin: 'Six approach shots, fewest feet from the pin',
  putting: 'A fresh putt every turn',
  putts: 'Nine holes on the green, fewest putts',
  course: 'Three holes by the sea: sand, wind, fewest strokes'
}
const MODE_ICON = { practice: '🏌️', targets: '🎯', pin: '📍', putting: '⛳', putts: '🏆', course: '🌊' }
/**
 * "What are we playing?": after everyone has joined (or for play on this screen), from the pause
 * menu and from the results. On the TV it's the clubhouse rail; on every phone big cards
 * (phone-menus.js sends each item's line and icon), and anyone can pick.
 */
const pickMenu = createMenu(
  [...MODES.map((m) => ({ id: m.value, label: m.label, sub: MODE_SHORT[m.value], icon: MODE_ICON[m.value] })), { id: 'back', label: 'Back' }],
  { y: 250, width: 330, height: 60, gap: 9, accent: GOLD } // seven tiles: a little shorter than the title's
)
const pauseMenu = createMenu(
  [
    { id: 'resume', label: 'Resume' },
    { id: 'restart', label: 'Restart' },
    { id: 'pick', label: 'Choose a game' },
    { id: 'settings', label: 'Settings' },
    { id: 'title', label: 'Quit to title' }
  ],
  { y: H / 2 - 110, accent: GOLD }
)
const overMenu = createMenu(
  [
    { id: 'again', label: 'Play again' },
    { id: 'pick', label: 'Choose a game' },
    { id: 'title', label: 'Quit to title' }
  ],
  { y: 560, accent: GOLD }
)
const settingsScreen = createSettingsScreen({
  settings,
  audio,
  width: 600, // the clubhouse look: a column of tiles, with the card beside it (drawSettings)
  extra: [
    { id: 'graphics', label: 'Graphics', type: 'choice', value: settings.data.graphics ?? 'auto', options: [{ value: 'auto', label: 'Auto' }, { value: 'high', label: 'High' }, { value: 'low', label: 'Low' }], onChange: (v) => view.setGraphics(v) },
    { id: 'strength', label: 'Swing power needed', type: 'choice', value: settings.data.strength, options: [{ value: 'easy', label: 'Less' }, { value: 'normal', label: 'Normal' }, { value: 'strong', label: 'More' }] },
    { id: 'assist', label: 'Straight shot help', type: 'choice', value: settings.data.assist, options: [{ value: 'off', label: 'Off' }, { value: 'some', label: 'Some' }, { value: 'lots', label: 'Lots' }] },
    { id: 'flipFace', label: 'Flip hook and slice', type: 'toggle', value: settings.data.flipFace }
  ]
})

const PAUSE_BUTTON = { x: W - 88, y: 32, w: 56, h: 56 }
const inside = (p, r) => r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const lerp = (a, b, t) => a + (b - a) * t
// On-screen controls for mouse and touch (drawn only in those modes).
const TOUCH = {
  aimL: { x: 40, y: 690, w: 76, h: 76 },
  aimR: { x: 124, y: 690, w: 76, h: 76 },
  clubL: { x: W - 320, y: 690, w: 76, h: 76 },
  clubR: { x: W - 116, y: 690, w: 76, h: 76 }
}
const SAFETY_OK = { x: W / 2 - 110, y: 676, w: 220, h: 64 }

/** Fit everything to the screen's current shape: menus centred, buttons on the real edges. */
function layout() {
  W = fit.w
  H = fit.h
  DY = Math.round((H - MIN_H) / 2)
  view.resize(W, H)
  Object.assign(PAUSE_BUTTON, { x: W - 88, y: 32 })
  Object.assign(TOUCH.aimL, { x: 40, y: H - 110 })
  Object.assign(TOUCH.aimR, { x: 124, y: H - 110 })
  Object.assign(TOUCH.clubL, { x: W - 320, y: H - 110 })
  Object.assign(TOUCH.clubR, { x: W - 116, y: H - 110 })
  Object.assign(SAFETY_OK, { x: W / 2 - 110, y: 676 + DY })
  // The rail: centred in the left column; the menus inside it start under the logo.
  titleMenu.place({ x: RAIL.w / 2, y: 244 + DY })
  wardrobeMenu.place({ x: RAIL.w / 2, y: 244 + DY })
  pickMenu.place({ x: RAIL.w / 2, y: 236 + DY })
  pauseMenu.place({ x: W / 2, y: H / 2 - 110 })
  overMenu.place({ x: W / 2, y: 560 + DY })
  settingsScreen.place({ x: W / 2, y: 190 + DY })
}

input.onPause(() => {
  if (state.screen === 'playing') pause()
  save.save()
})

// ---- seats and turns ---------------------------------------------------------------------------

const seat = () => state.seats[state.turn]
const connected = (s) => s.kind === 'tv' || party.player(s.id)?.connected !== false
/**
 * A seat plays as the next bean of the crew, in that bean's colour, wearing what this player
 * wore last time (by name) or the crew's outfit. look is what the view draws: { id, color, outfit }.
 */
const newSeat = (p, i) => {
  const crew = CREW[i % CREW.length]
  const look = { id: `${p.id}:${crew.id}`, color: crew.color, outfit: { ...crew.outfit, ...save.data.outfits[p.name] } }
  // Putting: ball and cup where this seat's next putt is from and to, paim its aim off the line to
  // the cup, card the challenge's putts per hole, strokes this hole, done when it's holed out.
  return { id: p.id, name: p.name, color: crew.color, crew, look, kind: p.kind, club: 0, aim: 0, shots: [], hand: p.kind === 'phone' ? (save.data.hands[p.name] ?? 'R') : settings.data.hand, handPicked: p.kind === 'phone' && Boolean(save.data.hands[p.name]), ball: null, cup: null, paim: 0, card: [], strokes: 0, done: false }
}
/** The title screen's crew: the first bean (dressed in the TV's wardrobe, by its name) and three more. */
const TITLE_LOOK = { id: 'title', color: CREW[0].color, outfit: { ...CREW[0].outfit, ...save.data.outfits[CREW[0].name] } }
const TITLE_CREW = [TITLE_LOOK, ...CREW.slice(1, 4).map((c) => ({ id: `title-${c.id}`, color: c.color, outfit: c.outfit }))]
const TITLE_FACES = ['joy', 'cheer', 'smug', 'idle']
/** A change in the TV's wardrobe: dress the title bean and remember it for the first crew bean. */
function dressTitle(slot, id) {
  TITLE_LOOK.outfit = { ...TITLE_LOOK.outfit, [slot]: id }
  save.data.outfits[CREW[0].name] = { ...TITLE_LOOK.outfit }
  save.save()
  view.react(TITLE_LOOK, 'happy')
  sfx.blip()
}
/** A phone picks right- or left-handed: the bean turns round, and it's remembered by name. */
function pickHand(s, hand) {
  if (s.hand === hand && s.handPicked) return
  s.hand = hand
  s.handPicked = true
  save.data.hands[s.name] = hand
  save.save()
  view.react(s.look, 'happy')
  sfx.blip()
  publish()
}
/** A wardrobe change from a phone: only known pieces, slot by slot. */
function dress(s, change) {
  let changed = false
  for (const slot of Object.keys(OUTFITS)) {
    const id = change[slot]
    if (typeof id === 'string' && OUTFITS[slot].some((o) => o.id === id) && s.look.outfit[slot] !== id) {
      s.look.outfit = { ...s.look.outfit, [slot]: id }
      changed = true
    }
  }
  if (!changed) return
  save.data.outfits[s.name] = { ...s.look.outfit }
  save.save()
  view.react(s.look, 'happy')
  sfx.blip()
  publish()
}
const isTargets = () => state.mode === 'targets'
const isCourse = () => state.mode === 'course'
const isPin = () => state.mode === 'pin'
/** Played from where the ball lies, at a pin: the course, and Closest to the pin. */
const isLinks = () => isCourse() || isPin()
const ballsEach = () => (isPin() ? TUNING.pin.balls : TUNING.targets.balls)
/** On the course: on the green, its fringe, or just off it (close enough to putt from). */
const onGreen = (s) => Boolean(s?.ball) && greenReach(s.ball.x, s.ball.z, HOLE.green) < 1 + HOLE.green.fringe + 0.35
/** Putting now: the putting modes, or the course with the ball on the green. */
const isPutting = () => state.mode === 'putting' || state.mode === 'putts' || (isCourse() && onGreen(seat()))
const isPutts = () => state.mode === 'putts'
/** The green this seat putts on: the course's, or the practice green. */
const greenOf = () => (isCourse() ? HOLE.green : GREEN)
const PT = TUNING.putting
/** A seat's putt for the view: from, cup, the aimed direction (radians) and the green. */
const puttOf = (s) => (s?.ball && s.cup ? { from: s.ball, cup: s.cup, dir: ((bearing(s.ball, s.cup) + (s.paim ?? 0)) * Math.PI) / 180, green: greenOf() } : null)
/** The course: the line from the ball to the pin (degrees from downrange). */
const lineDeg = (s) => bearing(s.ball, s.cup)
/** The course: a seat on the tee of the hole being played, nothing played. */
function toTee(s) {
  s.ball = { ...HOLE.tee }
  s.cup = { ...HOLE.cup }
  s.strokes = 0
  s.done = false
  s.carded = false
}
/** Is this seat's ball on the tee (teed up: a perfect lie)? */
const onTee = (s) => isCourse() && Boolean(s?.ball) && s.ball.x === HOLE.tee.x && s.ball.z === HOLE.tee.z
/** How a seat's ball lies: 'tee', or terrain.js's lieAt(). */
const lieOf = (s) => (onTee(s) ? 'tee' : lieAt(s.ball.x, s.ball.z))
/** The wind as flight.js takes it (nothing on the range). */
const windNow = () => (isLinks() ? windVector(state.wind) : null)
/**
 * The pin's mark on the power bar: the share of a full backswing that gets this seat's ball to
 * the pin with the club in hand, square, from this lie and in this wind (null: out of reach, or
 * not a shot at a pin). Worked out once per ball, club and wind.
 */
let markKey = ''
let markValue = null
function pinMark(s) {
  if (!isLinks() || isPutting() || !s?.ball || !s.cup) return null
  const club = CLUBS[s.club]
  const lie = lieOf(s)
  const key = [s.id, s.ball.x, s.ball.z, club.id, lie, state.wind.mph, state.wind.dir].join(':')
  if (key !== markKey) {
    markKey = key
    markValue = powerFor(yardsToPin(s.ball, s.cup), club, lineDeg(s), { from: s.ball, wind: windNow(), lie: liePower(lie, club) })
  }
  return markValue
}
/** How far (yards) a full, square swing carries with the club in hand from this lie: the bar's full length. */
const fullCarry = (s) => Math.round(CLUBS[s.club].carry * (isLinks() && s.ball ? liePower(lieOf(s), CLUBS[s.club]) : 1))
/** Put a seat on the challenge's current hole, at its start. */
function toHole(s) {
  const h = holeAt(state.hole)
  s.ball = { ...h.start }
  s.cup = { ...h.cup }
  s.strokes = 0
  s.done = false
}
const ballsLeft = (s) => ballsEach() - s.shots.length

party.on('join', (p) => {
  sfx.join()
  // Joined mid-game: take a seat and join the rotation.
  if ((state.screen === 'playing' || state.screen === 'paused') && state.seats[0]?.kind !== 'tv' && !state.seats.some((s) => s.id === p.id)) {
    const s = newSeat(p, state.seats.length)
    if (isPutts()) toHole(s) // a latecomer starts on the hole being played
    if (isCourse()) {
      toTee(s)
      // The holes already played: two over par on each, so a latecomer isn't handed the lead.
      for (let h = 0; h < state.courseHole; h++) s.card[h] = HOLES[h].par + 2
    }
    state.seats.push(s)
  }
})
party.on('end', () => {
  if (state.screen !== 'title') state.screen = 'title'
})
party.on('msg', ({ from, data }) => {
  if (!data || typeof data !== 'object') return
  if (data.pause && state.screen === 'playing') return pause()
  if (data.resume && state.screen === 'paused') return resume()
  if (data.again && state.screen === 'gameover') return newGame()
  if (data.safe) {
    if (!state.safe.has(from)) sfx.blip()
    state.safe.add(from)
    return publish()
  }
  // The Wardrobe: any seated phone, any time.
  if (data.outfit && typeof data.outfit === 'object') {
    const mine = state.seats.find((x) => x.id === from)
    if (mine) dress(mine, data.outfit)
    return
  }
  // Right- or left-handed, from the phone's Wardrobe: any seated phone, any time.
  if (data.hand === 'R' || data.hand === 'L') {
    const mine = state.seats.find((x) => x.id === from)
    if (mine) pickHand(mine, data.hand)
    return
  }
  const s = seat()
  if (state.screen !== 'playing' || !s || s.id !== from || state.phase !== 'aim') return
  if (typeof data.club === 'number' && !isPutting()) setClub(s, data.club)
  if (data.shot && typeof data.shot === 'object') {
    const sw = readPhoneSwing(data.shot, { strength: settings.data.strength })
    // Which way you swing is your pick (right-handed until you pick), never the phone's guess
    // from how it was held: that guess wobbles, and the bean would flip sides between swings.
    take({ ...sw, hand: s.hand, how: 'phone', raw: data.shot })
  }
  if (data.practice && typeof data.practice === 'object') rehearse(s, data.practice)
  if (data.flick && typeof data.flick === 'object') take({ power: Number(data.flick.power) || 0, face: (Number(data.flick.face) || 0) * TUNING.flick.faceGain, path: 0, how: 'pad' })
})

function newGame() {
  if (state.seats[0]?.kind !== 'tv') state.seats = party.players.map(newSeat)
  for (const s of state.seats) {
    s.shots = []
    s.card = []
    s.ball = s.cup = null
  }
  state.hole = 0
  state.courseHole = 0
  state.ghost = null
  // The ground: the course's first hole, Closest to the pin's green, or the plain range.
  setHole(isCourse() ? 0 : isPin() ? PIN.hole : -1)
  state.wind = isCourse() ? rollWind(HOLE.wind) : { mph: 0, dir: 0 }
  state.winds = isPin() ? PIN.spots.map(() => rollWind(PIN.wind)) : []
  if (isPutts()) state.seats.forEach(toHole)
  if (isCourse()) state.seats.forEach(toTee)
  state.turn = 0
  state.recent = []
  view.clearMarks()
  state.banner = null
  state.screen = 'playing'
  party.public.paused = false
  sfx.music(true)
  // Before the first swing of a party: the safety screen, until every phone has read it.
  if (unsafe().length) {
    state.phase = 'safety'
    state.safetyTime = 0
    if (isPutting()) setupPutt(seat())
    if (isPin()) toSpot(seat())
    snapCamera(seat())
    return publish()
  }
  startPlay()
}
/** The first shot of a game: on the course, after a sweep down the first hole. */
function startPlay() {
  if (isCourse()) return flyover()
  startTurn()
}
/** The course: the camera sweeps from the green back to the tee before a hole's first shot. */
function flyover() {
  state.phase = 'flyover'
  state.fly = 0
  state.banner = null
  state.shot = null
  state.swingPose = 0
  // The club for the tee shot, so the HUD is right while the camera comes down the hole.
  const s = seat()
  if (s?.ball) ((s.aim = 0), (s.club = clubFor(yardsToPin(s.ball, s.cup), CLUBS, lieOf(s))))
  sfx.blip()
  publish()
}
/** Closest to the pin: a seat's next ball, on its spot, in that ball's wind. */
function toSpot(s) {
  const i = Math.min(s.shots.length, TUNING.pin.balls - 1)
  s.ball = pinSpot(i)
  s.cup = { ...HOLES[PIN.hole].cup }
  state.wind = state.winds[i] ?? { mph: 0, dir: 0 }
}
/** Seated, connected phones that haven't tapped "I'm ready" on the safety card. */
const unsafe = () => state.seats.filter((x) => x.kind === 'phone' && connected(x) && !state.safe.has(x.id))
function soloGame() {
  state.seats = [newSeat({ id: 'tv', name: CREW[0].name, kind: 'tv' }, 0)]
  newGame()
}

function startTurn() {
  const s = seat()
  state.phase = 'aim'
  state.meter = null
  state.flick = null
  state.shot = null
  state.lit = -1
  state.swingPose = 0
  state.ghost = null
  if (isPin() && s) toSpot(s)
  if (isPutting()) setupPutt(s)
  else if (isLinks() && s) {
    // A full shot at a pin: aimed at it, with the club that gets there from this lie.
    s.aim = 0
    s.club = clubFor(yardsToPin(s.ball, s.cup), CLUBS, lieOf(s))
  }
  snapCamera(s)
  publish()
}
/**
 * Putting: where this seat's putt is from (practice: a fresh one every turn, short, middling,
 * long), and the help's read of it. With Straight shot help on (the default), the aim starts on
 * the line that allows for the break, a guide shows the roll, and the bars mark the pace.
 */
function setupPutt(s) {
  if (isPutts()) {
    if (!s.ball) toHole(s)
  } else if (isCourse()) {
    // On the course's green: putt from where it lies.
  } else {
    const spot = practicePutt(s.shots.length)
    s.ball = spot.start
    s.cup = spot.cup
  }
  s.plan = planPutt(s.ball, s.cup, PT, greenOf())
  s.paim = puttHelp() ? s.plan.aim : 0
}
const puttHelp = () => settings.data.assist !== 'off'
/**
 * How far (m, on the flat) a full putting bar rolls for this seat's putt: twice the putt, so the
 * middle of the bar is the cup. With the help, the help's pace (the slope allowed for); without
 * it, just the distance (and a little past), so reading the slope is still up to you.
 */
function puttRange(s) {
  if (!s?.ball || !s.cup) return PT.full * FT
  const flat = puttHelp() && s.plan ? s.plan.speed ** 2 / (2 * PT.roll) : Math.hypot(s.cup.x - s.ball.x, s.cup.z - s.ball.z) + PT.planPast
  return clamp(flat * PT.range, PT.rangeMin, PT.rangeMax)
}
function snapCamera(s) {
  if (isPutting() && s?.ball) view.snapPutt(puttOf(s))
  else if (isLinks() && s?.ball) view.snap(lineDeg(s) + s.aim, s.hand ?? settings.data.hand, s.ball)
  else view.snap(s?.aim ?? 0, s?.hand ?? settings.data.hand)
}

function nextTurn() {
  state.banner = null
  const n = state.seats.length
  if (isPutts()) return nextPutter()
  if (isCourse()) {
    // Whoever is farthest from the pin plays next; everyone on the tee goes in seat order.
    const i = nextToPlay(state.seats, state.turn, HOLE.cup, connected)
    if (i < 0) return holeDone()
    state.turn = i
    return startTurn()
  }
  if (isTargets() || isPin()) {
    // Whoever has hit the fewest balls goes next (latecomers catch up), in seat order after this one.
    const live = state.seats.map((x, i) => ({ x, i })).filter((o) => ballsLeft(o.x) > 0 && connected(o.x))
    if (!live.length) return gameOver()
    const after = (i) => (i - state.turn + n) % n || n
    live.sort((a, b) => a.x.shots.length - b.x.shots.length || after(a.i) - after(b.i))
    state.turn = live[0].i
  } else {
    for (let k = 1; k <= n; k++) {
      const i = (state.turn + k) % n
      if (connected(state.seats[i])) {
        state.turn = i
        break
      }
    }
  }
  startTurn()
}

/**
 * Putting challenge: whoever is farthest from the cup putts next (ties: seat order after this
 * one). When everyone has holed out, on to the next hole; after the last, the results.
 */
function nextPutter() {
  const n = state.seats.length
  const live = state.seats.map((x, i) => ({ x, i })).filter((o) => !o.x.done && connected(o.x))
  if (!live.length) {
    if (state.hole + 1 >= PT.holes) return gameOver()
    state.hole++
    state.seats.forEach(toHole)
    state.turn = Math.max(0, state.seats.findIndex(connected))
    state.banner = { text: `Hole ${state.hole + 1}`, sub: `${Math.round(readPutt(holeAt(state.hole).start, holeAt(state.hole).cup).feet)} ft`, color: GOLD, t: 0 }
    return startTurn()
  }
  const far = (x) => Math.hypot(x.ball.x - x.cup.x, x.ball.z - x.cup.z)
  const after = (i) => (i - state.turn + n) % n || n
  live.sort((a, b) => far(b.x) - far(a.x) || after(a.i) - after(b.i))
  state.turn = live[0].i
  startTurn()
}

/**
 * The course: everyone has holed out. The hole goes on each card (a ball still out counts as
 * picked up), and the scorecard comes up before the next hole, or the results after the last.
 */
function holeDone() {
  for (const s of state.seats) {
    s.card[state.courseHole] = s.done ? s.strokes : MAX_STROKES
    s.carded = true
  }
  state.phase = 'card'
  state.cardTime = 0
  state.banner = null
  state.shot = null
  publish()
}
/** The scorecard has been read: on to the next hole (the best score on the last one tees off first). */
function nextHole() {
  if (state.courseHole + 1 >= HOLES.length) return gameOver()
  const first = honour(state.seats, state.courseHole, connected)
  state.courseHole++
  setHole(state.courseHole)
  state.wind = rollWind(HOLE.wind)
  state.seats.forEach(toTee)
  state.turn = first
  flyover()
}

function gameOver() {
  state.screen = 'gameover'
  sfx.stopFly()
  for (const s of state.seats) s.newBest = false
  if (isCourse()) {
    for (const s of state.seats) {
      if (s.card.filter((x) => x).length < HOLES.length) continue // only a full round counts
      const total = roundStrokes(s)
      if (total < (save.data.roundBest[s.name] ?? Infinity)) {
        save.data.roundBest[s.name] = total
        s.newBest = true
      }
    }
  } else if (isPin()) {
    for (const r of pinStandings(state.seats)) {
      const s = state.seats.find((x) => x.id === r.id)
      if (s.shots.length < TUNING.pin.balls) continue
      if (r.total < (save.data.pinBest[s.name] ?? Infinity)) {
        save.data.pinBest[s.name] = r.total
        s.newBest = true
      }
    }
  } else if (isPutts()) {
    for (const r of puttStandings(state.seats)) {
      const s = state.seats.find((x) => x.id === r.id)
      if (s.card.filter((x) => x).length < PT.holes) continue // only a full round counts
      if (r.total < (save.data.puttBest[s.name] ?? Infinity)) {
        save.data.puttBest[s.name] = r.total
        s.newBest = true
      }
    }
  } else for (const r of standings(state.seats)) {
    const s = state.seats.find((x) => x.id === r.id)
    if (r.total > (save.data.targetsBest[s.name] ?? -1)) {
      save.data.targetsBest[s.name] = r.total
      s.newBest = true
    }
  }
  save.save()
  overMenu.select('again')
  publish()
}

function setClub(s, i) {
  const c = clamp(Math.round(i), 0, CLUBS.length - 1)
  if (c !== s.club) sfx.blip(c < s.club)
  s.club = c
}

// ---- taking a shot ------------------------------------------------------------------------------

/** Any swing, from any input: { power, face, path, how, hand?, mph?, raw? }. */
function take(sw) {
  if (isPutting()) return takePutt(sw)
  const s = seat()
  const club = CLUBS[s.club]
  const flip = settings.data.flipFace ? -1 : 1
  const clean = settle({ power: sw.power, face: sw.face * flip, path: sw.path * flip }, { assist: settings.data.assist })
  const hand = sw.hand ?? s.hand ?? settings.data.hand
  // At a pin: from wherever it lies (which saps the swing: sand most of all), aimed off the line
  // to the pin, in the wind, and it can go in.
  const from = isLinks() ? { ...s.ball } : null
  const lie = isLinks() ? lieOf(s) : 'tee'
  if (isLinks()) clean.power = Math.max(TUNING.swing.minPower, clean.power * liePower(lie, club))
  const result = isLinks() ? strike(clean, club, lineDeg(s) + s.aim, hand, TUNING.ball, { from, cup: s.cup, wind: windNow() }) : strike(clean, club, s.aim, hand)
  state.ghost = null
  state.shot = { result, t: 0, landed: false, seat: s, input: { ...sw, ...clean }, club, from, lie }
  state.phase = 'flight'
  state.follow = 0.5
  state.meter = null
  sfx.hit(clean.power, result.shape === 'Straight!')
  view.bump(0.25 + clean.power * 0.3)
  buzz(s, 30)
  save.data.shots++
  publish()
}
/** A putt: the stroke's speed rolls the ball, its face sets where it starts. */
function takePutt(sw) {
  const s = seat()
  const flip = settings.data.flipFace ? -1 : 1
  const clean = settlePutt({ face: sw.face * flip, path: sw.path * flip }, { assist: settings.data.assist })
  const strength = settings.data.strength
  const range = puttRange(s)
  const speed = puttSpeed({ how: sw.how, speed: sw.raw?.speed, back: sw.raw?.back, power: sw.power }, { strength, range })
  // A through-stroke too gentle for the backstroke: the putt is softer than the bar promised.
  if (sw.how === 'phone' && sw.raw) sw = { ...sw, lazy: strokePower(sw.raw, puttStroke(strength, { range })).lazy }
  const dir = bearing(s.ball, s.cup) + s.paim + startLine(clean)
  const roll = rollPutt(s.ball, dir, speed, s.cup, PT, greenOf())
  state.shot = { putt: true, roll, t: 0, landed: false, seat: s, from: { ...s.ball }, cup: { ...s.cup }, dir, speed, input: { ...sw, ...clean } }
  state.phase = 'flight'
  state.follow = 0.5
  state.meter = null
  sfx.putt(speed / 4)
  buzz(s, 20)
  save.data.shots++
  publish()
}
/**
 * A practice swing from the phone (PRACTICE held, not SET): nothing is hit. The TV and the phone
 * say what that swing would have done, and the bar keeps a mark where it finished, so the next
 * one can be a little more or a little less.
 */
function rehearse(s, raw) {
  const flip = settings.data.flipFace ? -1 : 1
  const strength = settings.data.strength
  let power
  let text
  if (isPutting()) {
    const clean = settlePutt({ face: (Number(raw.face) || 0) * flip, path: (Number(raw.path) || 0) * flip }, { assist: settings.data.assist })
    const range = puttRange(s)
    const speed = puttSpeed({ how: 'phone', speed: raw.speed, back: raw.back }, { strength, range })
    const roll = rollPutt(s.ball, bearing(s.ball, s.cup) + s.paim + startLine(clean), speed, s.cup, PT, greenOf())
    const how = describePutt(s.ball, roll.rest, s.cup, roll.holed)
    power = strokePower(raw, puttStroke(strength, { range })).want
    text = roll.holed ? 'That one drops!' : `That one: ${how.text}`
  } else {
    const sw = readPhoneSwing(raw, { strength })
    const clean = settle({ power: sw.power, face: sw.face * flip, path: sw.path * flip }, { assist: settings.data.assist })
    const club = CLUBS[s.club]
    power = clean.power
    const hit = { ...clean, power: isLinks() ? Math.max(TUNING.swing.minPower, clean.power * liePower(lieOf(s), club)) : clean.power }
    const r = isLinks() ? strike(hit, club, lineDeg(s) + s.aim, s.hand, TUNING.ball, { from: s.ball, wind: windNow() }) : strike(hit, club, s.aim, s.hand)
    const pin = isLinks() ? Math.round(yardsToPin(s.ball, s.cup)) : 0
    const off = pin ? r.total - pin : 0
    text = `That one: ${r.carry} yd carry · ${r.shape}${pin ? (Math.abs(off) <= 4 ? ' · pin high' : ` · ${Math.abs(off)} yd ${off > 0 ? 'long' : 'short'}`) : ''}`
  }
  state.ghost = { id: s.id, power, text, t: 0 }
  sfx.swish(Math.min(1, power))
  buzz(s, 15)
  party.view(s.id).last = `Practice swing. ${text}`
  publish()
}
function buzz(s, ms) {
  if (s?.kind === 'phone') party.send(s.id, { buzz: ms })
}

/** The active seat's controls, plus this machine's (keyboard, mouse, touch, its pad). */
function aimControls(dt) {
  const s = seat()
  const pad = s.kind === 'local' ? party.inputs[s.id] ?? {} : {}
  const phone = s.kind === 'phone' ? party.inputs[s.id] ?? {} : {}
  const pressed = (b) => input.pressed(b) || (s.kind === 'local' && party.pressed(s.id, b))
  const p = input.pointer
  const touching = (r) => p.down && inside(p, r) && (input.mode === 'touch' || input.mode === 'mouse')
  // Aim: stick / arrows / the phone's ◀ ▶ / on-screen buttons.
  const ax = (Math.abs(input.x) > 0.25 ? input.x : 0) + (Math.abs(pad.x ?? 0) > 0.25 ? pad.x : 0) + (Number(phone.ax) || 0) + (touching(TOUCH.aimL) ? -1 : 0) + (touching(TOUCH.aimR) ? 1 : 0)
  if (ax && state.phase === 'aim' && isPutting()) {
    const before = Math.round(s.paim * 2)
    s.paim = clamp(s.paim + clamp(ax, -1, 1) * PT.aimSpeed * dt, -PT.aimMax, PT.aimMax)
    if (Math.round(s.paim * 2) !== before) sfx.tick(0.2)
  } else if (ax && state.phase === 'aim') {
    const before = Math.round(s.aim)
    s.aim = clamp(s.aim + clamp(ax, -1, 1) * TUNING.range.aimSpeed * dt, -TUNING.range.aimMax, TUNING.range.aimMax)
    if (Math.round(s.aim) !== before) sfx.tick(0.2)
  }
  // Club: up/down or LB/RB, or the on-screen buttons (the putting green has just the putter).
  if (state.phase === 'aim' && !isPutting()) {
    if (pressed('up') || pressed('lb') || (p.pressed && inside(p, TOUCH.clubL))) setClub(s, s.club - 1)
    if (pressed('down') || pressed('rb') || (p.pressed && inside(p, TOUCH.clubR))) setClub(s, s.club + 1)
  }
  // The three-press meter: A starts the backswing, A sets the power, A on the line strikes.
  const M = TUNING.meter
  if (state.phase === 'aim' && pressed('a')) {
    state.phase = 'meter'
    state.meter = { stage: 'power', v: 0, power: 0 }
    sfx.blip()
  } else if (state.phase === 'meter') {
    const m = state.meter
    if (pressed('b')) {
      state.phase = 'aim'
      state.meter = null
      return
    }
    if (m.stage === 'power') {
      m.v += dt / M.rise
      if (Math.floor(m.v * 10) !== Math.floor((m.v - dt / M.rise) * 10)) sfx.tick(m.v)
      if (pressed('a') || m.v >= TUNING.swing.maxPower) {
        m.power = Math.min(m.v, TUNING.swing.maxPower)
        m.stage = 'accuracy'
        sfx.blip()
      }
    } else {
      m.v -= dt / M.fall
      // The line is at 0; past it (below) the face gets worse quickly.
      if (pressed('a') || m.v < -0.25) {
        const off = m.v // + early (face open), - late (closed)
        const face = Math.abs(off) <= M.window ? 0 : (Math.sign(off) * (Math.abs(off) - M.window) * M.faceAtEdge) / 0.2
        take({ power: m.power, face, path: 0, how: 'meter' })
      }
    }
  }
  pointerSwing()
}

/** Mouse / touch on the TV: pull down anywhere on the course, then flick up. */
function pointerSwing() {
  if (state.phase !== 'aim') return
  const p = input.pointer
  const now = performance.now() / 1000
  const onButton = Object.values(TOUCH).some((r) => inside(p, r)) || inside(p, PAUSE_BUTTON)
  if (p.pressed && !onButton && p.y > 140) state.flick = { pts: [{ x: p.x, y: p.y, t: now }] }
  const f = state.flick
  if (!f) return
  if (p.down) {
    f.pts.push({ x: p.x, y: p.y, t: now })
    if (f.pts.length > 60) f.pts.splice(1, 1)
  }
  if (p.released) {
    state.flick = null
    const low = f.pts.reduce((a, q) => (q.y > a.y ? q : a), f.pts[0])
    const z = f.pts[f.pts.length - 1]
    if (low.y - z.y < 90) return
    let k = f.pts.length - 1
    while (k > 0 && z.t - f.pts[k].t < 0.1) k--
    const v = (f.pts[k].y - z.y) / Math.max(0.016, z.t - f.pts[k].t)
    const face = (Math.atan2(z.x - low.x, low.y - z.y) * 180) / Math.PI
    take({ power: v / TUNING.flick.full, face: face * TUNING.flick.faceGain, path: 0, how: 'flick' })
  }
}

// ---- the ball in the air -----------------------------------------------------------------------

/** Where the ball is at time t of its flight (interpolated), and the points so far. */
function ballAt(points, t) {
  let i = 0
  let lo = 0
  let hi = points.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (points[mid].t <= t) lo = mid
    else hi = mid - 1
  }
  i = lo
  const a = points[i]
  const b = points[Math.min(points.length - 1, i + 1)]
  const k = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 0
  return { pos: { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) }, n: i + 1 }
}

function flightUpdate(dt) {
  const sh = state.shot
  const r = sh.result
  const fl = r.flight
  // The bounces and the roll play at the flight's pace (not fast-forwarded), so it visibly hops,
  // runs out and eases to a stop.
  sh.t = Math.min(fl.rest.t, sh.t + dt * TUNING.flightSpeed)
  const { pos, n } = ballAt(fl.points, sh.t)
  sh.pos = pos
  sh.trailN = n
  const v = n > 1 ? Math.hypot(fl.points[n - 1].x - fl.points[Math.max(0, n - 2)].x, fl.points[n - 1].y - fl.points[Math.max(0, n - 2)].y, fl.points[n - 1].z - fl.points[Math.max(0, n - 2)].z) * 60 : 0
  if (!sh.landed) sfx.fly(v)
  if (!sh.landed && sh.t >= fl.carry.t) {
    sh.landed = true
    sfx.stopFly()
    if (fl.water) sfx.splash()
    else sfx.land(fl.rough)
    view.land(fl.carry)
    if (isTargets()) {
      const sc = scoreLanding(fl.carry)
      sh.score = sc
      if (sc.points) {
        state.lit = sc.green
        sfx.target(sc.ring)
        cheer(sh.seat, sc.ring === 0 ? 'cheer' : 'happy')
        view.burst(fl.carry, [TUNING.targets.greens[sc.green].color, GOLD, '#ffffff', TEAL], sc.ring === 0 ? 120 : 60)
        view.bump(sc.ring === 0 ? 0.8 : 0.4)
        buzz(sh.seat, sc.ring === 0 ? 220 : 100)
        state.banner = { text: `+${sc.points}`, sub: sc.name, color: GOLD, t: 0 }
      } else {
        sfx.miss()
        view.react(sh.seat.look, 'sad')
        state.banner = { text: 'Missed', sub: `${sc.miss} yd from a green`, color: QUIET, t: 0 }
      }
    }
  }
  if (sh.t >= fl.rest.t) finishShot()
}

// ---- the ball on the green ----------------------------------------------------------------------

function rollUpdate(dt) {
  const sh = state.shot
  const pts = sh.roll.points
  sh.t = Math.min(sh.roll.rest.t, sh.t + dt * PT.rollSpeed)
  const { pos, n } = ballAt(pts, sh.t)
  sh.pos = pos
  sh.trailN = n
  if (sh.t >= sh.roll.rest.t) finishPutt()
}

function finishPutt() {
  const sh = state.shot
  const s = sh.seat
  const r = sh.roll
  const how = describePutt(sh.from, r.rest, sh.cup, r.holed)
  const feet = Math.hypot(sh.cup.x - sh.from.x, sh.cup.z - sh.from.z) / FT
  sh.how = how
  let sub = how.text
  if (r.holed) {
    sfx.cup()
    cheer(s, feet > 10 ? 'cheer' : 'happy')
    view.burst({ ...sh.cup, y: puttHeight(sh.cup.x, sh.cup.z, greenOf()) }, [s.color, GOLD, '#ffffff', TEAL], feet > 10 ? 90 : 40)
    buzz(s, 160)
  } else if (r.lipped) {
    sfx.lip()
    view.react(s.look, 'wince')
  } else {
    sfx.miss()
    if (how.left > 6) view.react(s.look, 'sad')
  }
  if (isPutts()) {
    s.strokes++
    let text = r.holed ? (s.strokes === 1 ? 'In!' : 'Holed!') : r.lipped ? 'Lip out!' : how.left < 1.5 ? 'So close!' : ''
    if (r.holed) {
      s.done = true
      sub = s.strokes === 1 ? 'One putt!' : `${s.strokes} putts`
    } else if (how.left <= PT.gimme) {
      // Close enough: it's given, one more putt.
      s.strokes++
      s.done = true
      text = text || 'Gimme'
      sub = `${how.text} · ${s.strokes} putts`
    } else if (s.strokes >= PT.maxPutts) {
      s.done = true
      s.strokes = PT.maxPutts + 1
      text = 'Picked up'
      sub = `${s.strokes} on this hole`
    } else s.ball = { x: r.rest.x, z: r.rest.z }
    if (s.done) s.card[state.hole] = s.strokes
    // A banner for the moments (in, lip out, gimme, picked up); a plain miss has the panel.
    state.banner = text ? { text, sub, color: r.holed ? GOLD : text === 'Picked up' ? QUIET : INK, t: 0 } : null
  } else if (isCourse()) {
    s.strokes++
    let text = r.lipped ? 'Lip out!' : how.left < 1.5 ? 'So close!' : ''
    if (r.holed) {
      s.done = true
      text = scoreName(s.strokes)
      sub = `${s.strokes} strokes`
    } else if (how.left <= PT.gimme) {
      // Close enough: it's given, one more stroke.
      s.strokes++
      s.done = true
      text = `Gimme · ${scoreName(s.strokes)}`
      sub = `${s.strokes} strokes`
    } else s.ball = { x: r.rest.x, z: r.rest.z }
    if (!s.done && s.strokes >= MAX_STROKES) {
      s.done = true
      text = 'Picked up'
      sub = `${s.strokes} on this hole`
    }
    state.banner = text ? { text, sub, color: s.done && text !== 'Picked up' ? GOLD : text === 'Picked up' ? QUIET : INK, t: 0 } : null
  } else {
    s.shots.push({ holed: r.holed, feet: Math.round(feet), left: Math.round(how.left * 10) / 10, putt: true })
    if (r.holed) {
      const best = save.data.longestPutt[s.name] ?? 0
      if (feet > best) save.data.longestPutt[s.name] = Math.round(feet)
      state.banner = { text: feet > best && best ? 'Longest putt!' : 'In!', sub: `${Math.round(feet)} ft`, color: GOLD, t: 0 }
    } else state.banner = r.lipped ? { text: 'Lip out!', sub: how.text, color: PINK, t: 0 } : null
  }
  save.save()
  if (s.kind === 'phone') party.view(s.id).last = (r.holed ? `In from ${Math.round(feet)} ft!` : `${how.text} · from ${Math.round(feet)} ft`) + (sh.input.lazy ? ' · stroke through firmer for the full bar' : '')
  state.phase = 'result'
  state.resultTime = 0
  publish()
}

/** The golfer reacts, and on a good shot everyone waiting hops too. */
function cheer(s, kind) {
  view.react(s.look, kind)
  if (kind === 'cheer' || kind === 'happy') for (const o of state.seats) if (o !== s) view.react(o.look, 'happy')
}

function finishShot() {
  if (isCourse()) return finishCourseShot()
  if (isPin()) return finishPinShot()
  const sh = state.shot
  const s = sh.seat
  const r = sh.result
  view.mark(r.flight.rest, s.color)
  state.recent.push({ x: r.flight.rest.x, z: r.flight.rest.z, color: s.color })
  if (state.recent.length > 40) state.recent.shift()
  const rec = { carry: r.carry, total: r.total, offline: r.offline, shape: r.shape, club: sh.club.short, points: sh.score?.points ?? 0 }
  s.shots.push(rec)
  if (!isTargets()) {
    // Practice: a long-drive record per player name, and a name for the shot.
    const longest = save.data.longest[s.name] ?? 0
    if (r.total > longest && sh.club.id === 'dr') {
      save.data.longest[s.name] = r.total
      if (longest) state.banner = { text: 'New longest drive!', sub: `${r.total} yd`, color: GOLD, t: 0 }
      sfx.long()
    }
    state.banner ??= { text: r.shape, sub: `${r.carry} yd carry`, color: r.shape === 'Straight!' ? LIME : INK, t: 0 }
    const good = r.shape === 'Straight!' && sh.input.power > 0.75
    // A big hook or slice makes them wince; the sea makes them sad (below).
    if (!r.flight.water) cheer(s, good ? 'cheer' : Math.abs(r.offline) < 12 ? 'happy' : Math.abs(r.offline) < 30 ? 'wince' : 'sad')
  }
  if (r.flight.water) {
    state.banner = { text: 'Splash!', sub: 'Into the sea', color: '#7fd6ff', t: 0 }
    view.react(s.look, 'sad')
  }
  save.save()
  const off = r.flight.water ? 'in the sea' : Math.abs(r.offline) < 1 ? 'on line' : `${Math.abs(r.offline)} yd ${r.offline > 0 ? 'right' : 'left'}`
  if (s.kind === 'phone') party.view(s.id).last = `${r.carry} yd carry · ${r.shape} · ${off}${sh.input.lazy ? ' · swing through faster for the full bar' : ''}`
  state.phase = 'result'
  state.resultTime = 0
  publish()
}

/** How the course's lies read on the TV. */
const LIES = { green: 'On the green!', fringe: 'Just off the green', fairway: 'Fairway', rough: 'In the rough', hill: 'Up on the hill', sand: 'On the beach', bunker: 'In the bunker!' }
/** A lie as the HUD's chip says it, with what it costs the swing. */
const LIE_CHIP = { tee: 'On the tee', fairway: 'Fairway', rough: 'Rough', hill: 'Hillside', sand: 'Beach sand', bunker: 'Bunker', fringe: 'Fringe', green: 'Green' }

/**
 * Closest to the pin: the ball has stopped. Its score is how many feet from the pin it lies (in
 * the hole is 0, off the green is a flat 100), and the next ball is from the next spot.
 */
function finishPinShot() {
  const sh = state.shot
  const s = sh.seat
  const f = sh.result.flight
  const lie = f.water ? 'water' : lieAt(f.rest.x, f.rest.z)
  const feet = pinScore(f.rest, { holed: f.holed, lie })
  s.shots.push({ feet, on: f.holed || lie === 'green', carry: sh.result.carry, club: sh.club.short })
  let banner
  if (f.holed) {
    banner = { text: 'In the hole!', sub: '0 ft', color: GOLD }
    sfx.cup()
    cheer(s, 'cheer')
    view.burst({ ...s.cup, y: groundHeight(s.cup.x, s.cup.z) }, [s.color, GOLD, '#ffffff', TEAL], 120)
    buzz(s, 220)
  } else if (lie === 'green') {
    banner = { text: `${feet < 10 ? feet.toFixed(1) : Math.round(feet)} ft`, sub: feet < 10 ? 'Stiff!' : 'On the green', color: feet < 10 ? GOLD : LIME }
    if (feet < 10) sfx.target(0)
    cheer(s, feet < 10 ? 'cheer' : 'happy')
    buzz(s, feet < 10 ? 160 : 80)
  } else {
    banner = { text: f.water ? 'Splash!' : (LIES[lie] ?? 'Missed the green'), sub: `Missed the green · ${PIN.miss} ft`, color: f.water ? '#7fd6ff' : QUIET }
    sfx.miss()
    view.react(s.look, lie === 'fringe' ? 'wince' : 'sad')
  }
  state.banner = { ...banner, t: 0 }
  save.save()
  if (s.kind === 'phone') party.view(s.id).last = `${banner.text} · ${banner.sub}${sh.input.lazy ? ' · swing through faster for the full bar' : ''}`
  state.phase = 'result'
  state.resultTime = 0
  publish()
}

/**
 * A full shot on the course has stopped: count it, move the ball to where it lies (the sea is a
 * penalty stroke, played again from where it was hit), and say how it lies and how far is left.
 */
function finishCourseShot() {
  const sh = state.shot
  const s = sh.seat
  const r = sh.result
  const f = r.flight
  s.strokes++
  let banner
  if (f.water) {
    s.strokes++
    banner = { text: 'Splash!', sub: '+1 stroke · play it again from there', color: '#7fd6ff' }
    view.react(s.look, 'sad')
  } else if (f.holed) {
    s.ball = { ...s.cup }
    s.done = true
    banner = { text: scoreName(s.strokes), sub: `In from ${r.total} yd!`, color: GOLD }
    sfx.cup()
    cheer(s, 'cheer')
    view.burst({ ...s.cup, y: groundHeight(s.cup.x, s.cup.z) }, [s.color, GOLD, '#ffffff', TEAL], 120)
    buzz(s, 220)
  } else {
    // No marker where it stopped (the range's coloured pins): the next shot is played from right
    // there, and the camera would be inside it.
    s.ball = { x: f.rest.x, z: f.rest.z }
    const lie = lieAt(s.ball.x, s.ball.z)
    const yd = Math.round(yardsToPin(s.ball))
    banner = { text: LIES[lie] ?? r.shape, sub: lie === 'green' ? `${Math.round(yardsToPin(s.ball) * 3)} ft to the pin` : `${yd} yd to the pin`, color: lie === 'green' ? LIME : INK }
    banner.color = lie === 'bunker' ? '#f5dfa5' : banner.color
    cheer(s, lie === 'green' ? 'cheer' : lie === 'fairway' || lie === 'fringe' ? 'happy' : 'wince')
  }
  if (!s.done && s.strokes >= MAX_STROKES) {
    s.done = true
    banner = { text: 'Picked up', sub: `${s.strokes} on this hole`, color: QUIET }
  }
  state.banner = { ...banner, t: 0 }
  save.save()
  if (s.kind === 'phone') party.view(s.id).last = `${r.carry} yd carry · ${r.shape} · ${banner.text}${banner.sub ? ` · ${banner.sub}` : ''}${sh.input.lazy ? ' · swing through faster for the full bar' : ''}`
  state.phase = 'result'
  state.resultTime = 0
  publish()
}

// ---- flow --------------------------------------------------------------------------------------

function openLobby() {
  state.seats = []
  state.safe = new Set()
  lobby.open()
  state.screen = 'lobby'
}
function pause() {
  state.resumeTo = state.screen === 'lobby' ? 'lobby' : 'playing'
  pauseMenu.select('resume')
  state.screen = 'paused'
  party.public.paused = true
  sfx.stopFly()
  save.save()
}
function resume() {
  state.screen = state.resumeTo
  party.public.paused = false
}
function openSettings(from) {
  settingsScroll = 0
  state.from = from
  state.screen = 'settings'
}
function quitToTitle() {
  setHole(-1)
  if (state.seats[0]?.kind !== 'tv') party.close()
  state.seats = []
  state.screen = 'title'
  sfx.music(false)
  sfx.stopFly()
}
/** Open the game picker, from the lobby, play on this screen, the pause menu or the results. */
function openPick(from) {
  state.pickFrom = from
  pickMenu.select(state.mode)
  state.screen = 'pick'
  sfx.blip()
  publish()
}
/** A game was picked: remember it and start it (the same party, or this screen alone). */
function playMode(mode) {
  state.mode = mode
  settings.data.mode = mode
  settings.save()
  if (state.pickFrom === 'solo') soloGame()
  else newGame()
}

function update(dt) {
  party.update()
  motion.update(dt)
  sfx.update()
  switch (state.screen) {
    case 'title': {
      phoneMenus.input(null) // no phones until the lobby
      const choice = titleMenu.update(input, dt)
      if (choice === 'party') openLobby()
      if (choice === 'solo') openPick('solo')
      if (choice === 'settings') openSettings('title')
      if (choice === 'wardrobe') {
        for (const it of wardrobeMenu.items) if (it.type) it.value = it.id === 'hand' ? settings.data.hand : (TITLE_LOOK.outfit[it.id] ?? 'none')
        wardrobeMenu.select('hat')
        state.screen = 'wardrobe'
      }
      break
    }
    case 'wardrobe': {
      phoneMenus.input(null)
      const choice = wardrobeMenu.update(input, dt)
      if (choice === 'done' || choice === 'back') state.screen = 'title'
      break
    }
    case 'settings':
      if (settingsScreen.update(phoneMenus.input(state.from === 'paused' ? settingsScreen.menu : null), dt) === 'back') state.screen = state.from
      break
    case 'lobby': {
      phoneMenus.input(null) // phones have their own lobby screen
      if (input.pressed('menu')) {
        pause()
        break
      }
      const result = lobby.update()
      if (result === 'start') openPick('lobby') // everyone's in: what are we playing?
      if (result === 'back') state.screen = 'title'
      break
    }
    case 'paused': {
      const choice = pauseMenu.update(phoneMenus.input(pauseMenu), dt)
      if (choice === 'resume' || choice === 'back') resume()
      if (choice === 'restart') state.resumeTo === 'lobby' ? resume() : newGame()
      if (choice === 'pick') state.resumeTo === 'lobby' ? resume() : openPick('paused')
      if (choice === 'settings') openSettings('paused')
      if (choice === 'title') quitToTitle()
      break
    }
    case 'pick': {
      const choice = pickMenu.update(phoneMenus.input(pickMenu), dt)
      if (choice === 'back') {
        state.screen = { lobby: 'lobby', solo: 'title', paused: 'paused', gameover: 'gameover' }[state.pickFrom] ?? 'title'
        publish()
      } else if (choice) playMode(choice)
      break
    }
    case 'gameover': {
      const choice = overMenu.update(phoneMenus.input(overMenu), dt)
      if (choice === 'again') newGame()
      if (choice === 'pick') openPick('gameover')
      if (choice === 'title' || choice === 'back') quitToTitle()
      break
    }
    case 'playing':
      phoneMenus.input(null)
      playUpdate(dt)
      break
  }
}

function playUpdate(dt) {
  if (input.pointer.pressed && inside(input.pointer, PAUSE_BUTTON)) input.requestMenu()
  if (input.pressed('menu')) return pause()
  const s = seat()
  if (!s) return quitToTitle()
  if (state.phase === 'safety') return safetyUpdate(dt)
  const press = () => input.pressed('a') || state.seats.some((x) => x.kind === 'local' && party.pressed(x.id, 'a')) || (input.pointer.pressed && !inside(input.pointer, PAUSE_BUTTON))
  if (state.phase === 'flyover') {
    // The sweep down a new hole; A (or a tap) skips it once it has started.
    state.fly += dt
    state.swingPose = 0
    if (state.fly >= TUNING.course.flyover || (state.fly > 0.5 && press())) startTurn()
    return
  }
  if (state.phase === 'card') {
    state.cardTime += dt
    state.swingPose = 0
    if (state.cardTime >= TUNING.course.card || (state.cardTime > 0.8 && press())) nextHole()
    return
  }
  if (state.banner) state.banner.t += dt
  if (state.ghost && (state.ghost.t += dt) > TUNING.practice.show) state.ghost.text = ''
  // The golfer: follows the phone's swing live, or plays the follow-through after a hit.
  const live = s.kind === 'phone' ? party.inputs[s.id] ?? {} : {}
  // A putting stroke is small: shown bigger so the TV can see it rock.
  const k = isPutting() ? 3 : 1
  const meterTop = isPutting() ? 60 : 230
  if (state.phase === 'aim' && live.a) state.swingPose = clamp((Number(live.sw) || 0) * k, -200, 270)
  else if (state.phase === 'meter' && state.meter) state.swingPose = state.meter.stage === 'power' ? state.meter.v * meterTop : Math.max(0, state.meter.v) * meterTop
  else if (state.phase === 'flight' || state.phase === 'result') state.swingPose = lerp(state.swingPose, isPutting() ? -40 : -170, Math.min(1, dt * 9))
  else state.swingPose = lerp(state.swingPose, 0, Math.min(1, dt * 6))
  // The player left: pass the turn on.
  if (!connected(s) && (state.phase === 'aim' || state.phase === 'meter')) return nextTurn()
  if (state.phase === 'aim' || state.phase === 'meter') aimControls(dt)
  else if (state.phase === 'flight') state.shot?.putt ? rollUpdate(dt) : flightUpdate(dt)
  else if (state.phase === 'result') {
    state.resultTime += dt
    const skip = input.pressed('a') || (s.kind === 'local' && party.pressed(s.id, 'a')) || (input.pointer.pressed && !inside(input.pointer, PAUSE_BUTTON))
    if (state.resultTime > 3.2 || (state.resultTime > 0.6 && skip)) nextTurn()
  }
}

/**
 * The safety screen: it waits for every phone's "I'm ready", or for A / Start now on this
 * machine (or a local pad) once it has been up long enough to be read.
 */
function safetyUpdate(dt) {
  state.safetyTime += dt
  const early = state.safetyTime > TUNING.safetyMin
  const ok = input.pressed('a') || state.seats.some((x) => x.kind === 'local' && party.pressed(x.id, 'a')) || (input.pointer.pressed && inside(input.pointer, SAFETY_OK))
  if (!unsafe().length || (early && ok)) {
    sfx.blip()
    startPlay()
  }
}

/** What the phones show. */
function publish() {
  const s = seat()
  const playing = state.screen === 'playing' || state.screen === 'paused'
  party.public.phase = state.screen === 'gameover' ? 'over' : playing ? ({ meter: 'aim', flyover: 'result', card: 'result' }[state.phase] ?? state.phase) : 'menu'
  party.public.mode = state.mode
  party.public.putting = isPutting()
  party.public.turn = s?.id ?? null
  party.public.turnName = s?.name ?? ''
  const strength = settings.data.strength
  const SW = TUNING.swing
  party.public.clubs = isPutting() ? [{ short: 'PT', sub: 'putter' }] : CLUBS.map((c) => ({ short: c.short, carry: c.carry }))
  // The phone's swing reader (a full swing, or a putting stroke: small and slow), and what its bar
  // needs: how far back is full power, and how fast the downswing has to be to deliver it.
  const bar = { commit: SW.commit, maxBack: SW.maxBack }
  if (isPutting()) {
    const st = puttStroke(strength, { range: puttRange(s) })
    party.public.swing = { ...PT.reader, ...bar, commit: st.commit, backFull: Math.round(st.backFull * 10) / 10, full: Math.round(st.full) }
  } else party.public.swing = { ...SW.reader, ...bar, backFull: SW.backFull[strength] ?? SW.backFull.normal, full: SW.full[strength] ?? SW.full.normal }
  party.public.wardrobe = OUTFITS
  party.public.cards = state.seats.map((x) => ({ id: x.id, name: x.name, color: x.color, score: scoreText(x) }))
  party.public.banner = state.banner?.text ?? null
  // Whatever menu the TV shows, every phone shows too, so nobody has to touch the TV.
  if (state.screen === 'paused') phoneMenus.publish(pauseMenu, 'Paused')
  else if (state.screen === 'settings' && state.from === 'paused') phoneMenus.publish(settingsScreen.menu, 'Settings')
  else if (state.screen === 'gameover') phoneMenus.publish(overMenu, isCourse() ? 'Round over' : 'Challenge over')
  else if (state.screen === 'pick') phoneMenus.publish(pickMenu, 'What are we playing?')
  else phoneMenus.publish(null)
  party.public.over = isCourse() ? 'Round over' : 'Challenge over'
  party.public.practice = true // this TV answers practice swings (the phone shows PRACTICE)
  party.public.ballsLeft = isTargets() && s ? `${s.name}: ball ${Math.min(TUNING.targets.balls, s.shots.length + 1)} of ${TUNING.targets.balls}` : isPutts() && s ? `Hole ${state.hole + 1} of ${PT.holes} · ${s.name} is away` : isCourse() && state.phase === 'card' ? 'The scorecard is on the TV' : isCourse() && s?.ball ? `Hole ${state.courseHole + 1} of ${HOLES.length} · ${HOLE.name} · par ${HOLE.par} · ${s.name} is away, ${Math.round(yardsToPin(s.ball, s.cup))} yd out` : isPin() && s ? `${s.name}: ball ${Math.min(TUNING.pin.balls, s.shots.length + 1)} of ${TUNING.pin.balls}` : ''
  // Every phone gets its own view, seated or not (a phone that joins mid-game sees it at once).
  for (const p of party.players) {
    if (p.kind !== 'phone') continue
    const v = party.view(p.id)
    const mine = state.seats.find((x) => x.id === p.id)
    v.active = Boolean(s && s.id === p.id && playing)
    v.seated = Boolean(mine)
    v.club = isPutting() ? 0 : (mine?.club ?? 0)
    v.aim = isPutting() ? Math.round((mine?.paim ?? 0) * 2) / 2 : Math.round(mine?.aim ?? 0)
    v.putt = isPutting() && mine?.ball && mine.cup ? puttRead(mine) : null
    // The help's pace, as a mark on the phone's bar (the bar is the backstroke: ball speed ÷ a full one's).
    // The bar is scaled to the putt (puttRange): the help's pace is its middle, near enough.
    v.puttMark = isPutting() && puttHelp() && mine?.plan ? Math.round((mine.plan.speed ** 2 / (2 * PT.roll) / puttRange(mine)) * 100) / 100 : null
    // How far a full bar rolls (ft), so the phone can say how far this stroke will go as you take it back.
    v.puttRange = isPutting() && mine?.ball && mine.cup ? Math.round((puttRange(mine) / FT) * 10) / 10 : null
    // A shot at a pin: how far, the wind and the lie in words, the pin's mark on the bar (the share
    // of a full backswing that gets there) and what a full bar carries, so the phone can count
    // the yards up as the club goes back.
    const links = isLinks() && !isPutting() && mine?.ball && mine.cup
    const mineUp = mine && mine === s
    v.read = links ? shotRead(mine) : null
    v.pinMark = links && mineUp ? pinMark(mine) : null
    v.shotRange = mine && !isPutting() ? fullCarry(mine) : null
    v.golfer = mine ? { name: mine.crew.name, color: mine.crew.color } : null
    v.outfit = mine ? mine.look.outfit : null
    v.hand = mine ? mine.hand : null
    v.safe = state.safe.has(p.id)
  }
}
const total = (s) => s.shots.reduce((a, x) => a + (x.points ?? 0), 0)
const putts = (s) => s.card.reduce((a, x) => a + (x ?? 0), 0)
const feetTotal = (s) => Math.round(s.shots.reduce((a, x) => a + (x.feet ?? 0), 0))
/** A shot at a pin, in words for the phone: '131 yd to the pin · 8 mph left to right · Rough: 90% power'. */
function shotRead(s) {
  const lie = lieOf(s)
  const lp = liePower(lie, CLUBS[s.club])
  return `${Math.round(yardsToPin(s.ball, s.cup))} yd to the pin · ${state.wind.mph ? 'wind ' : ''}${windWords(state.wind, lineDeg(s)).replace('No wind', 'no wind')}${lp < 1 ? ` · ${LIE_CHIP[lie]}: ${Math.round(lp * 100)}% power` : ''}`
}
function scoreText(s) {
  if (isPutts()) return `${putts(s) + (s.done ? 0 : s.strokes)}`
  if (isCourse()) return `${roundStrokes(s)}${s.done && !s.carded ? ' ✓' : ''}`
  if (isPin()) return s.shots.length ? `${feetTotal(s)} ft` : '–'
  if (state.mode === 'putting') return s.shots.length ? `${s.shots.filter((x) => x.holed).length}/${s.shots.length}` : '–'
  if (isTargets()) return `${total(s)}`
  return s.shots.length ? `${Math.max(...s.shots.map((x) => x.total))} yd` : '–'
}
/** The read of a seat's putt: '18 ft · uphill 3 in'. */
function puttRead(s) {
  const r = readPutt(s.ball, s.cup, greenOf())
  const ft = r.feet < 10 ? r.feet.toFixed(1) : Math.round(r.feet)
  const rise = Math.abs(r.rise) < 1 ? 'flat' : `${r.rise > 0 ? 'uphill' : 'downhill'} ${Math.round(Math.abs(r.rise))} in`
  return `${ft} ft · ${rise}`
}

// ---- draw --------------------------------------------------------------------------------------

function draw(dt) {
  const s = seat()
  const inGame = state.screen === 'playing' || state.screen === 'paused' || state.screen === 'gameover' || (state.screen === 'settings' && state.from === 'paused')
  const sh = state.shot
  const P = inGame && isPutting() ? puttOf(s) : null
  let mode = state.screen === 'title' || state.screen === 'wardrobe' || state.screen === 'pick' || state.screen === 'lobby' || (state.screen === 'settings' && state.from === 'title') ? 'title' : 'overview'
  if (inGame && s && P) mode = state.phase === 'flight' ? 'roll' : state.phase === 'result' ? 'rolled' : 'putt'
  else if (inGame && s) mode = state.phase === 'flight' ? 'flight' : state.phase === 'result' ? 'landed' : state.phase === 'flyover' && state.screen !== 'gameover' ? 'flyover' : 'address'
  const pts = sh ? (sh.putt ? sh.roll.points : sh.result.flight.points) : []
  // On the green, the ball waits at the seat's spot; a putt rolls from where it was struck.
  if (P && sh?.putt) Object.assign(P, { from: sh.from, cup: sh.cup, dir: (sh.dir * Math.PI) / 180 })
  if (P && puttHelp() && s?.plan && !sh && (state.phase === 'aim' || state.phase === 'meter')) P.path = guide(s)
  if (P) P.balls = state.seats.filter((o) => o !== s && (isPutts() || isCourse()) && o.ball && !o.done && connected(o) && greenReach(o.ball.x, o.ball.z, P.green) < 1.4).map((o) => ({ ...o.ball, color: o.color }))
  // The course: a full shot is played from where the ball lies (teed up on the tee).
  const course = inGame && isLinks() && s?.ball && !P
  const teed = course && onTee(s)
  const ballAtRest = P && !sh?.pos ? { x: P.from.x, y: puttHeight(P.from.x, P.from.z, P.green) + TUNING.ball.radius, z: P.from.z } : course && !sh?.pos ? { x: s.ball.x, y: groundHeight(s.ball.x, s.ball.z) + (teed ? 0.13 : TUNING.ball.radius), z: s.ball.z } : null
  const spot = course ? (sh?.from ?? s.ball) : null
  view.draw({
    mode,
    putting: P,
    aim: course ? bearing(spot, s.cup) + s.aim : (s?.aim ?? 0),
    tee: course ? { x: spot.x, z: spot.z, dir: (bearing(spot, s.cup) * Math.PI) / 180 } : null,
    flag: inGame && isLinks() ? { cup: HOLE.cup, green: HOLE.green } : null,
    // Which hole is out there: the course's (with its sand and tee), Closest to the pin's green, or the range.
    course: inGame && isCourse() ? { hole: state.courseHole, sand: true, tee: true } : inGame && isPin() ? { hole: PIN.hole, sand: true, tee: false } : null,
    fly: mode === 'flyover' ? { tee: HOLE.tee, cup: HOLE.cup, k: clamp(state.fly / TUNING.course.flyover, 0, 1) } : null,
    ball: sh?.pos ?? ballAtRest,
    trail: sh ? pts.slice(0, sh.trailN ?? 0).concat(sh.pos ? [{ ...sh.pos }] : []) : [],
    trailColor: s?.color,
    golfer: inGame && s ? s.look : null,
    face: inGame && s ? faceOf(s) : 'smug',
    // The title: the crew lined up beside the rail, smiling at the camera.
    waiting: inGame ? state.seats.filter((o) => o !== s && connected(o)).map((o) => o.look) : TITLE_CREW.map((l, i) => ({ ...l, face: TITLE_FACES[i] })),
    ground: sh?.pos ? (sh.putt ? puttHeight(sh.pos.x, sh.pos.z, greenOf()) : groundHeight(sh.pos.x, sh.pos.z)) : 0,
    land: sh?.landed && !sh.putt ? sh.result.flight.carry : null,
    swing: inGame ? state.swingPose : 0,
    hand: s?.hand ?? settings.data.hand,
    lit: state.lit,
    targets: !(inGame && isLinks()),
    dt,
    reducedShake: settings.data.reducedShake
  })
  ctx.clearRect(0, 0, W, H)
  overflow = []
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  canvas.style.cursor = state.screen === 'playing' && input.mode === 'mouse' && state.phase === 'flight' ? 'none' : ''

  if (state.screen === 'title' || state.screen === 'wardrobe' || state.screen === 'pick') drawTitle()
  else if (state.screen === 'settings') {
    drawSettings()
  } else if (state.screen === 'lobby') {
    veil(0.4)
    lobby.draw(ctx, W, H)
  } else if (state.screen === 'gameover') drawResults()
  else {
    drawHud(s)
    if (state.screen === 'paused') {
      veil(0.6)
      text('Paused', W / 2, H / 2 - 250, head(64), INK)
      pauseMenu.draw(ctx, fitFont(rubik, 28 * ts(), 380, ...pauseMenu.items.map((it) => it.label)))
    }
  }
  if (debug) drawDebug()
}

/** The help's guide: the roll at the current aim and the help's pace (cached until the aim moves). */
let guideKey = ''
let guidePts = null
function guide(s) {
  const key = `${s.id}:${s.ball.x}:${s.ball.z}:${s.paim.toFixed(2)}`
  if (key !== guideKey) {
    guideKey = key
    guidePts = previewPutt(s.ball, bearing(s.ball, s.cup) + s.paim, s.plan.speed, PT, greenOf())
  }
  return guidePts
}

/**
 * The golfer's face for the moment (a reaction to a shot plays over it): focused at address,
 * nervous over a short putt in the challenge, straining on the downswing.
 */
function faceOf(s) {
  if (state.phase === 'safety') return 'idle'
  const live = s.kind === 'phone' ? party.inputs[s.id] ?? {} : {}
  if (state.phase === 'meter') return state.meter?.stage === 'accuracy' ? 'effort' : 'focus'
  if (state.phase === 'aim') {
    if (live.a && live.swp === 'down') return 'effort'
    if (isPutts() && s.ball && s.cup && Math.hypot(s.cup.x - s.ball.x, s.cup.z - s.ball.z) < 8 * FT) return 'nervous'
    return 'focus'
  }
  if (state.phase === 'flight') return 'focus'
  return 'idle'
}

function veil(a) {
  ctx.fillStyle = `rgba(11,26,54,${a})`
  ctx.fillRect(0, 0, W, H)
}
function text(str, x, y, font, color, align = 'center') {
  ctx.font = font
  ctx.textAlign = align
  ctx.lineJoin = 'round'
  ctx.lineWidth = 8
  ctx.strokeStyle = 'rgba(11,26,54,0.85)'
  ctx.strokeText(str, x, y)
  ctx.fillStyle = color
  ctx.fillText(str, x, y)
}
/** Text without the outline: for dark words on light panels (the title's tiles and card). */
function plain(str, x, y, font, color, align = 'center') {
  ctx.font = font
  ctx.textAlign = align
  ctx.fillStyle = color
  ctx.fillText(str, x, y)
}
function panel(x, y, w, h, r = 18, fill = PANEL) {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}
function dot(x, y, r, color) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

/** The clubhouse rail's size: a navy column down the left, the crew in the scene to its right. */
const RAIL = { w: 400, radius: 40 }
/** What each title item does, in the card at the bottom right. */
const TITLE_CARD = {
  party: { title: 'Everyone grabs a phone', steps: [['Scan the code on the TV', TEAL], ['Dress your bean', PINK], ['Hold SET and swing', LIME]] },
  solo: { title: 'Just you, on this screen', text: 'Swing with the meter (A to start, A for power, A on the line), or pull down and flick with a mouse or touch.' },
  wardrobe: { title: 'Dress your bean', text: 'A hat, a top and one extra for playing on this screen. Phones have their own wardrobe.' },
  settings: { title: 'Settings', text: 'Sound, text size, graphics, swing power, and how much help with straight shots and putts.' }
}
const MODE_TEXT = {
  practice: 'Hit as many as you like and see every number: carry, curve, club speed, tempo.',
  targets: 'Ten balls each at five ringed greens. Further greens are worth more.',
  pin: 'Six approach shots at one green, from 60 to 150 yards, each in its own wind. Your score is how many feet from the pin each ball stops: miss the green and it counts 100. Fewest feet wins.',
  putting: 'A fresh putt every turn, short, middling and long. The help reads the break.',
  putts: 'Nine holes, fewest putts wins. Whoever is farthest from the cup putts next.',
  course: `Three holes by the sea: ${HOLES.map((h) => `${h.name} (par ${h.par})`).join(', ')}. Sand and wind to play around. Everyone tees off, then whoever is farthest from the pin plays next. Fewest strokes wins.`
}

function drawTitle() {
  const wardrobe = state.screen === 'wardrobe'
  const picking = state.screen === 'pick'
  const menu = wardrobe ? wardrobeMenu : picking ? pickMenu : titleMenu
  // The rail.
  ctx.save()
  ctx.fillStyle = 'rgba(11,26,54,0.95)'
  ctx.beginPath()
  ctx.roundRect(-RAIL.radius, 0, RAIL.w + RAIL.radius, H, RAIL.radius)
  ctx.fill()
  ctx.restore()
  // The rail is a fixed width: its text grows with the text size a little, then fits.
  const rs = Math.min(ts(), 1.2)
  if (picking) {
    // The same question the phones ask.
    text('What are we', 34, 96 + DY, lilita(54), GOLD, 'left')
    text('playing?', 34, 156 + DY, lilita(54), LIME, 'left')
  } else {
    text('Seaside', 34, 92 + DY, lilita(74), GOLD, 'left')
    text('Swing', 34, 160 + DY, lilita(74), LIME, 'left')
  }
  if (wardrobe) text('Wardrobe', RAIL.w - 34, 160 + DY, rubik(22 * rs), QUIET, 'right')
  // The tiles: menu.js handles the input; this draws them as the rail's tiles.
  menu.items.forEach((it, i) => {
    const r = menu.rect(i)
    const on = it === menu.selected
    ctx.save()
    if (on) {
      ctx.fillStyle = '#c99a12'
      ctx.beginPath()
      ctx.roundRect(r.x, r.y + 6, r.w, r.h, 20)
      ctx.fill()
    }
    ctx.fillStyle = on ? GOLD : '#16305a'
    ctx.beginPath()
    ctx.roundRect(r.x, r.y, r.w, r.h, 20)
    ctx.fill()
    ctx.restore()
    railIcon(it.id, r.x + 14, r.y + r.h / 2 - 21, on)
    const ink = on ? '#0b1a36' : INK
    const room = r.w - 70 - 16
    if (it.type) {
      // Room for the ‹ › arrows whether or not it's selected, so the text doesn't jump.
      const value = menu.display(it)
      ;(on ? plain : text)(it.label, r.x + 70, r.y + 24, fitFont(rubik, 19 * rs, room - 56, it.label), on ? '#0b1a36' : QUIET, 'left')
      ;(on ? plain : text)(value, r.x + 70, r.y + 50, fitFont(rubik, 21 * rs, room - 56, value), ink, 'left')
      if (on) plain('‹  ›', r.x + r.w - 18, r.y + r.h / 2 + 1, rubik(26), ink, 'right')
    } else (on ? plain : text)(it.label, r.x + 70, r.y + r.h / 2 + 1, fitFont(rubik, 23 * rs, room, it.label), ink, 'left')
  })
  const prompt = (label, words, x, y) => {
    ctx.font = rubik(17 * rs)
    const w = ctx.measureText(label).width + 16
    panel(x, y - 13 * rs, w, 26 * rs, 7, INK)
    plain(label, x + w / 2, y + 1, rubik(17 * rs), '#0b1a36')
    plain(words, x + w + 8, y + 1, rubik(17 * rs, 500), QUIET, 'left')
    ctx.font = rubik(17 * rs, 500)
    return x + w + 8 + ctx.measureText(words).width + 18
  }
  let px = wardrobe ? prompt('◀ ▶', 'change', 34, H - 40) : prompt(input.label('a'), 'choose', 34, H - 40)
  prompt(input.dpadLabel(), 'move', px, H - 40)
  // The card: what the highlighted tile does.
  if (wardrobe) return
  const sel = menu.selected?.id
  if (picking && sel === 'back') return
  const card = picking ? { title: MODES.find((m) => m.value === sel)?.title, text: MODE_TEXT[sel] } : (TITLE_CARD[sel] ?? TITLE_CARD.party)
  const x = RAIL.w + 46
  const w = W - x - 48
  const cs = ts()
  const title = card.title
  const best = Object.entries(save.data.longest).sort((a, b) => b[1] - a[1])[0]
  const bestText = best && sel === 'party' && !picking ? `Longest drive: ${best[1]} yd (${best[0]})` : ''
  ctx.font = rubik(18 * cs, 600)
  const bestW = bestText ? ctx.measureText(bestText).width + 24 : 0
  // The words, wrapped, decide the card's height.
  const lh = Math.round(22 * cs * 1.3)
  const col = (w - 60) / 3
  const stepFont = rubik(21 * cs, 600)
  const textFont = rubik(22 * cs, 600)
  const words = card.text
  const lines = card.steps ? Math.max(...card.steps.map(([str]) => wrapLines(str, col - 56, stepFont).length)) : wrapLines(words, w - 60, textFont).length
  const titleH = 40 * cs
  const h = Math.round(24 + titleH + 20 + lines * lh + 22)
  const y = H - 40 - h
  ctx.save()
  ctx.fillStyle = 'rgba(11,26,54,0.25)'
  ctx.beginPath()
  ctx.roundRect(x, y + 12, w, h, 30)
  ctx.fill()
  ctx.fillStyle = '#fff8ec'
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 30)
  ctx.fill()
  ctx.restore()
  const ty = y + 24 + titleH / 2
  plain(title, x + 30, ty, fitFont(lilita, 40 * cs, w - 60 - bestW, title), '#0b1a36', 'left')
  if (bestText) plain(bestText, x + w - 30, ty, rubik(18 * cs, 600), '#2a8f8a', 'right')
  const by = y + 24 + titleH + 20 + lh / 2
  if (card.steps) {
    card.steps.forEach(([str, color], i) => {
      const cx = x + 30 + i * col
      const r = Math.round(16 * cs)
      dot(cx + r, by, r, color)
      plain(String(i + 1), cx + r, by + 1, rubik(19 * cs), '#0b1a36')
      wrap(str, cx + 2 * r + 12, by, col - 56, stepFont, '#0b1a36', plain, lh)
    })
  } else wrap(words, x + 30, by, w - 60, textFont, '#28354f', plain, lh)
}

/** What each setting does, for the card beside the list. */
const SETTING_TEXT = {
  master: 'Everything you hear, all at once.',
  music: 'The bouncy tune in the background.',
  sfx: 'Swishes, cracks, splashes and cheers.',
  reducedShake: 'Keeps the camera steadier on the big moments.',
  textScale: 'Bigger words on the TV, for the back of the room.',
  graphics: 'Auto picks for this machine. Low runs smoother on slow ones; High is the full look, with soft shadows and swaying grass.',
  strength: 'How hard you swing for a full shot. Less suits kids, small rooms and gentle swingers.',
  assist: 'How much the game straightens your hooks and slices, and reads the putts for you.',
  flipFace: 'If your slices curve the wrong way on your phone, turn this on.',
  back: ''
}

/**
 * The settings screen, in the clubhouse look: a column of rounded tiles (gold when selected), each
 * value drawn as what it is (a level bar, a switch, a ‹ choice ›), and a card beside it saying
 * what the selected setting does. The list is taller than the screen, so it scrolls to keep the
 * selected row (and a bit of the next) in view, moving the runtime menu with place() so clicks
 * still land on the rows. Words shrink to fit their tile rather than spill.
 */
let settingsScroll = 0
function drawSettings() {
  const m = settingsScreen.menu
  const rowW = 600
  const cardW = Math.min(520, W - rowW - 40 - 96)
  const left = Math.round((W - (rowW + 40 + cardW)) / 2)
  const cx = left + rowW / 2
  const top = 150 + DY
  const step = 58 + 12
  const n = m.items.length
  const i = Math.max(0, m.items.indexOf(m.selected))
  // Whole rows only: as many as fit above the prompts, scrolled a row at a time.
  const rows = Math.min(n, Math.floor((H - 76 - top + 12) / step))
  let first = Math.round(settingsScroll / step)
  if (i < first) first = i
  if (i >= first + rows) first = i - rows + 1
  first = Math.max(0, Math.min(first, n - rows))
  settingsScroll = first * step
  const room = rows * step - 12
  const bottom = top + room
  m.place({ x: cx, y: top - settingsScroll })

  veil(0.55)
  // The heading.
  text('Settings', left, 84 + DY, lilita(64), GOLD, 'left')
  ctx.font = lilita(64)
  const hw = ctx.measureText('Settings').width
  text(state.from === 'paused' ? 'Paused' : 'Clubhouse', left + hw + 18, 92 + DY, rubik(22), QUIET, 'left')

  // The tiles.
  const rs = Math.min(ts(), 1.25)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, top - 2, W, room + 10)
  ctx.clip()
  m.items.forEach((it, k) => {
    const r = m.rect(k)
    if (r.y < top - 1 || r.y + r.h > bottom + 1) return
    const on = it === m.selected
    if (on) panel(r.x, r.y + 5, r.w, r.h, 18, '#c99a12')
    panel(r.x, r.y, r.w, r.h, 18, on ? GOLD : 'rgba(22,48,90,0.96)')
    const ink = on ? '#0b1a36' : INK
    if (it.id === 'back') {
      plain('‹  ' + it.label, r.x + r.w / 2, r.y + r.h / 2 + 1, fitFont(rubik, 24 * rs, r.w - 40, it.label), ink)
      return
    }
    settingIcon(it.id, r.x + 10, r.y + 9, on)
    const valueW = 210
    plain(it.label, r.x + 64, r.y + r.h / 2 + 1, fitFont(rubik, 22 * rs, r.w - 64 - valueW - 16, it.label), ink, 'left')
    drawValue(it, m.display(it), r.x + r.w - valueW - 14, r.y + r.h / 2, valueW, on, rs)
  })
  ctx.restore()
  // More above or below: arrows beside the list.
  if (first > 0) text('▲', left + rowW + 20, top + 29, rubik(18), GOLD)
  if (first + rows < n) text('▼', left + rowW + 20, bottom - 29, rubik(18), GOLD)

  // The card: what the selected setting does.
  const it = m.selected
  const words = it?.id === 'back' ? (state.from === 'paused' ? 'Back to the game. Your changes are saved.' : 'Back to the clubhouse. Your changes are saved.') : (SETTING_TEXT[it?.id] ?? '')
  const kx = left + rowW + 40
  const cs = ts()
  const lh = Math.round(22 * cs * 1.35)
  const font = rubik(22 * cs, 600)
  const lines = wrapLines(words, cardW - 60, font).length
  const titleH = 38 * cs
  const h = Math.round(26 + titleH + 18 + lines * lh + 26)
  const ky = top
  panel(kx, ky + 10, cardW, h, 30, 'rgba(11,26,54,0.25)')
  panel(kx, ky, cardW, h, 30, '#fff8ec')
  const title = it?.id === 'back' ? 'Done' : (it?.label ?? '')
  plain(title, kx + 30, ky + 26 + titleH / 2, fitFont(lilita, 38 * cs, cardW - 60, title), '#0b1a36', 'left')
  wrap(words, kx + 30, ky + 26 + titleH + 18 + lh / 2, cardW - 60, font, '#28354f', plain, lh)
  // Text size shows itself.
  if (it?.id === 'textScale') plain('Aa', kx + cardW - 30, ky + 26 + titleH / 2, lilita(38 * cs), '#2a8f8a', 'right')

  // The prompts.
  const prompt = (label, said, x, y) => {
    ctx.font = rubik(17 * rs)
    const w = ctx.measureText(label).width + 16
    panel(x, y - 13 * rs, w, 26 * rs, 7, INK)
    plain(label, x + w / 2, y + 1, rubik(17 * rs), '#0b1a36')
    plain(said, x + w + 8, y + 1, rubik(17 * rs, 500), QUIET, 'left')
    ctx.font = rubik(17 * rs, 500)
    return x + w + 8 + ctx.measureText(said).width + 22
  }
  let px = prompt(input.dpadLabel(), 'move', left, H - 34)
  px = prompt('◀ ▶', 'change', px, H - 34)
  prompt(input.label('b'), 'back', px, H - 34)
}

/** A setting's value as what it is: a level bar, a switch, or a ‹ choice ›. */
function drawValue(it, shown, x, cy, w, on, rs) {
  const ink = on ? '#0b1a36' : INK
  const dim = on ? 'rgba(11,26,54,0.22)' : 'rgba(255,248,236,0.16)'
  const fill = on ? '#0b1a36' : LIME
  if (it.type === 'range') {
    const f = (it.value - (it.min ?? 0)) / ((it.max ?? 1) - (it.min ?? 0))
    const bars = 10
    const bw = 9
    const gap = 4
    for (let b = 0; b < bars; b++) {
      const bh = 8 + b * 1.6
      panel(x + b * (bw + gap), cy + 11 - bh, bw, bh, 3, b < Math.round(f * bars) ? fill : dim)
    }
    plain(shown, x + w, cy + 1, fitFont(rubik, 21 * rs, w - bars * (bw + gap) - 8, shown), ink, 'right')
  } else if (it.type === 'toggle') {
    const sw = 58
    const sx = x + w - sw
    panel(sx, cy - 15, sw, 30, 15, it.value ? fill : dim)
    ctx.fillStyle = on ? (it.value ? GOLD : '#0b1a36') : it.value ? '#0b1a36' : INK
    ctx.beginPath()
    ctx.arc(it.value ? sx + sw - 15 : sx + 15, cy, 11, 0, Math.PI * 2)
    ctx.fill()
    plain(shown, sx - 12, cy + 1, rubik(20 * rs), ink, 'right')
  } else {
    plain('‹', x + 8, cy, rubik(26), ink)
    plain('›', x + w - 8, cy, rubik(26), ink)
    plain(shown, x + w / 2, cy + 1, fitFont(rubik, 21 * rs, w - 44, shown), ink)
  }
}

/** The settings tiles' icons, drawn like the rail's. */
function settingIcon(id, x, y, on) {
  ctx.save()
  ctx.fillStyle = on ? '#0b1a36' : '#24467d'
  ctx.beginPath()
  ctx.roundRect(x, y, 40, 40, 12)
  ctx.fill()
  ctx.translate(x + 20, y + 20)
  ctx.strokeStyle = on ? GOLD : INK
  ctx.fillStyle = on ? GOLD : INK
  ctx.lineWidth = 2.4
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  if (id === 'master' || id === 'sfx') {
    // A speaker, with waves (or a burst for effects).
    ctx.moveTo(-10, -4)
    ctx.lineTo(-5, -4)
    ctx.lineTo(1, -9)
    ctx.lineTo(1, 9)
    ctx.lineTo(-5, 4)
    ctx.lineTo(-10, 4)
    ctx.closePath()
    if (id === 'master') {
      ctx.moveTo(5, -5)
      ctx.quadraticCurveTo(9, 0, 5, 5)
      ctx.moveTo(8, -9)
      ctx.quadraticCurveTo(15, 0, 8, 9)
    } else {
      ctx.moveTo(6, -6)
      ctx.lineTo(10, -9)
      ctx.moveTo(7, 0)
      ctx.lineTo(12, 0)
      ctx.moveTo(6, 6)
      ctx.lineTo(10, 9)
    }
  } else if (id === 'music') {
    ctx.moveTo(-3, 7)
    ctx.lineTo(-3, -9)
    ctx.lineTo(8, -11)
    ctx.lineTo(8, 5)
    ctx.moveTo(-3, -4)
    ctx.lineTo(8, -6)
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(-6, 8, 4, 3, -0.3, 0, Math.PI * 2)
    ctx.ellipse(5, 6, 4, 3, -0.3, 0, Math.PI * 2)
    ctx.fill()
  } else if (id === 'reducedShake') {
    ctx.rect(-7, -8, 14, 16)
    ctx.moveTo(-12, -4)
    ctx.lineTo(-12, 4)
    ctx.moveTo(12, -4)
    ctx.lineTo(12, 4)
  } else if (id === 'textScale') {
    ctx.font = lilita(22)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Aa', 0, 1)
  } else if (id === 'graphics') {
    // A TV with a sparkle.
    ctx.roundRect(-11, -9, 22, 15, 3)
    ctx.moveTo(-5, 11)
    ctx.lineTo(5, 11)
    ctx.moveTo(1, -5)
    ctx.lineTo(1, 2)
    ctx.moveTo(-2.5, -1.5)
    ctx.lineTo(4.5, -1.5)
  } else if (id === 'strength') {
    // A lightning bolt.
    ctx.moveTo(2, -11)
    ctx.lineTo(-6, 2)
    ctx.lineTo(0, 2)
    ctx.lineTo(-2, 11)
    ctx.lineTo(6, -2)
    ctx.lineTo(0, -2)
    ctx.closePath()
  } else if (id === 'assist') {
    // A straight arrow out of a curve.
    ctx.moveTo(-10, 9)
    ctx.quadraticCurveTo(-10, -2, 0, -2)
    ctx.lineTo(10, -2)
    ctx.moveTo(5, -7)
    ctx.lineTo(10, -2)
    ctx.lineTo(5, 3)
  } else if (id === 'flipFace') {
    ctx.moveTo(-10, -4)
    ctx.lineTo(9, -4)
    ctx.moveTo(5, -8)
    ctx.lineTo(9, -4)
    ctx.lineTo(5, 0)
    ctx.moveTo(10, 5)
    ctx.lineTo(-9, 5)
    ctx.moveTo(-5, 1)
    ctx.lineTo(-9, 5)
    ctx.lineTo(-5, 9)
  } else {
    ctx.arc(0, 0, 8, 0, Math.PI * 2)
  }
  ctx.stroke()
  ctx.restore()
}

/** The rail's little icons, drawn on a rounded square. */
function railIcon(id, x, y, on) {
  ctx.save()
  ctx.fillStyle = on ? '#0b1a36' : '#24467d'
  ctx.beginPath()
  ctx.roundRect(x, y, 42, 42, 13)
  ctx.fill()
  ctx.translate(x + 21, y + 21)
  ctx.strokeStyle = on ? GOLD : INK
  ctx.fillStyle = on ? GOLD : INK
  ctx.lineWidth = 2.6
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  if (id === 'party') {
    ctx.roundRect(-6, -11, 12, 22, 3)
    ctx.moveTo(-2, 7)
    ctx.lineTo(2, 7)
  } else if (id === 'solo') {
    ctx.roundRect(-11, -5, 22, 12, 6)
    ctx.moveTo(-6, -1)
    ctx.lineTo(-6, 3)
    ctx.moveTo(-8, 1)
    ctx.lineTo(-4, 1)
  } else if (id === 'putts') {
    // A trophy.
    ctx.moveTo(-7, -10)
    ctx.lineTo(7, -10)
    ctx.lineTo(6, -2)
    ctx.quadraticCurveTo(0, 5, -6, -2)
    ctx.closePath()
    ctx.moveTo(0, 3)
    ctx.lineTo(0, 8)
    ctx.moveTo(-5, 10)
    ctx.lineTo(5, 10)
    ctx.moveTo(-7, -7)
    ctx.quadraticCurveTo(-12, -6, -7, -1)
    ctx.moveTo(7, -7)
    ctx.quadraticCurveTo(12, -6, 7, -1)
  } else if (id === 'course') {
    // A flag over a wave.
    ctx.moveTo(-3, 4)
    ctx.lineTo(-3, -11)
    ctx.lineTo(8, -7)
    ctx.lineTo(-3, -3)
    ctx.moveTo(-12, 9)
    ctx.quadraticCurveTo(-8, 5, -4, 9)
    ctx.quadraticCurveTo(0, 13, 4, 9)
    ctx.quadraticCurveTo(8, 5, 12, 9)
  } else if (id === 'back') {
    ctx.moveTo(9, 0)
    ctx.lineTo(-8, 0)
    ctx.moveTo(-2, -6)
    ctx.lineTo(-8, 0)
    ctx.lineTo(-2, 6)
  } else if (id === 'mode' || id === 'putting') {
    ctx.moveTo(-5, 11)
    ctx.lineTo(-5, -11)
    ctx.lineTo(8, -6)
    ctx.lineTo(-5, -1)
  } else if (id === 'top') {
    // A T-shirt.
    ctx.moveTo(-4, -9)
    ctx.lineTo(-11, -5)
    ctx.lineTo(-8, 0)
    ctx.lineTo(-6, -1)
    ctx.lineTo(-6, 10)
    ctx.lineTo(6, 10)
    ctx.lineTo(6, -1)
    ctx.lineTo(8, 0)
    ctx.lineTo(11, -5)
    ctx.lineTo(4, -9)
    ctx.quadraticCurveTo(0, -5, -4, -9)
  } else if (id === 'hand' || id === 'practice') {
    // A club and ball.
    ctx.moveTo(6, -11)
    ctx.lineTo(-3, 8)
    ctx.lineTo(-9, 8)
    ctx.moveTo(10, 8)
    ctx.arc(7, 8, 3, 0, Math.PI * 2)
  } else if (id === 'wardrobe' || id === 'hat') {
    ctx.moveTo(-10, 4)
    ctx.quadraticCurveTo(-10, -8, 0, -8)
    ctx.quadraticCurveTo(10, -8, 10, 4)
    ctx.moveTo(-12, 4)
    ctx.lineTo(12, 4)
  } else if (id === 'pin') {
    // A pin in a ring: closest to it.
    ctx.arc(0, 4, 9, 0, Math.PI * 2)
    ctx.moveTo(0, 4)
    ctx.lineTo(0, -12)
    ctx.lineTo(8, -8)
    ctx.lineTo(0, -5)
  } else if (id === 'acc' || id === 'targets') {
    ctx.arc(0, 0, 8, 0, Math.PI * 2)
    ctx.moveTo(4, 0)
    ctx.arc(0, 0, 4, 0, Math.PI * 2)
  } else if (id === 'done') {
    ctx.moveTo(-8, 0)
    ctx.lineTo(-2, 6)
    ctx.lineTo(9, -6)
  } else {
    // Settings: a cog.
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2)
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4
      ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8)
      ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11)
    }
  }
  ctx.stroke()
  ctx.restore()
}

/** Top-left: who's up, their club and aim. Top-right: pause and everyone's score. */
function drawHud(s) {
  if (!s) return
  const club = CLUBS[s.club]
  panel(28, 24, 430, 112)
  dot(58, 58, 14, s.color)
  const who = s.name === s.crew.name ? s.name : `${s.name} · ${s.crew.name}`
  text(who.length > 16 ? who.slice(0, 15) + '…' : who, 84, 59, body(30), INK, 'left')
  if (isPutting()) {
    const putt = s.done ? '' : ` · putt ${s.strokes + 1}`
    text(isPutts() ? `Hole ${state.hole + 1} of ${PT.holes}${putt}` : isCourse() ? `Hole ${state.courseHole + 1} · par ${HOLE.par} · stroke ${s.strokes + 1}` : 'Putting', 440, 59, fitFont((px) => body(px / ts(), 500), 22 * ts(), 230, `Hole ${state.courseHole + 1} · par ${HOLE.par} · stroke 10`), QUIET, 'right')
    if (s.ball && s.cup) text(puttRead(s), 48, 104, body(26), GOLD, 'left')
    const a = Math.round(s.paim * 2) / 2
    text(a ? `Aim ${Math.abs(a)}° ${a > 0 ? 'R' : 'L'}` : 'Aim at the cup', 440, 104, body(22, 500), INK, 'right')
  } else {
    const where = isCourse() && s.ball ? `Hole ${state.courseHole + 1} · par ${HOLE.par} · stroke ${s.strokes + 1}` : isPin() ? `Ball ${Math.min(TUNING.pin.balls, s.shots.length + (state.phase === 'aim' || state.phase === 'meter' ? 1 : 0))} of ${TUNING.pin.balls}` : isTargets() ? `Ball ${Math.min(TUNING.targets.balls, s.shots.length + (state.phase === 'aim' || state.phase === 'meter' ? 1 : 0))} of ${TUNING.targets.balls}` : 'Practice'
    text(where, 440, 59, fitFont((px) => body(px / ts(), 500), 22 * ts(), 230, where), QUIET, 'right')
    text(`${club.name} · ${fullCarry(s)} yd`, 48, 104, body(26), GOLD, 'left')
    text(Math.round(s.aim) ? `Aim ${Math.abs(Math.round(s.aim))}° ${s.aim > 0 ? 'R' : 'L'}` : 'Aim straight', 440, 104, body(22, 500), INK, 'right')
  }
  // Pause button.
  panel(PAUSE_BUTTON.x, PAUSE_BUTTON.y, PAUSE_BUTTON.w, PAUSE_BUTTON.h, 14)
  ctx.fillStyle = INK
  ctx.fillRect(PAUSE_BUTTON.x + 18, PAUSE_BUTTON.y + 16, 7, 24)
  ctx.fillRect(PAUSE_BUTTON.x + 31, PAUSE_BUTTON.y + 16, 7, 24)
  // Scores under the pause button.
  state.seats.forEach((o, i) => {
    const y = 104 + i * 44
    panel(W - 300, y, 268, 38, 12, o === s ? 'rgba(11,26,54,0.9)' : 'rgba(11,26,54,0.6)')
    dot(W - 280, y + 19, 8, o.color)
    text(o.name.slice(0, 10), W - 264, y + 20, body(20, 500), connected(o) ? INK : QUIET, 'left')
    text(scoreText(o), W - 44, y + 20, body(22), o === s ? GOLD : INK, 'right')
  })

  if (state.phase === 'safety') return drawSafety()
  if (isLinks() && state.phase !== 'card') drawConditions(s)
  if (state.phase === 'flyover') return drawHoleIntro()
  if (state.phase === 'card') {
    veil(0.5)
    ctx.save()
    ctx.translate(0, DY)
    text(`Hole ${state.courseHole + 1} done`, W / 2, 130, head(60), GOLD)
    drawScorecard(210)
    const next = HOLES[state.courseHole + 1]
    text(next ? `Next: hole ${state.courseHole + 2}, ${next.name} · par ${next.par}` : 'That was the last hole', W / 2, 250 + scorecardHeight(), body(26), INK)
    ctx.restore()
    return
  }
  // The middle and bottom of the HUD sit DY lower on a taller screen.
  ctx.save()
  ctx.translate(0, DY)
  if (state.phase === 'aim' || state.phase === 'meter') drawAimHelp(s)
  if (state.phase === 'meter') drawMeter()
  if (state.phase === 'flight' && state.shot?.putt && state.shot.pos) {
    // Rolling: how far it still is from the cup.
    const p = state.shot.pos
    const ft = Math.hypot(p.x - state.shot.cup.x, p.z - state.shot.cup.z) / FT
    text(ft < 10 ? ft.toFixed(1) : `${Math.round(ft)}`, W / 2, 96, head(84), INK)
    text('feet to the cup', W / 2, 150, body(24, 500), QUIET)
  } else if (state.phase === 'flight' && state.shot?.pos) {
    const p = state.shot.pos
    const o = state.shot.from ?? { x: 0, z: 0 }
    const yd = Math.round(Math.hypot(p.x - o.x, p.z - o.z) / YD)
    text(`${yd}`, W / 2, 96, head(84), INK)
    text('yards', W / 2, 150, body(24, 500), QUIET)
  }
  if (state.phase === 'result' && state.shot) state.shot.putt ? drawPuttReadout(state.shot) : drawReadout(state.shot)
  ctx.restore()
  if (state.banner) {
    const t = state.banner.t
    const pop = 1 + Math.max(0, 0.3 - t) * 1.8
    ctx.save()
    ctx.translate(W / 2, 250 + DY)
    ctx.scale(pop, pop)
    text(state.banner.text, 0, 0, head(state.banner.text.length > 10 ? 72 : 96), state.banner.color)
    if (state.banner.sub) text(state.banner.sub, 0, 66, body(28), INK)
    ctx.restore()
  }
  if (state.mode === 'practice' && state.recent.length) drawMap()
  if (isLinks() && state.phase !== 'flight') drawHoleMap(s)
  drawJoinBadge(ctx, party, 32, H - 90)
}

/**
 * A shot at a pin: under the name panel, how far it is, the wind (an arrow as the player sees it:
 * up the screen is toward the pin) and how the ball lies, with what the lie costs the swing.
 */
function drawConditions(s) {
  if (!s?.ball || !s.cup) return
  const y = 146
  const putting = isPutting()
  const yd = Math.round(yardsToPin(s.ball, s.cup))
  panel(28, y, 132, 52, 14)
  text(putting ? `${Math.round(yd * 3)} ft` : `${yd} yd`, 94, y + 20, body(24), INK)
  text('to the pin', 94, y + 40, rubik(13, 500), QUIET)
  if (putting) return // a putt doesn't feel the wind, and the green is the lie
  const w = state.wind
  panel(168, y, 150, 52, 14)
  if (w.mph) {
    const rel = ((w.dir - lineDeg(s)) * Math.PI) / 180
    ctx.save()
    ctx.translate(196, y + 26)
    ctx.rotate(rel)
    ctx.strokeStyle = ctx.fillStyle = w.mph >= 8 ? PINK : TEAL
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(0, 14)
    ctx.lineTo(0, -8)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, -18)
    ctx.lineTo(9, -5)
    ctx.lineTo(-9, -5)
    ctx.fill()
    ctx.restore()
    text(`${w.mph} mph`, 268, y + 20, body(22), INK)
    text('wind', 268, y + 40, rubik(13, 500), QUIET)
  } else text('No wind', 243, y + 27, body(20, 500), QUIET)
  const lie = lieOf(s)
  const lp = liePower(lie, CLUBS[s.club])
  panel(326, y, 132, 52, 14, lp < 1 ? 'rgba(90,60,10,0.82)' : PANEL)
  text(LIE_CHIP[lie] ?? lie, 392, y + 20, fitFont((px) => rubik(px), 20, 116, LIE_CHIP[lie] ?? lie), lp < 1 ? '#f5dfa5' : INK)
  text(lp < 1 ? `${Math.round(lp * 100)}% power` : 'full power', 392, y + 40, rubik(13, 500), lp < 1 ? '#f5dfa5' : QUIET)
}

/** The sweep down a new hole: its number, name, par and length, and the wind. */
function drawHoleIntro() {
  ctx.save()
  ctx.translate(0, DY)
  const k = clamp(state.fly / 0.4, 0, 1)
  ctx.globalAlpha = k
  text(`Hole ${state.courseHole + 1} of ${HOLES.length}`, W / 2, 250, body(30), INK)
  text(HOLE.name, W / 2, 322, fitFont(lilita, 96, W - 160, HOLE.name), GOLD)
  text(`Par ${HOLE.par} · ${Math.round(yardsToPin(HOLE.tee, HOLE.cup))} yards`, W / 2, 400, body(34), INK)
  const line = bearing(HOLE.tee, HOLE.cup)
  text(state.wind.mph ? `Wind ${windWords(state.wind, line)}` : 'No wind', W / 2, 448, body(24, 500), state.wind.mph >= 8 ? PINK : QUIET)
  ctx.restore()
}

/** The course's scorecard: a row per player (the leader first), a column per hole, and the round so far against par. */
const scorecardHeight = () => 96 + state.seats.length * 62
function drawScorecard(y) {
  const w = 760
  const x = W / 2 - w / 2
  panel(x, y, w, scorecardHeight(), 22, 'rgba(11,26,54,0.92)')
  const colX = (h) => x + 360 + h * 92
  const totalX = x + w - 70
  text('Hole', x + 30, y + 28, body(20, 500), QUIET, 'left')
  text('Par', x + 30, y + 62, body(20, 500), QUIET, 'left')
  HOLES.forEach((h, i) => {
    text(`${i + 1}`, colX(i), y + 28, body(22), i === state.courseHole && state.screen !== 'gameover' ? GOLD : INK)
    text(`${h.par}`, colX(i), y + 62, body(20, 500), QUIET)
  })
  text('Round', totalX, y + 28, body(20, 500), QUIET)
  text(`${HOLES.reduce((a, h) => a + h.par, 0)}`, totalX, y + 62, body(20, 500), QUIET)
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fillRect(x + 20, y + 82, w - 40, 2)
  courseStandings(state.seats).forEach((r, n) => {
    const s = state.seats.find((o) => o.id === r.id)
    const ry = y + 118 + n * 62
    dot(x + 40, ry, 11, s.color)
    text(s.name, x + 62, ry + 1, fitFont((px) => body(px / ts()), 26 * ts(), 230, s.name), INK, 'left')
    let par = 0
    HOLES.forEach((h, i) => {
      const v = s.card[i]
      if (v == null) return text('–', colX(i), ry + 1, body(24, 500), QUIET)
      par += h.par
      // Under par in a ring, over par in a box, as on a paper card (not colour alone).
      ctx.strokeStyle = v < h.par ? LIME : QUIET
      ctx.lineWidth = 2.5
      ctx.beginPath()
      if (v < h.par) ctx.arc(colX(i), ry, 21, 0, Math.PI * 2)
      else if (v > h.par) ctx.roundRect(colX(i) - 20, ry - 20, 40, 40, 5)
      ctx.stroke()
      text(`${v}`, colX(i), ry + 1, body(26), v < h.par ? LIME : INK)
    })
    const total = s.card.reduce((a, v) => a + (v ?? 0), 0)
    text(par ? `${total}` : '–', totalX - 18, ry + 1, head(34), n === 0 ? GOLD : INK, 'right')
    if (par) text(toPar(total, par), totalX - 8, ry + 1, body(20), total <= par ? LIME : QUIET, 'left')
    if (s.newBest) text('New best!', totalX + 60, ry + 26, rubik(15), TEAL, 'right')
  })
}

/** Before you swing: room, grip, a smooth swing; who has read it on their phone. */
function drawSafety() {
  veil(0.55)
  ctx.save()
  ctx.translate(0, DY)
  panel(W / 2 - 430, 70, 860, 680, 26)
  text('Before you swing', W / 2, 130, head(60), GOLD)
  const tips = [
    ['Give yourself room', 'Stand where a full swing can’t reach anyone or anything: people, pets, the TV, lamps.', TEAL, 'room'],
    ['Hold on tight', 'Grip your phone in both hands all the way through the swing. A grippy case or a wrist strap helps.', PINK, 'grip'],
    ['Smooth beats hard', 'A smooth swing reads just as well as a wild one. Never let go of the phone.', LIME, 'smooth']
  ]
  tips.forEach(([t, line, color, icon], i) => {
    const y = 210 + i * 118
    dot(W / 2 - 350, y + 20, 34, color)
    safetyIcon(icon, W / 2 - 350, y + 20)
    text(t, W / 2 - 296, y, body(32), INK, 'left')
    wrap(line, W / 2 - 296, y + 40, 660, body(22, 500), QUIET)
  })
  // Who has read it.
  const phones = state.seats.filter((x) => x.kind === 'phone' && connected(x))
  const w = 180
  const x0 = W / 2 - (phones.length * w) / 2
  phones.forEach((x, i) => {
    const ready = state.safe.has(x.id)
    const cx = x0 + i * w + w / 2
    panel(cx - 82, 572, 164, 44, 22, ready ? 'rgba(182,240,74,0.22)' : 'rgba(255,255,255,0.08)')
    dot(cx - 60, 594, 9, x.color)
    text(x.name.length > 8 ? x.name.slice(0, 7) + '…' : x.name, cx - 44, 595, body(20), INK, 'left')
    text(ready ? '✓' : '…', cx + 62, 595, body(24), ready ? LIME : QUIET, 'right')
  })
  text('Everyone taps I’m ready on their phone', W / 2, 648, body(22, 500), INK)
  if (state.safetyTime > TUNING.safetyMin) {
    if (input.mode === 'touch' || input.mode === 'mouse') {
      panel(SAFETY_OK.x, SAFETY_OK.y - DY, SAFETY_OK.w, SAFETY_OK.h, 32, GOLD)
      text('Start now', W / 2, SAFETY_OK.y - DY + SAFETY_OK.h / 2 + 1, body(26), '#0b1a36')
    } else text(`${input.label('a')} to start now`, W / 2, 706, body(24), GOLD)
  }
  ctx.restore()
}
/** Simple glyphs for the tips: arms out, two hands on a phone, a smooth arc. */
function safetyIcon(kind, x, y) {
  ctx.save()
  ctx.strokeStyle = '#0b1a36'
  ctx.fillStyle = '#0b1a36'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  if (kind === 'room') {
    ctx.arc(x, y - 12, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x, y - 4)
    ctx.lineTo(x, y + 12)
    ctx.moveTo(x - 18, y)
    ctx.lineTo(x + 18, y)
    ctx.moveTo(x, y + 12)
    ctx.lineTo(x - 8, y + 22)
    ctx.moveTo(x, y + 12)
    ctx.lineTo(x + 8, y + 22)
    ctx.stroke()
  } else if (kind === 'grip') {
    ctx.roundRect(x - 8, y - 18, 16, 30, 4)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x - 9, y + 6, 7, 0, Math.PI * 2)
    ctx.arc(x + 9, y + 6, 7, 0, Math.PI * 2)
    ctx.fill()
  } else {
    // A smooth swing arc, with the ball at the end of it.
    ctx.arc(x, y - 14, 22, Math.PI * 0.15, Math.PI * 0.85)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x + 19, y - 3, 5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
/** Text wrapped to a width, left aligned. */
/** str broken into lines no wider than width in font. */
function wrapLines(str, width, font) {
  ctx.font = font
  const lines = []
  let line = ''
  for (const w of str.split(' ')) {
    const next = line ? `${line} ${w}` : w
    if (ctx.measureText(next).width > width && line) {
      lines.push(line)
      line = w
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}
function wrap(str, x, y, width, font, color, draw = text, lh = 28) {
  wrapLines(str, width, font).forEach((line, i) => draw(line, x, y + i * lh, font, color, 'left'))
}

function drawAimHelp(s) {
  const touchUi = input.mode === 'touch' || input.mode === 'mouse'
  if (s.kind === 'phone') {
    const inp = party.inputs[s.id] ?? {}
    const st = inp.st
    const putting = isPutting()
    const msg = !state.safe.has(s.id) ? 'Read the safety card on your phone first' : st === 'touch' ? 'Pull down on your phone’s pad, then flick up' : inp.a ? (putting ? 'Putt!' : 'Swing!') : putting ? 'Hold SET on your phone and putt' : 'Hold SET on your phone and swing'
    text(msg, W / 2, 640, body(34), inp.a ? LIME : GOLD)
    text(st === 'touch' ? 'No motion sensors on this phone: the pad swings for you' : st === 'on' ? (putting ? 'The backstroke sets how far it rolls: rock back, then stroke through' : 'Your backswing fills the bar; then swing through to deliver it') : st === 'ask' ? 'Tap "Allow motion" on your phone' : 'Waiting for the phone’s sensors…', W / 2, 690, body(22, 500), INK)
    if (st === 'on' && !inp.a && state.safe.has(s.id)) text('Not sure how hard? Hold PRACTICE on your phone and swing: nothing is hit', W / 2, 724, body(19, 500), QUIET)
    // The power bar: always there on your shot, so the pin's mark can be read before you swing.
    // It fills with the backswing and holds through the downswing.
    if (st !== 'touch') {
      const sw = party.public.swing ?? {}
      const down = inp.swp === 'down' || inp.swp === 'done'
      const v = inp.a ? clamp((Number(down ? inp.bk : inp.sw) || 0) / (sw.backFull || 200), -0.2, 1) : 0
      const bx = W / 2 - 210
      panel(bx, 580, 420, 22, 11, 'rgba(11,26,54,0.8)')
      if (inp.a) panel(bx, 580, Math.max(22, 420 * Math.max(0, v)), 22, 11, inp.swp === 'down' ? PINK : inp.pr ? TEAL : GOLD)
      // Quarter marks (the same four dots as on the hole map's aim line).
      if (!putting) for (const q of [0.25, 0.5, 0.75]) panel(bx + 420 * q - 1, 584, 2, 14, 1, 'rgba(255,255,255,0.45)')
      // Where to take it back to: the putt's pace with the help, or the pin's distance.
      const mark = putting ? party.views?.[s.id]?.puttMark : pinMark(s)
      if (mark) {
        panel(bx - 2 + 420 * Math.min(1, mark), 572, 5, 38, 2, putting ? INK : LIME)
        if (!putting) text('pin', bx + 420 * Math.min(1, mark), 560, body(17), LIME)
      } else if (!putting && isLinks()) text('The pin is out of reach: swing full', W / 2, 558, body(18, 500), QUIET)
      // The last practice swing: a ring on the bar where it finished, and what it would have done.
      const g = state.ghost?.id === s.id ? state.ghost : null
      if (g) {
        ctx.strokeStyle = TEAL
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.arc(bx + 420 * clamp(g.power, 0, 1), 591, 15, 0, Math.PI * 2)
        ctx.stroke()
        if (g.text) text(`Practice swing · ${g.text}`, W / 2, 526, fitFont((px) => body(px / ts()), 26 * ts(), W - 520, `Practice swing · ${g.text}`), TEAL)
      }
    }
  } else if (state.phase === 'aim') {
    if (touchUi) {
      text(isPutting() ? 'Pull down on the green, then flick up to putt' : 'Pull down on the course, then flick up to swing', W / 2, 640, body(30), GOLD)
      text(isPutting() ? 'A longer flick rolls it further' : 'Flick straight up for a straight shot', W / 2, 682, body(22, 500), INK)
    } else if (isPutting()) text(`${input.label('a')} to putt · ${input.stickLabel()} to aim`, W / 2, 660, body(28), GOLD)
    else text(`${input.label('a')} to swing · ${input.stickLabel()} to aim · ${input.dpadLabel()} ▲▼ club`, W / 2, 660, body(28), GOLD)
  }
  if (touchUi && s.kind !== 'phone' && state.phase === 'aim') {
    ctx.save()
    ctx.translate(0, -DY) // these sit on the real bottom edge (layout())
    for (const [k, label] of isPutting() ? [['aimL', '◀'], ['aimR', '▶']] : [['aimL', '◀'], ['aimR', '▶'], ['clubL', '−'], ['clubR', '+']]) {
      const r = TOUCH[k]
      panel(r.x, r.y, r.w, r.h, 18)
      text(label, r.x + r.w / 2, r.y + r.h / 2 + 2, body(34), INK)
    }
    text('aim', 120, TOUCH.aimL.y - 14, body(18, 500), QUIET)
    if (!isPutting()) text(CLUBS[s.club].short, W - 198, TOUCH.clubL.y + 38, head(40), GOLD)
    ctx.restore()
  }
  if (state.flick) {
    // The pull: a line from where the finger went down to where it is (pointer space: no offset).
    ctx.save()
    ctx.translate(0, -DY)
    const f = state.flick
    const a = f.pts[0]
    const z = f.pts[f.pts.length - 1]
    ctx.strokeStyle = 'rgba(255,248,236,0.8)'
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(z.x, z.y)
    ctx.stroke()
    ctx.restore()
  }
}

/** The classic three-press meter: up for power, back down to the line for a straight strike. */
function drawMeter() {
  const m = state.meter
  const x = W / 2 - 320
  const y = 560
  const w = 640
  panel(x - 24, y - 64, w + 48, 150)
  text(m.stage === 'power' ? `Power: ${input.label('a')} to set it` : `${input.label('a')} on the line to strike`, W / 2, y - 32, body(26), INK)
  const max = TUNING.swing.maxPower
  const zero = x + w * 0.2 // the strike line; left of it is late (hook), right of it early
  const px = (v) => zero + (v / max) * (w * 0.8)
  panel(x, y, w, 40, 20, '#0b1a36')
  panel(px(1) - 3, y - 6, 6, 52, 3, 'rgba(255,255,255,0.4)')
  ctx.fillStyle = 'rgba(182,240,74,0.55)'
  ctx.fillRect(zero - TUNING.meter.window * w * 0.8, y, TUNING.meter.window * 2 * w * 0.8, 40)
  if (m.stage === 'accuracy') panel(zero, y, Math.max(0, px(m.power) - zero), 40, 20, 'rgba(255,210,63,0.45)')
  ctx.fillStyle = INK
  ctx.fillRect(zero - 2, y - 8, 4, 56)
  const v = m.stage === 'power' ? m.v : m.v
  dot(clamp(px(v), x + 10, x + w - 10), y + 20, 18, m.stage === 'power' ? (v > 1 ? PINK : GOLD) : TEAL)
  text('100%', px(1), y + 62, body(18, 500), QUIET)
  // A shot at a pin: the power that gets there with this club, from this lie, in this wind.
  const mark = pinMark(seat())
  if (mark) {
    panel(px(mark) - 3, y - 6, 6, 52, 3, LIME)
    text('pin', px(mark), y - 18, body(16, 500), LIME)
  }
  // Putting: where the meter rolls it as far as the cup on a flat green.
  const s = seat()
  if (isPutting() && s?.ball && s.cup) {
    // With the help: the power that rolls it in, slope and all. Without: the cup's distance on the flat.
    const v = puttHelp() && s.plan ? s.plan.speed : null
    const k = clamp(v ? (v * v) / (2 * PT.roll) / FT / PT.full : Math.hypot(s.cup.x - s.ball.x, s.cup.z - s.ball.z) / FT / PT.full, 0, max)
    panel(px(k) - 3, y - 6, 6, 52, 3, LIME)
    text('cup', px(k), y - 18, body(16, 500), LIME)
  }
}

/** After a putt: how it finished and the stroke. */
function drawPuttReadout(sh) {
  const i = sh.input
  const x = W / 2 - 330
  const y = 590 // low, so the ball and the cup stay in sight above it
  const from = Math.round(Math.hypot(sh.cup.x - sh.from.x, sh.cup.z - sh.from.z) / FT)
  panel(x, y, 660, 170)
  text(sh.roll.holed ? 'In!' : sh.roll.lipped ? 'Lip out' : `${sh.how.left < 10 ? sh.how.left.toFixed(1) : Math.round(sh.how.left)}`, x + 110, y + 66, head(sh.roll.holed || sh.roll.lipped ? 60 : 80), sh.roll.holed ? GOLD : INK)
  text(sh.roll.holed ? `from ${from} ft` : 'ft from the cup', x + 110, y + 122, body(22, 500), QUIET)
  const face = Math.abs(i.face) < 0.3 ? 'square' : `${Math.abs(i.face).toFixed(1)}° ${i.face > 0 ? 'right' : 'left'}`
  const rows = [
    ['Putt', sh.roll.holed ? 'Holed' : sh.how.text],
    ['From', `${from} ft`],
    ['Stroke', i.how === 'phone' && i.raw ? `${i.raw.speed}°/s · ${i.raw.back}° back` : `${Math.round((i.power ?? 0) * 100)}% · ${{ meter: 'meter', flick: 'flick', pad: 'touch pad' }[i.how] ?? i.how}`],
    ['Face', face],
    ['Ball speed', `${(sh.speed / FT).toFixed(1)} ft/s`]
  ]
  rows.forEach(([k, v], n) => {
    const ry = y + 30 + n * 28
    text(k, x + 250, ry, body(20, 500), QUIET, 'left')
    text(String(v), x + 630, ry, body(22), INK, 'right')
  })
  if (i.lazy) text('Stroke through firmer: your backstroke had more in it', W / 2, y - 24, body(24), GOLD)
}

/** After a shot: the numbers. */
function drawReadout(sh) {
  const r = sh.result
  const i = sh.input
  const x = W / 2 - 330
  const y = 470
  panel(x, y, 660, 200)
  text(`${r.carry}`, x + 110, y + 70, head(80), GOLD)
  text('yd carry', x + 110, y + 128, body(22, 500), QUIET)
  text(`${r.total} yd total`, x + 110, y + 162, body(22), INK)
  const off = Math.abs(r.offline) < 1 ? 'On line' : `${Math.abs(r.offline)} yd ${r.offline > 0 ? 'right' : 'left'}`
  const face = Math.abs(i.face) < 0.5 ? 'square' : `${Math.round(Math.abs(i.face))}° ${i.face > 0 ? 'right' : 'left'}`
  const rows = [
    ['Shot', r.shape],
    ['Offline', off],
    ['Power', `${Math.round(i.power * 100)}%${i.mph ? ` · ${i.mph} mph` : ''}`],
    ['Face', face],
    i.how === 'phone' ? ['Path', Math.abs(i.path) < 0.5 ? 'straight' : `${Math.round(Math.abs(i.path))}° ${i.path > 0 ? 'out to the right' : 'across to the left'}`] : ['Swing', { meter: 'meter', flick: 'flick', pad: 'touch pad' }[i.how] ?? i.how],
    i.how === 'phone' && i.raw ? ['Tempo', `${i.raw.tempo}:1 · ${i.raw.back}° back`] : ['Apex', `${r.apex} yd high`]
  ]
  rows.forEach(([k, v], n) => {
    const ry = y + 30 + n * 28
    text(k, x + 250, ry, body(20, 500), QUIET, 'left')
    text(String(v), x + 630, ry, body(22), INK, 'right')
  })
  if (i.lazy) text('Swing through faster: your backswing had more in it', W / 2, y + 226, body(24), GOLD)
}

/** Practice: a top-down map of where this session's balls stopped. */
function drawMap() {
  const x = W - 210
  const y = 300
  const w = 180
  const h = 330
  panel(x - 10, y - 10, w + 20, h + 20, 16)
  const maxZ = 280 * YD
  const sx = (gx) => x + w / 2 + (gx / (fairwayHalf(maxZ) * 1.6)) * (w / 2)
  const sy = (gz) => y + h - 10 - (gz / maxZ) * (h - 20)
  ctx.fillStyle = 'rgba(95,207,74,0.35)'
  ctx.beginPath()
  ctx.moveTo(sx(-fairwayHalf(0)), sy(0))
  ctx.lineTo(sx(-fairwayHalf(maxZ)), sy(maxZ))
  ctx.lineTo(sx(fairwayHalf(maxZ)), sy(maxZ))
  ctx.lineTo(sx(fairwayHalf(0)), sy(0))
  ctx.fill()
  ctx.font = body(14, 500)
  for (let yd = 50; yd <= 250; yd += 50) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.fillRect(x, sy(yd * YD), w, 1)
    ctx.fillStyle = QUIET
    ctx.textAlign = 'left'
    ctx.fillText(String(yd), x + 2, sy(yd * YD) - 7)
  }
  for (const g of TUNING.targets.greens) dot(sx(g.side * YD), sy(g.yards * YD), 5, g.color)
  state.recent.forEach((p, i) => {
    dot(sx(p.x), sy(p.z), i === state.recent.length - 1 ? 6 : 4, p.color)
    if (i === state.recent.length - 1) {
      ctx.strokeStyle = INK
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(sx(p.x), sy(p.z), 9, 0, Math.PI * 2)
      ctx.stroke()
    }
  })
  dot(sx(0), sy(0), 5, INK)
}

/**
 * A shot at a pin, from above: the hole turned so the pin is at the top, with its fairway, green
 * and sand, everyone's ball, and the aim line with a dot at each quarter of the club's distance
 * (the same quarters as the marks on the power bar).
 */
function drawHoleMap(s) {
  const x = W - 210
  const y = 300
  const w = 180
  const h = 330
  panel(x - 10, y - 10, w + 20, h + 20, 16)
  const G = HOLE.green
  // The map's frame: up the screen is from the start (the tee; a spot in Closest to the pin) to the pin.
  const start = isPin() && s?.ball ? s.ball : HOLE.tee
  const len = Math.max(40, Math.hypot(HOLE.cup.x - start.x, HOLE.cup.z - start.z))
  const ux = (HOLE.cup.x - start.x) / len
  const uz = (HOLE.cup.z - start.z) / len
  const k = (h - 44) / (len * 1.22) // pixels a metre, the same both ways
  const sx = (p) => x + w / 2 + ((p.x - start.x) * uz - (p.z - start.z) * ux) * k
  const sy = (p) => y + h - 22 - ((p.x - start.x) * ux + (p.z - start.z) * uz + len * 0.07) * k
  const path = (pts) => {
    ctx.beginPath()
    pts.forEach((p, i) => (i ? ctx.lineTo(sx(p), sy(p)) : ctx.moveTo(sx(p), sy(p))))
    ctx.closePath()
  }
  const oval = (o, grow = 1) => Array.from({ length: 28 }, (_, i) => ({ x: o.x + Math.cos((i / 28) * Math.PI * 2) * o.rx * grow, z: o.z + Math.sin((i / 28) * Math.PI * 2) * o.rz * grow }))
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x - 6, y - 6, w + 12, h + 12, 12)
  ctx.clip()
  // The rough everywhere, the fairway's fan over it, then the green and the sand.
  ctx.fillStyle = 'rgba(74,164,55,0.28)'
  ctx.fillRect(x - 6, y - 6, w + 12, h + 12)
  const end = TUNING.range.length * YD
  const fan = []
  for (let z = 0; z <= end; z += 20) fan.push({ x: -fairwayHalf(z), z })
  for (let z = end; z >= 0; z -= 20) fan.push({ x: fairwayHalf(z), z })
  ctx.fillStyle = 'rgba(108,200,67,0.5)'
  path(fan)
  ctx.fill()
  ctx.fillStyle = 'rgba(95,189,69,0.95)'
  path(oval(G, 1 + G.fringe))
  ctx.fill()
  ctx.fillStyle = 'rgba(150,232,104,1)'
  path(oval(G))
  ctx.fill()
  ctx.fillStyle = '#f5dfa5'
  for (const b of HOLE.bunkers) {
    path(oval(b))
    ctx.fill()
  }
  // The aim line from the ball up: a dot at each quarter of the club's distance from this lie.
  if (s?.ball && !s.done && !isPutting() && (state.phase === 'aim' || state.phase === 'meter')) {
    const a = ((lineDeg(s) + s.aim) * Math.PI) / 180
    const full = fullCarry(s) * YD
    const at = (q) => ({ x: s.ball.x + Math.sin(a) * full * q, z: s.ball.z + Math.cos(a) * full * q })
    ctx.strokeStyle = 'rgba(255,248,236,0.7)'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(sx(s.ball), sy(s.ball))
    ctx.lineTo(sx(at(1)), sy(at(1)))
    ctx.stroke()
    ctx.setLineDash([])
    for (const q of [0.25, 0.5, 0.75, 1]) dot(sx(at(q)), sy(at(q)), q === 1 ? 4.5 : 3, INK)
  }
  if (!isPin()) dot(sx(HOLE.tee), sy(HOLE.tee), 4, QUIET)
  // The pin.
  const cx = sx(HOLE.cup)
  const cy = sy(HOLE.cup)
  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx, cy - 16)
  ctx.stroke()
  ctx.fillStyle = PINK
  ctx.beginPath()
  ctx.moveTo(cx, cy - 16)
  ctx.lineTo(cx + 10, cy - 12)
  ctx.lineTo(cx, cy - 8)
  ctx.fill()
  // Everyone's ball (the one up ringed).
  for (const o of state.seats) {
    if (!o.ball || o.done || (isPin() && o !== s)) continue
    const bx = clamp(sx(o.ball), x, x + w)
    const by = clamp(sy(o.ball), y, y + h)
    dot(bx, by, o === s ? 6 : 5, o.color)
    if (o === s) {
      ctx.strokeStyle = INK
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(bx, by, 10, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  ctx.restore()
  const title = isPin() ? 'Closest to the pin' : `${state.courseHole + 1} · ${HOLE.name}`
  text(title, x + w / 2, y + 6, fitFont(rubik, 16, w - 10, title), QUIET)
}

function drawResults() {
  veil(0.6)
  ctx.save()
  ctx.translate(0, DY)
  if (isCourse()) {
    const win = courseStandings(state.seats)[0]
    text('Round over', W / 2, 78, head(60), GOLD)
    if (state.seats.length > 1 && win) text(`${win.name} wins with ${win.total}`, W / 2, 132, body(26), INK)
    drawScorecard(166)
    ctx.restore()
    overMenu.draw(ctx, fitFont(rubik, 28 * ts(), 380, ...overMenu.items.map((it) => it.label)))
    return
  }
  if (isPin()) {
    text('Closest to the pin', W / 2, 90, head(64), GOLD)
    pinStandings(state.seats).forEach((r, i) => {
      const s = state.seats.find((x) => x.id === r.id)
      const y = 170 + i * 80
      panel(W / 2 - 330, y, 660, 66, 16, i === 0 ? 'rgba(11,26,54,0.92)' : PANEL)
      text(`${i + 1}`, W / 2 - 290, y + 34, head(40), i === 0 ? GOLD : INK)
      dot(W / 2 - 240, y + 33, 12, s.color)
      text(s.name, W / 2 - 215, y + 34, body(28), INK, 'left')
      const on = s.shots.filter((x) => x.on).length
      text(`${on}/${s.shots.length} on the green`, W / 2 + 120, y + 34, body(20, 500), QUIET, 'right')
      text(`${Math.round(r.total)} ft`, W / 2 + 300, y + 34, head(40), i === 0 ? GOLD : INK, 'right')
      if (s.newBest) text('New best!', W / 2 + 300, y + 76, body(18), TEAL, 'right')
    })
    ctx.restore()
    overMenu.draw(ctx, fitFont(rubik, 28 * ts(), 380, ...overMenu.items.map((it) => it.label)))
    return
  }
  text(isPutts() ? 'Putting challenge' : 'Target challenge', W / 2, 90, head(64), GOLD)
  if (isPutts()) {
    puttStandings(state.seats).forEach((r, i) => {
      const s = state.seats.find((x) => x.id === r.id)
      const y = 170 + i * 80
      panel(W / 2 - 330, y, 660, 66, 16, i === 0 ? 'rgba(11,26,54,0.92)' : PANEL)
      text(`${i + 1}`, W / 2 - 290, y + 34, head(40), i === 0 ? GOLD : INK)
      dot(W / 2 - 240, y + 33, 12, s.color)
      text(s.name, W / 2 - 215, y + 34, body(28), INK, 'left')
      const ones = s.card.filter((x) => x === 1).length
      text(`${ones} one-putt${ones === 1 ? '' : 's'}`, W / 2 + 120, y + 34, body(20, 500), QUIET, 'right')
      text(`${r.total}`, W / 2 + 300, y + 34, head(40), i === 0 ? GOLD : INK, 'right')
      if (s.newBest) text('New best!', W / 2 + 300, y + 76, body(18), TEAL, 'right')
    })
    ctx.restore()
    overMenu.draw(ctx, fitFont(rubik, 28 * ts(), 380, ...overMenu.items.map((it) => it.label)))
    return
  }
  standings(state.seats).forEach((r, i) => {
    const s = state.seats.find((x) => x.id === r.id)
    const y = 170 + i * 80
    panel(W / 2 - 330, y, 660, 66, 16, i === 0 ? 'rgba(11,26,54,0.92)' : PANEL)
    text(`${i + 1}`, W / 2 - 290, y + 34, head(40), i === 0 ? GOLD : INK)
    dot(W / 2 - 240, y + 33, 12, s.color)
    text(s.name, W / 2 - 215, y + 34, body(28), INK, 'left')
    const hits = s.shots.filter((x) => x.points).length
    text(`${hits}/${s.shots.length} on target`, W / 2 + 120, y + 34, body(20, 500), QUIET, 'right')
    text(`${r.total}`, W / 2 + 300, y + 34, head(40), i === 0 ? GOLD : INK, 'right')
    if (s.newBest) text('New best!', W / 2 + 300, y + 76, body(18), TEAL, 'right')
  })
  ctx.restore()
  overMenu.draw(ctx, fitFont(rubik, 28 * ts(), 380, ...overMenu.items.map((it) => it.label)))
}

function drawDebug() {
  ctx.save()
  ctx.font = '500 16px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(8, H - 140, 640, 124)
  ctx.fillStyle = '#9fe'
  const s = seat()
  ctx.fillText(`screen ${state.screen} phase ${state.phase} mode ${state.mode} fps ${fps.toFixed(0)} calls ${view.renderer.info.render.calls} tris ${Math.round(view.renderer.info.render.triangles / 1000)}k${view.light ? " light" : ""}`, 16, H - 132)
  ctx.fillText(`party ${party.status} ${party.code ?? ''} seats ${state.seats.length} turn ${s?.name ?? '-'}`, 16, H - 112)
  const inp = s ? party.inputs[s.id] : null
  ctx.fillText(`seat input ${JSON.stringify(inp ?? {}).slice(0, 70)}`, 16, H - 92)
  const m = s ? motion.of(s.id) : null
  if (m) ctx.fillText(`phone ${m.state} ${m.hz} Hz rtt ${Math.round(m.rtt * 1000)} ms`, 16, H - 72)
  const raw = state.shot?.input?.raw
  if (raw) ctx.fillText(`last swing ${JSON.stringify(raw)}`, 16, H - 52)
  ctx.restore()
}

layout()
fit.onResize(layout)

let last = performance.now()
let fps = 60
function frame(now) {
  const dt = Math.min(1 / 20, (now - last) / 1000)
  last = now
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05
  input.update(dt)
  update(dt)
  publish()
  draw(dt)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
