// How the resort is lit and finished (the lighting pass), kept apart from what's in it.
//
//   High (a real GPU):  light from a CC0 sky (image-based light), a warm sun with soft shadows that
//                       follow the action, a cool fill, a rim light that outlines the golfers
//                       against the course, then a finishing stack: ambient occlusion in the
//                       creases, a little bloom on the brightest things, a warm grade and a vignette.
//   Low  (no GPU, slow frames, or Graphics: Low):  the sun and a stronger fill, no sky light,
//                       shadows or finishing stack, at half resolution (view3d.js's light mode).
//                       On a software renderer the sky light alone costs more than the rest of
//                       the frame, so it isn't even loaded until something asks for High.
//
// The sky light is Poly Haven's "Kloofendal 48d Partly Cloudy (Pure Sky)" (CC0, Greg Zaal and
// Jarod Guest), public/env/sky.hdr: it lights; the visible sky is still the game's own. Its sun is
// taken out as it loads (LIGHT.skyMax): the sun is our own DirectionalLight, and the photo's sun is
// 60,000 times the sky, half of all its light, so anything a little glossy that caught its
// reflection (beans, hats, beach huts) blew out to white.
import * as THREE from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

export const LIGHT = {
  sky: 0.42, // how strongly the sky image lights things (scene.environmentIntensity)
  skyMax: 6, // the brightest the sky image may be (the photo's sun is ~60,000; its open sky ~0.2–8)
  fill: { sky: '#dcefff', ground: '#7a9a4a', intensity: 0.3, low: 1.05 }, // hemisphere fill, under the sky light (low: standing in for it)
  sun: { color: '#fff1d6', intensity: 3.1, from: [-0.55, 0.62, 0.55] }, // direction the light comes from (three space)
  rim: { color: '#cfe6ff', intensity: 1.1 }, // from behind what the camera looks at
  shadow: { size: 26, map: 2048, radius: 4, bias: -0.0004, normalBias: 0.02 },
  exposure: 0.9,
  // Bloom works on the light before tone mapping: sunlit grass is already above 1 there, so only
  // things far brighter than that (the lighthouse lamp, sparkles, the sun on the sea) glow.
  bloom: { strength: 0.18, radius: 0.4, threshold: 3 },
  ao: { radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1, blend: 0.85 },
  grade: { warmth: 0.03, saturation: 1.1, vignette: 0.26 }
}

