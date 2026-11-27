# Compute Intelligence MCP

Read-only compute discovery over Streamable HTTP. The five tools reuse the existing catalog schema, freshness rules, compute-listing conversion and whole-node cost calculator.

## Connect

Public MCP: `https://compute-intelligence-mcp.allanw-mk.workers.dev/mcp`

Remote dev MCP: `https://compute-intelligence-mcp-dev.allanw-mk.workers.dev/mcp`

Local MCP: `http://127.0.0.1:8791/mcp` (`pnpm dev:mcp`). Both read the live public collector feed. No dataset preparation, static-asset upload, login or API key is required. The public endpoint is rate limited; do not send secrets or private workload details.

Tools: `search_compute`, `get_offer`, `compare_offers`, `estimate_job_cost`, `get_price_history`.

Try: “Find three on-demand H100 listings with at least 80 GB VRAM. Compare minimum rental sizes and reported stock, estimate six hours for nine GPUs, then show recorded price history.” CPU, TPU and sandbox searches are supported with their own billing units.

## Automatic data flow

The existing GitHub collector runs on its existing schedule, persists source observations, and builds/deploys GitHub Pages. The Pages build now exports:

- `data/mcp/catalog.json`: the complete current catalog with original timestamps/source statuses, without the large history array.
- `data/mcp/history/<sha256-of-offer-id>.json`: small per-listing history files, tagged with the same publication timestamp.

The dev Worker fetches these files from `https://darkstarstrix.github.io/gpu-price-tracker/data/mcp/`. It has no pinned dataset or asset binding. Its code does not redeploy when data changes. The website stays on GitHub Pages; collector provider-fetching and scheduling logic are unchanged.

Normal catalog requests rotate a cache key every minute with a 60-second edge TTL. This avoids retaining the old Pages response behind its default cache headers. Catalog/history generations must match. If publication changes between reads, history retries once with a cache-bypassed catalog; it never combines mismatched generations or silently falls back to old data.

“Live” means the latest successfully published collector snapshot, not on-demand provider probing. Individual sources can fail or retain older quotes. Every result includes `published-snapshot`, publication/evaluation times, observation age, source URL, current/stale status and warnings. Failed-source or over-two-hour quotes have unknown effective stock and are excluded from search unless `includeStale:true` is explicit.

No extra database, scheduled Worker, provider credentials, booking or bidding integration is involved.

## Architecture decision and acceptance gates

Objective: an already-connected dev MCP client must consume a newer scheduled collector publication without a data-preparation command or Worker redeployment. Keep the five read-only tools, shared price/stock rules, free infrastructure and GitHub Pages hosting. Provider probing, bookings, a second collector and new mutable storage are outside this change.

```mermaid
flowchart LR
  Providers[Official provider sources] --> Collector[Existing scheduled collector]
  Collector --> Snapshot[Durable source snapshot]
  Snapshot --> Build[Pages build: derived MCP files]
  Build --> Pages[GitHub Pages]
  Pages --> Adapter[Bounded live-feed adapter]
  Adapter --> Service[Shared compute service]
  Service --> Tools[Five MCP tools]
```

| Boundary / owner                     | Contract and failure propagation                                                                                                                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing collector → source snapshot | Owns provider I/O and durable observations. Failed sources retain their status and original observation times. MCP cannot mutate this state.                                                                                                            |
| Pages build → MCP files              | Derives catalog and per-listing histories from one validated snapshot. All files carry the same publication time. The deployment workflow verifies the public catalog timestamp alongside the site's snapshot.                                          |
| Pages → `mcp/data.ts`                | Fixed upstream, schema and byte limits, 15-second timeout, minute-rotating catalog cache key. A new publication becomes eligible on subsequent requests without changing code. Unavailable or invalid data becomes an explicit tool error.              |
| Catalog + history → service          | History must match the catalog generation. One forced catalog refresh handles a publication race; a persistent mismatch fails rather than joining inconsistent data.                                                                                    |
| `mcp/service.ts` → tools             | Reuses listing conversion, freshness and whole-node billing. Units, stock uncertainty, timestamps and sampled-history provenance remain explicit. Each tool evaluates a single catalog; separate calls may legitimately observe different publications. |
| `mcp/worker.ts` → clients            | Stateless SDK server per exchange, strict typed tool schemas, bounded bodies, host/origin checks and per-IP rate limiting. Public read-only requests never receive provider secrets or write access.                                                    |

The original bundled-data baseline could not react to collector publications. Reusing the full archive directly would require downloading/parsing all history on routine searches. The chosen repair adds derived files to the existing build and a small live adapter; another collector, database or scheduler would duplicate ownership and require more configuration without fixing the actual disconnected data path. The tradeoff is additional static publication size and a dependency on Pages availability. Per-listing history keeps routine requests bounded.

