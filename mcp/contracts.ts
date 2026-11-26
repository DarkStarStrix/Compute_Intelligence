import { z } from "zod";

const label = z.string().trim().min(1).max(300);
const kind = z.enum(["gpu", "cpu", "tpu", "sandbox"]);
export const idInput = z.strictObject({ offerId: label });
export const searchInput = z
  .strictObject({
    kind,
    query: label.optional(),
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
  .refine(x => x.kind === "gpu" || x.minVramGb === undefined, {
    message: "VRAM filtering applies only to GPUs.",
  });
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
  dataMode: z.enum(["published-snapshot", "pinned-development-snapshot"]),
  snapshotAt: z.string(),
  evaluatedAt: z.string(),
  warnings: z.array(z.string()),
};
export const searchOutput = z.object({
  ...metadataOutput,
  unit: z.string(),
  total: z.number(),
  nextOffset: z.number().nullable(),
  offers: z.array(offerOutput),
  ranking: z.string(),
});
export const detailOutput = z.object({ ...metadataOutput, offer: offerOutput });
export const compareOutput = z.object({
  ...metadataOutput,
  offers: z.array(offerOutput),
  comparableUnit: z.boolean(),
  cheapestOfferId: z.string().nullable(),
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
