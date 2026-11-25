// The bean's shape (public/beans/bean.glb), without a browser: a chunky jelly-bean capsule with
// thick stubby limbs, not an egg on sticks. Measured from the model's front silhouette.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const GAME = join(import.meta.dirname, '..')
const HEIGHT = 1.45 // HEIGHT in src/beans/beans.js
const CELL = 0.01 // the silhouette's grid, in metres

/** The body's triangles from a GLB (positions in metres, feet at y = 0, front +z). */
function readMesh(file) {
  const b = readFileSync(file)
  const jl = b.readUInt32LE(12)
  const j = JSON.parse(b.subarray(20, 20 + jl).toString())
  const bin = 20 + jl + 8
  const read = (i) => {
    const a = j.accessors[i]
    const v = j.bufferViews[a.bufferView]
    const n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type]
    const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType]
    const stride = v.byteStride ? v.byteStride / T.BYTES_PER_ELEMENT : n
    const off = b.byteOffset + bin + (v.byteOffset ?? 0) + (a.byteOffset ?? 0)
    const raw = new T(b.buffer.slice(off, off + ((a.count - 1) * stride + n) * T.BYTES_PER_ELEMENT))
    const out = new Float32Array(a.count * n)
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = raw[k * stride + c]
    return out
  }
  const p = j.meshes[0].primitives[0]
  const pos = read(p.attributes.POSITION)
  const joints = read(p.attributes.JOINTS_0)
  const weights = read(p.attributes.WEIGHTS_0)
  const names = j.skins[0].joints.map((n) => j.nodes[n].name)
  // Each vertex's part: the bone that moves it most.
  const part = Array.from({ length: pos.length / 3 }, (_, i) => {
    let best = 0
    for (let k = 1; k < 4; k++) if (weights[i * 4 + k] > weights[i * 4 + best]) best = k
    const bone = names[joints[i * 4 + best]] ?? ''
    return /Shoulder|Arm|Hand/.test(bone) ? (/^Left(Arm|ForeArm)$/.test(bone) ? 'leftArm' : 'arm') : /Leg|Foot|Toe/.test(bone) ? 'leg' : 'body'
  })
  return { pos, index: read(p.indices), part }
}

/** Only the triangles of some parts ('body', 'arm', 'leg'). */
function only(mesh, ...parts) {
  const keep = []
  for (let f = 0; f < mesh.index.length; f += 3) {
    const t = [mesh.index[f], mesh.index[f + 1], mesh.index[f + 2]]
    if (t.every((v) => parts.includes(mesh.part[v]))) keep.push(...t)
  }
  return { ...mesh, index: keep }
}

/** The front silhouette: a grid of cells (x across, y up) any triangle covers. */
function silhouette({ pos, index }) {
  const W = Math.ceil(2 / CELL)
  const H = Math.ceil(1.6 / CELL)
  const grid = new Uint8Array(W * H)
  const cx = (x) => x / CELL + W / 2
  const cy = (y) => y / CELL
  for (let f = 0; f < index.length; f += 3) {
    const v = [0, 1, 2].map((k) => [cx(pos[index[f + k] * 3]), cy(pos[index[f + k] * 3 + 1])])
    const [x0, x1] = [Math.floor(Math.min(...v.map((p) => p[0]))), Math.ceil(Math.max(...v.map((p) => p[0])))]
    const [y0, y1] = [Math.floor(Math.min(...v.map((p) => p[1]))), Math.ceil(Math.max(...v.map((p) => p[1])))]
    const area = (a, b2, c) => (b2[0] - a[0]) * (c[1] - a[1]) - (b2[1] - a[1]) * (c[0] - a[0])
    const A = area(v[0], v[1], v[2])
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
        const q = [x + 0.5, y + 0.5]
        const s = [area(v[1], v[2], q), area(v[2], v[0], q), area(v[0], v[1], q)]
        const inside = A > 0 ? s.every((t) => t >= -1e-6) : s.every((t) => t <= 1e-6)
        if (inside || Math.abs(A) < 1e-9) grid[y * W + x] = 1
      }
    }
  }
  /** The runs of filled cells in the row at height y (metres): [from, to] in metres. */
  const runs = (y) => {
    const row = Math.min(H - 1, Math.floor(y / CELL))
    const out = []
    let start = -1
    for (let x = 0; x <= W; x++) {
      const on = x < W && grid[row * W + x]
      if (on && start < 0) start = x
      if (!on && start >= 0) {
        out.push([(start - W / 2) * CELL, (x - W / 2) * CELL])
        start = -1
      }
    }
    return out
  }
  /** The body's width at height y: the run through the middle. */
  const body = (y) => {
    const r = runs(y).find(([a, b2]) => a <= 0 && b2 >= 0)
    return r ? r[1] - r[0] : 0
  }
  return { runs, body }
}

