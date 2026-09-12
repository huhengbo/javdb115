from __future__ import annotations


def query_string(**params: object) -> str:
    parts: list[str] = []
    for key, value in params.items():
        if value is None or value == "":
            continue
        parts.append(f"{key}={value}")
    return "&".join(parts)
