# Product analytics: one Worker, one database

The tracker stays on GitHub Pages. Its browser sends a few bounded interaction events to `compute-intelligence-ingest`; the separate `compute-intelligence-analytics` D1 database retains the authoritative records. Search and provider navigation do not wait for analytics. No collector, refresh or watchlist state is changed.

## Open the graphs

[Compute Intelligence — Usage](https://dash.cloudflare.com/96d5e8e196a9df28b978e555c2a6b2bb/dashboards/09767a60-b3b0-4dd9-a878-af15615b8f63) is a saved, private **Cloudflare-native dashboard**. It shows visits, visits attributed to X and provider clicks over time, plus clicks grouped by provider. Open it and choose the time range; no SQL or extra login service is required. Cloudflare account access controls visibility.

[Web Analytics visits](https://dash.cloudflare.com/96d5e8e196a9df28b978e555c2a6b2bb/web-analytics/overview/visits?siteTag~in=657f379446b948fca3bcb8b74b79c39f&excludeBots=Yes) provides the separate, longer-running traffic baseline and referrer breakdown.

The usage dashboard reads native Worker logs. After D1 commits a new session-start or provider-click event, the Worker emits only its metric name and channel or provider. Deduplicated retries emit nothing. No session/browser IDs, referrer hostnames or event bodies are copied to custom logs. These logs are best-effort receipts, not a transaction with D1; platform limits or a crash after commit can leave gaps. D1 remains the audit source.

Logs use full head sampling while traces keep their existing sample rate. Routine invocation logs are disabled to avoid unnecessary request metadata. As of November 24, 2026, Workers Free logs retain **three days**; older data is not available in these graphs. Native product graphs start at activation, without backfilling old D1 activity. Cloudflare Web Analytics and custom session counts have different collection rules and may differ. Visits are sessions, not verified unique people. X attribution includes known referrers and allowlisted campaign tags, and cannot identify every visit from an app that hides its source.

## Detailed records

There is no custom admin site, extra authentication service or Zero Trust setup. Read the reports through your existing Cloudflare account:

**Storage & databases → D1 → compute-intelligence-analytics → Console**

[Open the analytics database console](https://dash.cloudflare.com/96d5e8e196a9df28b978e555c2a6b2bb/workers/d1/databases/ae3edb39-4276-473c-b3ca-29ba94e5d532/console).

Start with `product_summary_7d` for sessions, searches, comparisons and provider clicks. `acquisition_30d` separates X traffic from other sources, and `collection_health` shows when events last arrived. Counts start at activation; sessions are visits, not verified unique people.

```sql
SELECT * FROM product_summary_7d;
SELECT * FROM product_summary_30d;
SELECT * FROM provider_clicks_30d ORDER BY outbound_actions DESC;
SELECT * FROM acquisition_30d ORDER BY sessions DESC;
SELECT * FROM unmet_demand_30d ORDER BY searches DESC;
SELECT * FROM commercial_actions_30d;
SELECT * FROM return_cohorts_30d;
SELECT * FROM collection_health;
SELECT * FROM source_status_latest;
```

These are private SQL views, not public HTTP routes. Their definitions live in one migration, `migrations/0003_native_reports.sql`. Change deployed definitions with a new migration. The browser contains no report queries, database credentials or admin controls. Existing Cloudflare Web Analytics remains the separate traffic/performance baseline.

## What the counts mean

- Events describe received browser activity, not verified people or confirmed compute purchases. Privacy tools, blocked delivery and automation affect coverage.
- A search is a committed filter state after 500 ms without changes, paired with the rendered result count. Defaults, polling, pagination, sorting and hidden tables do not create searches. No raw search text is sent.
- Ordered funnels require matching session/search IDs and increasing event sequence. Multiple provider clicks in a session do not multiply converted sessions. Retained-only results remain distinct from fresh results; prices do not prove stock.
- Referral, sponsor and Stripe actions are counted separately. Revenue comes from the actual provider/network payout report, not outbound click counts.
- Return cohorts cover opted-in browser IDs with a complete 7/30-day follow-up ending in the last 30 days. A return requires another session on a later UTC day. They do not identify people across browsers or devices.
- The independent health sampler reads the public snapshot every 15 minutes; it never dispatches collection. Its outcomes are observed snapshot-source checks, not every provider HTTP request.

## Privacy and failure behavior

Session-only is the default; a random session ID expires after 30 minutes of inactivity. Persistent browser IDs require an explicit choice in the footer's **Privacy & analytics** control and expire after 90 days. Users can disable custom events entirely; GPC/DNT also disable them. Consent changes clear queued identity and are synchronized across tabs. Blocked storage falls back to memory.

No fingerprinting, raw queries, full URLs, stored IP addresses or notification-subscription data is added. Referrer hostname, allowlisted campaign category, canonical filters and coarse server-derived country support reporting. Received records are removed by daily 90-day cleanup. A non-identifying collection-start baseline remains.

The client queues at most 40 events in memory, sends at most 10 / 16 KB per request, and makes at most two delivery attempts. No offline queue or analytics SDK is installed. The Worker validates fields, origin, timestamps and approximate per-IP/session rate limits; UUIDs deduplicate retries. IPs are only ephemeral limiter keys. Never treat these checks as proof of a human. Quota or network failures drop analytics rather than block product actions.

## Local development and checks

```sh
pnpm check
pnpm test
pnpm build:pages
pnpm dlx wrangler@4.168.0 deploy --dry-run --config analytics/wrangler.ingest.example.jsonc
```

Copy `wrangler.ingest.example.jsonc` to the ignored `wrangler.ingest.local.jsonc`. Set its site origin to the local Vite origin and use an isolated local database:

```sh
pnpm dlx wrangler@4.168.0 d1 migrations apply compute-intelligence-analytics --local --config analytics/wrangler.ingest.local.jsonc --persist-to /private/tmp/compute-analytics-state
pnpm dlx wrangler@4.168.0 dev --config analytics/wrangler.ingest.local.jsonc --port 8788 --persist-to /private/tmp/compute-analytics-state
VITE_ANALYTICS_API_URL=http://127.0.0.1:8788/api/events pnpm dev --host 127.0.0.1 --port 5176
```

No custom events are sent without `VITE_ANALYTICS_API_URL`. Do not send development events to production. Tests execute actual SQLite queries and local Workers tests; they do not establish hosted event delivery.

Regenerate bindings after config changes:

```sh
pnpm dlx wrangler@4.168.0 types analytics/ingest-env.d.ts --config analytics/wrangler.ingest.example.jsonc --env-interface AnalyticsIngestEnv --include-runtime false --include-main-module false --strict-vars false
```

## Activation and rollback

Use the already-authorized Cloudflare account and the separate analytics database. Apply the versioned migrations, deploy the single ingestion Worker, and verify its CORS behavior and private native report views. No new subscription or automatic paid-plan upgrade is needed; inspect shared account quotas before enabling traffic.

Set GitHub variable `ANALYTICS_API_URL` to `https://compute-intelligence-ingest.allanw-mk.workers.dev/api/events`. The Pages build maps it to the public `VITE_ANALYTICS_API_URL` setting. Publish the frontend only when authorized, then verify actual receipt of a small real journey. There is no historical usage backfill.

Clear the endpoint and rebuild Pages to disable custom collection. Price collection and direct provider links keep working. If the database is unavailable, health-counter writes can fail too; structured Worker logs record failures without event bodies.
