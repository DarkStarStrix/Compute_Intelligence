import { useEffect, useRef } from "react";
import { analytics, track } from "@/lib/analytics";
import type { AnalyticsProperties } from "@shared/analytics";
import type { OfferFilters } from "@/lib/view-link";

/** Measure user-committed filtering, never polling, pagination, or hidden retained tables. */
export function useAnalyticsSearch(
  filters: OfferFilters,
  active: boolean,
  intent: number,
  counts: { total: number; fresh: number; startedAt?: number },
  kind: AnalyticsProperties["kind"]
) {
  const signature = JSON.stringify(filters);
  const committed = useRef<string | undefined>(intent ? undefined : signature);
  const latest = useRef({ filters, counts });
  latest.current = { filters, counts };
  const pending = useRef<{ signature: string; start: number }>({
    signature,
    start: performance.now(),
  });
  if (pending.current.signature !== signature)
    pending.current = { signature, start: performance.now() };
  useEffect(() => {
    if (!active || !intent || committed.current === signature) return;
    const latencyMs = Math.max(
      0,
      performance.now() -
        (latest.current.counts.startedAt ?? pending.current.start)
    );
    const timeout = setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      committed.current = signature;
      const { filters: f, counts: c } = latest.current;
      const id = analytics().newSearch();
      const properties: AnalyticsProperties = {
        kind,
        source: "offers",
        model: f.gpuModel || undefined,
        provider: f.provider || undefined,
        region: f.region || undefined,
        billing: (f.billing as AnalyticsProperties["billing"]) || undefined,
        tier: f.cloud || undefined,
        stock: (f.availability as AnalyticsProperties["stock"]) || undefined,
        query: f.search.trim() ? "text" : "none",
        maxPrice:
          f.maxPrice &&
          Number.isFinite(Number(f.maxPrice)) &&
          Number(f.maxPrice) >= 0
            ? Number(f.maxPrice)
            : undefined,
      };
      track("search_submitted", properties, id);
      track(
        "results_viewed",
        {
          ...properties,
          results: c.total,
          freshResults: c.fresh,
          latencyMs,
        },
        id
      );
    }, 500);
    return () => clearTimeout(timeout);
  }, [signature, active, intent, kind]);
}
