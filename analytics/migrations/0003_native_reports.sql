-- Native reports, readable only through authenticated Cloudflare D1 access.
-- Canonical report definitions. Change deployed views through a new migration.
CREATE VIEW IF NOT EXISTS product_summary_7d AS
WITH p AS (SELECT * FROM events WHERE received_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days') AND received_at < strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    rendered AS (SELECT r.* FROM p r WHERE r.event='results_viewed' AND EXISTS(
      SELECT 1 FROM p s WHERE s.event='search_submitted' AND s.session_id=r.session_id AND s.search_id=r.search_id AND s.sequence<r.sequence)),
    searched AS (SELECT DISTINCT session_id FROM rendered) SELECT
      (SELECT COUNT(DISTINCT session_id) FROM p) sessions,
      (SELECT COUNT(DISTINCT session_id) FROM p WHERE event IN ('search_submitted','comparison_opened','calculator_used','provider_outbound_click')) engaged,
      (SELECT COUNT(DISTINCT session_id) FROM p WHERE browser_id IS NOT NULL) optedInSessions,
      (SELECT COUNT(*) FROM p WHERE event='search_submitted') submitted,
      (SELECT COUNT(*) FROM rendered) rendered,
      (SELECT COUNT(*) FROM rendered WHERE json_extract(properties,'$.results')>0) successful,
      (SELECT COUNT(*) FROM rendered WHERE json_extract(properties,'$.freshResults')>0) freshSuccessful,
      (SELECT COUNT(*) FROM searched) searchedSessions,
      (SELECT COUNT(DISTINCT e.session_id) FROM p e WHERE e.event='comparison_opened' AND EXISTS(SELECT 1 FROM rendered r WHERE r.session_id=e.session_id AND r.search_id=e.search_id AND r.sequence<e.sequence)) comparedSessions,
      (SELECT COUNT(DISTINCT e.session_id) FROM p e WHERE e.event='provider_outbound_click' AND EXISTS(SELECT 1 FROM rendered r WHERE r.session_id=e.session_id AND r.search_id=e.search_id AND r.sequence<e.sequence)) outboundSessions,
      (SELECT COUNT(*) FROM p WHERE event='provider_outbound_click') outboundActions,
      (SELECT COUNT(*) FROM p WHERE event='commercial_link_clicked') commercialActions,
      (SELECT AVG(json_extract(properties,'$.latencyMs')) FROM rendered) meanRenderMs;

CREATE VIEW IF NOT EXISTS product_summary_30d AS
WITH p AS (SELECT * FROM events WHERE received_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days') AND received_at < strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    rendered AS (SELECT r.* FROM p r WHERE r.event='results_viewed' AND EXISTS(
      SELECT 1 FROM p s WHERE s.event='search_submitted' AND s.session_id=r.session_id AND s.search_id=r.search_id AND s.sequence<r.sequence)),
    searched AS (SELECT DISTINCT session_id FROM rendered) SELECT
      (SELECT COUNT(DISTINCT session_id) FROM p) sessions,
      (SELECT COUNT(DISTINCT session_id) FROM p WHERE event IN ('search_submitted','comparison_opened','calculator_used','provider_outbound_click')) engaged,
      (SELECT COUNT(DISTINCT session_id) FROM p WHERE browser_id IS NOT NULL) optedInSessions,
      (SELECT COUNT(*) FROM p WHERE event='search_submitted') submitted,
      (SELECT COUNT(*) FROM rendered) rendered,
      (SELECT COUNT(*) FROM rendered WHERE json_extract(properties,'$.results')>0) successful,
      (SELECT COUNT(*) FROM rendered WHERE json_extract(properties,'$.freshResults')>0) freshSuccessful,
      (SELECT COUNT(*) FROM searched) searchedSessions,
      (SELECT COUNT(DISTINCT e.session_id) FROM p e WHERE e.event='comparison_opened' AND EXISTS(SELECT 1 FROM rendered r WHERE r.session_id=e.session_id AND r.search_id=e.search_id AND r.sequence<e.sequence)) comparedSessions,
      (SELECT COUNT(DISTINCT e.session_id) FROM p e WHERE e.event='provider_outbound_click' AND EXISTS(SELECT 1 FROM rendered r WHERE r.session_id=e.session_id AND r.search_id=e.search_id AND r.sequence<e.sequence)) outboundSessions,
      (SELECT COUNT(*) FROM p WHERE event='provider_outbound_click') outboundActions,
      (SELECT COUNT(*) FROM p WHERE event='commercial_link_clicked') commercialActions,
      (SELECT AVG(json_extract(properties,'$.latencyMs')) FROM rendered) meanRenderMs;

