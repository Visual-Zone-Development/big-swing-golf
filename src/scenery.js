// The ocean resort around the range, in a simple form of the concept art: a sky with puffy
// clouds, rolling hills of puffy trees on the left, dunes, palms and a beach sloping into the sea
// on the right and past the far end, a lighthouse on a rocky point, sailboats, a rounded tee box,
// soft target greens with striped flags, and wooden yardage boards. Everything is rounded; every
// repeated thing is one instanced mesh. Heights come from terrain.js, which the ball uses too.
// Game space: x right of the tee, z downrange; three.js puts game z at -z.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { TUNING, YD } from './tuning.js'
import { fairwayHalf, groundHeight, landHeight, SEA_LEVEL, surfaceAt } from './terrain.js'
import { HOLE } from './course.js'
import { GREEN, greenReach, puttHeight, slopeAt } from './putting.js'
import { createTufts, grassMaterial, grassUVs, setGrassDetail } from './grass.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export const COLORS = {
  skyTop: '#2f86ee',
  skyHorizon: '#cdeeff',
  fairway: '#6cc843',
  stripe: '#5fb93b',
  rough: '#4aa437',
  hillLow: '#4cae3e',
  hillHigh: '#9edd6d',
  sand: '#f5dfa5',
  wetSand: '#e6c98a',
  foam: '#ffffff',
  seabed: '#7fd6c8',
  sea: '#1f9fd6',
  tee: '#78d551'
}

