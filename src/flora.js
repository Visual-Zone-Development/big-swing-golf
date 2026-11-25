// The resort's trees, palms and bushes, built as forms rather than primitives (pushplay-kit's
// model-asset skill, references/forms.md): a trunk that flares at the root and leans, branches that
// reach into the foliage, foliage as lumpy clusters each shaded as its own ball (darker underneath and
// toward the middle, lighter on top), and an accent (blossoms on some trees and bushes, coconuts on the
// palms). Every kind is one geometry drawn as an InstancedMesh; a shared breeze sways the crowns and
// flutters the fronds (each instance at its own phase, so nothing moves in sync).
// Local space: y up, the trunk's foot at the origin.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { limbGeo, loftGeo, lumpy, noise2 } from './forms3d.js'

/** The breeze's clock (seconds), shared by every swaying material: scenery.update() advances it. */
export const wind = { value: 0 }

function rng(seed) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) / 2147483647)
}
const clamp01 = (x) => Math.min(1, Math.max(0, x))

/** Give a geometry a colour per vertex from fn(position, normal), and get it ready to merge. */
function paint(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo
  if (!g.attributes.normal) g.computeVertexNormals()
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k)
  const pos = g.attributes.position
  const nrm = g.attributes.normal
  const col = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  const v = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    n.fromBufferAttribute(nrm, i)
    typeof fn === 'function' ? c.copy(fn(v, n)) : c.set(fn)
    col.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

/** A lumpy ball of foliage at [x, y, z], radius r. */
function cluster(x, y, z, r, seed, squash = 0.88, low = false) {
  const g = low ? new THREE.SphereGeometry(1, 8, 6) : new THREE.SphereGeometry(1, 14, 10)
  g.deleteAttribute('uv')
  g.scale(r, r * squash, r)
  lumpy(g, r * 0.17, 1.5 / r, seed)
  return g.translate(x, y, z)
}

/**
 * Foliage colour: each cluster shaded as its own ball (top light, underside dark), darker toward the
 * crown's middle and lower down, with soft leafy mottling so big clusters aren't one flat colour.
 */
function leafPainter(lo, hi, crown, y0, y1) {
  const L = new THREE.Color(lo)
  const H = new THREE.Color(hi)
  const out = new THREE.Vector3()
  return (v, n) => {
    const ball = 0.5 + 0.5 * n.y
    const height = clamp01((v.y - y0) / (y1 - y0))
    out.copy(v).sub(crown).normalize()
    const outward = 0.5 + 0.5 * n.dot(out)
    const mottle = noise2(v.x * 1.7 + v.z * 0.9, v.y * 1.7 - v.z * 0.6, 3) - 0.5
    const k = clamp01(0.1 + ball * 0.5 + height * 0.3 + (outward - 0.5) * 0.35 + mottle * 0.25)
    return L.clone().lerp(H, k)
  }
}

/** Bark: darker at the root, lighter up the trunk, with vertical grooves. */
function barkPainter(base, top, height) {
  const B = new THREE.Color(base)
  const T = new THREE.Color(top)
  return (v) => {
    const groove = noise2(Math.atan2(v.x, v.z) * 2.2, v.y * 0.6, 9)
    return B.clone().lerp(T, clamp01(v.y / height) * 0.85).multiplyScalar(0.82 + groove * 0.3)
  }
}

/**
 * A broadleaf tree about 8.5 m tall: a flared, leaning trunk, three branches and eight foliage
 * clusters. flowering: coral blossoms dotted over the top of the crown (the accent).
 */
