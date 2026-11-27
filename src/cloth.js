// Pennants that ripple like cloth in the breeze (the range's target flags and the pin on the green).
// The flag is a grid in its own x–y plane (x along its length from the pole, y up, facing +z); a
// wave travels from the pole to the tip and grows toward the free edge (follow-through: the end
// that isn't held moves most), and the folds are lit, because the wave bends the normals too.
// Every flag has its own phase from where it stands. The breeze's clock is flora.js's `wind`.
import * as THREE from 'three'
import { wind } from './flora.js'

/** A curved pennant `length` long and `height` deep at the pole, as a grid (cols along, rows across). */
export function pennantGeometry(length, height, cols = 14, rows = 4) {
  const bez = (a, c, b, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b
  const tipY = -0.5 * height
  const pos = []
  const idx = []
  for (let i = 0; i <= cols; i++) {
    const u = i / cols
    const x = bez(0, 0.53 * length, length, u)
    const top = bez(0, 0.1 * height, tipY, u)
    const bottom = bez(-height, -0.84 * height, tipY, u)
    for (let j = 0; j <= rows; j++) pos.push(x, bottom + (top - bottom) * (j / rows), 0)
  }
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j
      const b = a + rows + 1
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** A double-sided material for a pennant `length` long that ripples; amp: the wave's depth at the tip, as a share of the length. */
export function clothMaterial(params, length, amp = 0.12) {
  const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, ...params })
  const L = length.toFixed(3)
  const A = (amp * length).toFixed(3)
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uWind;
float clothU(vec3 p) { return clamp(p.x / ${L}, 0.0, 1.0); }
float clothPhase() { return modelMatrix[3].x * 0.41 + modelMatrix[3].z * 0.29; }`
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
{
  float u = clothU(position);
  float w = u * 5.5 - uWind * 7.0 + clothPhase();
  float dzdx = (cos(w) * 5.5 * u + sin(w)) * ${A} / ${L};
  objectNormal = normalize(vec3(-dzdx, 0.0, 1.0));
}`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  float u = clothU(position);
  float w = u * 5.5 - uWind * 7.0 + clothPhase();
  transformed.z += sin(w) * ${A} * u;
  transformed.x -= ${A} * 0.35 * u * u; // the rippling pulls the tip in a little
  transformed.y += sin(w * 0.5 + 1.3) * ${A} * 0.2 * u;
}`
      )
  }
  mat.customProgramCacheKey = () => `cloth-${L}-${A}`
  return mat
}
