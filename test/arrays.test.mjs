import { describe, it, expect, vi, afterEach } from "vitest";
import { createByteArray, createIntArray } from "../lib/hex/arrays.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createByteArray", () => {
  it("returns a zeroed buffer of the requested length", () => {
    const array = createByteArray(4);
    expect(array.length).toBe(4);
    expect(Array.from(array)).toEqual([0, 0, 0, 0]);
  });

  it("treats a missing or nonsensical length as empty", () => {
    expect(createByteArray(0).length).toBe(0);
    expect(createByteArray(-3).length).toBe(0);
    expect(createByteArray(undefined).length).toBe(0);
  });

  it("falls back to a plain array on a runtime without typed arrays", () => {
    vi.stubGlobal("Uint8Array", undefined);
    const array = createByteArray(3);
    expect(Array.isArray(array)).toBe(true);
    expect(array).toEqual([0, 0, 0]);
  });
});

describe("createIntArray", () => {
  it("returns a zeroed buffer of the requested length", () => {
    const array = createIntArray(3);
    expect(array.length).toBe(3);
    expect(Array.from(array)).toEqual([0, 0, 0]);
  });

  it("holds values wider than a byte", () => {
    const array = createIntArray(1);
    array[0] = 30000;
    expect(array[0]).toBe(30000);
  });

  it("falls back to a plain array on a runtime without typed arrays", () => {
    vi.stubGlobal("Int32Array", undefined);
    const array = createIntArray(2);
    expect(Array.isArray(array)).toBe(true);
    expect(array).toEqual([0, 0]);
  });
});
