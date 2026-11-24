// The bean golfers: every player is the same soft bean in their own colour, with a face painted
// on it that changes with the moment (focused at address, straining on the downswing, cheering,
// wincing, sad) and a wardrobe that snaps on: a hat, a top and one accessory (tuning.js OUTFITS).
//
// The face is drawn into the bean's own texture (a canvas), so a new expression is just a redraw.
// The bean is a lathe (a turned profile), so its texture wraps around it: the front of the bean,
// where the face goes, is the middle of the canvas.
//
// Local space: the golfer faces -z, feet at y = 0. pose() places them beside the ball and swings
// the arms and club from the shoulders, following the phone's live swing angle.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

import { BLINKS, drawFace, FACES, INK } from './beans/faces.js'

// ---- the bean's shape ------------------------------------------------------------------------

/** The bean's profile: t 0 (bottom) to 1 (top) → [radius, height]. Fuller than an egg, a bit slimmer at the top. */
const BEAN = { cy: 0.88, hy: 0.56, rBot: 0.37, rTop: 0.31 }
function beanAt(t, grow = 0) {
  const a = Math.PI * t
  const s = Math.sin(a)
  const r = (BEAN.rBot + (BEAN.rTop - BEAN.rBot) * t) * Math.pow(Math.max(0, s), 0.75)
  return [Math.max(1e-4, r + grow * Math.pow(Math.max(0, s), 0.3)), BEAN.cy - BEAN.hy * Math.cos(a)]
}
/** A lathe of the bean's profile between t0 and t1, grown outward by `grow` (clothes sit on top). */
function beanLathe(t0 = 0, t1 = 1, grow = 0, steps = 40, segments = 48) {
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const [r, y] = beanAt(t0 + ((t1 - t0) * i) / steps, grow)
    pts.push(new THREE.Vector2(r, y))
  }
  return new THREE.LatheGeometry(pts, segments)
}
/** The bean's radius at a height (for things that sit on it: hats, the mask's strap). */
function radiusAt(y) {
  const c = Math.max(-1, Math.min(1, (BEAN.cy - y) / BEAN.hy))
  return beanAt(Math.acos(c) / Math.PI)[0]
}

// ---- the face ----------------------------------------------------------------------------------

// The face is drawn in centimetres from a point between the eyes. The canvas wraps the bean: its
// middle is the front, and a centimetre is more pixels across than down (a round bean, a tall
// canvas), so the drawing is scaled to come out round on the bean.
const TEX_W = 1024
const TEX_H = 512
const EYE_T = 0.62 // the eye line, as a fraction up the bean
const PX_X = TEX_W / (2 * Math.PI * beanAt(EYE_T)[0]) / 100 // px per cm across
const PX_Y = TEX_H / (BEAN.hy * Math.PI * Math.sin(Math.PI * EYE_T)) / 100 // px per cm down
const FACE_SIZE = 1.5 // the face is drawn this much bigger than its centimetres: big enough to read from the couch

export { FACES }

/** Paint the bean: its colour all round, and the face (kind) at the front. */
function paintBean(ctx, color, kind, blink) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, TEX_W, TEX_H)
  // A soft lighter belly so the bean isn't one flat colour.
  const belly = ctx.createRadialGradient(TEX_W / 2, TEX_H * 0.62, 10, TEX_W / 2, TEX_H * 0.62, 260)
  belly.addColorStop(0, 'rgba(255,255,255,0.16)')
  belly.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = belly
  ctx.fillRect(0, 0, TEX_W, TEX_H)
  ctx.setTransform(PX_X * FACE_SIZE, 0, 0, PX_Y * FACE_SIZE, TEX_W / 2, (1 - EYE_T) * TEX_H)
  drawFace(ctx, blink && BLINKS.has(kind) ? 'blink:' + kind : kind, color)
}

// ---- the wardrobe ------------------------------------------------------------------------------

