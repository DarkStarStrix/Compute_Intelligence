# Provider intake — data only

This directory is an inbox for reviewed provider submissions. Files here are **not loaded by the collector or website**. A merged submission is not a live listing.

1. Copy `docs/provider-submission.example.json` to `provider-submissions/<your-provider-id>.json`.
2. Replace every example with verified public information and a small sanitized response sample. Only public, unauthenticated USD sources use this fast path. Discuss other requirements in a provider issue first.
3. Validate locally:

   ```sh
   pnpm exec tsx scripts/check-provider-submissions.ts provider-submissions/your-provider-id.json
   ```

4. Open a PR with the provider template. **Change only your one JSON file.** Updates use the same ID and filename. Schema fields are exact; arbitrary code, payment/referral fields, and extra keys are rejected.
5. The PR check validates the submission and rejects additional file changes. It does not contact the provider, execute submitted code, or publish anything. Maintainer review still checks source authenticity, correctness, collection permission, links, and sample sanitization.
6. The maintainer wires and tests a new adapter in a separate integration PR. Existing adapters can be reused where compatible; this is not automatic merge or automatic publication.

Do not change collector code, schemas, pricing calculations, schedules, workflows, refresh/alert infrastructure, snapshots, UI, logos, dependencies, or sponsorship settings in an intake PR. Logo work and other changes can follow separately after review.

Sponsorship and paid featuring belong in the sponsorship inquiry, never this file. Technical acceptance does not require payment. A paid placement must be separately labeled and must not alter price comparisons, stock, organic ordering, or source freshness.