/** A seeded random number generator, so the scenery is the same every time. */
function rng(seed) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) / 2147483647)
}
/** Paint a geometry with one colour, or a colour per vertex from fn(position). */
function paint(geo, fn) {
  const pos = geo.attributes.position
  const col = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    typeof fn === 'function' ? c.copy(fn(v)) : c.set(fn)
    col.set([c.r, c.g, c.b], i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  if (geo.attributes.uv) geo.deleteAttribute('uv')
  return geo
}
const at = (geo, x, y, z, sx = 1, sy = sx, sz = sx) => geo.scale(sx, sy, sz).translate(x, y, z)
/** One mesh (one draw call) from placed parts: [geometry, colour] pairs. */
function merged(parts, mat = new THREE.MeshStandardMaterial({ vertexColors: true })) {
  // Some shapes come indexed and some don't (RoundedBoxGeometry): unindex them all to merge.
  return new THREE.Mesh(mergeGeometries(parts.map(([g, c]) => paint(g.index ? g.toNonIndexed() : g, c))), mat)
}

export function createScenery(scene) {
  const end = TUNING.range.length * YD
  const vertexMat = new THREE.MeshStandardMaterial({ vertexColors: true })

  // ---- sky ----------------------------------------------------------------------------------------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1600, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color(COLORS.skyTop) }, horizon: { value: new THREE.Color(COLORS.skyHorizon) } },
      vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 p; void main(){ float k = smoothstep(-0.03, 0.45, p.y); gl_FragColor = vec4(mix(horizon, top, k), 1.0); }'
    })
  )
  scene.add(sky)
  // Haze: the far hills and the sea fade toward the horizon, which gives the resort its depth.
  scene.fog = new THREE.Fog(COLORS.skyHorizon, 150, 950)

  // ---- land --------------------------------------------------------------------------------------
  // One mesh from 60 m behind the tee to well past the beach, coloured by what it is.
  const land = new THREE.PlaneGeometry(820, 820, 110, 110)
  land.rotateX(-Math.PI / 2) // now x right, y up, z toward the camera (three space)
  const pos = land.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  const lo = new THREE.Color(COLORS.hillLow)
  const hi = new THREE.Color(COLORS.hillHigh)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = -(pos.getZ(i) - 350) // game z: from -60 (behind the tee) to 760
    pos.setZ(i, -z)
    const h = landHeight(x, z)
    pos.setY(i, h)
    const s = surfaceAt(x, z)
    if (s === 'range') c.set(COLORS.rough)
    else if (s === 'hill') c.copy(lo).lerp(hi, Math.min(1, Math.max(0, h / 22)))
    else if (h > SEA_LEVEL + 0.35) c.set(h < SEA_LEVEL + 0.9 ? COLORS.wetSand : COLORS.sand)
    else if (h > SEA_LEVEL - 0.05) c.set(COLORS.foam)
    else c.set(COLORS.seabed).lerp(new THREE.Color(COLORS.sea), Math.min(1, (SEA_LEVEL - h) / 3))
    // A little variation so big areas don't look flat.
    const n = 1 + 0.04 * Math.sin(x * 0.31) * Math.sin(z * 0.27)
    colors.set([c.r * n, c.g * n, c.b * n], i * 3)
  }
  land.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  land.computeVertexNormals()
  grassUVs(land)
  const ground = new THREE.Mesh(land, grassMaterial({ vertexColors: true, patch: 0.26 }))
  ground.receiveShadow = true
  scene.add(ground)

  // The fairway: a fan, mown in stripes every 10 yards, rounded at both ends.
  const fw = new THREE.Shape()
  const zs = []
  for (let z = 6; z <= end - 6; z += 8) zs.push(z)
  fw.moveTo(-fairwayHalf(6), 6)
  for (const z of zs) fw.lineTo(-fairwayHalf(z), z)
  fw.quadraticCurveTo(0, end + 14, fairwayHalf(end - 6), end - 6)
  for (const z of [...zs].reverse()) fw.lineTo(fairwayHalf(z), z)
  fw.quadraticCurveTo(0, -2, -fairwayHalf(6), 6)
  const fairwayGeo = new THREE.ShapeGeometry(fw, 12)
  fairwayGeo.rotateX(-Math.PI / 2) // shape y (game z) lands at three z = -y
  grassUVs(fairwayGeo)
  // Mown in stripes every 10 yards, worked out from the world position by the grass shader.
  const fairway = new THREE.Mesh(fairwayGeo, grassMaterial({ color: COLORS.fairway, stripes: true, stripe: 10 * YD, patch: 0.14, bump: 0.6 }))
  fairway.position.y = 0.01
  fairway.receiveShadow = true
  scene.add(fairway)
  const lineMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false })
  const lines = []
  for (let yd = 50; yd <= 250; yd += 50) {
    const z = yd * YD
    lines.push(new THREE.PlaneGeometry(fairwayHalf(z) * 2 - 4, 0.45).rotateX(-Math.PI / 2).translate(0, 0.02, -z))
    for (const side of [-1, 1]) {
      const board = yardBoard(yd)
      board.position.set(side * (fairwayHalf(z) + 7), 0, -z)
      board.rotation.y = -side * 0.35
      scene.add(board)
    }
  }
  const yardLines = new THREE.Mesh(mergeGeometries(lines), lineMat)
  scene.add(yardLines)

  // ---- sea ---------------------------------------------------------------------------------------
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshStandardMaterial({ color: COLORS.sea, roughness: 0.16, metalness: 0.05, transparent: true, opacity: 0.86 }))
  sea.rotation.x = -Math.PI / 2
  sea.position.set(0, SEA_LEVEL, -600)
  scene.add(sea)
  // Far islands, soft in the haze.
  const islands = []
  for (const [x, z, r, h] of [
    [-420, 1150, 260, 34],
    [180, 1300, 320, 42],
    [620, 900, 180, 26],
    [820, 520, 160, 30]
  ]) {
    islands.push([at(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), x, SEA_LEVEL - 2, -z, r, h, r * 0.6), '#4f9f5a'])
  }
  scene.add(merged(islands))

  // ---- trees, palms, bushes, flowers ------------------------------------------------------------------
  const rand = rng(11)
  const trees = []
  const palms = []
  const bushes = []
  const flowers = []
  // Left hills: scattered puffy trees, denser further out.
  for (let i = 0; i < 100; i++) {
    const z = -30 + rand() * (end + 120)
    const x = -(fairwayHalf(Math.max(0, z)) + 24 + rand() * rand() * 220)
    if (surfaceAt(x, z) !== 'range') trees.push([x, z, 0.8 + rand() * 0.6])
  }
  // Along both edges of the rough: a loose line of trees and bushes.
  for (let z = 12; z < end; z += 18) {
    const e = fairwayHalf(z) + 18
    trees.push([-e - 4 - rand() * 6, z + rand() * 8, 0.9 + rand() * 0.4])
    bushes.push([-e + 2 + rand() * 4, z + rand() * 10, 0.8 + rand() * 0.6])
    bushes.push([e - 2 - rand() * 4, z + rand() * 10, 0.8 + rand() * 0.6])
    if (rand() < 0.6) trees.push([e + 3 + rand() * 6, z + rand() * 8, 0.8 + rand() * 0.4])
  }
  // Right shore and the far beach: palms on the dunes.
  for (let i = 0; i < 46; i++) {
    const far = i % 3 === 0
    const z = far ? end + 26 + rand() * 18 : 10 + rand() * (end + 20)
    const x = far ? (rand() - 0.5) * 2 * (fairwayHalf(end) + 60) : fairwayHalf(z) + 24 + rand() * 18
    if (groundHeight(x, z) > SEA_LEVEL + 0.6) palms.push([x, z, 0.85 + rand() * 0.35, rand() * Math.PI * 2])
  }
  // Flower patches by the tee and along the rough.
  const patch = (x, z, n) => {
    for (let i = 0; i < n; i++) flowers.push([x + (rand() - 0.5) * 5, z + (rand() - 0.5) * 3])
  }
  patch(-6, -3, 22)
  patch(6.5, -2, 22)
  for (let z = 30; z < end; z += 45) {
    patch(-(fairwayHalf(z) + 15), z, 10)
    patch(fairwayHalf(z) + 15, z + 20, 10)
  }
  const treeMesh = instance(scene, treeGeometry(), trees.map(([x, z, s]) => ({ x, z, s, r: rand() * 6 })), ['#ffffff', '#e9ffd9', '#fff4d6', '#dff7ff'])
  instance(scene, palmGeometry(), palms.map(([x, z, s, r]) => ({ x, z, s, r })), ['#ffffff', '#f2ffe6'])
  const bushMesh = instance(scene, bushGeometry(), bushes.map(([x, z, s]) => ({ x, z, s, r: rand() * 6 })), ['#ffffff', '#e8ffe0', '#f0ffd0'])
  const flowerMesh = instance(scene, new THREE.SphereGeometry(0.12, 5, 4), flowers.map(([x, z]) => ({ x, z, s: 0.8 + rand() * 0.6, y: 0.12 })), ['#ff7fae', '#ffe066', '#ffffff', '#c39bff', '#ff9a5a'], new THREE.MeshStandardMaterial({ color: '#ffffff' }))

  // ---- the lighthouse point ----------------------------------------------------------------------
  const point = new THREE.Group()
  point.position.set(fairwayHalf(end) + 95, SEA_LEVEL, -(end + 40))
  point.add(
    merged(
      [
        [0, 0, 0, 9],
        [7, -1, 5, 6],
        [-6, -1, -4, 7],
        [3, -2, -8, 5]
      ].map(([x, y, z, r]) => [at(new THREE.SphereGeometry(1, 14, 10), x, y, z, r, r * 0.45, r), '#b9a48f'])
    )
  )
  const lh = lighthouse()
  lh.position.y = 3.6
  point.add(lh)
  scene.add(point)
  const lamp = lh.userData.lamp

  // Sailboats, bobbing.
  const boats = []
  for (const [x, z, col] of [
    [fairwayHalf(end) + 150, end - 40, '#ff5c8a'],
    [-40, end + 170, '#ffd23f'],
    [fairwayHalf(end) + 60, end + 120, '#2ad1c9']
  ]) {
    const b = sailboat(col)
    b.position.set(x, SEA_LEVEL, -z)
    b.rotation.y = (x * 0.37) % 3
    scene.add(b)
    boats.push(b)
  }

  addClouds(scene)

  // ---- the tee ---------------------------------------------------------------------------------
  const teeBox = new THREE.Mesh(
    grassUVs(new THREE.LatheGeometry([[0, 0.07], [2.55, 0.07], [2.75, 0.04], [2.85, -0.02], [2.9, -0.06]].map(([x, y]) => new THREE.Vector2(x, y)), 40)),
    grassMaterial({ color: COLORS.tee, stripes: true, stripe: 0.9, stripeAngle: Math.PI / 2, patch: 0.05, bump: 0.5, side: THREE.DoubleSide })
  )
  teeBox.position.set(0, 0, 0.4)
  teeBox.receiveShadow = true
  scene.add(teeBox)
  const tee = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.01, 0.06, 8), new THREE.MeshStandardMaterial({ color: '#ffd23f' }))
  tee.position.set(0, 0.09, 0)
  scene.add(tee)
  // Tee markers: two big glossy balls, and a basket of balls.
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), new THREE.MeshStandardMaterial({ color: s < 0 ? '#ff5c8a' : '#2ad1c9', roughness: 0.3 }))
    m.position.set(s * 2.1, 0.15, -1.6)
    m.castShadow = true
    scene.add(m)
  }
  const basket = new THREE.Group()
  basket.add(new THREE.Mesh(new THREE.LatheGeometry([[0.12, 0], [0.24, 0.04], [0.3, 0.24], [0.28, 0.26]].map(([x, y]) => new THREE.Vector2(x, y)), 18), new THREE.MeshStandardMaterial({ color: '#d59a57', side: THREE.DoubleSide })))
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }), 9)
  const d = new THREE.Object3D()
  for (let i = 0; i < 9; i++) {
    d.position.set(Math.cos(i * 2.4) * (i < 6 ? 0.16 : 0.06), 0.22 + (i >= 6 ? 0.06 : 0), Math.sin(i * 2.4) * (i < 6 ? 0.16 : 0.06))
    d.updateMatrix()
    balls.setMatrixAt(i, d.matrix)
  }
  basket.add(balls)
  basket.position.set(1.6, 0.07, 1.2)
  basket.children.forEach((m) => (m.castShadow = true))
  scene.add(basket)

  // ---- target greens -----------------------------------------------------------------------------
  const greens = new THREE.Group()
  scene.add(greens)
  for (const g of TUNING.targets.greens) {
    const grp = new THREE.Group()
    grp.position.set(g.side * YD, 0, -g.yards * YD)
    const rings = TUNING.targets.rings
    const outer = rings[rings.length - 1].r * YD
    // The raised green and its rings: one mesh.
    const parts = [[new THREE.LatheGeometry([[0, 0.08], [outer, 0.08], [outer + 0.6, 0.05], [outer + 1.1, -0.04]].map(([x, y]) => new THREE.Vector2(x, y)), 48), new THREE.Color(g.color).lerp(new THREE.Color('#ffffff'), 0.72)]]
    for (let i = rings.length - 2; i >= 0; i--) {
      parts.push([new THREE.CircleGeometry(rings[i].r * YD, 40).rotateX(-Math.PI / 2).translate(0, 0.09 + (rings.length - i) * 0.006, 0), new THREE.Color(g.color).lerp(new THREE.Color('#ffffff'), i === 0 ? 0 : 0.4)])
    }
    const base = merged(parts, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide }))
    base.receiveShadow = true
    grp.add(base)
    const { group: flagpole, flag } = flagPole(g.color)
    grp.add(flagpole)
    grp.userData = { flag }
    greens.add(grp)
  }

  // ---- the putting green (shown in the putting modes) -------------------------------------------------
  const putting = puttingGreen()
  putting.visible = false
  scene.add(putting)
  // ---- the course's green, at the far end of the range (always there) -------------------------------
  const courseGreen = puttingGreen(HOLE.green)
  scene.add(courseGreen)

  // ---- tufts: grass standing up out of the rough, where the camera is close ----------------------------
  const tuftRand = rng(97)
  const tuftItems = []
  const roughTones = ['#74c04a', '#82c955', '#6bb543', '#8dd05c', '#99d866']
  const tuft = (x, z, s = 1, tones = roughTones) => tuftItems.push({ x, z, y: groundHeight(x, z), s: s * (0.75 + tuftRand() * 0.6), r: tuftRand() * Math.PI, color: tones[Math.floor(tuftRand() * tones.length)] })
  // The rough either side of the fairway, thick near the tee and thinning out downrange.
  for (let i = 0; i < 2600; i++) {
    const z = -6 + Math.pow(tuftRand(), 1.8) * 170
    const side = tuftRand() < 0.5 ? -1 : 1
    const x = side * (fairwayHalf(Math.max(0, z)) + 0.6 + Math.pow(tuftRand(), 1.4) * 17)
    tuft(x, z)
  }
  // Around the tee box and behind it, where the address camera looks.
  for (let i = 0; i < 700; i++) {
    const a = tuftRand() * Math.PI * 2
    const r = 3.1 + Math.pow(tuftRand(), 1.6) * 9
    const x = Math.cos(a) * r
    const z = 0.4 - Math.sin(a) * r
    if (Math.abs(x) < fairwayHalf(Math.max(0, z)) && z > 4) continue // not on the fairway
    tuft(x, z, 0.9)
  }
  // A ring round each target green (its own mesh: hidden with the greens on the course).
  const ringItems = []
  for (const g of TUNING.targets.greens) {
    const outer = TUNING.targets.rings[TUNING.targets.rings.length - 1].r * YD + 1.3
    for (let i = 0; i < 120; i++) {
      const a = tuftRand() * Math.PI * 2
      const r = outer + tuftRand() * 2.2
      const x = g.side * YD + Math.cos(a) * r
      const z = g.yards * YD + Math.sin(a) * r
      ringItems.push({ x, z, y: groundHeight(x, z), s: 1.1 * (0.75 + tuftRand() * 0.6), r: tuftRand() * Math.PI, color: roughTones[Math.floor(tuftRand() * roughTones.length)] })
    }
  }
  const ringTufts = createTufts(ringItems)
  greens.add(ringTufts.mesh)
  // Round the course's green.
  for (let i = 0; i < 500; i++) {
    const G = HOLE.green
    const a = tuftRand() * Math.PI * 2
    const e = 1 + G.fringe * (1.05 + tuftRand() * 1.4)
    tuft(G.x + Math.cos(a) * G.rx * e, G.z + Math.sin(a) * G.rz * e, 1)
  }
  const tufts = createTufts(tuftItems)
  scene.add(tufts.mesh)
  // Round the putting green's fringe (hidden with the green).
  const fringeItems = []
  for (let i = 0; i < 900; i++) {
    const a = tuftRand() * Math.PI * 2
    const e = 1 + GREEN.fringe * (0.95 + tuftRand() * 1.1)
    const x = GREEN.x + Math.cos(a) * GREEN.rx * e
    const z = GREEN.z + Math.sin(a) * GREEN.rz * e
    fringeItems.push({ x, z, y: puttHeight(x, z), s: 0.8 + tuftRand() * 0.5, r: tuftRand() * Math.PI, color: roughTones[i % roughTones.length] })
  }
  const fringeTufts = createTufts(fringeItems)
  putting.add(fringeTufts.mesh)

  let clock = 0
  return {
    greens,
    putting,
    /** The putting modes: show the putting green in front of the tee. */
    setPutting(on) {
      putting.visible = on
    },
    /** The range's target greens and yardage lines: shown on the range, not on the course. */
    setTargets(on) {
      greens.visible = on
      yardLines.visible = on
    },
    /** Light mode (slow machines): drop the small stuff nobody misses. */
    setLight(light) {
      setGrassDetail(!light)
      flowerMesh.visible = !light
      tufts.mesh.visible = !light
      fringeTufts.mesh.visible = !light
      ringTufts.mesh.visible = !light
      bushMesh.visible = !light
      treeMesh.count = light ? Math.ceil(trees.length * 0.6) : trees.length
    },
    /** Animate: flags wave (the lit green glows), boats bob, the lighthouse lamp pulses. */
    update(dt, lit = -1) {
      clock += dt
      tufts.update(dt)
      fringeTufts.update(dt)
      ringTufts.update(dt)
      greens.children.forEach((g, i) => {
        const f = g.userData.flag
        if (!f) return
        f.rotation.y = Math.sin(clock * 2.2 + i) * 0.3
        f.material.emissive.set(lit === i ? '#ffffff' : '#000000')
        f.material.emissiveIntensity = lit === i ? 0.35 + 0.25 * Math.sin(clock * 10) : 0
      })
      boats.forEach((b, i) => {
        b.position.y = SEA_LEVEL + Math.sin(clock * 1.3 + i * 2) * 0.25
        b.rotation.z = Math.sin(clock * 1.1 + i) * 0.05
      })
      lamp.material.emissiveIntensity = 0.8 + 0.4 * Math.sin(clock * 2)
    }
  }
}

