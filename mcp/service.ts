import {
  computeListings,
  isCurrent,
  listingUnit,
  type Listing,
  type Snapshot,
} from "../shared/catalog";
import { estimateJobCost } from "../shared/job-cost";
import { computeKinds } from "../shared/compute";
import type { z } from "zod";
import {
  compareInput,
  costInput,
  historyInput,
  searchInput,
  type OfferView,
  type searchOutput,
  searchFilterKeys,
  comparisonBlocker,
} from "./contracts";

export class ComputeError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}
export interface HistoryResult {
  snapshotAt: string;
  points: {
    observedAt: string;
    priceUsd: number;
    origin: "collector" | "provider_hourly_last";
  }[];
  observations: number;
  highUsd: number | null;
  lowUsd: number | null;
  first: HistoryResult["points"][number] | null;
  last: HistoryResult["points"][number] | null;
}
export interface ComputeData {
  mode: "published-snapshot";
  current(refresh?: boolean): Promise<Snapshot>;
  history(
    snapshot: Snapshot,
    offerId: string,
    since: number,
    until: number,
    maxPoints: number
  ): Promise<HistoryResult>;
}
const caveat =
  "Observed prices are indicative. Verify stock and final billing with the provider; equal specifications do not establish equal performance.";
function listings(s: Snapshot): Listing[] {
  return [...s.offers, ...computeListings(s)];
}
export function offerView(s: Snapshot, o: Listing, now: number): OfferView {
  const current = isCurrent(s, o, now);
  return {
    offerId: o.offerId,
    kind: o.kind ?? "gpu",
    model: o.gpuModelName,
    gpuModelId: o.kind ? null : o.gpuModelId,
    providerId: o.providerId,
    providerName: o.providerName,
    region: o.region,
    cloudType: o.cloudType,
    billing: o.billingModel ?? "on-demand",
    billingAssumed: o.billingModel === undefined,
    gpuCount: o.gpuCount,
    minRentalGpus: o.kind ? null : (o.minRentalGpus ?? o.gpuCount),
    configurationKnown: o.configurationKnown !== false,
    vramPerGpuGb: o.vramPerGpuGb,
    vcpus: o.vcpus,
    ramGb: o.ramGb,
    unit: listingUnit(o.kind),
    unitPriceUsd: o.pricePerGpuHr,
    nodePriceUsdPerHour: o.kind ? null : o.totalNodePriceHr,
    availability: current ? o.availability : "unknown",
    reportedAvailability: o.availability,
    current,
    observedAt: o.observedAt,
    ageSeconds: Math.max(
      0,
      Math.floor((now - Date.parse(o.observedAt)) / 1000)
    ),
    providerUrl: o.providerLink,
    sourceUrl: o.sourceUrl,
    dataSource: o.dataSource,
    terms: o.kind ? (o.terms ?? null) : null,
  };
}
function find(s: Snapshot, id: string) {
  const o = listings(s).find(o => o.offerId === id);
  if (!o)
    throw new ComputeError(
      "offer_not_found",
      "No listing with this ID in the current catalog. Search again; listing IDs can disappear."
    );
  return o;
}
function meta(
  s: Snapshot,
  now: number,
  offers: OfferView[],
  dataMode: ComputeData["mode"]
) {
  const warnings = [caveat];
  if (offers.some(o => !o.current))
    warnings.push(
      "Some quotes are retained or stale; availability is unknown for those quotes."
    );
  if (offers.some(o => o.availability === "unavailable"))
    warnings.push(
      "Some quotes explicitly report unavailable stock; a current price is not a capacity offer."
    );
  if (offers.some(o => o.availability === "unknown"))
    warnings.push(
      "Stock is not established for some quotes; unknown does not mean available."
    );
  if (offers.some(o => o.billingAssumed))
    warnings.push(
      "Some sources omit billing model; on-demand follows the site's existing default."
    );
  return {
    dataMode,
    snapshotAt: s.generatedAt,
    evaluatedAt: new Date(now).toISOString(),
    warnings,
  };
}
export function createComputeService(data: ComputeData, clock = Date.now) {
  return {
    async search(args: z.infer<typeof searchInput>) {
      const s = await data.current(),
        now = clock();
      const terms = args.query?.toLowerCase().split(/\s+/) ?? [];
      const all = listings(s);
      const candidates = all
        .filter(o => (o.kind ?? "gpu") === args.kind)
        .map(o => offerView(s, o, now));
      // Counts are independent: one listing can fail several filters. Never relax a filter.
      function checks(
        o: OfferView
      ): Record<(typeof searchFilterKeys)[number], boolean> {
        const knownCount = o.configurationKnown ? o.gpuCount : null;
        return {
          freshness: args.includeStale || o.current,
          query: terms.every(t =>
            `${o.model} ${o.gpuModelId ?? ""} ${o.providerName} ${o.region}`
              .toLowerCase()
              .includes(t)
          ),
          gpuModelId: !args.gpuModelId || o.gpuModelId === args.gpuModelId,
          minGpuCount:
            args.minGpuCount === undefined ||
            (knownCount !== null && knownCount >= args.minGpuCount),
          maxGpuCount:
            args.maxGpuCount === undefined ||
            (knownCount !== null && knownCount <= args.maxGpuCount),
          providerId: !args.providerId || o.providerId === args.providerId,
          region:
            !args.region ||
            o.region.toLowerCase() === args.region.toLowerCase(),
          billing: !args.billing || o.billing === args.billing,
          cloudType: !args.cloudType || o.cloudType === args.cloudType,
          availability:
            !args.availability || o.availability === args.availability,
          minVramGb:
            args.minVramGb === undefined ||
            (o.vramPerGpuGb !== null && o.vramPerGpuGb >= args.minVramGb),
          minVcpus:
            args.minVcpus === undefined ||
            (o.vcpus !== null && o.vcpus >= args.minVcpus),
          minRamGb:
            args.minRamGb === undefined ||
            (o.ramGb !== null && o.ramGb >= args.minRamGb),
          maxUnitPriceUsd:
            args.maxUnitPriceUsd === undefined ||
            o.unitPriceUsd <= args.maxUnitPriceUsd,
        };
      }
      const evaluated = candidates.map(offer => ({
        offer,
        checks: checks(offer),
      }));
      const matches = (values: ReturnType<typeof checks>, allowStale = false) =>
        searchFilterKeys.every(
          key => (allowStale && key === "freshness") || values[key]
        );
      const offers = evaluated
        .filter(e => matches(e.checks))
        .map(e => e.offer)
        .sort(
          (a, b) =>
            a.unitPriceUsd - b.unitPriceUsd ||
            a.offerId.localeCompare(b.offerId)
        );
      const matchingStaleListings = evaluated.filter(
        e => !e.offer.current && matches(e.checks, true)
      ).length;
      const currentListings = candidates.filter(o => o.current).length;
      const reason: z.infer<typeof searchOutput>["diagnostics"]["reason"] =
        offers.length
          ? args.offset >= offers.length
            ? "page_out_of_range"
            : "results"
          : !all.length
            ? "empty_catalog"
            : !candidates.length
              ? "no_listings_for_kind"
              : !args.includeStale && matchingStaleListings
                ? "only_stale_matches"
                : !args.includeStale && !currentListings
                  ? "no_current_listings"
                  : "no_filter_matches";
      const suggestions: string[] = [];
      if (reason === "page_out_of_range")
        suggestions.push(
          "Reset offset to 0; the catalog may have changed since the previous page."
        );
      if (reason === "only_stale_matches" || reason === "no_current_listings")
        suggestions.push(
          "Wait for successful source collection. includeStale:true can show retained quotes, with unknown effective stock; they are not current offers."
        );
      if (reason === "no_filter_matches") {
        suggestions.push(
          "No listing satisfies all supplied filters. Change constraints explicitly; none were relaxed."
        );
        if (args.region)
          suggestions.push(
            "Region must match an exact provider-reported name; broad geography is not inferred."
          );
      }
      if (reason === "empty_catalog" || reason === "no_listings_for_kind")
        suggestions.push(
          "The published catalog has no listings in this scope. This does not establish that providers offer no such compute."
        );
      const page = offers.slice(args.offset, args.offset + args.limit);
      return {
        ...meta(s, now, page, data.mode),
        unit: args.kind === "gpu" ? "GPU-hour" : computeKinds[args.kind].unit,
        offers: page,
        appliedFilters: args,
        diagnostics: {
          reason,
          kindListings: candidates.length,
          currentListings,
          matchingStaleListings,
          missingRequiredSpecs: candidates.filter(
            o =>
              ((args.minGpuCount !== undefined ||
                args.maxGpuCount !== undefined) &&
                (!o.configurationKnown || o.gpuCount === null)) ||
              (args.minVramGb !== undefined && o.vramPerGpuGb === null) ||
              (args.minVcpus !== undefined && o.vcpus === null) ||
              (args.minRamGb !== undefined && o.ramGb === null)
          ).length,
          rejectedByFilter: Object.fromEntries(
            searchFilterKeys.map(key => [
              key,
              evaluated.filter(e => !e.checks[key]).length,
            ])
          ) as Record<(typeof searchFilterKeys)[number], number>,
          suggestions,
        },
        total: offers.length,
        nextOffset:
          args.offset + page.length < offers.length
            ? args.offset + page.length
            : null,
        ranking:
          "Ascending observed USD per stated unit, then listing ID; no commercial weighting. Filters are strict; no inferred regions or relaxed requirements.",
      };
    },
    async detail(id: string) {
      const s = await data.current(),
        now = clock(),
        offer = offerView(s, find(s, id), now);
      return { ...meta(s, now, [offer], data.mode), offer };
    },
    async compare(args: z.infer<typeof compareInput>) {
      const s = await data.current(),
        now = clock();
      const offers = args.offerIds.map(id => offerView(s, find(s, id), now));
      const comparableUnit = new Set(offers.map(o => o.unit)).size === 1;
      const comparisonBlockers: z.infer<typeof comparisonBlocker>[] = [];
      if (!comparableUnit) comparisonBlockers.push("different_units");
      if (
        new Set(offers.map(o => `${o.kind}:${o.gpuModelId ?? o.model}`))
          .size !== 1
      )
        comparisonBlockers.push("different_models");
      // The collector intentionally preserves unspecified H100/H200 and A100 variants.
      if (
        offers.some(
          o =>
            o.kind === "gpu" &&
            (!o.gpuModelId ||
              /unknown|unspecified/.test(o.gpuModelId) ||
              /^a100-\d+$/.test(o.gpuModelId))
        )
      )
        comparisonBlockers.push("unknown_model_variant");
      if (new Set(offers.map(o => o.billing)).size !== 1)
        comparisonBlockers.push("different_billing");
      if (offers.some(o => !o.current)) comparisonBlockers.push("stale_quotes");
      if (offers.some(o => o.availability === "unavailable"))
        comparisonBlockers.push("unavailable");
      const requiredSpecs = (o: OfferView) =>
        o.kind === "gpu"
          ? [o.vramPerGpuGb]
          : o.kind === "tpu"
            ? []
            : [o.vcpus, o.ramGb];
      if (
        offers.some(
          o => !o.configurationKnown || requiredSpecs(o).some(v => v === null)
        )
      )
        comparisonBlockers.push("unknown_configuration");
      if (new Set(offers.map(o => JSON.stringify(requiredSpecs(o)))).size !== 1)
        comparisonBlockers.push("different_specs");
      const warnings = meta(s, now, offers, data.mode);
      warnings.warnings.push(
        "GPU unit prices can require renting a whole node. Compare node price, minimum rental, configuration and billing model before choosing."
      );
      if (!comparableUnit)
        warnings.warnings.push(
          "These offers have different units; no cheapest offer is selected."
        );
      return {
        ...warnings,
        offers,
        comparableUnit,
        comparisonBlockers,
        cheapestOfferId:
          comparisonBlockers.length === 0
            ? [...offers].sort(
                (a, b) =>
                  a.unitPriceUsd - b.unitPriceUsd ||
                  a.offerId.localeCompare(b.offerId)
              )[0].offerId
            : null,
      };
    },
    async cost(args: z.infer<typeof costInput>) {
      const s = await data.current(),
        now = clock(),
        raw = find(s, args.offerId),
        offer = offerView(s, raw, now);
      const cost = estimateJobCost(raw, args.count, args.hours);
      if (!cost)
        throw new ComputeError(
          "invalid_estimate",
          "Unable to calculate a finite compute cost."
        );
      const assumptions = [
        offer.kind === "gpu"
          ? "Count is the requested number of GPUs; minimum rental and node size are applied."
          : `Count is the requested number of ${offer.unit.replace("-hour", "")} units at the quoted configuration.`,
      ];
      if (!offer.configurationKnown)
        assumptions.push(
          "Configuration is unknown: this is a per-unit approximation; actual minimum rental may be larger."
        );
      if (offer.billing === "spot")
        assumptions.push(
          "Spot rate is held constant for this estimate; interruptions, price changes and restart time can increase cost."
        );
      if (offer.terms) assumptions.push(offer.terms);
      return {
        ...meta(s, now, [offer], data.mode),
        offer,
        requestedCount: args.count,
        hours: args.hours,
        totalUsd: cost.total,
        nodes: cost.nodes,
        billedGpus: cost.billedGpus,
        estimateOnly: true as const,
        assumptions,
        exclusions: [
          "Taxes",
          "Storage and network charges not included in the quoted configuration",
          "Subscription or plan fees",
          "Discounts, allowances and commitment terms not represented by this listing",
          "Billing granularity and minimum runtime not represented by this listing",
        ],
      };
    },
    async history(args: z.infer<typeof historyInput>) {
      const now = clock();
      let s = await data.current();
      let offer = offerView(s, find(s, args.offerId), now);
      let until = Math.min(now, Date.parse(s.generatedAt));
      let since = until - args.hours * 3600000;
      let h: HistoryResult;
      try {
        h = await data.history(s, args.offerId, since, until, args.maxPoints);
      } catch (error) {
        if (
          !(error instanceof ComputeError) ||
          error.code !== "snapshot_changed"
        )
          throw error;
        s = await data.current(true);
        offer = offerView(s, find(s, args.offerId), now);
        until = Math.min(now, Date.parse(s.generatedAt));
        since = until - args.hours * 3600000;
        h = await data.history(s, args.offerId, since, until, args.maxPoints);
      }
      if (h.snapshotAt !== s.generatedAt)
        throw new ComputeError(
          "snapshot_changed",
          "Catalog and history revisions differ. Retry after publication completes."
        );
      return {
        ...meta(s, now, [offer], data.mode),
        offer,
        since: new Date(since).toISOString(),
        until: new Date(until).toISOString(),
        points: h.points,
        observations: h.observations,
        sampled: h.observations > h.points.length,
        firstObservedAt: h.first?.observedAt ?? null,
        lastObservedAt: h.last?.observedAt ?? null,
        highUsd: h.highUsd,
        lowUsd: h.lowUsd,
        changePercent:
          h.first && h.last
            ? ((h.last.priceUsd - h.first.priceUsd) / h.first.priceUsd) * 100
            : null,
        warnings: [
          ...meta(s, now, [offer], data.mode).warnings,
          "Only recorded observations are returned; gaps are not filled. When sampled, at most one real observation per time bucket is returned plus the first and last. History coverage can be empty for newer or non-GPU listings.",
        ],
      };
    },
  };
}
