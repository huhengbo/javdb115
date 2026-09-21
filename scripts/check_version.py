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
    with (ROOT / "backend" / "uv.lock").open("rb") as stream:
        backend_lock = tomllib.load(stream)
    versions["backend lock"] = next(
        str(package["version"])
        for package in backend_lock["package"]
        if package["name"] == "javdb115-backend"
    )
    frontend_lock = json.loads(
        (ROOT / "frontend" / "package-lock.json").read_text(encoding="utf-8")
    )
    versions["frontend lock"] = str(frontend_lock["version"])
    versions["frontend lock package"] = str(frontend_lock["packages"][""]["version"])
    mismatched = {name: value for name, value in versions.items() if value != expected}
    if mismatched:
        details = ", ".join(f"{name}={value}" for name, value in versions.items())
        raise SystemExit(f"Version mismatch: {details}")
    print(f"Version consistent: {expected}")


if __name__ == "__main__":
    main()
