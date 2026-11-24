# Support and sponsorship

Edit `client/src/config/support.ts`. These settings are public and bundled into the website. Never add secret keys, access tokens, payout details, or private contact information.

## Direct contributions

Set `stripeUrl` to your public `https://buy.stripe.com/...` or `https://donate.stripe.com/...` Payment Link. Create a one-time customer-chosen-amount link in Stripe. Leave it blank until ready; no payment button appears without a valid link. Stripe opens only when clicked. No payment SDK, backend, or automatic payment request is added.

## Sponsorship inquiries

Set `sponsorshipUrl` to a public HTTPS contact page or `mailto:you@example.com`. If blank, the Support panel links to the repository's public sponsorship issue form. The fallback is labeled public and asks visitors not to submit private budgets, contact information, or payment details. No message is sent automatically.

Sponsorship offers a clearly labeled project acknowledgment. Agree placement, duration, fees, and disclosure individually. Do not promise traffic, impressions, exclusivity, or changes to provider rankings.

## Provider referrals

Add approved links to `referrals`:

```ts
{
  providerId: "runpod",
  providerName: "RunPod",
  signupUrl: "https://runpod.io/?ref=YOUR_APPROVED_CODE",
  reward: "credits",
}
```

Use the actual approved URL and current payout type: `credits`, `commission`, or `commission-or-credits`. Do not assume rewards apply to existing users or all products.

Links appear in the Support panel, matching provider profiles, and matching comparison details. They are separate account-signup actions. Exact listing and source URLs retain their destinations. Paid links use `rel="sponsored noopener noreferrer"` and visible commission/credit disclosures. Empty or invalid links are hidden. Providers without commercial relationships remain listed normally.

## Sponsor acknowledgments

Add only active, agreed sponsors to `sponsors`:

```ts
{ name: "Confirmed sponsor name", url: "https://sponsor.example" }
```

All configured sponsors appear in Support. Up to three appear in a compact, labeled acknowledgment below Quick Comparison on Overview. Remove expired agreements from the configuration. Sponsor settings do not participate in collector, ranking, filtering, or chart calculations.

## Verification and activation

Run `pnpm check`, `pnpm test`, and `pnpm build:pages`. Check desktop/mobile rendering, Escape and focus restoration, and the real public URLs before deployment. Stripe handles direct contributions; each affiliate provider retains its own payout process. Deploy through the existing Pages workflow only when authorized.

## Separate from provider onboarding

Free technical submissions use `provider-submissions/<id>.json` and the provider PR template. Sponsorship and paid featuring use the sponsorship inquiry. The provider intake check rejects changes to commercial settings, collector code, runtime files, workflows, and snapshots in an intake PR.

Paid featuring can be discussed in the inquiry; there is no automated paid listing or featured-offer ranking. Agree any placement separately and label it clearly as sponsored. The existing sponsor acknowledgment area is available without changing offer sorting. A new placement requires its own reviewed UI change. Payment never changes source data, stock, collection cadence, or organic comparison order.
