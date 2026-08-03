// Flat integer buffers for the parts of the game that run hot. The computer
// opponent walks the board tens of thousands of times per move on a watch CPU,
// so every board and every scratch buffer it uses is a flat array allocated once
// and reused rather than an array of objects rebuilt per position.
//
// Zepp OS exposes typed arrays, but a plain array is a correct (if slower)
// stand-in, so the helpers fall back instead of throwing on a runtime that does
// not have them.

function zeroed(length) {
  const array = new Array(length);
  for (let i = 0; i < length; i++) {
    array[i] = 0;
  }
  return array;
}

function lengthOf(value) {
  const length = Math.floor(Number(value));
  return Number.isFinite(length) && length > 0 ? length : 0;
}

// Holds cell contents: values 0..255, one byte each.
export function createByteArray(length) {
  const size = lengthOf(length);
  if (typeof Uint8Array === "function") {
    return new Uint8Array(size);
  }
  return zeroed(size);
}

// Holds distances, queues and cell indexes: signed and comfortably wider than
// any board.
export function createIntArray(length) {
  const size = lengthOf(length);
  if (typeof Int32Array === "function") {
    return new Int32Array(size);
  }
  return zeroed(size);
}
