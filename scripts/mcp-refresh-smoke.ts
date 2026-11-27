import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { setTimeout } from "node:timers/promises";
import { searchOutput } from "../mcp/contracts";
import { exerciseComputeTools } from "./mcp-smoke";
const endpoint = process.argv[2] ?? "http://127.0.0.1:8791/mcp";
const client = new Client({
  name: "compute-intelligence-auto-refresh-check",
  version: "0.2.0",
});
await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
async function search() {
  const result = await client.callTool({
    name: "search_compute",
    arguments: { kind: "gpu", query: "H100", limit: 2 },
  });
  if (result.isError) throw new Error(JSON.stringify(result.content));
  return searchOutput.parse(result.structuredContent);
}
try {
  const first = await search();
  console.log(
    JSON.stringify({
      event: "watching_automatic_publication",
      snapshotAt: first.snapshotAt,
      endpoint,
    })
  );
  const deadline = Date.now() + 20 * 60000;
  let refreshed = false;
  while (Date.now() < deadline) {
    await setTimeout(30000);
    const next = await search();
    if (Date.parse(next.snapshotAt) <= Date.parse(first.snapshotAt)) continue;
    console.log(
      JSON.stringify({
        event: "automatic_refresh_observed",
        before: first.snapshotAt,
        after: next.snapshotAt,
        sameClientConnection: true,
      })
    );
    await exerciseComputeTools(client, next.snapshotAt);
    refreshed = true;
    break;
  }
  if (!refreshed)
    throw new Error("No newer publication observed in 20 minutes");
} finally {
  await client.close();
}
