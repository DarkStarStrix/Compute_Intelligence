# Affiliate and referral launch shortlist

Verified from first-party program pages on November 24, 2026. These are program/application links, not Allan's earning links. No account has been enrolled and no commission is active just because a provider is listed here. Confirm terms and eligible products in the approved account before activation.

## Start here

### DigitalOcean — apply first for cash revenue

[Official program](https://www.digitalocean.com/affiliates) · [Current application/network listing](https://ui.awin.com/merchant-profile/123996)

The official program offers 10% of a new paying customer's monthly spend for the first 12 months. Its linked Awin profile states a 30-day attribution window. DigitalOcean's page still mentions CJ in older body copy, but its current application button leads to Awin; use that first-party application path.

Apply with Compute Intelligence's public website and explain that it compares GPU/CPU/sandbox listings from official sources, preserves organic ordering, and labels paid referral actions. After acceptance, generate your publisher-specific link in Awin. Confirm GPU Droplet, bare-metal GPU, and other product eligibility; do not assume Paperspace is covered by a DigitalOcean agreement. Set the app's reward type to `commission` only for the actual approved arrangement.

### RunPod — immediate credits; cash after qualification

[Official referral documentation](https://docs.runpod.io/accounts-billing/referrals) · [Program overview](https://www.runpod.io/referral-and-affiliate-program) · [Account referral dashboard](https://console.runpod.io/user/referrals)

The standard program pays RunPod credits: 3% of Pod usage and 5% of Serverless usage for each new referral's first six months. Current eligibility includes first-time users, Google SSO, and at least $10 loaded. Usage commissions are based on consumed compute, not simply a credit purchase. Bonus credits are conditional and should never be promoted as a guaranteed $500.

After 25 paying referrals, the affiliate tier offers 10% cash commissions for six months through PartnerStack. The official docs say that choosing the affiliate upgrade is permanent. Start with your own dashboard's unique link and configure `credits`; switch the disclosure to `commission` only after your cash agreement is actually active. Never use the sample code printed in documentation or another publisher's link.

### Vast.ai — cash-eligible, with account restrictions

[Official referral program and link instructions](https://docs.vast.ai/guides/reference/referral-program)

The published program awards 3% of referred customers' lifetime spend in referral credits; eligible accounts can cash out 75% of those credits via Stripe Connect, PayPal, or Wise. For illustration, 3% × 75% is 2.25% of referred spend as cash before any applicable fees/taxes. That is a calculation from the published terms, not a separate advertised commission rate.

The docs recommend a dedicated referral account for cash eligibility. An account with rental/hosting history can face a lifetime-spend hurdle before cash withdrawal. Do not create multiple referral accounts or attempt to evade the program's restrictions. Retrieve your approved unique link under account Settings → Referral Link. Configure `commission-or-credits` only after confirming the account's payout eligibility. Vast's rules also restrict paid ads using its brand terms and direct-link advertising.

Vast is not in the current verified collector registry. A commercial link must not pretend that a live price integration exists. Complete free technical onboarding separately before showing a provider-card referral action.

## Partnership conversations, not published self-service cash terms

### Latitude.sh

[Current partner program](https://www.latitude.sh/partners) explicitly offers referral fees on closed deals. The current page does not publish a standard percentage or attribution window. Propose an advisory/referral or technology partnership using aggregate provider-demand evidence once real analytics exists. Agree tracking, qualifying products, payouts, and terms before adding a paid link. Do not substitute the older 2023 credit promotion for the current commercial program.

### Civo

[Current partner program](https://www.civo.com/partners) includes an advisory/referral role and application developers. It does not publish a universal publisher commission rate. Discuss the compute-discovery use case with the partner team; do not advertise a cash percentage without an agreement. Its separate writing program is not an affiliate program.

## Do not activate on old or missing evidence

- **Hetzner:** its [official Cloud FAQ](https://docs.hetzner.com/cloud/general/faq/) says the former referral-credit program is discontinued. Old codes are not an onboarding route.
- **Vultr:** official older posts describe historic referral promotions, but the current public terms/rate could not be verified in this pass. Verify the logged-in referral dashboard or obtain current terms before promising a reward.
- **Lambda, Hyperstack, Nebius, E2B, Daytona, Vercel, Cloudflare and other listed providers:** no standard cash affiliate arrangement was verified in this pass. That does not establish that none exists. Use their official partnership contacts and keep ordinary source/listing links unchanged while investigating.

## Link activation and UX

1. Obtain your own approved, public earning URL. Account creation, tax/payment setup, and accepting the provider/network agreement are owner actions; never send tokens or payout details into this repository.
2. Enter only that public URL and its actual reward type in `client/src/config/support.ts` under `referrals`. Blank configuration remains inactive. The existing Support panel, matching provider profile and comparison detail reuse the same configuration.
3. Keep the exact offer/pricing/source destination direct. Use the separate optional signup action with the nearby “Paid referral link” disclosure and accurate cash/credit wording. Do not automatically rewrite every Open button, route links through a tracking redirect, or change result ordering.
4. Confirm the provider's allowed deep-link/sub-ID rules before adding parameters. Do not invent a link format or attach browser/session IDs to provider URLs.
5. Track the outbound commercial action in private backend reports. A click is not a signup, rental, commission or payout. Reconcile confirmed revenue against the provider/network dashboard.

Direct project support goes to the owner's Stripe Payment Link. Affiliate commissions are paid through each program's own process; they do not automatically flow into that Stripe link. Sponsor placement is a separate, clearly labeled agreement and does not buy technical inclusion or organic ranking.
