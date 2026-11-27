# Operations and deployment

## Scheduled collection and publication

GitHub Actions schedules collection at minutes **8, 23, 38 and 53** of each hour. It validates and commits observations, builds the site, and deploys GitHub Pages. Scheduled runs can be delayed or skipped; publication time and individual source observation times are separate.

The Cloudflare backup checks at minutes **12, 27, 42 and 57**. It dispatches the same GitHub workflow when the relevant slot has no successful or active run. It depends on GitHub accepting and running the dispatch; it is not a second collector.

The backup uses a repository-scoped fine-grained GitHub token with **Actions: Read and write**, stored as the Worker secret `GITHUB_ACTIONS_TOKEN`. Never commit the token or put it in client configuration. Rotate it before expiration. The Worker logs a warning during the final seven days when GitHub reports token expiry. See [`refresh/`](../refresh/) for the deployed configuration.

The app polls for a new publication every minute and when it regains focus. **Refresh** checks immediately; it does not execute provider collection. Users with repository write access can run **Refresh prices and deploy Pages** from Actions.

## Failure and freshness behavior

A successful provider refresh replaces that provider's listing set, including an authoritative empty set. A failed refresh retains the last verified offers without advancing timestamps or inventing history. A malformed previous snapshot stops collection. Provider exception text is not published. Public source evidence is retained as a one-day Actions artifact.

Quotes from failed sources or older than two hours are stale. Old stock reports are not current capacity evidence. The app labels retained prices; MCP searches exclude stale quotes by default, unless `includeStale: true` is explicit.

The existing collector retains a rolling seven-day history. Nebius also provides labeled hourly observations; other sources accumulate samples during collection. Price movers include listings that changed and later returned to their starting price.

## GitHub Pages

1. In repository **Settings → Pages**, select **GitHub Actions**.
2. Push verified changes to `main`, or run **Refresh prices and deploy Pages** manually.
3. Check both build and deployment jobs. Each deployment verifies that the public snapshot matches the revision built by that run.

The workflow uses Node 22, a frozen pnpm lockfile, type checking, tests, collection, and a Pages build. Only the build job can commit observations; only deployment receives Pages/OIDC write permissions. Public collection requires no provider API secrets.

Keep the committed snapshot and parser fixtures. They are data and verification evidence, not disposable build output.

## MCP deployment

```sh
pnpm check
pnpm check:mcp
pnpm exec wrangler deploy --config mcp/wrangler.jsonc --env production --dry-run
pnpm deploy:mcp
pnpm smoke:mcp https://compute-intelligence-mcp.allanw-mk.workers.dev/mcp
```

Deployment requires Cloudflare authorization for the intended account. Production and dev environments have separate host allowlists and rate-limit namespaces. `pnpm deploy:mcp:dev` updates only the dev Worker. The public Worker reads the fixed Pages feed; collector publications do not require a Worker redeployment.

`/health` confirms service configuration, not provider freshness. Inspect tool publication/observation timestamps and Cloudflare logs for request failures. The IP quota is approximate and per Cloudflare location, not a hard global resource budget. See [MCP documentation](../mcp/README.md), [security boundaries](../mcp/SECURITY.md), and [verification evidence](../mcp/VERIFICATION.md).

## Optional services

- [Watchlists](../alerts/README.md): background notifications require the separate Worker and browser notification permission. Restock watches require a source that reports stock.
- [Private analytics](../analytics/README.md): separate from collection and watchlists; reporting uses Cloudflare's built-in dashboards. Return-visit identifiers require user opt-in. Custom event delivery requires `ANALYTICS_API_URL` in the Pages build.
- [Project support](monetization.md): public referral, sponsorship and payment-link configuration belongs in `client/src/config/support.ts`. Never include payment secrets or payout details.

See [architecture ownership and failure contracts](../ARCHITECTURE.md) before changing collection or publication behavior.