CREATE VIEW IF NOT EXISTS provider_clicks_30d AS
SELECT json_extract(properties,'$.provider') provider,COUNT(*) outbound_actions,COUNT(DISTINCT session_id) sessions FROM events WHERE received_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days') AND received_at < strftime('%Y-%m-%dT%H:%M:%fZ','now') AND event='provider_outbound_click' GROUP BY provider;

CREATE VIEW IF NOT EXISTS unmet_demand_30d AS
WITH p AS (SELECT * FROM events WHERE received_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days') AND received_at < strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    rendered AS (SELECT r.* FROM p r WHERE r.event='results_viewed' AND EXISTS(
      SELECT 1 FROM p s WHERE s.event='search_submitted' AND s.session_id=r.session_id AND s.search_id=r.search_id AND s.sequence<r.sequence)),
    searched AS (SELECT DISTINCT session_id FROM rendered) SELECT COALESCE(json_extract(properties,'$.kind'),'unspecified') compute,COALESCE(json_extract(properties,'$.model'),'unspecified') model,COALESCE(json_extract(properties,'$.region'),'unspecified') region,COUNT(*) searches FROM rendered WHERE json_extract(properties,'$.results')=0 GROUP BY compute,model,region;

CREATE VIEW IF NOT EXISTS acquisition_30d AS
SELECT channel,COALESCE(referrer,'direct') referrer,COALESCE(campaign,'none') campaign,COUNT(DISTINCT session_id) sessions FROM events WHERE received_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days') AND received_at < strftime('%Y-%m-%dT%H:%M:%fZ','now') GROUP BY channel,referrer,campaign;

CREATE VIEW IF NOT EXISTS commercial_actions_30d AS
SELECT json_extract(properties,'$.action') action,COUNT(*) clicks FROM events WHERE received_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days') AND received_at < strftime('%Y-%m-%dT%H:%M:%fZ','now') AND event='commercial_link_clicked' GROUP BY action;

CREATE VIEW IF NOT EXISTS collection_health AS
SELECT (SELECT value FROM analytics_metadata WHERE key='collection_started') collection_started,MIN(received_at) retained_since,MAX(received_at) last_received_event,COUNT(*) retained_events FROM events;

CREATE VIEW IF NOT EXISTS source_status_latest AS
SELECT revision,provider,status,checked_at,last_success_at,listings,complete FROM source_checks WHERE revision=(SELECT MAX(revision) FROM source_checks);

CREATE VIEW IF NOT EXISTS return_cohorts_30d AS
WITH first_seen AS (SELECT browser_id,MIN(received_at) first_at FROM events WHERE browser_id IS NOT NULL GROUP BY browser_id), windows(days) AS (VALUES(7),(30))
SELECT w.days,COUNT(f.browser_id) eligible,
COALESCE(SUM(CASE WHEN EXISTS(SELECT 1 FROM events e WHERE e.browser_id=f.browser_id
AND substr(e.received_at,1,10)>substr(f.first_at,1,10)
AND julianday(e.received_at)<=julianday(f.first_at)+w.days
AND e.session_id<>(SELECT session_id FROM events origin WHERE origin.browser_id=f.browser_id ORDER BY received_at,sequence LIMIT 1)) THEN 1 ELSE 0 END),0) returned
FROM windows w LEFT JOIN first_seen f
ON julianday(f.first_at)>=julianday('now')-30-w.days AND julianday(f.first_at)<=julianday('now')-w.days GROUP BY w.days;