/** The Hawaiian shirt's print: hibiscus and leaves on deep blue, made once and shared. */
let hawaiianTex = null
function hawaiianTexture() {
  if (hawaiianTex) return hawaiianTex
  const cv = document.createElement('canvas')
  cv.width = 512
  cv.height = 256
  const c = cv.getContext('2d')
  c.fillStyle = '#2f6fd6'
  c.fillRect(0, 0, 512, 256)
  let seed = 11
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 512
    const y = rnd() * 256
    // Leaves.
    c.fillStyle = '#2fb36a'
    for (let k = 0; k < 2; k++) {
      c.save()
      c.translate(x + 10, y + 8)
      c.rotate(rnd() * Math.PI * 2)
      c.beginPath()
      c.ellipse(0, 0, 18, 7, 0, 0, Math.PI * 2)
      c.fill()
      c.restore()
    }
    // A five-petal flower.
    const col = ['#ff5c8a', '#ffd23f', '#ffffff', '#ff8a3d'][i % 4]
    c.fillStyle = col
    for (let p = 0; p < 5; p++) {
      const a = (p * Math.PI * 2) / 5 + i
      c.beginPath()
      c.ellipse(x + Math.cos(a) * 9, y + Math.sin(a) * 9, 9, 6, a, 0, Math.PI * 2)
      c.fill()
    }
    c.fillStyle = '#ffe08a'
    c.beginPath()
    c.arc(x, y, 3.5, 0, Math.PI * 2)
    c.fill()
  }
  hawaiianTex = new THREE.CanvasTexture(cv)
  hawaiianTex.colorSpace = THREE.SRGBColorSpace
  hawaiianTex.wrapS = hawaiianTex.wrapT = THREE.RepeatWrapping
  hawaiianTex.repeat.set(3, 1)
  return hawaiianTex
}

