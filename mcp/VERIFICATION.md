# MCP verification evidence

## Public release — November 27, 2026

Application release `v2.1.0` includes MCP server `0.3.0`. PR #2 merged as `07a0b92b2a2214922207c1f9c451eb380043b487`. The public Worker deployment is `df479c41-a7a8-41ec-9464-6ba4c5d2779f` at `https://compute-intelligence-mcp.allanw-mk.workers.dev/mcp`; the development endpoint remains separate.

Executed during the rollout:

- Type checking and **192 tests across 35 files** passed, including production-environment host isolation and a 100-request fixture burst with concurrency 10.
- Production-config local workerd and hosted official SDK smoke checks passed for all five tools, plus CPU/TPU/sandbox searches. The hosted run used publication `2026-11-27T14:58:28.808Z`.
- Hosted five-tool request times in that single run were 119–547 ms. This is one functional smoke run, not a latency benchmark or service-level guarantee.
- A separate native Codex MCP connection searched the live dev endpoint successfully.
- Hosted public batch rejection returned 400; hostile-Origin rejection returned 403.
- Production Worker packaging, Pages build, dependency audit and the GitHub PR check passed.
- Production has a separate host allowlist and rate-limit namespace. No provider collector, database or scheduling path was added.

The following development evidence is historical. Sustained distributed-load/free-tier resource behavior remains unqualified; the fixture burst is not proof of public load resilience. See [security limits](SECURITY.md) and [usage](USAGE.md).

## 0.3.0 — trust and public-interface hardening

Deployed only the existing dev MCP Worker: `7c0553a2-1470-4bcc-aaec-cac26986865f`. Health confirms version 0.3.0 and the live Pages feed. Website, collector, watchlist and analytics resources remain unchanged.

- `pnpm check`: passed.
- `pnpm test`: **35 files / 190 tests passed**.
- Focused MCP coverage: 35 tests across search/billing/history/data/transport/trust contracts (included in the full suite).
- `pnpm audit --prod --audit-level high`: no known vulnerabilities reported.
- Wrangler dry-run packaging and dev deployment: passed.
- Formatting and `git diff --check`: passed.
- Official SDK: all five tools and GPU/CPU/TPU/sandbox searches passed in local workerd and on the hosted dev endpoint. Hosted structured outputs passed the current schemas.
- Hosted health: 200; single-message array/batch: 400; hostile Origin: 403. No adversarial load or private data was involved.
- Hosted advertised schema exposes canonical GPU model and node-count filters. Exact `h100-sxm`, eight-GPU nodes, minimum 80 GB VRAM returned **22** current catalog matches. All returned items satisfied those explicit constraints.
- Hosted nonexistent configuration query returned zero listings with `no_filter_matches`, the applied filters, and explicit guidance; no substitute offers appeared. Comparison returned `comparisonBlockers` with the selected unit-quote decision.

The hosted five-tool run used publication `2026-11-27T00:43:28.427Z` (7:43 p.m. Eastern on November 26). Individual hosted end-to-end times: search 332 ms, detail 144 ms, compare 108 ms, estimate 93 ms, history 172 ms; estimate $90.72; 100 actual observations / 19 returned history points. These are single-run observations, not performance guarantees.

Confirmed baseline regressions were demonstrated before changes: batches were accepted, config filters/diagnostics were absent, and same-named but different hardware could receive a lowest-price selection. Tests now cover batch rejection before I/O, declared/streamed body bounds, media types, rejected arbitrary URL parameters and incompatible filters, redirects, safe history paths, unknown specs/variants, CPU memory differences, stale stock, exact filters and all empty-result reason categories. A separate check confirmed the SDK already distinguishes invalid cross-field arguments from provider failures; that existing behavior is preserved and tested.

See `SECURITY.md` for prioritized findings, scope, residual limits and promotion requirements. No arbitrary-fetch, execution or secret-exposure path was confirmed in the inspected MCP boundary. This is not a full repository penetration test. The previous intermittent SDK timeout remains historical evidence below; this run does not establish sustained uptime.

## Previous 0.2.0 live-feed verification

Target: `https://compute-intelligence-mcp-dev.allanw-mk.workers.dev/mcp`, version 0.2.0. The dev Worker reads the live Pages feed; it has no static dataset binding or preparation step. Website hosting remains GitHub Pages. Provider collection, scheduling, watchlists and analytics logic were not changed.

### Publication and deployed integration

Main commit `86a46705f9ba848e40534f3446fcf0a5ffecdf36` adds derived MCP files to the existing Pages build and verifies their publication timestamp alongside `data/current.json`. GitHub run `45913684801` passed and published `2026-11-26T23:55:20.221Z` (6:55 p.m. Eastern). The published catalog included 1,965 GPU offers plus CPU, TPU and sandbox listings.

