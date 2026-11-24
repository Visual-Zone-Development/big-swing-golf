// The bean crew, from the Meshy models in ./models (see README.md). Shared asset: games copy this
// folder; they don't import it from here.
//
//   const kit = await loadBeans('./beans/')            // the GLBs, once
//   const bean = kit.make({ color: '#ff5c8a', outfit: { hat: 'shark', top: 'polo', acc: 'lei' } })
//   scene.add(bean.root)
//   bean.face('cheer', blink, dt)                      // FACES in faces.js; eases into it
//   bean.gaze(worldPoint)                              // the eyes follow a point (null: ahead)
//   bean.dress({ hat: 'bucket' })                      // any slot; 'none' takes it off
//   bean.reach(leftTarget, rightTarget)                // hands to two points (world space), or null to rest
//
// The bean faces -z, feet at y = 0, about 1.45 m tall. One model serves every player: its orange
// is shifted to the player's colour in the shader, so the white gloves and shoes stay white. The
// face is real 3D eyes (eyeballs, pupils that look at things, lids that blink, squint and smile,
// brows that tilt: EXPRESSIONS) over a painted mouth decal, easing from one expression to the
// next. Hats and extras are separate models
// fitted to the head (PROPS); tops are a layer cut from the bean's own body, so they fit and
// move with it (TOPS).
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js'
import { BLINKS, FACES, paintFace } from './faces.js'

export { FACES }
export const HEIGHT = 1.45
/** The model's own orange (measured from its texture, sRGB): what the tint replaces. */
const BASE_ORANGE = { h: 25 / 360, s: 0.965, v: 0.992 }

/**
 * How each prop sits on the bean (bean space: +z is the bean's front before it's turned to face
 * -z, y up from the feet): width (m) across, where its bottom goes (y), forward (z), a turn
 * (radians about y) and a tilt (about x).
 */
export const PROPS = {
  bucket: { file: 'bucket-hat', slot: 'hat', width: 0.74, bottom: 1.25, z: -0.01, turn: 0, tilt: 0 },
  shark: { file: 'shark-cap', slot: 'hat', width: 0.62, bottom: 1.22, z: 0.03, turn: 0, tilt: 0 },
  lei: { file: 'lei', slot: 'acc', width: 0.8, bottom: 0.76, z: 0.03, turn: 0, tilt: 0.28 },
  snorkel: { file: 'snorkel-mask', slot: 'acc', width: 0.56, bottom: 1.1, z: 0.1, turn: 0, tilt: -0.15 }
}

/** Tops: cut from the body between two heights, with short sleeves: a white polo, or a print. */
export const TOPS = {
  polo: { from: 0.4, to: 0.9, sleeves: 0.8 },
  hawaiian: { from: 0.4, to: 0.9, sleeves: 0.8, print: true }
}

/** Load the models (base: the folder URL the GLBs are served from, ending in /). */
export async function loadBeans(base) {
  const loader = new GLTFLoader()
  const files = ['bean', ...new Set(Object.values(PROPS).map((p) => p.file))]
  const loaded = await Promise.all(files.map((f) => loader.loadAsync(`${base}${f}.glb`)))
  const gltf = Object.fromEntries(files.map((f, i) => [f, loaded[i]]))
  const props = Object.fromEntries(Object.entries(PROPS).map(([id, p]) => [id, fitProp(gltf[p.file].scene, p)]))
  return {
    /** A new bean: def { color, outfit }. */
    make: (def) => makeBean(gltf.bean.scene, props, def)
  }
}

/** A prop scaled and placed in bean space, ready to clone. */
function fitProp(scene, p) {
  const g = new THREE.Group()
  const inner = scene.clone(true)
  inner.rotation.set(p.tilt, p.turn, 0)
  inner.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(inner)
  const size = box.getSize(new THREE.Vector3())
  const k = p.width / Math.max(size.x, 1e-6)
  inner.scale.setScalar(k)
  inner.updateMatrixWorld(true)
  box.setFromObject(inner)
  const c = box.getCenter(new THREE.Vector3())
  inner.position.set(-c.x, p.bottom - box.min.y, p.z - c.z)
  g.add(inner)
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true
      o.material = o.material.clone()
      o.material.roughness = 0.7
      o.material.metalness = 0
    }
  })
  return g
}

