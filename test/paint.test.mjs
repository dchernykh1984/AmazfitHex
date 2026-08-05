import { describe, it, expect } from "vitest";
import {
  boardCommands,
  cellCommands,
  clearCommands,
  colorForCell,
  colorForEmptyCell,
  colorForStone,
  markCommands,
} from "../lib/paint.js";
import { hexLayout } from "../lib/layout/hex-layout.js";
import { insideHex } from "../lib/layout/hex-shape.js";
import {
  BLUE,
  EDGE_BLUE_START,
  EDGE_RED_END,
  EDGE_RED_START,
  RED,
  topologyFor,
} from "../lib/hex/board.js";
import {
  COLOR_BACKGROUND,
  COLOR_BLUE,
  COLOR_CELL,
  COLOR_CELL_BLUE_EDGE,
  COLOR_CELL_BOTH_EDGES,
  COLOR_CELL_RED_EDGE,
  COLOR_MARK,
  COLOR_RED,
  MIN_CAP,
  SCREEN_PADDING,
} from "../utils/config/constants.js";

const layout = hexLayout(466, 5, SCREEN_PADDING, MIN_CAP);
const topology = topologyFor(5);

describe("colours", () => {
  it("paints each player's stones in their own colour", () => {
    expect(colorForStone(RED)).toBe(COLOR_RED);
    expect(colorForStone(BLUE)).toBe(COLOR_BLUE);
  });

  it("tints an empty cell by the edges it sits on", () => {
    expect(colorForEmptyCell(0)).toBe(COLOR_CELL);
    expect(colorForEmptyCell(EDGE_RED_START)).toBe(COLOR_CELL_RED_EDGE);
    expect(colorForEmptyCell(EDGE_BLUE_START)).toBe(COLOR_CELL_BLUE_EDGE);
    expect(colorForEmptyCell(EDGE_RED_START | EDGE_BLUE_START)).toBe(COLOR_CELL_BOTH_EDGES);
    expect(colorForEmptyCell(EDGE_RED_START | EDGE_RED_END)).toBe(COLOR_CELL_RED_EDGE);
  });

  it("shows the stone rather than the tint once a cell is played", () => {
    const stones = new Array(layout.cellCount).fill(0);
    expect(colorForCell(stones, topology.edges, 0)).toBe(COLOR_CELL_BOTH_EDGES);
    stones[0] = RED;
    expect(colorForCell(stones, topology.edges, 0)).toBe(COLOR_RED);
  });
});

describe("cellCommands", () => {
  const commands = cellCommands(layout, 12, COLOR_RED);

  it("fills a cell out of boxes, the one primitive the device draws reliably", () => {
    expect(commands.length).toBeGreaterThan(1);
    for (const command of commands) {
      expect(command.op).toBe("rect");
      expect(command.color).toBe(COLOR_RED);
    }
  });

  it("keeps every box inside the cell's own hexagon", () => {
    const cx = layout.centersX[12];
    const cy = layout.centersY[12];
    for (const c of commands) {
      // A pixel of slop for the rounding to whole pixels.
      expect(insideHex(cx, cy, layout.radius + 1, c.x1 + 0.5, c.y1 + 0.5)).toBe(true);
      expect(insideHex(cx, cy, layout.radius + 1, c.x2 - 0.5, c.y2 - 0.5)).toBe(true);
    }
  });

  it("centres the shape on the cell", () => {
    const widest = commands.reduce((a, b) => (b.x2 - b.x1 > a.x2 - a.x1 ? b : a));
    expect(Math.round((widest.x1 + widest.x2) / 2)).toBe(layout.centersX[12]);
  });
});

describe("boardCommands", () => {
  it("draws every cell of the board", () => {
    const stones = new Array(layout.cellCount).fill(0);
    const commands = boardCommands(layout, stones, topology.edges);
    const perCell = cellCommands(layout, 0, COLOR_CELL).length;
    expect(commands.length).toBeGreaterThanOrEqual(layout.cellCount);
    // Roughly one cell's worth of boxes per cell; the exact count varies with
    // where a cell rounds to.
    expect(commands.length).toBeLessThanOrEqual(layout.cellCount * (perCell + 2));
  });

  it("stays affordable on the biggest board", () => {
    const big = hexLayout(466, 9, SCREEN_PADDING, MIN_CAP);
    const stones = new Array(big.cellCount).fill(0);
    const commands = boardCommands(big, stones, topologyFor(9).edges);
    // A full board is drawn when a game starts, not per move, so the budget is
    // generous - but it must not run into the thousands.
    expect(commands.length).toBeLessThan(1500);
  });

  it("shows the stones that have been played", () => {
    const stones = new Array(layout.cellCount).fill(0);
    stones[7] = RED;
    const commands = boardCommands(layout, stones, topology.edges);
    expect(commands.some((c) => c.color === COLOR_RED)).toBe(true);
  });
});

describe("markCommands", () => {
  it("draws nothing before the first move", () => {
    expect(markCommands(layout, -1)).toEqual([]);
  });

  it("puts a dot on the cell centre", () => {
    const [dot] = markCommands(layout, 8);
    expect(dot.op).toBe("disc");
    expect(dot.x).toBe(layout.centersX[8]);
    expect(dot.y).toBe(layout.centersY[8]);
    expect(dot.color).toBe(COLOR_MARK);
    expect(dot.radius).toBeGreaterThanOrEqual(2);
    expect(dot.radius).toBeLessThan(layout.radius);
  });

  it("stays visible on the smallest cells a board can have", () => {
    const tiny = hexLayout(466, 9, 400, 400);
    const [dot] = markCommands(tiny, 0);
    expect(dot.radius).toBeGreaterThanOrEqual(2);
  });
});

describe("clearCommands", () => {
  it("wipes the whole band the board occupies", () => {
    const [wipe] = clearCommands(layout, 466);
    expect(wipe.op).toBe("rect");
    expect(wipe.color).toBe(COLOR_BACKGROUND);
    expect(wipe.x1).toBe(0);
    expect(wipe.x2).toBe(466);
    expect(wipe.y1).toBeLessThanOrEqual(layout.top);
    expect(wipe.y2).toBeGreaterThanOrEqual(layout.bottom);
  });
});