/** Warm grade, a touch more saturation, a soft vignette: the finishing pass, after tone mapping. */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, warmth: { value: LIGHT.grade.warmth }, saturation: { value: LIGHT.grade.saturation }, vignette: { value: LIGHT.grade.vignette } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float warmth; uniform float saturation; uniform float vignette; varying vec2 vUv;
void main(){
  vec4 c = texture2D(tDiffuse, vUv);
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  c.rgb = mix(vec3(l), c.rgb, saturation);
  c.rgb += vec3(warmth, warmth * 0.35, -warmth * 0.6) * (0.4 + 0.6 * l);
  vec2 d = vUv - 0.5;
  c.rgb *= 1.0 - vignette * smoothstep(0.35, 0.85, length(d * vec2(1.15, 1.0)));
  gl_FragColor = c;
}`
}

/** Scale down every pixel brighter than max (RGBA floats), keeping its colour: takes the sun out. */
export function clampSky(data, max) {
  for (let i = 0; i < data.length; i += 4) {
    const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    if (l > max) {
      const k = max / l
      data[i] *= k
      data[i + 1] *= k
      data[i + 2] *= k
    }
  }
}

/**
 * Light the scene. Returns { update(focus, camera), render(camera), resize(w, h), setLow(low),
 * get low }. focus: the game-space point the action is at ({ x, z }), for the shadows.
 */
export function createLighting(renderer, scene, { low = false, sky = './env/sky.hdr' } = {}) {
  // Neutral tone mapping keeps saturated colours saturated (ACES greys them), which a bright
  // cartoon resort needs.
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = LIGHT.exposure
  renderer.shadowMap.type = THREE.PCFShadowMap // soft via shadow.radius (PCFSoftShadowMap is gone in r186)

  // Image-based light (High only): a soft studio stand-in right away, the sky as soon as it loads.
  let env = null
  function skyLight() {
    if (env) return env
    const pmrem = new THREE.PMREMGenerator(renderer)
    env = { texture: pmrem.fromScene(new RoomEnvironment(), 0.04).texture, intensity: LIGHT.sky * 0.7 }
    if (sky) {
      new HDRLoader().setDataType(THREE.FloatType).load(
        sky,
        (hdr) => {
          clampSky(hdr.image.data, LIGHT.skyMax)
          hdr.mapping = THREE.EquirectangularReflectionMapping
          env.texture = pmrem.fromEquirectangular(hdr).texture
          env.intensity = LIGHT.sky
          hdr.dispose()
          if (!low) setLow(false)
        },
        undefined,
        () => {} // keep the stand-in
      )
    }
    return env
  }

  const fill = new THREE.HemisphereLight(LIGHT.fill.sky, LIGHT.fill.ground, LIGHT.fill.intensity)
  scene.add(fill)
  const sun = new THREE.DirectionalLight(LIGHT.sun.color, LIGHT.sun.intensity)
  sun.castShadow = true
  const S = LIGHT.shadow
  sun.shadow.mapSize.set(S.map, S.map)
  Object.assign(sun.shadow.camera, { left: -S.size, right: S.size, top: S.size, bottom: -S.size, near: 1, far: 140 })
  sun.shadow.bias = S.bias
  sun.shadow.normalBias = S.normalBias
  sun.shadow.radius = S.radius
  scene.add(sun, sun.target)
  const rim = new THREE.DirectionalLight(LIGHT.rim.color, LIGHT.rim.intensity)
  scene.add(rim, rim.target)
  const sunDir = new THREE.Vector3(...LIGHT.sun.from).normalize()
  const fwd = new THREE.Vector3()
  const snap = S.size * 2 / S.map // move the shadow in whole texels, so it doesn't shimmer

  // The finishing stack (High only).
  let composer = null
  let ao = null
  let w = 1280
  let h = 800
  function buildComposer(camera) {
    const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 })
    composer = new EffectComposer(renderer, target)
    composer.addPass(new RenderPass(scene, camera))
    ao = new GTAOPass(scene, camera, w, h)
    ao.updateGtaoMaterial({ radius: LIGHT.ao.radius, distanceExponent: LIGHT.ao.distanceExponent, thickness: LIGHT.ao.thickness, scale: LIGHT.ao.scale })
    ao.blendIntensity = LIGHT.ao.blend
    // The occlusion pass draws everything as solid: leave out what isn't (sprites like the ball's
    // glow, cut-out cards like the grass tufts, see-through things), or they'd shade as boxes.
    const hidden = []
    const hideMore = ao._overrideVisibility.bind(ao)
    const showMore = ao._restoreVisibility.bind(ao)
    ao._overrideVisibility = () => {
      hideMore()
      scene.traverse((o) => {
        const m = o.material
        if (o.visible && (o.isSprite || (m && (m.transparent || m.alphaTest > 0)))) {
          hidden.push(o)
          o.visible = false
        }
      })
    }
    ao._restoreVisibility = () => {
      for (const o of hidden) o.visible = true
      hidden.length = 0
      showMore()
    }
    composer.addPass(ao)
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), LIGHT.bloom.strength, LIGHT.bloom.radius, LIGHT.bloom.threshold))
    composer.addPass(new OutputPass())
    composer.addPass(new ShaderPass(GradeShader))
    composer.setPixelRatio(renderer.getPixelRatio())
    composer.setSize(w, h)
  }

  function setLow(on) {
    low = on
    sun.castShadow = !on
    renderer.shadowMap.enabled = !on
    fill.intensity = on ? LIGHT.fill.low : LIGHT.fill.intensity
    if (on) scene.environment = null
    else {
      const e = skyLight()
      scene.environment = e.texture
      scene.environmentIntensity = e.intensity
    }
  }
  setLow(low)

  return {
    sun,
    rim,
    fill,
    get low() {
      return low
    },
    setLow,
    /** Aim the sun's shadow at the action and the rim light at the camera's subject. */
    update(focus, camera) {
      const fx = Math.round(focus.x / snap) * snap
      const fz = Math.round(-focus.z / snap) * snap
      sun.target.position.set(fx, 0, fz)
      sun.position.set(fx + sunDir.x * 60, sunDir.y * 60, fz + sunDir.z * 60)
      // Rim: from beyond what the camera looks at, back toward the camera, a little from above.
      camera.getWorldDirection(fwd)
      rim.target.position.copy(camera.position)
      rim.position.copy(camera.position).addScaledVector(fwd, 40).add(new THREE.Vector3(0, 18, 0))
    },
    render(camera) {
      if (low) return renderer.render(scene, camera)
      if (!composer) buildComposer(camera)
      composer.passes[0].camera = camera
      ao.camera = camera
      composer.render()
    },
    resize(width, height) {
      w = width
      h = height
      if (composer) {
        composer.setPixelRatio(renderer.getPixelRatio())
        composer.setSize(w, h)
      }
    }
  }
}
