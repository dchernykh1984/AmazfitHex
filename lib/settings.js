// What the game remembers between runs, kept pure so the storage contract is
// unit tested. The page owns the actual LocalStorage handle; this module owns the
// key names and what a stored value is allowed to mean.
//
// Everything stored is an index into a fixed list rather than a value, so a build
// that adds a board size or a level cannot be confused by what an older build
// wrote - the index is clamped back into range and, at worst, the game reopens on
// a different setting than it was left on.

export const MODE_KEY = "mode";
export const LEVEL_KEY = "level";
export const SIZE_KEY = "boardSize";

// Two seats at one watch, or one seat against the watch.
export const MODE_TWO_PLAYERS = 0;
export const MODE_COMPUTER = 1;
export const MODES = [MODE_TWO_PLAYERS, MODE_COMPUTER];

// Playing against the watch is what a lone owner can do straight away, so that
// is where a fresh install starts.
export const DEFAULT_MODE = MODE_COMPUTER;

// The boards the settings screen offers. Nine cells across is as fine as a
// round watch screen can draw and still leave something to tap; five is a quick
// game that fits in a lift ride.
export const BOARD_SIZES = [5, 7, 9];
export const DEFAULT_SIZE_INDEX = 1;

// An index into a list of the given length. Nothing-at-all is checked before the
// numeric coercion, because Number(null) and Number("") are both 0 - a fresh
// install would otherwise silently start on the first entry instead of the
// intended default.
export function clampIndex(value, length, fallback) {
  const limit = Math.max(1, Math.floor(length));
  const backstop = fallback >= 0 && fallback < limit ? fallback : 0;
  if (value === null || value === undefined || value === "") {
    return backstop;
  }
  const index = Math.floor(Number(value));
  if (!Number.isFinite(index) || index < 0 || index >= limit) {
    return backstop;
  }
  return index;
}

// The next entry in a list, so one button can walk through all of them.
export function nextIndex(value, length, fallback) {
  const limit = Math.max(1, Math.floor(length));
  return (clampIndex(value, limit, fallback) + 1) % limit;
}

export function clampMode(value) {
  return clampIndex(value, MODES.length, DEFAULT_MODE);
}

export function nextMode(value) {
  return nextIndex(value, MODES.length, DEFAULT_MODE);
}

export function clampSizeIndex(value) {
  return clampIndex(value, BOARD_SIZES.length, DEFAULT_SIZE_INDEX);
}

export function nextSizeIndex(value) {
  return nextIndex(value, BOARD_SIZES.length, DEFAULT_SIZE_INDEX);
}

// The board size a stored index means, and the label the settings button shows
// for it. The label is digits only, so it needs no translation.
export function boardSizeFor(index) {
  return BOARD_SIZES[clampSizeIndex(index)];
}

export function boardSizeLabel(index) {
  const size = boardSizeFor(index);
  return size + "x" + size;
}
