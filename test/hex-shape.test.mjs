import { describe, it, expect } from "vitest";
import { cellAt, hexCorners, hexHalfWidth, hexSpans, insideHex } from "../lib/layout/hex-shape.js";
import { hexLayout } from "../lib/layout/hex-layout.js";

const SQRT3 = Math.sqrt(3);

describe("hexHalfWidth", () => {
  it("is a pointy-topped hexagon: taller than it is wide", () => {
    expect(hexHalfWidth(10)).toBeCloseTo((SQRT3 * 10) / 2);
    expect(hexHalfWidth(10)).toBeLessThan(10);
  });
});

describe("hexCorners", () => {
  it("puts a corner at the top and at the bottom", () => {
    const corners = hexCorners(100, 100, 20);
    expect(corners.length).toBe(6);
    expect(corners[0]).toEqual({ x: 100, y: 80 });
    expect(corners[3]).toEqual({ x: 100, y: 120 });
  });

  it("is symmetric about both axes", () => {
    const corners = hexCorners(100, 100, 20);
    const xs = corners.map((c) => c.x).sort((a, b) => a - b);
    const ys = corners.map((c) => c.y).sort((a, b) => a - b);
    expect(xs[0] + xs[5]).toBeCloseTo(200);
    expect(ys[0] + ys[5]).toBeCloseTo(200);
  });

  it("has every corner exactly one radius from the centre", () => {
    for (const c of hexCorners(50, 60, 14)) {
      expect(Math.hypot(c.x - 50, c.y - 60)).toBeCloseTo(14);
    }
  });
});

describe("insideHex", () => {
  it("contains the centre and the corners", () => {
    expect(insideHex(0, 0, 20, 0, 0)).toBe(true);
    for (const c of hexCorners(0, 0, 20)) {
      // The corners sit exactly on the boundary, which counts as inside.
      expect(insideHex(0, 0, 20, c.x, c.y)).toBe(true);
    }
  });

  it("excludes points past the flat sides and past the points", () => {
    const half = hexHalfWidth(20);
    expect(insideHex(0, 0, 20, half + 1, 0)).toBe(false);
    expect(insideHex(0, 0, 20, 0, 21)).toBe(false);
    // The area just outside a slanted side, which a bounding box would wrongly
    // call inside.
    expect(insideHex(0, 0, 20, half - 0.5, 19)).toBe(false);
  });
});

describe("hexSpans", () => {
  const RADIUS = 16;
  const spans = hexSpans(100, 100, RADIUS);

  it("covers the full height of the hexagon without a gap", () => {
    const sorted = [...spans].sort((a, b) => a.y1 - b.y1);
    expect(sorted[0].y1).toBe(100 - RADIUS);
    expect(sorted[sorted.length - 1].y2).toBe(100 + RADIUS);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].y1, "a gap between rows would show as a stripe").toBe(sorted[i - 1].y2);
    }
  });

  it("reaches full width across the middle band", () => {
    const widest = Math.max(...spans.map((s) => s.x2 - s.x1));
    expect(widest).toBe(2 * Math.round(hexHalfWidth(RADIUS)));
  });

  it("is symmetric about the centre line", () => {
    for (const s of spans) {
      expect(s.x1 + s.x2).toBe(200);
    }
  });

  it("stays inside the hexagon it is filling", () => {
    for (const s of spans) {
      // Sample the row at its widest point, one pixel in from each end so
      // rounding at the very edge does not make this brittle.
      const y = s.y1 + 0.5;
      expect(insideHex(100, 100, RADIUS + 1, s.x1 + 0.5, y), `row ${s.y1}`).toBe(true);
      expect(insideHex(100, 100, RADIUS + 1, s.x2 - 0.5, y), `row ${s.y1}`).toBe(true);
    }
  });

  it("fills about the area of a hexagon", () => {
    const area = spans.reduce((sum, s) => sum + (s.x2 - s.x1) * (s.y2 - s.y1), 0);
    const exact = ((3 * SQRT3) / 2) * RADIUS * RADIUS;
    expect(area).toBeGreaterThan(exact * 0.88);
    expect(area).toBeLessThan(exact * 1.12);
  });

  it("costs a handful of boxes per cell, not one per pixel", () => {
    // A whole 9x9 board is drawn from these, so the count per cell is what keeps
    // a full repaint affordable.
    expect(spans.length).toBeLessThanOrEqual(RADIUS + 2);
  });

  it("survives a degenerate radius", () => {
    expect(hexSpans(10, 10, 0).length).toBeGreaterThan(0);
    expect(hexSpans(10, 10, 1).length).toBeGreaterThan(0);
  });
});

describe("cellAt", () => {
  const layout = hexLayout(466, 5, 8, 96);

  it("finds the cell a tap on its centre belongs to", () => {
    for (let cell = 0; cell < layout.cellCount; cell++) {
      expect(cellAt(layout, layout.centersX[cell], layout.centersY[cell])).toBe(cell);
    }
  });

  it("still finds the cell from anywhere inside its hexagon", () => {
    const cell = 12;
    const cx = layout.centersX[cell];
    const cy = layout.centersY[cell];
    const r = layout.scale * 0.8;
    for (const [dx, dy] of [
      [0, -r],
      [0, r],
      [hexHalfWidth(r) * 0.9, 0],
      [-hexHalfWidth(r) * 0.9, 0],
    ]) {
      expect(cellAt(layout, cx + dx, cy + dy)).toBe(cell);
    }
  });

  it("reports a miss for a tap off the board", () => {
    expect(cellAt(layout, 5, 5)).toBe(-1);
    expect(cellAt(layout, 233, 5)).toBe(-1);
    expect(cellAt(layout, 233, 461)).toBe(-1);
  });

  it("splits the board between cells with no unclaimed gap in the middle", () => {
    // Every point on the line between two neighbouring centres belongs to one of
    // them: the lattice tiles, so a tap in the gap drawn between cells still
    // lands on a cell rather than being swallowed.
    const a = 12;
    const b = 13;
    for (let t = 0; t <= 10; t++) {
      const x = layout.centersX[a] + ((layout.centersX[b] - layout.centersX[a]) * t) / 10;
      const y = layout.centersY[a] + ((layout.centersY[b] - layout.centersY[a]) * t) / 10;
      expect([a, b]).toContain(cellAt(layout, x, y));
    }
  });
});