export function treeGeometry({ seed = 1, flowering = false, detail = 'high' } = {}) {
  const low = detail === 'low'
  const rand = rng(seed * 97 + 13)
  const lean = 0.36
  const trunkH = 4.6
  const trunk = lumpy(
    loftGeo(
      [
        [0, 0.8, 0.72, 0, 0],
        [0.3, 0.52, 0.5, 0, 0.02],
        [1.2, 0.4, 0.38, 0, 0.06],
        [2.4, 0.34, 0.32, 0, 0.14],
        [3.6, 0.29, 0.28, 0, 0.25],
        [trunkH, 0.24, 0.23, 0, lean]
      ],
      low ? 6 : 9,
      low ? 1 : 2
    ),
    0.035,
    3,
    seed
  )
  const parts = [paint(trunk, barkPainter('#5e3a20', '#a2713f', trunkH))]
  const bark = barkPainter('#7a4f2c', '#a2713f', 8)
  // Far away the branches can't be seen through the crown: the low version leaves them out.
  for (const [a, b, r1, r2] of low ? [] : [
    [[0.12, 3.1, 0], [1.7, 4.5, 0.4], 0.17, 0.07],
    [[0.18, 3.5, 0], [-1.4, 4.8, -0.35], 0.16, 0.07],
    [[0.26, 3.9, 0], [0.6, 5.5, -1.2], 0.14, 0.06]
  ]) {
    parts.push(paint(limbGeo(a, b, r1, r2, 6), bark))
  }
  const crown = new THREE.Vector3(lean, 5.6, 0)
  const clusters = [
    [0.3, 5.5, 0, 2.3],
    [1.9, 4.9, 0.4, 1.65],
    [-1.5, 5.0, -0.3, 1.75],
    [0.5, 6.9, 0.1, 1.6],
    [-0.3, 4.7, 1.5, 1.5],
    [0.8, 4.6, -1.5, 1.5],
    [-1.2, 6.2, 0.9, 1.2],
    [1.6, 6.1, -0.7, 1.15]
  ].map(([x, y, z, r]) => [x + (rand() - 0.5) * 0.4, y + (rand() - 0.5) * 0.3, z + (rand() - 0.5) * 0.4, r * (0.92 + rand() * 0.16)])
  const leaf = leafPainter('#24702f', '#9be063', crown, 3.4, 8.4)
  // The low version keeps the five biggest clusters (the silhouette), a little larger to fill the gaps.
  const shown = low ? clusters.slice(0, 5).map(([x, y, z, r]) => [x, y, z, r * 1.12]) : clusters
  shown.forEach(([x, y, z, r], i) => parts.push(paint(cluster(x, y, z, r, seed * 10 + i, 0.88, low), leaf)))
  if (flowering) {
    const dir = new THREE.Vector3()
    for (let i = 0; i < (low ? 24 : 44); i++) {
      const [x, y, z, r] = clusters[i % clusters.length]
      dir.set(rand() - 0.5, 0.2 + rand() * 0.8, rand() - 0.5).normalize()
      const b = new THREE.IcosahedronGeometry(0.12 + rand() * 0.05, 0)
      b.scale(1, 0.7, 1).translate(x + dir.x * r * 0.97, y + dir.y * r * 0.86, z + dir.z * r * 0.97)
      parts.push(paint(b, i % 3 ? '#ff6f86' : '#ffd1dc'))
    }
  }
  return mergeGeometries(parts)
}

/** A round shrub about 1.4 m tall: five lumpy clusters; flowering ones carry hibiscus dots. */
export function bushGeometry({ seed = 1, flowering = false, detail = 'high' } = {}) {
  const low = detail === 'low'
  const rand = rng(seed * 31 + 7)
  const centre = new THREE.Vector3(0, 0.5, 0)
  const leaf = leafPainter('#2c7f36', '#97de66', centre, 0, 1.5)
  const clusters = [
    [0, 0.62, 0, 0.9],
    [0.8, 0.46, 0.2, 0.66],
    [-0.75, 0.46, -0.1, 0.7],
    [0.1, 0.42, 0.78, 0.6],
    [-0.2, 0.44, -0.75, 0.58]
  ]
  const parts = (low ? clusters.slice(0, 3) : clusters).map(([x, y, z, r], i) => paint(cluster(x, y, z, r * (low ? 1.1 : 1), seed * 7 + i, 0.8, low), leaf))
  if (flowering) {
    const dir = new THREE.Vector3()
    for (let i = 0; i < 14; i++) {
      const [x, y, z, r] = clusters[i % clusters.length]
      dir.set(rand() - 0.5, 0.3 + rand() * 0.7, rand() - 0.5).normalize()
      const b = new THREE.IcosahedronGeometry(0.075, 0)
      b.scale(1, 0.6, 1).translate(x + dir.x * r * 0.95, y + dir.y * r * 0.76, z + dir.z * r * 0.95)
      parts.push(paint(b, i % 2 ? '#ff5c6e' : '#ffe066'))
    }
  }
  return mergeGeometries(parts)
}

/**
 * A coconut palm about 9 m tall: a curving trunk that flares at the root, narrows upward and is
 * ringed with leaf scars; nine fronds arching out and drooping, each a folded strip with serrated
 * leaflets; a crown bulb and a bunch of coconuts.
 */
