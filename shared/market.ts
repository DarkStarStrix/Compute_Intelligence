import { isCurrent, type Snapshot } from "./catalog";
export function marketOffers(
  snapshot: Snapshot,
  gpu: string,
  billing: string,
  now = Date.now()
) {
  return snapshot.offers
    .filter(
      o =>
        o.gpuModelId === gpu &&
        (o.billingModel ?? "on-demand") === billing &&
        isCurrent(snapshot, o, now)
    )
    .sort(
      (a, b) =>
        a.pricePerGpuHr - b.pricePerGpuHr || a.offerId.localeCompare(b.offerId)
    );
}
export function h100Quote(
  snapshot: Snapshot,
  billing = "on-demand",
  now = Date.now()
) {
  return marketOffers(snapshot, "h100-sxm", billing, now).find(
    o => o.availability !== "unavailable"
  );
}
type MarketPoint = {
  time: number;
  price: number;
  origin: "collector" | "provider_hourly_last";
};

function marketSeriesByOffer(
  snapshot: Snapshot,
  ids: string[],
  since: number,
  until: number
) {
  const series = new Map(ids.map(id => [id, new Map<number, MarketPoint>()]));
  for (const point of snapshot.history) {
    const values = series.get(point.offerId);
    if (!values) continue;
    const time = Date.parse(point.observedAt);
    if (time < since || time > until) continue;
    values.set(time, {
      time,
      price: point.pricePerGpuHr,
      origin: point.historyOrigin ?? "collector",
    });
  }
  return new Map(
    [...series].map(([id, values]) => [
      id,
      [...values.values()].sort((a, b) => a.time - b.time),
    ])
  );
}

export function marketSeries(
  snapshot: Snapshot,
  offerId: string,
  since: number,
  until = Date.now()
) {
  return marketSeriesByOffer(snapshot, [offerId], since, until).get(offerId)!;
}

export type NormalizedProviderSeries = {
  providerId: string;
  times: number[];
  values: number[];
  first: number;
  last: number;
};

/**
 * Compare provider price direction without letting different absolute price
 * levels dominate the chart. Each provider starts at 100, using the median
 * price of its matching listings at each observation time.
 */
export function normalizedProviderSeries(
  snapshot: Snapshot,
  offerIds: Set<string>,
  since: number,
  until: number
): NormalizedProviderSeries[] {
  const grouped = new Map<string, Map<number, number[]>>();
  for (const point of snapshot.history) {
    if (!offerIds.has(point.offerId)) continue;
    const time = Date.parse(point.observedAt);
    if (!Number.isFinite(time) || time < since || time > until) continue;
    const byTime = grouped.get(point.providerId) ?? new Map<number, number[]>();
    const prices = byTime.get(time) ?? [];
    prices.push(point.pricePerGpuHr);
    byTime.set(time, prices);
    grouped.set(point.providerId, byTime);
  }

  return [...grouped]
    .map(([providerId, byTime]) => {
      const raw = [...byTime]
        .sort(([a], [b]) => a - b)
        .map(([time, prices]) => {
          const sorted = [...prices].sort((a, b) => a - b);
          return {
            time,
            price: sorted[Math.floor(sorted.length / 2)],
          };
        });
      const first = raw[0]?.price;
      if (!first) return null;
      return {
        providerId,
        times: raw.map(point => point.time),
        values: raw.map(point => (point.price / first) * 100),
        first,
        last: raw.at(-1)!.price,
      };
    })
    .filter((series): series is NormalizedProviderSeries => series !== null)
    .filter(series => series.times.length > 1)
    .sort((a, b) => a.providerId.localeCompare(b.providerId));
}
export function marketStats(points: { price: number }[]) {
  if (!points.length) return null;
  const first = points[0].price,
    last = points.at(-1)!.price;
  return {
    first,
    last,
    change: last - first,
    percent: ((last - first) / first) * 100,
    high: Math.max(...points.map(p => p.price)),
    low: Math.min(...points.map(p => p.price)),
    count: points.length,
  };
}

export function movingListingIds(
  snapshot: Snapshot,
  since: number,
  until: number
) {
  const prices = new Map<string, Map<number, number>>();
  for (const point of snapshot.history) {
    const time = Date.parse(point.observedAt);
    if (time < since || time > until) continue;
    let listing = prices.get(point.offerId);
    if (!listing) {
      listing = new Map();
      prices.set(point.offerId, listing);
    }
    // Match marketSeries when observations share a timestamp.
    listing.set(time, point.pricePerGpuHr);
  }

  const moved = new Set<string>();
  for (const [id, observations] of prices) {
    const first = observations.values().next().value;
    for (const price of observations.values()) {
      if (price !== first) {
        moved.add(id);
        break;
      }
    }
  }
  return moved;
}

export function priceHistorySummary(
  snapshot: Snapshot,
  offerId: string,
  now = Date.now()
) {
  return priceHistorySummaries(snapshot, [offerId], now).get(offerId)!;
}

export function priceHistorySummaries(
  snapshot: Snapshot,
  ids: string[],
  now = Date.now()
) {
  if (!ids.length) return new Map<string, ReturnType<typeof summarizeSeries>>();
  const series = marketSeriesByOffer(snapshot, ids, now - 7 * 86400_000, now);
  return new Map(
    [...series].map(([id, points]) => [id, summarizeSeries(points)])
  );
}

function summarizeSeries(points: MarketPoint[]) {
  const stats = marketStats(points);
  return {
    stats,
    firstAt: points[0]?.time,
    lastAt: points.at(-1)?.time,
    state: !stats
      ? ("empty" as const)
      : stats.count < 2
        ? ("collecting" as const)
        : Math.abs(stats.high - stats.low) < 0.000001
          ? ("unchanged" as const)
          : ("changed" as const),
  };
}

/** Prefer current quotes; retain an explicitly labeled last observation during missed refreshes. */
export function displayQuote(
  snapshot: Snapshot,
  gpu: string,
  billing = "on-demand",
  now = Date.now()
) {
  const eligible = snapshot.offers.filter(
    o =>
      o.gpuModelId === gpu &&
      (o.billingModel ?? "on-demand") === billing &&
      o.availability !== "unavailable"
  );
  const fresh = eligible.filter(o => isCurrent(snapshot, o, now));
  const offer = [...(fresh.length ? fresh : eligible)].sort(
    (a, b) =>
      a.pricePerGpuHr - b.pricePerGpuHr || a.offerId.localeCompare(b.offerId)
  )[0];
  return offer
    ? { offer, retained: !isCurrent(snapshot, offer, now) }
    : undefined;
}
