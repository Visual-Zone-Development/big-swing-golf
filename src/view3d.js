// The 3D driving range: the ocean resort (scenery.js), the golfers (characters.js: the one up
// at the tee, the others waiting beside it), the ball with its coloured trail, landing rings,
// confetti, and the camera that stands behind the golfer, follows the ball and looks down at
// where it stops. In the putting modes: the putting green (scenery.js), the cup and flagstick,
// everyone's ball on the green, an aim line that hugs the slope, and low putting cameras.
// It only draws; nothing here changes the game.
// Game space: x right of the tee, y up, z downrange (metres). three.js looks down -z, so the
// view puts game z at -z: game right stays screen right.
import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { TUNING, YD } from './tuning.js'
import { makeBean, makeModelBean } from './characters.js'
import { addProps, createScenery } from './scenery.js'
import { loadBeans } from './beans/beans.js'
import { GREEN, puttHeight } from './putting.js'
import { groundHeight } from './terrain.js'
import { createLighting } from './lighting.js'

const W = 1280
const H = 800

const toV = (p, v = new THREE.Vector3()) => v.set(p.x, p.y, -p.z)
const WHITE = new THREE.Color('#ffffff')

export function createView(canvas, { width = W, height = H, preserve = false, full = false, beans = './beans/', props = './resort/', graphics: graphicsSetting = 'auto' } = {}) {
  let graphics = graphicsSetting
  // No GPU (a software renderer): skip anti-aliasing, which multiplies every pixel's cost there.
  // full: always full detail, however slow (the art preview renders a single frame).
  const software = !full && softwareGpu()
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !software, powerPreference: 'high-performance', preserveDrawingBuffer: preserve })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1))
  // The view's size follows the screen's shape (fitCanvas fill): resize() keeps it in step.
  let vw = width
  let vh = height
  renderer.setSize(vw, vh, false)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(TUNING.camera.fov, width / height, 0.1, 2400)

  // ---- light ----------------------------------------------------------------------------------
  // lighting.js: sky light, sun with shadows that follow the action, fill, rim, and (High) the
  // finishing stack. graphics: 'auto' (High on a GPU, Low on a software renderer or slow frames),
  // 'high' or 'low' (the Graphics setting).
  const lighting = createLighting(renderer, scene, { low: software || graphics === 'low' })

  // ---- quality -----------------------------------------------------------------------------------
  // Full detail on a real GPU (the Deck included). A software renderer (no GPU, like a build
  // server) or frames that keep coming slower than 30 a second switch to light mode: half the
  // pixels, no shadows, fewer small things. Once light, it stays light.
  let light = false
  const golfers = new Map() // look id → makeBean() / makeModelBean()
  const blobGeo = new THREE.CircleGeometry(0.55, 24).rotateX(-Math.PI / 2)
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.5, color: '#203018' })
  let kit = null // the shared bean kit, once loaded (see below)
  const forceModels = typeof location !== 'undefined' && new URLSearchParams(location.search).has('models')
  let slowFor = 0
  let lastDraw = 0
  const goLight = () => {
    if (light) return
    light = true
    renderer.setPixelRatio(0.5)
    renderer.setSize(vw, vh, false)
    lighting.setLow(true)
    scenery?.setLight(true)
    // Back to the hand-built beans (rebuilt on the next frame).
    if (kit && !forceModels) {
      kit = null
      for (const g of golfers.values()) scene.remove(g.root)
      golfers.clear()
    }
  }
  let scenery = null

  // ---- the resort and the golfers ---------------------------------------------------------------
  scenery = createScenery(scene)
  // The resort's props (beach huts, rocks) load in the background.
  addProps(scene, props).catch((e) => console.warn('resort props not loaded', e))
  if (software) goLight()
  // The sculpted beans (shared bean kit) load in the background; until then (or if they can't
  // load) the hand-built beans stand in. Once loaded, every golfer is rebuilt on them. Light mode
  // keeps the hand-built beans: skinned models cost too much with no GPU (?models forces them).
  if (beans && (!software || forceModels)) {
    loadBeans(beans)
      .then((k) => {
        if (light && !forceModels) return
        kit = k
        for (const g of golfers.values()) scene.remove(g.root)
        golfers.clear()
      })
      .catch((e) => console.warn('bean models not loaded, using the simple beans', e))
  }
  /** The bean for a look ({ id, color, outfit }), made once and dressed in its current outfit. */
  const golfer = (def) => {
    if (!golfers.has(def.id)) {
      const g = kit ? makeModelBean(kit, def) : makeBean(def)
      g.root.visible = false
      // A soft shadow on the ground under them (the sun's shadow only reaches so far, and a
      // contact shadow grounds them even in light mode).
      const blob = new THREE.Mesh(blobGeo, blobMat)
      blob.position.y = 0.02
      blob.renderOrder = 1
      g.root.add(blob)
      scene.add(g.root)
      golfers.set(def.id, g)
    }
    const g = golfers.get(def.id)
    const key = JSON.stringify(def.outfit ?? {})
    if (g.outfitKey !== key) {
      g.outfitKey = key
      g.dress(def.outfit)
    }
    return g
  }
  // Where the others wait: a little line on the golfer's side, a few steps downrange, turned to
  // watch the shot (in the address camera's view, so you see them react).
  const WAIT = [
    { x: -2.8, z: -4.6 },
    { x: -4.6, z: -5.6 },
    { x: -6.4, z: -6.6 },
    { x: -8.2, z: -7.6 }
  ]

  // ---- ball, trail, aim, markers ------------------------------------------------------------------
  const ballMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25, emissive: '#ffffff', emissiveIntensity: 0.15 })
  const ball = new THREE.Mesh(new THREE.SphereGeometry(TUNING.ball.radius, 18, 12), ballMat)
  ball.castShadow = true
  scene.add(ball)
  // A soft halo so the ball reads against the sky from far away.
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: '#ffffff', depthWrite: false, transparent: true, opacity: 0.85 }))
  halo.scale.set(1, 1, 1)
  scene.add(halo)
  const ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.25, 16), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.25, depthWrite: false }))
  ballShadow.rotation.x = -Math.PI / 2
  scene.add(ballShadow)

  // The trail: a fat line (pixels wide at any distance), rebuilt from every 3rd flight point.
  const TRAIL = 240
  const trailBuf = new Float32Array(TRAIL * 3)
  const trailMat = new LineMaterial({ color: '#ffd23f', linewidth: 5, transparent: true, opacity: 0.95, worldUnits: false })
  trailMat.resolution.set(vw, vh)
  let trail = null
  let trailKey = ''

  // The aim line: dashes along the ground for 60 yards.
  const aim = new THREE.Group()
  const dashMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false })
  for (let i = 0; i < 16; i++) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 1.6), dashMat)
    d.rotation.x = -Math.PI / 2
    d.position.set(0, 0.03, -(3 + i * 3.4))
    aim.add(d)
  }
  scene.add(aim)

  // Putting: the cup with its white liner, the flagstick, everyone else's ball on the green, and
  // an aim line of short dashes that hugs the slope.
  const cup = new THREE.Group()
  const cupR = TUNING.putting.cup
  const hole = new THREE.Mesh(new THREE.CircleGeometry(cupR, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#10240c', polygonOffset: true, polygonOffsetFactor: -2 }))
  const liner = new THREE.Mesh(new THREE.RingGeometry(cupR, cupR + 0.025, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', polygonOffset: true, polygonOffsetFactor: -2 }))
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.3, 8, 6).translate(0, 1.15, 0), new THREE.MeshLambertMaterial({ color: '#fff8ec' }))
  const pin = new THREE.Mesh(new THREE.ShapeGeometry(pennant(), 4), new THREE.MeshLambertMaterial({ color: '#ff5c8a', side: THREE.DoubleSide }))
  pin.position.y = 2.25
  cup.add(hole, liner, stick, pin)
  cup.visible = false
  scene.add(cup)
  const others = new THREE.InstancedMesh(new THREE.SphereGeometry(TUNING.ball.radius, 14, 10), new THREE.MeshStandardMaterial({ roughness: 0.3 }), 4)
  others.frustumCulled = false
  for (let i = 0; i < 4; i++) others.setColorAt(i, new THREE.Color('#ffffff'))
  others.count = 0
  scene.add(others)
  const puttAim = new THREE.Group()
  for (let i = 0; i < 20; i++) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.32).rotateX(-Math.PI / 2), dashMat)
    puttAim.add(d)
  }
  puttAim.visible = false
  scene.add(puttAim)

  // Where past balls stopped this session, in their player's colour (one instanced mesh).
  const MARKS = 80
  const pinGeo = new THREE.SphereGeometry(0.9, 12, 8)
  pinGeo.translate(0, 1.6, 0)
  const marks = new THREE.InstancedMesh(pinGeo, new THREE.MeshLambertMaterial(), MARKS)
  // Instances land anywhere on the range: never cull by the (origin) bounds of the first frame,
  // and give the colours a buffer from the start so the shader is built with them.
  marks.frustumCulled = false
  for (let i = 0; i < MARKS; i++) marks.setColorAt(i, new THREE.Color('#ffffff'))
  marks.count = 0
  scene.add(marks)
  let markN = 0
  const landRing = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.2, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }))
  landRing.rotation.x = -Math.PI / 2
  scene.add(landRing)

  // Confetti for target hits: one instanced mesh, capped.
  const CONF = 160
  const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5, 0.3), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), CONF)
  confetti.frustumCulled = false
  for (let i = 0; i < CONF; i++) confetti.setColorAt(i, new THREE.Color('#ffffff'))
  confetti.count = 0
  scene.add(confetti)
  const conf = []

  // ---- camera ---------------------------------------------------------------------------------
  const cam = { pos: new THREE.Vector3(0, 2.4, 6.5), look: new THREE.Vector3(0, 1, -30), fov: TUNING.camera.fov, shake: 0 }
  const want = { pos: new THREE.Vector3(), look: new THREE.Vector3() }
  const tmp = new THREE.Vector3()
  const tmp2 = new THREE.Vector3()
  const dummy = new THREE.Object3D()
  const color = new THREE.Color()
  let clock = 0

  /**
   * Draw a frame.
   * o.mode: 'address' (behind the golfer, looking down the aim) | 'flight' (chase the ball) | 'landed' (look down at it) | 'overview'
   *   putting: 'putt' (low behind the ball) | 'roll' (follow it) | 'rolled' (look down at it)
   * o.putting: null on the range; on the putting green { from: {x, z} where the putt is from,
   *   cup: {x, z}, dir: the aim (radians, 0 = downrange, + right), balls: [{ x, z, color }] the others' }
   *   P.green: the green it's on (putting.js GREEN by default; the course's green on the course)
   * o.tee: on the course, where the ball lies for a full shot ({x, z}, dir: the line to the pin in
   *   radians, for where the others stand); the tee by default
   * o.flag: on the course, the pin to show from anywhere ({ cup: {x, z}, green })
   * o.targets: false hides the range's target greens (the course)
   * o.aim: degrees; o.ball: {x,y,z} | null; o.trail: points so far; o.ground: ground height under the ball
   * o.golfer: the look ({ id, color, outfit }) at the tee; o.waiting: the looks waiting beside it;
   * o.face: the golfer's expression (characters.js FACES); o.swing: the golfer's
   * pose (degrees: + back, - through); o.hand; o.lit: the green that was hit; o.land: where it landed; o.dt
   */
  let lastMode = ''
  function draw(o) {
    clock += o.dt
    const now = performance.now()
    const real = lastDraw ? (now - lastDraw) / 1000 : 0
    lastDraw = now
    if (real > 0 && real < 2 && o.mode !== 'fixed') {
      slowFor = real > 1 / 30 ? slowFor + real : Math.max(0, slowFor - real * 0.5)
      if (slowFor > 1.5 && !full && graphics !== 'high') goLight()
    }
    const aimRad = ((o.aim ?? 0) * Math.PI) / 180
    const sin = Math.sin(aimRad)
    const cos = Math.cos(aimRad)
    const P = o.putting ?? null
    // The green being putted on (the practice green, or the course's), its height everywhere.
    const G = P?.green ?? o.flag?.green ?? GREEN
    const ph = (x, z) => puttHeight(x, z, G)
    // Where a full shot is struck from: the tee, or (on the course) wherever the ball lies.
    const tee = o.tee ?? { x: 0, z: 0 }
    const teeY = o.tee ? groundHeight(tee.x, tee.z) : 0
    scenery.setPutting(Boolean(P) && G === GREEN)
    scenery.setTargets(o.targets !== false)
    aim.visible = o.mode === 'address' && !P
    aim.rotation.y = -aimRad
    aim.position.set(tee.x, teeY, -tee.z)
    const flag = P?.cup ?? o.flag?.cup ?? null
    cup.visible = Boolean(flag)
    puttAim.visible = Boolean(P) && o.mode === 'putt'
    others.count = 0
    if (flag) {
      cup.position.set(flag.x, ph(flag.x, flag.z) + 0.004, -flag.z)
      pin.rotation.y = Math.sin(clock * 1.8) * 0.25
      // From far down the fairway the flag is drawn bigger, so it can be seen on a TV.
      const far = Math.hypot(cam.pos.x - flag.x, cam.pos.z + flag.z)
      const k = Math.max(1, far / 28)
      stick.scale.set(k, k, k)
      pin.scale.set(k, k, k)
      pin.position.y = 2.25 * k
    }
    if (P) {
      // The aim line: dashes up to the cup's distance (and a bit), each sitting on the green. With
      // the help's guide (P.path, the predicted roll), they follow its curve instead.
      const reach = Math.min(12, Math.hypot(P.cup.x - P.from.x, P.cup.z - P.from.z) + 1)
      const path = P.path?.length > 1 ? P.path : null
      let pi = 0
      let walked = 0
      puttAim.children.forEach((d, i) => {
        const k = 0.5 + i * 0.6
        let x = P.from.x + Math.sin(P.dir) * k
        let z = P.from.z + Math.cos(P.dir) * k
        let heading = P.dir
        d.visible = k < reach
        if (path) {
          while (pi < path.length - 2 && walked + Math.hypot(path[pi + 1].x - path[pi].x, path[pi + 1].z - path[pi].z) < k) {
            walked += Math.hypot(path[pi + 1].x - path[pi].x, path[pi + 1].z - path[pi].z)
            pi++
          }
          const a = path[pi]
          const b = path[pi + 1]
          const seg = Math.hypot(b.x - a.x, b.z - a.z)
          const f = seg > 1e-6 ? Math.min(1, (k - walked) / seg) : 0
          x = a.x + (b.x - a.x) * f
          z = a.z + (b.z - a.z) * f
          heading = Math.atan2(b.x - a.x, b.z - a.z)
          d.visible = k < reach && walked + seg >= k
        }
        d.position.set(x, ph(x, z) + 0.02, -z)
        d.rotation.y = -heading
      })
      ;(P.balls ?? []).slice(0, 4).forEach((b, i) => {
        dummy.position.set(b.x, ph(b.x, b.z) + TUNING.ball.radius, -b.z)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.setScalar(1)
        dummy.updateMatrix()
        others.setMatrixAt(i, dummy.matrix)
        others.setColorAt(i, color.set(b.color).lerp(WHITE, 0.35)) // their colour, light, so it still reads as a ball
        others.count = i + 1
      })
      others.instanceMatrix.needsUpdate = true
      if (others.instanceColor) others.instanceColor.needsUpdate = true
    }
    // The golfer up, and everyone else waiting their turn.
    for (const g of golfers.values()) g.root.visible = false
    // Everyone watches the ball: on the tee (or the green) at address, in the air after the shot.
    const watch = o.ball ? toV(o.ball, new THREE.Vector3()) : P ? new THREE.Vector3(P.from.x, ph(P.from.x, P.from.z) + 0.06, -P.from.z) : new THREE.Vector3(tee.x, teeY + 0.1, -tee.z)
    if (o.golfer) {
      const g = golfer(o.golfer)
      g.root.visible = true
      if (P) g.pose({ swing: o.swing ?? 0, aim: P.dir, hand: o.hand ?? 'R', dt: o.dt, face: o.face, gaze: watch, putt: true, base: { x: P.from.x, y: ph(P.from.x, P.from.z), z: -P.from.z } })
      else g.pose({ swing: o.swing ?? 0, aim: aimRad, hand: o.hand ?? 'R', dt: o.dt, face: o.face, gaze: watch, base: o.tee ? { x: tee.x, y: teeY, z: -tee.z } : undefined })
    }
    ;(o.waiting ?? []).slice(0, WAIT.length).forEach((def, i) => {
      const g = golfer(def)
      g.root.visible = true
      // Putting: they watch from the green's left edge. On the course, away from the tee: the
      // same little line, beside wherever the ball is, turned with the line to the pin.
      if (P) {
        const w = puttWait(G, i)
        g.pose({ at: { x: w.x, y: ph(w.x, -w.z), z: w.z, face: -Math.PI / 2 }, dt: o.dt, face: def.face ?? 'idle', gaze: o.ball ? watch : null })
      } else if (o.tee) {
        const d = o.tee.dir ?? 0
        const gx = WAIT[i].x
        const gz = -WAIT[i].z
        const x = tee.x + gx * Math.cos(d) + gz * Math.sin(d)
        const z = tee.z - gx * Math.sin(d) + gz * Math.cos(d)
        g.pose({ at: { x, y: groundHeight(x, z), z: -z, face: -1.2 - d }, dt: o.dt, face: def.face ?? 'idle', gaze: o.ball ? watch : null })
      } else g.pose({ at: { x: WAIT[i].x, z: WAIT[i].z, face: -1.2 }, dt: o.dt, face: def.face ?? 'idle', gaze: o.ball ? watch : null })
    })
    scenery.update(o.dt, o.lit ?? -1)
    // Ball
    const b = o.ball ?? { x: tee.x, y: teeY + 0.13, z: tee.z }
    toV(b, ball.position)
    halo.position.copy(ball.position)
    const far = ball.position.distanceTo(camera.position)
    // Bigger far away so it reads on a TV; on the green, true size next to the cup.
    ball.scale.setScalar(Math.max(1, far * (P ? 0.06 : 0.12)))
    halo.scale.setScalar(Math.max(0.3, far * 0.05))
    halo.visible = far > 8 && b.y > 0.2
    ballShadow.position.set(b.x, (o.ground ?? 0) + 0.03, -b.z)
    ballShadow.visible = b.y - (o.ground ?? 0) > 0.15
    // Trail
    const pts = o.trail ?? []
    const key = `${pts.length}:${pts.length ? pts[pts.length - 1].x.toFixed(2) + pts[pts.length - 1].z.toFixed(2) : ''}`
    if (key !== trailKey) {
      trailKey = key
      if (trail) {
        scene.remove(trail)
        trail.geometry.dispose()
        trail = null
      }
      if (pts.length >= 2) {
        let n = 0
        const step = Math.max(1, Math.ceil(pts.length / (TRAIL - 1)))
        for (let i = 0; i < pts.length && n < TRAIL - 1; i += step) {
          trailBuf[n * 3] = pts[i].x
          trailBuf[n * 3 + 1] = pts[i].y + 0.03
          trailBuf[n * 3 + 2] = -pts[i].z
          n++
        }
        const lp = pts[pts.length - 1]
        trailBuf[n * 3] = lp.x
        trailBuf[n * 3 + 1] = lp.y + 0.03
        trailBuf[n * 3 + 2] = -lp.z
        n++
        const g = new LineGeometry()
        g.setPositions(trailBuf.subarray(0, n * 3))
        trail = new Line2(g, trailMat)
        trail.frustumCulled = false
        scene.add(trail)
      }
    }
    if (o.trailColor) trailMat.color.set(o.trailColor)
    // Landing ring pulse
    if (o.land) {
      landRing.position.set(o.land.x, (o.land.y ?? 0) + 0.1, -o.land.z)
      landRing.material.opacity = Math.max(0, landRing.material.opacity - o.dt * 0.6)
    }
    updateConfetti(o.dt)

    // Camera
    const C = TUNING.camera
    if (o.mode === 'flight' && o.ball) {
      // Behind and above the ball, along its direction of travel.
      const pts2 = o.trail ?? []
      const prev = pts2[Math.max(0, pts2.length - 8)] ?? b
      let dx = b.x - prev.x
      let dz = b.z - prev.z
      const l = Math.hypot(dx, dz)
      if (l < 0.01) ((dx = sin), (dz = cos))
      else ((dx /= l), (dz /= l))
      const back = C.follow + b.y * 0.5
      want.pos.set(b.x - dx * back, Math.max(b.y * 0.7 + C.followHeight, 2.5), -(b.z - dz * back))
      want.look.set(b.x + dx * 10, b.y * 0.85, -(b.z + dz * 10))
      follow(o.dt, 3.5)
    } else if (o.mode === 'landed' && o.ball) {
      // Up and back from where it stopped, looking down at it.
      want.pos.set(b.x - sin * 22, b.y + 16, -(b.z - cos * 22))
      want.look.set(b.x, b.y, -b.z)
      follow(o.dt, 2.2)
    } else if (o.mode === 'putt' && P) {
      // Putting address: low behind the ball, looking along the aim toward the cup.
      const { bx, by, bz, s: ps, c: pc } = puttFrame(P, b)
      const ahead = Math.min(7, Math.hypot(P.cup.x - bx, P.cup.z - bz) * 0.55)
      want.pos.set(bx - ps * 3.4, by + 1.45, -(bz - pc * 3.4))
      want.look.set(bx + ps * ahead, by, -(bz + pc * ahead))
      follow(o.dt, o.snap ? 99 : 5)
    } else if ((o.mode === 'roll' || o.mode === 'rolled') && P) {
      // Rolling: follow behind and above the ball along the putt's line; once it stops, look down at it.
      const { s: ps, c: pc } = puttFrame(P, b)
      const back = o.mode === 'roll' ? 3.6 : 3
      const ahead = o.mode === 'roll' ? 1.2 : 0 // stopped: the ball in the middle of the screen
      want.pos.set(b.x - ps * back, b.y + (o.mode === 'roll' ? 1.8 : 2.6), -(b.z - pc * back))
      want.look.set(b.x + ps * ahead, b.y, -(b.z + pc * ahead))
      follow(o.dt, o.mode === 'roll' ? 2.6 : 2)
    } else if (o.mode === 'fixed') {
      // Art: the camera stays where pose() put it.
    } else if (o.mode === 'title') {
      // Title: the crew lined up to the right of the menu rail, the camera breathing slowly.
      // Arriving at the title jumps straight there.
      const a = Math.sin(clock * 0.15) * 0.25
      want.pos.set(0.9 + a, 1.25 + Math.sin(clock * 0.11) * 0.05, -8.9)
      want.look.set(-4.2 + a * 0.5, 0.95, -4.4)
      follow(o.dt, lastMode !== 'title' ? 999 : 1.5)
    } else if (o.mode === 'overview') {
      // Title: drift slowly around the range.
      const a = Math.sin(clock * 0.08) * 0.35
      want.pos.set(Math.sin(a) * 30, 14, 18)
      want.look.set(0, 0, -120)
      follow(o.dt, 1)
    } else {
      // Address: behind the ball, a little to the side away from the golfer, down the aim line.
      const side = (o.hand === 'L' ? -1 : 1) * C.side
      want.pos.set(tee.x - sin * C.back + cos * side, teeY + C.height, -tee.z + cos * C.back + sin * side)
      want.look.set(tee.x + sin * 60 + cos * side, teeY + 0.5, -tee.z - cos * 60 + sin * side)
      follow(o.dt, o.snap ? 99 : 5)
    }
    camera.fov += ((o.mode === 'flight' ? C.fov + 6 : C.fov) - camera.fov) * Math.min(1, o.dt * 3)
    camera.updateProjectionMatrix()
    camera.position.copy(cam.pos)
    if (cam.shake > 0 && !o.reducedShake) {
      camera.position.x += (Math.random() - 0.5) * cam.shake * 0.3
      camera.position.y += (Math.random() - 0.5) * cam.shake * 0.3
    }
    cam.shake = Math.max(0, cam.shake - o.dt * 3)
    camera.lookAt(cam.look)
    // The action: the ball in play, else where the camera looks.
    lighting.update(o.ball && o.mode !== 'overview' ? o.ball : { x: cam.look.x, z: -cam.look.z }, camera)
    lighting.render(camera)
    lastMode = o.mode
  }
  function follow(dt, rate) {
    const k = 1 - Math.exp(-rate * dt)
    cam.pos.lerp(want.pos, k)
    cam.look.lerp(want.look, k)
  }

  function updateConfetti(dt) {
    let n = 0
    for (const c of conf) {
      c.life -= dt
      if (c.life <= 0) continue
      c.vy -= 9 * dt
      c.p.x += c.vx * dt
      c.p.y = Math.max(c.floor ?? 0.05, c.p.y + c.vy * dt)
      c.p.z += c.vz * dt
      dummy.position.copy(c.p)
      dummy.rotation.set(clock * c.spin, clock * c.spin * 0.7, 0)
      dummy.updateMatrix()
      confetti.setMatrixAt(n, dummy.matrix)
      confetti.setColorAt(n, color.set(c.color))
      n++
    }
    confetti.count = n
    confetti.instanceMatrix.needsUpdate = true
    if (confetti.instanceColor) confetti.instanceColor.needsUpdate = true
    for (let i = conf.length - 1; i >= 0; i--) if (conf[i].life <= 0) conf.splice(i, 1)
  }

  return {
    renderer,
    camera,
    draw,
    get light() {
      return light
    },
    /** The drawing space changed shape (a 16:9 TV, a tablet): render at w×h game units. */
    resize(w, h) {
      if (w === vw && h === vh) return
      vw = w
      vh = h
      renderer.setSize(vw, vh, false)
      camera.aspect = vw / vh
      camera.updateProjectionMatrix()
      trailMat.resolution.set(vw, vh)
      lighting.resize(vw, vh)
    },
    /** The Graphics setting: 'auto' | 'high' | 'low'. Low is light mode; High and Auto start full. */
    setGraphics(g) {
      graphics = g
      if (g === 'low') goLight()
      else if (light && (g === 'high' || !software)) {
        // Back up to full detail (a reload of the light mode's choices).
        light = false
        slowFor = 0
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1))
        renderer.setSize(vw, vh, false)
        lighting.setLow(false)
        scenery?.setLight(false)
      }
    },
    lighting,
    /** Jump the camera straight to its address spot (a new turn). */
    /** Jump the camera straight behind a putt (from, cup: {x, z}; dir radians). */
    snapPutt(P) {
      const { bx, by, bz, s: ps, c: pc } = puttFrame(P, { x: P.from.x, y: puttHeight(P.from.x, P.from.z, P.green ?? GREEN), z: P.from.z })
      const ahead = Math.min(7, Math.hypot(P.cup.x - bx, P.cup.z - bz) * 0.55)
      cam.pos.set(bx - ps * 3.4, by + 1.45, -(bz - pc * 3.4))
      cam.look.set(bx + ps * ahead, by, -(bz + pc * ahead))
    },
    /** Jump the camera straight to the address view: aim degrees, the golfer's hand, and the spot ({x, z}, the tee by default). */
    snap(aimDeg = 0, hand = 'R', at = null) {
      const a = (aimDeg * Math.PI) / 180
      const side = (hand === 'L' ? -1 : 1) * TUNING.camera.side
      const tx = at?.x ?? 0
      const tz = at?.z ?? 0
      const ty = at ? groundHeight(tx, tz) : 0
      cam.pos.set(tx - Math.sin(a) * TUNING.camera.back + Math.cos(a) * side, ty + TUNING.camera.height, -tz + Math.cos(a) * TUNING.camera.back + Math.sin(a) * side)
      cam.look.set(tx + Math.sin(a) * 60 + Math.cos(a) * side, ty + 0.5, -tz - Math.cos(a) * 60 + Math.sin(a) * side)
    },
    bump(k = 0.5) {
      cam.shake = Math.max(cam.shake, k)
    },
    /** A golfer reacts to the shot: 'cheer' | 'happy' | 'sad' | 'wince'. */
    react(def, kind) {
      golfer(def).react(kind)
    },
    /** What a look's bean is wearing and its face now (tests, debug). */
    lookOf(id) {
      return golfers.get(id)?.look ?? null
    },
    /** The sculpted bean models have loaded (otherwise the simple beans stand in). */
    get modelBeans() {
      return Boolean(kit)
    },
    land(p) {
      landRing.position.set(p.x, (p.y ?? 0) + 0.1, -p.z)
      landRing.material.opacity = 0.9
    },
    mark(p, colorHex) {
      dummy.position.set(p.x, p.y ?? 0, -p.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      const i = markN++ % MARKS
      marks.setMatrixAt(i, dummy.matrix)
      marks.setColorAt(i, color.set(colorHex))
      marks.count = Math.min(MARKS, markN)
      marks.instanceMatrix.needsUpdate = true
      if (marks.instanceColor) marks.instanceColor.needsUpdate = true
    },
    clearMarks() {
      markN = 0
      marks.count = 0
    },
    /** How many markers are standing where balls stopped (tests). */
    get markCount() {
      return marks.count
    },
    burst(p, colors, count = 90) {
      for (let i = 0; i < count && conf.length < CONF; i++) {
        const a = Math.random() * Math.PI * 2
        const s = 3 + Math.random() * 7
        conf.push({ p: new THREE.Vector3(p.x, (p.y ?? 0) + 0.5, -p.z), vx: Math.cos(a) * s, vy: 6 + Math.random() * 9, vz: Math.sin(a) * s, life: 2 + Math.random(), floor: (p.y ?? 0) + 0.05, spin: 2 + Math.random() * 6, color: colors[i % colors.length] })
      }
    },
    /** Screen position of a golfer's head (a look's id), for the name tag over them; null when not drawn. */
    headOf(id, up = 1.55) {
      const g = golfers.get(id)
      if (!g?.root.visible) return null
      const r = g.root.position
      return this.project({ x: r.x, y: r.y + up, z: -r.z })
    },
    /** Screen position of the top of the flagstick (scaled up from afar), or null when there's no flag. */
    flagTop() {
      if (!cup.visible) return null
      return this.project({ x: cup.position.x, y: cup.position.y + 2.45 * stick.scale.y, z: -cup.position.z })
    },
    /** Screen position (1280×800) of a game-space point, or null when behind the camera. */
    project(p) {
      toV(p, tmp).project(camera)
      if (tmp.z > 1) return null
      return { x: (tmp.x * 0.5 + 0.5) * vw, y: (-tmp.y * 0.5 + 0.5) * vh }
    },
    /** Art: place the camera exactly. */
    pose(pos, look, fov) {
      cam.pos.set(...pos)
      cam.look.set(...look)
      camera.fov = fov
    },
    tmp2
  }
}

// ---- pieces ----------------------------------------------------------------------------------

/** Where the others watch a putt: in a line off the green's left edge, facing it (three.js space). */
const puttWait = (G, i) => ({ x: G.x - G.rx * 1.25 - (i % 2) * 1.2, z: -(G.z - 3 + i * 1.8) })

/** A putt's ball and line: the ball's spot and the aim's sine and cosine. */
function puttFrame(P, b) {
  return { bx: b.x, by: b.y ?? 0, bz: b.z, s: Math.sin(P.dir), c: Math.cos(P.dir) }
}

/** The flagstick's little pennant. */
function pennant() {
  const tri = new THREE.Shape()
  tri.moveTo(0, 0)
  tri.lineTo(0.55, -0.16)
  tri.lineTo(0, -0.34)
  return tri
}

/** A software renderer (SwiftShader, llvmpipe): there's no GPU, so every pixel costs. */
function softwareGpu() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl')
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return /swiftshader|llvmpipe|software|softpipe/i.test(name)
  } catch {
    return false
  }
}

/** A soft round shadow: dark in the middle, fading out. */
function blobTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.55, 'rgba(255,255,255,0.55)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

function haloTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.25, 'rgba(255,255,255,0.9)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