Three failure causes stay distinct: a collector/deployment delay leaves the publication timestamp unchanged; a provider failure leaves that provider's quotes stale; a cache/publication race is detected by generation mismatch. `/health` proves service configuration only, not feed freshness. Tool metadata and the existing Pages verification expose publication state; sampled request/error logs expose transport and validation failures without logging arguments.

Cheap promotion gates are the publication, cache-rotation, mismatch-retry, source-failure and billing regressions, followed by local and hosted five-tool tests. The mechanism gate keeps one official MCP client connected through a real automatic publication and reruns all five tools on the newer generation (`smoke:mcp:refresh`). A public production MCP release additionally needs a second client application and sustained-load/free-tier resource checks; neither is inferred from a successful smoke test. If the dev service must be withdrawn, disable its endpoint while leaving the collector snapshot and Pages site intact. Do not silently restore a pinned-data fallback.

## Verification

```sh
pnpm check
pnpm test
pnpm check:mcp
pnpm build:pages
pnpm smoke:mcp
pnpm smoke:mcp https://compute-intelligence-mcp-dev.allanw-mk.workers.dev/mcp
pnpm smoke:mcp:refresh https://compute-intelligence-mcp-dev.allanw-mk.workers.dev/mcp
```

`smoke:mcp` uses the official MCP client SDK to call all five tools. `smoke:mcp:refresh` keeps one client connected for up to 20 minutes, waits for a newer publication, then checks all five tools against that publication. `types:mcp` generates binding declarations. `deploy:mcp:dev` deploys only the dev Worker. `pnpm deploy:mcp` deploys the stable public Worker using `--env production`, with its own host allowlist and rate-limit namespace. Neither command deploys Pages or the collector.

Search requires a compute kind, uses exact case-insensitive region names and never treats unknown hardware fields as satisfying a minimum. Pricing units, spot/on-demand billing, node size, minimum rental and provider terms remain explicit. Cost estimates exclude unrepresented taxes, plan/storage/network fees and billing increments. A cheapest unit quote is not a performance recommendation or a guaranteed complete job bill.

History covers at most seven days, returns at most 200 real sampled points, preserves collector/provider-hourly provenance and reports full-range count/high/low/change. Missing intervals are not invented. Empty coverage is explicit.

Strict schemas, host/origin checks, a 16 KB request-body bound, bounded upstream reads and a 60 requests/minute per-IP limit protect the public surface. Each MCP exchange gets a fresh SDK server. Logs contain operation/status/error codes and timings, not request bodies or arguments.

See `VERIFICATION.md` for executed evidence and remaining limits. The public and dev endpoints share the read-only implementation and published feed. No uptime or sustained-load guarantee is implied.

## Trust and search diagnostics (0.3.0)

Search returns `appliedFilters`, including default freshness and pagination values, and `diagnostics`. Empty pages distinguish an empty catalog, no listings of that compute kind, only retained/stale matches, no current listings, no exact filter matches, and an offset beyond the last match. These are statements about the published catalog, never proof that compute does not exist in the market. Source failures remain tool errors, rather than empty search results.

`rejectedByFilter` counts failures independently across all listings of the selected kind. One listing can fail multiple filters; the counts must not be summed. `missingRequiredSpecs` counts listings missing a requested numeric specification. `matchingStaleListings` respects all other filters and uses unknown effective stock for retained quotes. Suggestions describe an explicit next query; they do not change the results or relax constraints.

`gpuModelId` is the exact collector-normalized GPU ID, also returned in offers and searched by the literal query field. `minGpuCount` and `maxGpuCount` filter known physical GPU counts per listed node. They do not mean requested job size, minimum rental or currently available GPU count. Model/count/VRAM filters are GPU-only; incompatible types and inverted count ranges are rejected. vCPU and RAM filters retain their existing meaning. Free-text queries do not parse arbitrary natural-language configuration requests or infer geographic regions.

When `compare_offers.cheapestOfferId` is null, `comparisonBlockers` explains why: unit, canonical model, required specifications, billing, unknown configuration or model variant, stale quotes, or unavailable stock. GPU comparisons require matching known VRAM; CPU/sandbox comparisons require matching known vCPU and RAM. GPU count and rental terms can still differ, so the selection is the lowest comparable unit quote, not a whole-job or performance recommendation. Unknown stock remains unknown even when a quote is current.

The public endpoint accepts one message per HTTP exchange. Legacy JSON-RPC batches are rejected before catalog I/O so one rate-limit decision cannot fan out into many tool calls. Input remains bounded to 16 KB before parsing and dispatch. See `SECURITY.md` for the review evidence, fixed findings and remaining limits. Version 0.3.0 is deployed to the existing dev endpoint and verified with the official SDK.
