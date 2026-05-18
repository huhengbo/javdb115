from __future__ import annotations

import re
from dataclasses import dataclass

from app.adapters.cloud115 import Cloud115Client
from app.adapters.cloud115_types import CloudItem

VIDEO_EXTENSIONS = {".mp4", ".mkv", ".avi", ".mov", ".wmv", ".m4v"}
SUBTITLE_EXTENSIONS = {".srt", ".ass", ".ssa", ".vtt"}
AD_KEYWORDS = ["广告", "最新地址", "防走失", "微信", "telegram", "博彩", "http", "www."]
PRESERVED_CODE_SUFFIXES = ("UC", "U", "C")


@dataclass(frozen=True)
class CleanupPlan:
    main_video: CloudItem
    target_dir_id: str
    keep_ids: list[str]
    delete_ids: list[str]
    target_dir_name: str = ""


class CloudOrganizer:
    def __init__(self, cloud: Cloud115Client) -> None:
        self.cloud = cloud

    def organize(self, source_dir_id: str, completed_root_id: str, code: str) -> CleanupPlan:
        existing_target = self._existing_target_directory(completed_root_id, code)
        if existing_target:
            target_dir_id, target_code = existing_target
            self._ensure_distinct_directories(source_dir_id, target_dir_id)
            existing_main = self._existing_main_video(target_dir_id, target_code)
            if existing_main:
                return self._clean_after_partial_move(
                    source_dir_id,
                    target_dir_id,
                    target_code,
                    existing_main,
                )
        items = self.cloud.list_items(source_dir_id)
        main_video = self._main_video(items)
        organized_code = self._organized_code(code, main_video.name)
        target_dir_id = self._target_directory_id(completed_root_id, organized_code)
        self._ensure_distinct_directories(source_dir_id, target_dir_id)
        existing_main = self._existing_main_video(target_dir_id, organized_code)
        if existing_main:
            return self._clean_after_partial_move(
                source_dir_id,
                target_dir_id,
                organized_code,
                existing_main,
            )
        plan = self._plan(items, target_dir_id)
        extension = self._extension(plan.main_video.name)
        self.cloud.rename(plan.main_video.id, f"{organized_code}{extension}")
        self.cloud.move(plan.keep_ids, target_dir_id)
        if plan.delete_ids:
            self.cloud.delete(plan.delete_ids)
        self._delete_source_directory(source_dir_id)
        return CleanupPlan(
            plan.main_video,
            plan.target_dir_id,
            plan.keep_ids,
            plan.delete_ids,
            organized_code,
        )

    def _clean_after_partial_move(
        self,
        source_dir_id: str,
        target_dir_id: str,
        target_dir_name: str,
        main_video: CloudItem,
    ) -> CleanupPlan:
        items = self.cloud.list_items(source_dir_id)
        keep_ids = [item.id for item in items if self._is_subtitle(item.name)]
        delete_ids = [item.id for item in items if item.id not in keep_ids]
        if keep_ids:
            self.cloud.move(keep_ids, target_dir_id)
        if delete_ids:
            self.cloud.delete(delete_ids)
        self._delete_source_directory(source_dir_id)
        return CleanupPlan(main_video, target_dir_id, keep_ids, delete_ids, target_dir_name)

    def _ensure_distinct_directories(self, source_dir_id: str, target_dir_id: str) -> None:
        if source_dir_id == target_dir_id:
            raise ValueError("115 source folder and target folder are the same; refusing cleanup")

    def _delete_source_directory(self, source_dir_id: str) -> None:
        self.cloud.delete([source_dir_id])

    def _plan(self, items: list[CloudItem], target_dir_id: str) -> CleanupPlan:
        main_video = self._main_video(items)
        keep_ids = [item.id for item in items if self._should_keep(item, main_video.id)]
        delete_ids = [item.id for item in items if item.id not in keep_ids]
        return CleanupPlan(main_video, target_dir_id, keep_ids, delete_ids)

    def _main_video(self, items: list[CloudItem]) -> CloudItem:
        videos = [item for item in items if self._is_video(item.name)]
        if not videos:
            raise ValueError("No video file found in 115 completed folder")
        return max(videos, key=lambda item: item.size_bytes or 0)

    def _organized_code(self, code: str, filename: str) -> str:
        if self._has_preserved_suffix(code):
            return code
        match = re.search(self._suffix_pattern(code), filename, re.IGNORECASE)
        if not match:
            return code
        return f"{code}-{match.group('suffix').upper()}"

    def _has_preserved_suffix(self, code: str) -> bool:
        return any(code.upper().endswith(f"-{suffix}") for suffix in PRESERVED_CODE_SUFFIXES)

    def _suffix_pattern(self, code: str) -> str:
        suffixes = "|".join(PRESERVED_CODE_SUFFIXES)
        return rf"(?<![A-Za-z0-9]){re.escape(code)}-(?P<suffix>{suffixes})(?=$|[^A-Za-z0-9])"

    def _existing_target_directory(
        self,
        completed_root_id: str,
        code: str,
    ) -> tuple[str, str] | None:
        candidates = {
            candidate.casefold(): candidate
            for candidate in self._target_code_candidates(code)
        }
        for directory in self.cloud.list_directories(completed_root_id):
            target_code = candidates.get(directory.name.casefold())
            if target_code:
                return directory.id, target_code
        return None

    def _target_code_candidates(self, code: str) -> list[str]:
        if self._has_preserved_suffix(code):
            return [code]
        return [code, *(f"{code}-{suffix}" for suffix in PRESERVED_CODE_SUFFIXES)]

    def _target_directory_id(self, completed_root_id: str, code: str) -> str:
        for directory in self.cloud.list_directories(completed_root_id):
            if directory.name.casefold() == code.casefold():
                return directory.id
        return self.cloud.create_directory(completed_root_id, code)

    def _existing_main_video(self, target_dir_id: str, code: str) -> CloudItem | None:
        for item in self.cloud.list_items(target_dir_id):
            expected_name = f"{code}{self._extension(item.name)}"
            if item.name.casefold() == expected_name.casefold() and self._is_video(item.name):
                return item
        return None

    def _should_keep(self, item: CloudItem, main_video_id: str) -> bool:
        if item.id == main_video_id:
            return True
        return self._is_subtitle(item.name)

    def _is_video(self, name: str) -> bool:
        return self._extension(name) in VIDEO_EXTENSIONS

    def _is_subtitle(self, name: str) -> bool:
        return self._extension(name) in SUBTITLE_EXTENSIONS

    def _extension(self, name: str) -> str:
        match = re.search(r"(\.[A-Za-z0-9]+)$", name)
        return match.group(1).lower() if match else ""
