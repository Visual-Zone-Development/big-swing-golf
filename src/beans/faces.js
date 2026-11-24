// The beans' faces: ten expressions drawn with the 2D canvas, in centimetres from a point between
// the eyes (eyes 4.6 cm either side, brows above, mouth about 9 cm below). Any game draws them
// onto whatever it puts on the bean's front: a texture wrapped round the body, or a decal.
//
//   paintFace(ctx, size, kind, { blink, skin })   a square, transparent canvas: the face, centred
//   drawFace(ctx, kind, skin)                     the drawing itself, in the current transform
//
// skin is the bean's colour (eyelids are drawn in it). Shared asset: games copy this file
// (shared/beans), they don't import it from here.

export const INK = '#2a1e2e'
/** The expressions a bean's face can show. */
export const FACES = ['idle', 'focus', 'effort', 'wince', 'joy', 'cheer', 'sad', 'shock', 'nervous', 'smug']
/** Expressions with open eyes, which blink now and then. */
export const BLINKS = new Set(['idle', 'focus', 'sad', 'nervous', 'smug'])

/** Draw a face filling a size × size canvas (about 30 cm of bean across), on transparent. */
export function paintFace(ctx, size, kind, { blink = false, skin = '#ff8a3d', eyes = true } = {}) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, size, size)
  const k = size / 30 // px per cm
  ctx.setTransform(k, 0, 0, k, size / 2, size * 0.36)
  drawFace(ctx, blink && BLINKS.has(kind) ? 'blink:' + kind : kind, skin, { eyes })
}

