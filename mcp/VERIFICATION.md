# Development verification — November 26, 2026

Target: `compute-intelligence-mcp-dev.allanw-mk.workers.dev/mcp`. Production Pages, collector, watchlist and analytics deployments were not changed.

## Executed checks

- `pnpm check`: passed.
- `pnpm test`: 33 files / 169 tests passed, including 17 focused MCP tests.
- `pnpm build:pages`: passed; emits the existing site plus derived MCP snapshot files. This build was not deployed to Pages.
- `pnpm audit --prod --audit-level high`: no known vulnerabilities found.
- Wrangler generated binding types, dry-run packaging and isolated dev deployment succeeded.
- Official MCP client SDK 2.4.0 discovered all five tools and called each in local workerd and on the Cloudflare dev endpoint. Searches covered GPU, CPU, TPU and sandbox types.
- Remote simultaneous clients returned sandbox and CPU results to their respective callers. Unknown listing and invalid limit returned tool errors. Hostile Origin returned 403. Local transport tests also cover host rejection, oversized/malformed requests and throttling.
- Legacy 2025-11-25 protocol initialization and schemas were tested directly. The official current client completed end-to-end transport calls. Interoperability with a second independent client application remains a production promotion check.

## Observed timings

Single local smoke run after per-listing history preparation: first GPU search 52 ms, warm tools about 18–20 ms including history. Single first remote smoke run: search 418 ms; get_offer 189 ms; compare 104 ms; estimate 92 ms; history 416 ms; subsequent CPU/TPU/sandbox searches 84–111 ms. These are end-to-end observations from this machine, not p95 measurements, CPU-time measurements or performance guarantees.

The prepared dataset is the real published snapshot `2026-11-26T23:13:29.066Z`: 1,929 GPU offers, additional compute feeds, and 1,623,555 recorded archive observations processed before deployment. The sample H100 history returned 19 real sampled points from 99 observations over 24 hours. The whole-node regression independently checks 9 requested GPUs on 8-GPU nodes for six hours at $16/node-hour: 2 nodes × 6 × $16 = $192.

## Limits and release boundary

This preview pins data for reproducibility and does not refresh automatically. It explicitly returns `pinned-development-snapshot`, original timestamps and normal stale/stock warnings. Refresh with `pnpm prepare:mcp` and redeploy the dev Worker. The shared two-hour freshness policy remains in effect. No fabricated current stock or observations are returned.

No sustained-load, uptime, second-client UI or automatic-production-refresh claim is made. The Pages-derived feed export and live data adapter are present on the branch, but require a separate approved production release. No private credentials, customer data or provider bookings are involved in these checks.
