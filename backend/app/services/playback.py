from __future__ import annotations

import base64
import logging
import re
import secrets
from datetime import timedelta
from pathlib import Path
from sqlite3 import Connection
from typing import Any
from urllib.parse import parse_qs, quote, urlsplit
from uuid import uuid4

from app.adapters.cloud115 import Cloud115Client
from app.adapters.cloud115_types import CloudDownloadUrl, CloudItem, CloudOfflineTask
from app.errors import IntegrationError, NotFoundError, ValidationAppError
from app.repositories.playback import PlaybackRepository, PlaybackSession
from app.repositories.tasks import TasksRepository
from app.security import now_utc
from app.services.organizer import SUBTITLE_EXTENSIONS

PLAYBACK_ROOT_NAME = ".play"
PLAYBACK_TTL = timedelta(hours=6)
FAILED_SESSION_RETENTION = timedelta(minutes=10)
VIDEO_EXTENSIONS = {".mp4", ".mkv", ".avi", ".mov", ".wmv", ".m4v", ".ts", ".webm"}
JUNK_VIDEO_KEYWORDS = ("sample", "preview", "trailer", "广告", "宣传", "防走失")
MIN_VIDEO_BYTES = 50 * 1024 * 1024
MULTI_FILE_RATIO = 0.65
MAX_SCAN_DEPTH = 2
STREAM_PATH_PREFIX = "/api/playback/stream"
POLLING_STATUSES = {"offline_waiting", "locating"}
SESSION_DIR_NAME = re.compile(r"^[0-9a-f]{16}$")
BTIH_HEX = re.compile(r"^[0-9a-fA-F]{40}$")
BTIH_BASE32 = re.compile(r"^[A-Za-z2-7]{32}$")
LOGGER = logging.getLogger(__name__)


def magnet_info_hash(url: str) -> str | None:
    """提取磁力链接的 BTIH（统一为小写 40 位 hex，与 115 info_hash 一致）。"""
    parts = urlsplit(url.strip())
    if parts.scheme.lower() != "magnet":
        return None
    for value in parse_qs(parts.query).get("xt", []):
        if not value.lower().startswith("urn:btih:"):
            continue
        raw = value[len("urn:btih:"):]
        if BTIH_HEX.match(raw):
            return raw.lower()
        if BTIH_BASE32.match(raw):
            return base64.b32decode(raw.upper()).hex()
    return None


