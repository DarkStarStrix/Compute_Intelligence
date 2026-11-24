import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsBatchSchema, type ProductEvent } from "../shared/analytics";
import { analyticsDatabase } from "./analytics-sqlite";
import { insertEvents, expireAnalytics } from "../analytics/store";
import ingest from "../analytics/worker";
import { AnalyticsClient } from "../client/src/lib/analytics";

const now = Date.now();
function event(
  name: ProductEvent["event"],
  sessionId: string,
  sequence: number,
  properties: ProductEvent["properties"] = {},
  searchId?: string,
  at = now - 1000
): ProductEvent {
  return {
    version: 1,
    eventId: crypto.randomUUID(),
    sessionId,
    event: name,
    sequence,
    occurredAt: new Date(at).toISOString(),
    properties,
    searchId,
  };
}
class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("validates only bounded approved fields and rejects leaked text/URLs and malformed outcomes", () => {
  const id = crypto.randomUUID();
  const good = event(
    "results_viewed",
    id,
    1,
    { results: 2, freshResults: 1, kind: "gpu" },
    crypto.randomUUID()
  );
  expect(analyticsBatchSchema.safeParse({ events: [good] }).success).toBe(true);
  for (const bad of [
    {
      ...good,
      properties: { ...good.properties, searchText: "private project" },
    },
    { ...good, event: "purchase" },
    { ...good, properties: { results: 1, freshResults: 2 } },
    { ...good, searchId: undefined },
    { ...good, properties: { model: "https://secret.test?q=foo" } },
    { ...good, browserId: "ip-address" },
  ])
    expect(analyticsBatchSchema.safeParse({ events: [bad] }).success).toBe(
      false
    );
  expect(
    analyticsBatchSchema.safeParse({ events: Array(11).fill(good) }).success
  ).toBe(false);
});

it("executes exact ordered funnels, deduplicates UUIDs and distinguishes fresh, retained, organic and commercial actions", async () => {
  const { db, sqlite } = analyticsDatabase();
  const a = crypto.randomUUID(),
    b = crypto.randomUUID(),
    c = crypto.randomUUID(),
    s1 = crypto.randomUUID(),
    s2 = crypto.randomUUID();
  const rows = [
    event("session_started", a, 0),
    event("search_submitted", a, 1, { kind: "gpu", model: "h100-sxm" }, s1),
    event(
      "results_viewed",
      a,
      2,
      { results: 2, freshResults: 1, latencyMs: 4, kind: "gpu" },
      s1
    ),
    event("comparison_opened", a, 3, { listings: 2, kind: "gpu" }, s1),
    event(
      "provider_outbound_click",
      a,
      4,
      { provider: "runpod", kind: "gpu" },
      s1
    ),
    event(
      "provider_outbound_click",
      a,
      5,
      { provider: "runpod", kind: "gpu" },
      s1
    ),
    event("commercial_link_clicked", a, 6, { action: "referral" }, s1),
    event("provider_outbound_click", b, 0, { provider: "lium" }), // Before search, never a conversion.
    event("search_submitted", b, 1, { kind: "gpu", model: "h100-sxm" }, s2),
    event(
      "results_viewed",
      b,
      2,
      {
        results: 0,
        freshResults: 0,
        kind: "gpu",
        model: "h100-sxm",
        region: "US West",
      },
      s2
    ),
    event("session_started", c, 0),
  ];
  expect(
    await insertEvents(db, rows, "US", new Date(now - 500).toISOString())
  ).toBe(rows.length);
  expect(
    await insertEvents(db, [rows[4]], "US", new Date(now).toISOString())
  ).toBe(0);
  const report = {
    summary: sqlite.prepare("SELECT * FROM product_summary_7d").get(),
    cohorts: sqlite.prepare("SELECT * FROM return_cohorts_30d").all(),
    zeroResults: sqlite.prepare("SELECT * FROM unmet_demand_30d").all(),
    providers: sqlite
      .prepare(
        "SELECT provider,outbound_actions AS clicks,sessions FROM provider_clicks_30d"
      )
      .all(),
  };
  expect(report.summary).toMatchObject({
    sessions: 3,
    engaged: 2,
    submitted: 2,
    rendered: 2,
    successful: 1,
    freshSuccessful: 1,
    searchedSessions: 2,
    comparedSessions: 1,
    outboundSessions: 1,
    outboundActions: 3,
    commercialActions: 1,
    meanRenderMs: 4,
  });
  expect(report.zeroResults).toHaveLength(1);
  expect(report.providers).toContainEqual({
    provider: "runpod",
    clicks: 2,
    sessions: 1,
  });
  sqlite.close();
});

