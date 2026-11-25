// The golfer's clubs: chunky toy clubs in the player's colour. One shaft and grip, and a head for
// each kind of club, shown as the club changes (driver and 3 wood, irons, wedges, putter).
//
//   const set = makeClubSet({ color, len, dir })  // in the golfer's wrist group: hands at the origin
//   wrist.add(set.root)
//   set.show('7i', hand)                           // a CLUBS id or 'putter'; hand 'R' | 'L'
//
// The shaft runs from the hands along `dir` (a unit vector) to the head at `dir * len`; the grip
// starts `butt` behind the hands. Heads are built in the wrist's frame: up is +y, the face looks
// down the target line (-x for a right-hander; a left-hander's heads are mirrored) and the toe
// points away from the golfer (-z).
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

/** Which head each club wears, and how big. */
const KIND = { dr: ['wood', 1.25], '3w': ['wood', 1.05], '5i': ['iron', 1.5], '7i': ['iron', 1.55], '9i': ['iron', 1.6], pw: ['wedge', 1.6], sw: ['wedge', 1.65], putter: ['putter', 1.5] }

/** Materials for one player's set (their colour on the grip, the crown, the badges). */
function materials(color) {
  const c = new THREE.Color(color)
  return {
    chrome: new THREE.MeshStandardMaterial({ color: '#e3e9f2', metalness: 0.85, roughness: 0.24 }),
    navy: new THREE.MeshStandardMaterial({ color: '#1c2747', metalness: 0.25, roughness: 0.28 }),
    grip: new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }),
    ring: new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.7), roughness: 0.85 }),
    paint: new THREE.MeshStandardMaterial({ color: c, roughness: 0.45 }),
    cream: new THREE.MeshStandardMaterial({ color: '#fff8ec', roughness: 0.6 }),
    ink: new THREE.MeshStandardMaterial({ color: '#14182a', roughness: 0.5 }),
    groove: new THREE.MeshStandardMaterial({ color: '#5b6478', roughness: 0.6 })
  }
}

const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.castShadow = true
  return m
}

/** The shaft, ferrule and grip along +y, from -butt (the grip's end) to len (the hosel). */
function shaftAndGrip(M, len, butt) {
  const g = new THREE.Group()
  const sLen = len + 0.02
  g.add(mesh(new THREE.CylinderGeometry(0.024, 0.016, sLen, 14), M.chrome, 0, sLen / 2 - 0.02, 0))
  // A fat rubber grip in the player's colour, a cream cap and three rings.
  const gripLen = butt + 0.17
  g.add(mesh(new THREE.CylinderGeometry(0.04, 0.032, gripLen, 18), M.grip, 0, gripLen / 2 - butt, 0))
  const cap = mesh(new THREE.SphereGeometry(0.041, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.cream, 0, -butt, 0)
  cap.rotation.x = Math.PI
  g.add(cap)
  for (const y of [-butt * 0.5, 0.02, 0.1]) {
    const ring = mesh(new THREE.TorusGeometry(0.038, 0.004, 6, 20), M.ring, 0, y, 0)
    ring.rotation.x = Math.PI / 2
    g.add(ring)
  }
  g.add(mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.05, 14), M.ink, 0, len - 0.04, 0))
  return g
}

/** One head, its sole at y = 0 and its hosel at the origin. */
function head(M, kind) {
  const g = new THREE.Group()
  if (kind === 'wood') {
    // A big round head: navy and glossy, a crown in the player's colour, a chrome face and sole.
    const body = mesh(new THREE.SphereGeometry(0.1, 28, 18), M.navy, 0.035, 0.045, -0.05)
    body.scale.set(0.95, 0.62, 1.15)
    const crown = mesh(new THREE.SphereGeometry(0.101, 28, 18, 0, Math.PI * 2, 0, 0.5), M.paint, 0.035, 0.045, -0.05)
    crown.scale.copy(body.scale)
    const sole = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 24), M.chrome, 0.035, 0.006, -0.05)
    sole.scale.set(0.95, 1, 1.15)
    g.add(body, crown, sole, mesh(new RoundedBoxGeometry(0.012, 0.075, 0.17, 3, 0.006), M.chrome, -0.055, 0.042, -0.05))
  } else if (kind === 'iron' || kind === 'wedge') {
    // A chunky blade leaning back (more for a wedge), grooves on the face, a badge behind.
    const tall = kind === 'wedge' ? 0.085 : 0.068
    const blade = mesh(new RoundedBoxGeometry(0.034, tall, 0.15, 4, 0.012), M.chrome, 0, tall / 2, -0.06)
    blade.rotation.z = kind === 'wedge' ? -0.5 : -0.3
    for (let i = 0; i < 5; i++) blade.add(mesh(new THREE.BoxGeometry(0.003, 0.003, 0.1), M.groove, -0.018, -tall / 2 + 0.015 + i * (tall / 7), 0))
    blade.add(mesh(new RoundedBoxGeometry(0.012, tall * 0.5, 0.09, 3, 0.005), M.paint, 0.017, -tall * 0.08, 0))
    g.add(blade)
  } else {
    // A fat mallet in the player's colour, a chrome face and a white sight line.
    const mallet = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.045, 28, 1, false, 0, Math.PI), M.paint, -0.03, 0.023, -0.07)
    mallet.rotation.y = Math.PI / 2
    g.add(mallet, mesh(new RoundedBoxGeometry(0.02, 0.046, 0.16, 3, 0.008), M.chrome, -0.035, 0.023, -0.07), mesh(new THREE.BoxGeometry(0.06, 0.003, 0.008), M.cream, 0, 0.047, -0.07))
  }
  return g
}

export function makeClubSet({ color, len, dir, butt = 0.13 }) {
  const M = materials(color)
  const root = new THREE.Group()
  root.name = 'club'
  const shaft = shaftAndGrip(M, len, butt)
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  root.add(shaft)
  // The heads sit where the shaft ends; `side` mirrors them for a left-hander.
  const side = new THREE.Group()
  side.position.copy(dir).multiplyScalar(len)
  root.add(side)
  const heads = {}
  for (const [id, [kind, size]] of Object.entries(KIND)) {
    const h = head(M, kind)
    h.scale.setScalar(size)
    // The middle of the face meets the ball, so the hosel sits a little on the golfer's side.
    h.position.z = (kind === 'putter' ? 0.07 : kind === 'wood' ? 0.05 : 0.06) * size
    h.visible = false
    h.name = id
    side.add(h)
    heads[id] = h
  }
  let shown = null
  return {
    root,
    /** Which club is in the hands (a CLUBS id or 'putter'; unknown ids get the driver). */
    get club() {
      return shown
    },
    show(id, hand = 'R') {
      const want = heads[id] ? id : 'dr'
      if (want !== shown) {
        if (shown) heads[shown].visible = false
        heads[want].visible = true
        shown = want
      }
      side.scale.x = hand === 'L' ? -1 : 1
    }
  }
}
