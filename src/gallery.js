// Asset gallery (not part of the game: Vite only bundles index.html). One asset alone on a neutral
// ground, lit by the game's own lighting, for the render-and-compare rounds of pushplay-kit's
// model-asset skill:
//   gallery.html?asset=tree|tree-flowering|palm|bush|bush-flowering|lineup
//                &views=front,34,side,top  (side by side)  &t=<s> (the breeze's clock)  &scale=<px per view>
//   gallery.html?asset=bean&anim=cheer|happy|sad|wince&frames=8  (one reaction as a strip of frames)
// Sets document.title = 'ready' once drawn.
import * as THREE from 'three'
import { bushGeometry, palmGeometry, swayMaterial, treeGeometry, wind } from './flora.js'
import { createLighting } from './lighting.js'
import { makeModelBean } from './characters.js'
import { loadBeans } from './beans/beans.js'
import { REACTIONS } from './reactions.js'
import { CREW } from './tuning.js'

const q = new URLSearchParams(location.search)
const asset = q.get('asset') ?? 'lineup'
const views = (q.get('views') ?? '34').split(',')
const px = Number(q.get('scale') ?? 420)
wind.value = Number(q.get('t') ?? 0)

const ASSETS = {
  tree: () => [treeGeometry({ seed: 1 }), swayMaterial({ from: 3, to: 8.5, amp: 0.14 })],
  'tree-flowering': () => [treeGeometry({ seed: 2, flowering: true }), swayMaterial({ from: 3, to: 8.5, amp: 0.14 })],
  palm: () => [palmGeometry(), swayMaterial({ from: 5, to: 9, amp: 0.1, flutter: 0.05, centre: [3.2, 0], side: THREE.DoubleSide })],
  bush: () => [bushGeometry({ seed: 1 }), swayMaterial({ from: 0.3, to: 1.6, amp: 0.03 })],
  'bush-flowering': () => [bushGeometry({ seed: 2, flowering: true }), swayMaterial({ from: 0.3, to: 1.6, amp: 0.03 })]
}

const canvas = document.getElementById('gl')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(1)
renderer.setSize(px * views.length, px, false)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
renderer.setScissorTest(true)
const scene = new THREE.Scene()
scene.background = new THREE.Color('#8a9099')
const lighting = createLighting(renderer, scene, { low: true })
const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#7d848c' }))
ground.receiveShadow = true
scene.add(ground)

async function drawBean() {
  // One bean, facing the camera, stepped through a reaction: frame i of n is at i / (n - 1) of its duration.
  const anim = q.get('anim') ?? 'cheer'
  const n = Number(q.get('frames') ?? 8)
  renderer.setSize(px * n, px, false)
  const kit = await loadBeans('./beans/')
  const bean = makeModelBean(kit, { ...CREW[0], id: 'g' })
  scene.add(bean.root)
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)
  camera.position.set(4.2, 1.1, 0)
  camera.lookAt(0, 0.95, 0)
  const at = { x: 0, y: 0, z: 0, face: -Math.PI / 2 }
  bean.pose({ at, dt: 0 })
  bean.react(anim)
  const step = REACTIONS[anim].duration / (n - 1)
  for (let i = 0; i < n; i++) {
    bean.pose({ at, dt: i === 0 ? 0 : step, face: 'idle' })
    lighting.update({ x: 0, z: 0 }, camera)
    renderer.setViewport(i * px, 0, px, px)
    renderer.setScissor(i * px, 0, px, px)
    renderer.render(scene, camera)
  }
}

function drawFlora() {
  const names = asset === 'lineup' ? Object.keys(ASSETS) : [asset]
  const group = new THREE.Group()
  names.forEach((n, i) => {
    const [geo, mat] = ASSETS[n]()
    const m = new THREE.Mesh(geo, mat)
    m.castShadow = m.receiveShadow = true
    m.position.x = (i - (names.length - 1) / 2) * 11
    group.add(m)
  })
  scene.add(group)
  const box = new THREE.Box3().setFromObject(group)
  const centre = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const r = Math.max(size.x, size.y, size.z) * 0.62

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 500)
  const dirs = { front: [0, 0.15, 1], 34: [0.75, 0.35, 0.75], side: [1, 0.15, 0], top: [0, 1, 0.02], back: [0, 0.15, -1] }
  views.forEach((v, i) => {
    const d = new THREE.Vector3(...(dirs[v] ?? dirs[34])).normalize()
    camera.position.copy(centre).addScaledVector(d, r / Math.tan(THREE.MathUtils.degToRad(16)))
    camera.lookAt(centre)
    lighting.update({ x: centre.x, z: -centre.z }, camera)
    renderer.setViewport(i * px, 0, px, px)
    renderer.setScissor(i * px, 0, px, px)
    renderer.render(scene, camera)
  })
}

if (asset === 'bean') await drawBean()
else drawFlora()
document.title = 'ready'
