// Every string the watch screen can show, as a key. This is the contract each
// language table must satisfy: the locale-completeness unit test fails if a table
// is missing a key or carries one that is not here.
export const UI_KEYS = [
  "title",
  "play",
  "again",
  "menu",
  "swap",
  "mode_two",
  "mode_cpu",
  "level_easy",
  "level_normal",
  "level_hard",
  "swap_on",
  "swap_off",
  "thinking",
  "swapped",
  "turn_red",
  "turn_blue",
  "turn_you",
  "turn_cpu",
  "win_red",
  "win_blue",
  "win_you",
  "win_cpu",
  "hint",
];

// The on-watch character budgets. Everything is drawn on a round screen with no
// auto-shrinking, so a label that overruns its box is simply clipped, and the
// room a string has depends on where it is drawn.
//
//   MAX_LABEL  - words on the menu buttons, which sit in the widest part of the
//                screen but share it with nothing
//   MAX_STATUS - the line above the board saying whose turn it is or who won; it
//                sits in the cap, where the circle has already narrowed
//   MAX_HINT   - the sentence under the menu, which has a line to itself
export const MAX_LABEL = 13;
export const MAX_STATUS = 16;
export const MAX_HINT = 20;

const STATUS_KEYS = [
  "thinking",
  "swapped",
  "swapped",
  "turn_red",
  "turn_blue",
  "turn_you",
  "turn_cpu",
  "win_red",
  "win_blue",
  "win_you",
  "win_cpu",
];

export function budgetFor(key) {
  if (key === "hint") {
    return MAX_HINT;
  }
  return STATUS_KEYS.indexOf(key) === -1 ? MAX_LABEL : MAX_STATUS;
}
