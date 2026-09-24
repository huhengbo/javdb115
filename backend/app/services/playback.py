from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import RLock
from uuid import uuid4

from app.adapters.cloud115 import Cloud115Client
from app.adapters.cloud115_types import CloudItem
from app.errors import NotFoundError, ValidationAppError

PLAYBACK_ROOT_NAME = ".play"
PLAYBACK_TTL = timedelta(hours=6)
VIDEO_EXTENSIONS = {".mp4", ".mkv", ".avi", ".mov", ".wmv", ".m4v", ".ts", ".webm"}
JUNK_VIDEO_KEYWORDS = ("sample", "preview", "trailer", "广告", "宣传", "防走失")
MIN_VIDEO_BYTES = 50 * 1024 * 1024
MULTI_FILE_RATIO = 0.65
MAX_SCAN_DEPTH = 2


@dataclass
class PlaybackSession:
    id: str
    task_id: str
    play_root_id: str
    created_at: datetime
    expires_at: datetime
    status: str = "offline_waiting"
    message: str = "已提交到 115，等待离线文件"
    source_dir_id: str | None = None
    files: list[CloudItem] = field(default_factory=list)
    selected_file_id: str | None = None
    play_url: str | None = None


_SESSIONS: dict[str, PlaybackSession] = {}
_SESSIONS_LOCK = RLock()


class PlaybackService:
    def __init__(self, cloud: Cloud115Client, download_root_id: str) -> None:
        self.cloud = cloud
        self.download_root_id = download_root_id

    def create(self, url: str) -> dict[str, object]:
        value = url.strip()
        if not value:
            raise ValidationAppError("请输入磁力链接")
        self._cleanup_expired()
        play_root_id = self._play_root_id()
        session_id = uuid4().hex[:16]
        task_id = self.cloud.add_offline_url(value, play_root_id, savepath=session_id)
        now = datetime.now(UTC)
        session = PlaybackSession(
            id=session_id,
            task_id=task_id,
            play_root_id=play_root_id,
            created_at=now,
            expires_at=now + PLAYBACK_TTL,
        )
        with _SESSIONS_LOCK:
            _SESSIONS[session.id] = session
        return self._payload(session)

    def get(self, session_id: str) -> dict[str, object]:
        self._cleanup_expired()
        session = self._session(session_id)
        if session.status in {"failed", "ready"}:
            return self._payload(session)

        task = self.cloud.get_offline_tasks({session.task_id}).get(session.task_id.casefold())
        if task is not None and task.status == "failed":
            session.status = "failed"
            session.message = task.message or "115 离线任务失败"
            return self._payload(session)

        source_dir_id = task.source_dir_id if task is not None else None
        source_dir_id = source_dir_id or self._session_directory_id(session)
        if source_dir_id is None:
            session.status = "offline_waiting"
            progress = task.progress_percent if task is not None else None
            session.message = (
                f"等待 115 离线文件 · {progress}%"
                if progress is not None
                else "等待 115 离线文件"
            )
            return self._payload(session)

        session.source_dir_id = source_dir_id
        session.status = "locating"
        session.message = "已发现离线目录，正在查找视频"
        videos = self._video_files(source_dir_id)
        if not videos:
            if task is not None and task.status == "completed":
                session.status = "failed"
                session.message = "115 离线已完成，但没有找到可播放的视频文件"
            return self._payload(session)

        session.files = self._playable_candidates(videos)
        if not session.files:
            session.status = "failed"
            session.message = "没有找到符合条件的主视频文件"
            return self._payload(session)

        selected = self._auto_select(session.files)
        if selected is None:
            session.status = "select_required"
            session.message = "发现多个主要视频，请选择要播放的文件"
            return self._payload(session)

        return self._resolve(session, selected)

    def select(self, session_id: str, file_id: str) -> dict[str, object]:
        session = self._session(session_id)
        if not session.files:
            self.get(session_id)
            session = self._session(session_id)
        selected = next((item for item in session.files if item.id == file_id), None)
        if selected is None:
            raise ValidationAppError("选择的视频文件不存在")
        return self._resolve(session, selected)

    def _resolve(self, session: PlaybackSession, item: CloudItem) -> dict[str, object]:
        session.status = "resolving"
        session.message = "正在获取 115 播放地址"
        session.selected_file_id = item.id
        session.play_url = self.cloud.get_download_url(item.id, item.pick_code)
        session.status = "ready"
        session.message = "播放地址已准备完成"
        return self._payload(session)

    def _play_root_id(self) -> str:
        for directory in self.cloud.list_directories(self.download_root_id):
            if directory.name == PLAYBACK_ROOT_NAME:
                return directory.id
        return self.cloud.create_directory(self.download_root_id, PLAYBACK_ROOT_NAME)

    def _session_directory_id(self, session: PlaybackSession) -> str | None:
        for directory in self.cloud.list_directories(session.play_root_id):
            if directory.name == session.id:
                return directory.id
        return None

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

    def _session(self, session_id: str) -> PlaybackSession:
        with _SESSIONS_LOCK:
            session = _SESSIONS.get(session_id)
        if session is None:
            raise NotFoundError("播放任务不存在或已过期")
        return session

    def _cleanup_expired(self) -> None:
        now = datetime.now(UTC)
        with _SESSIONS_LOCK:
            expired = [session for session in _SESSIONS.values() if session.expires_at <= now]
        for session in expired:
            self._cleanup_session(session)
            with _SESSIONS_LOCK:
                _SESSIONS.pop(session.id, None)

    def _cleanup_session(self, session: PlaybackSession) -> None:
        self.cloud.delete_offline_task(session.task_id)
        self._delete_session_directory(session)

    def _delete_session_directory(self, session: PlaybackSession) -> None:
        source_dir_id = session.source_dir_id or self._session_directory_id(session)
        if source_dir_id is None:
            return
        owned_ids = {
            directory.id
            for directory in self.cloud.list_directories(session.play_root_id)
        }
        if source_dir_id in owned_ids:
            self.cloud.delete([source_dir_id])

    def _payload(self, session: PlaybackSession) -> dict[str, object]:
        selected = next(
            (item for item in session.files if item.id == session.selected_file_id),
            None,
        )
        return {
            "session_id": session.id,
            "task_id": session.task_id,
            "status": session.status,
            "message": session.message,
            "expires_at": session.expires_at.isoformat(),
            "files": [self._file_payload(item) for item in session.files],
            "file": self._file_payload(selected) if selected is not None else None,
            "play_url": session.play_url,
        }

    def _file_payload(self, item: CloudItem) -> dict[str, object]:
        return {
            "id": item.id,
            "name": item.name,
            "size": item.size_bytes,
        }
