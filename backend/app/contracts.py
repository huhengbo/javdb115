from __future__ import annotations

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    username: str


class ActorCreate(BaseModel):
    name: str
    profile_url: str
    external_id: str | None = None
    avatar_url: str | None = None
    source: str = "javdb"


class ActorOut(ActorCreate):
    id: int
    enabled: bool
    created_at: str
    updated_at: str


class MagnetOut(BaseModel):
    id: int
    name: str
    url: str
    size_bytes: int | None
    decision: str
    reason: str
    score: int


class WorkOut(BaseModel):
    id: int
    code: str
    title: str | None
    cover_url: str | None
    release_date: str | None
    source_url: str
    actors: list[str]
    status: str


class TaskOut(BaseModel):
    id: int
    status: str
    stage: str
    error_message: str | None
    cloud_task_id: str | None
    cloud_file_id: str | None
    cloud_file_name: str | None = None
    created_at: str
    updated_at: str
    work: WorkOut | None = None
    actor: ActorOut | None = None
    magnet: MagnetOut | None = None


class TaskEventOut(BaseModel):
    id: int
    task_id: int
    from_status: str | None = None
    to_status: str
    from_stage: str | None = None
    to_stage: str
    message: str | None = None
    context: dict[str, object]
    created_at: str


class TaskHistoryItem(BaseModel):
    task: TaskOut
    events: list[TaskEventOut] = Field(default_factory=list)


class SettingItem(BaseModel):
    key: str
    value: str | None
    is_secret: bool = False


class SettingsUpdate(BaseModel):
    items: list[SettingItem]


class TelegramTestRequest(BaseModel):
    message: str | None = None


class TelegramTestResponse(BaseModel):
    ok: bool
    message: str


class FollowCreate(BaseModel):
    actor_external_id: str
    actor_name: str
    actor_profile_url: str
    actor_avatar_url: str | None = None
    selected_tag_ids: list[str] = Field(default_factory=list)
    selected_tag_names: list[str] = Field(default_factory=list)
    type: str = "actor"


class FollowOut(BaseModel):
    id: int
    actor_external_id: str
    actor_name: str
    actor_profile_url: str
    actor_avatar_url: str | None = None
    selected_tag_ids: list[str] = Field(default_factory=list)
    selected_tag_names: list[str] = Field(default_factory=list)
    type: str
    latest_count: int = 0
    enabled: bool
    created_at: str
    updated_at: str


class FollowUpdate(BaseModel):
    enabled: bool | None = None
    selected_tag_ids: list[str] | None = None
    selected_tag_names: list[str] | None = None


class ManualOfflineRequest(BaseModel):
    magnet_hash: str
    force: bool = False


class ManualOfflineResponse(BaseModel):
    ok: bool
    task_id: int | None = None
    duplicate_task: TaskOut | None = None


class MovieBundleOut(BaseModel):
    detail: dict[str, object]
    magnets: list[dict[str, object]]
    reviews: list[dict[str, object]] = Field(default_factory=list)
    reviews_error: str | None = None


class P115LoginDevice(BaseModel):
    value: str
    label: str
    recommended: bool = False


class P115QrStartRequest(BaseModel):
    device: str = "alipaymini"


class P115QrStartResponse(BaseModel):
    session_id: str
    device: str
    qrcode_url: str
    expires_at: str


class DirectoryItem(BaseModel):
    id: str
    name: str
    path: str | None = None
    is_directory: bool = True


class DashboardStats(BaseModel):
    submitted: int
    downloading: int
    organizing: int = 0
    completed: int
    failed: int


class TaskBreakdown(BaseModel):
    by_status: dict[str, int] = Field(default_factory=dict)
    by_stage: dict[str, int] = Field(default_factory=dict)
    attention: int = 0


class P115AccountOut(BaseModel):
    user_id: str | None = None
    user_name: str | None = None
    vip_label: str | None = None
    vip_expires_at: str | None = None
    space_total: str | None = None
    space_used: str | None = None
    space_remaining: str | None = None


class P115QrStatusResponse(BaseModel):
    session_id: str
    status: str
    message: str
    account: P115AccountOut | None = None


class P115StatusOut(BaseModel):
    configured: bool
    ok: bool
    message: str
    checked_at: str | None = None
    account: P115AccountOut | None = None


class JavdbStatusOut(BaseModel):
    ok: bool
    message: str
    checked_at: str


class ConnectionStatusOut(BaseModel):
    p115: P115StatusOut
    javdb: JavdbStatusOut


class DashboardOut(BaseModel):
    stats: DashboardStats
    task_breakdown: TaskBreakdown
    connections: ConnectionStatusOut
    attention_tasks: list[TaskOut] = Field(default_factory=list)
    recent_tasks: list[TaskOut]


class FilterRules(BaseModel):
    min_size_gb: float = Field(default=0, ge=0)
    required_keywords: list[str] = Field(default_factory=list)
    excluded_keywords: list[str] = Field(default_factory=list)