it("computes only mature opted-in return cohorts and expires all event records after 90 days", async () => {
  const { db, sqlite } = analyticsDatabase();
  const browserId = crypto.randomUUID();
  for (const daysAgo of [20, 18]) {
    const row = {
      ...event(
        "session_started",
        crypto.randomUUID(),
        0,
        {},
        undefined,
        now - daysAgo * 86400000
      ),
      browserId,
    };
    await insertEvents(db, [row], "GB", row.occurredAt);
  }
  const anonymous = event(
    "session_started",
    crypto.randomUUID(),
    0,
    {},
    undefined,
    now - 100 * 86400000
  );
  await insertEvents(db, [anonymous], "unknown", anonymous.occurredAt);
  const report = {
    summary: sqlite.prepare("SELECT * FROM product_summary_7d").get(),
    cohorts: sqlite.prepare("SELECT * FROM return_cohorts_30d").all(),
    zeroResults: sqlite.prepare("SELECT * FROM unmet_demand_30d").all(),
    providers: sqlite
      .prepare(
        "SELECT provider,outbound_actions AS clicks,sessions FROM provider_clicks_30d"
      )
      .all(),
  };
  expect(report.cohorts).toEqual([
    { days: 7, eligible: 1, returned: 1 },
    { days: 30, eligible: 0, returned: 0 },
  ]);
  await expireAnalytics(db, now);
  expect(sqlite.prepare("SELECT COUNT(*) n FROM events").get()?.n).toBe(2);
  sqlite.close();
});

