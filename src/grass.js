// The grass: one material for every mown surface (rough, fairway, tee, greens) and the tufts that
// stand up out of it near the camera. Drawn in code, no textures to download:
//   - a tiling detail texture of short blade strokes (colour and a bump map), so the ground has
//     grain that catches the low sun,
//   - large soft patches of lighter and darker green (two scales of noise, in world space), so big
//     areas never look like one flat colour,
//   - mowing stripes worked out from the world position (crisp at any distance), lit a little
//     differently either way, like real mown grass,
//   - tufts: crossed blade cards, one instanced draw, swaying in the breeze.
// Everything is in game space (x right, z downrange); three.js puts game z at -z.
import * as THREE from 'three'

/** Seeded random, so the grass is the same every run. */
function rng(seed) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) / 2147483647)
}

/** The blade detail repeats every this many metres. */
const DETAIL_TILE = 1.6
let detail = null
/** The blade detail: a light grey texture with darker strokes (multiplies the colour) and its height (bump). */
function detailTextures() {
  if (detail) return detail
  const N = 256
  const albedo = document.createElement('canvas')
  albedo.width = albedo.height = N
  const height = document.createElement('canvas')
  height.width = height.height = N
  const a = albedo.getContext('2d')
  const h = height.getContext('2d')
  a.fillStyle = '#f2f2f2'
  a.fillRect(0, 0, N, N)
  h.fillStyle = '#808080'
  h.fillRect(0, 0, N, N)
  const rand = rng(7)
  // Short strokes leaning a little, drawn three times over the edges so the tile wraps.
  for (let i = 0; i < 2600; i++) {
    const x = rand() * N
    const y = rand() * N
    const len = 3 + rand() * 7
    const ang = -Math.PI / 2 + (rand() - 0.5) * 0.9
    const v = rand()
    const shade = Math.round(200 + v * 70)
    for (const [ox, oy] of [[0, 0], [N, 0], [-N, 0], [0, N], [0, -N]]) {
      a.strokeStyle = `rgb(${shade},${shade},${shade})`
      a.lineWidth = 1 + rand() * 0.8
      a.beginPath()
      a.moveTo(x + ox, y + oy)
      a.lineTo(x + ox + Math.cos(ang) * len, y + oy + Math.sin(ang) * len)
      a.stroke()
      const hv = Math.round(90 + v * 140)
      h.strokeStyle = `rgb(${hv},${hv},${hv})`
      h.lineWidth = 1.2
      h.beginPath()
      h.moveTo(x + ox, y + oy)
      h.lineTo(x + ox + Math.cos(ang) * len, y + oy + Math.sin(ang) * len)
      h.stroke()
    }
  }
  const map = new THREE.CanvasTexture(albedo)
  map.colorSpace = THREE.SRGBColorSpace
  const bump = new THREE.CanvasTexture(height)
  for (const t of [map, bump]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 8
    t.repeat.set(1 / DETAIL_TILE, 1 / DETAIL_TILE) // uv is world metres: one tile every DETAIL_TILE m
  }
  detail = { map, bump }
  return detail
}

let patches = null
/** Soft value noise for big patches of lighter and darker grass (tiles; sampled at two scales). */
function patchTexture() {
  if (patches) return patches
  const N = 128
  const cv = document.createElement('canvas')
  cv.width = cv.height = N
  const c = cv.getContext('2d')
  const img = c.createImageData(N, N)
  const rand = rng(23)
  const G = 8
  const grid = Array.from({ length: G * G }, () => rand())
  const at = (x, y) => grid[((y % G) + G) % G * G + (((x % G) + G) % G)]
  const smooth = (t) => t * t * (3 - 2 * t)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const gx = (x / N) * G
      const gy = (y / N) * G
      const ix = Math.floor(gx)
      const iy = Math.floor(gy)
      const fx = smooth(gx - ix)
      const fy = smooth(gy - iy)
      const v = (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy
      const b = Math.round(v * 255)
      img.data.set([b, b, b, 255], (y * N + x) * 4)
    }
  }
  c.putImageData(img, 0, 0)
  patches = new THREE.CanvasTexture(cv)
  patches.wrapS = patches.wrapT = THREE.RepeatWrapping
  return patches
}

/**
 * A grass material. o.vertexColors: the geometry's colours are the base green (else o.color);
 * o.stripes: mowing stripes every o.stripe metres downrange (game z); o.patch: how strong the
 * light and dark patches are; o.bump: how much the blade detail catches the light.
 * The geometry needs uv = world x, z in metres (grassUVs()).
 */
