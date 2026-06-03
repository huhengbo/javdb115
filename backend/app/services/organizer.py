from __future__ import annotations

import re
from dataclasses import dataclass

from app.adapters.cloud115 import Cloud115Client
from app.adapters.cloud115_types import CloudDirectory, CloudItem
from app.services.emby_metadata import EmbyMetadataBuilder, EmbyMovieMetadata, MetadataAsset

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


@dataclass(frozen=True)
class OrganizeRequest:
    source_dir_id: str
    download_root_id: str
    completed_root_id: str
    code: str
    source_dir_name: str | None = None
    metadata: EmbyMovieMetadata | None = None


class CloudOrganizer:
    def __init__(self, cloud: Cloud115Client) -> None:
        self.cloud = cloud

    def organize(self, request: OrganizeRequest) -> CleanupPlan:
        self._validate_source_directory(request)
        existing_target = self._existing_target_directory(request.completed_root_id, request.code)
        if existing_target:
            target_dir_id, target_code = existing_target
            self._ensure_distinct_directories(request.source_dir_id, target_dir_id)
            existing_main = self._existing_main_video(target_dir_id, target_code)
            if existing_main:
                self._replace_metadata(target_dir_id, self._metadata(request.metadata, target_code))
                return self._clean_after_partial_move(
                    request.source_dir_id,
                    target_dir_id,
                    target_code,
                    existing_main,
                )
        items = self.cloud.list_items(request.source_dir_id)
        main_video = self._main_video(items)
        organized_code = self._organized_code(request.code, main_video.name)
        target_dir_id = self._target_directory_id(request.completed_root_id, organized_code)
        self._ensure_distinct_directories(request.source_dir_id, target_dir_id)
        existing_main = self._existing_main_video(target_dir_id, organized_code)
        if existing_main:
            return self._clean_after_partial_move(
                request.source_dir_id,
                target_dir_id,
                organized_code,
                existing_main,
            )
        plan = self._plan(items, target_dir_id)
        extension = self._extension(plan.main_video.name)
        self.cloud.rename(plan.main_video.id, f"{organized_code}{extension}")
        self._rename_subtitles(items, plan.main_video.id, organized_code)
        self.cloud.move(plan.keep_ids, target_dir_id)
        self._replace_metadata(target_dir_id, self._metadata(request.metadata, organized_code))
        if plan.delete_ids:
            self.cloud.delete(plan.delete_ids)
        self._delete_source_directory(request.source_dir_id)
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
        subtitles = [item for item in items if self._is_subtitle_file(item)]
        keep_ids = [item.id for item in subtitles]
        delete_ids = [item.id for item in items if item.id not in keep_ids]
        self._rename_subtitle_items(subtitles, target_dir_name)
        if keep_ids:
            self.cloud.move(keep_ids, target_dir_id)
        if delete_ids:
            self.cloud.delete(delete_ids)
        self._delete_source_directory(source_dir_id)
        return CleanupPlan(main_video, target_dir_id, keep_ids, delete_ids, target_dir_name)

    def _ensure_distinct_directories(self, source_dir_id: str, target_dir_id: str) -> None:
        if source_dir_id == target_dir_id:
            raise ValueError("115 source folder and target folder are the same; refusing cleanup")

    def _validate_source_directory(self, request: OrganizeRequest) -> None:
        self._ensure_not_protected_directory(request)
        source = self._source_child_directory(request)
        self._ensure_source_name_matches(source.name, request)

    def _ensure_not_protected_directory(self, request: OrganizeRequest) -> None:
        protected_ids = {"0", request.download_root_id, request.completed_root_id}
        if request.source_dir_id in protected_ids:
            raise ValueError("115 source folder is protected; refusing cleanup")

    def _source_child_directory(self, request: OrganizeRequest) -> CloudDirectory:
        for directory in self.cloud.list_directories(request.download_root_id):
            if directory.id == request.source_dir_id:
                return directory
        raise ValueError("115 source folder is not under the configured download folder")

    def _ensure_source_name_matches(self, actual_name: str, request: OrganizeRequest) -> None:
        if actual_name.casefold() != request.code.casefold():
            raise ValueError("115 source folder name does not match the current task code")
        if request.source_dir_name and request.source_dir_name.casefold() != actual_name.casefold():
            raise ValueError("115 remote source path does not match the source folder")

    def _delete_source_directory(self, source_dir_id: str) -> None:
        self.cloud.delete([source_dir_id])

    def _plan(self, items: list[CloudItem], target_dir_id: str) -> CleanupPlan:
        main_video = self._main_video(items)
        keep_ids = [item.id for item in items if self._should_keep(item, main_video.id)]
        delete_ids = [item.id for item in items if item.id not in keep_ids]
        return CleanupPlan(main_video, target_dir_id, keep_ids, delete_ids)

    def _main_video(self, items: list[CloudItem]) -> CloudItem:
        videos = [item for item in items if self._is_video_file(item)]
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
            candidate.casefold(): candidate for candidate in self._target_code_candidates(code)
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
            if item.name.casefold() == expected_name.casefold() and self._is_video_file(item):
                return item
        return None

    def _should_keep(self, item: CloudItem, main_video_id: str) -> bool:
        if item.id == main_video_id:
            return True
        return self._is_subtitle_file(item)

    def _rename_subtitles(
        self,
        items: list[CloudItem],
        main_video_id: str,
        code: str,
    ) -> None:
        subtitles = [
            item for item in items if item.id != main_video_id and self._is_subtitle_file(item)
        ]
        self._rename_subtitle_items(subtitles, code)

    def _rename_subtitle_items(self, subtitles: list[CloudItem], code: str) -> None:
        used_names: set[str] = set()
        for index, subtitle in enumerate(subtitles, start=1):
            target_name = self._subtitle_name(subtitle, code, index, used_names)
            used_names.add(target_name.casefold())
            if subtitle.name.casefold() != target_name.casefold():
                self.cloud.rename(subtitle.id, target_name)

    def _subtitle_name(
        self,
        subtitle: CloudItem,
        code: str,
        index: int,
        used_names: set[str],
    ) -> str:
        extension = self._extension(subtitle.name)
        stem = f"{code}.{self._subtitle_label(subtitle.name, index)}"
        if index == 1 and not self._subtitle_label(subtitle.name, index):
            stem = code
        name = f"{stem}{extension}"
        return self._deduplicated_name(name, extension, used_names)

    def _subtitle_label(self, name: str, index: int) -> str:
        lowered = name.casefold()
        if any(token in lowered for token in ("zh", "chs", "cht", "cn", "中文", "字幕")):
            return "zh"
        return "" if index == 1 else str(index)

    def _deduplicated_name(
        self,
        name: str,
        extension: str,
        used_names: set[str],
    ) -> str:
        if name.casefold() not in used_names:
            return name
        stem = name.removesuffix(extension)
        index = 2
        while f"{stem}.{index}{extension}".casefold() in used_names:
            index += 1
        return f"{stem}.{index}{extension}"

    def _replace_metadata(
        self,
        target_dir_id: str,
        metadata: EmbyMovieMetadata | None,
    ) -> None:
        if metadata is None:
            return
        assets = EmbyMetadataBuilder().build_assets(metadata)
        self._delete_existing_assets(target_dir_id, assets)
        for asset in assets:
            self.cloud.upload_bytes(target_dir_id, asset.name, asset.content)

    def _delete_existing_assets(
        self,
        target_dir_id: str,
        assets: list[MetadataAsset],
    ) -> None:
        names = {asset.name.casefold() for asset in assets}
        delete_ids = [
            item.id
            for item in self.cloud.list_items(target_dir_id)
            if item.name.casefold() in names
        ]
        if delete_ids:
            self.cloud.delete(delete_ids)

    def _metadata(
        self,
        metadata: EmbyMovieMetadata | None,
        code: str,
    ) -> EmbyMovieMetadata | None:
        if metadata is None:
            return None
        return EmbyMovieMetadata(
            code=code,
            title=metadata.title,
            release_date=metadata.release_date,
            source_url=metadata.source_url,
            actors=metadata.actors,
            cover_url=metadata.cover_url,
            tags=metadata.tags,
        )

    def _is_video(self, name: str) -> bool:
        return self._extension(name) in VIDEO_EXTENSIONS

    def _is_video_file(self, item: CloudItem) -> bool:
        return not item.is_directory and self._is_video(item.name)

    def _is_subtitle(self, name: str) -> bool:
        return self._extension(name) in SUBTITLE_EXTENSIONS

    def _is_subtitle_file(self, item: CloudItem) -> bool:
        return not item.is_directory and self._is_subtitle(item.name)

    def _extension(self, name: str) -> str:
        match = re.search(r"(\.[A-Za-z0-9]+)$", name)
        return match.group(1).lower() if match else ""
