import { describe, it, expect } from "vitest";
import {
  BLUE,
  EMPTY,
  MAX_NEIGHBORS,
  RED,
  borderMask,
  opponent,
  topologyFor,
} from "../lib/hex/board.js";
import { createGame, isLegalMove, play } from "../lib/hex/game.js";
import { UNREACHABLE, createScratch, distanceField } from "../lib/hex/evaluate.js";
import { LEVELS, chooseMove, createContext, orderMoves } from "../lib/hex/ai.js";

// The fast implementations checked against slow, obvious ones, over positions
// reached by actually playing rather than by hand-picking. Union-find, a
// double-ended-queue Dijkstra and a distance field that reads one-move wins off
// two numbers are all easy to get subtly wrong in a way no single example
// catches, so each is held against a reference that is too dull to be wrong:
// a flood fill, a relax-until-nothing-changes shortest path, and try-every-cell.

const SIZES = [3, 5, 7];
const SEEDS = [1, 2, 3, 4];
const CANDIDATE_WIDTH = 12;

function fakeRandom(seed) {
  let state = seed % 2147483647;
  if (state <= 0) {
    state += 2147483646;
  }
  return () => {
    state = (state * 48271) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

// Reference: has `color` joined its two edges? A flood fill of every group.
function hasWon(topology, cells, color) {
  const start = borderMask(color, 0);
  const end = borderMask(color, 1);
  const seen = new Uint8Array(topology.cellCount);
  for (let from = 0; from < topology.cellCount; from++) {
    if (cells[from] !== color || seen[from]) {
      continue;
    }
    let edges = 0;
    const stack = [from];
    seen[from] = 1;
    while (stack.length > 0) {
      const cell = stack.pop();
      edges |= topology.edges[cell];
      for (let i = 0; i < topology.degree[cell]; i++) {
        const next = topology.neighbors[cell * MAX_NEIGHBORS + i];
        if (!seen[next] && cells[next] === color) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    if (edges & start && edges & end) {
      return true;
    }
  }
  return false;
}

// Reference: the shortest crossing, relaxed until nothing changes. Own stones
// are free, empty cells cost one stone each, the opponent's are impassable.
function shortestCrossing(topology, cells, color) {
  const foe = opponent(color);
  const start = borderMask(color, 0);
  const end = borderMask(color, 1);
  const distance = new Array(topology.cellCount).fill(Infinity);
  for (let cell = 0; cell < topology.cellCount; cell++) {
    if (cells[cell] !== foe && topology.edges[cell] & start) {
      distance[cell] = cells[cell] === color ? 0 : 1;
    }
  }
  for (let pass = 0; pass <= topology.cellCount; pass++) {
    let changed = false;
    for (let cell = 0; cell < topology.cellCount; cell++) {
      if (distance[cell] === Infinity) {
        continue;
      }
      for (let i = 0; i < topology.degree[cell]; i++) {
        const next = topology.neighbors[cell * MAX_NEIGHBORS + i];
        if (cells[next] === foe) {
          continue;
        }
        const step = distance[cell] + (cells[next] === color ? 0 : 1);
        if (step < distance[next]) {
          distance[next] = step;
          changed = true;
        }
      }
    }
    if (!changed) {
      break;
    }
  }
  let best = Infinity;
  for (let cell = 0; cell < topology.cellCount; cell++) {
    if (topology.edges[cell] & end) {
      best = Math.min(best, distance[cell]);
    }
  }
  return best === Infinity ? UNREACHABLE : best;
}

// Reference: the cells where one stone finishes the crossing, found by putting a
// stone on each of them in turn.
function winningCells(topology, cells, color) {
  const found = [];
  for (let cell = 0; cell < topology.cellCount; cell++) {
    if (cells[cell] !== EMPTY) {
      continue;
    }
    cells[cell] = color;
    if (hasWon(topology, cells, color)) {
      found.push(cell);
    }
    cells[cell] = EMPTY;
  }
  return found;
}

// The same reading the search takes off the two plain distance fields.
function readWinningCells(topology, cells, color, scratch) {
  const start = scratch.fields[1];
  const end = scratch.fields[2];
  distanceField(topology, cells, color, 0, 1, scratch, start);
  distanceField(topology, cells, color, 1, 1, scratch, end);
  const found = [];
  for (let cell = 0; cell < topology.cellCount; cell++) {
    if (cells[cell] === EMPTY && start[cell] === 1 && end[cell] === 1) {
      found.push(cell);
    }
  }
  return found;
}

// Every position of a game played out by the given level, from the given seed.
function positions(size, seed, level) {
  const game = createGame(size, { swapRule: false });
  const random = fakeRandom(seed * 7919 + size);
  const seen = [];
  while (game.winner === EMPTY) {
    seen.push({ cells: Array.from(game.cells), turn: game.turn, winner: game.winner });
    const move = chooseMove(game, { level, random });
    expect(move, `size ${size} seed ${seed}`).toBeGreaterThanOrEqual(0);
    play(game, move);
  }
  seen.push({ cells: Array.from(game.cells), turn: game.turn, winner: game.winner });
  return seen;
}

describe("connectivity", () => {
  it("agrees with a flood fill at every position of a played-out game", () => {
    for (const size of SIZES) {
      const topology = topologyFor(size);
      for (const seed of SEEDS) {
        const game = createGame(size, { swapRule: false });
        const random = fakeRandom(seed * 31 + size);
        while (game.winner === EMPTY) {
          for (const color of [RED, BLUE]) {
            expect(hasWon(topology, game.cells, color), `size ${size} seed ${seed}`).toBe(
              game.winner === color
            );
          }
          play(game, chooseMove(game, { level: seed % LEVELS.length, random }));
        }
        expect(hasWon(topology, game.cells, game.winner)).toBe(true);
        expect(hasWon(topology, game.cells, opponent(game.winner))).toBe(false);
      }
    }
  });
});

describe("the distance fields", () => {
  it("hold against a plain shortest path, for both players, everywhere", () => {
    for (const size of SIZES) {
      const topology = topologyFor(size);
      const scratch = createScratch(topology);
      for (const seed of SEEDS) {
        for (const position of positions(size, seed, 1)) {
          const cells = Uint8Array.from(position.cells);
          for (const color of [RED, BLUE]) {
            const where = `size ${size} seed ${seed} ${color === RED ? "red" : "blue"}`;
            const one = distanceField(topology, cells, color, 0, 1, scratch, scratch.fields[0]);
            const two = distanceField(topology, cells, color, 0, 2, scratch, scratch.fields[0]);
            const won = hasWon(topology, cells, color);

            expect(one, where).toBe(shortestCrossing(topology, cells, color));
            // A crossing the opponent cannot cut is never the cheaper of the two.
            expect(two, where).toBeGreaterThanOrEqual(one);
            // No distance at all means the crossing is already made, and only that.
            expect(one === 0, where).toBe(won);
            expect(two === 0, where).toBe(won);
            // And a player with no route left is a player already cut off.
            if (one === UNREACHABLE) {
              expect(hasWon(topology, cells, opponent(color)), where).toBe(true);
            }
          }
        }
      }
    }
  });

  it("name exactly the cells that win on the spot", () => {
    for (const size of SIZES) {
      const topology = topologyFor(size);
      const scratch = createScratch(topology);
      for (const seed of SEEDS) {
        for (const position of positions(size, seed, 1)) {
          // Only while the game is still running. Once a chain is complete every
          // empty cell "wins" for its owner in the sense the reference measures,
          // which says nothing; the search never asks after that either.
          if (position.winner !== EMPTY) {
            continue;
          }
          const cells = Uint8Array.from(position.cells);
          for (const color of [RED, BLUE]) {
            expect(
              readWinningCells(topology, cells, color, scratch),
              `size ${size} seed ${seed}`
            ).toEqual(winningCells(topology, cells, color));
          }
        }
      }
    }
  });
});

describe("the computer opponent", () => {
  it("offers candidate moves that are empty, distinct and as many as there are", () => {
    for (const size of SIZES) {
      const topology = topologyFor(size);
      const context = createContext(topology);
      const moves = new Int32Array(CANDIDATE_WIDTH);
      for (const seed of SEEDS) {
        for (const position of positions(size, seed, 1)) {
          const cells = Uint8Array.from(position.cells);
          const free = position.cells.filter((cell) => cell === EMPTY).length;
          const count = orderMoves(context, cells, position.turn, moves, CANDIDATE_WIDTH);
          expect(count, `size ${size} seed ${seed}`).toBe(Math.min(CANDIDATE_WIDTH, free));
          const seen = new Set();
          for (let i = 0; i < count; i++) {
            expect(cells[moves[i]], `size ${size} cell ${moves[i]}`).toBe(EMPTY);
            expect(seen.has(moves[i]), `size ${size} cell ${moves[i]}`).toBe(false);
            seen.add(moves[i]);
          }
        }
      }
    }
  });

  it("answers every position of a real game with a legal move, at every level", () => {
    for (const size of SIZES) {
      for (const seed of SEEDS) {
        for (const position of positions(size, seed, 1)) {
          if (position.winner !== EMPTY) {
            continue;
          }
          for (let level = 0; level < LEVELS.length; level++) {
            const game = createGame(size, { swapRule: false });
            game.cells.set(position.cells);
            game.turn = position.turn;
            const before = Array.from(game.cells);
            const move = chooseMove(game, { level, random: fakeRandom(seed + level) });
            expect(isLegalMove(game, move), `size ${size} seed ${seed} level ${level}`).toBe(true);
            // And it worked all that out without disturbing the game it was
            // handed, which the page relies on.
            expect(Array.from(game.cells)).toEqual(before);
            expect(game.turn).toBe(position.turn);
          }
        }
      }
    }
  });
});
