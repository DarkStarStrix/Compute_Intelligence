import type { D1Database } from "@cloudflare/workers-types";
import type { ProductEvent } from "../shared/analytics";

export async function insertEvents(
  db: D1Database,
  events: ProductEvent[],
  country: string,
  at: string
) {
  const results = await db.batch([
    db
      .prepare(
        "INSERT INTO analytics_metadata(key,value) VALUES('collection_started',?) ON CONFLICT(key) DO NOTHING"
      )
      .bind(at),
    ...events.map(event =>
      db
        .prepare(
          `
    INSERT INTO events(event_id,session_id,browser_id,event,occurred_at,received_at,sequence,search_id,country,channel,referrer,campaign,properties)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(event_id) DO NOTHING
  `
        )
        .bind(
          event.eventId,
          event.sessionId,
          event.browserId ?? null,
          event.event,
          event.occurredAt,
          at,
          event.sequence,
          event.searchId ?? null,
          country,
          event.acquisition?.channel ?? "direct",
          event.acquisition?.referrer ?? null,
          event.acquisition?.campaign ?? null,
          JSON.stringify(event.properties)
        )
    ),
  ]);
  let inserted = 0;
  for (const [index, result] of results.slice(1).entries()) {
    if (!result.meta.changes) continue;
    inserted += result.meta.changes;
    const event = events[index];
    // Native Cloudflare graphs need no identifiers or event payloads. Retries
    // that D1 deduplicates must not create additional visit/click log entries.
    if (event.event === "session_started")
      console.log({
        metric: "compute_visit",
        channel: event.acquisition?.channel ?? "direct",
      });
    else if (event.event === "provider_outbound_click")
      console.log({
        metric: "compute_provider_click",
        provider: event.properties.provider,
      });
  }
  return inserted;
}
export function countHealth(
  db: D1Database,
  metric: string,
  at = new Date().toISOString()
) {
  return db
    .prepare(
      `INSERT INTO health(day,metric,count) VALUES(?,?,1)
    ON CONFLICT(day,metric) DO UPDATE SET count=count+1`
    )
    .bind(at.slice(0, 10), metric)
    .run();
}
export async function expireAnalytics(db: D1Database, now: number) {
  const before = new Date(now - 90 * 86400000).toISOString();
  await db.batch([
    db.prepare("DELETE FROM events WHERE received_at < ?").bind(before),
    db.prepare("DELETE FROM source_checks WHERE checked_at < ?").bind(before),
    db.prepare("DELETE FROM health WHERE day < ?").bind(before.slice(0, 10)),
  ]);
}
