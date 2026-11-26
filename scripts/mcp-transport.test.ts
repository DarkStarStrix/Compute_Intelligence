import { it, expect, vi } from "vitest";
import { createWorker } from "../mcp/worker";
import { dataFor } from "./fixtures/mcp";
const env: Omit<ComputeMcpEnv, "ASSETS"> = {
  ALLOWED_ORIGINS: "http://127.0.0.1:8791",
  ALLOWED_HOSTS: "127.0.0.1:8791",
  IP_LIMIT: { limit: async () => ({ success: true }) },
};
const headers = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
  "MCP-Protocol-Version": "2025-11-25",
};
function req(method: string, params: unknown = {}, id = 1) {
  return new Request("http://127.0.0.1:8791/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
}
async function body(response: Response) {
  const text = await response.text();
  return JSON.parse(
    text.startsWith("event:") || text.startsWith("data:")
      ? text
          .split("\n")
          .find(x => x.startsWith("data:"))!
          .slice(5)
      : text
  );
}
it("initializes legacy clients and advertises exactly five typed read-only tools", async () => {
  const worker = createWorker(dataFor());
  const result = await body(
    await worker.fetch(
      req("initialize", {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      }),
      env
    )
  );
  expect(result.result.serverInfo.name).toBe("compute-intelligence");
  const list = await body(await worker.fetch(req("tools/list"), env));
  expect(list.result.tools).toHaveLength(5);
  for (const t of list.result.tools) {
    expect(t.annotations.readOnlyHint).toBe(true);
    expect(t.outputSchema).toBeDefined();
  }
});
it("returns structured results, isolates concurrent callers and rejects bad arguments", async () => {
  const w = createWorker(dataFor());
  const results = await Promise.all(
    [11, 22].map(id =>
      w
        .fetch(
          req(
            "tools/call",
            {
              name: "get_offer",
              arguments: { offerId: id === 11 ? "node" : "single" },
            },
            id
          ),
          env
        )
        .then(body)
    )
  );
  expect(results.map(r => r.id)).toEqual([11, 22]);
  expect(results.map(r => r.result.structuredContent.offer.offerId)).toEqual([
    "node",
    "single",
  ]);
  const invalid = await body(
    await w.fetch(
      req("tools/call", {
        name: "search_compute",
        arguments: { kind: "gpu", limit: 1000 },
      }),
      env
    )
  );
  expect(invalid.result?.isError || invalid.error).toBeTruthy();
});
it("fails closed on source failures and unknown offers without leaking exception details", async () => {
  const data = dataFor();
  data.current = async () => {
    throw new Error("PRIVATE_PROVIDER_TOKEN");
  };
  const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const r = await body(
      await createWorker(data).fetch(
        req("tools/call", {
          name: "get_offer",
          arguments: { offerId: "node" },
        }),
        env
      )
    );
    expect(r.result.isError).toBe(true);
    expect(JSON.stringify(r)).not.toContain("PRIVATE_PROVIDER_TOKEN");
  } finally {
    spy.mockRestore();
  }
  const missing = await body(
    await createWorker(dataFor()).fetch(
      req("tools/call", {
        name: "get_offer",
        arguments: { offerId: "missing" },
      }),
      env
    )
  );
  expect(missing.result.isError).toBe(true);
});
it("rejects hostile hosts/origins, throttles, bounds chunked bodies, and handles malformed JSON", async () => {
  const w = createWorker(dataFor());
  expect(
    (await w.fetch(new Request("http://evil.example/mcp"), env)).status
  ).toBe(403);
  expect(
    (
      await w.fetch(
        new Request("http://127.0.0.1:8791/mcp", {
          headers: { Origin: "https://evil.example" },
        }),
        env
      )
    ).status
  ).toBe(403);
  expect(
    (
      await w.fetch(req("tools/list"), {
        ...env,
        IP_LIMIT: { limit: async () => ({ success: false }) },
      })
    ).status
  ).toBe(429);
  const huge = new Request("http://127.0.0.1:8791/mcp", {
    method: "POST",
    headers,
    body: " ".repeat(20000),
  });
  expect((await w.fetch(huge, env)).status).toBe(413);
  expect(
    (
      await w.fetch(
        new Request("http://127.0.0.1:8791/mcp", {
          method: "POST",
          headers,
          body: "{",
        }),
        env
      )
    ).status
  ).toBe(400);
  expect(
    (await w.fetch(new Request("http://127.0.0.1:8791/mcp"), env)).status
  ).toBe(405);
});