export function palmGeometry({ seed = 1, detail = 'high' } = {}) {
  const low = detail === 'low'
  const rand = rng(seed * 53 + 5)
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.6, 3, 0), new THREE.Vector3(1.8, 6, 0), new THREE.Vector3(3.2, 8.4, 0)])
  const parts = []

  // ---- trunk: rings along the curve, scalloped every 0.45 m ----
  const RINGS = low ? 22 : 72 // far away the leaf-scar rings are painted, not shaped
  const SIDES = low ? 6 : 9
  const length = curve.getLength()
  const frames = curve.computeFrenetFrames(RINGS, false)
  const pos = []
  const ridge = []
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS
    const p = curve.getPointAt(t)
    const s = t * length
    const band = low ? 0.5 : 1 - Math.abs(Math.sin((Math.PI * s) / 0.45))
    const r = (0.26 + 0.12 * (1 - t) + 0.34 * Math.pow(1 - t, 7)) * (1 + 0.09 * band)
    const N = frames.normals[i]
    const B = frames.binormals[i]
    for (let j = 0; j <= SIDES; j++) {
      const a = (j / SIDES) * Math.PI * 2
      pos.push(p.x + (N.x * Math.cos(a) + B.x * Math.sin(a)) * r, p.y + (N.y * Math.cos(a) + B.y * Math.sin(a)) * r, p.z + (N.z * Math.cos(a) + B.z * Math.sin(a)) * r)
      ridge.push(band, t)
    }
  }
  const idx = []
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SIDES; j++) {
      const a = i * (SIDES + 1) + j
      const b = a + SIDES + 1
      idx.push(a, a + 1, b, a + 1, b + 1, b)
    }
  }
  const trunk = new THREE.BufferGeometry()
  trunk.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  trunk.setIndex(idx)
  trunk.computeVertexNormals()
  // Colour by ring: the ridges light, the grooves dark, the foot darker still.
  const groove = new THREE.Color('#7f5532')
  const crest = new THREE.Color('#d1a066')
  const trunkCol = []
  for (let i = 0; i < ridge.length; i += 2) {
    const c = groove.clone().lerp(crest, ridge[i] * 0.85).multiplyScalar(0.78 + 0.22 * Math.min(1, ridge[i + 1] * 4))
    trunkCol.push(c.r, c.g, c.b)
  }
  trunk.setAttribute('color', new THREE.Float32BufferAttribute(trunkCol, 3))
  parts.push(trunk.toNonIndexed())

  // ---- crown bulb and coconuts ----
  const top = curve.getPoint(1)
  const bulb = loftGeo([[-0.5, 0.22, 0.22], [-0.2, 0.42, 0.42], [0.15, 0.44, 0.44], [0.45, 0.25, 0.25], [0.6, 0.08, 0.08]], low ? 6 : 9, low ? 1 : 2).translate(top.x, top.y, top.z)
  parts.push(paint(bulb, (v) => new THREE.Color('#6d8a3a').lerp(new THREE.Color('#9a7a44'), clamp01((top.y - v.y + 0.3) / 0.8))))
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + rand()
    const nut = low ? new THREE.SphereGeometry(0.27, 6, 4) : new THREE.SphereGeometry(0.27, 10, 8)
    nut.deleteAttribute('uv')
    nut.scale(1, 1.12, 1)
    lumpy(nut, 0.025, 7, seed + i)
    nut.translate(top.x + Math.cos(a) * 0.36, top.y - 0.42 - (i % 2) * 0.12, top.z + Math.sin(a) * 0.36)
    parts.push(paint(nut, (v, n) => new THREE.Color('#4e3420').lerp(new THREE.Color('#8a6a3a'), 0.5 + 0.5 * n.y)))
  }

  // ---- fronds: folded strips with serrated leaflets ----
  const FRONDS = 9
  const SEGS = low ? 9 : 22
  const midrib = new THREE.Color('#b9dc66')
  const leafDark = new THREE.Color('#237f3a')
  const leafTip = new THREE.Color('#6fcc4e')
  for (let f = 0; f < FRONDS; f++) {
    const ang = (f / FRONDS) * Math.PI * 2 + (rand() - 0.5) * 0.4
    const reach = 4.4 + rand() * 0.9
    const lift = 1.1 + rand() * 0.5
    const droop = 2.4 + rand() * 1.2
    const dx = Math.cos(ang)
    const dz = Math.sin(ang)
    const at = (u) => {
      const r = reach * u
      const y = lift * u - droop * u * u
      return new THREE.Vector3(top.x + dx * r, top.y + 0.25 + y, top.z + dz * r)
    }
    const fp = []
    const fc = []
    const push = (v, c) => {
      fp.push(v.x, v.y, v.z)
      fc.push(c.r, c.g, c.b)
    }
    for (let i = 0; i < SEGS; i++) {
      const u0 = i / SEGS
      const u1 = (i + 1) / SEGS
      const c0 = at(u0)
      const c1 = at(u1)
      const width = (u) => 0.95 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05 + 0.05)), 0.7)
      // Leaflets: every other edge point reaches out and sweeps toward the tip, so the edge is serrated.
      const tooth = (u, k) => (k % 2 ? 1 : 0.32)
      for (const side of [-1, 1]) {
        const e0 = at(Math.min(1, u0 + 0.035))
        const e1 = at(Math.min(1, u1 + 0.035))
        const w0 = width(u0) * tooth(u0, i)
        const w1 = width(u1) * tooth(u1, i + 1)
        e0.x += -dz * w0 * side
        e0.z += dx * w0 * side
        e0.y -= w0 * 0.32
        e1.x += -dz * w1 * side
        e1.z += dx * w1 * side
        e1.y -= w1 * 0.32
        const tip = leafDark.clone().lerp(leafTip, u0)
        const tip1 = leafDark.clone().lerp(leafTip, u1)
        const rib0 = midrib.clone().lerp(tip, 0.35)
        const rib1 = midrib.clone().lerp(tip1, 0.35)
        // Wound so the top of the fold faces up on both sides.
        if (side > 0) {
          push(c0, rib0), push(c1, rib1), push(e0, tip)
          push(e0, tip), push(c1, rib1), push(e1, tip1)
        } else {
          push(c0, rib0), push(e0, tip), push(c1, rib1)
          push(e0, tip), push(e1, tip1), push(c1, rib1)
        }
      }
    }
    const frond = new THREE.BufferGeometry()
    frond.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3))
    frond.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3))
    frond.computeVertexNormals()
    parts.push(frond)
  }
  return mergeGeometries(parts)
}

