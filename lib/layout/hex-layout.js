// Where the rhombus of hexagons sits, and which hexagon a finger landed on.
//
// A Hex board is a rhombus with 60 degree corners, so it is about 1.7 times as
// wide as it is tall. Shrinking a nine-cell board to fit a watch screen left
// cells under two millimetres across - readable, but not something a fingertip
// can hit. So the cell size is fixed at what is comfortable to tap and the board
// is allowed to be bigger than the screen instead: the player drags it around
// and taps the cell they want.
//
// Hexagons are pointy-topped, so a row of them is a straight horizontal line and
// each row is shifted half a cell right of the one above - which is what shears
// the square grid of cells into the rhombus Hex is played on.
//
// Nothing here knows about Zepp OS. The page turns these numbers into canvas
// polygons; the tests turn them into assertions.

import { clampSize } from "../hex/board.js";
import { createIntArray } from "../hex/arrays.js";

const SQRT3 = Math.sqrt(3);

// The hex size is the distance from a hexagon's centre to a corner. Neighbouring
// centres are SQRT3 of those apart, so a cell is SQRT3 wide and 2 tall.
//
// 0.0687 of the screen is 32px on a 466px watch, which makes a cell 55px across -
// the size the five-cell board already used, and the one that was comfortable to
// play. Every board now uses it, whatever its size.
export const HEX_SIZE_RATIO = 0.0687;

// How much of a cell the drawn hexagon takes up, leaving a hairline of
// background between neighbours so the tiling reads as separate cells.
export const HEX_FILL = 0.94;

export function hexSizeFor(screenSize) {
  return Math.max(4, Math.round(screenSize * HEX_SIZE_RATIO));
}

// Where cell (column, row) sits, in hex sizes, before the board is placed.
function unitX(column, row) {
  return (column + row / 2) * SQRT3;
}

function unitY(row) {
  return row * 1.5;
}

// The board, laid out at a fixed cell size around its own centre. Coordinates
// are relative to the middle of the board, so the page can put that middle
// wherever the panning has moved it to.
export function hexLayout(screenSize, size) {
  const cells = clampSize(size);
  const cellCount = cells * cells;
  const scale = hexSizeFor(screenSize);

  // The acute corners are cell (0,0) and cell (cells-1, cells-1); the middle of
  // the board is halfway between them.
  const centerX = unitX(cells - 1, cells - 1) / 2;
  const centerY = unitY(cells - 1) / 2;

  const offsetsX = createIntArray(cellCount);
  const offsetsY = createIntArray(cellCount);
  for (let row = 0; row < cells; row++) {
    for (let column = 0; column < cells; column++) {
      const cell = row * cells + column;
      offsetsX[cell] = Math.round((unitX(column, row) - centerX) * scale);
      offsetsY[cell] = Math.round((unitY(row) - centerY) * scale);
    }
  }

  // Half the board's full extent, corners included, which is what the panning
  // limits are measured against.
  const halfWidth = Math.round((unitX(cells - 1, cells - 1) / 2) * scale + (SQRT3 / 2) * scale);
  const halfHeight = Math.round((unitY(cells - 1) / 2) * scale + scale);

  return {
    size: cells,
    cellCount,
    scale,
    offsetsX,
    offsetsY,
    halfWidth,
    halfHeight,
    // A cell's width and height, handy for culling and for tests.
    cellWidth: Math.round(SQRT3 * scale),
    cellHeight: 2 * scale,
  };
}

// The six corners of the hexagon drawn for a cell, as {x, y} pairs ready for the
// canvas, given where the middle of the board currently is on screen. Pointy
// topped: the first corner is straight up.
export function hexCorners(layout, cell, originX, originY) {
  const radius = layout.scale * HEX_FILL;
  const centerX = originX + layout.offsetsX[cell];
  const centerY = originY + layout.offsetsY[cell];
  const dx = Math.round((SQRT3 / 2) * radius);
  const dy = Math.round(radius / 2);
  const top = Math.round(radius);
  return [
    { x: centerX, y: centerY - top },
    { x: centerX + dx, y: centerY - dy },
    { x: centerX + dx, y: centerY + dy },
    { x: centerX, y: centerY + top },
    { x: centerX - dx, y: centerY + dy },
    { x: centerX - dx, y: centerY - dy },
  ];
}

export function cellCenterX(layout, cell, originX) {
  return originX + layout.offsetsX[cell];
}

export function cellCenterY(layout, cell, originY) {
  return originY + layout.offsetsY[cell];
}