// ---- pieces ----------------------------------------------------------------------------------------

/**
 * The putting green (putting.js has its shape): mown stripes, lighter where it's higher, a darker
 * fringe sloping down to the range, a faint 1 m grid that follows the surface, and little arrows
 * pointing downhill (bigger where it's steeper), so the break can be read from the TV.
 */
function puttingGreen(G = GREEN) {
  const group = new THREE.Group()
  const RINGS = 30
  const FR = 6
  const SEG = 96
  const pos = []
  const col = []
  const c = new THREE.Color()
  const stripeA = new THREE.Color('#86e05c')
  const stripeB = new THREE.Color('#79d34f')
  const fringe = new THREE.Color('#5fbd45')
  const lift = 0.012 // just above the range, so the fringe's edge doesn't flicker into it
  const point = (r, k) => {
    const a = (k / SEG) * Math.PI * 2
    const x = G.x + Math.cos(a) * G.rx * r
    const z = G.z + Math.sin(a) * G.rz * r
    return [x, z]
  }
  const ringR = (i) => (i <= RINGS ? i / RINGS : 1 + ((i - RINGS) / FR) * G.fringe)
  const colour = (x, z) => {
    if (greenReach(x, z, G) > 1.001) return c.copy(fringe)
    c.copy(Math.floor((x - G.x) / 1.4) % 2 ? stripeA : stripeB)
    const h = puttHeight(x, z, G) - G.base
    return c.offsetHSL(0, 0, Math.max(-0.08, Math.min(0.08, h * 0.35)))
  }
  const vert = ([x, z]) => {
    pos.push(x, puttHeight(x, z, G) + lift, -z)
    const cc = colour(x, z)
    col.push(cc.r, cc.g, cc.b)
  }
  for (let i = 0; i < RINGS + FR; i++) {
    for (let k = 0; k < SEG; k++) {
      const a = point(ringR(i), k)
      const b = point(ringR(i), k + 1)
      const d = point(ringR(i + 1), k)
      const e = point(ringR(i + 1), k + 1)
      // Two triangles, wound to face up (three.js z is game -z).
      for (const p of [a, d, b, b, d, e]) vert(p)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.computeVertexNormals()
  grassUVs(geo)
  const surface = new THREE.Mesh(geo, grassMaterial({ vertexColors: true, patch: 0.05, bump: 0.35, side: THREE.DoubleSide }))
  surface.receiveShadow = true
  group.add(surface)

  // The grid: lines every metre, each a run of short pieces that follow the surface.
  const lines = []
  const step = 0.25
  const add = (x0, z0, x1, z1) => {
    if (greenReach(x0, z0, G) > 1 || greenReach(x1, z1, G) > 1) return
    lines.push(x0, puttHeight(x0, z0, G) + lift + 0.01, -z0, x1, puttHeight(x1, z1, G) + lift + 0.01, -z1)
  }
  for (let gx = Math.ceil(G.x - G.rx); gx <= G.x + G.rx; gx++) for (let z = G.z - G.rz; z < G.z + G.rz; z += step) add(gx, z, gx, z + step)
  for (let gz = Math.ceil(G.z - G.rz); gz <= G.z + G.rz; gz++) for (let x = G.x - G.rx; x < G.x + G.rx; x += step) add(x, gz, x + step, gz)
  const gridGeo = new THREE.BufferGeometry()
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3))
  group.add(new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, depthWrite: false })))

  // Downhill arrows every 2 m: a little chevron, longer where it's steeper.
  const arrows = []
  for (let x = Math.ceil(G.x - G.rx) + 1; x < G.x + G.rx; x += 2) {
    for (let z = Math.ceil(G.z - G.rz) + 1; z < G.z + G.rz; z += 2) {
      if (greenReach(x, z, G) > 0.9) continue
      const sl = slopeAt(x, z, G)
      if (sl.steep < 0.004) continue
      const dx = -sl.gx / sl.steep
      const dz = -sl.gz / sl.steep
      const len = 0.25 + Math.min(1, sl.steep / 0.05) * 0.45
      const px = -dz * 0.12
      const pz = dx * 0.12
      const tip = [x + dx * len * 0.5, z + dz * len * 0.5]
      const l = [x - dx * len * 0.5 + px, z - dz * len * 0.5 + pz]
      const r = [x - dx * len * 0.5 - px, z - dz * len * 0.5 - pz]
      for (const [ax, az] of [tip, l, r]) arrows.push(ax, puttHeight(ax, az, G) + lift + 0.015, -az)
    }
  }
  const arrowGeo = new THREE.BufferGeometry()
  arrowGeo.setAttribute('position', new THREE.Float32BufferAttribute(arrows, 3))
  group.add(new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide })))
  return group
}

