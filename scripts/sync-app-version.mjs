// Put the released version into app.json, where the watch and the store read it.
//
// There are two version numbers in a Zepp app and release-please owns neither of
// them. It bumps package.json; app.json carries `version.name`, which is what a
// person sees in the store and in Settings, and `version.code`, an integer the
// store insists must grow with every upload or it refuses the build.
//
// So the two are derived from package.json here, in one place, rather than in a
// shell one-liner inside a workflow: this runs the same way on a laptop as in
// CI, and it can be tested.
//
// The code is `major * 10000 + minor * 100 + patch`, which orders exactly like
// the semver it comes from as long as minor and patch stay under 100. That is a
// real limit, and the script refuses rather than silently shipping a code that
// sorts below the version already in the store.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_FILE = join(ROOT, "package.json");
const APP_FILE = join(ROOT, "app.json");

export function versionCode(name) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(name).trim());
  if (match === null) {
    throw new Error("not a plain semver version: " + name);
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (minor > 99 || patch > 99) {
    throw new Error(
      "version " + name + " cannot become a version code: minor and patch must stay under 100"
    );
  }
  return major * 10000 + minor * 100 + patch;
}

function read(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

// app.json is written back by hand rather than through JSON.stringify of the
// whole document: it is a file people edit, and reformatting it on every release
// would bury the one line that actually changed in a diff of the entire file.
function replaceVersion(text, name, code) {
  const withName = text.replace(/("name"\s*:\s*)"[^"]*"/, '$1"' + name + '"');
  const withCode = withName.replace(/("code"\s*:\s*)\d+/, "$1" + code);
  return withCode;
}

export function syncedAppJson(appText, releaseVersion) {
  return replaceVersion(appText, releaseVersion, versionCode(releaseVersion));
}

function main(argv) {
  const check = argv.includes("--check");
  const releaseVersion = read(PACKAGE_FILE).version;
  const app = read(APP_FILE);
  const current = app.app.version;
  const wanted = { name: releaseVersion, code: versionCode(releaseVersion) };

  if (current.name === wanted.name && current.code === wanted.code) {
    console.log("app version already " + wanted.name + " (code " + wanted.code + ")");
    return 0;
  }

  // The check is on the name alone, deliberately. release-please writes the name
  // into app.json when it opens a release PR but cannot compute the code, so on
  // that one commit the code is still the previous release's - and failing the
  // release PR's own CI over a number this script recomputes at build time would
  // block every release for nothing.
  if (check) {
    if (current.name === wanted.name) {
      console.log(
        "app version name " + wanted.name + " is in step; code becomes " + wanted.code + " at build"
      );
      return 0;
    }
    console.error(
      "app.json says " +
        current.name +
        " but package.json says " +
        wanted.name +
        ".\nRun `npm run version:sync` and commit the result."
    );
    return 1;
  }

  writeFileSync(APP_FILE, syncedAppJson(readFileSync(APP_FILE, "utf8"), releaseVersion));
  console.log(
    "app version " +
      current.name +
      " (code " +
      current.code +
      ") -> " +
      wanted.name +
      " (code " +
      wanted.code +
      ")"
  );
  return 0;
}

// Only when run as a script, so the helpers above can be imported by a test.
if (process.argv[1] && process.argv[1].endsWith("sync-app-version.mjs")) {
  process.exit(main(process.argv.slice(2)));
}
