"""Generate GitHub Release notes from one version section in CHANGELOG.md."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

REQUIRED_SECTIONS = (
    "### 📦 升级说明",
)


def extract_version_section(changelog: str, version: str) -> str:
    lines = changelog.splitlines()
    heading = re.compile(
        rf"^##\s+(?:\[)?v?{re.escape(version)}(?:\])?(?:\s+-\s+\d{{4}}-\d{{2}}-\d{{2}})?\s*$",
        re.IGNORECASE,
    )
    next_heading = re.compile(r"^##\s+")

    start = None
    for index, line in enumerate(lines):
        if heading.match(line.strip()):
            start = index + 1
            break

    if start is None:
        raise ValueError(f"CHANGELOG.md 中未找到版本章节: {version}")

    end = len(lines)
    for index in range(start, len(lines)):
        if next_heading.match(lines[index]):
            end = index
            break

    body = "\n".join(lines[start:end]).strip()
    if not body:
        raise ValueError(f"CHANGELOG.md 的版本章节为空: {version}")

    missing = [section for section in REQUIRED_SECTIONS if section not in body]
    if missing:
        raise ValueError(
            f"CHANGELOG.md 的 {version} 版本章节缺少发布必填内容: "
            + ", ".join(missing)
        )

    return body


def main() -> None:
    parser = argparse.ArgumentParser(description="从 CHANGELOG.md 生成中文 GitHub Release Notes")
    parser.add_argument("--version", required=True)
    parser.add_argument("--changelog", default="CHANGELOG.md")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    content = Path(args.changelog).read_text(encoding="utf-8")
    section = extract_version_section(content, args.version)
    notes = (
        f"> 本发布说明由 `CHANGELOG.md` 的 `{args.version}` 版本章节自动生成。\n\n"
        f"{section}\n"
    )
    Path(args.output).write_text(notes, encoding="utf-8")
    print(f"Release notes generated: {args.output}")


if __name__ == "__main__":
    main()