describe("browser privacy and delivery", () => {
  function setup() {
    const local = new MemoryStorage(),
      session = new MemoryStorage(),
      send = vi.fn(async (_body: string) => true);
    let blocked = false;
    const options = {
      endpoint: "https://events.test/api/events",
      local,
      session,
      now: Date.now,
      uuid: () => crypto.randomUUID(),
      send,
      blocked: () => blocked,
      acquisition: () => ({ channel: "x" as const }),
    };
    return {
      local,
      session,
      send,
      options,
      client: new AnalyticsClient(options),
      block: () => (blocked = true),
    };
  }
  it("does not create a persistent ID by default; survives reload, renews idle sessions, and rotates on consent changes", async () => {
    const s = setup();
    s.client.track("tab_viewed", { tab: "overview" });
    await s.client.flush();
    const first = JSON.parse(s.send.mock.calls[0][0]).events;
    expect(first).toHaveLength(2);
    expect(first[0].browserId).toBeUndefined();
    expect(s.local.values.size).toBe(0);
    const reloaded = new AnalyticsClient(s.options);
    reloaded.track("tab_viewed", { tab: "offers" });
    await reloaded.flush();
    expect(JSON.parse(s.send.mock.calls[1][0]).events[0].sessionId).toBe(
      first[0].sessionId
    );
    vi.setSystemTime(now + 1800001);
    reloaded.track("tab_viewed", { tab: "trends" });
    await reloaded.flush();
    expect(JSON.parse(s.send.mock.calls[2][0]).events[0].sessionId).not.toBe(
      first[0].sessionId
    );
    reloaded.setPreference("return");
    reloaded.track("tab_viewed", { tab: "offers" });
    await reloaded.flush();
    expect(
      JSON.parse(s.send.mock.calls[3][0]).events[0].browserId
    ).toBeTruthy();
    reloaded.setPreference("session");
    expect(
      [...s.local.values.keys()].some(key => key.includes("browser"))
    ).toBe(false);
    reloaded.track("tab_viewed", { tab: "offers" });
    await reloaded.flush();
    expect(
      JSON.parse(s.send.mock.calls[4][0]).events[0].browserId
    ).toBeUndefined();
  });
  it("honors disabled configuration, opt-out, privacy signals and storage errors without breaking interactions", async () => {
    const s = setup();
    s.client.setPreference("off");
    s.client.track("support_opened");
    await s.client.flush();
    expect(s.send).not.toHaveBeenCalled();
    s.client.setPreference("return");
    s.block();
    s.client.track("support_opened");
    await s.client.flush();
    expect(s.send).not.toHaveBeenCalled();
    const broken = {
      getItem() {
        throw Error("blocked");
      },
      setItem() {
        throw Error("blocked");
      },
      removeItem() {
        throw Error("blocked");
      },
    };
    const send = vi.fn(async (_body: string) => true);
    const memory = new AnalyticsClient({
      ...s.options,
      blocked: () => false,
      local: broken,
      session: broken,
      send,
    });
    expect(() => memory.track("support_opened")).not.toThrow();
    await memory.flush();
    expect(send).toHaveBeenCalledOnce();
    const disabled = new AnalyticsClient({ ...s.options, endpoint: "", send });
    disabled.track("support_opened");
    await disabled.flush();
    expect(send).toHaveBeenCalledOnce();
  });
  it("bounds retries, does not replay a queued identity after consent changes, and expires opt-in", async () => {
    const s = setup();
    s.send.mockImplementation(async () => false);
    s.client.track("support_opened");
    await s.client.flush();
    expect(s.send).toHaveBeenCalledTimes(2);
    s.client.setPreference("return");
    s.client.track("support_opened");
    s.client.setPreference("off");
    await s.client.flush();
    expect(s.send).toHaveBeenCalledTimes(2);
    s.client.setPreference("return");
    vi.setSystemTime(now + 91 * 86400000);
    expect(s.client.getPreference()).toBe("session");
  });
});

it("ingestion rejects wrong origins, oversized/invalid events, rate limits and database failures", async () => {
  const { db, sqlite } = analyticsDatabase();
  const pending: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (task: Promise<unknown>) => pending.push(task),
    passThroughOnException() {},
    props: {},
    exports: {},
  };
  const env: AnalyticsIngestEnv = {
    DB: db,
    SITE_ORIGIN: "https://site.test",
    SNAPSHOT_URL: "https://site.test/current.json",
    IP_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
    SESSION_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
  };
  const make = (body: string, origin = "https://site.test") =>
    new Request("https://events.test/api/events", {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "CF-Connecting-IP": "127.0.0.1",
      },
      body,
    });
  const row = event("support_opened", crypto.randomUUID(), 0);
  expect(
    (await ingest.fetch(make(JSON.stringify({ events: [row] })), env, ctx))
      .status
  ).toBe(204);
  expect(
    (await ingest.fetch(make(JSON.stringify({ events: [row] })), env, ctx))
      .status
  ).toBe(204);
  expect(sqlite.prepare("SELECT COUNT(*) n FROM events").get()?.n).toBe(1);
  expect(
    (await ingest.fetch(make("{}", "https://evil.test"), env, ctx)).status
  ).toBe(403);
  expect((await ingest.fetch(make("x".repeat(17000)), env, ctx)).status).toBe(
    400
  );
  expect((await ingest.fetch(make("{}"), env, ctx)).status).toBe(400);
  env.SESSION_LIMIT.limit = vi.fn(async () => ({ success: false }));
  expect(
    (await ingest.fetch(make(JSON.stringify({ events: [row] })), env, ctx))
      .status
  ).toBe(429);
  await Promise.all(pending);
  sqlite.close();
  env.SESSION_LIMIT.limit = vi.fn(async () => ({ success: true }));
  expect(
    (await ingest.fetch(make(JSON.stringify({ events: [row] })), env, ctx))
      .status
  ).toBe(503);
  await Promise.all(pending);
});