/** Many copies of one vertex-coloured geometry, sitting on the ground, tinted for variety. */
function instance(scene, geo, items, tints, mat = new THREE.MeshStandardMaterial({ vertexColors: true })) {
  const mesh = new THREE.InstancedMesh(geo, mat, items.length)
  const d = new THREE.Object3D()
  const c = new THREE.Color()
  items.forEach((it, i) => {
    d.position.set(it.x, groundHeight(it.x, it.z) + (it.y ?? 0) - 0.1, -it.z)
    d.rotation.set(0, it.r ?? 0, 0)
    d.scale.setScalar(it.s ?? 1)
    d.updateMatrix()
    mesh.setMatrixAt(i, d.matrix)
    mesh.setColorAt(i, c.set(tints[i % tints.length]))
  })
  scene.add(mesh)
  return mesh
}

/** A puffy tree: a short trunk and a crown of soft balls, darker underneath. */
function treeGeometry() {
  const leafLo = new THREE.Color('#2f8f3a')
  const leafHi = new THREE.Color('#7fd65a')
  const leaf = (v) => leafLo.clone().lerp(leafHi, Math.min(1, Math.max(0, (v.y - 3.2) / 4)))
  const trunk = paint(at(new THREE.CylinderGeometry(0.38, 0.6, 4.2, 7), 0, 2.1, 0), '#9b6a3e')
  const crown = [
    [0, 5.4, 0, 2.5],
    [1.7, 4.8, 0.5, 1.8],
    [-1.6, 4.9, -0.4, 1.9],
    [0.3, 6.9, 0.2, 1.8],
    [-0.4, 4.7, 1.5, 1.6],
    [0.6, 4.6, -1.5, 1.6]
  ].map(([x, y, z, r]) => paint(at(new THREE.SphereGeometry(1, 7, 5), x, y, z, r), leaf))
  return mergeGeometries([trunk, ...crown])
}

