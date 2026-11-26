import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { performance } from "node:perf_hooks";
const endpoint = process.argv[2] ?? "http://127.0.0.1:8791/mcp";
if (!/^https?:\/\//.test(endpoint))
  throw new Error("Provide an HTTP MCP endpoint");
const client = new Client({
  name: "compute-intelligence-smoke",
  version: "0.1.0",
});
await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
try {
  const tools = await client.listTools();
  console.log("Tools:", tools.tools.map(t => t.name).join(", "));
  async function call(name: string, args: Record<string, unknown>) {
    const start = performance.now();
    const r = await client.callTool({ name, arguments: args });
    console.log(
      JSON.stringify({
        tool: name,
        ms: Math.round(performance.now() - start),
        isError: r.isError ?? false,
        bytes: JSON.stringify(r).length,
      })
    );
    if (r.isError) throw new Error(JSON.stringify(r.content));
    return r.structuredContent as Record<string, unknown>;
  }
  const search = await call("search_compute", {
    kind: "gpu",
    query: "H100",
    billing: "on-demand",
    limit: 3,
  });
  const offers = search.offers as {
    offerId: string;
    current: boolean;
    observedAt: string;
  }[];
  if (offers.length < 2)
    throw new Error("Need two fresh H100 listings for smoke test");
  console.log("Snapshot:", search.snapshotAt, "first offer:", offers[0]);
  await call("get_offer", { offerId: offers[0].offerId });
  await call("compare_offers", {
    offerIds: offers.slice(0, 2).map(x => x.offerId),
  });
  const cost = await call("estimate_job_cost", {
    offerId: offers[0].offerId,
    count: 9,
    hours: 6,
  });
  console.log("Compute estimate USD:", cost.totalUsd);
  const history = await call("get_price_history", {
    offerId: offers[0].offerId,
    hours: 24,
    maxPoints: 20,
  });
  console.log(
    "Recorded observations:",
    history.observations,
    "returned:",
    (history.points as unknown[]).length
  );
  for (const kind of ["cpu", "tpu", "sandbox"])
    await call("search_compute", { kind, limit: 2 });
} finally {
  await client.close();
}
