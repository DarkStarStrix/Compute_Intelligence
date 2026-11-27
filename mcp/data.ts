import { z } from "zod";
import { snapshotSchema, type Snapshot } from "../shared/catalog";
import { readBounded, type BoundedBody } from "../analytics/http";
import { historyFileId } from "../shared/mcp-snapshot";
import { pointOutput } from "./contracts";
import { ComputeError, type ComputeData, type HistoryResult } from "./service";

const historyFileSchema = z.object({
  snapshotAt: z.string().datetime(),
  points: z.array(pointOutput).max(20000),
});
export function sampleHistory(
  file: z.infer<typeof historyFileSchema>,
  snapshotAt: string,
  since: number,
  until: number,
  maxPoints: number
): HistoryResult {
  if (file.snapshotAt !== snapshotAt)
    throw new ComputeError(
      "snapshot_changed",
      "Catalog and history revisions differ; retry shortly."
    );
  const points = file.points
    .filter(p => {
      const t = Date.parse(p.observedAt);
      if (!Number.isFinite(t) || t > Date.parse(snapshotAt))
        throw new ComputeError("invalid_history", "Invalid history timestamp.");
      return t >= since && t <= until;
    })
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const first = points[0] ?? null,
    last = points.at(-1) ?? null;
  const buckets = new Map<number, HistoryResult["points"][number]>();
  if (points.length <= maxPoints) points.forEach((p, i) => buckets.set(i, p));
  else if (maxPoints > 2)
    for (const p of points) {
      const bucket = Math.min(
        maxPoints - 3,
        Math.floor(
          ((Date.parse(p.observedAt) - since) / Math.max(1, until - since)) *
            (maxPoints - 2)
        )
      );
      buckets.set(bucket, p);
    }
  const selected = [...buckets.values()];
  if (first) selected.push(first);
  if (last) selected.push(last);
  return {
    snapshotAt,
    points: [...new Map(selected.map(p => [p.observedAt, p])).values()].sort(
      (a, b) => a.observedAt.localeCompare(b.observedAt)
    ),
    observations: points.length,
    first,
    last,
    highUsd: points.length ? Math.max(...points.map(p => p.priceUsd)) : null,
    lowUsd: points.length ? Math.min(...points.map(p => p.priceUsd)) : null,
  };
}
type DataFetch = (
  url: string,
  init?: RequestInit
) => Promise<BoundedBody & { ok: boolean }>;

// Fixed published data root; callers cannot supply arbitrary upstream URLs.
export function createPublishedData(
  fetcher: DataFetch = fetch,
  baseUrl = "https://darkstarstrix.github.io/gpu-price-tracker/data/mcp/"
): ComputeData {
  async function get(file: string, maxBytes: number) {
    const options = {
      signal: AbortSignal.timeout(15000),
      redirect: "manual" as const,
      headers: { Accept: "application/json" },
      cf: { cacheTtl: 60, cacheEverything: true },
    };
    const response = await fetcher(baseUrl + file, options);
    if (!response.ok) {
      await response.body?.cancel();
      throw new ComputeError(
        "source_unavailable",
        "Published compute data is unavailable."
      );
    }
    return JSON.parse(await readBounded(response, maxBytes));
  }
  return {
    mode: "published-snapshot",
    async current(refresh = false): Promise<Snapshot> {
      const snapshot = snapshotSchema.parse(
        await get(
          `catalog.json?poll=${Math.floor(Date.now() / 60000)}${refresh ? `&retry=${crypto.randomUUID()}` : ""}`,
          4000000
        )
      );
      if (Date.parse(snapshot.generatedAt) > Date.now() + 60000)
        throw new ComputeError(
          "invalid_snapshot",
          "Snapshot publication time is in the future."
        );
      return snapshot;
    },
    async history(snapshot, id, since, until, maxPoints) {
      return sampleHistory(
        historyFileSchema.parse(
          await get(
            `history/${await historyFileId(id)}.json?revision=${encodeURIComponent(snapshot.generatedAt)}`,
            2000000
          )
        ),
        snapshot.generatedAt,
        since,
        until,
        maxPoints
      );
    },
  };
}
