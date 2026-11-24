import { expect, it, vi } from "vitest";
import { analyticsDatabase } from "./analytics-sqlite";
import { insertEvents } from "../analytics/store";
import type { ProductEvent } from "../shared/analytics";

it("logs only committed visits and provider clicks once, without identifiers or raw payloads", async () => {
  const { db, sqlite } = analyticsDatabase();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const at = new Date().toISOString();
  const sessionId = crypto.randomUUID();
  const rows: ProductEvent[] = [
    { event: "session_started", properties: {} },
    { event: "provider_outbound_click", properties: { provider: "runpod" } },
    { event: "support_opened", properties: {} },
  ].map(
    (value, sequence) =>
      ({
        ...value,
        version: 1,
        eventId: crypto.randomUUID(),
        sessionId,
        sequence,
        occurredAt: at,
        acquisition: { channel: "x", referrer: "t.co" },
      }) as ProductEvent
  );
  try {
    expect(await insertEvents(db, rows, "US", at)).toBe(3);
    expect(await insertEvents(db, rows, "US", at)).toBe(0);
    expect(log.mock.calls).toEqual([
      [{ metric: "compute_visit", channel: "x" }],
      [{ metric: "compute_provider_click", provider: "runpod" }],
    ]);
    sqlite.close();
    await expect(insertEvents(db, rows, "US", at)).rejects.toThrow();
    expect(log).toHaveBeenCalledTimes(2);
  } finally {
    log.mockRestore();
    if (sqlite.isOpen) sqlite.close();
  }
});

it("native Cloudflare console views preserve ordered session funnels and separate commercial actions", async () => {
  const { db, sqlite } = analyticsDatabase();
  const sessionId = crypto.randomUUID(),
    searchId = crypto.randomUUID(),
    at = new Date(Date.now() - 1000).toISOString();
  const rows: ProductEvent[] = [
    {
      event: "search_submitted",
      properties: { kind: "gpu", model: "h100-sxm" },
    },
    {
      event: "results_viewed",
      properties: { kind: "gpu", results: 0, freshResults: 0 },
    },
    { event: "comparison_opened", properties: { listings: 2 } },
    { event: "provider_outbound_click", properties: { provider: "runpod" } },
    { event: "provider_outbound_click", properties: { provider: "runpod" } },
    { event: "commercial_link_clicked", properties: { action: "referral" } },
  ].map(
    (value, sequence) =>
      ({
        ...value,
        version: 1,
        eventId: crypto.randomUUID(),
        sessionId,
        searchId,
        sequence,
        occurredAt: at,
        acquisition: { channel: "x" },
      }) as ProductEvent
  );
  await insertEvents(db, rows, "US", at);
  const summary = sqlite.prepare("SELECT * FROM product_summary_7d").get();
  expect(summary).toMatchObject({
    sessions: 1,
    engaged: 1,
    searchedSessions: 1,
    successful: 0,
    comparedSessions: 1,
    outboundSessions: 1,
    outboundActions: 2,
    commercialActions: 1,
  });
  expect(
    sqlite.prepare("SELECT * FROM provider_clicks_30d").all()
  ).toMatchObject([{ provider: "runpod", outbound_actions: 2, sessions: 1 }]);
  expect(sqlite.prepare("SELECT * FROM unmet_demand_30d").all()).toMatchObject([
    { compute: "gpu", searches: 1 },
  ]);
  expect(sqlite.prepare("SELECT * FROM acquisition_30d").all()).toMatchObject([
    { channel: "x", sessions: 1 },
  ]);
  expect(
    sqlite.prepare("SELECT * FROM commercial_actions_30d").all()
  ).toMatchObject([{ action: "referral", clicks: 1 }]);
  expect(
    sqlite.prepare("SELECT * FROM collection_health").get()?.last_received_event
  ).toBe(at);
  sqlite.close();
});