function makeBean(source, props, def) {
  const root = new THREE.Group() // faces -z
  const model = cloneSkinned(source)
  root.add(model)
  let body = null
  model.traverse((o) => {
    if (o.isSkinnedMesh && !body) body = o
    if (o.isMesh) {
      o.castShadow = true
      o.frustumCulled = false // skinned: the bounds don't follow the arms
    }
  })
  body.material = tinted(body.material, def.color)
  const bones = {}
  body.skeleton.bones.forEach((b) => (bones[b.name] = b))
  const rest = new Map(body.skeleton.bones.map((b) => [b, { q: b.quaternion.clone(), s: b.scale.clone() }]))
  root.updateMatrixWorld(true)

  // The face: 3D eyes and brows, and a decal on the front for the mouth, cheeks and extras.
  const eyes = buildEyes(body, def.color)
  model.add(eyes.group)
  const faceCanvas = document.createElement('canvas')
  faceCanvas.width = faceCanvas.height = 512
  const fctx = faceCanvas.getContext('2d')
  const faceTex = new THREE.CanvasTexture(faceCanvas)
  faceTex.colorSpace = THREE.SRGBColorSpace
  const decal = faceDecal(body, faceTex)
  body.parent.add(decal)

  // Outfits: props hang off the model (bean space); tops are cut from the body.
  const worn = { hat: null, top: null, acc: null }
  const look = { hat: 'none', top: 'none', acc: 'none', face: 'idle' }
  const pieces = {}
  for (const [id, p] of Object.entries(props)) {
    const g = p.clone(true)
    g.visible = false
    model.add(g)
    pieces[id] = g
  }
  for (const [id, t] of Object.entries(TOPS)) {
    const top = topLayer(body, t, def.color)
    top.visible = false
    body.parent.add(top)
    pieces[id] = top
  }
  model.rotation.y = Math.PI // Meshy's front is +z; ours is -z. (Turned after the decal is projected.)

  let painted = ''
  function face(kind = 'idle', blink = false, dt = 1 / 60) {
    const k = FACES.includes(kind) ? kind : 'idle'
    look.face = k
    eyes.set(k, blink && BLINKS.has(k), dt)
    if (k === painted) return
    painted = k
    paintFace(fctx, 512, k, { skin: def.color, eyes: false })
    faceTex.needsUpdate = true
  }
  function dress(outfit = {}) {
    for (const slot of ['hat', 'top', 'acc']) {
      if (!(slot in outfit)) continue
      const id = outfit[slot]
      const piece = pieces[id] && (PROPS[id]?.slot === slot || (slot === 'top' && TOPS[id])) ? id : 'none'
      if (worn[slot]) pieces[worn[slot]].visible = false
      worn[slot] = piece === 'none' ? null : piece
      if (worn[slot]) pieces[worn[slot]].visible = true
      look[slot] = piece
    }
  }

  // Reaching: aim each upper arm so its hand lands on a target (stretching a little if needed).
  const tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), q: new THREE.Quaternion(), pq: new THREE.Quaternion() }
  function aim(side, target) {
    const arm = bones[`${side}Arm`]
    const hand = bones[`${side}Hand`]
    const fore = bones[`${side}ForeArm`]
    const r = rest.get(arm)
    arm.quaternion.copy(r.q)
    arm.scale.copy(r.s)
    rest.get(fore) && fore.quaternion.copy(rest.get(fore).q)
    if (!target) return
    arm.updateMatrixWorld(true)
    const from = arm.getWorldPosition(tmp.a)
    const now = hand.getWorldPosition(tmp.b).sub(from)
    const want = tmp.c.copy(target).sub(from)
    const reach = now.length()
    // Rotate the arm in world space from where the hand is to where it should be.
    tmp.q.setFromUnitVectors(now.normalize(), want.clone().normalize())
    arm.parent.getWorldQuaternion(tmp.pq)
    const world = arm.getWorldQuaternion(new THREE.Quaternion())
    arm.quaternion.copy(tmp.pq.invert().multiply(tmp.q).multiply(world))
    // Cartoon arms stretch to reach (up to 1.7×).
    const k = Math.min(1.7, Math.max(1, want.length() / Math.max(reach, 1e-6)))
    arm.scale.set(r.s.x, r.s.y * k, r.s.z)
  }

  dress(def.outfit ?? {})
  face('idle')
  return {
    root,
    model,
    bones,
    face,
    dress,
    /** The eyes follow a world-space point (null: look ahead, as the expression says). */
    gaze(point) {
      eyes.gaze(point)
    },
    get look() {
      return { ...look }
    },
    /** Put the hands on two world-space points (null: let the arms hang). */
    reach(left, right) {
      root.updateMatrixWorld(true)
      aim('Left', left)
      aim('Right', right)
    }
  }
}

