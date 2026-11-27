import { describe, it, expect } from "vitest";
import { ComputeError, createComputeService, offerView } from "../mcp/service";
import {
  searchInput,
  costInput,
  historyInput,
  compareInput,
  searchOutput,
  costOutput,
  compareOutput,
} from "../mcp/contracts";
import { estimateJobCost } from "../shared/job-cost";
import { isCurrent } from "../shared/catalog";
import { fixture, dataFor, now } from "./fixtures/mcp";
const service = () => createComputeService(dataFor(), () => now);
describe("compute query contracts", () => {
  it("enforces hard constraints, deterministic ordering and bounded pagination", async () => {
    const s = service();
    const result = await s.search(
      searchInput.parse({
        kind: "gpu",
        query: "H100",
        minVramGb: 80,
        region: "amsterdam",
        billing: "on-demand",
        limit: 1,
      })
    );
    searchOutput.parse(result);
    expect(result.total).toBe(2);
    expect(result.offers.map(x => x.offerId)).toEqual(["node"]);
    expect(result.nextOffset).toBe(1);
    expect(
      (await s.search(searchInput.parse({ kind: "gpu", region: "Europe" })))
        .total
    ).toBe(0);
    expect(
      (await s.search(searchInput.parse({ kind: "gpu", minVcpus: 9999 })))
        .offers
    ).toEqual([]);
    expect(
      (
        await s.search(searchInput.parse({ kind: "gpu", minRamGb: 512 }))
      ).offers.some(x => x.offerId === "unknown-spec")
    ).toBe(false);
  });
  it("keeps stale stock unknown, excludes stale quotes by default and agrees with site freshness", async () => {
    const snapshot = fixture(),
      s = service();
    expect(
      (await s.search(searchInput.parse({ kind: "gpu" }))).offers.some(
        x => x.offerId === "stale-cheap"
      )
    ).toBe(false);
    const stale = (await s.detail("stale-cheap")).offer;
    expect(stale).toMatchObject({
      current: false,
      availability: "unknown",
      reportedAvailability: "available",
    });
    expect(
      (
        await s.search(
          searchInput.parse({
            kind: "gpu",
            includeStale: true,
            availability: "available",
          })
        )
      ).offers.some(x => x.offerId === "stale-cheap")
    ).toBe(false);
    for (const raw of snapshot.offers)
      expect(offerView(snapshot, raw, now).current).toBe(
        isCurrent(snapshot, raw, now)
      );
    expect(
      offerView(snapshot, snapshot.offers[0], now + 3 * 3600000).current
    ).toBe(false);
  });
  it("separates all compute types and discloses units and billing assumptions", async () => {
    for (const kind of ["gpu", "cpu", "tpu", "sandbox"] as const) {
      const r = await service().search(searchInput.parse({ kind }));
      expect(r.total).toBeGreaterThan(0);
      expect(r.offers.every(o => o.kind === kind)).toBe(true);
    }
    expect((await service().detail("compute:tpu:a:tpu")).offer.unit).toBe(
      "chip-hour"
    );
    const snapshot = fixture();
    delete snapshot.offers[0].billingModel;
    expect(
      (
        await createComputeService(dataFor(snapshot), () => now).detail("node")
      ).warnings.join()
    ).toContain("omit billing model");
  });
  it("does not select a cheapest offer across billing models or incompatible units", async () => {
    const s = service();
    const mixed = await s.compare(
      compareInput.parse({ offerIds: ["node", "compute:cpu:a:cpu"] })
    );
    compareOutput.parse(mixed);
    expect(mixed.comparableUnit).toBe(false);
    expect(mixed.cheapestOfferId).toBeNull();
    expect(
      (await s.compare({ offerIds: ["node", "spot"] })).cheapestOfferId
    ).toBeNull();
    expect(
      (await s.compare({ offerIds: ["node", "stale-cheap"] })).cheapestOfferId
    ).toBeNull();
    expect(
      (await s.compare({ offerIds: ["node", "single"] })).cheapestOfferId
    ).toBe("node");
    await expect(s.compare({ offerIds: ["node", "missing"] })).rejects.toThrow(
      "No listing"
    );
  });
  it("bills whole nodes independently: 9 GPUs in 8-GPU nodes for 6 hours costs 192 USD", async () => {
    const r = await service().cost(
      costInput.parse({ offerId: "node", count: 9, hours: 6 })
    );
    costOutput.parse(r);
    expect(r).toMatchObject({
      totalUsd: 192,
      nodes: 2,
      billedGpus: 16,
      estimateOnly: true,
    });
    expect(r.totalUsd).toBe(estimateJobCost(fixture().offers[0], 9, 6)?.total);
    const snapshot = fixture();
    snapshot.offers[0].minRentalGpus = 1;
    expect(
      (
        await createComputeService(dataFor(snapshot), () => now).cost({
          offerId: "node",
          count: 9,
          hours: 6,
        })
      ).totalUsd
    ).toBe(108);
  });
  it("estimates CPU/TPU/sandbox units and preserves sandbox terms and excluded fees", async () => {
    const r = await service().cost({
      offerId: "compute:sandbox:a:sandbox",
      count: 2,
      hours: 10,
    });
    expect(r.totalUsd).toBe(2);
    expect(r.nodes).toBeNull();
    expect(r.assumptions.join()).toContain("100% active CPU");
    expect(r.exclusions.join()).toContain("Subscription");
    expect(
      (
        await service().cost({ offerId: "unknown-spec", count: 1, hours: 1 })
      ).assumptions.join()
    ).toContain("unknown");
    expect(
      (
        await service().cost({ offerId: "spot", count: 1, hours: 1 })
      ).assumptions.join()
    ).toContain("interruptions");
  });
  it("rejects unknown parameters, invalid limits, duplicate IDs and impossible inputs", () => {
    for (const args of [
      { kind: "gpu", limit: 1000 },
      { kind: "gpu", offset: -1 },
      { kind: "gpu", url: "https://evil.example" },
      { kind: "cpu", minVramGb: 80 },
    ])
      expect(searchInput.safeParse(args).success).toBe(false);
    for (const count of [0, -1, 1.5, Infinity])
      expect(
        costInput.safeParse({ offerId: "node", count, hours: 1 }).success
      ).toBe(false);
    expect(compareInput.safeParse({ offerIds: ["node", "node"] }).success).toBe(
      false
    );
    expect(
      historyInput.safeParse({ offerId: "node", hours: 169 }).success
    ).toBe(false);
  });
  it("makes missing history explicit and rejects revision mismatch", async () => {
    const r = await service().history(historyInput.parse({ offerId: "node" }));
    expect(r.observations).toBe(0);
    expect(r.changePercent).toBeNull();
    const data = dataFor();
    data.history = async () => ({
      snapshotAt: "old",
      points: [],
      observations: 0,
      first: null,
      last: null,
      highUsd: null,
      lowUsd: null,
    });
    await expect(
      createComputeService(data, () => now).history(
        historyInput.parse({ offerId: "node" })
      )
    ).rejects.toThrow("revisions differ");
  });
});

it("retries one catalog/history publication race using a cache-bypassed catalog", async () => {
  const old = fixture(),
    next = fixture();
  next.generatedAt = new Date(now + 1000).toISOString();
  const data = dataFor(old),
    refreshes: boolean[] = [];
  let calls = 0;
  data.current = async refresh => {
    refreshes.push(!!refresh);
    return refresh ? next : old;
  };
  data.history = async s => {
    calls++;
    if (calls === 1)
      throw new ComputeError("snapshot_changed", "Publication changed");
    return {
      snapshotAt: s.generatedAt,
      points: [],
      observations: 0,
      first: null,
      last: null,
      highUsd: null,
      lowUsd: null,
    };
  };
  const result = await createComputeService(data, () => now + 1000).history(
    historyInput.parse({ offerId: "node" })
  );
  expect(result.snapshotAt).toBe(next.generatedAt);
  expect(refreshes).toEqual([false, true]);
  expect(calls).toBe(2);
  data.history = async () => {
    throw new ComputeError("snapshot_changed", "Publication still changing");
  };
  await expect(
    createComputeService(data, () => now).history(
      historyInput.parse({ offerId: "node" })
    )
  ).rejects.toThrow("Publication still changing");
});
