import { describe, it, expect } from "vitest";
import {
  BOARD_SIZES,
  DEFAULT_MODE,
  DEFAULT_SIZE_INDEX,
  LEVEL_KEY,
  MODES,
  MODE_COMPUTER,
  MODE_KEY,
  MODE_TWO_PLAYERS,
  SIZE_KEY,
  boardSizeFor,
  boardSizeLabel,
  clampIndex,
  clampMode,
  clampSizeIndex,
  nextIndex,
  nextMode,
  nextSizeIndex,
} from "../lib/settings.js";
import { MAX_SIZE, MIN_SIZE } from "../lib/hex/board.js";

describe("storage keys", () => {
  it("keeps each setting under its own name", () => {
    const keys = [MODE_KEY, LEVEL_KEY, SIZE_KEY];
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
    }
  });
});

describe("clampIndex", () => {
  it("keeps an index that is already in range", () => {
    expect(clampIndex(0, 3, 1)).toBe(0);
    expect(clampIndex(2, 3, 1)).toBe(2);
  });

  it("falls back for an index that is out of range or unusable", () => {
    expect(clampIndex(-1, 3, 1)).toBe(1);
    expect(clampIndex(3, 3, 1)).toBe(1);
    expect(clampIndex("nonsense", 3, 1)).toBe(1);
    expect(clampIndex(NaN, 3, 1)).toBe(1);
  });

  it("tells nothing-stored apart from a stored zero", () => {
    expect(clampIndex(null, 3, 2)).toBe(2);
    expect(clampIndex(undefined, 3, 2)).toBe(2);
    expect(clampIndex("", 3, 2)).toBe(2);
    expect(clampIndex(0, 3, 2)).toBe(0);
  });

  it("reads an index stored as a string", () => {
    expect(clampIndex("2", 3, 0)).toBe(2);
  });

  it("survives a fallback that is itself out of range", () => {
    expect(clampIndex("nonsense", 3, 9)).toBe(0);
  });
});

describe("nextIndex", () => {
  it("walks through the list and wraps around", () => {
    expect(nextIndex(0, 3, 0)).toBe(1);
    expect(nextIndex(1, 3, 0)).toBe(2);
    expect(nextIndex(2, 3, 0)).toBe(0);
  });

  it("starts from the fallback when nothing is stored", () => {
    expect(nextIndex(null, 3, 1)).toBe(2);
  });
});

describe("the game mode", () => {
  it("offers exactly two modes and starts against the watch", () => {
    expect(MODES).toEqual([MODE_TWO_PLAYERS, MODE_COMPUTER]);
    expect(DEFAULT_MODE).toBe(MODE_COMPUTER);
    expect(clampMode(undefined)).toBe(MODE_COMPUTER);
  });

  it("cycles between the two modes", () => {
    expect(nextMode(MODE_TWO_PLAYERS)).toBe(MODE_COMPUTER);
    expect(nextMode(MODE_COMPUTER)).toBe(MODE_TWO_PLAYERS);
  });

  it("clamps anything unusable back to the default", () => {
    expect(clampMode(7)).toBe(DEFAULT_MODE);
    expect(clampMode("nonsense")).toBe(DEFAULT_MODE);
  });
});

describe("the board size", () => {
  it("offers only sizes the rules and the screen both support", () => {
    for (const size of BOARD_SIZES) {
      expect(size).toBeGreaterThanOrEqual(MIN_SIZE);
      expect(size).toBeLessThanOrEqual(MAX_SIZE);
    }
    expect([...BOARD_SIZES].sort((a, b) => a - b)).toEqual(BOARD_SIZES);
  });

  it("starts on the middle board", () => {
    expect(boardSizeFor(undefined)).toBe(BOARD_SIZES[DEFAULT_SIZE_INDEX]);
    expect(clampSizeIndex(undefined)).toBe(DEFAULT_SIZE_INDEX);
  });

  it("cycles through every board and wraps around", () => {
    let index = 0;
    const seen = [];
    for (let i = 0; i < BOARD_SIZES.length; i++) {
      seen.push(boardSizeFor(index));
      index = nextSizeIndex(index);
    }
    expect(seen).toEqual(BOARD_SIZES);
    expect(index).toBe(0);
  });

  it("labels a board with its own dimensions and needs no translation", () => {
    expect(boardSizeLabel(0)).toBe(BOARD_SIZES[0] + "x" + BOARD_SIZES[0]);
    for (let index = 0; index < BOARD_SIZES.length; index++) {
      expect(/^[0-9]+x[0-9]+$/.test(boardSizeLabel(index))).toBe(true);
    }
  });

  it("clamps a stored index left behind by another build", () => {
    expect(boardSizeFor(99)).toBe(BOARD_SIZES[DEFAULT_SIZE_INDEX]);
    expect(boardSizeLabel(-1)).toBe(boardSizeLabel(DEFAULT_SIZE_INDEX));
  });
});