Cloudflare dev deployment `aaf34bfb-6328-4d8d-8788-5c183df0327b` reads that public feed. Its health response reports `published-snapshot` and the Pages data URL. No provider credentials, database, extra scheduled task or production MCP service was introduced.

The official MCP client SDK 2.4.0 discovered exactly five tools and successfully called each against that publication in both local workerd and the hosted dev Worker:

- `search_compute`: returned current H100 listings; additional searches covered CPU, TPU and sandbox types.
- `get_offer`: returned the selected listing and its source/freshness metadata.
- `compare_offers`: compared two current H100 listings.
- `estimate_job_cost`: estimated nine GPUs for six hours at $90.72 for the selected single-GPU quote.
- `get_price_history`: returned 19 sampled points from 100 real observations over 24 hours.

Initial remote end-to-end times were 280 ms search, 297 ms detail, 106 ms comparison, 200 ms estimate and 155 ms history. These are individual observations from this machine, not p95, CPU-time, sustained-load or uptime guarantees.

### Observed automatic refresh

The existing Cloudflare backup automatically dispatched GitHub run `45915424075` at `2026-11-27T00:12:55Z` (7:12:55 p.m. Eastern on November 26). Build, Pages deployment verification and alerts completed successfully. The resulting publication was `2026-11-27T00:13:31.383Z` (7:13 p.m. Eastern), containing 2,015 GPU offers. The public website snapshot and MCP feed reported that same timestamp.

One official SDK client stayed connected from the previous publication and observed its `search_compute` response advance from `23:55:20.221Z` to `00:13:31.383Z`. The Worker remained deployment `aaf34bfb-6328-4d8d-8788-5c183df0327b`; no manual collection, client restart or Worker redeployment caused that observed advance.

The watcher's subsequent five-tool exercise hit a 60-second SDK request timeout. A separate default-client retry also timed out. An IPv4-preferred retry passed all five tools, then a standard retry **without** that override also passed all five, plus CPU/TPU/sandbox searches, on the new generation. The standard final run measured search 446 ms, detail 172 ms, comparison 210 ms, estimate 99 ms and history 148 ms; cost was $90.72 and history retained 100 observations / 19 sampled points. Live logs inspected during diagnosis showed successful requests, not a confirmed application exception. Root cause of the intermittent timeout is unproven; these checks do not establish sustained transport reliability. The watcher demonstrated automatic advancement, but its complete uninterrupted five-tool sequence did not pass; the later standard SDK run established all five tools on the refreshed data.

### Architecture-design pass

Traced scheduled collection, durable snapshot ownership, Pages derivation/deployment, edge caching, schema validation, generation-race recovery and every tool's shared billing/freshness dependencies. The canonical design, alternative tradeoffs, component contracts, failure propagation and promotion/withdrawal gates are in `mcp/README.md`. No additional collector, database, mutable state or orchestration layer is needed for this repair. The confirmed pinned-data disconnect is removed; publication delay, upstream quote freshness and client transport reliability remain separate concerns.

### Local regression evidence

- `pnpm check`: passed.
- `pnpm test`: 34 files / 175 tests passed.
- `pnpm check:mcp`: 20 tests passed.
- `pnpm build:pages`: passed with the derived feed exporter.
- Binding generation, Wrangler packaging and the live dev deployment succeeded. Hosted health returned 200 with live-feed metadata; hostile Origin returned 403 and an unknown route returned 404.
- Formatting checks and `git diff --check`: passed.

New regression cases cover automatic minute-by-minute cache-key rotation without recreating the adapter, consuming a newer catalog, revision-scoped history requests, one bounded retry during a publication race, and explicit failure when revisions still disagree. Publisher tests check all listing kinds, source-state preservation, original observations/origins, timestamp deduplication, seven-day retention and safe hashed filenames. Existing transport, invalid-input, source-failure, stale-stock and whole-node billing checks remain intact. The whole-node fixture independently expects two eight-GPU nodes for nine requested GPUs: 2 nodes × 6 hours × $16/node-hour = $192.

### Limits

“Live” means the latest successfully published collector snapshot; it does not query provider stock on demand. A fresh publication can contain failed sources or old quotes, which retain their actual timestamps and stale/unknown availability. The existing two-hour freshness policy remains in effect. The adapter never fabricates observations or silently falls back to a pinned dataset when the feed fails.

The automatic collector retains its existing GitHub and Cloudflare scheduling dependencies. This change does not promise exact wall-clock scheduling, upstream availability, sustained throughput or interoperability with a second client application's UI. This remains a dev MCP endpoint for trials.
