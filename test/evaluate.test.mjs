import { describe, it, expect } from "vitest";
import { BLUE, EMPTY, RED, topologyFor } from "../lib/hex/board.js";
import { createByteArray } from "../lib/hex/arrays.js";
import {
  CONNECTED,
  UNREACHABLE,
  WIN_SCORE,
  createScratch,
  distanceField,
  evaluate,
} from "../lib/hex/evaluate.js";

// A board built straight from a picture, one string per row. "R" and "B" are
// stones, "." is an empty cell. Rows are given left-aligned; the rhombus shear
// is a drawing detail the rules know nothing about.
function boardOf(rows) {
  const size = rows.length;
  const topology = topologyFor(size);
  const cells = createByteArray(topology.cellCount);
  for (let row = 0; row < size; row++) {
    const line = rows[row].replace(/ /g, "");
    expect(line.length, `row ${row}`).toBe(size);
    for (let column = 0; column < size; column++) {
      const mark = line[column];
      cells[row * size + column] = mark === "R" ? RED : mark === "B" ? BLUE : EMPTY;
    }
  }
  return { topology, cells, scratch: createScratch(topology) };
}

const crossing = (board, player, side, required) =>
  distanceField(
    board.topology,
    board.cells,
    player,
    side,
    required,
    board.scratch,
    board.scratch.fields[0]
  );

describe("distanceField on an empty board", () => {
  it("costs one stone per row to cross, and one more to make the crossing safe", () => {
    for (const size of [3, 5, 7, 9]) {
      const board = boardOf(new Array(size).fill(".".repeat(size)));
      expect(crossing(board, RED, 0, 1), `size ${size}`).toBe(size);
      expect(crossing(board, RED, 0, 2), `size ${size}`).toBe(size + 1);
    }
  });

  it("treats the two players alike", () => {
    const board = boardOf([".....", ".....", ".....", ".....", "....."]);
    expect(crossing(board, BLUE, 0, 1)).toBe(crossing(board, RED, 0, 1));
    expect(crossing(board, BLUE, 0, 2)).toBe(crossing(board, RED, 0, 2));
  });

  it("measures the same crossing from either edge", () => {
    const board = boardOf([".....", ".....", ".....", ".....", "....."]);
    expect(crossing(board, RED, 1, 1)).toBe(crossing(board, RED, 0, 1));
    expect(crossing(board, BLUE, 1, 2)).toBe(crossing(board, BLUE, 0, 2));
  });

  it("puts a cell on the source edge one stone away and the far side further", () => {
    const board = boardOf([".....", ".....", ".....", ".....", "....."]);
    crossing(board, RED, 0, 1);
    const field = board.scratch.fields[0];
    expect(field[0 * 5 + 2]).toBe(1);
    expect(field[1 * 5 + 2]).toBe(2);
    expect(field[4 * 5 + 2]).toBe(5);
  });
});

describe("distanceField with stones on the board", () => {
  it("charges nothing for a stone already in the chain", () => {
    const board = boardOf([
      "..R..",
      "..R..",
      "..R..",
      ".....",
      ".....", //
    ]);
    crossing(board, RED, 0, 1);
    const field = board.scratch.fields[0];
    expect(field[0 * 5 + 2]).toBe(0);
    expect(field[2 * 5 + 2]).toBe(0);
    // Two rows are left, so two more stones finish the crossing.
    expect(crossing(board, RED, 0, 1)).toBe(2);
  });

  it("reports a finished chain as no distance at all", () => {
    const board = boardOf([
      "..R..",
      "..R..",
      "..R..",
      "..R..",
      "..R..", //
    ]);
    expect(crossing(board, RED, 0, 1)).toBe(CONNECTED);
    expect(crossing(board, RED, 0, 2)).toBe(CONNECTED);
    expect(crossing(board, RED, 1, 2)).toBe(CONNECTED);
  });

  it("reports a player who has been cut off as unreachable", () => {
    // Blue owns the whole middle row, which is a finished blue crossing and
    // therefore leaves red no route at all.
    const board = boardOf([
      ".....",
      ".....",
      "BBBBB",
      ".....",
      ".....", //
    ]);
    expect(crossing(board, BLUE, 0, 1)).toBe(CONNECTED);
    expect(crossing(board, RED, 0, 1)).toBe(UNREACHABLE);
  });

  it("rates a route the opponent can cut as no route at all", () => {
    // Red can still squeeze between the blue stones, but only through one cell
    // at a time, so there is nothing here blue could not take away.
    const board = boardOf([
      ".....",
      "BB.BB",
      ".....",
      "BB.BB",
      ".....", //
    ]);
    expect(crossing(board, RED, 0, 1)).toBe(5);
    expect(crossing(board, RED, 0, 2)).toBe(UNREACHABLE);
  });

  it("counts a bridge as the safe connection it is", () => {
    // Two red stones a bridge apart are joined by either of two empty cells, so
    // the safe distance across them is no worse than the plain one.
    const gap = boardOf([
      "..R..",
      ".....",
      "..R..",
      ".....",
      "..R..", //
    ]);
    expect(crossing(gap, RED, 0, 2)).toBeLessThan(
      crossing(boardOf(new Array(5).fill(".....")), RED, 0, 2)
    );
  });
});

describe("evaluate", () => {
  it("calls an empty board even", () => {
    const board = boardOf([".....", ".....", ".....", ".....", "....."]);
    expect(evaluate(board.topology, board.cells, RED, board.scratch)).toBe(0);
    expect(evaluate(board.topology, board.cells, BLUE, board.scratch)).toBe(0);
  });

  it("scores a finished game as won for one side and lost for the other", () => {
    const board = boardOf([
      "..R..",
      "..R..",
      "..R..",
      "..R..",
      "..R..", //
    ]);
    expect(evaluate(board.topology, board.cells, RED, board.scratch)).toBe(WIN_SCORE);
    expect(evaluate(board.topology, board.cells, BLUE, board.scratch)).toBe(-WIN_SCORE);
  });

  it("prefers the side whose crossing is shorter", () => {
    const board = boardOf([
      "..R..",
      "..R..",
      "..R..",
      ".....",
      ".....", //
    ]);
    const score = evaluate(board.topology, board.cells, RED, board.scratch);
    expect(score).toBeGreaterThan(0);
    expect(evaluate(board.topology, board.cells, BLUE, board.scratch)).toBe(-score);
  });

  it("improves for a player as its chain grows", () => {
    const shorter = boardOf([
      "..R..",
      "..R..",
      ".....",
      ".....",
      ".....", //
    ]);
    const longer = boardOf([
      "..R..",
      "..R..",
      "..R..",
      ".....",
      ".....", //
    ]);
    expect(evaluate(longer.topology, longer.cells, RED, longer.scratch)).toBeGreaterThan(
      evaluate(shorter.topology, shorter.cells, RED, shorter.scratch)
    );
  });
});
