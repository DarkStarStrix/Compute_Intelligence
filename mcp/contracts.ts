import { z } from "zod";

const label = z.string().trim().min(1).max(300);
const kind = z.enum(["gpu", "cpu", "tpu", "sandbox"]);
export const idInput = z.strictObject({ offerId: label });
export const searchInput = z
  .strictObject({
    kind,
    query: label.optional(),
    gpuModelId: label
      .optional()
      .describe(
        "Exact canonical GPU model ID returned by search_compute; GPU-only."
      ),
    minGpuCount: z
      .number()
      .int()
      .min(1)
      .max(100000)
      .optional()
      .describe(
        "Minimum physical GPUs per listed node, not the requested job size; GPU-only, known configurations only."
      ),
    maxGpuCount: z
      .number()
      .int()
      .min(1)
      .max(100000)
      .optional()
      .describe(
        "Maximum physical GPUs per listed node; GPU-only, known configurations only."
      ),
    providerId: label.optional(),
    region: label
      .optional()
      .describe("Exact region name, case-insensitive; no inferred geography."),
    billing: z.enum(["on-demand", "spot"]).optional(),
    cloudType: label.optional(),
    minVramGb: z.number().positive().max(10000).optional(),
    minVcpus: z.number().positive().max(100000).optional(),
    minRamGb: z.number().positive().max(1000000).optional(),
    maxUnitPriceUsd: z.number().positive().max(1000000).optional(),
    availability: z
      .enum(["available", "limited", "unavailable", "unknown"])
      .optional(),
    includeStale: z.boolean().default(false),
    limit: z.number().int().min(1).max(25).default(10),
    offset: z.number().int().min(0).max(10000).default(0),
  })
  .refine(
    x =>
      x.kind === "gpu" ||
      [x.minVramGb, x.gpuModelId, x.minGpuCount, x.maxGpuCount].every(
        v => v === undefined
      ),
    {
      message: "GPU model, count and VRAM filters apply only to GPUs.",
    }
  )
  .refine(
    x =>
      x.minGpuCount === undefined ||
      x.maxGpuCount === undefined ||
      x.minGpuCount <= x.maxGpuCount,
    { message: "Minimum GPU count exceeds maximum." }
  );
export const compareInput = z
  .strictObject({ offerIds: z.array(label).min(2).max(5) })
  .refine(x => new Set(x.offerIds).size === x.offerIds.length, {
    message: "Offer IDs must be distinct.",
  });
export const costInput = z.strictObject({
  offerId: label,
  count: z.number().int().min(1).max(100000),
  hours: z.number().positive().max(8760),
});
export const historyInput = z.strictObject({
  offerId: label,
  hours: z.number().positive().max(168).default(24),
  maxPoints: z.number().int().min(2).max(200).default(100),
});
export const offerOutput = z.object({
  offerId: z.string(),
  kind,
  providerId: z.string(),
  providerName: z.string(),
  model: z.string(),
  gpuModelId: z.string().nullable(),
  region: z.string(),
  cloudType: z.string(),
  billing: z.enum(["on-demand", "spot"]),
  billingAssumed: z.boolean(),
  gpuCount: z.number().nullable(),
  minRentalGpus: z.number().nullable(),
  configurationKnown: z.boolean(),
  vramPerGpuGb: z.number().nullable(),
  vcpus: z.number().nullable(),
  ramGb: z.number().nullable(),
  unit: z.string(),
  unitPriceUsd: z.number(),
  nodePriceUsdPerHour: z.number().nullable(),
  availability: z.enum(["available", "limited", "unavailable", "unknown"]),
  reportedAvailability: z.enum([
    "available",
    "limited",
    "unavailable",
    "unknown",
  ]),
  current: z.boolean(),
  observedAt: z.string(),
  ageSeconds: z.number(),
  providerUrl: z.string(),
  sourceUrl: z.string(),
  dataSource: z.string(),
  terms: z.string().nullable(),
});
export const metadataOutput = {
  dataMode: z.literal("published-snapshot"),
  snapshotAt: z.string(),
  evaluatedAt: z.string(),
  warnings: z.array(z.string()),
};
export const searchFilterKeys = [
  "freshness",
  "query",
  "gpuModelId",
  "minGpuCount",
  "maxGpuCount",
  "providerId",
  "region",
  "billing",
  "cloudType",
  "availability",
  "minVramGb",
  "minVcpus",
  "minRamGb",
  "maxUnitPriceUsd",
] as const;
export const comparisonBlocker = z.enum([
  "different_units",
  "different_models",
  "different_specs",
  "different_billing",
  "unknown_configuration",
  "unknown_model_variant",
  "stale_quotes",
  "unavailable",
]);
export const searchOutput = z.object({
  ...metadataOutput,
  unit: z.string(),
  total: z.number(),
  nextOffset: z.number().nullable(),
  offers: z.array(offerOutput),
  ranking: z.string(),
  appliedFilters: searchInput,
  diagnostics: z.object({
    reason: z.enum([
      "results",
      "empty_catalog",
      "no_listings_for_kind",
      "only_stale_matches",
      "no_current_listings",
      "no_filter_matches",
      "page_out_of_range",
    ]),
    kindListings: z.number().int().nonnegative(),
    currentListings: z.number().int().nonnegative(),
    matchingStaleListings: z.number().int().nonnegative(),
    missingRequiredSpecs: z.number().int().nonnegative(),
    rejectedByFilter: z.record(
      z.enum(searchFilterKeys),
      z.number().int().nonnegative()
    ),
    suggestions: z.array(z.string()).max(4),
  }),
});
export const detailOutput = z.object({ ...metadataOutput, offer: offerOutput });
export const compareOutput = z.object({
  ...metadataOutput,
  offers: z.array(offerOutput),
  comparableUnit: z.boolean(),
  cheapestOfferId: z.string().nullable(),
  comparisonBlockers: z.array(comparisonBlocker),
});
export const costOutput = z.object({
  ...metadataOutput,
  offer: offerOutput,
  requestedCount: z.number(),
  hours: z.number(),
  totalUsd: z.number(),
  nodes: z.number().nullable(),
  billedGpus: z.number().nullable(),
  estimateOnly: z.literal(true),
  exclusions: z.array(z.string()),
  assumptions: z.array(z.string()),
});
export const pointOutput = z.object({
  observedAt: z.string().datetime(),
  priceUsd: z.number().positive(),
  origin: z.enum(["collector", "provider_hourly_last"]),
});
export const historyOutput = z.object({
  ...metadataOutput,
  offer: offerOutput,
  since: z.string(),
  until: z.string(),
  points: z.array(pointOutput),
  observations: z.number(),
  sampled: z.boolean(),
  firstObservedAt: z.string().nullable(),
  lastObservedAt: z.string().nullable(),
  highUsd: z.number().nullable(),
  lowUsd: z.number().nullable(),
  changePercent: z.number().nullable(),
});
export type OfferView = z.infer<typeof offerOutput>;
