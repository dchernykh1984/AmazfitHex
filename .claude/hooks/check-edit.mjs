#!/usr/bin/env node
// Runs after the agent edits a file.
//
// Two of this repository's gates are cheap to satisfy the moment a file is
// touched and tedious to chase down at commit time, so they are checked here:
//
//   * Prettier owns formatting, so a file it owns is formatted straight away
//     rather than left for `npm run format` to catch later.
//   * Source and config must stay ASCII (a pre-commit hook enforces it, and CI
//     fails on it). Translations under i18n/ are the deliberate exception.
//
// The formatting is silent. Non-ASCII is reported back so it gets fixed while
// the change is still in hand.

import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const PRETTIER_OWNS = /\.(m?js|json|md|ya?ml)$/;
const ASCII_REQUIRED = /\.(m?js|json|md|ya?ml)$/;
const ASCII_EXEMPT = [/(^|\/)i18n\//, /package-lock\.json$/, /CHANGELOG\.md$/];

function readHookInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

const input = readHookInput();
const filePath = input && input.tool_input && input.tool_input.file_path;
if (!filePath) {
  process.exit(0);
}

const root = process.cwd();
const full = resolve(root, filePath);
const posix = relative(root, full).split("\\").join("/");

// Only files inside the project, and only the kinds the gates cover.
if (posix.startsWith("..") || !PRETTIER_OWNS.test(posix)) {
  process.exit(0);
}

if (posix !== "app.json") {
  try {
    execFileSync("npx", ["prettier", "--write", posix], { stdio: "ignore", shell: true });
  } catch {
    // A file mid-edit may not parse yet. `npm run format` and CI will say so.
  }
}

if (ASCII_REQUIRED.test(posix) && !ASCII_EXEMPT.some((pattern) => pattern.test(posix))) {
  let text = "";
  try {
    text = readFileSync(full, "utf8");
  } catch {
    process.exit(0);
  }
  const lines = text.split(/\r?\n/);
  const offenders = [];
  for (let i = 0; i < lines.length; i++) {
    // eslint-disable-next-line no-control-regex
    const match = lines[i].match(/[^\x00-\x7f]/);
    if (match) {
      offenders.push(`  line ${i + 1}: ${JSON.stringify(match[0])}`);
    }
    if (offenders.length >= 5) {
      break;
    }
  }
  if (offenders.length > 0) {
    process.stderr.write(
      `${posix} contains non-ASCII characters, which the pre-commit guard and CI both reject:\n` +
        `${offenders.join("\n")}\n` +
        `Replace them with ASCII. Only files under an i18n/ path are allowed to hold them.\n`
    );
    process.exit(2);
  }
}

process.exit(0);
