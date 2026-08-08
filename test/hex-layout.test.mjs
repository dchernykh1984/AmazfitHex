import { describe, it, expect } from "vitest";
import {
  HEX_FILL,
  cellAt,
  cellCenterX,
  cellCenterY,
  cellReach,
  clampPan,
  hexCorners,
  hexLayout,
  hexSizeFor,
  isCellDrawable,
  isCellFullyVisible,
  panLimits,
  panToCell,
} from "../lib/layout/hex-layout.js";
import { MAX_NEIGHBORS, MAX_SIZE, MIN_SIZE, topologyFor } from "../lib/hex/board.js";
import { BOARD_SIZES } from "../lib/settings.js";

// The two round screens the app is built for, and the boards it offers.
const SCREENS = [466, 480];
const SIZES = BOARD_SIZES;

const distance = (layout, a, b) =>
  Math.hypot(layout.offsetsX[a] - layout.offsetsX[b], layout.offsetsY[a] - layout.offsetsY[b]);

describe("hexSizeFor", () => {
  it("gives a cell a fingertip can hit, the size the five-cell board already used", () => {
    // 55px across on a 466px watch is what the old five-cell board drew and what
    // was comfortable to play; every board now uses it.
    const layout = hexLayout(466, 5);
    expect(layout.cellWidth).toBeGreaterThanOrEqual(50);
    expect(layout.cellWidth).toBeLessThanOrEqual(60);
  });

  it("keeps a cell the same size whatever the board size", () => {
    const sizes = SIZES.map((size) => hexLayout(466, size).cellWidth);
    expect(new Set(sizes).size).toBe(1);
  });

  it("scales with the screen rather than being a fixed pixel count", () => {
    expect(hexSizeFor(480)).toBeGreaterThan(hexSizeFor(466));
    expect(hexSizeFor(1)).toBeGreaterThanOrEqual(4);
  });
});

describe("hexLayout", () => {
  it("clamps a board size it does not support", () => {
    expect(hexLayout(466, 0).size).toBe(MIN_SIZE);
    expect(hexLayout(466, 99).size).toBe(MAX_SIZE);
  });

  it("centres the board, so the acute corners mirror each other", () => {
    for (const size of SIZES) {
      const layout = hexLayout(466, size);
      const last = layout.cellCount - 1;
      expect(layout.offsetsX[0] + layout.offsetsX[last], `size ${size}`).toBe(0);
      expect(layout.offsetsY[0] + layout.offsetsY[last], `size ${size}`).toBe(0);
    }
  });

  it("puts every neighbour the same distance away, which is what makes it a hex grid", () => {
    const layout = hexLayout(466, 7);
    const topology = topologyFor(7);
    const spacings = [];
    for (let cell = 0; cell < layout.cellCount; cell++) {
      for (let i = 0; i < topology.degree[cell]; i++) {
        spacings.push(distance(layout, cell, topology.neighbors[cell * MAX_NEIGHBORS + i]));
      }
    }
    // Centres are rounded to whole pixels, so allow a pixel of slop.
    expect(Math.max(...spacings) - Math.min(...spacings)).toBeLessThanOrEqual(2);
  });

  it("shears each row half a cell to the right of the one above it", () => {
    const layout = hexLayout(466, 5);
    const step = layout.offsetsX[1] - layout.offsetsX[0];
    expect(Math.abs(layout.offsetsX[5] - layout.offsetsX[0] - step / 2)).toBeLessThanOrEqual(1);
    expect(layout.offsetsY[5]).toBeGreaterThan(layout.offsetsY[0]);
    expect(layout.offsetsY[1]).toBe(layout.offsetsY[0]);
  });

  it("grows with the board instead of shrinking the cells", () => {
    let previous = 0;
    for (const size of SIZES) {
      const layout = hexLayout(466, size);
      expect(layout.halfWidth, `size ${size}`).toBeGreaterThan(previous);
      previous = layout.halfWidth;
    }
  });

  it("covers every cell within its own half extents", () => {
    for (const size of SIZES) {
      const layout = hexLayout(466, size);
      for (let cell = 0; cell < layout.cellCount; cell++) {
        expect(Math.abs(layout.offsetsX[cell]) + layout.cellWidth / 2).toBeLessThanOrEqual(
          layout.halfWidth + 1
        );
        expect(Math.abs(layout.offsetsY[cell]) + layout.cellHeight / 2).toBeLessThanOrEqual(
          layout.halfHeight + 1
        );
      }
    }
  });
});

