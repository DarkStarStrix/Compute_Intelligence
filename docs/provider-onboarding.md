# Maintainer adapter integration guide

This guide covers GPU, CPU, TPU, and sandbox integrations. A provider can contribute an adapter directly or start with the [provider request form](https://github.com/DarkStarStrix/gpu-price-tracker/issues/new?template=provider.yml). Providers submit one data-only JSON file using [provider intake](../provider-submissions/README.md) and its PR template. The adapter changes below belong in a separate maintainer integration PR, never the provider intake PR. Submissions are not runtime configuration and do not become live listings automatically.

## Before coding

Provide a first-party HTTPS API or official pricing page, a human-readable pricing/product destination, and a small public response sample. Record the sample's source URL, retrieval time, and any exclusions. Explain:

- Currency and raw billing unit; this catalog expects USD hourly prices. Do not silently treat another currency as USD or assume a monthly-to-hourly conversion.
- Hardware or sandbox configuration, GPU count, CPU/RAM allocation, regions, and minimum rentable size where published.
- On-demand versus spot billing, separately from Secure/Community or other cloud tiers.
- Whether the source actually reports stock, and how each stock state maps to the catalog.
- Minimum spend, plans, reservations, storage, egress, and other fees excluded from the hourly figure.
- Pagination, response-size limits, source timestamps, rate limits, and permission to collect public prices on the roughly 15-minute schedule.

Quote-only or ambiguous prices must not become fabricated offers. Public pricing does not prove availability. If access requires authentication, open a proposal first; the current public collector needs no provider credentials. Do not submit tokens or a frontend workaround for authenticated collection.

## Follow the existing integration path

### GPU listings

- `scripts/providers.ts` defines `Source` and assembles `sources()`. Add to an existing source family when appropriate, or register your adapter once here.
- `scripts/provider-feeds.ts` contains API adapters; `scripts/provider-rate-cards.ts` and `scripts/pricing-pages.ts` demonstrate official pricing-page adapters. Keep parsing separate from transport so it can be tested offline.
- `shared/catalog.ts` defines `SourceResult`, `offerSchema`, evidence, and history validation. Return schema-valid offers with the supplied collection timestamp and the registered provider ID.
- `shared/added-providers.ts` holds metadata for additional GPU providers. `scripts/provider-offer.ts` can construct their normalized offers; reuse it when its contract fits.
- `scripts/gpu.ts` owns GPU model normalization. Reuse it and add a model mapping only when required.

Keep `offerId` stable across collections. Include SKU/configuration, region, billing, and tier distinctions as needed; never use price or collection time as identity. A price change should remain the same listing so history, comparisons, and watches continue working.

For an 8-GPU node costing $24/hour, `gpuCount = 8`, `totalNodePriceHr = 24`, and `pricePerGpuHr = 3`. If $3 is already a per-GPU price, multiply by eight for the node price rather than dividing again. Preserve `sourcePriceHr` and `priceBasis`. An unknown configuration must not be presented as a known single-GPU rental; follow existing `configurationKnown` handling. Use `minRentalGpus` only when the source establishes the minimum.

Pricing-page offers require `sourceSha256`, raw price/basis, and matching `SourceResult.evidence` with source URL, retrieval timestamp, digest, and parser version. See `scripts/pricing-pages.ts` for an implementation. Their availability must be `unknown`. An API can report availability only when its fields establish stock; missing capacity remains `unknown`.

### CPU, TPU, and sandboxes

- `shared/compute.ts` defines `ComputeRate` and `computeFeedSchema`.
- `scripts/compute-expansion.ts` contains the `ComputeSource` shape, existing parsers, and `computeExpansion` registry. `scripts/compute-feeds.ts` merges that registry with other sources and collects feeds.
- Supply a stable provider ID and stable rate IDs, explicit compute kinds, USD hourly rate, configuration, and relevant `terms`. Use the same provider ID as its GPU integration when it is the same provider.
- Current display units are instance-hour for CPU, chip-hour for TPU, and sandbox-hour for sandboxes. Explain assumptions for resource-metered estimates, including active CPU time and separately billed provisioned memory. Do not mix per-core and whole-instance prices.
- Each feed is currently limited to 500 rates. Do not silently truncate a larger catalog. Propose a bounded scope or a reviewed capacity change with tests.
- Use `providerLink` for a useful human-facing product/pricing page when `url` is a raw API endpoint. Set `dataSource`; pricing-page rates must have `unknown` stock.

### Transport and failure behavior

Use `fetchPublicText` from `scripts/http.ts`; it enforces timeout, content-type, and response-size limits. Bound pagination and reject incomplete responses rather than publishing a partial catalog as complete. Validate upstream timestamps when the source provides them. Do not bypass transport limits or add unbounded retries.

Throw on malformed input, incomplete pagination, unexpected currencies/units, or an extraction failure. Let the collector retain previous data with its original timestamp. Never return success-shaped fake prices or advance timestamps for retained values. The GPU collector permits an authoritative successful empty set; distinguish that explicitly from extraction failure. The compute collector currently treats empty rates as failure and retains previous data. Do not change those semantics in a provider PR without explaining the change and adding coverage.

## Profiles, logos, and dashboard coverage

Provider profiles are derived from published snapshot sources and compute feeds; do not maintain a second hand-written profile list or hardcode a hero count. Reuse existing offers, comparison, calculator, trends, and watchlist paths.

For a logo, add an official local asset under `client/public/images/providers/`, record its first-party source in `SOURCES.json`, and update `providerLogo` in `client/src/lib/data.ts` if the extension is not PNG. Use a safe static asset with no embedded scripts or external tracking. Confirm permission to use the mark and check legibility in both themes.

Verify the provider appears in Providers and All Offers under the correct compute kind. Check filters, regions, exact listing/source destinations, node-cost estimates, and comparison labels. History starts with actual observations; a new provider may have no trend line yet. Never invent past prices to fill it.

## Verification and PR evidence

Add a small sanitized fixture under `scripts/fixtures/` or an inline fixture in a focused Vitest test, with source/retrieval information. Include deterministic checks for:

- Correct price normalization, configuration, stable IDs, regions, and billing/tier separation.
- Missing stock remaining unknown, and supported stock mappings.
- Malformed payloads, missing price columns, and changed schemas failing explicitly.
- Incomplete pagination or stale source responses, where applicable.
- Collector retention after failure when introducing new failure-sensitive behavior; reuse `scripts/collect.test.ts` patterns.

Run the focused parser tests, then `pnpm check`, `pnpm test`, and `pnpm build:pages`. Include a worked raw-to-normalized price example and actual command outcomes in the PR. Note what you could not verify.

A live check is useful but optional when network access is unavailable. `pnpm collect` calls all configured sources, writes the local snapshot, and may write evidence under `work/provider-evidence`; inspect and exclude incidental generated data from the PR. Do not submit `dist/`, private responses, or credentials. Production collection/publication stays with the existing workflow after review.

The maintainer reviews source legitimacy, price semantics, failure behavior, links, and tests before merging. Sponsorship and referral enrollment are separate from technical acceptance and are not required for onboarding.
