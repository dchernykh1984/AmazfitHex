import { describe, it, expect } from "vitest";
import {
  BLUE,
  BORDER_MASKS,
  DEFAULT_SIZE,
  EDGE_BLUE_END,
  EDGE_BLUE_START,
  EDGE_RED_END,
  EDGE_RED_START,
  MAX_NEIGHBORS,
  MAX_SIZE,
  MIN_SIZE,
  RED,
  borderMask,
  borderSlot,
  clampSize,
  opponent,
  topologyFor,
} from "../lib/hex/board.js";

// The neighbours of a cell, as {column, row} pairs, read back out of the flat
// adjacency table.
function neighborsOf(topology, column, row) {
  const cell = row * topology.size + column;
  const base = cell * MAX_NEIGHBORS;
  const list = [];
  for (let i = 0; i < topology.degree[cell]; i++) {
    const next = topology.neighbors[base + i];
    list.push({ column: next % topology.size, row: Math.floor(next / topology.size) });
  }
  return list.sort((a, b) => a.row - b.row || a.column - b.column);
}

describe("opponent", () => {
  it("swaps the two colours", () => {
    expect(opponent(RED)).toBe(BLUE);
    expect(opponent(BLUE)).toBe(RED);
  });
});

describe("clampSize", () => {
  it("keeps a size that is already in range", () => {
    expect(clampSize(5)).toBe(5);
    expect(clampSize(MIN_SIZE)).toBe(MIN_SIZE);
    expect(clampSize(MAX_SIZE)).toBe(MAX_SIZE);
  });

  it("pulls a size that is out of range back to the nearest end", () => {
    expect(clampSize(1)).toBe(MIN_SIZE);
    expect(clampSize(99)).toBe(MAX_SIZE);
  });

  it("falls back to the default for anything unusable", () => {
    expect(clampSize(undefined)).toBe(DEFAULT_SIZE);
    expect(clampSize("nonsense")).toBe(DEFAULT_SIZE);
    expect(clampSize(NaN)).toBe(DEFAULT_SIZE);
  });

  it("truncates a fractional size", () => {
    expect(clampSize(7.9)).toBe(7);
  });
});

describe("borderSlot", () => {
  it("gives each player's two edges their own slot", () => {
    expect(borderSlot(RED, 0)).toBe(0);
    expect(borderSlot(RED, 1)).toBe(1);
    expect(borderSlot(BLUE, 0)).toBe(2);
    expect(borderSlot(BLUE, 1)).toBe(3);
  });

  it("names the matching edge bit", () => {
    expect(borderMask(RED, 0)).toBe(EDGE_RED_START);
    expect(borderMask(RED, 1)).toBe(EDGE_RED_END);
    expect(borderMask(BLUE, 0)).toBe(EDGE_BLUE_START);
    expect(borderMask(BLUE, 1)).toBe(EDGE_BLUE_END);
    expect(BORDER_MASKS.length).toBe(4);
  });
});

