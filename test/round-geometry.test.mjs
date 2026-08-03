import { describe, it, expect } from "vitest";
import { safeHalfWidth, safeLineWidth, centeredBox } from "../lib/round-geometry.js";

describe("safeHalfWidth", () => {
  it("is the full radius on the centre line", () => {
    expect(safeHalfWidth(100, 0)).toBe(100);
  });

  it("follows the circle", () => {
    expect(safeHalfWidth(100, 60)).toBeCloseTo(80);
    expect(safeHalfWidth(100, 80)).toBeCloseTo(60);
  });

  it("is zero at and past the edge", () => {
    expect(safeHalfWidth(100, 100)).toBe(0);
    expect(safeHalfWidth(100, 140)).toBe(0);
  });

  it("is symmetric above and below the centre line", () => {
    expect(safeHalfWidth(100, -60)).toBe(safeHalfWidth(100, 60));
  });
});

describe("safeLineWidth", () => {
  it("is the full width less the padding across the middle", () => {
    expect(safeLineWidth(466, 233, 2, 8)).toBeCloseTo(466 - 16, 0);
  });

  it("narrows towards the top and the bottom", () => {
    const middle = safeLineWidth(466, 233, 40, 8);
    const high = safeLineWidth(466, 60, 40, 8);
    const low = safeLineWidth(466, 406, 40, 8);
    expect(high).toBeLessThan(middle);
    expect(low).toBeLessThan(middle);
    expect(high).toBeCloseTo(low, 0);
  });

  it("binds on the taller end of the line, so no corner escapes", () => {
    const tall = safeLineWidth(466, 80, 60, 8);
    const thin = safeLineWidth(466, 80, 2, 8);
    expect(tall).toBeLessThan(thin);
  });

  it("never goes negative", () => {
    expect(safeLineWidth(466, 2, 40, 8)).toBe(0);
    expect(safeLineWidth(466, 233, 2, 400)).toBe(0);
  });
});

describe("centeredBox", () => {
  it("centres the box horizontally", () => {
    const box = centeredBox(466, 200, 40, 200, 8);
    expect(box.w).toBe(200);
    expect(box.x).toBe(Math.round((466 - 200) / 2));
    expect(box.y).toBe(200);
    expect(box.h).toBe(40);
  });

  it("clamps to the chord rather than the requested width near the bezel", () => {
    const box = centeredBox(466, 20, 40, 400, 8);
    expect(box.w).toBeLessThan(400);
    expect(box.w).toBeGreaterThan(0);
  });

  it("keeps both edges inside the circle", () => {
    const radius = 233;
    for (let top = 20; top < 400; top += 10) {
      const box = centeredBox(466, top, 44, 400, 8);
      const corners = [
        [box.x, box.y],
        [box.x + box.w, box.y],
        [box.x, box.y + box.h],
        [box.x + box.w, box.y + box.h],
      ];
      for (const [x, y] of corners) {
        const dx = x - radius;
        const dy = y - radius;
        expect(Math.sqrt(dx * dx + dy * dy)).toBeLessThanOrEqual(radius);
      }
    }
  });
});
