import { describe, it, expect } from "vitest";
import { CELL_RATIO, cellInradius, hexLayout } from "../lib/layout/hex-layout.js";
import { MAX_NEIGHBORS, MAX_SIZE, MIN_SIZE, topologyFor } from "../lib/hex/board.js";
import { BOARD_SIZES } from "../lib/settings.js";
import { MIN_CAP, SCREEN_PADDING } from "../utils/config/constants.js";

// The two round screens the app is built for, the boards it offers and the
// spacing it asks for, taken from what actually ships rather than restated here:
// the guarantees below are only worth having for the real numbers.
const SCREENS = [466, 480];
const SIZES = BOARD_SIZES;
const PADDING = SCREEN_PADDING;

const distance = (layout, a, b) =>
  Math.hypot(layout.centersX[a] - layout.centersX[b], layout.centersY[a] - layout.centersY[b]);

describe("hexLayout", () => {
  it("keeps every cell inside the bezel on every screen and board size", () => {
    for (const screen of SCREENS) {
      for (const size of SIZES) {
        const layout = hexLayout(screen, size, PADDING, MIN_CAP);
        const middle = screen / 2;
        for (let cell = 0; cell < layout.cellCount; cell++) {
          const reach =
            Math.hypot(layout.centersX[cell] - middle, layout.centersY[cell] - middle) +
            layout.radius;
          expect(reach, `screen ${screen} size ${size} cell ${cell}`).toBeLessThanOrEqual(
            middle - PADDING + 1
          );
        }
      }
    }
  });

  it("leaves a cap of at least the requested height above and below", () => {
    for (const screen of SCREENS) {
      for (const size of SIZES) {
        const layout = hexLayout(screen, size, PADDING, MIN_CAP);
        expect(layout.top, `screen ${screen} size ${size}`).toBeGreaterThanOrEqual(MIN_CAP - 1);
        expect(screen - layout.bottom, `screen ${screen} size ${size}`).toBeGreaterThanOrEqual(
          MIN_CAP - 1
        );
      }
    }
  });

  it("draws cells big enough to tap on every supported board", () => {
    for (const screen of SCREENS) {
      for (const size of SIZES) {
        const layout = hexLayout(screen, size, PADDING, MIN_CAP);
        expect(layout.radius * 2, `screen ${screen} size ${size}`).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it("never lets two cells overlap", () => {
    // Hexagons meet along a side, not at a corner, so what must not overlap is
    // twice the inradius. Their circumscribed circles do overlap, which is why
    // this is not measured against `radius`.
    for (const size of SIZES) {
      const layout = hexLayout(466, size, PADDING, MIN_CAP);
      const topology = topologyFor(size);
      for (let cell = 0; cell < layout.cellCount; cell++) {
        for (let i = 0; i < topology.degree[cell]; i++) {
          const next = topology.neighbors[cell * MAX_NEIGHBORS + i];
          expect(distance(layout, cell, next), `size ${size}: ${cell}-${next}`).toBeGreaterThan(
            2 * cellInradius(layout)
          );
        }
      }
    }
  });

  it("leaves a visible gap between neighbouring cells", () => {
    // Cells drawn at the full hex size would share edges and read as one slab.
    for (const size of SIZES) {
      const layout = hexLayout(466, size, PADDING, MIN_CAP);
      const topology = topologyFor(size);
      const gap = distance(layout, 0, topology.neighbors[0]) - 2 * cellInradius(layout);
      expect(gap, `size ${size}`).toBeGreaterThanOrEqual(1);
    }
  });

  it("puts every neighbour the same distance away, which is what makes it a hex grid", () => {
    const layout = hexLayout(466, 7, PADDING, MIN_CAP);
    const topology = topologyFor(7);
    const spacings = [];
    for (let cell = 0; cell < layout.cellCount; cell++) {
      for (let i = 0; i < topology.degree[cell]; i++) {
        spacings.push(distance(layout, cell, topology.neighbors[cell * MAX_NEIGHBORS + i]));
      }
    }
    const smallest = Math.min(...spacings);
    const largest = Math.max(...spacings);
    // Centres are rounded to whole pixels, so allow a pixel of slop.
    expect(largest - smallest).toBeLessThanOrEqual(2);
  });

  it("shears each row half a cell to the right of the one above it", () => {
    const layout = hexLayout(466, 5, PADDING, MIN_CAP);
    const step = layout.centersX[1] - layout.centersX[0];
    // Centres are rounded to whole pixels, so allow a pixel of slop.
    expect(Math.abs(layout.centersX[5] - layout.centersX[0] - step / 2)).toBeLessThanOrEqual(1);
    expect(layout.centersY[5]).toBeGreaterThan(layout.centersY[0]);
    expect(layout.centersY[1]).toBe(layout.centersY[0]);
  });

  it("centres the board, so the acute corners mirror each other", () => {
    for (const size of SIZES) {
      const layout = hexLayout(466, size, PADDING, MIN_CAP);
      const last = layout.cellCount - 1;
      expect(layout.centersX[0] + layout.centersX[last], `size ${size}`).toBe(466);
      expect(layout.centersY[0] + layout.centersY[last], `size ${size}`).toBe(466);
    }
  });

  it("shrinks the cells as the board grows", () => {
    let previous = Infinity;
    for (const size of SIZES) {
      const layout = hexLayout(466, size, PADDING, MIN_CAP);
      expect(layout.radius, `size ${size}`).toBeLessThan(previous);
      previous = layout.radius;
    }
  });

  it("clamps a board size it does not support", () => {
    expect(hexLayout(466, 0, PADDING, MIN_CAP).size).toBe(MIN_SIZE);
    expect(hexLayout(466, 99, PADDING, MIN_CAP).size).toBe(MAX_SIZE);
  });

  it("still produces a drawable board when there is no room to spare", () => {
    const layout = hexLayout(466, 9, 400, 400);
    expect(layout.radius).toBeGreaterThanOrEqual(1);
    expect(layout.cellCount).toBe(81);
  });

  it("sizes a hexagon from the hex size it settled on", () => {
    const layout = hexLayout(466, 7, PADDING, MIN_CAP);
    expect(layout.radius).toBe(Math.floor(layout.scale * CELL_RATIO));
    expect(CELL_RATIO).toBeLessThan(1);
  });
});