export function grassMaterial({ vertexColors = false, color = '#ffffff', stripes = false, stripe = 9.15, stripeAngle = 0, patch = 0.16, bump = 0.9, side = THREE.FrontSide } = {}) {
  const { map, bump: bumpMap } = detailTextures()
  const m = new THREE.MeshStandardMaterial({ vertexColors, color, map, bumpMap, bumpScale: bump, roughness: 0.93, metalness: 0, side })
  grassMats.push({ m, color: m.color.clone() })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uPatch = { value: patchTexture() }
    shader.uniforms.uPatchAmt = { value: patch }
    shader.uniforms.uStripe = { value: stripes ? 1 / (2 * stripe) : 0 }
    shader.uniforms.uStripeDir = { value: new THREE.Vector2(Math.sin(stripeAngle), Math.cos(stripeAngle)) }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGrassWorld;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvGrassWorld = uv;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGrassWorld;\nuniform sampler2D uPatch;\nuniform float uPatchAmt;\nuniform float uStripe;\nuniform vec2 uStripeDir;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  // Big soft patches at two scales, lighter and darker.
  float p = texture2D(uPatch, vGrassWorld * 0.018).r * 0.65 + texture2D(uPatch, vGrassWorld * 0.071 + 0.37).r * 0.35;
  diffuseColor.rgb *= 1.0 + (p - 0.5) * 2.0 * uPatchAmt;
  // Mowing stripes, from the world position, soft-edged.
  if (uStripe > 0.0) {
    float d = dot(vGrassWorld, uStripeDir) * uStripe;
    float s = smoothstep(0.42, 0.5, abs(fract(d) - 0.5) * 2.0 - 0.0);
    diffuseColor.rgb *= mix(1.1, 0.86, s);
  }
}`
      )
  }
  m.customProgramCacheKey = () => `grass-${stripes}-${stripe}-${stripeAngle}-${patch}`
  return m
}

const grassMats = []
/** How dark the blade detail makes the grass on average (linear), so it can be left out without the grass going pale. */
const DETAIL_MEAN = 0.86
/**
 * Blade detail on or off for every grass material. Light mode turns it off: on a machine with no
 * GPU the detail and bump texture reads cost more than the rest of the ground put together.
 */
export function setGrassDetail(on) {
  const { map, bump } = detailTextures()
  for (const { m, color } of grassMats) {
    if (Boolean(m.map) === on) continue
    m.map = on ? map : null
    m.bumpMap = on ? bump : null
    m.color.copy(color).multiplyScalar(on ? 1 : DETAIL_MEAN)
    m.needsUpdate = true
  }
}

/** Set a geometry's uv to world x, z in metres (game space), for grassMaterial. flipZ: three z = -game z. */
export function grassUVs(geo, { flipZ = true, offset = [0, 0] } = {}) {
  const pos = geo.attributes.position
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) + offset[0]
    uv[i * 2 + 1] = (flipZ ? -pos.getZ(i) : pos.getZ(i)) + offset[1]
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return geo
}

let bladeTex = null
/** Blades for the tufts: a fan of tapering strokes, alpha-cut. */
function bladeTexture() {
  if (bladeTex) return bladeTex
  const W = 128
  const H = 128
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const c = cv.getContext('2d')
  const rand = rng(41)
  for (let i = 0; i < 26; i++) {
    const x = 14 + rand() * (W - 28)
    const top = 8 + rand() * 50
    const lean = (rand() - 0.5) * 34
    const w = 3 + rand() * 4
    const g = c.createLinearGradient(0, H, 0, top)
    const tone = 0.75 + rand() * 0.25
    g.addColorStop(0, `rgb(${Math.round(150 * tone)},${Math.round(190 * tone)},${Math.round(110 * tone)})`)
    g.addColorStop(1, `rgb(${Math.round(235 * tone)},${Math.round(255 * tone)},${Math.round(190 * tone)})`)
    c.fillStyle = g
    c.beginPath()
    c.moveTo(x - w, H)
    c.quadraticCurveTo(x + lean * 0.3, (H + top) / 2, x + lean, top)
    c.quadraticCurveTo(x + lean * 0.3 + w * 0.5, (H + top) / 2, x + w, H)
    c.closePath()
    c.fill()
  }
  bladeTex = new THREE.CanvasTexture(cv)
  bladeTex.colorSpace = THREE.SRGBColorSpace
  return bladeTex
}

/**
 * Tufts of grass: crossed blade cards at the given spots, tinted per tuft, swaying. items:
 * [{ x, z, y, s, color }] (game space; y the ground height). Returns { mesh, update(dt) }.
 */
export function createTufts(items) {
  // Three cards crossed at 60°, 0.42 m wide and tall, bottoms on the ground.
  const parts = [0, 1, 2].map((i) => new THREE.PlaneGeometry(0.42, 0.34, 1, 2).translate(0, 0.17, 0).rotateY((i * Math.PI) / 3))
  const geo = mergeCards(parts)
  const mat = new THREE.MeshStandardMaterial({ map: bladeTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 })
  const time = { value: 0 }
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
// Sway: tops more than bottoms, each tuft in its own phase.
float phase = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.21;
float k = position.y * position.y * 2.2;
transformed.x += sin(uTime * 1.7 + phase) * 0.05 * k;
transformed.z += cos(uTime * 1.3 + phase) * 0.03 * k;`
      )
    // Lit from the ground's normal (up), so tufts shade like the grass under them, not like cards;
    // and the same on both sides of a card (a double-sided card's back would otherwise face down).
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
  }
  mat.customProgramCacheKey = () => 'tufts'
  const mesh = new THREE.InstancedMesh(geo, mat, items.length)
  const d = new THREE.Object3D()
  const col = new THREE.Color()
  items.forEach((it, i) => {
    d.position.set(it.x, it.y ?? 0, -it.z)
    d.rotation.set(0, it.r ?? 0, 0)
    d.scale.setScalar(it.s ?? 1)
    d.updateMatrix()
    mesh.setMatrixAt(i, d.matrix)
    mesh.setColorAt(i, col.set(it.color ?? '#7fd957'))
  })
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  return {
    mesh,
    update(dt) {
      time.value += dt
    }
  }
}

function mergeCards(parts) {
  const pos = []
  const uv = []
  const idx = []
  let base = 0
  for (const p of parts) {
    const P = p.attributes.position
    const U = p.attributes.uv
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i))
      uv.push(U.getX(i), U.getY(i))
    }
    for (let i = 0; i < p.index.count; i++) idx.push(p.index.getX(i) + base)
    base += P.count
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
