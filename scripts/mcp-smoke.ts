import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { performance } from "node:perf_hooks";
import type { z } from "zod";
import {
  searchOutput,
  detailOutput,
  compareOutput,
  costOutput,
  historyOutput,
} from "../mcp/contracts";
import { pathToFileURL } from "node:url";

export async function exerciseComputeTools(
  client: Client,
  minimumSnapshotAt?: string
) {
  const tools = await client.listTools();
  const names = tools.tools.map(t => t.name).sort();
  if (
    JSON.stringify(names) !==
    JSON.stringify([
      "compare_offers",
      "estimate_job_cost",
      "get_offer",
      "get_price_history",
      "search_compute",
    ])
  )
    throw new Error("Unexpected tool inventory");
  console.log("Tools:", names.join(", "));
  async function call<O extends z.ZodType>(
    name: string,
    args: Record<string, unknown>,
    schema: O
  ) {
    const start = performance.now(),
      result = await client.callTool({ name, arguments: args });
    if (result.isError) throw new Error(JSON.stringify(result.content));
    const data = schema.parse(result.structuredContent);
    const metadata = searchOutput
      .pick({ dataMode: true, snapshotAt: true })
      .parse(data);
    if (Date.now() - Date.parse(metadata.snapshotAt) > 30 * 60000)
      throw new Error(
        "Smoke test requires a recent live publication (<30 minutes)"
      );
    if (
      minimumSnapshotAt &&
      Date.parse(metadata.snapshotAt) < Date.parse(minimumSnapshotAt)
    )
      throw new Error(
        "A tool returned an older publication after observing the refresh"
      );
    console.log(
      JSON.stringify({
        tool: name,
        ms: Math.round(performance.now() - start),
        snapshotAt: metadata.snapshotAt,
        dataMode: metadata.dataMode,
      })
    );
    return data;
  }
  const search = await call(
    "search_compute",
    { kind: "gpu", query: "H100", billing: "on-demand", limit: 3 },
    searchOutput
  );
  if (search.offers.length < 2 || search.offers.some(o => !o.current))
    throw new Error("Need two fresh H100 listings");
  const id = search.offers[0].offerId;
  await call("get_offer", { offerId: id }, detailOutput);
  await call(
    "compare_offers",
    { offerIds: search.offers.slice(0, 2).map(o => o.offerId) },
    compareOutput
  );
  const cost = await call(
    "estimate_job_cost",
    { offerId: id, count: 9, hours: 6 },
    costOutput
  );
  console.log("Compute estimate USD:", cost.totalUsd);
  const history = await call(
    "get_price_history",
    { offerId: id, hours: 24, maxPoints: 20 },
    historyOutput
  );
  console.log(
    "Recorded observations:",
    history.observations,
    "returned:",
    history.points.length
  );
  for (const kind of ["cpu", "tpu", "sandbox"])
    await call("search_compute", { kind, limit: 2 }, searchOutput);
  return search.snapshotAt;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const endpoint = process.argv[2] ?? "http://127.0.0.1:8791/mcp";
  if (!/^https?:\/\//.test(endpoint))
    throw new Error("Provide an HTTP MCP endpoint");
  const client = new Client({
    name: "compute-intelligence-smoke",
    version: "0.2.0",
  });
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
  try {
    await exerciseComputeTools(client);
  } finally {
    await client.close();
  }
}
