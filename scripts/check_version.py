from __future__ import annotations

import json
from pathlib import Path

import tomllib

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    expected = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    with (ROOT / "backend" / "pyproject.toml").open("rb") as stream:
        backend = tomllib.load(stream)["project"]["version"]
    frontend = json.loads((ROOT / "frontend" / "package.json").read_text(encoding="utf-8"))[
        "version"
    ]
    versions = {"VERSION": expected, "backend": str(backend), "frontend": str(frontend)}
    mismatched = {name: value for name, value in versions.items() if value != expected}
    if mismatched:
        details = ", ".join(f"{name}={value}" for name, value in versions.items())
        raise SystemExit(f"Version mismatch: {details}")
    print(f"Version consistent: {expected}")


if __name__ == "__main__":
    main()
