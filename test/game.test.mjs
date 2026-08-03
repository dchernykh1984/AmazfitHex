import { describe, it, expect } from "vitest";
import {
  BLUE,
  EMPTY,
  RED,
  SEAT_FIRST,
  SEAT_SECOND,
  canSwap,
  colorForSeat,
  createGame,
  isFinished,
  isLegalMove,
  play,
  seatForColor,
  seatToMove,
  swapSides,
} from "../lib/hex/game.js";

const at = (game, column, row) => row * game.size + column;

// Play a list of {column, row} cells in order, alternating colours as the rules
// dictate.
function playAll(game, cells) {
  for (const cell of cells) {
    expect(play(game, at(game, cell[0], cell[1]))).toBe(true);
  }
  return game;
}

describe("createGame", () => {
  it("starts empty with red to move", () => {
    const game = createGame(5);
    expect(game.size).toBe(5);
    expect(game.turn).toBe(RED);
    expect(game.winner).toBe(EMPTY);
    expect(game.moveCount).toBe(0);
    expect(game.lastMove).toBe(-1);
    expect(Array.from(game.cells).every((cell) => cell === EMPTY)).toBe(true);
  });

  it("seats the opening player on red and enables the pie rule by default", () => {
    const game = createGame(5);
    expect(colorForSeat(game, SEAT_FIRST)).toBe(RED);
    expect(colorForSeat(game, SEAT_SECOND)).toBe(BLUE);
    expect(game.swapRule).toBe(true);
  });

  it("can be created with the pie rule switched off", () => {
    const game = createGame(5, { swapRule: false });
    play(game, 12);
    expect(canSwap(game)).toBe(false);
  });

  it("clamps an unusable board size", () => {
    expect(createGame(0).size).toBe(3);
    expect(createGame(undefined).size).toBe(7);
  });
});

describe("play", () => {
  it("places a stone of the colour to move and hands over the turn", () => {
    const game = createGame(5);
    expect(play(game, 7)).toBe(true);
    expect(game.cells[7]).toBe(RED);
    expect(game.turn).toBe(BLUE);
    expect(game.moveCount).toBe(1);
    expect(game.lastMove).toBe(7);

    expect(play(game, 8)).toBe(true);
    expect(game.cells[8]).toBe(BLUE);
    expect(game.turn).toBe(RED);
  });

  it("refuses an occupied cell and leaves the game untouched", () => {
    const game = createGame(5);
    play(game, 7);
    expect(play(game, 7)).toBe(false);
    expect(game.turn).toBe(BLUE);
    expect(game.moveCount).toBe(1);
  });

  it("refuses a cell that is not on the board", () => {
    const game = createGame(5);
    expect(isLegalMove(game, -1)).toBe(false);
    expect(isLegalMove(game, 25)).toBe(false);
    expect(isLegalMove(game, 1.5)).toBe(false);
    expect(play(game, 25)).toBe(false);
    expect(game.moveCount).toBe(0);
  });
});

