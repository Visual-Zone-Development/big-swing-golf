// Target challenge scoring: where the ball first lands (its carry) against the target greens.
// Each green has rings; the innermost ring the ball lands in scores its points times the green's
// multiplier (further greens are worth more). Missing every green scores nothing.
import { TUNING, YD } from './tuning.js'

/** @returns {{ points, green: index | -1, ring: index | -1, name, miss: yards to the nearest green's middle }} */
export function scoreLanding(p, T = TUNING.targets) {
  const out = p.z / YD
  const side = p.x / YD
  let best = { points: 0, green: -1, ring: -1, name: 'Missed', miss: Infinity }
  T.greens.forEach((g, gi) => {
    const d = Math.hypot(out - g.yards, side - g.side)
    best.miss = Math.min(best.miss, d)
    const ri = T.rings.findIndex((r) => d <= r.r)
    if (ri < 0) return
    const points = Math.round(T.rings[ri].points * g.mult)
    if (points > best.points) best = { ...best, points, green: gi, ring: ri, name: T.rings[ri].name }
  })
  best.miss = Math.round(best.miss)
  return best
}

/** The challenge's scoreboard: totals, best first (ties keep seat order). */
export function standings(seats) {
  return seats
    .map((s, i) => ({ s, i, total: s.shots.reduce((a, x) => a + (x.points ?? 0), 0) }))
    .sort((a, b) => b.total - a.total || a.i - b.i)
    .map(({ s, total }) => ({ id: s.id, name: s.name, total }))
}
