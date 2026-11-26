# Compute Intelligence MCP — development preview

Read-only compute discovery over Streamable HTTP. Five tools reuse the site's catalog schema, freshness checks, compute-listing conversion and job-cost calculator. No provisioning, credentials, bidding or booking actions.

## Try it

Remote development URL: `https://compute-intelligence-mcp-dev.allanw-mk.workers.dev/mcp`

Local URL: `http://127.0.0.1:8791/mcp`

Connect either URL as a Streamable HTTP MCP server. Public data only; no API key or OAuth is needed for this preview. This is a public, rate-limited development endpoint, not a private account service. Do not send secrets or private workload details.

Example requests:

- Find on-demand H100 listings with at least 80 GB VRAM. Compare the first three and tell me which have reported stock.
- Find a CPU instance with at least 8 vCPUs and 32 GB RAM. Use the exact region names returned by the catalog.
- Estimate six hours for nine GPUs on this listing, including its minimum rental size.
- Show the last 24 hours of recorded prices for that listing, and explain any missing coverage.
- Compare two sandbox listings, including their billing assumptions and excluded plan fees.

Tool names: `search_compute`, `get_offer`, `compare_offers`, `estimate_job_cost`, `get_price_history`.

## Dataset and freshness

**This dev preview deliberately pins a coherent published snapshot. It does not refresh itself.** Every tool response includes `dataMode`, snapshot time, observation time, age, current/stale status and warnings. Stock becomes unknown for stale or failed-source quotes. Search excludes those quotes unless `includeStale:true` is explicit. Pinned data will eventually become stale; refresh it before extended testing.

The collector and public GitHub Pages site remain unchanged in production. The new Pages build export exists only on the development branch until approved. It creates `data/mcp/catalog.json` and one small, hashed history file per current listing. Once promoted, those artifacts can be updated by the existing scheduled collection/build, and `createPublishedData()` already supports reading that published root. Promoting the Worker to that source is a separate release step; the current dev Worker reads its own versioned static assets.

The initial all-history request path was discarded after it took ~8 seconds in Node and timed out in the Workers local runtime. Preparing history before deployment avoids parsing the full archive on each request and does not require a database, cron, Durable Object or paid server.

History contains observed prices only, deduplicates timestamps like the website and preserves provider-hourly versus collector origins. Seven days maximum; at most 200 points returned. Downsampling selects real samples, keeps first/last, and reports full-range count/high/low/change separately. A path can end where it started while still having moved. Missing intervals are never synthesized.

## Local commands

From this checkout:

```sh
pnpm install --frozen-lockfile
pnpm prepare:mcp
pnpm dev:mcp
```

In another terminal:

```sh
pnpm check
pnpm check:mcp
pnpm smoke:mcp
pnpm smoke:mcp https://compute-intelligence-mcp-dev.allanw-mk.workers.dev/mcp
```

`prepare:mcp` reads the public Pages current/history pair, validates both with shared schemas, retries a revision race once and writes ignored `mcp/.data` artifacts. Provider data is never collected through the MCP request path. Original observation times are preserved. The source is fixed; tool callers cannot supply arbitrary fetch URLs.

To refresh the remote preview after local checks:

```sh
pnpm prepare:mcp
pnpm deploy:mcp:dev
```

Deployment targets only `compute-intelligence-mcp-dev`. No database binding, collector change, analytics write or Pages deployment is involved.

## Contracts

- Search requires a compute kind. Prices from different units are not ranked together. Region matching is exact, case-insensitive; "Europe" does not silently map to selected cities. Unknown hardware fields do not satisfy minimum requirements.
- GPU count means requested GPUs; CPU count means instances, TPU count means chips, sandbox count means sandboxes. GPU minimum rental/node rounding uses `shared/job-cost.ts` unchanged.
- Estimates are compute-only, not complete invoices. Unknown node configuration, spot interruptions, provider terms, plan fees, storage, transfer, tax, discounts and unrepresented billing increments are disclosed.
- Comparisons retain cloud type, billing model, node size, stock and specifications. A lowest unit price is not a performance recommendation or necessarily the lowest job bill. Mixed models/billing units, stale offers and unavailable stock do not get a cheapest label.
- Each success uses a declared output schema and structured content. Unknown IDs, invalid arguments, revision mismatches, unreadable/oversized sources and malformed history fail explicitly.
- Server instances are per-exchange; no mutable client/session state is shared. Origin/host checks, 16 KB request-body bound, capped result sizes and per-IP 60 requests/minute limit bound the public surface. This is abuse mitigation, not identity authentication.
- Logs contain operation/status/error codes and timings, not arguments, IPs or request bodies. Snapshot/source data can contain arbitrary provider text; server instructions identify it as data, never instructions.

## Verification and release boundary

Focused tests cover strict filters, stale stock, all compute kinds, schema rejection, unknown IDs, minimum/whole-node billing, mixed-unit comparisons, history sampling and revision consistency, upstream failure, host/origin rejection, throttling, malformed/oversized bodies, legacy protocol initialization and concurrent request isolation.

The smoke client uses the official MCP client SDK against a real workerd/Cloudflare endpoint and calls all five tools, including GPU/CPU/TPU/sandbox searches. It never books compute or follows provider links. Unit tests are not proof of deployed availability; rerun the remote smoke client after each deployment.

Before production promotion: user trial, second-client interoperability check, data-source switch to the approved Pages-derived feed, freshness/availability checks after scheduled publications, and sustained CPU/error/latency review. A successful short smoke run is not a load or uptime guarantee. Keep the dev dataset pinned until that production path is approved.
