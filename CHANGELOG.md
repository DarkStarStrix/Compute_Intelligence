# Changelog

## 2.1.0 — 2026-11-27

### Public MCP

- Publish a read-only Streamable HTTP endpoint on Cloudflare Workers, backed by the existing scheduled collector and GitHub Pages feed.
- Offer five tools: compute search, exact listing details, offer comparisons, job cost estimates, and sampled price history.
- Support GPU, CPU, TPU, and sandbox discovery while preserving each category's billing units.
- Expose applied filters, explicit empty-result diagnostics, canonical GPU model and physical node-count filters, source timestamps, and freshness warnings.
- Explain comparison blockers for different units, hardware, billing, unknown configurations, stale quotes, or unavailable stock.
- Bound request bodies and upstream responses, reject JSON-RPC batches before source reads, and enforce host/origin allowlists and per-IP rate limiting.
- Keep separate production and development Worker configurations. The MCP server version is 0.3.0; the application release is 2.1.0.

### Documentation and launch

- Refresh the README under the Compute Intelligence brand, with theme-aware logos, technology badges, Product Hunt, and MCP connection instructions.
- Separate provider interpretation and deployment operations into focused guides.
- Add the MIT license text matching the existing package license declaration.
- Publish the MCP endpoint on the existing Product Hunt launch.

### Verification and limits

The public MCP was verified with all five tools against a fresh publication. Type checking, 192 tests, Pages packaging, the production dependency audit, and production Worker packaging passed before this release. Source prices and stock remain provider observations, not reservations. IP quotas are approximate per Cloudflare location; sustained distributed-load resilience is not established. See [MCP security](mcp/SECURITY.md) and [verification](mcp/VERIFICATION.md).
