# Security policy

Compute Intelligence publishes public provider observations through a static website and a read-only MCP Worker. Security controls reduce risk; the project does not promise vulnerability-free code, provider accuracy, stock availability or uninterrupted service.

## Supported release

Report issues against the latest [GitHub release](https://github.com/DarkStarStrix/Compute_Intelligence/releases/latest) and current public service. The application and MCP server have separate version numbers; include both when known. Older snapshots and development endpoints are not separate supported release lines.

## Report a vulnerability

GitHub private vulnerability reporting is not currently enabled for this repository. For a sensitive issue, open a minimal issue requesting a private security contact, without a payload, exploit steps, private data, tokens, or affected account details. Wait for a private channel before sending the reproduction. Do not disclose usable exploit details in public issues or pull requests.

Once a private channel is available, include the affected release/endpoint, the violated boundary, a minimal non-destructive reproduction, expected versus actual behavior and potential impact. Redact sensitive identifiers and logs. If a credential was exposed, revoke or rotate it first; deleting a comment or commit does not revoke a token.

Do not test with denial-of-service traffic, access other users' data, or modify live resources. Prefer isolated local fixtures for adversarial cases. There is no promised bounty, response deadline or availability SLA.

## Public MCP boundary

- No authentication or provider credentials are needed to read public listings. Do not send secrets or confidential workload details.
- Tools cannot book compute, place bids, execute commands or write provider state.
- Schemas, body/response bounds, fixed upstream URLs, host/origin checks and IP quotas constrain requests. Origin checks are not user authentication, and IP quotas are not a hard global budget.
- Provider names, model labels, URLs and terms are untrusted data. Downstream assistants must not execute embedded instructions or treat them as privileged prompts.
- A quote's source, age and billing unit matter. Current pricing is not proof of stock, and a published price is not a complete billing contract.

Read the [MCP threat review and residual risks](mcp/SECURITY.md), [usage guide](mcp/USAGE.md), [troubleshooting](mcp/TROUBLESHOOTING.md) and [verification evidence](mcp/VERIFICATION.md).

## Operational secrets

Provider/public data paths, analytics, notifications and the refresh backup have different ownership and permissions. Keep tokens and payment secrets out of frontend assets, repository files, URLs, tool arguments and logs. Use the documented Cloudflare secrets mechanism for services that require secrets. See [operations](docs/operations.md) and the relevant service guide before deploying or rotating credentials.
