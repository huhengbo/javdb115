from __future__ import annotations

from typing import Any

SIZE_UNIT_STEP = 1024


def to_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    return int(value)


def to_optional_str(value: Any) -> str | None:
    return None if value in (None, "") else str(value)


def vip_label(value: Any) -> str | None:
    if value in (True, 1, "1", 2, "2"):
        return "VIP"
    if value in (False, 0, "0"):
        return "普通账号"
    return to_optional_str(value)


def vip_expires_at(vip: Any) -> str | None:
    if not isinstance(vip, dict):
        return None
    return to_optional_str(vip.get("expire_str"))


def space_label(result: Any, key: str) -> str | None:
    item = _space_item(result, key)
    if item is None:
        return None
    return to_optional_str(item.get("size_format"))


def space_used_label(result: Any) -> str | None:
    total = _space_size(result, "all_total")
    remaining = _space_size(result, "all_remain")
    if total is None or remaining is None:
        return None
    return _format_bytes(max(total - remaining, 0))


def _space_size(result: Any, key: str) -> float | None:
    item = _space_item(result, key)
    value = item.get("size") if item else None
    return float(value) if value is not None else None


def _space_item(result: Any, key: str) -> dict[str, Any] | None:
    summary = result.get("space_summury") if isinstance(result, dict) else None
    item = summary.get(key) if isinstance(summary, dict) else None
    return item if isinstance(item, dict) else None


def _format_bytes(size: float) -> str:
    units = ["B", "KB", "MB", "GB", "TB", "PB"]
    current = size
    unit = units[0]
    for next_unit in units[1:]:
        if current < SIZE_UNIT_STEP:
            break
        current = current / SIZE_UNIT_STEP
        unit = next_unit
    return f"{current:.2f}{unit}"
