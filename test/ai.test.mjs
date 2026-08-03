import { describe, it, expect } from "vitest";
import { BLUE, EMPTY, RED, topologyFor } from "../lib/hex/board.js";
import { createGame, isFinished, play, swapSides } from "../lib/hex/game.js";
import {
  DEFAULT_LEVEL,
  LEVELS,
  chooseMove,
  clampLevel,
  createContext,
  nextLevel,
  nodeBudget,
  orderMoves,
  shouldSwap,
} from "../lib/hex/ai.js";

const LEVEL_IDS = LEVELS.map((level) => level.id);
const at = (game, column, row) => row * game.size + column;

// A repeatable stand-in for Math.random, so a level that rolls dice still plays
// the same game every run.
function fakeRandom(seed) {
  let state = seed % 2147483647;
  if (state <= 0) {
    state += 2147483646;
  }
  const next = () => {
    state = (state * 48271) % 2147483647;
    return (state - 1) / 2147483646;
  };
  // A small seed makes this generator start with a run of tiny fractions, which
  // would have every seed picking the very first cell.
  for (let i = 0; i < 8; i++) {
    next();
  }
  return next;
}

// Play the given cells in order, alternating colours.
function playAll(game, cells) {
  for (const cell of cells) {
    expect(play(game, at(game, cell[0], cell[1]))).toBe(true);
  }
  return game;
}

// Red owns the whole of column 1 down to the second-to-last row, so its next
// stone finishes the crossing. Blue is parked in column 0 and threatens nothing.
function redToWinInOne() {
  return playAll(createGame(5), [
    [1, 0],
    [0, 0],
    [1, 1],
    [0, 1],
    [1, 2],
    [0, 2],
    [1, 3],
    [0, 3],
  ]);
}

// Blue holds the top row out to column 3 and wins by taking (4,0) - the only
// cell left that joins it to the right-hand column. Red is to move and has no
// win of its own, so anything but a block loses.
function redMustBlock() {
  return playAll(createGame(5), [
    [0, 4],
    [0, 0],
    [1, 4],
    [1, 0],
    [2, 4],
    [2, 0],
    [3, 4],
    [3, 0],
  ]);
}

describe("clampLevel", () => {
  it("keeps a level that is already in range", () => {
    for (let level = 0; level < LEVELS.length; level++) {
      expect(clampLevel(level)).toBe(level);
    }
  });

  it("falls back to the default for anything unusable", () => {
    expect(clampLevel(null)).toBe(DEFAULT_LEVEL);
    expect(clampLevel(undefined)).toBe(DEFAULT_LEVEL);
    expect(clampLevel("")).toBe(DEFAULT_LEVEL);
    expect(clampLevel("nonsense")).toBe(DEFAULT_LEVEL);
    expect(clampLevel(-1)).toBe(DEFAULT_LEVEL);
    expect(clampLevel(LEVELS.length)).toBe(DEFAULT_LEVEL);
  });

  it("reads a level stored as a string", () => {
    expect(clampLevel("2")).toBe(2);
  });
});

describe("nextLevel", () => {
  it("walks through every level and wraps around", () => {
    const seen = [];
    let level = 0;
    for (let i = 0; i < LEVELS.length; i++) {
      seen.push(level);
      level = nextLevel(level);
    }
    expect(seen).toEqual(LEVELS.map((_, index) => index));
    expect(level).toBe(0);
  });
});

describe("nodeBudget", () => {
  it("gives the level that does not search no budget at all", () => {
    expect(nodeBudget(0, 49)).toBe(0);
  });

  it("shrinks as the board grows, so a move costs the watch about the same", () => {
    const small = nodeBudget(2, 25);
    const large = nodeBudget(2, 81);
    expect(small).toBeGreaterThan(large);
  });

  it("never drops below the width of the root move list", () => {
    expect(nodeBudget(2, 100000)).toBeGreaterThanOrEqual(LEVELS[2].width);
  });
});

describe("orderMoves", () => {
  it("opens in the middle of the board", () => {
    const topology = topologyFor(7);
    const context = createContext(topology);
    const cells = new Uint8Array(topology.cellCount);
    const moves = new Int32Array(12);
    const count = orderMoves(context, cells, RED, moves, 12);
    expect(count).toBe(12);
    expect(moves[0]).toBe(3 * 7 + 3);
  });

  it("returns at most as many moves as there are empty cells", () => {
    const topology = topologyFor(3);
    const context = createContext(topology);
    const cells = new Uint8Array(topology.cellCount);
    for (let cell = 0; cell < 7; cell++) {
      cells[cell] = RED;
    }
    const moves = new Int32Array(12);
    expect(orderMoves(context, cells, BLUE, moves, 12)).toBe(2);
  });

  it("never offers an occupied cell", () => {
    const game = createGame(5);
    playAll(game, [
      [2, 2],
      [1, 2],
      [2, 1],
      [1, 3],
    ]);
    const context = createContext(game.topology);
    const moves = new Int32Array(12);
    const count = orderMoves(context, game.cells, RED, moves, 12);
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      expect(game.cells[moves[i]]).toBe(EMPTY);
    }
  });
});

