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
function listings(s: Snapshot) {
  return [...s.offers, ...computeListings(s)];
}
export function offerView(s: Snapshot, o: Listing, now: number): OfferView {
  const current = isCurrent(s, o, now);
  return {
    offerId: o.offerId,
    kind: o.kind ?? "gpu",
    model: o.gpuModelName,
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
      const offers = listings(s)
        .map(o => offerView(s, o, now))
        .filter(
          o =>
            o.kind === args.kind &&
            (args.includeStale || o.current) &&
            (!args.providerId || o.providerId === args.providerId) &&
            (!args.region ||
              o.region.toLowerCase() === args.region.toLowerCase()) &&
            (!args.billing || o.billing === args.billing) &&
            (!args.cloudType || o.cloudType === args.cloudType) &&
            (!args.availability || o.availability === args.availability) &&
            (args.minVramGb === undefined ||
              (o.vramPerGpuGb !== null && o.vramPerGpuGb >= args.minVramGb)) &&
            (args.minVcpus === undefined ||
              (o.vcpus !== null && o.vcpus >= args.minVcpus)) &&
            (args.minRamGb === undefined ||
              (o.ramGb !== null && o.ramGb >= args.minRamGb)) &&
            (args.maxUnitPriceUsd === undefined ||
              o.unitPriceUsd <= args.maxUnitPriceUsd) &&
            terms.every(t =>
              `${o.model} ${o.providerName} ${o.region}`
                .toLowerCase()
                .includes(t)
            )
        )
        .sort(
          (a, b) =>
            a.unitPriceUsd - b.unitPriceUsd ||
            a.offerId.localeCompare(b.offerId)
        );
      const page = offers.slice(args.offset, args.offset + args.limit);
      return {
        ...meta(s, now, page, data.mode),
        unit: args.kind === "gpu" ? "GPU-hour" : computeKinds[args.kind].unit,
        offers: page,
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
      const sameHardware = new Set(offers.map(o => o.model)).size === 1;
      const comparable =
        comparableUnit &&
        sameHardware &&
        offers.every(
          o =>
            o.current &&
            o.availability !== "unavailable" &&
            o.configurationKnown
        ) &&
        new Set(offers.map(o => o.billing)).size === 1;
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
        cheapestOfferId: comparable
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
