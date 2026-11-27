# Contributing to Compute Intelligence

Provider integrations, corrections, and usability improvements are welcome. You do not need to sponsor the project or join an affiliate program to be listed. Contributions and commercial relationships do not influence prices, rankings, or coverage.

## Two separate tracks

**Free provider integration:** submit one standardized JSON file through the [provider intake process](provider-submissions/README.md), using the [provider PR template](https://github.com/DarkStarStrix/Compute_Intelligence/compare?expand=1&template=provider.md). Copy `docs/provider-submission.example.json`, replace its examples, and validate it locally. The intake check rejects any additional changed files, including collector and infrastructure code. A maintainer handles adapter wiring and tests in a separate PR before the provider goes live. No automatic merging or listing is promised.

**Sponsorship and paid featuring:** use the [sponsorship inquiry](https://github.com/DarkStarStrix/Compute_Intelligence/issues/new?template=sponsorship.yml). Commercial terms, payment/referral configuration, and paid placements do not belong in provider intake PRs. Agreed placements must be clearly labeled and separate from organic price ordering. Paying does not change technical acceptance, pricing, stock, or collection priority.

No code ready? Use the [provider request form](https://github.com/DarkStarStrix/Compute_Intelligence/issues/new?template=provider.yml). Disclose your relationship to the provider. Start with [provider intake](provider-submissions/README.md); the [adapter guide](docs/provider-onboarding.md) is for the maintainer's separate integration work.

The intake workflow must be published on the default branch before it can validate incoming PRs. Make its `validate` check required in repository branch protection/rulesets if you want GitHub to prevent merging a failing intake PR. This local change does not configure repository rules or enable automatic merges.

## Local development

Use Node 22.12+ and pnpm 10.4.1:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The committed snapshot lets you run the dashboard without credentials. Before submitting:

```sh
pnpm check
pnpm test
pnpm build:pages
```

For a focused parser check, use `pnpm exec vitest run scripts/your-provider.test.ts` with your actual test filename. Tests should run offline against small public fixtures. A live provider check is additional evidence, not a replacement for deterministic tests.

Keep PRs scoped. Include what changed, the source used, test results, and any known limitations. Do not include credentials, account-specific responses, unrelated formatting, build output, or regenerated production snapshots. `pnpm collect` contacts all configured public sources and rewrites `client/public/data/latest.json`; it is not needed for routine UI development or offline tests. Inspect the diff before submitting.

See [ARCHITECTURE.md](ARCHITECTURE.md) for ownership and failure contracts. Security reports must not include usable secrets or private account data in public issues or PRs; rotate exposed credentials before discussing a redacted reproduction.