describe("winning", () => {
  it("gives red the game for a chain from the top row to the bottom row", () => {
    const game = createGame(5);
    // Red walks straight down column 2; blue answers harmlessly in column 4.
    playAll(game, [
      [2, 0],
      [4, 0],
      [2, 1],
      [4, 1],
      [2, 2],
      [4, 2],
      [2, 3],
      [4, 3],
    ]);
    expect(game.winner).toBe(EMPTY);
    expect(play(game, at(game, 2, 4))).toBe(true);
    expect(game.winner).toBe(RED);
    expect(isFinished(game)).toBe(true);
  });

  it("gives blue the game for a chain from the left column to the right column", () => {
    const game = createGame(5);
    playAll(game, [
      [0, 4],
      [0, 2],
      [1, 4],
      [1, 2],
      [2, 4],
      [2, 2],
      [3, 4],
      [3, 2],
      [4, 0],
    ]);
    expect(game.winner).toBe(EMPTY);
    expect(play(game, at(game, 4, 2))).toBe(true);
    expect(game.winner).toBe(BLUE);
  });

  it("accepts a chain that zigzags across the diagonal neighbours", () => {
    const game = createGame(5);
    // Red steps down-left and down-right in turn: (2,0) (2,1) (1,2) (1,3) (1,4).
    playAll(game, [
      [2, 0],
      [4, 0],
      [2, 1],
      [4, 1],
      [1, 2],
      [4, 2],
      [1, 3],
      [4, 3],
    ]);
    expect(play(game, at(game, 1, 4))).toBe(true);
    expect(game.winner).toBe(RED);
  });

  it("joins stones along the hex diagonal that really is adjacent", () => {
    const game = createGame(3);
    // (2,0) (1,1) (0,2) step down-left, which is one of the six hex directions.
    playAll(game, [
      [2, 0],
      [0, 0],
      [1, 1],
      [0, 1],
    ]);
    expect(play(game, at(game, 0, 2))).toBe(true);
    expect(game.winner).toBe(RED);
  });

  it("does not join stones along the diagonal that is not a hex neighbour", () => {
    const game = createGame(3);
    // (0,0) (1,1) (2,2) steps down-right, which no hex edge crosses, so red
    // spans the board on paper without ever forming a chain.
    playAll(game, [
      [0, 0],
      [2, 0],
      [1, 1],
      [0, 1],
      [2, 2],
    ]);
    expect(game.winner).toBe(EMPTY);
  });

  it("stops the game once it is won", () => {
    const game = createGame(3);
    playAll(game, [
      [1, 0],
      [0, 0],
      [1, 1],
      [0, 1],
      [1, 2],
    ]);
    expect(game.winner).toBe(RED);
    expect(isLegalMove(game, at(game, 2, 2))).toBe(false);
    expect(play(game, at(game, 2, 2))).toBe(false);
  });

  it("always produces exactly one winner once the board is full", () => {
    // Hex cannot be drawn: whichever way a full board is filled, exactly one
    // player owns a crossing chain. Fill boards in a fixed pseudo-random order
    // and check the game always ends before the last cell is placed.
    for (let size = 3; size <= 6; size++) {
      for (let seed = 1; seed <= 20; seed++) {
        const game = createGame(size);
        const order = [];
        for (let cell = 0; cell < size * size; cell++) {
          order.push(cell);
        }
        let state = seed;
        for (let i = order.length - 1; i > 0; i--) {
          state = (state * 48271) % 2147483647;
          const j = state % (i + 1);
          const swap = order[i];
          order[i] = order[j];
          order[j] = swap;
        }
        for (const cell of order) {
          if (game.winner !== EMPTY) {
            break;
          }
          play(game, cell);
        }
        expect(game.winner, `size ${size} seed ${seed}`).not.toBe(EMPTY);
      }
    }
  });
});

describe("the pie rule", () => {
  it("is offered to the second seat in reply to the opening stone", () => {
    const game = createGame(5);
    expect(canSwap(game)).toBe(false);
    play(game, 12);
    expect(canSwap(game)).toBe(true);
    expect(seatToMove(game)).toBe(SEAT_SECOND);
  });

  it("hands the opening stone to the second seat and the move back to the first", () => {
    const game = createGame(5);
    play(game, 12);
    expect(swapSides(game)).toBe(true);
    expect(game.cells[12]).toBe(RED);
    expect(colorForSeat(game, SEAT_FIRST)).toBe(BLUE);
    expect(colorForSeat(game, SEAT_SECOND)).toBe(RED);
    expect(game.turn).toBe(BLUE);
    expect(seatToMove(game)).toBe(SEAT_FIRST);
    expect(game.moveCount).toBe(1);
  });

  it("is offered only once", () => {
    const game = createGame(5);
    play(game, 12);
    expect(swapSides(game)).toBe(true);
    expect(canSwap(game)).toBe(false);
    expect(swapSides(game)).toBe(false);
  });

  it("expires as soon as the second player answers with a stone", () => {
    const game = createGame(5);
    play(game, 12);
    play(game, 13);
    expect(canSwap(game)).toBe(false);
    expect(swapSides(game)).toBe(false);
  });

  it("still credits the win to the colour that made the chain", () => {
    const game = createGame(3);
    play(game, at(game, 1, 0));
    swapSides(game);
    // The first seat now plays blue and joins the left and right columns along
    // the middle row; the second seat holds the red stone it took over.
    playAll(game, [
      [0, 1],
      [0, 0],
      [1, 1],
      [0, 2],
      [2, 1],
    ]);
    expect(game.winner).toBe(BLUE);
    expect(seatForColor(game, BLUE)).toBe(SEAT_FIRST);
  });
});

describe("seats", () => {
  it("reports the seat of each colour", () => {
    const game = createGame(5);
    expect(seatForColor(game, RED)).toBe(SEAT_FIRST);
    expect(seatForColor(game, BLUE)).toBe(SEAT_SECOND);
  });

  it("alternates the seat to move", () => {
    const game = createGame(5);
    expect(seatToMove(game)).toBe(SEAT_FIRST);
    play(game, 0);
    expect(seatToMove(game)).toBe(SEAT_SECOND);
    play(game, 1);
    expect(seatToMove(game)).toBe(SEAT_FIRST);
  });

  it("treats any seat that is not the second one as the first", () => {
    const game = createGame(5);
    expect(colorForSeat(game, 0)).toBe(RED);
    expect(colorForSeat(game, 9)).toBe(RED);
    expect(colorForSeat(game, SEAT_SECOND)).toBe(BLUE);
  });
});