describe("hexCorners", () => {
  it("draws a pointy-topped hexagon around the cell centre", () => {
    const layout = hexLayout(466, 5);
    const corners = hexCorners(layout, 12, 233, 233);
    expect(corners.length).toBe(6);

    const centerX = cellCenterX(layout, 12, 233);
    const centerY = cellCenterY(layout, 12, 233);
    // A point straight up and one straight down, and four at the corners.
    expect(corners[0].x).toBe(centerX);
    expect(corners[3].x).toBe(centerX);
    expect(corners[0].y).toBeLessThan(centerY);
    expect(corners[3].y).toBeGreaterThan(centerY);
    // Symmetric about the centre in both directions.
    expect(corners[0].y + corners[3].y).toBe(2 * centerY);
    expect(corners[1].x + corners[5].x).toBe(2 * centerX);
    expect(corners[1].y).toBe(corners[5].y);
  });

  it("is a regular hexagon: every corner the same distance from the middle", () => {
    const layout = hexLayout(466, 7);
    const corners = hexCorners(layout, 0, 200, 200);
    const centerX = cellCenterX(layout, 0, 200);
    const centerY = cellCenterY(layout, 0, 200);
    const reach = corners.map((corner) => Math.hypot(corner.x - centerX, corner.y - centerY));
    expect(Math.max(...reach) - Math.min(...reach)).toBeLessThanOrEqual(1.5);
    expect(Math.max(...reach)).toBeLessThanOrEqual(layout.scale);
  });

  it("leaves a gap between neighbours rather than merging them into a slab", () => {
    const layout = hexLayout(466, 5);
    expect(HEX_FILL).toBeLessThan(1);
    const across = hexCorners(layout, 0, 0, 0)[1].x - hexCorners(layout, 0, 0, 0)[5].x;
    expect(across).toBeLessThan(layout.cellWidth);
  });

  it("moves with the board when it is panned", () => {
    const layout = hexLayout(466, 5);
    const still = hexCorners(layout, 7, 233, 233);
    const moved = hexCorners(layout, 7, 233 + 40, 233 - 25);
    for (let i = 0; i < 6; i++) {
      expect(moved[i].x - still[i].x).toBe(40);
      expect(moved[i].y - still[i].y).toBe(-25);
    }
  });
});

describe("cellAt", () => {
  it("finds the cell a touch on its centre belongs to", () => {
    for (const size of SIZES) {
      const layout = hexLayout(466, size);
      for (let cell = 0; cell < layout.cellCount; cell++) {
        const x = cellCenterX(layout, cell, 233);
        const y = cellCenterY(layout, cell, 233);
        expect(cellAt(layout, 233, 233, x, y), `size ${size} cell ${cell}`).toBe(cell);
      }
    }
  });

  it("still picks the right cell well away from its centre", () => {
    const layout = hexLayout(466, 7);
    const cell = 3 * 7 + 3;
    const x = cellCenterX(layout, cell, 233);
    const y = cellCenterY(layout, cell, 233);
    // Most of the way to the flat side, and most of the way to a corner.
    expect(cellAt(layout, 233, 233, x + layout.cellWidth * 0.4, y)).toBe(cell);
    expect(cellAt(layout, 233, 233, x, y - layout.scale * 0.8)).toBe(cell);
  });

  it("rejects a touch that missed the board", () => {
    const layout = hexLayout(466, 5);
    expect(cellAt(layout, 233, 233, 233, 233 - layout.halfHeight - 60)).toBe(-1);
    expect(cellAt(layout, 233, 233, 233 - layout.halfWidth - 80, 233)).toBe(-1);
  });

  it("follows the board as it is panned", () => {
    const layout = hexLayout(466, 9);
    const cell = 0;
    const x = cellCenterX(layout, cell, 233 + 120);
    const y = cellCenterY(layout, cell, 233 - 40);
    expect(cellAt(layout, 233 + 120, 233 - 40, x, y)).toBe(cell);
    // The same screen point is a different cell once the board has moved.
    expect(cellAt(layout, 233, 233, x, y)).not.toBe(cell);
  });

  it("never returns two cells for one touch, whatever the board", () => {
    // Every cell claims the points nearest its own centre and no others, so a
    // sweep across the board hands back each cell in an unbroken run.
    const layout = hexLayout(466, 5);
    const seen = new Set();
    for (let y = -layout.halfHeight; y <= layout.halfHeight; y += 3) {
      for (let x = -layout.halfWidth; x <= layout.halfWidth; x += 3) {
        const cell = cellAt(layout, 0, 0, x, y);
        if (cell >= 0) {
          seen.add(cell);
        }
      }
    }
    expect(seen.size).toBe(layout.cellCount);
  });
});

