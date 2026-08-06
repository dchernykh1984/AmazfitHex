import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { syncedAppJson, versionCode } from "../scripts/sync-app-version.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => JSON.parse(readFileSync(join(ROOT, file), "utf8"));

describe("versionCode", () => {
  it("packs a semver into one integer", () => {
    expect(versionCode("0.0.1")).toBe(1);
    expect(versionCode("0.3.1")).toBe(301);
    expect(versionCode("1.0.0")).toBe(10000);
    expect(versionCode("2.14.7")).toBe(21407);
  });

  // The store refuses an upload whose code is not above the last one, so the
  // ordering has to survive every bump, including the ones that carry.
  it("grows with every version bump, without exception", () => {
    const ordered = [
      "0.0.1",
      "0.0.99",
      "0.1.0",
      "0.1.1",
      "0.9.99",
      "0.10.0",
      "0.99.99",
      "1.0.0",
      "1.0.1",
      "2.0.0",
    ];
    for (let i = 1; i < ordered.length; i++) {
      expect(versionCode(ordered[i]), ordered[i] + " after " + ordered[i - 1]).toBeGreaterThan(
        versionCode(ordered[i - 1])
      );
    }
  });

  // Two digits each is all the packing has room for. Going quiet here would ship
  // a code that sorts below one already in the store, and the store would reject
  // the upload with nothing to explain it.
  it("refuses a version it cannot pack rather than wrapping round", () => {
    expect(() => versionCode("0.100.0")).toThrow(/under 100/);
    expect(() => versionCode("0.0.100")).toThrow(/under 100/);
    expect(versionCode("0.99.99")).toBe(9999);
  });

  it("refuses anything that is not a plain three-part version", () => {
    for (const bad of ["1.2", "1.2.3.4", "v1.2.3", "1.2.3-rc.1", "", "next"]) {
      expect(() => versionCode(bad), bad).toThrow();
    }
  });
});

describe("writing the version into app.json", () => {
  const APP = readFileSync(join(ROOT, "app.json"), "utf8");

  it("puts both numbers in", () => {
    const written = JSON.parse(syncedAppJson(APP, "1.2.3"));
    expect(written.app.version).toEqual({ name: "1.2.3", code: 10203 });
  });

  // The file is edited by hand and read in diffs, so a version bump has to show
  // up as the two lines it is - not as a reformat of the whole document.
  it("changes nothing else about the file", () => {
    const written = syncedAppJson(APP, "1.2.3");
    const before = APP.split("\n");
    const after = written.split("\n");

    expect(after.length).toBe(before.length);
    const changed = after.filter((line, i) => line !== before[i]);
    expect(changed.length).toBe(2);
    expect(changed.join(" ")).toContain("1.2.3");
  });

  it("leaves everything but the version untouched", () => {
    const before = JSON.parse(APP);
    const after = JSON.parse(syncedAppJson(APP, "9.9.9"));
    expect(after.app.appId).toBe(before.app.appId);
    expect(after.app.appName).toBe(before.app.appName);
    expect(after.targets).toEqual(before.targets);
    expect(after.permissions).toEqual(before.permissions);
  });

  it("is idempotent", () => {
    const once = syncedAppJson(APP, "1.2.3");
    expect(syncedAppJson(once, "1.2.3")).toBe(once);
  });
});

describe("the versions this repo actually ships", () => {
  // What the store and the watch show has to be the version that was released.
  // Only the name: release-please writes that into app.json when it opens a
  // release PR, and the code is recomputed from it at build time.
  it("says the same version in app.json as in package.json", () => {
    expect(read("app.json").app.version.name).toBe(read("package.json").version);
  });

  // Not the code, deliberately. release-please writes the name when it opens a
  // release PR and cannot compute the code, so on that one commit the code is
  // still the previous release's - and the build recomputes it before the bundle
  // is made. Asserting on it here would fail every release PR's own CI.
  it("has a code that at least parses as one", () => {
    const version = read("app.json").app.version;
    expect(Number.isInteger(version.code)).toBe(true);
    expect(version.code).toBeGreaterThan(0);
    expect(versionCode(version.name)).toBeGreaterThanOrEqual(version.code);
  });

  it("still has the registered store identity", () => {
    const app = read("app.json").app;
    expect(app.appId).toBe(1122457);
    expect(app.appName).toBe("Hex Duel");
  });
});
