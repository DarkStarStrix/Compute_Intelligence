import { it, expect } from "vitest";
import { mcpSnapshotFiles, historyFileId } from "../shared/mcp-snapshot";
import { snapshotSchema } from "../shared/catalog";
import { collect } from "./collect";
import { parseRunpod } from "./providers";
import runpod from "./fixtures/runpod.json";
const at = "2026-11-26T23:00:00.000Z",
  now = Date.parse(at);
async function sample() {
  const offers = parseRunpod(runpod, at);
  const snapshot = await collect(
    null,
    [
      {
        id: "runpod",
        name: "RunPod",
        configured: true,
        connected: true,
        fetch: async () => ({ offers }),
      },
    ],
    at
  );
  snapshot.compute = [
    {
      providerId: "cpu",
      providerName: "CPU provider",
      url: "https://cpu.example/prices",
      status: "ok",
      observedAt: at,
      rates: [
        {
          id: "small",
          kind: "cpu",
          model: "4 vCPU",
          billing: "on-demand",
          price: 0.2,
          availability: "unknown",
        },
      ],
    },
  ];
  return snapshot;
}
it("exports one coherent catalog and a history file for each GPU/compute listing", async () => {
  const s = await sample(),
    original = JSON.stringify(s),
    files = await mcpSnapshotFiles(s);
  const catalog = snapshotSchema.parse(JSON.parse(files[0].content));
  expect(catalog.generatedAt).toBe(at);
  expect(catalog.offers).toEqual(s.offers);
  expect(catalog.compute).toEqual(s.compute);
  expect(catalog.history).toEqual([]);
  expect(files.length).toBe(s.offers.length + 2);
  const name = `history/${await historyFileId("compute:cpu:cpu:small")}.json`;
  expect(JSON.parse(files.find(f => f.name === name)!.content)).toEqual({
    snapshotAt: at,
    points: [],
  });
  expect(JSON.stringify(s)).toBe(original);
});
it("keeps recorded movement and origins, deduplicates timestamps and excludes old samples", async () => {
  const s = await sample(),
    p = s.history[0];
  s.history = [
    {
      ...p,
      observedAt: new Date(now - 8 * 86400000).toISOString(),
      pricePerGpuHr: 99,
    },
    {
      ...p,
      observedAt: new Date(now - 3600000).toISOString(),
      pricePerGpuHr: 2,
      historyOrigin: "provider_hourly_last",
    },
    { ...p, pricePerGpuHr: 5 },
    { ...p, pricePerGpuHr: 2 },
  ];
  const name = `history/${await historyFileId(p.offerId)}.json`,
    files = await mcpSnapshotFiles(s);
  const h = JSON.parse(files.find(f => f.name === name)!.content);
  expect(h.points.map((p: { priceUsd: number }) => p.priceUsd)).toEqual([2, 2]);
  expect(h.points[0].origin).toBe("provider_hourly_last");
  s.sources[0].status = "error";
  expect(
    JSON.parse((await mcpSnapshotFiles(s))[0].content).sources[0].status
  ).toBe("error");
});
it("uses stable safe filenames for arbitrary listing identifiers", async () => {
  const first = await historyFileId("compute:cpu:provider:a/b?x=λ");
  expect(first).toMatch(/^[a-f0-9]{64}$/);
  expect(await historyFileId("compute:cpu:provider:a/b?x=λ")).toBe(first);
  expect(await historyFileId("different")).not.toBe(first);
});