/**
 * The eyes and brows for each expression: lid = how far each upper lid is down (0 open, 1 shut),
 * low = how far the lower lids come up (a smile's squint), pupil = pupil size, look = [x, y]
 * where they look (−1…1, unless they're gazing at something), browY = brows up (+) or down (−)
 * in metres, tilt = brows' inner ends down (+, cross) or up (−, worried). A two-number value is
 * [left, right], the bean's own left and right.
 */
export const EXPRESSIONS = {
  idle: { lid: 0.12, low: 0, pupil: 1, look: [0, -0.05], browY: 0, tilt: 0.05 },
  focus: { lid: 0.42, low: 0.12, pupil: 0.95, look: [0, -0.25], browY: -0.006, tilt: 0.32 },
  effort: { lid: 1, low: 0.6, pupil: 1, look: [0, 0], browY: -0.012, tilt: 0.55 },
  wince: { lid: [1, 0.35], low: [0.6, 0.1], pupil: 0.9, look: [0.1, 0], browY: -0.004, tilt: [0.4, -0.25] },
  joy: { lid: 0.34, low: 0.66, pupil: 1, look: [0, 0.1], browY: 0.012, tilt: -0.15 },
  cheer: { lid: 0.04, low: 0.12, pupil: 1.38, look: [0, 0.15], browY: 0.022, tilt: -0.2, sparkle: true },
  sad: { lid: 0.38, low: 0, pupil: 1, look: [0, -0.35], browY: 0.008, tilt: -0.45 },
  shock: { lid: 0, low: 0, pupil: 0.55, look: [0, 0], browY: 0.03, tilt: -0.1, wide: true },
  nervous: { lid: 0.1, low: 0, pupil: 0.72, look: [0.35, 0], browY: 0.012, tilt: -0.35 },
  smug: { lid: [0.5, 0.62], low: 0.2, pupil: 0.9, look: [0.35, -0.05], browY: [0.01, -0.004], tilt: [0.22, -0.1] }
}
/** Where the eyes sit on the bean (bean space, metres): height, either side of the middle, size. */
const EYE = { y: 1.12, x: 0.088, r: 0.062 }
const pair = (v) => (Array.isArray(v) ? v : [v, v])

/** Where a ray from the front (+z) meets the body (bean space, metres), and the surface's normal. */
function frontHit(proxy, x, y) {
  const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 2), new THREE.Vector3(0, 0, -1))
  const hit = ray.intersectObject(proxy, false)[0]
  if (!hit) return { point: new THREE.Vector3(x, y, 0.3), normal: new THREE.Vector3(0, 0, 1) }
  const n = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 0, 1)
  if (n.z < 0) n.negate()
  return { point: hit.point.clone(), normal: n.normalize() }
}

/**
 * Two eyes and two brows on the bean's front (bean space, before it's turned to face -z), set to
 * an expression each frame and eased toward it. Lids are half-shells of the bean's colour that
 * turn over the eyeball; pupils turn to look; brows lift and tilt.
 */
