/** Offline contribution intake only. Never imported by the collector or dashboard. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const text = z.string().trim().min(1).max(2000);
const publicHttps = z.url().refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "Use a public HTTPS URL without credentials");
export const providerSubmissionSchema = z.strictObject({
  version: z.literal(1),
  id: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(60),
  name: text,
  website: publicHttps,
  relationship: z.enum(["independent", "provider-representative", "other"]),
  computeKinds: z.array(z.enum(["gpu", "cpu", "tpu", "sandbox"])).min(1),
  pricingUrl: publicHttps,
  source: z.strictObject({
    url: publicHttps,
    format: z.enum(["json", "html"]),
    authentication: z.literal("none"),
    collectionPermission: text,
    rateLimits: text,
    pagination: text,
    stockReporting: text,
  }),
  pricing: z.strictObject({
    currency: z.literal("USD"),
    billingUnit: text,
    normalizationExample: text,
    configuration: text,
    regions: z.array(text).min(1),
    billingModels: z.array(z.enum(["on-demand", "spot"])).min(1),
    minimumRentalAndFees: text,
  }),
  sample: z.strictObject({
    retrievedAt: z.iso.datetime(),
    payload: z.string().min(1).max(64000),
  }),
  limitations: text,
});

export function validateSubmission(path: string, contents: string) {
  const parsed = providerSubmissionSchema.parse(JSON.parse(contents));
  if (path !== `provider-submissions/${parsed.id}.json`)
    throw new Error("Submission filename must match its provider ID");
  return parsed;
}

export function validateSubmissionScope(paths: string[]) {
  const submissions = paths.filter(path =>
    /^provider-submissions\/[^/]+\.json$/.test(path)
  );
  if (!submissions.length) return [];
  if (submissions.length !== 1 || paths.length !== 1)
    throw new Error(
      "Provider intake PRs must change exactly one provider-submissions/<id>.json file. Collector, runtime, workflows, snapshots, sponsorship settings, and other files require a separate maintainer PR."
    );
  return submissions;
}

function git(...args: string[]) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 1_000_000 });
}

function main(args: string[]) {
  if (args.length === 1) {
    validateSubmission(args[0], readFileSync(args[0], "utf8"));
    console.log("Provider submission is valid (offline intake only).");
    return;
  }
  const [base, head] = args;
  if (
    args.length !== 2 ||
    ![base, head].every(sha => /^[a-f0-9]{40}$/.test(sha))
  )
    throw new Error(
      "Usage: check-provider-submissions.ts <file> OR <base-sha> <head-sha>"
    );
  const paths = git(
    "diff",
    "--name-only",
    "-z",
    "--no-renames",
    `${base}...${head}`
  )
    .split("\0")
    .filter(Boolean);
  const submissions = validateSubmissionScope(paths);
  for (const path of submissions) {
    const size = Number(git("cat-file", "-s", `${head}:${path}`).trim());
    if (size > 100_000) throw new Error("Provider submission exceeds 100 KB");
    validateSubmission(path, git("show", `${head}:${path}`));
  }
  console.log(
    submissions.length
      ? "Provider intake passed. No collector or runtime files changed. Maintainer integration is still required."
      : "No provider intake files changed; this is outside the provider fast path."
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2));
}