/** A palm: a curved, ringed trunk and drooping fronds, with coconuts. */
function palmGeometry() {
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.6, 3, 0), new THREE.Vector3(1.8, 6, 0), new THREE.Vector3(3.2, 8.4, 0)])
  const trunk = paint(new THREE.TubeGeometry(curve, 10, 0.32, 6), (v) => new THREE.Color(Math.round(v.y * 2.2) % 2 ? '#b07a45' : '#c48d55'))
  const top = curve.getPoint(1)
  const parts = [trunk]
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    const f = new THREE.SphereGeometry(1, 6, 3)
    f.scale(2.6, 0.13, 0.55).translate(2.2, -0.35, 0)
    f.rotateZ(-0.35 - (i % 2) * 0.15)
    f.rotateY(a)
    f.translate(top.x, top.y, top.z)
    parts.push(paint(f, (v) => new THREE.Color('#2f9e44').lerp(new THREE.Color('#7fd65a'), Math.min(1, Math.max(0, v.y - top.y + 1.2) / 1.4))))
  }
  for (let i = 0; i < 3; i++) parts.push(paint(at(new THREE.SphereGeometry(0.28, 8, 6), top.x + Math.cos(i * 2.1) * 0.35, top.y - 0.35, Math.sin(i * 2.1) * 0.35), '#6b4a2b'))
  return mergeGeometries(parts)
}

