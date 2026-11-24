## Provider submission — free technical track

<!-- Copy docs/provider-submission.example.json to provider-submissions/<id>.json. Change only that file. Read provider-submissions/README.md. This submission does not itself create a live listing. -->

- Provider name:
- Submission file:
- New submission / update:
- Your relationship to the provider:
- Related provider issue (if any):

## Review summary

- Official source and human-facing pricing page:
- Raw-to-normalized pricing example:
- Stock reported, or unknown:
- Known limitations:

## Checklist

- [ ] This PR changes exactly one `provider-submissions/<id>.json` file.
- [ ] All example values have been replaced with verified public information.
- [ ] The source is first-party, public, unauthenticated, and priced in USD.
- [ ] The public sample has no credentials, private account data, or personal information.
- [ ] `pnpm exec tsx scripts/check-provider-submissions.ts provider-submissions/<id>.json` passed (use the actual filename).
- [ ] No collector/runtime, workflow, snapshot, dependency, UI, or payment/referral settings changed.
- [ ] I understand maintainer review and a separate adapter integration are required before this appears live.

Actual validation result and anything not verified:

<!-- Sponsorship and paid featuring use the separate sponsorship inquiry; payment is not required for inclusion. -->
