import { z } from "zod/mini";

export const analyticsEvents = [
  "session_started",
  "tab_viewed",
  "search_submitted",
  "results_viewed",
  "comparison_opened",
  "provider_outbound_click",
  "share_link_copied",
  "calculator_used",
  "support_opened",
  "commercial_link_clicked",
] as const;
const dimension = z
  .string()
  .check(z.regex(/^[\p{L}\p{N} _.,:·+()/–-]{1,120}$/u));
const amount = z.number().check(z.nonnegative(), z.maximum(1e9));
const integer = z.int().check(z.nonnegative(), z.maximum(1000000));
export const analyticsPropertiesSchema = z.strictObject({
  tab: z.optional(z.enum(["overview", "offers", "providers", "trends"])),
  kind: z.optional(z.enum(["gpu", "cpu", "tpu", "sandbox"])),
  model: z.optional(dimension),
  region: z.optional(dimension),
  provider: z.optional(z.string().check(z.regex(/^[a-z0-9-]{1,60}$/))),
  listing: z.optional(
    z
      .string()
      .check(
        z.minLength(1),
        z.maxLength(300),
        z.regex(/^[\p{L}\p{N} _.:+()/–-]+$/u)
      )
  ),
  billing: z.optional(z.enum(["on-demand", "spot"])),
  tier: z.optional(dimension),
  stock: z.optional(z.enum(["available", "limited", "unavailable", "unknown"])),
  source: z.optional(
    z.enum([
      "offers",
      "comparison",
      "hero",
      "providers",
      "trends",
      "support",
      "footer",
    ])
  ),
  action: z.optional(z.enum(["stripe", "referral", "sponsor", "inquiry"])),
  results: z.optional(integer),
  freshResults: z.optional(integer),
  latencyMs: z.optional(amount),
  price: z.optional(amount),
  maxPrice: z.optional(amount),
  unit: z.optional(
    z.enum(["GPU-hour", "instance-hour", "chip-hour", "sandbox-hour"])
  ),
  quantity: z.optional(integer),
  hours: z.optional(amount),
  listings: z.optional(z.int().check(z.minimum(2), z.maximum(3))),
  retained: z.optional(z.boolean()),
  query: z.optional(z.enum(["none", "text"])),
});
export const productEventSchema = z
  .strictObject({
    version: z.literal(1),
    eventId: z.uuid(),
    sessionId: z.uuid(),
    browserId: z.optional(z.uuid()),
    event: z.enum(analyticsEvents),
    occurredAt: z.iso.datetime(),
    searchId: z.optional(z.uuid()),
    sequence: z.int().check(z.nonnegative(), z.maximum(1000000)),
    properties: analyticsPropertiesSchema,
    acquisition: z.optional(
      z.strictObject({
        channel: z.enum([
          "direct",
          "x",
          "github",
          "search",
          "referral",
          "campaign",
        ]),
        referrer: z.optional(z.string().check(z.regex(/^[a-z0-9.-]{1,120}$/))),
        campaign: z.optional(
          z.enum(["x", "launch", "demo", "newsletter", "other"])
        ),
      })
    ),
  })
  .check(
    z.superRefine((event, ctx) => {
      if (
        ["search_submitted", "results_viewed"].includes(event.event) &&
        !event.searchId
      )
        ctx.addIssue({ code: "custom", message: "Search identity required" });
      if (
        event.event === "results_viewed" &&
        (event.properties.results === undefined ||
          event.properties.freshResults === undefined ||
          event.properties.freshResults > event.properties.results!)
      )
        ctx.addIssue({
          code: "custom",
          message: "Valid result counts required",
        });
      if (
        event.event === "comparison_opened" &&
        event.properties.listings === undefined
      )
        ctx.addIssue({ code: "custom", message: "Comparison size required" });
      if (
        event.event === "provider_outbound_click" &&
        !event.properties.provider
      )
        ctx.addIssue({ code: "custom", message: "Provider required" });
    })
  );
export const analyticsBatchSchema = z.strictObject({
  events: z.array(productEventSchema).check(z.minLength(1), z.maxLength(10)),
});
export type ProductEvent = z.infer<typeof productEventSchema>;
export type ProductEventName = ProductEvent["event"];
export type AnalyticsProperties = ProductEvent["properties"];
