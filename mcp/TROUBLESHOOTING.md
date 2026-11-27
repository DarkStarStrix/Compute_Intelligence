# MCP troubleshooting

Start with the [connection and tool guide](USAGE.md). Preserve exact errors, tool names, publication timestamps and non-sensitive arguments when diagnosing a problem. Never paste credentials or private workload data into an issue.

| Symptom                                  | Meaning and next step                                                                                                                                                                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Endpoint opens as `405` in a browser     | `/mcp` is a Streamable HTTP protocol endpoint, not a web page. Connect through an MCP client. Unsupported GET requests do not prove that POST tool calls are down.                                                                           |
| Client cannot discover tools             | Confirm the exact `/mcp` URL, remote Streamable HTTP support and no-auth configuration. Reconnect. Check `/health` for service configuration, then test a tool; health alone does not establish source freshness.                            |
| `403`                                    | The host or browser Origin is outside the allowlist, or an upstream edge control rejected the request. Use the published host. An arbitrary browser-hosted MCP client is not automatically allowed. Do not disable checks to work around it. |
| `429`                                    | Quota was exceeded. Honor `Retry-After`, reduce concurrency and stop repeated retries. A shared IP can share a quota.                                                                                                                        |
| `413`                                    | The body exceeds 16 KB. Reduce the request; send one tool operation per exchange.                                                                                                                                                            |
| `415`                                    | POST requires `Content-Type: application/json`. Let a supported MCP client set protocol headers.                                                                                                                                             |
| `400` or input-validation error          | Check required fields, numeric limits and compute-kind compatibility. JSON-RPC batch arrays are unsupported. Correct the arguments instead of retrying them unchanged.                                                                       |
| Zero search results                      | Inspect `diagnostics.reason`, `appliedFilters`, `matchingStaleListings` and missing-spec counts. Use exact region/model/provider IDs. Relax a constraint explicitly only if it still satisfies your workload.                                |
| Only stale matches                       | The retained catalog has matches but cannot establish a current quote. `includeStale: true` exposes retained evidence; it does not make it fresh.                                                                                            |
| `cheapestOfferId` is null                | Inspect `comparisonBlockers`; differing units, models, specifications, billing, unknown configurations, stale quotes or unavailable stock can prevent a comparable winner. This is not necessarily a transport failure.                      |
| A listing ID is missing                  | Provider inventory can change. Search again and choose an exact current ID; do not silently substitute an unrelated SKU.                                                                                                                     |
| Empty or flat history                    | History only covers recorded observations in a rolling seven-day window. New listings may have little history; unchanged rates stay flat. Missing data is not fabricated.                                                                    |
| Source error or catalog/history mismatch | The upstream file may be unavailable, invalid, or from a different publication. The adapter retries a publication race once, then reports failure. Wait briefly and retry once; persistent failures need investigation.                      |
| Request timeout                          | Separate client/transport failures from source fetches. The adapter bounds upstream fetches to 15 seconds. SDK/client/network timeouts have separate behavior; intermittent SDK timeouts have been observed without a confirmed root cause.  |

## For maintainers

1. Compare the tool's `snapshotAt` with the live Pages catalog timestamp and the latest successful Actions deployment.
2. Inspect individual source status and `observedAt`; a fresh site publication can contain retained provider quotes.
3. Inspect **Refresh prices and deploy Pages**, including collection, snapshot push, build, deployment and public timestamp verification. A local commit or successful collector command alone does not prove publication.
4. Inspect Cloudflare Worker request status/error logs. Do not add argument/body logging to diagnose private client behavior.
5. Run the focused MCP tests and official-client smoke script from [operations](../docs/operations.md). Keep failure evidence; do not reintroduce a pinned fallback or weaken source validation.

Cloudflare's backup dispatches the existing GitHub workflow. It cannot publish fresh provider data while GitHub refuses or fails those jobs. See [operations](../docs/operations.md), [security](SECURITY.md) and [verification](VERIFICATION.md).