class PlaybackService:
    def __init__(
        self,
        cloud: Cloud115Client,
        download_root_id: str,
        connection: Connection,
    ) -> None:
        self.cloud = cloud
        self.download_root_id = download_root_id
        self.sessions = PlaybackRepository(connection)
        self.tasks = TasksRepository(connection)

    def create(self, url: str) -> dict[str, object]:
        value = url.strip()
        if not value:
            raise ValidationAppError("请输入磁力链接")
        magnet_hash = magnet_info_hash(value)
        if magnet_hash is not None:
            reusable = self._reusable_session(magnet_hash)
            if reusable is not None:
                return self._payload(reusable)
            library = self._library_session(magnet_hash)
            if library is not None:
                return self._payload(library)
            self._release_stale_sessions(magnet_hash)
        return self._payload(self._submit(value, magnet_hash))

    def get(self, session_id: str) -> dict[str, object]:
        session = self._active_session(session_id)
        if session.status in POLLING_STATUSES:
            session = self._advance(session)
        return self._payload(session)

    def select(self, session_id: str, file_id: str) -> dict[str, object]:
        session = self._active_session(session_id)
        if session.status not in {"select_required", "ready"}:
            raise ValidationAppError("播放文件尚未准备好，请稍候")
        selected = next((item for item in session.files if item.id == file_id), None)
        if selected is None:
            raise ValidationAppError("选择的视频文件不存在")
        self._mark_ready(session, selected)
        return self._payload(session)

    def stream_source(self, stream_token: str) -> tuple[CloudItem, CloudDownloadUrl]:
        session = self.sessions.get_by_token(stream_token)
        if session is None or session.expires_at <= now_utc():
            raise NotFoundError("播放地址不存在或已过期")
        selected = next(
            (item for item in session.files if item.id == session.selected_file_id),
            None,
        )
        if session.status != "ready" or selected is None:
            raise NotFoundError("播放文件尚未准备好")
        return selected, self.cloud.get_download_url(selected.id, selected.pick_code)

    def cleanup_due(self) -> None:
        now = now_utc()
        for session in self.sessions.list_due_for_cleanup(now, now - FAILED_SESSION_RETENTION):
            try:
                self.cleanup_session(session)
            except Exception as exc:
                # 单个会话清理失败只记录并留待下一轮重试，不能阻塞其它会话和播放请求
                LOGGER.warning("Playback session cleanup failed: %s", session.id, exc_info=True)
                session.cleanup_error = str(exc)[:500]
                self.sessions.update(session)

    def cleanup_orphan_directories(self) -> None:
        """清理没有会话记录的 .play 子目录（旧版本内存会话在重启后遗留）及其 115 离线记录。"""
        play_root_id = self._find_play_root_id()
        if play_root_id is None:
            return
        known_ids = self.sessions.list_ids()
        orphan_ids = {
            directory.id
            for directory in self.cloud.list_directories(play_root_id)
            if SESSION_DIR_NAME.match(directory.name) and directory.name not in known_ids
        }
        if not orphan_ids:
            return
        for task in self.cloud.list_offline_tasks():
            if task.download_root_id in orphan_ids:
                self.cloud.delete_offline_task(task.id)
        self.cloud.delete(sorted(orphan_ids))

    def cleanup_session(self, session: PlaybackSession) -> None:
        if session.owned:
            # 先删离线记录再删目录：避免相同磁力再次离线时被旧记录判定为重复任务
            if session.task_id:
                self.cloud.delete_offline_task(session.task_id)
            if session.session_dir_id:
                self._delete_session_directory(session)
        self.sessions.delete(session.id)

    def _reusable_session(self, magnet_hash: str) -> PlaybackSession | None:
        now = now_utc()
        for session in self.sessions.list_by_hash(magnet_hash):
            if session.expires_at > now and session.status != "failed":
                session.expires_at = now + PLAYBACK_TTL
                self.sessions.update(session)
                return session
        return None

    def _library_session(self, magnet_hash: str) -> PlaybackSession | None:
        task = self.tasks.find_latest_by_cloud_task_id(magnet_hash)
        if task is None or task["status"] == "failed":
            return None
        if task["status"] != "completed" or not task.get("cloud_file_id"):
            raise ValidationAppError("该磁力已提交正式离线下载，整理完成后可直接在线播放")
        # 正式任务已整理完成：直接读取整理目录中的视频，不再重复离线，也不会清理任何文件
        session = self._new_session(magnet_hash, owned=False)
        session.task_id = magnet_hash
        session.session_dir_id = str(task["cloud_file_id"])
        session.status = "locating"
        session.message = "该作品已下载，正在读取网盘文件"
        session.progress_percent = 88
        self.sessions.insert(session)
        return self._advance(session)

    def _release_stale_sessions(self, magnet_hash: str) -> None:
        for session in self.sessions.list_by_hash(magnet_hash):
            try:
                self.cleanup_session(session)
            except Exception as exc:
                raise IntegrationError("清理该磁力的旧播放临时任务失败，请稍后重试") from exc

    def _submit(self, url: str, magnet_hash: str | None) -> PlaybackSession:
        session = self._new_session(magnet_hash, owned=True)
        # 先落库再建目录：孤儿目录清理按目录名识别会话，避免误删刚创建的目录
        self.sessions.insert(session)
        try:
            session.play_root_id = self._play_root_id()
            session.session_dir_id = self.cloud.create_directory(session.play_root_id, session.id)
            self.sessions.update(session)
            session.task_id = self.cloud.add_offline_url(url, session.session_dir_id)
        except Exception:
            session.status = "failed"
            session.message = "提交 115 离线失败"
            self.sessions.update(session)
            raise
        if magnet_hash is None:
            session.magnet_hash = session.task_id.casefold()
        session.status = "offline_waiting"
        session.message = "已提交到 115，等待离线文件"
        self.sessions.update(session)
        return session

    def _new_session(self, magnet_hash: str | None, *, owned: bool) -> PlaybackSession:
        now = now_utc()
        return PlaybackSession(
            id=uuid4().hex[:16],
            stream_token=secrets.token_urlsafe(24),
            created_at=now,
            expires_at=now + PLAYBACK_TTL,
            magnet_hash=magnet_hash,
            owned=owned,
        )

    def _advance(self, session: PlaybackSession) -> PlaybackSession:
        if session.session_dir_id is None:
            return session
        videos = self._video_files(session.session_dir_id)
        if not videos:
            if session.owned:
                return self._poll_offline_task(session)
            return self._fail(session, "网盘整理目录中没有找到视频文件，可能已被移动或删除")

        candidates = self._playable_candidates(videos)
        if not candidates:
            return self._fail(session, "没有找到符合条件的主视频文件")
        if session.owned:
            self._cleanup_junk_files(session.session_dir_id, candidates)
        session.files = candidates
        selected = self._auto_select(candidates)
        if selected is None:
            session.status = "select_required"
            session.progress_percent = 92
            session.message = "发现多个主要视频，请选择要播放的文件"
            self.sessions.update(session)
            return session
        return self._mark_ready(session, selected)

    def _poll_offline_task(self, session: PlaybackSession) -> PlaybackSession:
        task_id = session.task_id or ""
        task = self.cloud.get_offline_tasks({task_id}).get(task_id.casefold())
        if task is None:
            session.status = "offline_waiting"
            session.message = "已提交到 115，等待离线任务开始"
        elif task.download_root_id and task.download_root_id != session.session_dir_id:
            return self._handle_foreign_task(session, task)
        elif task.status == "failed":
            return self._fail(session, task.message or "115 离线任务失败")
        elif task.status == "completed":
            return self._fail(session, "115 离线已完成，但没有找到可播放的视频文件")
        else:
            session.status = "offline_waiting"
            progress = task.progress_percent
            if progress is not None:
                session.progress_percent = max(8, min(85, progress))
            session.message = (
                f"115 离线中 · {progress}%" if progress is not None else "115 离线中"
            )
        self.sessions.update(session)
        return session

    def _handle_foreign_task(
        self,
        session: PlaybackSession,
        task: CloudOfflineTask,
    ) -> PlaybackSession:
        # 115 对重复磁力返回已存在的任务，文件会落在旧任务的目录里而不是本会话目录
        owner_dir_id = str(task.download_root_id)
        owner = self.sessions.find_by_session_dir(owner_dir_id)
        session.task_id = None  # 该离线记录不属于本会话，清理时不能删除
        if owner is None and self._is_play_directory(owner_dir_id):
            # 无会话记录的 .play 目录是旧版本遗留：删除旧记录和目录后重新提交到本会话目录
            self.cloud.delete_offline_task(task.id)
            self.cloud.delete([owner_dir_id])
            return self._resubmit(session, task.id)
        if owner is not None and (owner.status == "failed" or owner.expires_at <= now_utc()):
            self.cleanup_session(owner)
            return self._resubmit(session, task.id)
        if owner is not None:
            # 同一磁力已有播放会话（非磁力地址无法提前按 hash 复用），转到该会话继续
            self._fail(session, "该磁力已有播放任务，已切换到原任务")
            return owner
        return self._fail(
            session,
            "115 中已存在该磁力的离线任务（不在播放临时目录），请先在 115 离线列表删除后重试",
        )

    def _resubmit(self, session: PlaybackSession, magnet_hash: str) -> PlaybackSession:
        url = f"magnet:?xt=urn:btih:{magnet_hash}"
        session.task_id = self.cloud.add_offline_url(url, str(session.session_dir_id))
        session.status = "offline_waiting"
        session.message = "已重新提交到 115，等待离线文件"
        self.sessions.update(session)
        return session

    def _mark_ready(self, session: PlaybackSession, item: CloudItem) -> PlaybackSession:
        session.selected_file_id = item.id
        session.status = "ready"
        session.progress_percent = 100
        session.message = "播放地址已准备完成"
        self.sessions.update(session)
        return session

    def _fail(self, session: PlaybackSession, message: str) -> PlaybackSession:
        session.status = "failed"
        session.message = message
        self.sessions.update(session)
        return session

    def _cleanup_junk_files(self, directory_id: str, keep: list[CloudItem]) -> None:
        # 只删 sample、广告、说明等无用文件；所有主视频（如 CD1/CD2 分集）和字幕都保留
        keep_ids = {item.id for item in keep}
        try:
            self._delete_junk_files(directory_id, keep_ids)
        except Exception:
            LOGGER.warning("Playback junk cleanup failed: %s", directory_id, exc_info=True)

    def _delete_junk_files(self, directory_id: str, keep_ids: set[str], depth: int = 0) -> None:
        delete_ids: list[str] = []
        child_directories: list[str] = []
        for item in self.cloud.list_items(directory_id):
            if item.is_directory:
                if depth < MAX_SCAN_DEPTH:
                    child_directories.append(item.id)
                continue
            extension = Path(item.name).suffix.lower()
            if item.id in keep_ids or extension in SUBTITLE_EXTENSIONS:
                continue
            delete_ids.append(item.id)
        if delete_ids:
            self.cloud.delete(delete_ids)
        for child_id in child_directories:
            self._delete_junk_files(child_id, keep_ids, depth + 1)

    def _active_session(self, session_id: str) -> PlaybackSession:
        session = self.sessions.get(session_id)
        if session is None or session.expires_at <= now_utc():
            raise NotFoundError("播放任务不存在或已过期，请重新发起播放")
        return session

    def _play_root_id(self) -> str:
        play_root_id = self._find_play_root_id()
        if play_root_id is not None:
            return play_root_id
        return self.cloud.create_directory(self.download_root_id, PLAYBACK_ROOT_NAME)

    def _find_play_root_id(self) -> str | None:
        for directory in self.cloud.list_directories(self.download_root_id):
            if directory.name == PLAYBACK_ROOT_NAME:
                return directory.id
        return None

    def _is_play_directory(self, directory_id: str) -> bool:
        play_root_id = self._find_play_root_id()
        if play_root_id is None:
            return False
        return any(
            directory.id == directory_id
            for directory in self.cloud.list_directories(play_root_id)
        )

    def _delete_session_directory(self, session: PlaybackSession) -> None:
        play_root_id = session.play_root_id or self._find_play_root_id()
        if play_root_id is None:
            return
        owned_ids = {directory.id for directory in self.cloud.list_directories(play_root_id)}
        if session.session_dir_id in owned_ids:
            self.cloud.delete([str(session.session_dir_id)])

    def _video_files(self, directory_id: str, depth: int = 0) -> list[CloudItem]:
        videos: list[CloudItem] = []
        for item in self.cloud.list_items(directory_id):
            if item.is_directory:
                if depth < MAX_SCAN_DEPTH:
                    videos.extend(self._video_files(item.id, depth + 1))
                continue
            if Path(item.name).suffix.lower() in VIDEO_EXTENSIONS:
                videos.append(item)
        return videos

    def _playable_candidates(self, videos: list[CloudItem]) -> list[CloudItem]:
        clean = [
            item for item in videos
            if not any(token in item.name.casefold() for token in JUNK_VIDEO_KEYWORDS)
        ]
        candidates = clean or videos
        large = [item for item in candidates if (item.size_bytes or 0) >= MIN_VIDEO_BYTES]
        return sorted(large or candidates, key=lambda item: item.size_bytes or 0, reverse=True)

    def _auto_select(self, files: list[CloudItem]) -> CloudItem | None:
        if len(files) == 1:
            return files[0]
        largest, second = files[0], files[1]
        largest_size = largest.size_bytes or 0
        second_size = second.size_bytes or 0
        if largest_size <= 0 or second_size >= largest_size * MULTI_FILE_RATIO:
            return None
        return largest

    def _payload(self, session: PlaybackSession) -> dict[str, object]:
        selected = next(
            (item for item in session.files if item.id == session.selected_file_id),
            None,
        )
        return {
            "session_id": session.id,
            "task_id": session.task_id or "",
            "status": session.status,
            "message": session.message,
            "progress_percent": 100 if session.status == "failed" else session.progress_percent,
            "expires_at": session.expires_at.isoformat(),
            "files": [self._file_payload(item) for item in session.files],
            "file": self._file_payload(selected) if selected is not None else None,
            "play_url": self._play_url(session, selected),
        }

    def _play_url(self, session: PlaybackSession, selected: CloudItem | None) -> str | None:
        if session.status != "ready" or selected is None:
            return None
        # 文件名放在路径末尾，便于外部播放器按扩展名识别容器格式
        return f"{STREAM_PATH_PREFIX}/{session.stream_token}/{quote(selected.name)}"

    def _file_payload(self, item: CloudItem) -> dict[str, Any]:
        return {
            "id": item.id,
            "name": item.name,
            "size": item.size_bytes,
        }


def release_playback_sessions(connection: Connection, cloud: Cloud115Client, url: str) -> None:
    """正式离线提交前释放同一磁力的播放临时任务，否则 115 会把正式任务判为重复任务。"""
    magnet_hash = magnet_info_hash(url)
    if magnet_hash is None:
        return
    repository = PlaybackRepository(connection)
    sessions = repository.list_by_hash(magnet_hash)
    if not sessions:
        return
    service = PlaybackService(cloud, "", connection)
    for session in sessions:
        try:
            service.cleanup_session(session)
        except Exception as exc:
            raise IntegrationError("释放该磁力的在线播放临时任务失败，请稍后重试") from exc
