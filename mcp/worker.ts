import { createMcpHandler } from "@modelcontextprotocol/server";
import type { ExecutionContext } from "@cloudflare/workers-types";
import { createServer } from "./server";
import { createPublishedData } from "./data";
import { readBounded } from "../analytics/http";

// A new SDK server per exchange prevents request or client state leaking between callers.
export function createWorker(data?: Parameters<typeof createServer>[0]) {
  const handler = createMcpHandler(
    () => createServer(data ?? createPublishedData()),
    {
      legacy: "stateless",
      maxRequestBodySize: 16384,
      maxSubscriptions: 0,
    }
  );
  return {
    async fetch(
      request: Request,
      env: ComputeMcpEnv,
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
            version: "0.3.0",
            readOnly: true,
            dataMode: "published-snapshot",
            dataSource:
              "https://darkstarstrix.github.io/gpu-price-tracker/data/mcp/",
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
        let parsedBody: unknown;
        if (request.method === "POST") {
          if (
            request.headers
              .get("Content-Type")
              ?.split(";")[0]
              .trim()
              .toLowerCase() !== "application/json"
          )
            return Response.json(
              { error: "Content-Type must be application/json" },
              { status: 415, headers }
            );
          try {
            parsedBody = JSON.parse(await readBounded(request, 16384));
          } catch (error) {
            const status =
              error instanceof Error && error.message === "size" ? 413 : 400;
            return Response.json(
              {
                error:
                  status === 413
                    ? "Request body too large"
                    : "Invalid JSON body",
              },
              { status, headers }
            );
          }
          // The legacy SDK accepts up to 100 messages per batch. One HTTP rate-limit
          // decision must never authorize that many concurrent catalog reads.
          if (Array.isArray(parsedBody))
            return Response.json(
              {
                jsonrpc: "2.0",
                id: null,
                error: {
                  code: -32600,
                  message:
                    "Batch requests are not supported; send one request per HTTP exchange.",
                },
              },
              { status: 400, headers }
            );
        }
        const response = await handler.fetch(
          request,
          request.method === "POST" ? { parsedBody } : undefined
        );
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