it("includes mature 30-day cohorts even when the report period is only seven days", async () => {
  const { db, sqlite } = analyticsDatabase();
  const browserId = crypto.randomUUID();
  for (const daysAgo of [36, 34]) {
    const row = {
      ...event(
        "session_started",
        crypto.randomUUID(),
        0,
        {},
        undefined,
        now - daysAgo * 86400000
      ),
      browserId,
    };
    await insertEvents(db, [row], "US", row.occurredAt);
  }
  const report = {
    summary: sqlite.prepare("SELECT * FROM product_summary_7d").get(),
    cohorts: sqlite.prepare("SELECT * FROM return_cohorts_30d").all(),
    zeroResults: sqlite.prepare("SELECT * FROM unmet_demand_30d").all(),
    providers: sqlite
      .prepare(
        "SELECT provider,outbound_actions AS clicks,sessions FROM provider_clicks_30d"
      )
      .all(),
  };
  expect(report.cohorts).toContainEqual({ days: 30, eligible: 1, returned: 1 });
  sqlite.close();
});

it("does not inflate search funnels with a completed search from a different context", async () => {
  const { db, sqlite } = analyticsDatabase(),
    session = crypto.randomUUID(),
    search = crypto.randomUUID();
  await insertEvents(
    db,
    [
      event("search_submitted", session, 0, {}, search),
      event(
        "results_viewed",
        session,
        1,
        { results: 1, freshResults: 0 },
        search
      ),
      event(
        "comparison_opened",
        session,
        2,
        { listings: 2 },
        crypto.randomUUID()
      ),
    ],
    "US",
    new Date(now - 500).toISOString()
  );
  const report = {
    summary: sqlite.prepare("SELECT * FROM product_summary_7d").get(),
    cohorts: sqlite.prepare("SELECT * FROM return_cohorts_30d").all(),
    zeroResults: sqlite.prepare("SELECT * FROM unmet_demand_30d").all(),
    providers: sqlite
      .prepare(
        "SELECT provider,outbound_actions AS clicks,sessions FROM provider_clicks_30d"
      )
      .all(),
  };
  expect(report.summary).toMatchObject({
    successful: 1,
    freshSuccessful: 0,
    comparedSessions: 0,
  });
  sqlite.close();
});

it("drops queued identity and refreshes cached consent after a choice changes in another tab", async () => {
  const local = new MemoryStorage(),
    send = vi.fn(async (_body: string) => true);
  const options = {
    endpoint: "https://events.test/api/events",
    local,
    session: new MemoryStorage(),
    now: Date.now,
    uuid: () => crypto.randomUUID(),
    send,
    blocked: () => false,
    acquisition: () => ({ channel: "direct" as const }),
  };
  const first = new AnalyticsClient(options),
    other = new AnalyticsClient({ ...options, session: new MemoryStorage() });
  first.setPreference("return");
  first.track("support_opened");
  other.setPreference("off");
  first.externalPreferenceChanged();
  first.track("support_opened");
  await first.flush();
  expect(send).not.toHaveBeenCalled();
  other.setPreference("session");
  first.externalPreferenceChanged();
  first.track("support_opened");
  await first.flush();
  const received = JSON.parse(send.mock.calls[0][0]).events;
  expect(received).toHaveLength(2);
  expect(received.every((event: ProductEvent) => !event.browserId)).toBe(true);
});
