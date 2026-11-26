import { computeListings, type Snapshot } from "./catalog";

// Derived artifacts only. The collector and durable source snapshot remain authoritative.
export async function mcpSnapshotFiles(snapshot: Snapshot) {
  const since = Date.parse(snapshot.generatedAt) - 7 * 86400000;
  const histories = new Map<
    string,
    {
      observedAt: string;
      priceUsd: number;
      origin: "collector" | "provider_hourly_last";
    }[]
  >();
  for (const p of snapshot.history) {
    if (Date.parse(p.observedAt) < since) continue;
    let points = histories.get(p.offerId);
    if (!points) {
      points = [];
      histories.set(p.offerId, points);
    }
    points.push({
      observedAt: p.observedAt,
      priceUsd: p.pricePerGpuHr,
      origin: p.historyOrigin ?? "collector",
    });
  }
  const files = [
    {
      name: "catalog.json",
      content: JSON.stringify({
        ...snapshot,
        history: [],
        poolHistory: undefined,
      }),
    },
  ];
  const ids = [...snapshot.offers, ...computeListings(snapshot)].map(
    o => o.offerId
  );
  for (const id of ids) {
    const hash = await historyFileId(id);
    // Match the website's last observation at each timestamp, without interpolation.
    const points = [
      ...new Map(
        (histories.get(id) ?? []).map(p => [p.observedAt, p])
      ).values(),
    ].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    files.push({
      name: `history/${hash}.json`,
      content: JSON.stringify({ snapshotAt: snapshot.generatedAt, points }),
    });
  }
  return files;
}
export async function historyFileId(id: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(id)
  );
  return [...new Uint8Array(bytes)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}