/** Build every outfit piece for one bean (hidden until worn): { hat: { bucket, shark }, top: {...}, acc: {...}, sleeves }. */
function wardrobe(color, lean) {
  const pieces = { hat: {}, top: {}, acc: {} }
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    m.castShadow = true
    return m
  }
  const group = (...children) => {
    const g = new THREE.Group()
    g.add(...children)
    g.visible = false
    lean.add(g)
    return g
  }
  const base = new THREE.Color(color)

  // Bucket hat: a soft sandy crown with a teal band and a floppy brim.
  {
    const y = 1.24
    const r = radiusAt(y) + 0.035
    const sand = new THREE.MeshStandardMaterial({ color: '#f1ddb0', roughness: 0.85, side: THREE.DoubleSide })
    const crown = mesh(new THREE.LatheGeometry([[r, 0], [r - 0.01, 0.1], [r - 0.05, 0.17], [r - 0.12, 0.2], [0, 0.205]].map(([a, b]) => new THREE.Vector2(a, b)), 32), sand, 0, y, 0)
    const band = mesh(new THREE.CylinderGeometry(r - 0.004, r + 0.002, 0.045, 32, 1, true), new THREE.MeshStandardMaterial({ color: '#2ab7b0', roughness: 0.6, side: THREE.DoubleSide }), 0, y + 0.03, 0)
    const brim = mesh(new THREE.LatheGeometry([[r, 0.01], [r + 0.09, -0.03], [r + 0.16, -0.08]].map(([a, b]) => new THREE.Vector2(a, b)), 32), sand, 0, y, 0)
    pieces.hat.bucket = group(crown, band, brim)
  }
  // Shark-fin cap: a blue-grey dome with a white brim, a fin on top, eyes and little teeth.
  {
    const y = 1.23
    const r = radiusAt(y) + 0.03
    const grey = new THREE.MeshStandardMaterial({ color: '#6f93c2', roughness: 0.55 })
    const white = new THREE.MeshStandardMaterial({ color: '#f3f6fa', roughness: 0.5, side: THREE.DoubleSide })
    const dome = mesh(new THREE.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), grey, 0, y, 0)
    dome.scale.y = 0.85
    const brim = mesh(new THREE.CylinderGeometry(r * 0.78, r * 0.78, 0.022, 24, 1, false, Math.PI / 2, Math.PI), white, 0, y + 0.01, -r * 0.62)
    brim.scale.z = 1.05
    const fin = new THREE.Shape()
    fin.moveTo(-0.14, 0)
    fin.quadraticCurveTo(-0.02, 0.06, 0.1, 0.26)
    fin.quadraticCurveTo(0.08, 0.1, 0.13, 0)
    fin.closePath()
    const finMesh = mesh(new THREE.ExtrudeGeometry(fin, { depth: 0.05, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 3 }), grey, -0.025, y + r * 0.78, 0.02)
    finMesh.scale.set(1.1, 0.8, 1)
    finMesh.rotation.y = Math.PI / 2
    const parts = [dome, brim, finMesh]
    for (const s of [-1, 1]) {
      const e = mesh(new THREE.SphereGeometry(0.028, 10, 8), new THREE.MeshBasicMaterial({ color: INK }), s * r * 0.62, y + r * 0.42, -r * 0.62)
      parts.push(e)
    }
    const tooth = new THREE.ConeGeometry(0.018, 0.04, 6)
    for (let i = -3; i <= 3; i++) {
      const a = Math.PI + i * 0.2
      const tm = mesh(tooth, white, Math.sin(a) * r * 0.98, y - 0.01, Math.cos(a) * r * 0.98)
      tm.rotation.x = Math.PI
      parts.push(tm)
    }
    pieces.hat.shark = group(...parts)
  }
  // Tops: a shirt shell over the lower bean, with short sleeves (on the arms, see makeBean).
  const shell = (mat) => mesh(beanLathe(0.06, 0.5, 0.016, 24, 48), mat)
  {
    // The polo in a lighter shade of the bean's colour, with a white collar and band.
    const polo = new THREE.MeshStandardMaterial({ color: base.clone().lerp(new THREE.Color('#ffffff'), 0.3), roughness: 0.75 })
    const trim = new THREE.MeshStandardMaterial({ color: '#fff8ec', roughness: 0.6 })
    const [rTop, yTop] = beanAt(0.5, 0.016)
    const collar = []
    for (const s of [-1, 1]) {
      const flap = mesh(new THREE.BoxGeometry(0.11, 0.015, 0.09), trim, s * 0.06, yTop - 0.005, -rTop * 0.9 + 0.02)
      flap.rotation.set(-0.5, s * 0.5, s * 0.3)
      collar.push(flap)
    }
    const placket = mesh(new THREE.BoxGeometry(0.035, 0.12, 0.012), trim, 0, yTop - 0.08, -rTop * 0.93)
    placket.rotation.x = 0.18
    const buttons = [0, 1].map((i) => mesh(new THREE.SphereGeometry(0.011, 8, 6), polo, 0, yTop - 0.06 - i * 0.045, -rTop * 0.95 - 0.003))
    const band = mesh(beanLathe(0.06, 0.1, 0.02, 4, 48), trim)
    pieces.top.polo = group(shell(polo), ...collar, placket, ...buttons, band)
    pieces.top.polo.userData.sleeve = polo
  }
  {
    const print = new THREE.MeshStandardMaterial({ map: hawaiianTexture(), roughness: 0.8 })
    const [rTop, yTop] = beanAt(0.5, 0.016)
    const collar = []
    for (const s of [-1, 1]) {
      const flap = mesh(new THREE.BoxGeometry(0.12, 0.014, 0.1), print, s * 0.075, yTop - 0.02, -rTop * 0.92 + 0.02)
      flap.rotation.set(-0.7, s * 0.6, s * 0.35)
      collar.push(flap)
    }
    pieces.top.hawaiian = group(shell(print), ...collar)
    pieces.top.hawaiian.userData.sleeve = print
  }
  // Flower lei: a ring of flowers round the shoulders, dipping at the front.
  {
    const N = 22
    const flowers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.042, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.6 }), N)
    const d = new THREE.Object3D()
    const cols = ['#ff5c8a', '#ffd23f', '#ffffff', '#ff8a3d', '#c39bff']
    const r = radiusAt(0.9) + 0.03
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      const front = Math.max(0, -Math.cos(a)) // 1 at the front (-z)
      d.position.set(Math.sin(a) * r, 0.9 - front * 0.12, Math.cos(a) * r * 0.9 - front * 0.02)
      d.scale.setScalar(0.9 + ((i * 7) % 5) * 0.06)
      d.updateMatrix()
      flowers.setMatrixAt(i, d.matrix)
      flowers.setColorAt(i, new THREE.Color(cols[i % cols.length]))
    }
    flowers.castShadow = true
    pieces.acc.lei = group(flowers)
  }
  // Snorkel mask pushed up on the forehead, its strap round the head, the snorkel up the side.
  {
    const y = 1.2
    const r = radiusAt(y)
    const yellow = new THREE.MeshStandardMaterial({ color: '#ffb22e', roughness: 0.4 })
    const frame = mesh(new RoundedBoxGeometry(0.3, 0.13, 0.07, 3, 0.03), yellow, 0, y, -r * 0.88 - 0.03)
    frame.rotation.x = -0.25
    const lens = mesh(new RoundedBoxGeometry(0.25, 0.09, 0.02, 3, 0.02), new THREE.MeshStandardMaterial({ color: '#9fe3ff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.75 }), 0, y + 0.006, -r * 0.88 - 0.07)
    lens.rotation.x = -0.25
    const strap = mesh(new THREE.TorusGeometry(r + 0.012, 0.016, 8, 40), new THREE.MeshStandardMaterial({ color: '#28314a', roughness: 0.6 }), 0, y + 0.01, 0)
    strap.rotation.x = Math.PI / 2
    strap.scale.y = 0.9
    const tube = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.15, y - 0.02, -r * 0.75), new THREE.Vector3(r + 0.04, y + 0.02, -0.08), new THREE.Vector3(r + 0.06, y + 0.3, 0), new THREE.Vector3(r + 0.03, y + 0.46, 0.04)]), 20, 0.022, 8), new THREE.MeshStandardMaterial({ color: '#ff8a3d', roughness: 0.45 }))
    pieces.acc.snorkel = group(frame, lens, strap, tube)
  }
  return pieces
}

