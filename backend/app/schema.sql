CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  is_secret INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS actors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  profile_url TEXT NOT NULL UNIQUE,
  external_id TEXT,
  avatar_url TEXT,
  source TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS works (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  title TEXT,
  cover_url TEXT,
  release_date TEXT,
  source_url TEXT NOT NULL,
  actors_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS magnets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  size_bytes INTEGER,
  decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER REFERENCES works(id) ON DELETE SET NULL,
  actor_id INTEGER REFERENCES actors(id) ON DELETE SET NULL,
  magnet_id INTEGER REFERENCES magnets(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  error_message TEXT,
  cloud_task_id TEXT,
  cloud_file_id TEXT,
  cloud_file_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  message TEXT,
  context_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filter_by TEXT UNIQUE,
  label TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'actor',
  cover_url TEXT,
  actor_external_id TEXT UNIQUE,
  actor_name TEXT NOT NULL DEFAULT '',
  actor_profile_url TEXT NOT NULL DEFAULT '',
  actor_avatar_url TEXT,
  selected_tag_ids_json TEXT NOT NULL DEFAULT '[]',
  selected_tag_names_json TEXT NOT NULL DEFAULT '[]',
  latest_count INTEGER DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS follow_seen_movies (
  follow_id INTEGER NOT NULL REFERENCES follows(id) ON DELETE CASCADE,
  movie_id TEXT NOT NULL,
  seen_at TEXT NOT NULL,
  PRIMARY KEY (follow_id, movie_id)
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  level TEXT NOT NULL,
  stage TEXT NOT NULL,
  message TEXT NOT NULL,
  context_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_task_events_task_id ON task_events(task_id);
CREATE INDEX IF NOT EXISTS idx_logs_task_id ON logs(task_id);
CREATE INDEX IF NOT EXISTS idx_magnets_work_id ON magnets(work_id);
CREATE INDEX IF NOT EXISTS idx_follow_seen_movies_follow_id ON follow_seen_movies(follow_id);