describe("panning", () => {
  const PADDING = 8;

  it("holds a board whose cells all clear the bezel where it sits", () => {
    const layout = hexLayout(466, 5);
    expect(panLimits(layout, 466, PADDING)).toEqual({ x: 0, y: 0 });
  });

  it("lets a bigger board travel far enough to free its acute corners", () => {
    // The board's own corners are the cells that hide behind the rim, and the
    // rectangle the board sits in is not what decides it - the circle is.
    for (const size of [7, 9]) {
      const limits = panLimits(hexLayout(466, size), 466, PADDING);
      expect(limits.x, `size ${size}`).toBeGreaterThan(0);
      expect(limits.y, `size ${size}`).toBeGreaterThan(0);
    }
  });

  it("can bring every cell of every board out from behind the rim", () => {
    // The bug this guards: on a round screen the pan used to stop when the
    // board's edge met the viewport's, which left the two acute corner cells
    // permanently under the bezel - visible as a sliver and impossible to tap.
    for (const screen of SCREENS) {
      for (const size of SIZES) {
        const layout = hexLayout(screen, size);
        const limits = panLimits(layout, screen, PADDING);
        for (let cell = 0; cell < layout.cellCount; cell++) {
          const pan = panToCell(layout, cell, screen, PADDING);
          expect(Math.abs(pan.x), `screen ${screen} size ${size}`).toBeLessThanOrEqual(limits.x);
          expect(Math.abs(pan.y), `screen ${screen} size ${size}`).toBeLessThanOrEqual(limits.y);
          expect(
            isCellFullyVisible(layout, cell, pan.x, pan.y, screen, PADDING),
            `screen ${screen} size ${size} cell ${cell}`
          ).toBe(true);
        }
      }
    }
  });

  it("asks for no more room than the corners actually need", () => {
    // Every pixel of allowance past that is board that can be dragged off the
    // screen for nothing.
    const layout = hexLayout(466, 9);
    const limits = panLimits(layout, 466, PADDING);
    let worst = 0;
    for (let cell = 0; cell < layout.cellCount; cell++) {
      worst = Math.max(worst, Math.abs(layout.offsetsX[cell]));
    }
    expect(limits.x).toBeLessThan(worst);
  });

  it("clamps a drag to the limit rather than letting the board come away", () => {
    expect(clampPan(500, 120)).toBe(120);
    expect(clampPan(-500, 120)).toBe(-120);
    expect(clampPan(40, 120)).toBe(40);
    expect(clampPan(0, 0)).toBe(0);
  });

  it("does not move a board that fits, even to show a cell", () => {
    const layout = hexLayout(466, 5);
    expect(panToCell(layout, 0, 466, PADDING)).toEqual({ x: 0, y: 0 });
  });
});

describe("what is on screen", () => {
  const PADDING = 8;

  it("measures a cell from the middle of the screen", () => {
    const layout = hexLayout(466, 9);
    expect(cellReach(layout, 0, -layout.offsetsX[0], -layout.offsetsY[0])).toBe(0);
    expect(cellReach(layout, 0, 0, 0)).toBeGreaterThan(0);
  });

  it("counts a cell fully visible only when the whole hexagon clears the bezel", () => {
    const layout = hexLayout(466, 9);
    // The middle of the board is as clear as it gets.
    const middle = 4 * 9 + 4;
    expect(isCellFullyVisible(layout, middle, 0, 0, 466, PADDING)).toBe(true);
    // An acute corner, unmoved, is not.
    expect(isCellFullyVisible(layout, 0, 0, 0, 466, PADDING)).toBe(false);
  });

  it("still draws a cell that is only half on screen", () => {
    const layout = hexLayout(466, 9);
    // Somewhere on the board there is a hexagon straddling the rim: too far out
    // to count as seen, close enough that the half of it on screen is worth
    // painting.
    let straddling = -1;
    for (let cell = 0; cell < layout.cellCount; cell++) {
      if (
        !isCellFullyVisible(layout, cell, 0, 0, 466, PADDING) &&
        isCellDrawable(layout, cell, 0, 0, 466)
      ) {
        straddling = cell;
        break;
      }
    }
    expect(straddling).toBeGreaterThanOrEqual(0);
  });

  it("drops the cells dragged right off the screen", () => {
    const layout = hexLayout(466, 9);
    let drawable = 0;
    for (let cell = 0; cell < layout.cellCount; cell++) {
      if (isCellDrawable(layout, cell, 0, 0, 466)) {
        drawable += 1;
      }
    }
    expect(drawable).toBeGreaterThan(0);
    expect(drawable).toBeLessThan(layout.cellCount);
  });

  it("keeps every cell of a board that fits", () => {
    const layout = hexLayout(466, 5);
    for (let cell = 0; cell < layout.cellCount; cell++) {
      expect(isCellDrawable(layout, cell, 0, 0, 466), `cell ${cell}`).toBe(true);
      expect(isCellFullyVisible(layout, cell, 0, 0, 466, PADDING), `cell ${cell}`).toBe(true);
    }
  });
});

describe("hexCorners for every board", () => {
  it("draws a hexagon for every cell on every screen and board", () => {
    for (const screen of SCREENS) {
      for (const size of SIZES) {
        const layout = hexLayout(screen, size);
        for (let cell = 0; cell < layout.cellCount; cell++) {
          const corners = hexCorners(layout, cell, 0, 0);
          expect(corners.length, `screen ${screen} size ${size}`).toBe(6);
          for (const corner of corners) {
            expect(Number.isFinite(corner.x)).toBe(true);
            expect(Number.isFinite(corner.y)).toBe(true);
          }
        }
      }
    }
  });
});
