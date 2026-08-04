// A stand-in for @zos/display. The page asks the watch to keep the screen lit
// while a game is open and hands the setting back when it closes; the double
// records both so a test can check the pair is balanced.
const state = { brightTime: null, reset: 0 };

export function reset() {
  state.brightTime = null;
  state.reset = 0;
}

export function display() {
  return Object.assign({}, state);
}

export function setPageBrightTime(options) {
  state.brightTime = options.brightTime;
}

export function resetPageBrightTime() {
  state.reset += 1;
}
