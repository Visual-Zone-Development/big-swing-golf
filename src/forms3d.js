// Shape builders, so nothing in the resort is a bare sphere, box or cylinder (the "build forms, not
// primitives" rules in pushplay-kit's model-asset skill). Adapted from pushplay-kit's art-styles toolkit
// (forms3d.js and core.js): loftGeo (a body from cross-sections), limbGeo (a tapered limb with rounded
// ends), lumpy (push a surface in and out with noise), and the seeded value noise they use.
import * as THREE from 'three'

function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
/** Smooth value noise in 0..1. */
export function noise2(x, y, s = 0) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash(xi, yi, s)
  const b = hash(xi + 1, yi, s)
  const c = hash(xi, yi + 1, s)
  const d = hash(xi + 1, yi + 1, s)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
/** Layered noise in about 0..1. */
export function fbm(x, y, s = 0, oct = 4) {
  let a = 0
  let f = 1
  let amp = 0.5
  for (let i = 0; i < oct; i++) {
    a += amp * noise2(x * f, y * f, s + i * 17)
    f *= 2
    amp *= 0.5
  }
  return a
}

/** Loft elliptical cross-sections [y, rx, rz, dz = 0, dx = 0] (bottom to top) into a closed mesh; sub > 1 smooths between them. */
export function loftGeo(sections, seg = 16, sub = 1) {
  let S = sections.map((s) => [s[0], s[1], s[2], s[3] || 0, s[4] || 0])
  if (sub > 1) {
    const out = []
    const cr = (a, b, c, d, t) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t)
    for (let i = 0; i < S.length - 1; i++) {
      const a = S[Math.max(0, i - 1)]
      const b = S[i]
      const c = S[i + 1]
      const d = S[Math.min(S.length - 1, i + 2)]
      for (let k = 0; k < sub; k++) out.push(b.map((_, q) => (q === 1 || q === 2 ? Math.max(0.001, cr(a[q], b[q], c[q], d[q], k / sub)) : cr(a[q], b[q], c[q], d[q], k / sub))))
    }
    out.push(S.at(-1))
    S = out
  }
  const pos = []
  const idx = []
  const row = seg + 1
  for (const [y, rx, rz, dz, dx] of S) {
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2
      pos.push(dx + Math.sin(a) * rx, y, dz - Math.cos(a) * rz)
    }
  }
  for (let i = 0; i < S.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * row + j
      const b = a + row
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  for (const [i, flip] of [[0, true], [S.length - 1, false]]) {
    const c = pos.length / 3
    pos.push(S[i][4], S[i][0], S[i][3])
    for (let j = 0; j < seg; j++) {
      const a = i * row + j
      flip ? idx.push(c, a + 1, a) : idx.push(c, a, a + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  // Weld the seam's normals so no line shows.
  const n = g.attributes.normal
  for (let i = 0; i < S.length; i++) {
    const a = i * row
    const b = a + seg
    const x = n.getX(a) + n.getX(b)
    const y = n.getY(a) + n.getY(b)
    const z = n.getZ(a) + n.getZ(b)
    const l = Math.hypot(x, y, z) || 1
    n.setXYZ(a, x / l, y / l, z / l)
    n.setXYZ(b, x / l, y / l, z / l)
  }
  return g
}

/** A tapered limb from a to b ([x, y, z]) with rounded ends: branches, posts, masts. */
export function limbGeo(a, b, r1, r2, seg = 8) {
  const A = new THREE.Vector3(...a)
  const B = new THREE.Vector3(...b)
  const len = A.distanceTo(B)
  const g = loftGeo(
    [
      [-r1 * 0.92, r1 * 0.4, r1 * 0.4],
      [-r1 * 0.55, r1 * 0.84, r1 * 0.84],
      [0, r1, r1],
      [len, r2, r2],
      [len + r2 * 0.55, r2 * 0.84, r2 * 0.84],
      [len + r2 * 0.92, r2 * 0.4, r2 * 0.4]
    ],
    seg
  )
  g.applyMatrix4(new THREE.Matrix4().compose(A, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()), new THREE.Vector3(1, 1, 1)))
  return g
}

/**
 * Push vertices along their normals by noise of their position. Vertices at the same position move
 * together, so seams don't crack. amt in metres; freq ≈ 2 / radius gives hand-sized lumps.
 */
export function lumpy(g, amt, freq, seed = 1) {
  const pos = g.attributes.position
  const nrm = g.attributes.normal
  const v = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    n.fromBufferAttribute(nrm, i)
    const d = (fbm(v.x * freq + v.z * 0.7 * freq + 31, v.y * freq + v.z * freq * 0.3 + 17, seed, 3) - 0.5) * 2 * amt
    pos.setXYZ(i, v.x + n.x * d, v.y + n.y * d, v.z + n.z * d)
  }
  g.computeVertexNormals()
  return g
}
