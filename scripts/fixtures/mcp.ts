import {
  snapshotSchema,
  type Snapshot,
  type GpuOffer,
} from "../../shared/catalog";
import type { ComputeData } from "../../mcp/service";
export const at = "2026-11-26T20:00:00.000Z",
  now = Date.parse(at);
export function fixture(): Snapshot {
  const gpu: GpuOffer = {
    offerId: "node",
    providerId: "a",
    providerName: "Alpha",
    gpuModelId: "h100-sxm",
    gpuModelName: "H100 SXM",
    gpuCount: 8,
    vramPerGpuGb: 80,
    vcpus: 64,
    ramGb: 512,
    region: "Amsterdam",
    pricePerGpuHr: 2,
    totalNodePriceHr: 16,
    availability: "available",
    providerLink: "https://alpha.example/offer",
    sourceUrl: "https://alpha.example/api",
    cloudType: "secure",
    dataSource: "api",
    observedAt: at,
    billingModel: "on-demand",
  };
  return snapshotSchema.parse({
    version: 1,
    generatedAt: at,
    sources: [
      {
        id: "a",
        name: "Alpha",
        status: "ok",
        checkedAt: at,
        lastSuccessAt: at,
        message: "",
      },
      {
        id: "b",
        name: "Beta",
        status: "error",
        checkedAt: at,
        lastSuccessAt: at,
        message: "retained",
      },
    ],
    offers: [
      gpu,
      {
        ...gpu,
        offerId: "single",
        gpuCount: 1,
        providerId: "a",
        pricePerGpuHr: 3,
        totalNodePriceHr: 3,
        availability: "unknown",
      },
      {
        ...gpu,
        offerId: "stale-cheap",
        providerId: "b",
        pricePerGpuHr: 0.1,
        totalNodePriceHr: 0.8,
      },
      {
        ...gpu,
        offerId: "unknown-spec",
        vcpus: null,
        ramGb: null,
        vramPerGpuGb: null,
        configurationKnown: false,
      },
      {
        ...gpu,
        offerId: "spot",
        gpuCount: 1,
        pricePerGpuHr: 1,
        totalNodePriceHr: 1,
        billingModel: "spot",
        availability: "limited",
      },
    ],
    compute: [
      {
        providerId: "a",
        providerName: "Alpha",
        url: "https://alpha.example/prices",
        status: "ok",
        observedAt: at,
        rates: [
          {
            id: "cpu",
            kind: "cpu",
            model: "4 vCPU",
            region: "Amsterdam",
            billing: "on-demand",
            price: 0.2,
            vcpus: 4,
            memoryGb: 8,
            availability: "unknown",
          },
          {
            id: "sandbox",
            kind: "sandbox",
            model: "Sandbox 2",
            billing: "on-demand",
            price: 0.1,
            vcpus: 2,
            memoryGb: 4,
            availability: "unknown",
            terms: "At 100% active CPU; paid plan excluded.",
          },
          {
            id: "tpu",
            kind: "tpu",
            model: "TPU v5",
            billing: "on-demand",
            price: 1.2,
            availability: "unknown",
          },
        ],
      },
    ],
    history: [
      {
        offerId: "node",
        providerId: "a",
        gpuModelId: "h100-sxm",
        cloudType: "secure",
        pricePerGpuHr: 2,
        observedAt: at,
      },
    ],
  });
}
export function dataFor(snapshot = fixture()): ComputeData {
  return {
    mode: "pinned-development-snapshot",
    current: async () => snapshot,
    history: async () => ({
      snapshotAt: snapshot.generatedAt,
      points: [],
      observations: 0,
      first: null,
      last: null,
      highUsd: null,
      lowUsd: null,
    }),
  };
}