// Which cell a touch at (x, y) landed on, or -1 for a touch outside the board.
//
// Hexagons tile the plane, so the hexagon a point falls in is the one whose
// centre is nearest - the cells are exactly the Voronoi regions of their own
// centres. Comparing squared distances keeps it to integer arithmetic, and a
// touch further than one cell from every centre is off the board rather than
// snapped to its edge.
export function cellAt(layout, originX, originY, x, y) {
  let best = -1;
  let bestDistance = 0;
  const limit = layout.scale * layout.scale;
  for (let cell = 0; cell < layout.cellCount; cell++) {
    const dx = x - (originX + layout.offsetsX[cell]);
    const dy = y - (originY + layout.offsetsY[cell]);
    const distance = dx * dx + dy * dy;
    if (best < 0 || distance < bestDistance) {
      best = cell;
      bestDistance = distance;
    }
  }
  return best >= 0 && bestDistance <= limit ? best : -1;
}

// The radius a cell's centre has to stay inside for the whole hexagon to clear
// the bezel.
function safeReach(layout, screenSize, padding) {
  return screenSize / 2 - Math.max(0, padding) - layout.scale * HEX_FILL;
}

// How far a cell's centre may sit above or below the middle before the hexagon
// runs off the band the board is drawn in. The round screen is not the only
// thing that hides a cell: the board is painted on a canvas that stops short of
// both caps, and a cell past its edge is not drawn at all.
function bandRoom(layout, bandHeight) {
  return Math.max(0, bandHeight / 2 - layout.cellHeight / 2);
}

// How far a cell's centre is from the middle of the screen at the given pan. The
// board is centred on the screen, so the pan is the offset of the whole thing.
export function cellReach(layout, cell, panX, panY) {
  const dx = panX + layout.offsetsX[cell];
  const dy = panY + layout.offsetsY[cell];
  return Math.sqrt(dx * dx + dy * dy);
}

// How far the board may be dragged.
//
// The obvious answer - until the board's edge meets the viewport's - is wrong on
// a round watch, because the corners of that rectangle are under the bezel. The
// board has to be draggable that bit further, or the cells in its own two acute
// corners can never be brought out from behind the rim: on a nine-cell board
// they stopped 36 pixels short of clearing it.
//
// So the limit is what the furthest cell needs in order to reach the visible
// circle, taken along the direction it lies in and split into the two axes the
// drag is clamped on. A board whose cells all clear the bezel where it sits does
// not move at all, which is why five cells across still sits still.
export function panLimits(layout, screenSize, padding, bandHeight) {
  const safe = safeReach(layout, screenSize, padding);
  const room = bandRoom(layout, bandHeight);
  let limitX = 0;
  let limitY = 0;
  for (let cell = 0; cell < layout.cellCount; cell++) {
    const offsetX = layout.offsetsX[cell];
    const offsetY = layout.offsetsY[cell];

    const reach = cellReach(layout, cell, 0, 0);
    if (reach > safe && reach > 0) {
      const needed = reach - safe;
      const needX = Math.ceil((needed * Math.abs(offsetX)) / reach);
      const needY = Math.ceil((needed * Math.abs(offsetY)) / reach);
      if (needX > limitX) {
        limitX = needX;
      }
      if (needY > limitY) {
        limitY = needY;
      }
    }

    // And enough to lift a cell into the band, which on a tall board runs out
    // before the circle does.
    const needBand = Math.ceil(Math.abs(offsetY) - room);
    if (needBand > limitY) {
      limitY = needBand;
    }
  }
  return { x: limitX, y: limitY };
}

export function clampPan(value, limit) {
  if (value > limit) {
    return limit;
  }
  if (value < -limit) {
    return -limit;
  }
  return value;
}

// Whether the whole of a cell clears the bezel: what "you can see this one" has
// to mean on a round screen, and what decides whether the watch's answer needs
// the board moved to show it.
export function isCellFullyVisible(layout, cell, panX, panY, screenSize, padding, bandHeight) {
  if (Math.abs(panY + layout.offsetsY[cell]) > bandRoom(layout, bandHeight)) {
    return false;
  }
  return cellReach(layout, cell, panX, panY) <= safeReach(layout, screenSize, padding);
}

// Whether any part of a cell is on the screen at all, which is what decides
// whether it is worth drawing. Generous on purpose: a hexagon half under the rim
// still has a half worth painting.
// `margin` is how far the painted canvas may later be slid without being
// repainted - during a drag it moves under the finger and the hexagons on it do
// not - so a cell that far outside is still painted, ready to slide into view.
export function isCellDrawable(layout, cell, panX, panY, screenSize, margin) {
  const slack = screenSize / 2 + layout.scale + Math.max(0, margin || 0);
  return cellReach(layout, cell, panX, panY) <= slack;
}

// The pan that brings a cell out from behind the rim, clamped to the limits.
// Aims at the middle of the screen and settles for as close as it can get, which
// the limits guarantee is close enough to clear the bezel.
export function panToCell(layout, cell, screenSize, padding, bandHeight) {
  const limits = panLimits(layout, screenSize, padding, bandHeight);
  return {
    x: clampPan(-layout.offsetsX[cell], limits.x),
    y: clampPan(-layout.offsetsY[cell], limits.y),
  };
}
