// A stand-in for @zos/settings. Zepp OS reports the device language as an
// integer from a fixed table; 2 is English.
const state = { language: 2 };

export function reset() {
  state.language = 2;
}

export function setLanguage(code) {
  state.language = code;
}

export function getLanguage() {
  return state.language;
}
