// What the board looks like, as a list of drawing primitives.
//
// The page owns a canvas and knows how to execute `rect` and `disc`; it does not
// know what an empty cell or a stone looks like. That lives here, in pure
// functions, so the artwork is unit tested like everything else - a test can ask
// "what colour is a corner cell" and get an answer without a watch.
//
// Only two primitives are used, and that is deliberate: `drawRect` and
// `drawCircle` are proven on the device, while `drawPoly` is accepted and then
// silently draws nothing (see lib/layout/hex-shape.js).
import { EDGE_BLUE_END, EDGE_BLUE_START, EDGE_RED_END, EDGE_RED_START, RED } from "./hex/board.js";
import { hexSpans } from "./layout/hex-shape.js";
import {
  COLOR_BACKGROUND,
  COLOR_BLUE,
  COLOR_CELL,
  COLOR_CELL_BLUE_EDGE,
  COLOR_CELL_BOTH_EDGES,
  COLOR_CELL_RED_EDGE,
  COLOR_MARK,
  COLOR_RED,
} from "../utils/config/constants.js";

const RED_EDGES = EDGE_RED_START | EDGE_RED_END;
const BLUE_EDGES = EDGE_BLUE_START | EDGE_BLUE_END;

// How big the last-move dot is, as a fraction of the cell.
const MARK_RATIO = 0.32;

export function colorForStone(stone) {
  return stone === RED ? COLOR_RED : COLOR_BLUE;
}

// What an empty cell is painted: plain in the middle of the board, tinted along
// an edge to show whose side it is. The corners belong to one edge of each
// player and are painted as such rather than being assigned to one of them.
export function colorForEmptyCell(edges) {
  const red = (edges & RED_EDGES) !== 0;
  const blue = (edges & BLUE_EDGES) !== 0;
  if (red && blue) {
    return COLOR_CELL_BOTH_EDGES;
  }
  if (red) {
    return COLOR_CELL_RED_EDGE;
  }
  if (blue) {
    return COLOR_CELL_BLUE_EDGE;
  }
  return COLOR_CELL;
}

// The colour a cell should be right now: its stone, or its own empty tint.
export function colorForCell(stones, edges, cell) {
  const stone = stones[cell];
  return stone ? colorForStone(stone) : colorForEmptyCell(edges[cell]);
}

// One cell, as filled boxes. The caller passes the colour so the same function
// draws an empty cell, a stone, and a cell being painted back to empty.
export function cellCommands(layout, cell, color) {
  const spans = hexSpans(layout.centersX[cell], layout.centersY[cell], layout.radius);
  const commands = [];
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    commands.push({ op: "rect", x1: span.x1, y1: span.y1, x2: span.x2, y2: span.y2, color });
  }
  return commands;
}

// The whole board, cell by cell. Used when a board is first drawn and whenever
// one is dealt again; a single move repaints one cell instead.
export function boardCommands(layout, stones, edges) {
  const commands = [];
  for (let cell = 0; cell < layout.cellCount; cell++) {
    const color = colorForCell(stones, edges, cell);
    const spans = cellCommands(layout, cell, color);
    for (let i = 0; i < spans.length; i++) {
      commands.push(spans[i]);
    }
  }
  return commands;
}

// The dot on the stone played last, so a board of look-alike cells still shows
// what just happened.
export function markCommands(layout, cell) {
  if (cell < 0) {
    return [];
  }
  return [
    {
      op: "disc",
      x: layout.centersX[cell],
      y: layout.centersY[cell],
      radius: Math.max(2, Math.round(layout.radius * MARK_RATIO)),
      color: COLOR_MARK,
    },
  ];
}

// The band of screen the board occupies, wiped back to the page background.
// Repainting a cell cannot uncover what was under it, so the board is cleared
// before it is dealt again.
export function clearCommands(layout, screenSize) {
  return [
    {
      op: "rect",
      x1: 0,
      y1: layout.top,
      x2: screenSize,
      y2: layout.bottom,
      color: COLOR_BACKGROUND,
    },
  ];
}
