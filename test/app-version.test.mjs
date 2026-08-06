import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
  //
  // The target is a major above whatever app.json currently holds rather than a
  // literal: a literal is a version this project eventually releases, and on the
  // release PR that reaches it app.json already says it, so only the code line
  // would move and this would fail over nothing.
  it("changes nothing else about the file", () => {
    const major = Number(JSON.parse(APP).app.version.name.split(".")[0]);
    const bumped = major + 1 + ".2.3";
    const written = syncedAppJson(APP, bumped);
    const before = APP.split("\n");
    const after = written.split("\n");

    expect(after.length).toBe(before.length);
    const changed = after.filter((line, i) => line !== before[i]);
    expect(changed.length).toBe(2);
    expect(changed.join(" ")).toContain(bumped);
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

// What CI actually runs is `npm run version:check`, and all it reports is an
// exit code. Importing the script cannot see that: the check, the exit codes and
// the guard that decides whether the script does anything at all only exist when
// it runs as a process, so these run it as one.
describe("running the script", () => {
  const SCRIPT = join(ROOT, "scripts", "sync-app-version.mjs");

  const made = [];
  afterEach(() => {
    while (made.length > 0) {
      rmSync(made.pop(), { recursive: true, force: true });
    }
  });

  // The script finds its two files relative to itself, so a copy of it beside a
  // package.json and an app.json is a whole miniature checkout to run against.
  function checkout(appVersion, releaseVersion) {
    const dir = mkdtempSync(join(tmpdir(), "app-version-"));
    made.push(dir);
    mkdirSync(join(dir, "scripts"));
    copyFileSync(SCRIPT, join(dir, "scripts", "sync-app-version.mjs"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ version: releaseVersion }, null, 2) + "\n"
    );
    writeFileSync(
      join(dir, "app.json"),
      JSON.stringify({ app: { version: appVersion } }, null, 2) + "\n"
    );
    return dir;
  }

  function run(dir, args) {
    try {
      // Run it from inside the throwaway checkout. Without a cwd the child
      // inherits vitest's, which is this repository - and a script that ever
      // resolved its files from the working directory would edit the real
      // app.json.
      execFileSync(process.execPath, [join(dir, "scripts", "sync-app-version.mjs"), ...args], {
        cwd: dir,
        stdio: "pipe",
      });
      return 0;
    } catch (error) {
      return error.status;
    }
  }

  const versionIn = (dir) => JSON.parse(readFileSync(join(dir, "app.json"), "utf8")).app.version;

  it("fails the check when app.json's name is behind the release", () => {
    expect(run(checkout({ code: 200, name: "0.2.0" }, "0.2.1"), ["--check"])).toBe(1);
  });

  // The state every release passes through: release-please has bumped
  // package.json and written the name into app.json but cannot compute the code,
  // so the code is still the previous release's. Failing here would fail the
  // release PR's own CI and block every release.
  it("passes the check on a release PR, where the code is one release behind", () => {
    expect(run(checkout({ code: 200, name: "0.2.1" }, "0.2.1"), ["--check"])).toBe(0);
  });

  it("does not touch app.json when it is only checking", () => {
    const dir = checkout({ code: 200, name: "0.2.0" }, "0.2.1");
    const before = readFileSync(join(dir, "app.json"), "utf8");
    run(dir, ["--check"]);
    expect(readFileSync(join(dir, "app.json"), "utf8")).toBe(before);
  });

  it("writes both numbers when run without --check", () => {
    const dir = checkout({ code: 200, name: "0.2.1" }, "0.2.1");
    expect(run(dir, [])).toBe(0);
    expect(versionIn(dir)).toEqual({ code: 201, name: "0.2.1" });
  });

  it("exits non-zero on a version it cannot pack, rather than shipping a low code", () => {
    const dir = checkout({ code: 200, name: "0.2.0" }, "0.100.0");
    expect(run(dir, [])).not.toBe(0);
    expect(versionIn(dir)).toEqual({ code: 200, name: "0.2.0" });
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
