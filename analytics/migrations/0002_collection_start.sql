-- A non-identifying baseline survives event expiry so collection start stays honest.
CREATE TABLE IF NOT EXISTS analytics_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
