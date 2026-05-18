export type Actor = {
  id: number;
  name: string;
  profile_url: string;
  external_id: string | null;
  avatar_url: string | null;
  source: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type Work = {
  id: number;
  code: string;
  title: string | null;
  cover_url: string | null;
  release_date: string | null;
  source_url: string;
  actors: string[];
  status: string;
};

export type Magnet = {
  id: number;
  name: string;
  url: string;
  size_bytes: number | null;
  decision: string;
  reason: string;
  score: number;
};

export type Task = {
  id: number;
  status: string;
  stage: string;
  error_message: string | null;
  cloud_task_id: string | null;
  cloud_file_id: string | null;
  cloud_file_name: string | null;
  created_at: string;
  updated_at: string;
  work: Work | null;
  actor: Actor | null;
  magnet: Magnet | null;
};

export type TaskEvent = {
  id: number;
  task_id: number;
  from_status: string | null;
  to_status: string;
  from_stage: string | null;
  to_stage: string;
  message: string | null;
  context: Record<string, unknown>;
  created_at: string;
};

export type TaskHistoryItem = {
  task: Task;
  events: TaskEvent[];
};

export type SettingItem = {
  key: string;
  value: string | null;
  is_secret: boolean;
};

export type TelegramTestResult = {
  ok: boolean;
  message: string;
};

export type DirectoryItem = {
  id: string;
  name: string;
  path: string | null;
  is_directory: boolean;
};

export type P115Account = {
  user_id: string | null;
  user_name: string | null;
  vip_label: string | null;
  vip_expires_at: string | null;
  space_total: string | null;
  space_used: string | null;
  space_remaining: string | null;
};

export type P115Status = {
  configured: boolean;
  ok: boolean;
  message: string;
  account: P115Account | null;
};

export type ConnectionStatus = {
  p115: P115Status;
};

export type Dashboard = {
  stats: {
    submitted: number;
    downloading: number;
    completed: number;
    failed: number;
  };
  connections: ConnectionStatus;
  recent_tasks: Task[];
};

export type Follow = {
  id: number;
  actor_external_id: string;
  actor_name: string;
  actor_profile_url: string;
  actor_avatar_url: string | null;
  selected_tag_ids: string[];
  selected_tag_names: string[];
  type: string;
  latest_count: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type FollowCheckResult = {
  follow_id: number;
  actor_external_id: string;
  actor_name: string;
  selected_tag_ids: string[];
  selected_tag_names: string[];
  new_count: number;
  movies: Movie[];
};

export type PreviewImage = {
  thumb_url: string;
  large_url: string;
};

export type Movie = {
  id: string;
  number: string;
  title: string;
  thumb_url: string;
  cover_url: string;
  duration: number;
  release_date: string;
  score: string;
  can_play: boolean;
  has_cnsub: boolean;
  has_preview_images: boolean;
  magnets_count: number;
  preview_images?: PreviewImage[];
};

export type MovieDetail = {
  id: string;
  number: string;
  title: string;
  cover_url: string;
  duration: number;
  score: string;
  release_date: string;
  has_cnsub: boolean;
  has_preview_images: boolean;
  actors: { id: string; name: string; avatar_url: string }[];
  tags: { id: string; name: string }[];
  preview_images: PreviewImage[];
  relative_movies: Movie[];
  actor_movies: Movie[];
};

export type RankingActor = {
  id: string;
  name: string | null;
  name_zht: string | null;
  avatar_url: string | null;
};

export type MagnetItem = {
  name: string;
  hash: string;
  size: number;
  cnsub: boolean;
  hd: boolean;
  created_at: string;
  url?: string;
  pikpak_url?: string;
};

export type MovieReview = {
  id: number;
  username: string;
  status_title: string;
  score: number;
  content: string;
  likes_count: number;
  created_at: string;
};

export type ActorDetail = {
  id: string;
  name: string;
  name_zht: string;
  avatar_url: string;
  birthday: string;
  height: number;
  cup: string;
  videos_count: number;
};

export type ManualOfflineResult = {
  ok: boolean;
  task_id: number | null;
  duplicate_task: Task | null;
};

export type P115LoginDevice = {
  value: string;
  label: string;
  recommended: boolean;
};

export type P115QrStart = {
  session_id: string;
  device: string;
  qrcode_url: string;
  expires_at: string;
};

export type P115QrStatus = {
  session_id: string;
  status: string;
  message: string;
  account: P115Account | null;
};
