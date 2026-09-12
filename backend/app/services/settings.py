from __future__ import annotations

import json

from app.contracts import FilterRules
from app.repositories.settings import OBSOLETE_KEYS, SettingsRepository, is_secret_key
from app.services.completed_directory import COMPLETED_DIR_MODE_KEY, COMPLETED_DIR_MODE_SINGLE

DEFAULT_CHECK_CRON = "0 */6 * * *"
DEFAULT_FILTER_RULES = FilterRules(min_size_gb=1, required_keywords=[], excluded_keywords=[])
DEFAULT_FILTER_RULES_JSON = DEFAULT_FILTER_RULES.model_dump_json()
DEFAULT_PUBLIC_SETTINGS = {
    "check_cron": DEFAULT_CHECK_CRON,
    "filter_rules": DEFAULT_FILTER_RULES_JSON,
    COMPLETED_DIR_MODE_KEY: COMPLETED_DIR_MODE_SINGLE,
}


class SettingsService:
    def __init__(self, settings: SettingsRepository) -> None:
        self.settings = settings

    def list_public(self) -> list[dict[str, object]]:
        items_by_key = {
            str(item["key"]): item
            for item in self.settings.list_all()
            if str(item["key"]) not in OBSOLETE_KEYS
        }
        for key, value in DEFAULT_PUBLIC_SETTINGS.items():
            items_by_key.setdefault(key, {"key": key, "value": value, "is_secret": 0})
        return [self._public_item(item) for item in items_by_key.values()]

    def update(self, items: list[tuple[str, str, bool]]) -> None:
        sanitized: list[tuple[str, str, bool]] = []
        for key, value, _client_secret_flag in items:
            if key in OBSOLETE_KEYS:
                continue
            secret = is_secret_key(key)
            if secret and not value:
                continue
            sanitized.append((key, value, secret))
        self.settings.upsert_many(sanitized)

    def filter_rules(self) -> FilterRules:
        raw = self.settings.get("filter_rules")
        if not raw:
            return DEFAULT_FILTER_RULES
        return FilterRules.model_validate(json.loads(raw))

    def p115_cookie(self) -> str:
        return self.settings.require("p115_cookie")

    def _public_item(self, item: dict[str, object]) -> dict[str, object]:
        key = str(item["key"])
        value = str(item["value"])
        is_secret = is_secret_key(key) or bool(item.get("is_secret", 0))
        public_value: str | None = None if is_secret else value
        if not public_value and not is_secret and key in DEFAULT_PUBLIC_SETTINGS:
            public_value = DEFAULT_PUBLIC_SETTINGS[key]
        return {
            **item,
            "value": public_value,
            "is_secret": is_secret,
            "configured": bool(value) if is_secret else False,
        }
