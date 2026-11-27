# Public MCP trust and security review — November 26, 2026

## Summary and release state

Inspected the read-only MCP boundary, its five tools, schema validation, shared price/freshness/calculator dependencies, and fixed Pages data adapter. Found and fixed a batch request amplification path and two result-integrity defects. Version 0.3.0 is deployed to the existing dev Worker as `7c0553a2-1470-4bcc-aaec-cac26986865f`, with local and hosted verification. This is a bounded code review with regression and local runtime evidence, not a penetration-test certification or proof that the whole repository is vulnerability-free.

The site, collector scheduling/provider adapters, watchlists, analytics services and their credentials were not changed or subjected to a separate full security audit. No adversarial load was sent to the public service.

## Confirmed findings, in priority order

### SEC-01 — High availability risk: one rate-limited request could fan out into many tools

Baseline: `c554817`. `mcp/worker.ts:68` applied one IP rate-limit decision per HTTP request and passed its body to the SDK. Installed `@modelcontextprotocol/server` 2.4.0 accepts legacy arrays of up to 100 messages. Individual messages can invoke catalog/history reads; a batch can fit inside 16 KB. This bypassed the intended one-exchange/one-operation resource bound and could amplify network, CPU and memory consumption. Secret access or code execution was not demonstrated.

Evidence: a safe two-message fixture returned HTTP 200 before the fix. The regression now requires HTTP 400 and zero catalog reads. `scripts/mcp-transport.test.ts` tests the batch boundary. `mcp/worker.ts:88` now bounds and parses the body once, rejects arrays before dispatch, and uses the SDK's supported `parsedBody` seam. Declared and streamed oversize bodies are rejected before data access. A real local workerd request independently returned 400 / JSON-RPC `-32600`.

Compatibility: legacy batches are intentionally unsupported. Individual legacy and modern client exchanges still use the same registered five tools and were checked with the official SDK.

Status: fixed locally and on the hosted dev endpoint; both independently reject batches with HTTP 400.

### TRUST-01 — Moderate result-integrity risk: comparison identity was too weak

Baseline `mcp/service.ts` used display-model equality plus unit/billing/freshness checks when selecting a lowest unit price. Two listings with the same display name could have different canonical GPU variants or VRAM. CPU/sandbox memory differences were also insufficiently constrained. A valid JSON response could consequently imply comparability that the source data did not establish.

Fix in `mcp/service.ts:284`: canonical model identity, matching known required specifications, and explicit `comparisonBlockers`. GPU variants intentionally normalized to unspecified/unknown are blocked from automatic lowest-price selection. Different node/rental sizes are still disclosed rather than treated as equal full-job cost. Unknown stock does not become available stock. Regression fixtures reproduce differing canonical IDs, VRAM, missing specifications, CPU memory, and unspecified H100/H200/A100 variants.

Status: fixed locally and deployed to dev. This does not establish equal performance, interconnect, network, reliability, quota, reservation terms or complete job billing.

### TRUST-02 — Moderate usability/integrity gap: empty results lacked an explanation

Baseline returned a bare empty page for exhausted pagination, strict-filter mismatch, missing compute coverage or excluded stale quotes. Consumers could mistake lack of observed matches for lack of supply or retry by silently changing constraints. The model/configuration filters also lacked exact canonical-model and physical GPU-count controls.

Fix in `mcp/service.ts:136` and `mcp/contracts.ts:5`: bounded strict GPU model/node-count filters, applied-filter echo, reason codes, independent rejection counts, missing-spec counts and explicit suggestions. Source errors remain errors. Numeric unknowns do not satisfy constraints, unavailable and unknown stock are preserved, and filters are never automatically relaxed. Tests cover all reason categories, case-insensitive exact region matching, stale stock, literal query text and incompatible/inverted constraints.

Status: verified locally and on the hosted dev service. Source coverage and collector normalization remain fallible; diagnostics explain this catalog rather than all market supply.

## Other inspected protections

- Host and Origin allowlists precede tool dispatch (`mcp/worker.ts`). They mitigate unwanted browser origins and local DNS-rebinding paths; they are not user authentication. The product intentionally serves public data without credentials.
- The data adapter uses a fixed public Pages root, manual redirects, a 15-second upstream timeout, 4 MB catalog and 2 MB per-listing history bounds (`mcp/data.ts:67`). Listing IDs map to SHA-256 filenames, not URL paths. Request schemas reject arbitrary `url` parameters. Regression cases reject redirects and prove hostile listing text cannot alter the upstream origin/path.
- Strict bounded input schemas reject unexpected properties, invalid limits, unsupported kind/filter combinations and duplicate comparison IDs (`mcp/contracts.ts`). Transport tests verify rejected parameters cause no source I/O. Literal string matching avoids constructing regular expressions from search input.
- Catalog validation preserves source state, price basis consistency and observation timestamps. Catalog/history generation mismatch gets one bounded refresh, then explicit failure. No pinned-data fallback or synthesized price history is used.
- The tool service has no booking, write, shell, SQL, credential, OAuth forwarding or arbitrary-fetch interface. SDK servers are created per exchange; concurrent-caller tests check result isolation.
- Application logs contain operation/status/error codes, not bodies or arguments. A regression verifies thrown private exception text does not reach clients. Cloudflare-managed request metadata/logging has its own configuration and retention boundary.
- Production dependency audit completed with no known vulnerabilities reported. This is advisory-database evidence, not proof that dependencies have no defects.

## Residual limits and promotion gates

1. The configured 60/minute IP binding is approximate and local to each Cloudflare location, not a strict worldwide quota or distributed-abuse guarantee. Shared/NAT clients may share a quota. Public requests still consume finite account/Worker resources. Sustained-load, multi-location abuse and resource-exhaustion tests have not been performed. Do not describe this control as a hard global budget. [Cloudflare binding locality and accuracy](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
2. Provider/model/terms text remains untrusted data. Structured output and server instructions cannot guarantee that a downstream agent resists prompt injection. Clients must not execute provider content or treat it as privileged instructions; this MCP exposes no execution tool. [MCP security guidance](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/docs/2026-07-28/tutorials/security/security_best_practices.mdx).
3. HTTPS, fixed origin and schema/provenance checks do not independently authenticate a provider's pricing claim. Repository/collector compromise or parser mistakes can publish plausible but wrong prices. No cryptographic provider attestation or market-completeness claim is made.
4. No production credentials, security policy or resource migrations were changed. The reviewed revision was deployed to the dev Worker and passed hosted five-tool, schema, configuration, empty-result, comparison, batch-rejection and hostile-Origin checks. A broader public MCP release still requires normal-traffic observation and sustained-load/resource checks. Existing intermittent SDK timeout evidence remains in `VERIFICATION.md`; local correctness does not establish hosted uptime.

## Verification receipts

Commands and results are maintained in `VERIFICATION.md`. The batch and initial new trust cases were run against the baseline first and failed for the expected reasons. Additional regressions preserve existing validation and source-failure protections. The security changes reuse the existing SDK, bounded-body reader, schemas and Cloudflare rate-limit binding; they introduce no new infrastructure or dependencies.
