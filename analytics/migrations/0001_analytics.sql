CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  browser_id TEXT,
  event TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  search_id TEXT,
  country TEXT NOT NULL,
  channel TEXT NOT NULL,
  referrer TEXT,
  campaign TEXT,
  properties TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_received ON events(received_at);
CREATE INDEX IF NOT EXISTS events_session ON events(session_id, occurred_at);
CREATE INDEX IF NOT EXISTS events_browser ON events(browser_id, received_at) WHERE browser_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS source_checks (
  revision TEXT NOT NULL,
  provider TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  last_success_at TEXT,
  status TEXT NOT NULL,
  listings INTEGER NOT NULL,
  complete INTEGER NOT NULL,
  PRIMARY KEY (revision, provider)
);
CREATE INDEX IF NOT EXISTS checks_time ON source_checks(checked_at);
CREATE TABLE IF NOT EXISTS health (
  day TEXT NOT NULL,
  metric TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, metric)
);