describe("topologyFor", () => {
  it("numbers the cells row by row", () => {
    const topology = topologyFor(5);
    expect(topology.size).toBe(5);
    expect(topology.cellCount).toBe(25);
  });

  it("caches one topology per size", () => {
    expect(topologyFor(5)).toBe(topologyFor(5));
    expect(topologyFor(5)).not.toBe(topologyFor(7));
  });

  it("clamps the size before building", () => {
    expect(topologyFor(1)).toBe(topologyFor(MIN_SIZE));
  });

  it("gives an inner cell its six hex neighbours", () => {
    const topology = topologyFor(5);
    expect(neighborsOf(topology, 2, 2)).toEqual([
      { column: 2, row: 1 },
      { column: 3, row: 1 },
      { column: 1, row: 2 },
      { column: 3, row: 2 },
      { column: 1, row: 3 },
      { column: 2, row: 3 },
    ]);
  });

  it("clips the neighbours of an edge cell to the board", () => {
    const topology = topologyFor(5);
    expect(neighborsOf(topology, 0, 0)).toEqual([
      { column: 1, row: 0 },
      { column: 0, row: 1 },
    ]);
    expect(neighborsOf(topology, 4, 4)).toEqual([
      { column: 4, row: 3 },
      { column: 3, row: 4 },
    ]);
  });

  it("gives the obtuse corners three neighbours and the acute ones two", () => {
    const topology = topologyFor(5);
    expect(neighborsOf(topology, 4, 0).length).toBe(3);
    expect(neighborsOf(topology, 0, 4).length).toBe(3);
    expect(neighborsOf(topology, 0, 0).length).toBe(2);
    expect(neighborsOf(topology, 4, 4).length).toBe(2);
  });

  it("keeps adjacency symmetric", () => {
    const topology = topologyFor(7);
    for (let cell = 0; cell < topology.cellCount; cell++) {
      for (let i = 0; i < topology.degree[cell]; i++) {
        const next = topology.neighbors[cell * MAX_NEIGHBORS + i];
        const back = [];
        for (let j = 0; j < topology.degree[next]; j++) {
          back.push(topology.neighbors[next * MAX_NEIGHBORS + j]);
        }
        expect(back, `${next} should point back at ${cell}`).toContain(cell);
      }
    }
  });

  it("marks the first and last row for red and the first and last column for blue", () => {
    const topology = topologyFor(5);
    expect(topology.edges[0 * 5 + 2] & EDGE_RED_START).toBeTruthy();
    expect(topology.edges[4 * 5 + 2] & EDGE_RED_END).toBeTruthy();
    expect(topology.edges[2 * 5 + 0] & EDGE_BLUE_START).toBeTruthy();
    expect(topology.edges[2 * 5 + 4] & EDGE_BLUE_END).toBeTruthy();
    expect(topology.edges[2 * 5 + 2]).toBe(0);
  });

  it("gives every corner one edge of each player", () => {
    const topology = topologyFor(5);
    expect(topology.edges[0]).toBe(EDGE_RED_START | EDGE_BLUE_START);
    expect(topology.edges[4]).toBe(EDGE_RED_START | EDGE_BLUE_END);
    expect(topology.edges[20]).toBe(EDGE_RED_END | EDGE_BLUE_START);
    expect(topology.edges[24]).toBe(EDGE_RED_END | EDGE_BLUE_END);
  });

  it("lists every cell of each edge exactly once", () => {
    const topology = topologyFor(5);
    expect(topology.borders[borderSlot(RED, 0)]).toEqual([0, 1, 2, 3, 4]);
    expect(topology.borders[borderSlot(RED, 1)]).toEqual([20, 21, 22, 23, 24]);
    expect(topology.borders[borderSlot(BLUE, 0)]).toEqual([0, 5, 10, 15, 20]);
    expect(topology.borders[borderSlot(BLUE, 1)]).toEqual([4, 9, 14, 19, 24]);
  });

  it("rates the middle of the board as the most central cell", () => {
    const topology = topologyFor(5);
    expect(topology.centerBias[2 * 5 + 2]).toBe(0);
    // The acute corners are the farthest cells from the middle; the obtuse ones
    // sit half as far away.
    expect(topology.centerBias[0]).toBe(topology.centerBias[24]);
    expect(topology.centerBias[4]).toBe(topology.centerBias[20]);
    expect(topology.centerBias[0]).toBeGreaterThan(topology.centerBias[4]);
  });

  it("keeps the centre bias below the tie-break budget the search allows", () => {
    for (let size = MIN_SIZE; size <= MAX_SIZE; size++) {
      const topology = topologyFor(size);
      for (let cell = 0; cell < topology.cellCount; cell++) {
        expect(topology.centerBias[cell]).toBeLessThan(4 * size);
      }
    }
  });
});
