#!/usr/bin/env python3
"""Report non-ASCII bytes in files edited through Codex apply_patch."""

from __future__ import annotations

import json
import re
import sys
import subprocess
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
PATCH_PATH = re.compile(r"^\*\*\* (?:Add File|Update File|Move to): ([^\r\n]+)\r?$", re.MULTILINE)


def edited_paths(payload: dict[str, Any], root: Path) -> list[Path]:
    """Resolve patch and legacy edit paths within this repository."""
    tool_input = payload.get("tool_input") or {}
    if not isinstance(tool_input, dict):
        return []
    raw_paths = []
    raw_path = tool_input.get("file_path")
    if isinstance(raw_path, str):
        raw_paths.append(raw_path)
    command = tool_input.get("command")
    if isinstance(command, str):
        raw_paths.extend(PATCH_PATH.findall(command))
    cwd = Path(payload.get("cwd") or root).resolve()
    paths = []
    for name in raw_paths:
        path = (cwd / name).resolve()
        if path.is_relative_to(root) and path.is_file() and path not in paths:
            paths.append(path)
    return paths


def violations(paths: list[Path], root: Path, checks: dict[str, str]) -> list[str]:
    """Apply the same file and exemption patterns as the pre-commit ASCII gate."""
    problems = []
    for path in paths:
        relative = path.relative_to(root).as_posix()
        if not re.search(checks["files"], relative):
            continue
        if re.search(checks["exclude"], relative):
            continue
        if any(byte > 127 for byte in path.read_bytes()):
            problems.append(relative)
    return problems


def format_files(paths: list[Path], root: Path, checks: dict[str, str]) -> int:
    """Use installed Prettier without a shell or package download."""
    mode = checks.get("format_mode", "off")
    prettier = root / "node_modules/prettier/bin/prettier.cjs"
    if mode == "off" or not prettier.is_file():
        return 0
    selected = [
        str(path) for path in paths
        if re.search(r"\.(m?js|cjs|json|md|ya?ml)$", path.name)
        and not re.search(checks.get("format_exclude", r"$^"), path.relative_to(root).as_posix())
    ]
    if not selected:
        return 0
    try:
        result = subprocess.run(
            ["node", str(prettier), "--" + mode, *selected],
            cwd=root, capture_output=True, text=True, check=False,
        )
    except OSError:
        return 0
    if result.returncode:
        if mode == "write":
            return 0
        print(result.stderr or result.stdout, file=sys.stderr)
        return 2
    return 0


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        return 0
    if not isinstance(payload, dict):
        return 0
    checks = json.loads((ROOT / ".codex/hooks/checks.json").read_text())
    paths = edited_paths(payload, ROOT)
    problems = violations(paths, ROOT, checks)
    if not problems:
        return format_files(paths, ROOT, checks)
    print(
        "Non-ASCII bytes in " + ", ".join(problems) + ". Fix before committing.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
