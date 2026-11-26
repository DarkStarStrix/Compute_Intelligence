import { createMcpHandler } from "@modelcontextprotocol/server";
import type { ExecutionContext } from "@cloudflare/workers-types";
import { createServer } from "./server";
import { createPublishedData } from "./data";

// A new SDK server per exchange prevents request or client state leaking between callers.
export function createWorker(data?: Parameters<typeof createServer>[0]) {
  function handlerFor(
    env: Omit<ComputeMcpEnv, "ASSETS"> & Partial<Pick<ComputeMcpEnv, "ASSETS">>
  ) {
    let source = data;
    if (!source) {
      const assets = env.ASSETS;
      if (!assets) throw new Error("MCP snapshot assets are not bound");
      source = createPublishedData(
        input => assets.fetch(input),
        "https://mcp-data.invalid/",
        "pinned-development-snapshot"
      );
    }
    const requestData = source;
    return createMcpHandler(() => createServer(requestData), {
      legacy: "stateless",
      maxRequestBodySize: 16384,
      maxSubscriptions: 0,
    });
  }
  return {
    async fetch(
      request: Request,
      env: Omit<ComputeMcpEnv, "ASSETS"> &
        Partial<Pick<ComputeMcpEnv, "ASSETS">>,
      _ctx?: ExecutionContext
    ): Promise<Response> {
      const url = new URL(request.url);
      const origin = request.headers.get("Origin");
      const allowed = env.ALLOWED_ORIGINS.split(",").map(x => x.trim());
      if (origin && !allowed.includes(origin))
        return Response.json({ error: "Origin not allowed" }, { status: 403 });
      if (
        !env.ALLOWED_HOSTS.split(",")
          .map(x => x.trim())
          .includes(url.host)
      )
        return Response.json({ error: "Host not allowed" }, { status: 403 });
      const headers = new Headers({
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      });
      if (origin) {
        headers.set("Access-Control-Allow-Origin", origin);
        headers.set("Vary", "Origin");
      }
      if (url.pathname === "/health")
        return Response.json(
          {
            service: "compute-intelligence-mcp",
            environment: "development",
            version: "0.1.0",
            readOnly: true,
            dataMode: "pinned-development-snapshot",
          },
          { headers }
        );
      if (url.pathname !== "/mcp")
        return new Response("Not found", { status: 404, headers });
      if (request.method === "OPTIONS") {
        headers.set(
          "Access-Control-Allow-Methods",
          "POST, GET, DELETE, OPTIONS"
        );
        headers.set(
          "Access-Control-Allow-Headers",
          "Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id"
        );
        return new Response(null, { status: 204, headers });
      }
      const ip = request.headers.get("CF-Connecting-IP") ?? "local";
      if (!(await env.IP_LIMIT.limit({ key: ip })).success) {
        headers.set("Retry-After", "60");
        return new Response("Rate limit exceeded", { status: 429, headers });
      }
      const started = Date.now();
      try {
        const response = await handlerFor(env).fetch(request);
        const out = new Response(response.body, response);
        headers.forEach((v, k) => out.headers.set(k, v));
        console.log({
          event: "mcp_request",
          status: response.status,
          transportSetupMs: Date.now() - started,
        });
        return out;
      } catch {
        console.warn({ event: "mcp_request_failed" });
        return Response.json(
          { error: "MCP request failed" },
          { status: 500, headers }
        );
      }
    },
  };
}
export default createWorker();
