import type {
  ExecutionContext,
  ScheduledController,
} from "@cloudflare/workers-types";
import { analyticsBatchSchema } from "../shared/analytics";
import { insertEvents, countHealth, expireAnalytics } from "./store";
import { readBounded } from "./http";
import { observeSnapshot } from "./snapshot";

export default {
  async fetch(
    request: Request & { cf?: { country?: unknown } },
    env: AnalyticsIngestEnv,
    ctx: Pick<ExecutionContext, "waitUntil">
  ): Promise<Response> {
    const origin = request.headers.get("Origin");
    const cors = {
      "Access-Control-Allow-Origin": env.SITE_ORIGIN,
      Vary: "Origin",
      "Cache-Control": "no-store",
    };
    const respond = (status: number) =>
      new Response(null, { status, headers: cors });
    if (new URL(request.url).pathname !== "/api/events") return respond(404);
    if (origin !== env.SITE_ORIGIN) return respond(403);
    if (request.method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "3600",
        },
      });
    if (request.method !== "POST") return respond(405);
    if (
      request.headers.get("Sec-GPC") === "1" ||
      request.headers.get("DNT") === "1"
    )
      return respond(204);
    const audit = (metric: string) =>
      ctx.waitUntil(
        countHealth(env.DB, metric).catch(() => {
          console.warn(
            JSON.stringify({ event: "analytics_health_write_failed" })
          );
        })
      );
    try {
      // IP is used only as an ephemeral rate-limit key, never stored in analytics or logs.
      const ip = request.headers.get("CF-Connecting-IP");
      if (!ip || !(await env.IP_LIMIT.limit({ key: ip })).success) {
        audit("rate_limited");
        return respond(429);
      }
      if (
        !request.headers.get("Content-Type")?.startsWith("application/json")
      ) {
        audit("rejected");
        return respond(415);
      }
      let payload: unknown;
      try {
        payload = JSON.parse(await readBounded(request, 16384));
      } catch {
        audit("rejected");
        return respond(400);
      }
      const parsed = analyticsBatchSchema.safeParse(payload);
      if (!parsed.success) {
        audit("rejected");
        return respond(400);
      }
      const now = Date.now();
      if (
        parsed.data.events.some(
          event => Math.abs(Date.parse(event.occurredAt) - now) > 300000
        )
      ) {
        audit("rejected");
        return respond(400);
      }
      const ids = [
        ...new Set(parsed.data.events.map(event => event.sessionId)),
      ];
      if (
        ids.length !== 1 ||
        !(await env.SESSION_LIMIT.limit({ key: ids[0] })).success
      ) {
        audit("rate_limited");
        return respond(429);
      }
      const country = /^[A-Z]{2}$/.test(String(request.cf?.country))
        ? String(request.cf?.country)
        : "unknown";
      await insertEvents(
        env.DB,
        parsed.data.events,
        country,
        new Date(now).toISOString()
      );
      return respond(204);
    } catch {
      audit("ingestion_error");
      console.warn(JSON.stringify({ event: "analytics_ingestion_failed" }));
      return respond(503);
    }
  },
  async scheduled(
    controller: ScheduledController,
    env: AnalyticsIngestEnv,
    ctx: Pick<ExecutionContext, "waitUntil">
  ) {
    ctx.waitUntil(
      (async () => {
        try {
          await observeSnapshot(env.DB, env.SNAPSHOT_URL);
        } catch {
          await countHealth(env.DB, "snapshot_observation_failed");
          console.warn(
            JSON.stringify({ event: "snapshot_observation_failed" })
          );
        }
        if (controller.cron === "17 3 * * *")
          await expireAnalytics(env.DB, Date.now());
      })()
    );
  },
};