function bushGeometry() {
  const leaf = (v) => new THREE.Color('#3a9d3f').lerp(new THREE.Color('#86d95e'), Math.min(1, Math.max(0, v.y / 1.4)))
  return mergeGeometries(
    [
      [0, 0.6, 0, 0.9],
      [0.8, 0.45, 0.2, 0.65],
      [-0.75, 0.45, -0.1, 0.7],
      [0.1, 0.4, 0.75, 0.6]
    ].map(([x, y, z, r]) => paint(at(new THREE.SphereGeometry(1, 6, 4), x, y, z, r), leaf))
  )
}

function flagPole(color) {
  const group = new THREE.Group()
  // A striped pole and a gold knob: one mesh.
  const pole = merged(
    [
      [new THREE.CylinderGeometry(0.13, 0.13, 7, 10, 14).translate(0, 3.5, 0), (v) => new THREE.Color(Math.floor(v.y) % 2 ? color : '#fff8ec')],
      [at(new THREE.SphereGeometry(0.3, 14, 10), 0, 7.2, 0), '#ffd23f']
    ],
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 })
  )
  pole.castShadow = true
  group.add(pole)
  const tri = new THREE.Shape()
  tri.moveTo(0, 0)
  tri.quadraticCurveTo(1.8, 0.2, 3.4, -0.95)
  tri.quadraticCurveTo(1.8, -1.6, 0, -1.9)
  const flag = new THREE.Mesh(new THREE.ShapeGeometry(tri, 8), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, emissive: '#000000' }))
  flag.position.y = 6.9
  group.add(flag)
  return { group, flag }
}

