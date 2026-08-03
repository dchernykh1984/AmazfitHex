// Where the rhombus of hexagons lands on a round watch screen.
//
// A Hex board is a rhombus with 60 degree corners, so it is about 1.7 times as
// wide as it is tall - close to the worst shape there is for fitting inside a
// circle. What is left over is a cap above the board and another below it, which
// the page fills with the status line and the buttons.
//
// Cells are laid out on the hex lattice and drawn as discs rather than as
// hexagons: the watch UI has no polygon to draw with, and a lattice of discs
// reads as a hex board at a glance while costing exactly one widget per cell.
//
// Hexagons here are pointy-topped, so a row of them is a straight horizontal
// line and each row is shifted half a cell to the right of the one above it -
// which is what shears the square grid of cells into the rhombus Hex is played
// on.

import { clampSize } from "../hex/board.js";
import { createIntArray } from "../hex/arrays.js";

const SQRT3 = Math.sqrt(3);

// Neighbouring cell centres are SQRT3 hex sizes apart (a hex size being the
// distance from a hexagon's centre to a corner). Drawing each cell at 0.78 of
// that leaves a clear gap of about a fifth of the spacing between discs, which
// is enough to read them as separate cells without wasting the little room a
// watch has.
export const CELL_RATIO = 0.78;

// Where cell (column, row) sits, in hex sizes, before the board is centred.
function unitX(column, row) {
  return (column + row / 2) * SQRT3;
}

function unitY(row) {
  return row * 1.5;
}

// The largest board that fits, and where every cell of it goes.
//
// `padding` is the gap kept between the board and the bezel, and `minCap` the
// height reserved at the top and the bottom of the screen for everything that is
// not the board. Both constraints are exact rather than estimated: a cell is
// placed at a fixed multiple of the hex size from the middle of the screen, so
// the largest hex size each cell allows can be solved for directly and the
// smallest of those answers is the one the board is drawn at.
export function hexLayout(screenSize, size, padding, minCap) {
  const cells = clampSize(size);
  const cellCount = cells * cells;
  const middle = screenSize / 2;
  const radius = Math.max(1, middle - Math.max(0, padding));
  const halfBand = Math.max(1, middle - Math.max(0, minCap));

  // Centre of the rhombus in hex sizes: the acute corners are cell (0,0) and
  // cell (cells-1, cells-1), and the middle of the board is halfway between.
  const centerX = unitX(cells - 1, cells - 1) / 2;
  const centerY = unitY(cells - 1) / 2;

  let scale = Infinity;
  for (let row = 0; row < cells; row++) {
    for (let column = 0; column < cells; column++) {
      const dx = unitX(column, row) - centerX;
      const dy = unitY(row) - centerY;
      const reach = Math.sqrt(dx * dx + dy * dy) + CELL_RATIO;
      const fromBezel = radius / reach;
      const fromCap = halfBand / (Math.abs(dy) + CELL_RATIO);
      const allowed = fromBezel < fromCap ? fromBezel : fromCap;
      if (allowed < scale) {
        scale = allowed;
      }
    }
  }

  const centersX = createIntArray(cellCount);
  const centersY = createIntArray(cellCount);
  let top = screenSize;
  let bottom = 0;
  const cellRadius = Math.max(1, Math.floor(scale * CELL_RATIO));

  for (let row = 0; row < cells; row++) {
    for (let column = 0; column < cells; column++) {
      const cell = row * cells + column;
      const y = Math.round(middle + (unitY(row) - centerY) * scale);
      centersX[cell] = Math.round(middle + (unitX(column, row) - centerX) * scale);
      centersY[cell] = y;
      if (y - cellRadius < top) {
        top = y - cellRadius;
      }
      if (y + cellRadius > bottom) {
        bottom = y + cellRadius;
      }
    }
  }

  return {
    size: cells,
    cellCount,
    // The hex size the board came out at, and the radius of the disc drawn for
    // one cell.
    scale,
    radius: cellRadius,
    centersX,
    centersY,
    // The band the board actually occupies, so the page knows how much room the
    // caps above and below it have.
    top,
    bottom,
  };
}

// The pixel box of a cell's disc, ready to hand to createWidget.
export function cellBox(layout, cell) {
  const size = layout.radius * 2;
  return {
    x: layout.centersX[cell] - layout.radius,
    y: layout.centersY[cell] - layout.radius,
    w: size,
    h: size,
  };
}