function buildEyes(body, color) {
  // The body's raw vertices are bean-space metres (see faceDecal), so ray-cast a stand-in.
  const proxy = new THREE.Mesh(body.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  proxy.updateMatrixWorld(true)
  const group = new THREE.Group()
  const R = EYE.r
  const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.22 })
  const ink = new THREE.MeshStandardMaterial({ color: '#241a2c', roughness: 0.35 })
  const shine = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  const lidMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
  const ahead = new THREE.Vector3(0, 0, 1)
  const eyes = [-1, 1].map((s) => {
    const { point, normal } = frontHit(proxy, s * EYE.x, EYE.y)
    const g = new THREE.Group()
    g.position.copy(point).addScaledVector(normal, -R * 0.3)
    g.quaternion.setFromUnitVectors(ahead, normal.clone().lerp(ahead, 0.5).normalize())
    const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 16), white)
    ball.scale.set(0.9, 1.15, 0.7)
    g.add(ball)
    // The pupil sits on the eyeball and turns with the look; a shine, and a second one for sparkle.
    const look = new THREE.Group()
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(R * 0.5, 16, 12), ink)
    pupil.scale.set(1, 1.15, 0.45)
    pupil.position.z = R * 0.6
    const dot = new THREE.Mesh(new THREE.SphereGeometry(R * 0.14, 8, 6), shine)
    dot.position.set(R * 0.16, R * 0.2, R * 0.82)
    const star = new THREE.Mesh(new THREE.SphereGeometry(R * 0.09, 8, 6), shine)
    star.position.set(-R * 0.18, -R * 0.12, R * 0.8)
    look.add(pupil, dot, star)
    g.add(look)
    // Lids: half-shells that turn down from above (or up from below) over the eye.
    const shell = (top) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(R * 1.1, 24, 12, 0, Math.PI * 2, top ? 0 : Math.PI / 2, Math.PI / 2), lidMat)
      m.scale.set(0.95, 1.2, 0.82)
      const pivot = new THREE.Group()
      pivot.add(m)
      g.add(pivot)
      return pivot
    }
    const upper = shell(true)
    const lower = shell(false)
    // The brow: a short soft bar on the body above the eye.
    const above = frontHit(proxy, s * EYE.x * 1.05, EYE.y + R * 1.75)
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(R * 0.2, R * 1.15, 4, 10), ink)
    const browPivot = new THREE.Group()
    browPivot.position.copy(above.point).addScaledVector(above.normal, R * 0.12)
    browPivot.quaternion.setFromUnitVectors(ahead, above.normal)
    browPivot.add(brow)
    for (const m of [ball, pupil, brow]) m.castShadow = true
    group.add(g, browPivot)
    return { s, g, ball, look, pupil, star, upper, lower, brow, browPivot, browBase: browPivot.position.clone() }
  })
  // Where each eye is now; each frame it eases toward the expression.
  const now = eyes.map(() => ({ lid: 0.12, low: 0, pupil: 1, lx: 0, ly: 0, browY: 0, tilt: 0, wide: 1 }))
  let gazeAt = null
  const tmp = new THREE.Vector3()
  return {
    group,
    eyes,
    gaze(p) {
      gazeAt = p ? new THREE.Vector3(p.x, p.y, p.z) : null
    },
    set(kind, blink, dt) {
      const e = EXPRESSIONS[kind] ?? EXPRESSIONS.idle
      const k = 1 - Math.exp(-dt * 14)
      eyes.forEach((eye, i) => {
        const n = now[i]
        const want = {
          lid: blink ? 1 : pair(e.lid)[i],
          low: pair(e.low)[i],
          pupil: e.pupil,
          lx: e.look[0],
          ly: e.look[1],
          browY: pair(e.browY)[i],
          tilt: pair(e.tilt)[i],
          wide: e.wide ? 1.14 : 1
        }
        // Gazing at something: turn the pupils toward it, in the eye's own space.
        if (gazeAt && kind !== 'effort') {
          tmp.copy(gazeAt)
          eye.g.worldToLocal(tmp)
          const d = tmp.normalize()
          want.lx = Math.max(-0.9, Math.min(0.9, d.x * 1.6))
          want.ly = Math.max(-0.9, Math.min(0.9, d.y * 1.6))
        }
        for (const key of Object.keys(want)) n[key] += (want[key] - n[key]) * (key === 'lid' && blink ? 1 : k) // a blink is instant
        eye.upper.rotation.x = -Math.PI / 2 + n.lid * Math.PI * 0.98
        eye.lower.rotation.x = Math.PI / 2 - n.low * Math.PI * 0.6
        eye.look.rotation.set(-n.ly * 0.55, n.lx * 0.55, 0)
        eye.pupil.scale.set(n.pupil, n.pupil * 1.15, 0.45)
        eye.star.visible = Boolean(e.sparkle)
        eye.ball.scale.set(0.9 * n.wide, 1.15 * n.wide, 0.7)
        // Shut tight (both lids closing): the whole eye squeezes into a slit, rather than bulging.
        const squeeze = Math.min(n.lid, n.low * 1.5)
        eye.g.scale.set(1 + squeeze * 0.12, 1 - squeeze * 0.55, 1 - squeeze * 0.45)
        eye.browPivot.position.set(eye.browBase.x, eye.browBase.y + n.browY, eye.browBase.z)
        // A positive tilt drops the inner end (toward the middle).
        eye.brow.rotation.set(0, 0, Math.PI / 2 - eye.s * n.tilt)
      })
    }
  }
}

