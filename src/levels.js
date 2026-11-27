// Difficulty: Easy, Normal or Pro, picked by each player and saved by name (game.js). A level is a
// bundle of the numbers that decide how forgiving a swing and a putt are; everything else (the
// course, the drawn cup, the target rings) is the same for everyone. Plain numbers only, so it
// can be tested.
//
//   const L = levelOf(seat.level)
//   readPhoneSwing(shot, { strength: L.strength })   settle(swing, { assist: L.assist })
//   rollPutt(from, dir, speed, cup, L.P, green)       L.meter.rise   L.gimme   L.read
import { TUNING } from './tuning.js'

export const LEVELS = Object.keys(TUNING.levels)
export const DEFAULT_LEVEL = 'normal'

/** A level id from anywhere (a phone, a save): a known one, or the default. */
export const levelId = (id) => (LEVELS.includes(id) ? id : DEFAULT_LEVEL)

/**
 * Everything a level decides: { id, label, sub, icon, strength, assist, read, meter, P, gimme }.
 * meter is TUNING.meter and P is TUNING.putting, each with the level's overrides on top.
 */
export function levelOf(id, T = TUNING) {
  const key = levelId(id)
  const L = T.levels[key]
  return {
    id: key,
    label: L.label,
    sub: L.sub,
    icon: L.icon,
    strength: L.strength,
    assist: L.assist,
    read: L.read,
    meter: { ...T.meter, ...L.meter },
    P: { ...T.putting, ...L.cup, gimme: L.gimme ?? T.putting.gimme },
    gimme: L.gimme ?? T.putting.gimme
  }
}

/** The levels as menu options: [{ value, label }]. */
export const LEVEL_OPTIONS = LEVELS.map((id) => ({ value: id, label: TUNING.levels[id].label }))
