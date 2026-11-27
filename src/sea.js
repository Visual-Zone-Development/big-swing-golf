// The sea: one big plane at sea level with a shader that knows how deep the water is under it (a
// depth map baked from terrain.js), so it can be clear turquoise over the sand near the beach and deep
// blue offshore, with white foam that laps up and down the waterline and a second line of surf rolling
// in, and small moving waves that catch the sun as glints. Game space: x right, z downrange; three.js
// puts game z at -z.
import * as THREE from 'three'
import { landHeight, SEA_LEVEL } from './terrain.js'

export const SEA = {
  shallow: '#56dccf', // over sand, just off the beach
  mid: '#1f9fd6', // the style's sea colour
  deep: '#1670c4',
  foam: '#ffffff',
  maxDepth: 3.4, // m: the deepest the seabed gets near the resort (deeper reads as "deep")
  // The baked depth map covers the land mesh (scenery.js): x -410..410, game z -60..760.
  map: { x0: -410, z0: -60, size: 820, res: 256 }
}

/** How deep the water is at a point, 0 (dry or the waterline) to 1 (maxDepth or deeper). */
export function seaDepth(x, z) {
  return Math.min(1, Math.max(0, (SEA_LEVEL - landHeight(x, z)) / SEA.maxDepth))
}

function depthTexture() {
  const { x0, z0, size, res } = SEA.map
  const data = new Uint8Array(res * res * 4)
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const d = seaDepth(x0 + ((i + 0.5) / res) * size, z0 + ((j + 0.5) / res) * size)
      const k = (j * res + i) * 4
      data[k] = Math.round(d * 255)
      data[k + 3] = 255
    }
  }
  const t = new THREE.DataTexture(data, res, res)
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearFilter
  t.needsUpdate = true
  return t
}

/** The sea's mesh, and update(dt) for its waves and foam. */
export function createSea() {
  const time = { value: 0 }
  const mat = new THREE.MeshStandardMaterial({ color: SEA.mid, roughness: 0.14, metalness: 0.05, transparent: true, opacity: 0.9 })
  const { x0, z0, size } = SEA.map
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uTime: time,
      uDepth: { value: depthTexture() },
      uMap: { value: new THREE.Vector3(x0, z0, size) },
      uShallow: { value: new THREE.Color(SEA.shallow) },
      uMid: { value: new THREE.Color(SEA.mid) },
      uDeep: { value: new THREE.Color(SEA.deep) },
      uFoam: { value: new THREE.Color(SEA.foam) }
    })
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeaWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSeaWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vSeaWorld;
uniform float uTime;
uniform sampler2D uDepth;
uniform vec3 uMap;
uniform vec3 uShallow;
uniform vec3 uMid;
uniform vec3 uDeep;
uniform vec3 uFoam;
float seaDepthAt(vec2 g) {
  vec2 uv = (g - uMap.xy) / uMap.z;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 1.0;
  return texture2D(uDepth, uv).r;
}`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec2 g = vec2(vSeaWorld.x, -vSeaWorld.z); // game x, z
float d = seaDepthAt(g);
vec3 water = mix(uShallow, uMid, smoothstep(0.02, 0.45, d));
water = mix(water, uDeep, smoothstep(0.55, 1.0, d));
// Foam: a band that laps up and down the waterline, and a line of surf rolling in behind it.
float lap = 0.07 + 0.03 * sin(uTime * 1.4 + g.x * 0.08 + g.y * 0.05);
float foam = 1.0 - smoothstep(lap * 0.6, lap, d);
float roll = fract(uTime * 0.11 + g.x * 0.004);
float surf = (1.0 - smoothstep(0.0, 0.018, abs(d - 0.08 - roll * 0.2))) * (1.0 - roll) * 0.85;
float broken = 0.6 + 0.4 * sin(g.x * 0.9 + g.y * 0.7 + uTime * 0.8) * sin(g.x * 0.37 - g.y * 0.53);
foam = clamp(max(foam, surf * broken), 0.0, 1.0);
diffuseColor.rgb = mix(water, uFoam, foam);
// Clear over the sand, solid offshore and in the foam.
diffuseColor.a *= mix(0.55, 1.0, max(smoothstep(0.0, 0.5, d), foam));`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  // Small waves: a few travelling sines tilt the surface so the sun glints off it.
  float t = uTime;
  vec2 w = vec2(
    0.08 * cos(g.x * 0.21 + t * 1.3) + 0.06 * cos((g.x + g.y) * 0.37 + t * 1.9) + 0.03 * cos(g.y * 0.83 - t * 2.6),
    0.08 * cos(g.y * 0.17 - t * 1.1) + 0.06 * cos((g.x - g.y) * 0.29 + t * 1.6) + 0.03 * cos(g.x * 0.71 + t * 2.3)
  );
  normal = normalize(normal + (viewMatrix * vec4(w.x, 0.0, -w.y, 0.0)).xyz);
}`
      )
  }
  mat.customProgramCacheKey = () => 'seaside-sea'
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(0, SEA_LEVEL, -600)
  return {
    mesh,
    update(dt) {
      time.value += dt
    }
  }
}