const mesh = readMesh(join(GAME, 'public/beans/bean.glb'))
const bean = silhouette(only(mesh, 'body', 'leg')) // the arms hang beside the body: leave them out

/** A limb's radius: the median distance of its vertices from its own long axis (found by power iteration). */
function limbRadius({ pos, part }, which) {
  const pts = []
  for (let i = 0; i < part.length; i++) if (part[i] === which) pts.push([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]])
  const c = [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / pts.length)
  const d = pts.map((p) => p.map((v, k) => v - c[k]))
  let axis = [0.6, -0.6, 0.1]
  for (let it = 0; it < 30; it++) {
    const next = [0, 0, 0]
    for (const p of d) {
      const t = p[0] * axis[0] + p[1] * axis[1] + p[2] * axis[2]
      for (let k = 0; k < 3; k++) next[k] += p[k] * t
    }
    const l = Math.hypot(...next)
    axis = next.map((v) => v / l)
  }
  const r = d.map((p) => {
    const t = p[0] * axis[0] + p[1] * axis[1] + p[2] * axis[2]
    return Math.hypot(p[0] - axis[0] * t, p[1] - axis[1] * t, p[2] - axis[2] * t)
  })
  return r.sort((a, b) => a - b)[r.length >> 1]
}
// The torso and head (one shape): from where the legs join to the crown.
const torso = Array.from({ length: 30 }, (_, i) => (0.38 + i * 0.019) * HEIGHT)
const widest = Math.max(...torso.map((y) => bean.body(y)))

test('the sculpted bean is a capsule: as wide near the top of its head as through its middle', () => {
  const crown = bean.body(0.85 * HEIGHT)
  assert.ok(crown >= 0.9 * widest, `width at 85% of its height ${crown.toFixed(2)} m vs widest ${widest.toFixed(2)} m`)
  // …and no fatter low down than high up: an egg's widest point sits low.
  const low = bean.body(0.45 * HEIGHT)
  const high = bean.body(0.78 * HEIGHT)
  assert.ok(high >= 0.95 * low, `width at 78% ${high.toFixed(2)} m vs at 45% ${low.toFixed(2)} m`)
})

test('the sculpted bean is chunky: about half as wide as it is tall', () => {
  assert.ok(widest >= 0.47 * HEIGHT, `widest ${widest.toFixed(2)} m for a ${HEIGHT} m bean`)
})

test('the sculpted bean stands on thick stubby legs, not sticks', () => {
  // Just above the shoes: a leg either side of the middle, each a good fraction of the body's width.
  const y = 0.2 * HEIGHT
  const legs = bean.runs(y).filter(([a, b2]) => b2 - a > 0.02 && (a > 0 || b2 < 0))
  assert.ok(legs.length >= 2, `found ${legs.length} legs at ${y.toFixed(2)} m`)
  for (const [a, b2] of legs) assert.ok(b2 - a >= 0.25 * widest, `a leg ${(b2 - a).toFixed(2)} m wide vs body ${widest.toFixed(2)} m`)
})

test('the sculpted bean has thick, chubby arms', () => {
  // The left arm (upper arm and forearm, not the glove), across.
  const r = limbRadius(mesh, 'leftArm')
  assert.ok(2 * r >= 0.16 * widest, `the arm is ${(2 * r).toFixed(3)} m thick vs body ${widest.toFixed(2)} m`)
})

test('the model is still the height the game is built around, feet on the ground', () => {
  const { pos } = readMesh(join(GAME, 'public/beans/bean.glb'))
  let lo = Infinity
  let hi = -Infinity
  for (let i = 1; i < pos.length; i += 3) ((lo = Math.min(lo, pos[i])), (hi = Math.max(hi, pos[i])))
  assert.ok(Math.abs(lo) < 0.005, `feet at ${lo}`)
  assert.ok(Math.abs(hi - HEIGHT) < 0.01, `top at ${hi}`)
})

test('the hand-built bean (light mode, and while the models load) is the same capsule, not an egg', async () => {
  const { BEAN, radiusAt } = await import('../src/characters.js')
  const r = (k) => radiusAt(BEAN.y0 + k * (BEAN.y1 - BEAN.y0))
  const widestHand = Math.max(...Array.from({ length: 50 }, (_, i) => r(0.2 + i * 0.012)))
  assert.ok(Math.abs(BEAN.y1 - HEIGHT) < 0.01, `top at ${BEAN.y1}`)
  assert.ok(r(0.75) >= 0.95 * widestHand, `radius three quarters up ${r(0.75).toFixed(3)} vs widest ${widestHand.toFixed(3)}`)
  assert.ok(r(0.3) <= 1.02 * r(0.7), `no fuller low (${r(0.3).toFixed(3)}) than high (${r(0.7).toFixed(3)})`)
  assert.ok(2 * widestHand >= 0.47 * HEIGHT, `${(2 * widestHand).toFixed(2)} m wide`)
})
