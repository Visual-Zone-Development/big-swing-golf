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
import { fairwayHalf, groundHeight, landHeight, lieAt, SEA_LEVEL, surfaceAt } from './terrain.js'
import { APRON, FAIRWAY_HALF, ellipseReach, HOLES, trapOutline } from './course.js'
import { COAST, HILLS, shoreDistance } from './links.js'
import { GREEN, greenReach, puttHeight, slopeAt } from './putting.js'
import { createTufts, grassMaterial, grassUVs, setGrassDetail } from './grass.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createSea } from './sea.js'
import { createGulls } from './gulls.js'
import { clothMaterial, pennantGeometry } from './cloth.js'
import { bushGeometry, lodInstances, palmGeometry, swayMaterial, treeGeometry, wind } from './flora.js'

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
  // The range: one mesh from 60 m behind the tee to well past the beach, coloured by what it is.
  // The course, south of it: another, a little finer (its coast has a bay and a headland).
  scene.add(landMesh(820, 820, 110, 110, 0, 350))
  scene.add(landMesh(1000, 762, 200, 152, 0, -439))

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
  // The range's yardage boards: measured from the range's tee, so hidden on the course.
  const boards = new THREE.Group()
  scene.add(boards)
  for (let yd = 50; yd <= 250; yd += 50) {
    const z = yd * YD
    lines.push(new THREE.PlaneGeometry(fairwayHalf(z) * 2 - 4, 0.45).rotateX(-Math.PI / 2).translate(0, 0.02, -z))
    for (const side of [-1, 1]) {
      const board = yardBoard(yd)
      board.position.set(side * (fairwayHalf(z) + 7), 0, -z)
      board.rotation.y = -side * 0.35
      boards.add(board)
    }
  }
  const yardLines = new THREE.Mesh(mergeGeometries(lines), lineMat)
  scene.add(yardLines)

  // ---- sea ---------------------------------------------------------------------------------------
  // sea.js: clear over the sand, deep offshore, foam lapping at the waterline, glinting waves.
  const sea = createSea()
  scene.add(sea.mesh)
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
  // Trees: one in five is in flower (the coral accent); bushes likewise. Palms sway and flutter.
  // Each kind has a detailed and a cheap version (flora.js): only what's near the camera is detailed.
  const placed = (list, f) => list.map(([x, z, sc, r]) => ({ x, y: groundHeight(x, z) - 0.1, z: -z, s: sc, r: r ?? rand() * 6 })).filter(f ?? (() => true))
  const treeMat = swayMaterial({ from: 3, to: 8.5, amp: 0.14 })
  const isFlowering = (_, i) => i % 5 === 2
  const bushMat = swayMaterial({ from: 0.3, to: 1.6, amp: 0.03 })
  const palmMat = swayMaterial({ from: 5, to: 9, amp: 0.1, flutter: 0.05, centre: [3.2, 0], side: THREE.DoubleSide })
  const flora = [
    lodInstances(scene, { items: placed(trees, (t, i) => !isFlowering(t, i)), hi: treeGeometry({ seed: 1 }), lo: treeGeometry({ seed: 1, detail: 'low' }), mat: treeMat, tints: ['#ffffff', '#ecffdf', '#fff6dc', '#e2f7ff'], lightShare: 0.6 }),
    lodInstances(scene, { items: placed(trees, isFlowering), hi: treeGeometry({ seed: 2, flowering: true }), lo: treeGeometry({ seed: 2, flowering: true, detail: 'low' }), mat: treeMat, tints: ['#ffffff', '#f4ffe8'], lightShare: 0.6 }),
    lodInstances(scene, {
      items: placed(palms),
      hi: palmGeometry(),
      lo: palmGeometry({ detail: 'low' }),
      mat: palmMat,
      tints: ['#ffffff', '#f2ffe6', '#fffbe8']
    }),
    lodInstances(scene, { items: placed(bushes, (b, i) => i % 3 !== 1), hi: bushGeometry({ seed: 1 }), lo: bushGeometry({ seed: 1, detail: 'low' }), mat: bushMat, tints: ['#ffffff', '#ecffe4', '#f4ffd8'], near: 45, lightShare: 0 }),
    lodInstances(scene, { items: placed(bushes, (b, i) => i % 3 === 1), hi: bushGeometry({ seed: 2, flowering: true }), lo: bushGeometry({ seed: 2, flowering: true, detail: 'low' }), mat: bushMat, tints: ['#ffffff', '#f2ffe4'], near: 45, lightShare: 0 })
  ]
  flora.forEach((f) => f.update(null))
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

  const clouds = addClouds(scene)
  // Gulls wheeling over the beach and the far shore.
  const gulls = createGulls(scene, [
    { x: fairwayHalf(60) + 70, z: 60, y: 22, r: 22 },
    { x: fairwayHalf(90) + 85, z: 95, y: 27, r: 30 },
    { x: fairwayHalf(140) + 75, z: 140, y: 19, r: 18 },
    { x: fairwayHalf(end) + 40, z: end + 60, y: 30, r: 34 },
    { x: -30, z: end + 90, y: 26, r: 26 }
  ])

  // ---- the course: its fairways, traps, trees and buildings -----------------------------------------
  // The course's own trees, palms and bushes share the range's materials, detail levels and breeze.
  flora.push(...courseScenery(scene, { treeMat, bushMat, palmMat }))

  // ---- the tee ---------------------------------------------------------------------------------
  // One at the range's tee and at every hole's: a rounded mown box, a tee peg and two big glossy
  // ball markers.
  const teeGeo = grassUVs(new THREE.LatheGeometry([[0, 0.07], [2.55, 0.07], [2.75, 0.04], [2.85, -0.02], [2.9, -0.06]].map(([x, y]) => new THREE.Vector2(x, y)), 40))
  const teeMat = grassMaterial({ color: COLORS.tee, stripes: true, stripe: 0.9, stripeAngle: Math.PI / 2, patch: 0.05, bump: 0.5, side: THREE.DoubleSide })
  const pegMat = new THREE.MeshStandardMaterial({ color: '#ffd23f' })
  for (const { tee: at, cup } of [{ tee: { x: 0, z: 0 }, cup: { x: 0, z: 100 } }, ...HOLES]) {
    // Turned to face its pin (three.js puts game z at -z).
    const box = new THREE.Group()
    box.position.set(at.x, 0, -at.z)
    box.rotation.y = -Math.atan2(cup.x - at.x, cup.z - at.z)
    scene.add(box)
    const teeBox = new THREE.Mesh(teeGeo, teeMat)
    teeBox.position.set(0, 0, 0.4)
    teeBox.receiveShadow = true
    const tee = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.01, 0.06, 8), pegMat)
    tee.position.set(0, 0.09, 0)
    box.add(teeBox, tee)
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), new THREE.MeshStandardMaterial({ color: s < 0 ? '#ff5c8a' : '#2ad1c9', roughness: 0.3 }))
      m.position.set(s * 2.1, 0.15, -1.6)
      m.castShadow = true
      box.add(m)
    }
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
  // ---- the course's greens (always there) --------------------------------------------------------------
  for (const hole of HOLES) scene.add(puttingGreen(hole.green))

  // ---- tufts: grass standing up out of the rough, where the camera is close ----------------------------
  const tuftRand = rng(97)
  const tuftItems = []
  const roughTones = ['#74c04a', '#82c955', '#6bb543', '#8dd05c', '#99d866']
  // No tufts on the course's greens or their fringes, or on a tee box.
  const mown = (x, z) => HOLES.some((h) => greenReach(x, z, h.green) < 1 + h.green.fringe * 1.05 || Math.hypot(x - h.tee.x, z - h.tee.z) < 3.6 || [...h.sand, ...h.water].some((e) => ellipseReach(x, z, e) < 1.12))
  const tuft = (x, z, s = 1, tones = roughTones) => !mown(x, z) && tuftItems.push({ x, z, y: groundHeight(x, z), s: s * (0.75 + tuftRand() * 0.6), r: tuftRand() * Math.PI, color: tones[Math.floor(tuftRand() * tones.length)] })
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
  // Round each of the course's greens.
  for (let i = 0; i < 500 * HOLES.length; i++) {
    const G = HOLES[i % HOLES.length].green
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
      flora.forEach((f) => f.setLight(light)) // fewer trees, no bushes, all of them the cheap version
    },
    /** Animate (camera: its position, for the trees' detail): the breeze (trees, palms, flags), the sea, boats bob, the lit green's flag glows, the lighthouse lamp pulses. */
    update(dt, lit = -1, camera = null) {
      clock += dt
      flora.forEach((f) => f.update(camera))
      wind.value = clock
      sea.update(dt)
      clouds.update(clock)
      gulls.update(dt)
      tufts.update(dt)
      fringeTufts.update(dt)
      ringTufts.update(dt)
      greens.children.forEach((g, i) => {
        const f = g.userData.flag
        if (!f) return
        f.rotation.y = Math.sin(clock * 0.6 + i) * 0.15 // the breeze veers a little
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
 * A big piece of ground, w × d metres centred on game (cx, cz), coloured by what it is: grass,
 * the hills by their height, sand, the wet edge, and the seabed fading into the sea's blue.
 */
function landMesh(w, d, sw, sd, cx, cz) {
  const land = new THREE.PlaneGeometry(w, d, sw, sd)
  land.rotateX(-Math.PI / 2) // now x right, y up, z toward the camera (three space)
  const pos = land.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  const lo = new THREE.Color(COLORS.hillLow)
  const hi = new THREE.Color(COLORS.hillHigh)
  const deep = new THREE.Color(COLORS.sea)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx
    const z = cz - pos.getZ(i)
    pos.setX(i, x)
    pos.setZ(i, -z)
    const h = landHeight(x, z)
    pos.setY(i, h)
    const s = surfaceAt(x, z)
    if (s === 'range') c.set(COLORS.rough)
    else if (s === 'hill') c.copy(lo).lerp(hi, Math.min(1, Math.max(0, h / 22)))
    else if (h > SEA_LEVEL + 0.35) c.set(h < SEA_LEVEL + 0.9 ? COLORS.wetSand : COLORS.sand)
    else if (h > SEA_LEVEL - 0.05) c.set(COLORS.wetSand) // the sea's own foam laps over this
    else c.set(COLORS.seabed).lerp(deep, Math.min(1, (SEA_LEVEL - h) / 3))
    // A little variation so big areas don't look flat.
    const n = 1 + 0.04 * Math.sin(x * 0.31) * Math.sin(z * 0.27)
    colors.set([c.r * n, c.g * n, c.b * n], i * 3)
  }
  land.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  land.computeVertexNormals()
  grassUVs(land)
  const ground = new THREE.Mesh(land, grassMaterial({ vertexColors: true, patch: 0.26 }))
  ground.receiveShadow = true
  return ground
}

/** A flat ellipse lying on the ground at height y (game space; rot in degrees, +x toward +z). */
function groundEllipse(e, y, grow = 0, segments = 40) {
  const g = new THREE.CircleGeometry(1, segments).rotateX(-Math.PI / 2)
  g.scale(e.rx + grow, 1, e.rz + grow)
  g.rotateY(((e.rot ?? 0) * Math.PI) / 180)
  return g.translate(e.x, y, -e.z)
}

/** The inside of a trap, flat at height y: a fan out to its irregular edge, with UVs in metres. */
function trapFill(e, y) {
  const edge = trapOutline(e, 72)
  const pos = []
  const uv = []
  const put = (p) => {
    pos.push(p.x, y, -p.z)
    uv.push(p.x / 5, p.z / 5)
  }
  edge.forEach((p, i) => {
    const q = edge[(i + 1) % edge.length]
    // Wound so it faces up (the outline runs clockwise seen from above once game z is three −z).
    put(e)
    put(p)
    put(q)
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

/**
 * A band round a trap's edge, shaped by rows from the inside out: each { grow (m out from the
 * edge), y (height), color }. Painted per row, so it shades from sand up into grass.
 */
function trapLip(e, rows) {
  const n = 72
  const loops = rows.map((r) => trapOutline(e, n, r.grow))
  const pos = []
  const col = []
  const c = new THREE.Color()
  const put = (k, i) => {
    const p = loops[k][i % n]
    pos.push(p.x, rows[k].y, -p.z)
    c.set(rows[k].color)
    col.push(c.r, c.g, c.b)
  }
  for (let k = 0; k + 1 < rows.length; k++) {
    for (let i = 0; i < n; i++) {
      put(k, i)
      put(k + 1, i)
      put(k, i + 1)
      put(k + 1, i)
      put(k + 1, i + 1)
      put(k, i + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2))
  g.computeVertexNormals()
  return g
}

/** Raked sand: a warm speckle with soft curved rake lines, tiling every 5 m. */
function sandTexture() {
  const size = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const g = cv.getContext('2d')
  g.fillStyle = COLORS.sand
  g.fillRect(0, 0, size, size)
  const rand = rng(7)
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(255,250,225,0.5)' : 'rgba(196,160,96,0.35)'
    g.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2)
  }
  // Rake lines: gentle waves across, a light ridge beside a darker groove; they wrap at the edges.
  for (let y = 4; y < size; y += 16) {
    for (const [dy, style] of [[0, 'rgba(176,140,82,0.42)'], [3, 'rgba(255,248,220,0.5)']]) {
      g.strokeStyle = style
      g.lineWidth = 2.2
      g.beginPath()
      for (let x = 0; x <= size; x += 4) g.lineTo(x, y + dy + Math.sin((x / size) * Math.PI * 4) * 4)
      g.stroke()
    }
  }
  const t = new THREE.CanvasTexture(cv)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/**
 * The course's own scenery, on its ground south of the range (links.js): mown fairways and
 * aprons, bunkers and beaches, the pond, trees on the hills and down the third hole's valley,
 * palms along the shore, the lighthouse on the headland and the clubhouse.
 */
function courseScenery(scene, mats) {
  const rand = rng(53)
  // Fairways: a ribbon along each hole's line, round at the ends and the bend; an apron round each green.
  const mownParts = []
  for (const h of HOLES) {
    for (let i = 0; i + 1 < h.fairway.length; i++) {
      const a = h.fairway[i]
      const b = h.fairway[i + 1]
      const len = Math.hypot(b.x - a.x, b.z - a.z)
      const strip = new THREE.PlaneGeometry(FAIRWAY_HALF * 2, len).rotateX(-Math.PI / 2)
      // The strip runs along three −z (game +z); turn it onto the line from a to b.
      strip.rotateY(-Math.atan2(b.x - a.x, b.z - a.z))
      mownParts.push(strip.translate((a.x + b.x) / 2, 0.012, -(a.z + b.z) / 2))
    }
    for (const p of h.fairway) mownParts.push(groundEllipse({ x: p.x, z: p.z, rx: FAIRWAY_HALF, rz: FAIRWAY_HALF }, 0.012))
    mownParts.push(groundEllipse({ x: h.green.x, z: h.green.z, rx: h.green.rx * APRON, rz: h.green.rz * APRON }, 0.012))
  }
  const mownGeo = mergeGeometries(mownParts.map((g) => g.toNonIndexed()))
  grassUVs(mownGeo)
  const mown = new THREE.Mesh(mownGeo, grassMaterial({ color: COLORS.fairway, stripes: true, stripe: 9, patch: 0.14, bump: 0.6 }))
  mown.receiveShadow = true
  scene.add(mown)

  // Bunkers: an irregular pool of raked sand with a raised grass lip round it, so it reads as a
  // hollow from any side. Ponds: the same shape of water inside a low bank.
  const sandParts = []
  const lipParts = []
  const waterParts = []
  for (const h of HOLES) {
    for (const e of h.sand) {
      sandParts.push(trapFill(e, 0.05))
      lipParts.push(trapLip(e, [
        { grow: 0, y: 0.05, color: '#d8bd78' }, // the sand's shaded face
        { grow: 0.3, y: 0.3, color: '#e9d596' },
        { grow: 0.55, y: 0.42, color: '#63b83f' }, // the crest of the lip, in grass
        { grow: 1.1, y: 0.26, color: '#58ad3a' },
        { grow: 2, y: 0.012, color: COLORS.rough }
      ]))
    }
    for (const e of h.water) {
      waterParts.push(trapFill(e, 0.04))
      lipParts.push(trapLip(e, [
        { grow: -0.5, y: 0.05, color: '#3f7f4a' }, // reeds' green at the water's edge
        { grow: 0.25, y: 0.16, color: '#4f9c3c' },
        { grow: 1.5, y: 0.012, color: COLORS.rough }
      ]))
    }
  }
  const flat = (parts, mat) => {
    if (!parts.length) return
    const m = new THREE.Mesh(mergeGeometries(parts), mat)
    m.receiveShadow = true
    scene.add(m)
  }
  flat(sandParts, new THREE.MeshStandardMaterial({ color: '#ffffff', map: sandTexture(), roughness: 1 }))
  flat(lipParts, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }))
  flat(waterParts, new THREE.MeshStandardMaterial({ color: COLORS.sea, roughness: 0.12, metalness: 0.05 }))

  // Trees: thick on the hills, a loose line down each side of the third hole's valley, a few
  // elsewhere. Palms along the shore. Nothing on the mown ground or in a trap.
  const clear = (x, z, room) => ['rough', 'hill'].includes(lieAt(x, z)) && HOLES.every((h) => greenReach(x, z, h.green) > APRON + 0.5 && Math.hypot(x - h.tee.x, z - h.tee.z) > room && [...h.sand, ...h.water].every((e) => ellipseReach(x, z, e) > 1.5))
  const trees = []
  const palms = []
  const bushes = []
  for (const m of HILLS) {
    const n = Math.round((m.rx * m.rz) / 120)
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2
      const r = Math.sqrt(rand()) * 0.95
      const [x, z] = [m.x + Math.cos(a) * m.rx * r, m.z + Math.sin(a) * m.rz * r]
      if (clear(x, z, 9)) trees.push([x, z, 0.9 + rand() * 0.7])
    }
  }
  const third = HOLES[2].fairway
  for (let i = 0; i + 1 < third.length; i++) {
    const a = third[i]
    const b = third[i + 1]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    const [nx, nz] = [(b.z - a.z) / len, -(b.x - a.x) / len]
    for (let d = 8; d < len; d += 13) {
      for (const side of [-1, 1]) {
        const off = side * (FAIRWAY_HALF + 6 + rand() * 7)
        const [x, z] = [a.x + ((b.x - a.x) * d) / len + nx * off, a.z + ((b.z - a.z) * d) / len + nz * off]
        if (clear(x, z, 9)) trees.push([x, z, 1 + rand() * 0.5])
        if (rand() < 0.5 && clear(x + nx * side * 5, z + nz * side * 5, 9)) bushes.push([x + nx * side * 5, z + nz * side * 5, 0.8 + rand() * 0.6])
      }
    }
  }
  // Far hills to the west and south: scattered trees closing the view.
  for (let i = 0; i < 160; i++) {
    const [x, z] = [-520 + rand() * 520, -760 + rand() * 660]
    if ((x < -240 || z < -480) && clear(x, z, 9) && shoreDistance(x, z) > 30) trees.push([x, z, 0.9 + rand() * 0.8])
  }
  // Palms a little inland of the shore, from the range's end of the bay round the headland and down the cliff.
  for (let i = 0; i + 1 < COAST.length - 2; i++) {
    const [ax, az] = COAST[i]
    const [bx, bz] = COAST[i + 1]
    const len = Math.hypot(bx - ax, bz - az)
    for (let d = rand() * 14; d < len; d += 14 + rand() * 16) {
      // Inland is to the right of the shore's direction (north to south, land to the west).
      const off = 12 + rand() * 9
      const [x, z] = [ax + ((bx - ax) * d) / len + ((bz - az) / len) * off, az + ((bz - az) * d) / len - ((bx - ax) / len) * off]
      if (shoreDistance(x, z) > 9 && clear(x, z, 9)) palms.push([x, z, 0.85 + rand() * 0.35, rand() * Math.PI * 2])
    }
  }
  // Detailed near the camera, cheap further away (flora.js); one in five trees and bushes in flower.
  const placed = (list, f) => list.map(([x, z, sc, r]) => ({ x, y: groundHeight(x, z) - 0.1, z: -z, s: sc, r: r ?? rand() * 6 })).filter(f ?? (() => true))
  const flowering = (_, i) => i % 5 === 2
  const flora = [
    lodInstances(scene, { items: placed(trees, (t, i) => !flowering(t, i)), hi: treeGeometry({ seed: 3 }), lo: treeGeometry({ seed: 3, detail: 'low' }), mat: mats.treeMat, tints: ['#ffffff', '#ecffdf', '#fff6dc', '#e2f7ff'], lightShare: 0.6 }),
    lodInstances(scene, { items: placed(trees, flowering), hi: treeGeometry({ seed: 2, flowering: true }), lo: treeGeometry({ seed: 2, flowering: true, detail: 'low' }), mat: mats.treeMat, tints: ['#ffffff', '#f4ffe8'], lightShare: 0.6 }),
    lodInstances(scene, { items: placed(palms), hi: palmGeometry(), lo: palmGeometry({ detail: 'low' }), mat: mats.palmMat, tints: ['#ffffff', '#f2ffe6', '#fffbe8'] }),
    lodInstances(scene, { items: placed(bushes, (b, i) => i % 3 !== 1), hi: bushGeometry({ seed: 1 }), lo: bushGeometry({ seed: 1, detail: 'low' }), mat: mats.bushMat, tints: ['#ffffff', '#ecffe4', '#f4ffd8'], near: 45, lightShare: 0 }),
    lodInstances(scene, { items: placed(bushes, (b, i) => i % 3 === 1), hi: bushGeometry({ seed: 2, flowering: true }), lo: bushGeometry({ seed: 2, flowering: true, detail: 'low' }), mat: mats.bushMat, tints: ['#ffffff', '#f2ffe4'], near: 45, lightShare: 0 })
  ]
  flora.forEach((f) => f.update(null))

  // The lighthouse on the headland's tip, on a low rocky base.
  const tip = new THREE.Group()
  tip.position.set(203, 0, 236)
  tip.add(merged([[0, 0, 0, 7], [5, -0.4, 3, 4.5], [-4, -0.4, -3, 5]].map(([x, y, z, r]) => [at(new THREE.SphereGeometry(1, 14, 10), x, y, z, r, r * 0.3, r), '#b9a48f'])))
  const lh = lighthouse()
  lh.position.y = 1.6
  tip.add(lh)
  scene.add(tip)

  // The clubhouse, south-west of the first tee: cream walls, a terracotta roof, a veranda.
  const house = new THREE.Group()
  house.position.set(-140, 0, 398)
  house.rotation.y = -0.5
  house.add(
    merged([
      [new THREE.BoxGeometry(20, 5, 11).translate(0, 2.5, 0), '#fff4dc'],
      [new THREE.CylinderGeometry(0.1, 9.2, 5, 4, 1).rotateY(Math.PI / 4).scale(1.75, 1, 1).translate(0, 7.4, 0), '#e8703f'],
      [new THREE.BoxGeometry(22, 0.35, 4).translate(0, 3.6, 7.2), '#e8703f'],
      ...[-9, -3, 3, 9].map((x) => [new THREE.CylinderGeometry(0.22, 0.22, 3.6, 8).translate(x, 1.8, 8.8), '#fff8ec']),
      [new THREE.BoxGeometry(2.2, 3.4, 0.2).translate(0, 1.7, 5.6), '#2a6fb0'],
      ...[-6.5, 6.5].map((x) => [new THREE.BoxGeometry(3, 1.8, 0.2).translate(x, 2.9, 5.6), '#9fd8ff'])
    ])
  )
  house.traverse((o) => {
    o.castShadow = true
    o.receiveShadow = true
  })
  scene.add(house)
  return flora
}

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
  // A cloth pennant (cloth.js): it ripples from the pole to the tip.
  const flag = new THREE.Mesh(pennantGeometry(3.4, 1.9), clothMaterial({ color, emissive: '#000000' }, 3.4))
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

/** Puffy clouds, drifting slowly across the sky; each one shrinks away at the edge of the sky before it wraps round. */
function addClouds(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.4, fog: false })
  const geo = new THREE.SphereGeometry(1, 12, 8)
  const puffs = []
  const clouds = []
  const rand = rng(5)
  for (let ci = 0; ci < 9; ci++) {
    const x = (rand() - 0.5) * 1600
    const z = -(300 + rand() * 900)
    const y = 110 + rand() * 120
    const n = 4 + Math.floor(rand() * 3)
    clouds.push({ x, speed: 1.2 + rand() * 1.4 })
    for (let i = 0; i < n; i++) puffs.push({ cloud: ci, dx: (i - n / 2) * 26, y: y + rand() * 14, z: z + rand() * 20, s: 22 + rand() * 16 })
  }
  const mesh = new THREE.InstancedMesh(geo, mat, puffs.length)
  mesh.frustumCulled = false
  const d = new THREE.Object3D()
  const EDGE = 900
  const place = (t) => {
    puffs.forEach((p, i) => {
      const c = clouds[p.cloud]
      const cx = ((((c.x + t * c.speed + EDGE) % (2 * EDGE)) + 2 * EDGE) % (2 * EDGE)) - EDGE
      const k = 1 - THREE.MathUtils.smoothstep(Math.abs(cx), EDGE - 160, EDGE)
      d.position.set(cx + p.dx, p.y, p.z)
      d.scale.set(p.s * k + 1e-3, p.s * 0.65 * k + 1e-3, p.s * 0.8 * k + 1e-3)
      d.updateMatrix()
      mesh.setMatrixAt(i, d.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }
  place(0)
  scene.add(mesh)
  return { update: place }
}

// ---- the resort's props (shared/resort: Meshy models) --------------------------------------------

/** Where the beach huts stand (game space): on the dunes along the right, facing the range. */
/** The huts behind the course's second green: [x, z, turn (radians: 0 faces three +z, game −z)]. */
const COURSE_HUTS = [
  [10, -128, 0.25],
  [22, -124, 0],
  [34, -125, -0.25]
]
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
  // And three behind the second hole's green on the course, facing it across the beach.
  for (const [x, z, turn] of COURSE_HUTS) {
    const h = hutMesh.clone()
    h.material = hueShifted(hutMesh.material, 160 / 360, HUT_COLORS[i++ % HUT_COLORS.length])
    const holder = new THREE.Group()
    holder.add(h)
    holder.scale.setScalar(hutScale)
    holder.position.set(x, groundHeight(x, z) - 0.05, -z)
    holder.rotation.y = turn
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
