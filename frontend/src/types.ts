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
  configured: boolean;
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
  checked: number;
  submitted: number;
  skipped: number;
  errors: number;
};

export type Dashboard = {
  stats: {
    submitted: number;
    downloading: number;
    organizing: number;
    completed: number;
    failed: number;
  };
  recent_tasks: Task[];
};

export type Movie = {
  id: string;
  code: string;
  title: string;
  cover_url?: string;
  release_date?: string;
  duration?: string;
  score?: string;
  tags?: string[];
};

export type MagnetItem = {
  hash: string;
  name: string;
  url: string;
  size?: string;
  size_bytes?: number;
  has_subtitle?: boolean;
  is_hd?: boolean;
  share_date?: string;
};

export type MovieDetail = {
  id: string;
  code: string;
  title: string;
  cover_url?: string;
  poster_url?: string;
  release_date?: string;
  duration?: string;
  score?: string;
  tags?: string[];
  actors?: { id: string; name: string; avatar_url?: string }[];
  previews?: string[];
};

export type MovieReview = {
  id?: string;
  username?: string;
  content: string;
  score?: string;
  created_at?: string;
};

export type MovieBundle = {
  detail: MovieDetail;
  magnets: MagnetItem[];
  reviews: MovieReview[];
  reviews_error?: string | null;
};

export type ActorDetail = {
  id: string;
  name: string;
  avatar_url?: string;
  bio?: string;
  tags?: { id: string; name: string }[];
};

export type RankingActor = {
  id: string;
  name: string;
  avatar_url?: string;
  rank?: number;
};

export type ManualOfflineResult = {
  ok: boolean;
  task_id?: number | null;
  duplicate_task?: Task | null;
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
  status: string;
  message?: string;
};
