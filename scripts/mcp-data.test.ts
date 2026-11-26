import { it, expect } from "vitest";
import { mcpSnapshotFiles, historyFileId } from "../shared/mcp-snapshot";
import { createPublishedData, sampleHistory } from "../mcp/data";
import { fixture, at, now } from "./fixtures/mcp";

it("publishes coherent, bounded, per-listing files without modifying source history", async () => {
  const snapshot = fixture(),
    base = snapshot.history[0];
  snapshot.history = Array.from({ length: 1000 }, (_, i) => ({
    ...base,
    observedAt: new Date(now - 1000 * 60000 + i * 60000).toISOString(),
    pricePerGpuHr: i === 500 ? 5 : 2,
    historyOrigin: "provider_hourly_last" as const,
  }));
  snapshot.history.push({ ...base, offerId: "other", pricePerGpuHr: 999 });
  const original = JSON.stringify(snapshot);
  const files = await mcpSnapshotFiles(snapshot);
  expect(JSON.stringify(snapshot)).toBe(original);
  const catalog = JSON.parse(
    files.find(f => f.name === "catalog.json")!.content
  );
  expect(catalog.history).toEqual([]);
  const nodeFile = `history/${await historyFileId("node")}.json`;
  const file = JSON.parse(files.find(f => f.name === nodeFile)!.content);
  const result = sampleHistory(file, at, now - 168 * 3600000, now, 10);
  expect(result.observations).toBe(1000);
  expect(result.points.length).toBeLessThanOrEqual(10);
  expect(result.highUsd).toBe(5);
  expect(result.lowUsd).toBe(2);
  expect(result.first?.priceUsd).toBe(2);
  expect(result.last?.priceUsd).toBe(2);
  expect(result.points.every(p => p.origin === "provider_hourly_last")).toBe(
    true
  );
  const cpuFile = `history/${await historyFileId("compute:cpu:a:cpu")}.json`;
  const cpu = files.find(f => f.name === cpuFile);
  expect(JSON.parse(cpu!.content).points).toEqual([]);
});
it("deduplicates observations like the website, excludes old history and rejects revision mismatch", async () => {
  const snapshot = fixture();
  snapshot.history.push({ ...snapshot.history[0], pricePerGpuHr: 5 });
  snapshot.history.push({
    ...snapshot.history[0],
    observedAt: new Date(now - 8 * 86400000).toISOString(),
  });
  const files = await mcpSnapshotFiles(snapshot);
  const nodeFile = `history/${await historyFileId("node")}.json`;
  const file = JSON.parse(files.find(f => f.name === nodeFile)!.content);
  expect(file.points).toHaveLength(1);
  expect(file.points[0].priceUsd).toBe(5);
  expect(() => sampleHistory(file, "old", 0, now, 2)).toThrow(
    "revisions differ"
  );
});
it("validates bounded catalog input and source failures without a success-shaped fallback", async () => {
  for (const response of [
    new Response("bad", { status: 503 }),
    new Response("{}"),
    new Response("{}", { headers: { "Content-Length": "4000001" } }),
  ])
    await expect(
      createPublishedData(async () => response).current()
    ).rejects.toThrow();
  const s = fixture();
  expect(
    (await createPublishedData(async () => Response.json(s)).current())
      .generatedAt
  ).toBe(at);
});
it("retrieves only the requested listing history and fails explicitly for missing or corrupt assets", async () => {
  const s = fixture();
  const files = await mcpSnapshotFiles(s);
  const requests: string[] = [];
  const data = createPublishedData(async url => {
    requests.push(String(url));
    const file = files.find(f => String(url).endsWith(f.name));
    return file
      ? new Response(file.content)
      : new Response(null, { status: 404 });
  });
  const result = await data.history(s, "node", now - 3600000, now, 20);
  expect(result.observations).toBe(1);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toContain(await historyFileId("node"));
  await expect(
    createPublishedData(
      async () => new Response(null, { status: 404 })
    ).history(s, "node", 0, now, 2)
  ).rejects.toThrow("unavailable");
  await expect(
    createPublishedData(async () =>
      Response.json({
        snapshotAt: at,
        points: [{ observedAt: at, priceUsd: -1, origin: "collector" }],
      })
    ).history(s, "node", 0, now, 2)
  ).rejects.toThrow();
});

it("rejects future-dated snapshots instead of treating them as fresh", async () => {
  const snapshot = fixture();
  snapshot.generatedAt = new Date(Date.now() + 86400000).toISOString();
  await expect(
    createPublishedData(async () => Response.json(snapshot)).current()
  ).rejects.toThrow("future");
});