/** The body material with its orange shifted to `color` (hue, and saturation and value in proportion). */
function tinted(material, color) {
  const m = material.clone()
  m.roughness = 0.62
  m.metalness = 0
  const target = new THREE.Color(color)
  const t = {}
  target.getHSL(t) // only for the hue; s and v below
  const [h, s, v] = rgbToHsv(new THREE.Color().copy(target).convertLinearToSRGB())
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTint = { value: new THREE.Vector4(h, s / BASE_ORANGE.s, v / BASE_ORANGE.v, BASE_ORANGE.h) }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec4 uTint;
vec3 bxRgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 bxHsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  // The texture's orange (and only it) becomes the player's colour: hue replaced, saturation
  // and brightness scaled, so the model's shading stays. Worked in sRGB, where the hue was measured.
  vec3 srgb = pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2));
  vec3 hsv = bxRgb2hsv(srgb);
  float dh = abs(fract(hsv.x - uTint.w + 0.5) - 0.5);
  float w = smoothstep(0.3, 0.5, hsv.y) * (1.0 - smoothstep(0.07, 0.12, dh));
  vec3 shifted = bxHsv2rgb(vec3(uTint.x, clamp(hsv.y * uTint.y, 0.0, 1.0), clamp(hsv.z * uTint.z, 0.0, 1.0)));
  diffuseColor.rgb = mix(diffuseColor.rgb, pow(shifted, vec3(2.2)), w);
}`
      )
  }
  m.customProgramCacheKey = () => `bean-tint-${color}`
  return m
}

function rgbToHsv({ r, g, b }) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
    if (h < 0) h += 1
  }
  return [h, max === 0 ? 0 : d / max, max]
}

/** The face decal: projected onto the front of the body at eye height, in the body's parent's space. */
function faceDecal(body, tex) {
  let top = body
  while (top.parent) top = top.parent
  top.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(body)
  const front = box.max.z // the model's front is +z (it's turned round later, as a whole)
  const at = new THREE.Vector3(0, box.min.y + (box.max.y - box.min.y) * 0.74, front)
  // DecalGeometry reads the raw vertices through the mesh's world matrix. This model's raw
  // vertices are already in metres (its rig scales them by 0.01 and the bones by 100), so project
  // onto a stand-in mesh with the same geometry and no transform.
  const proxy = new THREE.Mesh(body.geometry)
  proxy.updateMatrixWorld(true)
  const geo = new DecalGeometry(proxy, at, new THREE.Euler(0, 0, 0), new THREE.Vector3(0.46, 0.46, 0.5))
  // Back into the space of the body's parent (DecalGeometry works in world space).
  const inv = new THREE.Matrix4().copy(body.parent.matrixWorld).invert()
  geo.applyMatrix4(inv)
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.renderOrder = 2
  return mesh
}

/**
 * A top: the body's own triangles between two heights (and the upper arms, for sleeves), pushed
 * out a little and skinned to the same bones, so it fits and moves with the bean.
 */
function topLayer(body, t, color) {
  const src = body.geometry
  const pos = src.attributes.position
  const nor = src.attributes.normal
  const idx = src.index
  const skinI = src.attributes.skinIndex
  const skinW = src.attributes.skinWeight
  const names = body.skeleton.bones.map((b) => b.name)
  // Which triangles: everything but the forearms and hands. Where exactly the top
  // starts and stops is cut per pixel in the shader (a clean edge): the body between t.from and
  // t.to, the upper arms above t.sleeves (short sleeves).
  const keep = new Uint8Array(pos.count)
  const low = new Float32Array(pos.count)
  for (let i = 0; i < pos.count; i++) {
    let best = 0
    let bw = -1
    for (let k = 0; k < 4; k++) {
      const w = skinW.getComponent(i, k)
      if (w > bw) ((bw = w), (best = skinI.getComponent(i, k)))
    }
    const bone = names[best] ?? ''
    const upperArm = /Arm$/.test(bone) && !/ForeArm/.test(bone)
    keep[i] = /ForeArm|Hand/.test(bone) ? 0 : 1 // the legs are below the hem: the shader cuts them
    low[i] = upperArm ? t.sleeves : t.from
  }
  // Only triangles that reach into the top's height range (the shader trims their edges): the
  // rest of the body would be drawn twice for nothing.
  const near = (i) => pos.getY(i) >= low[i] - 0.03 && pos.getY(i) <= t.to + 0.03
  const out = []
  for (let f = 0; f < idx.count; f += 3) {
    const a = idx.getX(f)
    const b = idx.getX(f + 1)
    const c = idx.getX(f + 2)
    if (keep[a] && keep[b] && keep[c] && (near(a) || near(b) || near(c))) out.push(a, b, c)
  }
  const geo = new THREE.BufferGeometry()
  const grow = 0.012
  const p2 = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    p2[i * 3] = pos.getX(i) + nor.getX(i) * grow
    p2[i * 3 + 1] = pos.getY(i) + nor.getY(i) * grow
    p2[i * 3 + 2] = pos.getZ(i) + nor.getZ(i) * grow
  }
  geo.setAttribute('position', new THREE.BufferAttribute(p2, 3))
  geo.setAttribute('normal', nor)
  geo.setAttribute('skinIndex', skinI)
  geo.setAttribute('skinWeight', skinW)
  // UVs for the print: wrapped round the body (u round, v up).
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = Math.atan2(pos.getX(i), pos.getZ(i)) / (Math.PI * 2) + 0.5
    uv[i * 2 + 1] = pos.getY(i)
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geo.setAttribute('aLow', new THREE.BufferAttribute(low, 1))
  geo.setIndex(out)
  const mat = t.print ? new THREE.MeshStandardMaterial({ map: hawaiianPrint(), roughness: 0.8 }) : new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.8 }) // a classic white golf polo
  mat.side = THREE.DoubleSide
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTop = { value: t.to }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLow;\nvarying float vRawY;\nvarying float vLow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRawY = position.y;\nvLow = aLow;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTop;\nvarying float vRawY;\nvarying float vLow;')
      .replace('void main() {', 'void main() {\n  if (vRawY < vLow || vRawY > uTop) discard;')
  }
  mat.customProgramCacheKey = () => `bean-top-${t.from}-${t.to}-${t.sleeves}`
  const mesh = new THREE.SkinnedMesh(geo, mat)
  mesh.bind(body.skeleton, body.bindMatrix)
  mesh.position.copy(body.position)
  mesh.quaternion.copy(body.quaternion)
  mesh.scale.copy(body.scale)
  mesh.castShadow = true
  mesh.frustumCulled = false
  // The top hangs off the body's parent, alongside it.
  mesh.userData.parent = body.parent
  return mesh
}

/** The Hawaiian shirt's print: hibiscus and leaves on deep blue, made once and shared. */
let print = null
function hawaiianPrint() {
  if (print) return print
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
    c.fillStyle = ['#ff5c8a', '#ffd23f', '#ffffff', '#ff8a3d'][i % 4]
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
  print = new THREE.CanvasTexture(cv)
  print.colorSpace = THREE.SRGBColorSpace
  print.wrapS = print.wrapT = THREE.RepeatWrapping
  print.repeat.set(3, 2.2)
  return print
}
