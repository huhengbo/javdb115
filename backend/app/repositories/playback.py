from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.adapters.cloud115_types import CloudItem
from app.security import iso_now


@dataclass
class PlaybackSession:
    id: str
    stream_token: str
    created_at: datetime
    expires_at: datetime
    magnet_hash: str | None = None
    task_id: str | None = None
    # owned=True 表示 115 离线记录和 .play 临时目录归本会话所有，过期时需要清理；
    # 播放已完成的正式任务时为 False，只读网盘目录，不做任何删除。
    owned: bool = True
    play_root_id: str | None = None
    session_dir_id: str | None = None
    status: str = "submitting"
    message: str = "正在提交到 115"
    progress_percent: int = 5
    files: list[CloudItem] = field(default_factory=list)
    selected_file_id: str | None = None
    cleanup_error: str | None = None


class PlaybackRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection

    def insert(self, session: PlaybackSession) -> None:
        now = iso_now()
        self.connection.execute(
            """
            INSERT INTO playback_sessions (
                id, magnet_hash, task_id, owned, play_root_id, session_dir_id,
                status, message, progress_percent, files_json, selected_file_id,
                stream_token, cleanup_error, created_at, updated_at, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session.id,
                session.magnet_hash,
                session.task_id,
                int(session.owned),
                session.play_root_id,
                session.session_dir_id,
                session.status,
                session.message,
                session.progress_percent,
                _files_json(session.files),
                session.selected_file_id,
                session.stream_token,
                session.cleanup_error,
                session.created_at.isoformat(),
                now,
                session.expires_at.isoformat(),
            ),
        )
        self.connection.commit()

    def update(self, session: PlaybackSession) -> None:
        self.connection.execute(
            """
            UPDATE playback_sessions SET
                magnet_hash = ?, task_id = ?, owned = ?, play_root_id = ?, session_dir_id = ?,
                status = ?, message = ?, progress_percent = ?, files_json = ?,
                selected_file_id = ?, cleanup_error = ?, updated_at = ?, expires_at = ?
            WHERE id = ?
            """,
            (
                session.magnet_hash,
                session.task_id,
                int(session.owned),
                session.play_root_id,
                session.session_dir_id,
                session.status,
                session.message,
                session.progress_percent,
                _files_json(session.files),
                session.selected_file_id,
                session.cleanup_error,
                iso_now(),
                session.expires_at.isoformat(),
                session.id,
            ),
        )
        self.connection.commit()

    def delete(self, session_id: str) -> None:
        self.connection.execute("DELETE FROM playback_sessions WHERE id = ?", (session_id,))
        self.connection.commit()

    def get(self, session_id: str) -> PlaybackSession | None:
        row = self.connection.execute(
            "SELECT * FROM playback_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        return None if row is None else _to_session(row)

    def get_by_token(self, stream_token: str) -> PlaybackSession | None:
        row = self.connection.execute(
            "SELECT * FROM playback_sessions WHERE stream_token = ?",
            (stream_token,),
        ).fetchone()
        return None if row is None else _to_session(row)

    def list_by_hash(self, magnet_hash: str) -> list[PlaybackSession]:
        rows = self.connection.execute(
            "SELECT * FROM playback_sessions WHERE magnet_hash = ? ORDER BY created_at DESC",
            (magnet_hash,),
        ).fetchall()
        return [_to_session(row) for row in rows]

    def find_by_session_dir(self, session_dir_id: str) -> PlaybackSession | None:
        row = self.connection.execute(
            "SELECT * FROM playback_sessions WHERE session_dir_id = ?",
            (session_dir_id,),
        ).fetchone()
        return None if row is None else _to_session(row)

    def list_due_for_cleanup(
        self,
        now: datetime,
        failed_before: datetime,
    ) -> list[PlaybackSession]:
        rows = self.connection.execute(
            """
            SELECT * FROM playback_sessions
            WHERE expires_at <= ? OR (status = 'failed' AND updated_at <= ?)
            ORDER BY expires_at
            """,
            (now.isoformat(), failed_before.isoformat()),
        ).fetchall()
        return [_to_session(row) for row in rows]

    def list_ids(self) -> set[str]:
        rows = self.connection.execute("SELECT id FROM playback_sessions").fetchall()
        return {str(row["id"]) for row in rows}


def _files_json(files: list[CloudItem]) -> str:
    return json.dumps(
        [
            {
                "id": item.id,
                "name": item.name,
                "size": item.size_bytes,
                "pick_code": item.pick_code,
            }
            for item in files
        ],
        ensure_ascii=False,
    )


def _to_files(raw: str | None) -> list[CloudItem]:
    items: list[dict[str, Any]] = json.loads(raw or "[]")
    return [
        CloudItem(
            id=str(item["id"]),
            name=str(item["name"]),
            size_bytes=item.get("size"),
            is_directory=False,
            pick_code=item.get("pick_code"),
        )
        for item in items
    ]


def _to_session(row: sqlite3.Row) -> PlaybackSession:
    return PlaybackSession(
        id=str(row["id"]),
        stream_token=str(row["stream_token"]),
        created_at=datetime.fromisoformat(str(row["created_at"])),
        expires_at=datetime.fromisoformat(str(row["expires_at"])),
        magnet_hash=row["magnet_hash"],
        task_id=row["task_id"],
        owned=bool(row["owned"]),
        play_root_id=row["play_root_id"],
        session_dir_id=row["session_dir_id"],
        status=str(row["status"]),
        message=str(row["message"]),
        progress_percent=int(row["progress_percent"]),
        files=_to_files(row["files_json"]),
        selected_file_id=row["selected_file_id"],
        cleanup_error=row["cleanup_error"],
    )