describe("chooseMove", () => {
  it("has nothing to play once the game is over", () => {
    const game = redToWinInOne();
    play(game, at(game, 1, 4));
    expect(isFinished(game)).toBe(true);
    for (let level = 0; level < LEVELS.length; level++) {
      expect(chooseMove(game, { level, random: fakeRandom(1) })).toBe(-1);
    }
  });

  it("returns an empty cell at every level", () => {
    for (let level = 0; level < LEVELS.length; level++) {
      const game = createGame(7);
      playAll(game, [
        [3, 3],
        [2, 4],
      ]);
      const move = chooseMove(game, { level, random: fakeRandom(level + 1) });
      expect(move, LEVEL_IDS[level]).toBeGreaterThanOrEqual(0);
      expect(game.cells[move], LEVEL_IDS[level]).toBe(EMPTY);
    }
  });

  it("leaves the game exactly as it found it", () => {
    for (let level = 0; level < LEVELS.length; level++) {
      const game = createGame(7);
      playAll(game, [
        [3, 3],
        [2, 4],
        [4, 2],
      ]);
      const before = Array.from(game.cells);
      const turn = game.turn;
      chooseMove(game, { level, random: fakeRandom(3) });
      expect(Array.from(game.cells), LEVEL_IDS[level]).toEqual(before);
      expect(game.turn, LEVEL_IDS[level]).toBe(turn);
      expect(game.winner, LEVEL_IDS[level]).toBe(EMPTY);
    }
  });

  it("finishes a crossing it can finish, at every level", () => {
    for (let level = 0; level < LEVELS.length; level++) {
      const game = redToWinInOne();
      const move = chooseMove(game, { level, random: fakeRandom(level + 7) });
      expect(play(game, move), LEVEL_IDS[level]).toBe(true);
      expect(game.winner, LEVEL_IDS[level]).toBe(RED);
    }
  });

  it("blocks a crossing the opponent could finish, once it looks that far", () => {
    // The easiest level deliberately does not look at what the opponent is up
    // to; the levels that search do.
    for (let level = 1; level < LEVELS.length; level++) {
      const game = redMustBlock();
      const move = chooseMove(game, { level, random: fakeRandom(level + 11) });
      expect(move, LEVEL_IDS[level]).toBe(at(game, 4, 0));
    }
  });

  it("falls back to the default level when the level is unusable", () => {
    const game = redToWinInOne();
    const move = chooseMove(game, { level: "nonsense", random: fakeRandom(2) });
    expect(play(game, move)).toBe(true);
    expect(game.winner).toBe(RED);
  });

  it("uses the random source it is given rather than a global one", () => {
    const game = createGame(7);
    const first = chooseMove(game, { level: 0, random: fakeRandom(5) });
    const again = chooseMove(game, { level: 0, random: fakeRandom(5) });
    const other = chooseMove(game, { level: 0, random: fakeRandom(99) });
    expect(again).toBe(first);
    expect(other).not.toBe(first);
  });

  it("plays deterministically at the levels that search", () => {
    for (let level = 1; level < LEVELS.length; level++) {
      const game = createGame(7);
      playAll(game, [
        [3, 3],
        [4, 2],
      ]);
      const first = chooseMove(game, { level, random: fakeRandom(1) });
      const again = chooseMove(game, { level, random: fakeRandom(42) });
      expect(again, LEVEL_IDS[level]).toBe(first);
    }
  });
});

describe("a whole game between two computers", () => {
  it("always ends with a winner and never plays an illegal move", () => {
    for (let level = 0; level < LEVELS.length; level++) {
      const game = createGame(5, { swapRule: false });
      const random = fakeRandom(level * 31 + 4);
      let moves = 0;
      while (!isFinished(game) && moves < 25) {
        const move = chooseMove(game, { level, random });
        expect(move, LEVEL_IDS[level]).toBeGreaterThanOrEqual(0);
        expect(play(game, move), LEVEL_IDS[level]).toBe(true);
        moves += 1;
      }
      expect(isFinished(game), LEVEL_IDS[level]).toBe(true);
    }
  });

  it("puts the levels in order: a level that searches beats one that does not", () => {
    // Red opens in a corner it should not, so the handicap is on the stronger
    // side; anything less than a clean sweep would still be a real difference.
    let strongWins = 0;
    const games = 6;
    for (let seed = 0; seed < games; seed++) {
      const game = createGame(5, { swapRule: false });
      const random = fakeRandom(seed * 101 + 9);
      play(game, seed);
      while (!isFinished(game)) {
        const level = game.turn === RED ? 0 : 2;
        const move = chooseMove(game, { level, random });
        expect(move).toBeGreaterThanOrEqual(0);
        play(game, move);
      }
      if (game.winner === BLUE) {
        strongWins += 1;
      }
    }
    expect(strongWins).toBe(games);
  });
});

describe("shouldSwap", () => {
  it("takes an opening stone played near the middle", () => {
    const game = createGame(7);
    play(game, at(game, 3, 3));
    expect(shouldSwap(game)).toBe(true);
  });

  it("leaves an opening stone played out in an acute corner", () => {
    for (const corner of [
      [0, 0],
      [6, 6],
    ]) {
      const game = createGame(7);
      play(game, at(game, corner[0], corner[1]));
      expect(shouldSwap(game), `${corner}`).toBe(false);
    }
  });

  it("says nothing when the pie rule is not on offer", () => {
    const off = createGame(7, { swapRule: false });
    play(off, at(off, 3, 3));
    expect(shouldSwap(off)).toBe(false);

    const fresh = createGame(7);
    expect(shouldSwap(fresh)).toBe(false);

    const used = createGame(7);
    play(used, at(used, 3, 3));
    swapSides(used);
    expect(shouldSwap(used)).toBe(false);

    const late = createGame(7);
    play(late, at(late, 3, 3));
    play(late, at(late, 2, 2));
    expect(shouldSwap(late)).toBe(false);
  });
});
