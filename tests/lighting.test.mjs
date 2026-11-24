// The lighting pass's sky light (src/lighting.js), without a browser.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as THREE from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { LIGHT, clampSky } from '../src/lighting.js'

const GAME = join(import.meta.dirname, '..')
const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]

test('the sky light leaves out the photo’s sun, so nothing glossy can reflect it as a white blowout', async () => {
  const file = await readFile(join(GAME, 'public/env/sky.hdr'))
  const hdr = new HDRLoader().setDataType(THREE.FloatType).parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))
  const data = hdr.data
  let before = 0
  for (let i = 0; i < data.length; i += 4) before = Math.max(before, lum(data, i))
  assert.ok(before > 10000, `the photo has its sun in it (brightest ${Math.round(before)})`)
  // A blue sky pixel well under the cap is left exactly as it was.
  let sky = -1
  for (let i = 0; i < data.length; i += 4) if (lum(data, i) > 0.3 && lum(data, i) < 1 && data[i + 2] > data[i]) { sky = i; break }
  const skyRgb = [data[sky], data[sky + 1], data[sky + 2]]
  clampSky(data, LIGHT.skyMax)
  let after = 0
  for (let i = 0; i < data.length; i += 4) after = Math.max(after, lum(data, i))
  assert.ok(after <= LIGHT.skyMax + 1e-3, `brightest after ${after}`)
  assert.deepEqual([data[sky], data[sky + 1], data[sky + 2]], skyRgb)
})