/**
 * A vertex-coloured material that sways in the breeze: everything above `from` metres moves, more
 * the higher it is (up to `to`); `flutter` adds a quicker ripple that grows with the distance from
 * `centre` ([x, z], the crown), for fronds and leaf tips. Instances each get their own phase from where they stand.
 */
export function swayMaterial({ from = 3, to = 9, amp = 0.12, flutter = 0, centre = [0, 0], side = THREE.FrontSide } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
{
  float ph = 0.0;
#ifdef USE_INSTANCING
  ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
#endif
  float k = smoothstep(${from.toFixed(2)}, ${to.toFixed(2)}, position.y);
  float gust = 0.75 + 0.25 * sin(uWind * 0.31 + ph * 0.5);
  transformed.x += sin(uWind * 0.9 + ph) * ${amp.toFixed(3)} * k * gust;
  transformed.z += cos(uWind * 0.7 + ph * 1.3) * ${(amp * 0.6).toFixed(3)} * k * gust;
  float reach = length(position.xz - vec2(${centre[0].toFixed(2)}, ${centre[1].toFixed(2)}));
  transformed.y += sin(uWind * 3.1 + ph + reach * 1.7) * ${flutter.toFixed(3)} * k * clamp(reach - 0.8, 0.0, 3.0);
}`
    )
  }
  mat.customProgramCacheKey = () => `sway-${from}-${to}-${amp}-${flutter}-${centre}-${side}`
  return mat
}

/**
 * Many copies of a flora piece with two levels of detail: the copies within `near` metres of the
 * camera are drawn with `hi` (and cast shadows), the rest with `lo`. items: [{ x, y, z, s, r }] in
 * three.js space, tints: per-copy colour multipliers. Returns { meshes, update(cameraPosition), setLight(on) };
 * light mode (slow machines) draws only `lightShare` of the copies, all with `lo`.
 */
export function lodInstances(scene, { items, hi, lo, mat, tints, near = 70, lightShare = 1 }) {
  const meshes = [hi, lo].map((g, k) => {
    const m = new THREE.InstancedMesh(g, mat, items.length)
    m.castShadow = k === 0
    m.receiveShadow = true
    m.count = 0
    scene.add(m)
    return m
  })
  const d = new THREE.Object3D()
  const matrices = items.map((it) => {
    d.position.set(it.x, it.y, it.z)
    d.rotation.set(0, it.r ?? 0, 0)
    d.scale.setScalar(it.s ?? 1)
    d.updateMatrix()
    return d.matrix.clone()
  })
  const colors = items.map((_, i) => new THREE.Color(tints[i % tints.length]))
  let light = false
  const last = new THREE.Vector3(Infinity, 0, 0)
  function assign(cx, cz) {
    const n = [0, 0]
    const limit = light ? Math.ceil(items.length * lightShare) : items.length
    for (let i = 0; i < limit; i++) {
      const it = items[i]
      const k = light || (it.x - cx) ** 2 + (it.z - cz) ** 2 > near * near ? 1 : 0
      meshes[k].setMatrixAt(n[k], matrices[i])
      meshes[k].setColorAt(n[k], colors[i])
      n[k]++
    }
    meshes.forEach((m, k) => {
      m.count = n[k]
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
      m.computeBoundingSphere()
    })
  }
  return {
    meshes,
    /** Re-sort the copies when the camera has moved more than a few metres. */
    update(camera) {
      if (camera && (camera.x - last.x) ** 2 + (camera.z - last.z) ** 2 < 16) return
      if (camera) last.copy(camera)
      assign(last.x, last.z)
    },
    setLight(on) {
      light = on
      assign(last.x, last.z)
    }
  }
}
