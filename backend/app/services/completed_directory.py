from __future__ import annotations

import re
from enum import StrEnum

from app.repositories.settings import SettingsRepository

COMPLETED_DIR_MODE_KEY = "p115_completed_dir_mode"
COMPLETED_DIR_MODE_SINGLE = "single"
COMPLETED_DIR_MODE_CATEGORY = "category"
COMPLETED_DIR_SINGLE_KEY = "p115_completed_dir_id"
UNCENSORED_DIR_KEY = "p115_completed_uncensored_dir_id"
CENSORED_DIR_KEY = "p115_completed_censored_dir_id"
FC2_DIR_KEY = "p115_completed_fc2_dir_id"
FC2_RE = re.compile(r"^FC2(?:[-_\s]?PPV)?[-_\s]?\d+", re.IGNORECASE)
UNCENSORED_NUMERIC_RE = re.compile(r"^\d{6}[-_]\d{2,}", re.IGNORECASE)
UNCENSORED_PREFIXES = (
    "1PON",
    "1PONDO",
    "CARIB",
    "CARIBBEANCOM",
    "HEYZO",
    "MURA",
    "PACOPACOMAMA",
    "TOKYO-HOT",
    "TOKYOHOT",
)


class CompletedDirectoryType(StrEnum):
    CENSORED = "censored"
    UNCENSORED = "uncensored"
    FC2 = "fc2"


CATEGORY_DIR_KEYS = {
    CompletedDirectoryType.CENSORED: CENSORED_DIR_KEY,
    CompletedDirectoryType.UNCENSORED: UNCENSORED_DIR_KEY,
    CompletedDirectoryType.FC2: FC2_DIR_KEY,
}


class CompletedDirectoryResolver:
    def __init__(self, settings: SettingsRepository) -> None:
        self.settings = settings

    def completed_root_id(self, code: str) -> str:
        mode = self.settings.get(COMPLETED_DIR_MODE_KEY) or COMPLETED_DIR_MODE_SINGLE
        if mode == COMPLETED_DIR_MODE_SINGLE:
            return self.settings.require(COMPLETED_DIR_SINGLE_KEY)
        if mode == COMPLETED_DIR_MODE_CATEGORY:
            return self.settings.require(CATEGORY_DIR_KEYS[completed_directory_type(code)])
        raise ValueError(f"Unsupported 115 completed directory mode: {mode}")


def completed_directory_type(code: str) -> CompletedDirectoryType:
    normalized = normalize_code(code)
    if FC2_RE.match(normalized):
        return CompletedDirectoryType.FC2
    if is_uncensored_code(normalized):
        return CompletedDirectoryType.UNCENSORED
    return CompletedDirectoryType.CENSORED


def normalize_code(code: str) -> str:
    return code.strip().replace("_", "-").upper()


def is_uncensored_code(code: str) -> bool:
    if UNCENSORED_NUMERIC_RE.match(code):
        return True
    return any(code.startswith(prefix) for prefix in UNCENSORED_PREFIXES)
