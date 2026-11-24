// A green's surface, as plain numbers: any green described like putting.js's GREEN (a centre,
// half-widths, a fringe, a base height, a tilt and a few humps). Shared by the practice green
// (putting.js) and the course's greens (course.js), and by the ground (terrain.js), so it
// imports nothing.

/** How far out from the middle a point is: < 1 on the green, < 1 + fringe on the fringe. */
export function greenReach(x, z, G) {
  return Math.hypot((x - G.x) / G.rx, (z - G.z) / G.rz)
}

/** The putting surface's height (m), green only: tilt plus humps and hollows. */
function greenOnly(x, z, G) {
  const u = x - G.x
  const v = z - G.z
  let h = G.base + G.tilt[0] * u + G.tilt[1] * v
  for (const b of G.bumps) h += b.h * Math.exp(-((u - b.x) ** 2 + (v - b.z) ** 2) / (2 * b.r * b.r))
  return h
}

/** Height (m) of the ground at (x, z) around the green: the green, its fringe sloping down, then 0. */
export function greenHeight(x, z, G) {
  const e = greenReach(x, z, G)
  if (e <= 1) return greenOnly(x, z, G)
  if (e >= 1 + G.fringe) return 0
  // On the fringe: from the green's edge (straight out from the middle) down to the ground.
  const edge = greenOnly(G.x + (x - G.x) / e, G.z + (z - G.z) / e, G)
  const t = (e - 1) / G.fringe
  return edge * (1 - t * t * (3 - 2 * t))
}

/** 'green' | 'fringe' | 'off'. */
export function greenSurface(x, z, G) {
  const e = greenReach(x, z, G)
  return e <= 1 ? 'green' : e < 1 + G.fringe ? 'fringe' : 'off'
}
