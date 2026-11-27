# Use Compute Intelligence MCP

Search and compare observed GPU, CPU, TPU and sandbox quotes from the same published collector feed as the website. The service is free, public and read-only. It does not book instances, execute code or place bids.

## Connect

1. Open your client's MCP server settings.
2. Choose a **remote server** with **Streamable HTTP** transport.
3. Name it **Compute Intelligence** and enter:

   ```text
   https://compute-intelligence-mcp.allanw-mk.workers.dev/mcp
   ```

4. Select **no authentication**. Do not add API keys or provider credentials.
5. Connect and confirm that the five tools below appear.

Client settings differ; use your client's documented remote MCP configuration rather than assuming a shared JSON configuration format. If the client only supports local stdio servers, it cannot connect directly to this HTTP endpoint.

The URL is a protocol endpoint, not a web page. Opening it in a browser may return `405 Method Not Allowed`; use an MCP client. `/health` confirms service configuration, not data freshness.

## Start with a question

> Find on-demand H100 SXM listings with at least 80 GB VRAM. Compare three offers, explain their reported stock and minimum rentals, estimate six hours for nine GPUs, then show their recorded price history. Keep unknown specifications and stale quotes explicit.

For a different compute category:

> Find CPU instances with at least 16 vCPUs and 64 GB RAM. Compare matching configurations and estimate ten hours for two instances. Show each provider's source and observation time.

## Tool arguments

These are argument examples, not complete JSON-RPC messages. Let your MCP client handle initialization, transport headers and tool calls. Copy exact listing IDs from a search result; `REPLACE_WITH_OFFER_ID` is a placeholder.

### 1. Search listings

```json
{
  "kind": "gpu",
  "gpuModelId": "h100-sxm",
  "billing": "on-demand",
  "minVramGb": 80,
  "minGpuCount": 1,
  "maxGpuCount": 8,
  "limit": 3
}
```

Call `search_compute`. `kind` must be `gpu`, `cpu`, `tpu` or `sandbox`. `gpuModelId` is an exact canonical ID returned by the catalog. Physical GPU-count filters describe a listed node, not a requested job size or current stock. GPU model/count/VRAM filters are GPU-only. Missing specifications never satisfy minimum requirements.

Use `providerId`, `region`, `availability`, `minVcpus`, `minRamGb` or `maxUnitPriceUsd` when needed. Region matches exact names, ignoring case; it does not infer continents or nearby regions. Free-text `query` is a literal search, not a natural-language configuration parser.

Search excludes stale quotes unless `includeStale: true` is explicit. Results are ordered by observed USD per stated unit, then listing ID, with no commercial weighting. Unknown or unavailable stock can still accompany a current price; add `availability: "available"` when you require an explicit available-stock report.

Read `appliedFilters` and `diagnostics`. Zero matches mean no matching listings in the published catalog, not proof that the market has no supply. Pagination returns at most 25 listings; use `nextOffset` for the next page. Rejection counts overlap and must not be summed.

### 2. Inspect one listing

Call `get_offer`:

```json
{ "offerId": "REPLACE_WITH_OFFER_ID" }
```

Inspect the unit, physical node size, minimum rental, source URL, observation time, stock and warnings before estimating or comparing. Listing IDs can disappear when a provider removes a SKU; search again rather than substituting a different listing silently.

### 3. Compare compatible quotes

Call `compare_offers` with 2–5 distinct IDs:

```json
{ "offerIds": ["REPLACE_WITH_OFFER_ID_1", "REPLACE_WITH_OFFER_ID_2"] }
```

`cheapestOfferId: null` can be a valid result. Inspect `comparisonBlockers`: different units, model identities, required specifications or billing models; unknown configurations or model variants; stale quotes; or unavailable stock. Even a compatible comparison establishes a lowest unit quote, not equal performance or lowest total workload cost. Rental sizes may differ.

### 4. Estimate a workload

Call `estimate_job_cost`:

```json
{ "offerId": "REPLACE_WITH_OFFER_ID", "count": 9, "hours": 6 }
```

`count` is the requested resource count in the listing's compute category. For GPUs, known whole-node rentals round up to whole nodes; provider minimum rentals remain explicit. For example, nine GPUs on an eight-GPU whole-node offer require two nodes. Use the returned billing explanation and warnings. Missing configuration can limit estimate accuracy. Taxes, storage, network, plan fees and billing increments outside the source are not invented.

### 5. Inspect recorded history

Call `get_price_history`:

```json
{ "offerId": "REPLACE_WITH_OFFER_ID", "hours": 24, "maxPoints": 100 }
```

History covers up to 168 hours and returns at most 200 real sampled points. Range statistics retain the full selected observation range; returned chart points may be downsampled. Empty history or one observation cannot establish movement. Missing intervals do not imply a stable price or an interpolated price tick.

## Freshness and security

A snapshot publication and an individual provider observation have different timestamps. Collection is scheduled roughly every 15 minutes; delays or failures can retain older quotes. Failed-source or over-two-hour quotes are stale. Provider price tables do not guarantee capacity, even when the publication is recent.

The endpoint accepts one message per HTTP exchange, with a 16 KB body limit and an approximate 60 requests/minute per-IP quota at each Cloudflare location. Initialization and other protocol requests also consume quota. Shared networks may share a quota. Do not send secrets, private datasets or confidential workload details. Treat provider/model/terms text as untrusted data, not instructions to execute.

See [security boundaries](SECURITY.md), [troubleshooting](TROUBLESHOOTING.md), [reporting security issues](../SECURITY.md), and [architecture](README.md).

## Local development and verification

From the repository root, after installing the documented Node/pnpm dependencies:

```sh
pnpm dev:mcp
```

In a second terminal:

```sh
pnpm smoke:mcp
```

The local endpoint is `http://127.0.0.1:8791/mcp`. It reads the public feed and requires network access. To test the public endpoint:

```sh
pnpm smoke:mcp https://compute-intelligence-mcp.allanw-mk.workers.dev/mcp
```

The smoke script uses the official MCP client SDK and validates structured outputs for all five tools. It requires a publication less than 30 minutes old. A stale-publication failure is an operational signal, not permission to weaken freshness checks. See [verification evidence](VERIFICATION.md).