function lighthouse() {
  const g = new THREE.Group()
  const RED = '#e8473f'
  const WHITE = '#fff8ec'
  const bands = 5
  const parts = []
  for (let i = 0; i < bands; i++) {
    const r0 = 2.6 - i * 0.28
    parts.push([new THREE.CylinderGeometry(r0 - 0.28, r0, 3, 20).translate(0, 1.5 + i * 3, 0), i % 2 ? WHITE : RED])
  }
  parts.push([new THREE.CylinderGeometry(1.7, 1.7, 0.35, 20).translate(0, bands * 3 + 0.15, 0), WHITE])
  parts.push([new THREE.ConeGeometry(1.3, 1.5, 20).translate(0, bands * 3 + 2.6, 0), RED])
  parts.push([at(new THREE.SphereGeometry(0.25, 10, 8), 0, bands * 3 + 3.45, 0), RED])
  g.add(merged(parts, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 })))
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 16), new THREE.MeshStandardMaterial({ color: '#fff3b0', emissive: '#ffd84a', emissiveIntensity: 1 }))
  lamp.position.y = bands * 3 + 1.1
  g.add(lamp)
  g.userData.lamp = lamp
  return g
}

function sailboat(color) {
  const g = new THREE.Group()
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  s.lineTo(0, 6)
  s.quadraticCurveTo(1.6, 2.4, 3.4, 0)
  g.add(
    merged(
      [
        [at(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0, 0.6, 0, 1.5, 1, 4.2), '#ffffff'],
        [new THREE.CylinderGeometry(0.1, 0.1, 7, 6).translate(0, 4, 0), '#8a6a4a'],
        [new THREE.ShapeGeometry(s, 6).rotateY(Math.PI / 2).translate(0, 1.2, 0), color]
      ],
      new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide })
    )
  )
  return g
}

/** A rounded wooden board on two posts, with the yardage painted on a cream disc. */
function yardBoard(yd) {
  const cv = document.createElement('canvas')
  cv.width = 256
  cv.height = 160
  const g = cv.getContext('2d')
  g.fillStyle = '#fff4dc'
  g.beginPath()
  g.roundRect(14, 14, 228, 132, 60)
  g.fill()
  g.fillStyle = '#5a3a1e'
  g.font = "900 92px 'Lilita One', 'Arial Rounded MT Bold', sans-serif"
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(String(yd), 128, 86)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  const grp = new THREE.Group()
  // The wooden board and its posts: one mesh; the painted face: another.
  grp.add(
    merged([
      [new RoundedBoxGeometry(5.6, 3.6, 0.35, 3, 0.3).translate(0, 4.4, 0), '#c98b4f'],
      [new THREE.CapsuleGeometry(0.2, 2.6, 4, 8).translate(-1.8, 1.4, 0), '#c98b4f'],
      [new THREE.CapsuleGeometry(0.2, 2.6, 4, 8).translate(1.8, 1.4, 0), '#c98b4f']
    ])
  )
  const face = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.1), new THREE.MeshStandardMaterial({ map: t, transparent: true }))
  face.position.set(0, 4.4, 0.19)
  grp.add(face)
  // Signs face the tee: game -z is three +z, so the painted side is on +z.
  return grp
}

