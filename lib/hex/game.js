// The rules of Hex, with no Zepp OS dependency so every rule is exercised by the
// unit tests rather than by squinting at a watch.
//
// Players take turns placing one stone on any empty cell; stones are never
// moved or removed. Red joins the top and bottom edges, Blue the left and right
// ones, and the first to finish an unbroken chain between its own two edges
// wins. A filled Hex board always contains exactly one such chain, so the game
// can never be drawn.
//
// Because stones only ever appear, connectivity is a union-find: joining the new
// stone to its like-coloured neighbours - and to a virtual node per edge - turns
// "has anybody won?" into one comparison instead of a flood fill per move.
//
// Seats and colours are kept apart. Red always moves first, but the pie (swap)
// rule lets the second player take the opening stone for itself, which swaps
// which seat owns which colour without disturbing the colour order.

import {
  BLUE,
  BORDER_MASKS,
  EMPTY,
  MAX_NEIGHBORS,
  RED,
  borderSlot,
  opponent,
  topologyFor,
} from "./board.js";
import { createByteArray, createIntArray } from "./arrays.js";

export { BLUE, EMPTY, RED, opponent };

export const SEAT_FIRST = 0;
export const SEAT_SECOND = 1;

function find(parent, node) {
  let root = node;
  while (parent[root] !== root) {
    root = parent[root];
  }
  // Path compression, so a long chain of stones stays cheap to query.
  let current = node;
  while (parent[current] !== root) {
    const next = parent[current];
    parent[current] = root;
    current = next;
  }
  return root;
}

function union(game, a, b) {
  const parent = game.parent;
  const rootA = find(parent, a);
  const rootB = find(parent, b);
  if (rootA === rootB) {
    return;
  }
  const weight = game.weight;
  if (weight[rootA] < weight[rootB]) {
    parent[rootA] = rootB;
    weight[rootB] += weight[rootA];
  } else {
    parent[rootB] = rootA;
    weight[rootA] += weight[rootB];
  }
}

// A fresh game on a board of the given size. `options.swapRule` turns the pie
// rule off (it is on by default, which is how Hex is normally played: without it
// the opening player has a proven advantage).
export function createGame(size, options) {
  const config = options || {};
  const topology = topologyFor(size);
  const cellCount = topology.cellCount;

  // Four virtual nodes past the last cell, one per edge, so a chain that reaches
  // an edge is joined to it rather than scanned for.
  const parent = createIntArray(cellCount + 4);
  const weight = createIntArray(cellCount + 4);
  for (let i = 0; i < parent.length; i++) {
    parent[i] = i;
    weight[i] = 1;
  }

  return {
    size: topology.size,
    topology,
    cells: createByteArray(cellCount),
    parent,
    weight,
    turn: RED,
    winner: EMPTY,
    moveCount: 0,
    lastMove: -1,
    swapRule: config.swapRule !== false,
    swapUsed: false,
    // seatColors[seat] is the colour that seat plays.
    seatColors: [RED, BLUE],
  };
}

export function isFinished(game) {
  return game.winner !== EMPTY;
}

export function isLegalMove(game, cell) {
  return (
    game.winner === EMPTY &&
    Number.isInteger(cell) &&
    cell >= 0 &&
    cell < game.topology.cellCount &&
    game.cells[cell] === EMPTY
  );
}

// Place the stone of whoever is to move. Returns false (and changes nothing) for
// an illegal cell, so a stray tap on an occupied cell is simply ignored.
export function play(game, cell) {
  if (!isLegalMove(game, cell)) {
    return false;
  }

  const topology = game.topology;
  const color = game.turn;
  game.cells[cell] = color;

  const base = cell * MAX_NEIGHBORS;
  const count = topology.degree[cell];
  for (let i = 0; i < count; i++) {
    const next = topology.neighbors[base + i];
    if (game.cells[next] === color) {
      union(game, cell, next);
    }
  }

  const startSlot = borderSlot(color, 0);
  const endSlot = borderSlot(color, 1);
  const mask = topology.edges[cell];
  if ((mask & BORDER_MASKS[startSlot]) !== 0) {
    union(game, cell, topology.cellCount + startSlot);
  }
  if ((mask & BORDER_MASKS[endSlot]) !== 0) {
    union(game, cell, topology.cellCount + endSlot);
  }

  game.moveCount += 1;
  game.lastMove = cell;

  if (
    find(game.parent, topology.cellCount + startSlot) ===
    find(game.parent, topology.cellCount + endSlot)
  ) {
    game.winner = color;
  } else {
    game.turn = opponent(color);
  }
  return true;
}

// The pie rule is offered exactly once: to the second player, in reply to the
// opening stone.
export function canSwap(game) {
  return game.swapRule && !game.swapUsed && game.winner === EMPTY && game.moveCount === 1;
}

// Take the opening stone instead of answering it. The stone keeps its colour and
// the colour order is untouched - what changes is which seat owns which colour,
// so the seat that opened is now the one to move.
export function swapSides(game) {
  if (!canSwap(game)) {
    return false;
  }
  const first = game.seatColors[SEAT_FIRST];
  game.seatColors[SEAT_FIRST] = game.seatColors[SEAT_SECOND];
  game.seatColors[SEAT_SECOND] = first;
  game.swapUsed = true;
  return true;
}

export function colorForSeat(game, seat) {
  return game.seatColors[seat === SEAT_SECOND ? SEAT_SECOND : SEAT_FIRST];
}

export function seatForColor(game, color) {
  return game.seatColors[SEAT_FIRST] === color ? SEAT_FIRST : SEAT_SECOND;
}

// Which seat has to act now. Meaningless once the game is finished, so callers
// check isFinished first.
export function seatToMove(game) {
  return seatForColor(game, game.turn);
}
