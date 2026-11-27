import { it, expect } from "vitest";
import { createComputeService } from "../mcp/service";
import { searchInput, searchOutput, compareOutput } from "../mcp/contracts";
import { fixture, dataFor, now } from "./fixtures/mcp";

it("filters physical GPU configuration and canonical model without accepting unknown specs", async () => {
  const s = createComputeService(dataFor(), () => now);
  const r = await s.search(
    searchInput.parse({
      kind: "gpu",
      gpuModelId: "h100-sxm",
      minGpuCount: 8,
      maxGpuCount: 8,
    })
  );
  expect(r.offers.map(o => o.offerId)).toEqual(["node"]);
  expect(r.offers[0].gpuModelId).toBe("h100-sxm");
  expect(searchInput.safeParse({ kind: "cpu", minGpuCount: 1 }).success).toBe(
    false
  );
  expect(
    searchInput.safeParse({ kind: "gpu", minGpuCount: 8, maxGpuCount: 2 })
      .success
  ).toBe(false);
});
it("explains empty exact-region matches without relaxing filters", async () => {
  const s = createComputeService(dataFor(), () => now);
  const r = searchOutput.parse(
    await s.search(searchInput.parse({ kind: "gpu", region: "Europe" }))
  );
  expect(r.offers).toEqual([]);
  expect(r.diagnostics.reason).toBe("no_filter_matches");
  expect(r.diagnostics.rejectedByFilter.region).toBeGreaterThan(0);
  expect(r.appliedFilters.region).toBe("Europe");
  expect(r.diagnostics.suggestions.join()).toContain("exact");
});
it("distinguishes matching retained quotes, a missing compute kind and an exhausted page", async () => {
  const snapshot = fixture();
  const s = createComputeService(dataFor(snapshot), () => now);
  const stale = await s.search(
    searchInput.parse({ kind: "gpu", providerId: "b" })
  );
  expect(stale.total).toBe(0);
  expect(stale.diagnostics.reason).toBe("only_stale_matches");
  expect(stale.diagnostics.matchingStaleListings).toBe(1);
  const page = await s.search(searchInput.parse({ kind: "gpu", offset: 100 }));
  expect(page.diagnostics.reason).toBe("page_out_of_range");
  expect(page.total).toBeGreaterThan(0);
  snapshot.compute = [];
  expect(
    (await s.search(searchInput.parse({ kind: "cpu" }))).diagnostics.reason
  ).toBe("no_listings_for_kind");
});
it("reports an empty catalog and unavailable current data explicitly", async () => {
  const snapshot = fixture();
  const s = createComputeService(dataFor(snapshot), () => now + 3 * 3600000);
  expect(
    (await s.search(searchInput.parse({ kind: "gpu" }))).diagnostics.reason
  ).toBe("only_stale_matches");
  snapshot.offers = [];
  snapshot.compute = [];
  expect(
    (await s.search(searchInput.parse({ kind: "gpu" }))).diagnostics.reason
  ).toBe("empty_catalog");
});
it("does not rank different hardware behind identical display names", async () => {
  const snapshot = fixture();
  snapshot.offers[1].gpuModelId = "h100-pcie";
  const s = createComputeService(dataFor(snapshot), () => now);
  const r = compareOutput.parse(
    await s.compare({ offerIds: ["node", "single"] })
  );
  expect(r.cheapestOfferId).toBeNull();
  expect(r.comparisonBlockers).toContain("different_models");
});
it("does not rank different or missing required memory specifications as equivalent", async () => {
  const snapshot = fixture();
  const s = createComputeService(dataFor(snapshot), () => now);
  snapshot.offers[1].vramPerGpuGb = 94;
  expect(
    (await s.compare({ offerIds: ["node", "single"] })).comparisonBlockers
  ).toContain("different_specs");
  snapshot.offers[1].vramPerGpuGb = null;
  const r = await s.compare({ offerIds: ["node", "single"] });
  expect(r.cheapestOfferId).toBeNull();
  expect(r.comparisonBlockers).toContain("unknown_configuration");
});
it("identifies unknown required specs and preserves literal query semantics", async () => {
  const s = createComputeService(dataFor(), () => now);
  const r = await s.search(searchInput.parse({ kind: "gpu", minVramGb: 80 }));
  expect(r.diagnostics.missingRequiredSpecs).toBe(1);
  expect(
    (await s.search(searchInput.parse({ kind: "gpu", query: ".*" }))).total
  ).toBe(0);
  expect(
    (await s.search(searchInput.parse({ kind: "gpu", query: "h100-sxm" })))
      .total
  ).toBeGreaterThan(0);
});

it("checks CPU configuration before choosing a lowest quote", async () => {
  const snapshot = fixture();
  const rates = snapshot.compute![0].rates;
  const cpu = rates.find(r => r.kind === "cpu")!;
  rates.push({ ...cpu, id: "cpu-other", memoryGb: 16, price: 0.1 });
  const s = createComputeService(dataFor(snapshot), () => now);
  const ids = ["compute:cpu:a:cpu", "compute:cpu:a:cpu-other"];
  expect((await s.compare({ offerIds: ids })).cheapestOfferId).toBeNull();
  expect((await s.compare({ offerIds: ids })).comparisonBlockers).toContain(
    "different_specs"
  );
  rates.at(-1)!.memoryGb = 8;
  expect((await s.compare({ offerIds: ids })).cheapestOfferId).toBe(ids[1]);
});
it("keeps stale-stock filters strict and explains source failure without claiming missing supply", async () => {
  const snapshot = fixture();
  const s = createComputeService(dataFor(snapshot), () => now);
  const retained = await s.search(
    searchInput.parse({ kind: "gpu", providerId: "b", includeStale: true })
  );
  expect(retained.diagnostics.reason).toBe("results");
  expect(retained.offers[0].availability).toBe("unknown");
  const available = await s.search(
    searchInput.parse({
      kind: "gpu",
      providerId: "b",
      includeStale: true,
      availability: "available",
    })
  );
  expect(available.total).toBe(0);
  snapshot.sources.forEach(source => (source.status = "error"));
  const none = await s.search(
    searchInput.parse({ kind: "gpu", query: "nonexistent" })
  );
  expect(none.diagnostics.reason).toBe("no_current_listings");
  expect(none.offers).toEqual([]);
});

it("does not treat matching unspecified GPU variants as verified equivalents", async () => {
  const snapshot = fixture();
  const s = createComputeService(dataFor(snapshot), () => now);
  for (const model of [
    "h100-unspecified",
    "h200-unspecified",
    "a100-80",
    "a100-sxm-unknown",
  ]) {
    snapshot.offers[0].gpuModelId = model;
    snapshot.offers[1].gpuModelId = model;
    const r = await s.compare({ offerIds: ["node", "single"] });
    expect(r.cheapestOfferId).toBeNull();
    expect(r.comparisonBlockers).toContain("unknown_model_variant");
  }
});