// ---- the golfer ------------------------------------------------------------------------------

/**
 * One bean golfer. def: { id, color, outfit: { hat, top, acc } } (ids from tuning.js OUTFITS;
 * 'none' or missing for nothing). Returns { root, def, stand, pose(o), react(kind), dress(outfit), look }.
 */
export function makeBean(def) {
  const root = new THREE.Group()
  const lean = new THREE.Group() // squash, hop and spin live here, so pose() can own root
  root.add(lean)
  const color = new THREE.Color(def.color)
  const accent = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.72), roughness: 0.5 })
  const trim = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45 })
  const skin = new THREE.MeshStandardMaterial({ color, roughness: 0.55 })

  // The body: a lathe wearing its own canvas, the face painted at the front.
  const cv = document.createElement('canvas')
  cv.width = TEX_W
  cv.height = TEX_H
  const ctx = cv.getContext('2d')
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const bodyMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 })
  const shape = new THREE.Group() // the bean and its clothes, squashed a touch front to back
  shape.scale.z = 0.9
  shape.rotation.z = 0.05
  lean.add(shape)
  const body = new THREE.Mesh(beanLathe(), bodyMat)
  body.castShadow = true
  shape.add(body)
  const pieces = wardrobe(def.color, shape)

  // Legs and big shoes.
  const shoeGeo = new THREE.SphereGeometry(1, 16, 10)
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.2, 4, 8), accent)
    leg.position.set(s * 0.13, 0.08 + 0.17, 0)
    leg.castShadow = true
    lean.add(leg)
    const shoe = new THREE.Mesh(shoeGeo, trim)
    shoe.scale.set(0.12, 0.08, 0.19)
    shoe.position.set(s * 0.14, 0.075, -0.05)
    shoe.castShadow = true
    lean.add(shoe)
  }

  // Arms (with sleeves when a top is on), the gloves and the club swing from the shoulders. Hands
  // meet in front; the club reaches down to the ball, which sits `stand` in front of the feet.
  const shoulder = 0.86
  const width = 0.32
  const front = beanAt(0.5)[0] * 0.9
  const stand = front + 0.42
  const swing = new THREE.Group()
  swing.position.set(0, shoulder, 0)
  lean.add(swing)
  const hands = new THREE.Vector3(0, Math.max(0.32, shoulder - 0.42) - shoulder, -(front + 0.12))
  const up = new THREE.Vector3(0, 1, 0)
  const sleeves = []
  for (const s of [-1, 1]) {
    const from = new THREE.Vector3(s * width, 0, -front * 0.4)
    const d = hands.clone().sub(from)
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, d.length(), 4, 8), skin)
    arm.position.copy(from).addScaledVector(d, 0.5)
    arm.quaternion.setFromUnitVectors(up, d.clone().normalize())
    arm.castShadow = true
    swing.add(arm)
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, d.length() * 0.28, 4, 10), skin)
    sleeve.position.copy(from).addScaledVector(d, 0.2)
    sleeve.quaternion.copy(arm.quaternion)
    sleeve.visible = false
    sleeve.castShadow = true
    swing.add(sleeve)
    sleeves.push(sleeve)
  }
  const glove = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), trim)
  glove.position.copy(hands)
  glove.castShadow = true
  swing.add(glove)
  const wrist = new THREE.Group()
  wrist.position.copy(hands)
  swing.add(wrist)
  const ballAt = new THREE.Vector3(0, 0.05 - shoulder, -stand).sub(hands)
  const len = ballAt.length() - 0.05
  const dir = ballAt.clone().normalize()
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, len, 6), new THREE.MeshStandardMaterial({ color: '#d9dee8', metalness: 0.5, roughness: 0.3 }))
  shaft.position.copy(dir).multiplyScalar(len / 2)
  shaft.quaternion.setFromUnitVectors(up, dir)
  wrist.add(shaft)
  const head = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.1, 4, 8), new THREE.MeshStandardMaterial({ color: '#3a3f5c', metalness: 0.4, roughness: 0.35 }))
  head.position.copy(dir).multiplyScalar(len)
  head.rotation.z = Math.PI / 2
  head.castShadow = true
  wrist.add(head)

  let angle = 0
  let t = Math.random() * 10
  let blinkAt = 2 + Math.random() * 3
  const react = { kind: null, t: 0 }
  const look = { hat: 'none', top: 'none', acc: 'none', face: 'idle' }
  let painted = ''

  function paint(face, blink) {
    const key = `${face}:${blink}`
    if (key === painted) return
    painted = key
    paintBean(ctx, def.color, face, blink)
    tex.needsUpdate = true
  }
  /** Put on an outfit: { hat, top, acc }, each an OUTFITS id or 'none'. */
  function dress(outfit = {}) {
    for (const slot of ['hat', 'top', 'acc']) {
      const id = outfit[slot] && pieces[slot][outfit[slot]] ? outfit[slot] : 'none'
      look[slot] = id
      for (const [k, g] of Object.entries(pieces[slot])) g.visible = k === id
    }
    const top = pieces.top[look.top]
    for (const sl of sleeves) {
      sl.visible = Boolean(top)
      if (top) sl.material = top.userData.sleeve
    }
  }
  dress(def.outfit)
  paint('idle', false)

  /** The face a reaction shows while it plays. */
  const REACT_FACE = { cheer: 'cheer', happy: 'joy', sad: 'sad', wince: 'wince' }

  return {
    root,
    def,
    stand,
    dress,
    /** What it's wearing and its face right now (for tests and the debug overlay). */
    get look() {
      return { ...look }
    },
    /** Show what happened: 'cheer' (hop and spin), 'happy' (a little hop), 'sad' (droop), 'wince' (a flinch). */
    react(kind) {
      react.kind = kind
      react.t = 0
    },
    /**
     * o.swing: degrees (+ back, - through), o.dt, o.hand 'R' | 'L', o.face: the expression
     * (FACES) when no reaction is playing,
     * o.at: { x, z, face } where to stand (three.js space) and which way to face (radians), or
     * o.ball: { aim } to stand at the tee beside the ball, aimed down the line.
     * o.base: { x, y, z } (three.js space) where that ball is, when it isn't on the tee (putting).
     * o.putt: a putting stroke: the wrists stay quiet and the arms rock.
     */
    pose(o) {
      const dt = o.dt ?? 1 / 60
      t += dt
      angle += ((o.swing ?? 0) - angle) * Math.min(1, dt * 18)
      const m = o.hand === 'L' ? -1 : 1
      if (o.at) {
        root.position.set(o.at.x, o.at.y ?? 0, o.at.z)
        root.rotation.y = o.at.face
      } else {
        const aim = o.aim ?? 0
        const s = Math.sin(aim)
        const c = Math.cos(aim)
        const at = o.base ?? { x: 0, y: 0, z: 0 }
        root.position.set(at.x - c * stand * m, at.y ?? 0, at.z - s * stand * m)
        root.rotation.y = -aim + (m > 0 ? -Math.PI / 2 : Math.PI / 2)
      }
      // The swing: arms take most of it, the wrists cock the club for the rest.
      const d = Math.max(-200, Math.min(270, angle))
      swing.rotation.z = THREE.MathUtils.degToRad(d * 0.6) * m
      wrist.rotation.z = o.putt ? 0 : THREE.MathUtils.degToRad(Math.max(-60, Math.min(95, d * 0.35))) * m
      shape.rotation.y = THREE.MathUtils.degToRad(d * 0.12) * m
      // Idle: breathing squash, blinking; reactions on top.
      let sy = 1 + Math.sin(t * 2.4) * 0.02
      let hop = 0
      let spin = 0
      let tilt = 0
      if (react.kind) {
        react.t += dt
        const k = react.t
        if (react.kind === 'cheer') {
          hop = Math.max(0, Math.sin(Math.min(k, 1.2) * Math.PI * 2.5)) * 0.35
          spin = Math.min(1, k / 0.9) * Math.PI * 2
          sy += Math.max(0, Math.sin(k * 14)) * 0.06 * Math.max(0, 1 - k)
          if (k > 1.6) react.kind = null
        } else if (react.kind === 'happy') {
          hop = Math.max(0, Math.sin(Math.min(k, 0.4) * Math.PI * 2.5)) * 0.18
          if (k > 1.2) react.kind = null
        } else if (react.kind === 'sad') {
          const w = Math.min(1, k / 0.3) * (k < 1.6 ? 1 : Math.max(0, 1 - (k - 1.6) / 0.4))
          sy -= 0.12 * w
          tilt = 0.25 * w
          if (k > 2) react.kind = null
        } else if (react.kind === 'wince') {
          const w = Math.min(1, k / 0.12) * Math.max(0, 1 - Math.max(0, k - 0.9) / 0.5)
          sy -= 0.06 * w
          tilt = -0.12 * w
          if (k > 1.6) react.kind = null
        }
      }
      lean.position.y = hop
      lean.scale.set(1 + (1 - sy) * 0.6, sy, 1 + (1 - sy) * 0.6)
      lean.rotation.set(tilt, spin, 0)
      blinkAt -= dt
      const blink = blinkAt < 0.12 && blinkAt > 0
      if (blinkAt <= 0) blinkAt = 2.5 + Math.random() * 3
      look.face = react.kind ? REACT_FACE[react.kind] : FACES.includes(o.face) ? o.face : 'idle'
      paint(look.face, blink)
    }
  }
}

