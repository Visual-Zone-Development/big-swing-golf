// Art preview (not part of the game): the range drawn by the game's own view, for the cover and
// hero. preview.html?shot=cover|hero ; window.__ready is set once the frame is drawn.
// For render-and-compare rounds, any camera: &cam=x,y,z&look=x,y,z&fov=deg (three.js space: game z is -z)
// and &t=<s> to let the scene's breeze, waves and foam run that long first.
import { CLUBS, CREW } from './tuning.js'
import { strike } from './shot.js'
import { createView } from './view3d.js'

const shot = new URLSearchParams(location.search).get('shot') ?? 'cover'
const size = shot === 'hero' ? [1920, 450] : [1440, 1000]
const canvas = document.getElementById('gl')
canvas.style.width = `${size[0] / (shot === 'hero' ? 1 : 2)}px`
const view = createView(canvas, { width: size[0], height: size[1], preserve: true, full: true })
// A drawn driver, part way up its climb.
const s = strike({ power: 1, face: -3, path: 0 }, CLUBS[0], 2)
const upTo = shot === 'hero' ? 2.4 : 1.25
const trail = s.flight.points.filter((p) => p.t <= upTo)
const ball = trail[trail.length - 1]
// Cover: from behind, Pip finishing the swing, the crew watching, the drive climbing away.
// Hero: low and wide toward the sea side, the crew on the right.
const q = new URLSearchParams(location.search)
const nums = (k) => q.get(k)?.split(',').map(Number)
if (q.get('cam')) view.pose(nums('cam'), nums('look'), Number(q.get('fov') ?? 50))
else if (shot === 'hero') view.pose([-2.2, 1.5, 4.2], [30, 2.6, -40], 42)
else view.pose([1.7, 1.6, 6.2], [-0.6, 3.4, -30], 50)
const settle = Number(q.get('t') ?? 0)
// The sculpted beans load in the background: wait for them (up to 20 s).
await new Promise((ok) => {
  const t0 = performance.now()
  const tick = () => (view.modelBeans || performance.now() - t0 > 20000 ? ok() : setTimeout(tick, 50))
  tick()
})
for (let i = 0; i < 12; i++) view.draw({ mode: 'fixed', ball, trail, trailColor: '#ff8a3d', golfer: CREW[0], face: 'joy', waiting: CREW.slice(1, 4), swing: -150, hand: 'R', aim: 0, dt: i === 0 && settle ? settle : 1 / 30 })
window.__ready = true
