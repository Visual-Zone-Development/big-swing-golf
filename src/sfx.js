// Every sound on the range, generated: the swish of the club, the crack at impact (brighter for a
// pure strike), the ball's whistle in the air, the thump when it lands, cheers and a fanfare for
// target hits, UI blips, and a breezy loop on the music bus. All of it follows the Settings
// sliders through audio.js.

export function createSfx(audio) {
  const ctx = audio.ctx
  const hz = (m) => 440 * 2 ** ((m - 69) / 12)
  let whistle = null

  function ensureWhistle() {
    if (whistle || !ctx) return whistle
    const len = ctx.sampleRate * 2
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1800
    bp.Q.value = 6
    const gain = ctx.createGain()
    gain.gain.value = 0
    src.connect(bp).connect(gain).connect(audio.buses.sfx)
    src.start()
    whistle = { bp, gain }
    return whistle
  }

  // Music: a light, bouncy loop (plucked bass, a ukulele-ish chord, a shaker), scheduled ahead.
  const BPM = 104
  const step = 60 / BPM / 2
  const ROOTS = [48, 53, 55, 53] // C, F, G, F
  let next = 0
  let n = 0
  let playing = false

  return {
    /** The club coming down: a rising swish while the phone reports the downswing. */
    swish(power) {
      audio.noise({ dur: 0.18, gain: 0.08 + power * 0.18 })
      audio.tone({ freq: 300 + power * 500, dur: 0.16, type: 'sine', gain: 0.05, slide: 600 })
    },
    /** Impact: a sharp tock, brighter and cleaner when it's straight. */
    hit(power, pure) {
      audio.tone({ freq: pure ? 1800 : 1100, dur: 0.05, type: 'triangle', gain: 0.25 + power * 0.2, slide: -600 })
      audio.tone({ freq: pure ? 620 : 420, dur: 0.09, type: 'square', gain: 0.08, slide: -200 })
      audio.noise({ dur: 0.05, gain: 0.25 + power * 0.15 })
      if (pure && power > 0.8) [76, 83, 88].forEach((m, i) => audio.tone({ freq: hz(m), dur: 0.12, type: 'sine', gain: 0.07, delay: 0.05 + i * 0.05 }))
    },
    /** The ball in the air: a soft whistle that follows its speed. */
    fly(speed) {
      const w = ensureWhistle()
      if (!w) return
      const t = ctx.currentTime
      w.gain.gain.setTargetAtTime(Math.min(0.05, speed * 0.0008), t, 0.08)
      w.bp.frequency.setTargetAtTime(900 + speed * 25, t, 0.1)
    },
    stopFly() {
      if (whistle) whistle.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.12)
    },
    land(rough) {
      audio.tone({ freq: rough ? 90 : 130, dur: 0.14, type: 'sine', gain: 0.3, slide: -40 })
      audio.noise({ dur: rough ? 0.12 : 0.06, gain: rough ? 0.12 : 0.07 })
    },
    /** A target hit: bigger for inner rings. */
    target(ring) {
      const notes = ring === 0 ? [72, 76, 79, 84, 88] : ring === 1 ? [72, 76, 79] : [72, 79]
      notes.forEach((m, i) => audio.tone({ freq: hz(m), dur: 0.2, type: 'square', gain: 0.1, delay: i * 0.08 }))
      if (ring === 0) audio.noise({ dur: 1, gain: 0.08, delay: 0.3 }) // crowd-ish cheer
    },
    /** Into the sea: a plop and a fizz. */
    splash() {
      audio.tone({ freq: 320, dur: 0.18, type: 'sine', gain: 0.25, slide: -220 })
      audio.noise({ dur: 0.45, gain: 0.22 })
      audio.tone({ freq: 900, dur: 0.08, type: 'sine', gain: 0.06, slide: 400, delay: 0.12 })
    },
    /** A putter on the ball: a soft click. */
    putt(power) {
      audio.tone({ freq: 1400, dur: 0.03, type: 'triangle', gain: 0.12 + Math.min(1, power) * 0.12, slide: -500 })
      audio.noise({ dur: 0.02, gain: 0.08 })
    },
    /** Into the cup: a hollow clunk, a rattle, and a little fanfare. */
    cup() {
      audio.tone({ freq: 210, dur: 0.12, type: 'sine', gain: 0.32, slide: -90 })
      audio.tone({ freq: 2400, dur: 0.03, type: 'triangle', gain: 0.06, delay: 0.08 })
      audio.tone({ freq: 2100, dur: 0.03, type: 'triangle', gain: 0.05, delay: 0.13 })
      ;[72, 76, 79, 84].forEach((m, i) => audio.tone({ freq: hz(m), dur: 0.16, type: 'square', gain: 0.08, delay: 0.25 + i * 0.07 }))
    },
    /** Round the rim and out: a bright clink. */
    lip() {
      audio.tone({ freq: 2600, dur: 0.05, type: 'triangle', gain: 0.1, slide: -800 })
      audio.tone({ freq: hz(55), dur: 0.25, type: 'triangle', gain: 0.1, slide: -30, delay: 0.12 })
    },
    long() {
      ;[67, 72, 79].forEach((m, i) => audio.tone({ freq: hz(m), dur: 0.18, type: 'triangle', gain: 0.12, delay: i * 0.07 }))
    },
    miss() {
      audio.tone({ freq: hz(55), dur: 0.25, type: 'triangle', gain: 0.12, slide: -30 })
    },
    blip(up = true) {
      audio.tone({ freq: up ? 660 : 520, dur: 0.04, type: 'triangle', gain: 0.07 })
    },
    tick(level) {
      audio.tone({ freq: 400 + level * 600, dur: 0.03, type: 'square', gain: 0.04 })
    },
    join() {
      audio.tone({ freq: 660, dur: 0.08, slide: 200, gain: 0.12 })
    },
    music(on) {
      if (!ctx) return
      if (on && !playing) next = ctx.currentTime + 0.1
      playing = on
    },
    /** Call every frame: schedules the next beats of the loop. */
    update() {
      if (!playing || !ctx || ctx.state !== 'running') return
      while (next < ctx.currentTime + 0.25) {
        const delay = Math.max(0, next - ctx.currentTime)
        const root = ROOTS[Math.floor(n / 8) % 4]
        const beat = n % 8
        if (beat === 0 || beat === 4) audio.tone({ freq: hz(root - 12), dur: step * 1.4, type: 'triangle', bus: 'music', gain: 0.14, delay })
        if (beat === 2 || beat === 5 || beat === 7) for (const iv of [12, 16, 19]) audio.tone({ freq: hz(root + iv), dur: step * 0.5, type: 'triangle', bus: 'music', gain: 0.035, delay })
        audio.noise({ dur: 0.02, bus: 'music', gain: beat % 2 ? 0.02 : 0.012, delay })
        next += step
        n++
      }
    }
  }
}