// ---- the Meshy bean ------------------------------------------------------------------------------

/**
 * The same golfer as makeBean() (same pose(), react(), dress(), look), built on the sculpted bean
 * from the shared bean kit (src/beans, copied from shared/beans): its own gloves reach for the
 * club, its face is a decal, its outfit real models. kit: from loadBeans().
 */
export function makeModelBean(kit, def) {
  const root = new THREE.Group()
  const lean = new THREE.Group()
  root.add(lean)
  const shape = new THREE.Group() // turns a little with the swing
  lean.add(shape)
  const bean = kit.make({ color: def.color, outfit: def.outfit })
  shape.add(bean.root)

  // The club swings from between the shoulders; the hands are on it, the head at the ball.
  const shoulder = 0.92
  const front = 0.33
  const stand = front + 0.46
  const swing = new THREE.Group()
  swing.position.set(0, shoulder, 0)
  lean.add(swing)
  const hands = new THREE.Vector3(0, 0.5 - shoulder, -(front + 0.16))
  const wrist = new THREE.Group()
  wrist.position.copy(hands)
  swing.add(wrist)
  const up = new THREE.Vector3(0, 1, 0)
  const ballAt = new THREE.Vector3(0, 0.05 - shoulder, -stand).sub(hands)
  const len = ballAt.length() - 0.05
  const dir = ballAt.clone().normalize()
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, len + 0.12, 6), new THREE.MeshStandardMaterial({ color: '#d9dee8', metalness: 0.5, roughness: 0.3 }))
  shaft.position.copy(dir).multiplyScalar((len - 0.12) / 2)
  shaft.quaternion.setFromUnitVectors(up, dir)
  shaft.castShadow = true
  wrist.add(shaft)
  const head = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.1, 4, 8), new THREE.MeshStandardMaterial({ color: '#3a3f5c', metalness: 0.4, roughness: 0.35 }))
  head.position.copy(dir).multiplyScalar(len)
  head.rotation.z = Math.PI / 2
  head.castShadow = true
  wrist.add(head)
  // Where the two gloves hold the grip: one above the other along the shaft.
  const gripTop = new THREE.Object3D()
  gripTop.position.copy(dir).multiplyScalar(-0.05)
  const gripLow = new THREE.Object3D()
  gripLow.position.copy(dir).multiplyScalar(0.06)
  wrist.add(gripTop, gripLow)
  const lw = new THREE.Vector3()
  const rw = new THREE.Vector3()

  let angle = 0
  let t = Math.random() * 10
  let blinkAt = 2 + Math.random() * 3
  const react = { kind: null, t: 0 }
  const REACT_FACE = { cheer: 'cheer', happy: 'joy', sad: 'sad', wince: 'wince' }

  return {
    root,
    def,
    stand,
    model: true,
    dress: (outfit) => bean.dress(outfit),
    get look() {
      return bean.look
    },
    react(kind) {
      react.kind = kind
      react.t = 0
    },
    pose(o) {
      const dt = o.dt ?? 1 / 60
      t += dt
      angle += ((o.swing ?? 0) - angle) * Math.min(1, dt * 18)
      const m = o.hand === 'L' ? -1 : 1
      if (o.at) {
        root.position.set(o.at.x, o.at.y ?? 0, o.at.z)
        root.rotation.y = o.at.face
      } else {
        const aim = o.aim ?? 0
        const s = Math.sin(aim)
        const c = Math.cos(aim)
        const at = o.base ?? { x: 0, y: 0, z: 0 }
        root.position.set(at.x - c * stand * m, at.y ?? 0, at.z - s * stand * m)
        root.rotation.y = -aim + (m > 0 ? -Math.PI / 2 : Math.PI / 2)
      }
      const d = Math.max(-200, Math.min(270, angle))
      swing.rotation.z = THREE.MathUtils.degToRad(d * 0.6) * m
      wrist.rotation.z = o.putt ? 0 : THREE.MathUtils.degToRad(Math.max(-60, Math.min(95, d * 0.35))) * m
      shape.rotation.y = THREE.MathUtils.degToRad(d * 0.12) * m
      // Waiting beans (no club) let their arms hang; the golfer up holds the grip.
      const holding = !o.at
      swing.visible = holding
      let sy = 1 + Math.sin(t * 2.4) * 0.02
      let hop = 0
      let spin = 0
      let tilt = 0
      if (react.kind) {
        react.t += dt
        const k = react.t
        if (react.kind === 'cheer') {
          hop = Math.max(0, Math.sin(Math.min(k, 1.2) * Math.PI * 2.5)) * 0.35
          spin = Math.min(1, k / 0.9) * Math.PI * 2
          if (k > 1.6) react.kind = null
        } else if (react.kind === 'happy') {
          hop = Math.max(0, Math.sin(Math.min(k, 0.4) * Math.PI * 2.5)) * 0.18
          if (k > 1.2) react.kind = null
        } else if (react.kind === 'sad') {
          const w = Math.min(1, k / 0.3) * (k < 1.6 ? 1 : Math.max(0, 1 - (k - 1.6) / 0.4))
          sy -= 0.12 * w
          tilt = 0.25 * w
          if (k > 2) react.kind = null
        } else if (react.kind === 'wince') {
          const w = Math.min(1, k / 0.12) * Math.max(0, 1 - Math.max(0, k - 0.9) / 0.5)
          sy -= 0.06 * w
          tilt = -0.12 * w
          if (k > 1.6) react.kind = null
        }
      }
      lean.position.y = hop
      lean.scale.set(1 + (1 - sy) * 0.6, sy, 1 + (1 - sy) * 0.6)
      lean.rotation.set(tilt, spin, 0)
      blinkAt -= dt
      const blink = blinkAt < 0.12 && blinkAt > 0
      if (blinkAt <= 0) blinkAt = 2.5 + Math.random() * 3
      bean.face(react.kind ? REACT_FACE[react.kind] : FACES.includes(o.face) ? o.face : 'idle', blink, dt)
      bean.gaze(o.gaze ?? null)
      if (holding) {
        root.updateMatrixWorld(true)
        gripTop.getWorldPosition(lw)
        gripLow.getWorldPosition(rw)
        // The lead hand (left for a right-hander) on top of the grip.
        if (m > 0) bean.reach(lw, rw)
        else bean.reach(rw, lw)
      } else bean.reach(null, null)
    }
  }
}
