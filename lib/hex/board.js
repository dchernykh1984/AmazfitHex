// The shape of a Hex board: how the cells of an n x n rhombus are numbered,
// which cells touch each other and which cells sit on which player's edge.
//
// Hex is played on a rhombus of hexagons. Red owns the first and the last row
// and wins by joining them; Blue owns the first and the last column. The four
// corner cells belong to one edge of each player, which is why a cell can carry
// two edge bits at once.
//
// Cells are addressed as `row * size + column`, and the six neighbours of
// (column, row) are the axial hex directions:
//
//     (c-1, r  )  (c+1, r  )
//     (c  , r-1)  (c+1, r-1)
//     (c  , r+1)  (c-1, r+1)
//
// Everything here depends on the board size alone, so it is built once per size
// and cached: the search reads these tables constantly and the watch has no
// cycles to spare for rebuilding them.

import { createByteArray, createIntArray } from "./arrays.js";

// Cell contents. EMPTY is 0 so a freshly zeroed buffer is an empty board.
export const EMPTY = 0;
export const RED = 1;
export const BLUE = 2;

export const MIN_SIZE = 3;
export const MAX_SIZE = 11;
export const DEFAULT_SIZE = 7;

// Every cell has at most six neighbours, so adjacency is one flat array with a
// fixed stride rather than an array of arrays: a single allocation and no
// pointer chasing per lookup.
export const MAX_NEIGHBORS = 6;

// Edge membership, as bits in topology.edges[cell].
export const EDGE_RED_START = 1;
export const EDGE_RED_END = 2;
export const EDGE_BLUE_START = 4;
export const EDGE_BLUE_END = 8;

// Indexed by borderSlot(): red start, red end, blue start, blue end.
export const BORDER_MASKS = [EDGE_RED_START, EDGE_RED_END, EDGE_BLUE_START, EDGE_BLUE_END];

const DIRECTIONS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [1, -1],
  [0, 1],
  [-1, 1],
];

export function opponent(player) {
  return player === RED ? BLUE : RED;
}

// A stored or user-supplied board size, forced into the range the rest of the
// code is written for.
export function clampSize(size) {
  const value = Math.floor(Number(size));
  if (!Number.isFinite(value)) {
    return DEFAULT_SIZE;
  }
  if (value < MIN_SIZE) {
    return MIN_SIZE;
  }
  if (value > MAX_SIZE) {
    return MAX_SIZE;
  }
  return value;
}

// Which of the four edges a (player, side) pair names. Side 0 is the edge a
// player's chain starts from, side 1 the edge it has to reach; the two are
// interchangeable, so the search walks the board from either end.
export function borderSlot(player, side) {
  return (player === RED ? 0 : 2) + (side ? 1 : 0);
}

export function borderMask(player, side) {
  return BORDER_MASKS[borderSlot(player, side)];
}

function buildTopology(size) {
  const cellCount = size * size;
  const neighbors = createIntArray(cellCount * MAX_NEIGHBORS);
  const degree = createByteArray(cellCount);
  const edges = createByteArray(cellCount);
  const centerBias = createIntArray(cellCount);
  const borders = [[], [], [], []];

  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const cell = row * size + column;

      let count = 0;
      for (let d = 0; d < DIRECTIONS.length; d++) {
        const c = column + DIRECTIONS[d][0];
        const r = row + DIRECTIONS[d][1];
        if (c >= 0 && c < size && r >= 0 && r < size) {
          neighbors[cell * MAX_NEIGHBORS + count] = r * size + c;
          count += 1;
        }
      }
      degree[cell] = count;

      let mask = 0;
      if (row === 0) {
        mask |= EDGE_RED_START;
        borders[0].push(cell);
      }
      if (row === size - 1) {
        mask |= EDGE_RED_END;
        borders[1].push(cell);
      }
      if (column === 0) {
        mask |= EDGE_BLUE_START;
        borders[2].push(cell);
      }
      if (column === size - 1) {
        mask |= EDGE_BLUE_END;
        borders[3].push(cell);
      }
      edges[cell] = mask;

      // Hex distance from the middle of the board, in doubled coordinates so an
      // even-sized board (whose middle falls between cells) still yields whole
      // numbers. Used only to break ties between equally rated moves, where
      // Hex theory says the more central cell is the better one.
      const dq = 2 * column - (size - 1);
      const dr = 2 * row - (size - 1);
      centerBias[cell] = Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr);
    }
  }

  return { size, cellCount, neighbors, degree, edges, borders, centerBias };
}

const topologies = {};

// The (cached) topology for a board size. Sizes are clamped, so the cache holds
// at most MAX_SIZE - MIN_SIZE + 1 entries.
export function topologyFor(size) {
  const value = clampSize(size);
  if (!topologies[value]) {
    topologies[value] = buildTopology(value);
  }
  return topologies[value];
}