/** eyes: false draws only the mouth, cheeks and extras (sweat, tears, sparkles), for beans with 3D eyes and brows. */
export function drawFace(c, kind, skin, { eyes: withEyes = true } = {}) {
  const line = (w = 0.9) => {
    c.lineWidth = w
    c.lineCap = 'round'
    c.lineJoin = 'round'
    c.strokeStyle = INK
  }
  const ellipse = (x, y, rx, ry, fill) => {
    c.beginPath()
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
    c.fillStyle = fill
    c.fill()
  }
  const path = (pts, close = false) => {
    c.beginPath()
    c.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1])
    if (close) c.closePath()
  }
  const curve = (x0, y0, cx, cy, x1, y1) => {
    c.beginPath()
    c.moveTo(x0, y0)
    c.quadraticCurveTo(cx, cy, x1, y1)
  }
  /** An open eye: white, a pupil looking (dx, dy), a shine; lid: how much the top lid covers (0–1). */
  const eye = (x, { w = 2.8, h = 3.4, pupil = 1.6, dx = 0, dy = 0.4, lid = 0, lidTilt = 0 } = {}) => {
    ellipse(x, 0, w, h, '#ffffff')
    ellipse(x + dx, dy, pupil, pupil * 1.1, INK)
    ellipse(x + dx + pupil * 0.35, dy - pupil * 0.45, pupil * 0.32, pupil * 0.32, '#ffffff')
    if (lid > 0) {
      // The top lid in the bean's colour, tilted for a frown or a smirk.
      c.save()
      c.beginPath()
      c.ellipse(x, 0, w + 0.15, h + 0.15, 0, 0, Math.PI * 2)
      c.clip()
      c.translate(x, -h + lid * 2 * h)
      c.rotate(lidTilt)
      c.fillStyle = skin
      c.fillRect(-w * 2, -h * 3, w * 4, h * 3)
      c.restore()
      line(0.7)
      c.beginPath()
      c.moveTo(x - w * 1.05 * Math.cos(lidTilt), -h + lid * 2 * h - w * Math.sin(lidTilt))
      c.lineTo(x + w * 1.05 * Math.cos(lidTilt), -h + lid * 2 * h + w * Math.sin(lidTilt))
      c.stroke()
    }
  }
  const brow = (x, y, tilt, len = 3.4, w = 1) => {
    line(w)
    c.beginPath()
    c.moveTo(x - (len / 2) * Math.cos(tilt), y - (len / 2) * Math.sin(tilt))
    c.lineTo(x + (len / 2) * Math.cos(tilt), y + (len / 2) * Math.sin(tilt))
    c.stroke()
  }
  const blush = (a = 0.4) => {
    ellipse(-7.6, 5.4, 2.4, 1.3, `rgba(255,110,140,${a})`)
    ellipse(7.6, 5.4, 2.4, 1.3, `rgba(255,110,140,${a})`)
  }
  const smile = (w = 3.6, y = 8.4, depth = 2.2) => {
    line(0.9)
    curve(-w, y, 0, y + depth * 2, w, y)
    c.stroke()
  }
  const open = (w, y, h, { tongue = true } = {}) => {
    // An open mouth: a D shape, dark inside, a tongue.
    c.beginPath()
    c.moveTo(-w, y)
    c.quadraticCurveTo(0, y - 0.6, w, y)
    c.quadraticCurveTo(w * 0.8, y + h * 1.25, 0, y + h * 1.2)
    c.quadraticCurveTo(-w * 0.8, y + h * 1.25, -w, y)
    c.fillStyle = '#5a1f2e'
    c.fill()
    if (tongue) {
      c.save()
      c.clip()
      ellipse(0, y + h * 1.05, w * 0.55, h * 0.45, '#ff7b8f')
      c.restore()
    }
    line(0.7)
    c.stroke()
  }
  const drop = (x, y, s = 1, fill = '#7fd3ff') => {
    c.beginPath()
    c.moveTo(x, y - 1.6 * s)
    c.quadraticCurveTo(x + 1.1 * s, y, x, y + 0.9 * s)
    c.quadraticCurveTo(x - 1.1 * s, y, x, y - 1.6 * s)
    c.fillStyle = fill
    c.fill()
  }
  const closed = (x, up = true) => {
    // A shut eye: an arc (^ happy, or ‿ peaceful).
    line(1)
    curve(x - 2.4, up ? 0.8 : -0.2, x, up ? -2.2 : 1.8, x + 2.4, up ? 0.8 : -0.2)
    c.stroke()
  }
  const blinkOnly = kind.startsWith('blink:')
  const k = blinkOnly ? kind.slice(6) : kind
  const E = 4.6 // eyes this far either side
  // Eyes.
  if (!withEyes) {
    // 3D eyes and brows do these.
  } else if (blinkOnly) {
    closed(-E, false)
    closed(E, false)
  } else if (k === 'idle') {
    eye(-E)
    eye(E)
  } else if (k === 'focus') {
    eye(-E, { lid: 0.42, lidTilt: 0.25, dy: 0.9 })
    eye(E, { lid: 0.42, lidTilt: -0.25, dy: 0.9 })
  } else if (k === 'effort') {
    line(1.1)
    path([[-E - 2.2, -1.6], [-E + 1.6, 0], [-E - 2.2, 1.6]])
    c.stroke()
    path([[E + 2.2, -1.6], [E - 1.6, 0], [E + 2.2, 1.6]])
    c.stroke()
  } else if (k === 'wince') {
    line(1.1)
    path([[-E - 2.2, -1.2], [-E + 1.4, 0.2], [-E - 2.2, 1.4]])
    c.stroke()
    eye(E, { w: 2.3, h: 2.6, pupil: 1.2, dx: -0.3 })
  } else if (k === 'joy') {
    closed(-E)
    closed(E)
  } else if (k === 'cheer') {
    // Sparkly: big shining pupils and a star in each.
    eye(-E, { w: 3.1, h: 3.8, pupil: 2.3, dy: 0.2 })
    eye(E, { w: 3.1, h: 3.8, pupil: 2.3, dy: 0.2 })
    for (const x of [-E, E]) star(c, x + 0.2, 0.2, 1.4, '#ffffff')
  } else if (k === 'sad') {
    eye(-E, { dy: 1.2, lid: 0.3, lidTilt: -0.35 })
    eye(E, { dy: 1.2, lid: 0.3, lidTilt: 0.35 })
  } else if (k === 'shock') {
    eye(-E, { w: 3.2, h: 4.1, pupil: 0.9, dy: 0 })
    eye(E, { w: 3.2, h: 4.1, pupil: 0.9, dy: 0 })
  } else if (k === 'nervous') {
    eye(-E, { pupil: 1.1, dx: 0.6, dy: 0 })
    eye(E, { pupil: 1.1, dx: 0.6, dy: 0 })
  } else if (k === 'smug') {
    eye(-E, { lid: 0.55, dx: 1, dy: 0.9 })
    eye(E, { lid: 0.55, dx: 1, dy: 0.9 })
  }
  // Brows.
  const by = -4.6
  const brows = {
    idle: [0.08, -0.08, 0],
    focus: [0.4, -0.4, 0.6],
    effort: [0.55, -0.55, 0.9],
    wince: [-0.35, 0.3, -0.4],
    joy: [-0.2, 0.2, -1.2],
    cheer: [-0.25, 0.25, -1.6],
    sad: [-0.45, 0.45, -0.3],
    shock: [-0.1, 0.1, -2],
    nervous: [-0.4, 0.4, -0.6],
    smug: [0.25, -0.2, 0.2]
  }[k] ?? [0, 0, 0]
  if (withEyes) {
    brow(-E, by + brows[2] + (k === 'smug' ? 0.6 : 0), brows[0])
    brow(E, by + brows[2] + (k === 'smug' ? -0.9 : 0), brows[1])
  }
  // Mouth, cheeks and extras.
  if (k === 'idle') {
    smile()
    blush(0.32)
  } else if (k === 'focus') {
    line(0.9)
    curve(-2, 8.8, 0.5, 8.2, 2.4, 8.6)
    c.stroke()
  } else if (k === 'effort') {
    // Gritted teeth.
    c.beginPath()
    c.roundRect(-4.4, 6.8, 8.8, 3.6, 1.4)
    c.fillStyle = '#ffffff'
    c.fill()
    line(0.7)
    c.stroke()
    c.beginPath()
    c.moveTo(-4.4, 8.6)
    c.lineTo(4.4, 8.6)
    for (const x of [-2.2, 0, 2.2]) {
      c.moveTo(x, 6.8)
      c.lineTo(x, 10.4)
    }
    c.stroke()
    drop(8.6, -4.2, 1.1)
  } else if (k === 'wince') {
    line(0.9)
    path([[-3.6, 9], [-1.8, 8], [0, 9], [1.8, 8], [3.6, 9]])
    c.stroke()
  } else if (k === 'joy') {
    open(4, 7.2, 3)
    blush(0.5)
  } else if (k === 'cheer') {
    open(4.8, 6.8, 4)
    blush(0.55)
    for (const [x, y, s] of [[-11, -6, 1.2], [11, -7, 1.5], [12.4, 2, 0.9]]) star(c, x, y, s, '#ffd23f')
  } else if (k === 'sad') {
    line(0.9)
    curve(-3.2, 10, 0, 7.4, 3.2, 10)
    c.stroke()
    drop(-E - 0.6, 4.6, 1, '#8fdcff')
  } else if (k === 'shock') {
    ellipse(0, 9, 1.8, 2.4, '#5a1f2e')
  } else if (k === 'nervous') {
    line(0.8)
    path([[-3.6, 9], [-2.4, 8.2], [-1.2, 9], [0, 8.2], [1.2, 9], [2.4, 8.2], [3.6, 9]])
    c.stroke()
    drop(9, -3.6, 1)
    drop(-9.6, -2, 0.8)
    blush(0.25)
  } else if (k === 'smug') {
    line(0.9)
    curve(-3, 8.4, 0.6, 10.4, 3.8, 7.4)
    c.stroke()
    blush(0.3)
  }
}

function star(c, x, y, r, fill) {
  c.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2
    const rr = i % 2 ? r * 0.35 : r
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  c.closePath()
  c.fillStyle = fill
  c.fill()
}