function addClouds(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.4, fog: false })
  const geo = new THREE.SphereGeometry(1, 12, 8)
  const puffs = []
  const rand = rng(5)
  for (let ci = 0; ci < 9; ci++) {
    const x = (rand() - 0.5) * 1600
    const z = -(300 + rand() * 900)
    const y = 110 + rand() * 120
    const n = 4 + Math.floor(rand() * 3)
    for (let i = 0; i < n; i++) puffs.push([x + (i - n / 2) * 26, y + rand() * 14, z + rand() * 20, 22 + rand() * 16])
  }
  const mesh = new THREE.InstancedMesh(geo, mat, puffs.length)
  const d = new THREE.Object3D()
  puffs.forEach(([x, y, z, s], i) => {
    d.position.set(x, y, z)
    d.scale.set(s, s * 0.65, s * 0.8)
    d.updateMatrix()
    mesh.setMatrixAt(i, d.matrix)
  })
  scene.add(mesh)
}

// ---- the resort's props (shared/resort: Meshy models) --------------------------------------------

/** Where the beach huts stand (game space): on the dunes along the right, facing the range. */
const HUT_COLORS = ['#3fcfa6', '#ff8a9a', '#ffd25c', '#6cc3ff', '#b79cff']
/**
 * Load the resort's props and put them in the scene: a row of beach huts on the dunes (one model,
 * recoloured), and rocks along the waterline and by the tee. base: the folder the GLBs are served
 * from. Resolves when they're placed; the scene works without them.
 */
export async function addProps(scene, base) {
  const loader = new GLTFLoader()
  const [hut, rocks] = await Promise.all(['beach-hut', 'rocks'].map((f) => loader.loadAsync(`${base}${f}.glb`)))
  const group = new THREE.Group()
  // Beach huts: 3.4 m tall, every 9 m, their fronts (+z in the model) turned toward the range (-x).
  const hutMesh = firstMesh(hut.scene)
  const hutScale = 3.4 / sizeOf(hut.scene).y
  const end = TUNING.range.length * YD
  let i = 0
  for (let z = 26; z < 130; z += 9.5, i++) {
    const x = fairwayHalf(z) + 18 + 9
    const h = hutMesh.clone()
    h.material = hueShifted(hutMesh.material, 160 / 360, HUT_COLORS[i % HUT_COLORS.length])
    const holder = new THREE.Group()
    holder.add(h)
    holder.scale.setScalar(hutScale)
    holder.position.set(x, groundHeight(x, z) - 0.05, -z)
    holder.rotation.y = -Math.PI / 2 + (i % 2 ? 0.08 : -0.08)
    h.castShadow = true
    h.receiveShadow = true
    group.add(holder)
  }
  // Rocks: one instanced mesh; clusters along the waterline, by the lighthouse point and the tee.
  const rockMesh = firstMesh(rocks.scene)
  const rockSize = sizeOf(rocks.scene).x
  const rand = rng(311)
  const spots = []
  for (let z = 10; z < end; z += 18 + rand() * 20) {
    const x = fairwayHalf(z) + 18 + 30 + rand() * 6
    spots.push([x, z, 2.2 + rand() * 2.2])
  }
  spots.push([-7.5, -5.5, 1.3], [8.5, -7, 1.6], [-fairwayHalf(40) - 14, 40, 2.4])
  const inst = new THREE.InstancedMesh(rockMesh.geometry, rockMesh.material, spots.length)
  const d = new THREE.Object3D()
  spots.forEach(([x, z, w], k) => {
    d.position.set(x, groundHeight(x, z) - 0.15, -z)
    d.rotation.set(0, rand() * Math.PI * 2, 0)
    d.scale.setScalar(w / rockSize)
    d.updateMatrix()
    inst.setMatrixAt(k, d.matrix)
  })
  inst.castShadow = true
  inst.receiveShadow = true
  group.add(inst)
  scene.add(group)
  return group
}

function firstMesh(root) {
  let m = null
  root.traverse((o) => {
    if (o.isMesh && !m) m = o
  })
  m.material = m.material.clone()
  m.material.roughness = 0.8
  m.material.metalness = 0
  return m
}
function sizeOf(root) {
  return new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3())
}

/** A material whose texture's colour near `fromHue` (0–1) is turned into `color`; everything else stays. */
function hueShifted(material, fromHue, color) {
  const m = material.clone()
  const c = new THREE.Color(color)
  const hsl = {}
  c.getHSL(hsl)
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uHue = { value: new THREE.Vector3(fromHue, hsl.h, hsl.s) }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uHue;
vec3 hsRgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 hsHsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 srgb = pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2));
  vec3 hsv = hsRgb2hsv(srgb);
  float w = smoothstep(0.2, 0.35, hsv.y) * (1.0 - smoothstep(0.06, 0.1, abs(fract(hsv.x - uHue.x + 0.5) - 0.5)));
  vec3 shifted = hsHsv2rgb(vec3(uHue.y, hsv.y, hsv.z)); // only the hue changes: pastel stays pastel
  diffuseColor.rgb = mix(diffuseColor.rgb, pow(shifted, vec3(2.2)), w);
}`)
  }
  m.customProgramCacheKey = () => `hue-${fromHue}-${color}`
  return m
}
