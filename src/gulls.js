// A few gulls wheeling over the beach: ambient life for the resort (pushplay-kit's environments
// skill: a few movements make a space alive). One instanced mesh; each gull circles its own spot,
// banks into the turn, and flaps in bursts between long glides (the flap is in the vertex shader).
// Game space: x right, z downrange; three.js puts game z at -z.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { loftGeo } from './forms3d.js'
import { wind } from './flora.js'

function paint(g, color) {
  const geo = g.index ? g.toNonIndexed() : g
  geo.computeVertexNormals()
  const c = new THREE.Color(color)
  const col = new Float32Array(geo.attributes.position.count * 3)
  for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i)
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'color'].includes(k)) geo.deleteAttribute(k)
  return geo
}

/** A gull about 1.3 m across, flying toward -z: a shaped body, swept wings with grey tips, a yellow beak. */
function gullGeometry() {
  const body = loftGeo([[-0.42, 0.02, 0.02], [-0.3, 0.07, 0.06], [-0.05, 0.11, 0.1], [0.18, 0.09, 0.09], [0.3, 0.06, 0.06], [0.36, 0.02, 0.02]], 8).rotateX(-Math.PI / 2)
  const parts = [paint(body, '#ffffff')]
  const beak = loftGeo([[0, 0.025, 0.02], [0.12, 0.004, 0.004]], 5).rotateX(-Math.PI / 2).translate(0, 0, -0.36)
  parts.push(paint(beak, '#ffc23a'))
  for (const s of [-1, 1]) {
    // A wing: an inner panel and a swept grey tip, each a thin slab.
    const inner = new THREE.Shape()
    inner.moveTo(0, -0.12)
    inner.lineTo(0.38, -0.06)
    inner.lineTo(0.38, 0.1)
    inner.lineTo(0, 0.12)
    const tip = new THREE.Shape()
    tip.moveTo(0.37, -0.06)
    tip.lineTo(0.66, 0.06)
    tip.lineTo(0.37, 0.1)
    for (const [shape, col] of [[inner, '#f4f6fa'], [tip, '#6c7480']]) {
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.015, bevelEnabled: false }).rotateX(Math.PI / 2)
      if (s < 0) g.scale(-1, 1, 1)
      parts.push(paint(g, col))
    }
  }
  return mergeGeometries(parts)
}

/** Add the gulls; returns { update(dt) }. spots: [{ x, z, y, r }] in game space (circle centre, height, radius). */
export function createGulls(scene, spots) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
{
  float ph = 0.0;
#ifdef USE_INSTANCING
  ph = instanceMatrix[3].y * 1.7;
#endif
  float burst = smoothstep(-0.2, 0.4, sin(uWind * 0.45 + ph)); // flap for a while, then glide
  float flap = sin(uWind * 9.0 + ph) * 0.55 * burst + 0.12; // glides with the wings a little up
  float a = abs(position.x);
  transformed.y += sin(flap) * a * (0.6 + a);
  transformed.x *= 1.0 - (1.0 - cos(flap)) * 0.5;
}`
    )
  }
  mat.customProgramCacheKey = () => 'gull'
  const mesh = new THREE.InstancedMesh(gullGeometry(), mat, spots.length)
  mesh.frustumCulled = false
  scene.add(mesh)
  const d = new THREE.Object3D()
  let t = 0
  const place = () => {
    spots.forEach((s, i) => {
      const speed = 0.22 + (i % 3) * 0.05
      const dir = i % 2 ? 1 : -1
      const a = t * speed * dir + i * 2.1
      d.position.set(s.x + Math.cos(a) * s.r, s.y + Math.sin(t * 0.3 + i) * 1.5, -(s.z + Math.sin(a) * s.r))
      // Fly along the circle (the model faces -z) and bank into the turn.
      d.rotation.set(0, a + (dir < 0 ? Math.PI : 0), 0)
      d.rotateZ(dir * 0.35)
      d.scale.setScalar(1.4)
      d.updateMatrix()
      mesh.setMatrixAt(i, d.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }
  place()
  return {
    mesh,
    update(dt) {
      t += dt
      place()
    }
  }
}
