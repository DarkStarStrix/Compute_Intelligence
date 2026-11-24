import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  validateSubmission,
  validateSubmissionScope,
} from "./check-provider-submissions";
const example = JSON.parse(
  readFileSync(
    new URL("../docs/provider-submission.example.json", import.meta.url),
    "utf8"
  )
);
const file = "provider-submissions/example-cloud.json";

describe("provider intake boundary", () => {
  it("accepts the documented shape and exactly one intake file", () => {
    expect(validateSubmission(file, JSON.stringify(example)).id).toBe(
      "example-cloud"
    );
    expect(validateSubmissionScope([file])).toEqual([file]);
    expect(validateSubmissionScope(["scripts/collect.ts"])).toEqual([]);
  });
  it("rejects collector, infrastructure, commercial, and other file changes in intake PRs", () => {
    for (const path of [
      "scripts/collect.ts",
      "scripts/provider-feeds.ts",
      "shared/catalog.ts",
      "refresh/wrangler.jsonc",
      ".github/workflows/pages.yml",
      "client/public/data/latest.json",
      "client/src/config/support.ts",
      "package.json",
      "README.md",
      "provider-submissions/other.json",
    ])
      expect(() => validateSubmissionScope([file, path])).toThrow(
        "exactly one"
      );
  });
  it("rejects mismatched IDs, missing fields, extra code/commercial fields, non-USD and credential URLs", () => {
    const cases = [
      { ...example, id: "other" },
      { ...example, name: "" },
      { ...example, script: "run me" },
      { ...example, affiliateUrl: "https://example.com/ref" },
      { ...example, website: "https://secret@example.com" },
      { ...example, pricing: { ...example.pricing, currency: "EUR" } },
      { ...example, source: { ...example.source, authentication: "token" } },
      { ...example, source: { ...example.source, url: "javascript:alert(1)" } },
      { ...example, sample: { ...example.sample, payload: "x".repeat(64001) } },
    ];
    for (const value of cases)
      expect(() => validateSubmission(file, JSON.stringify(value))).toThrow();
    expect(() => validateSubmission(file, "not JSON")).toThrow();
  });
});
