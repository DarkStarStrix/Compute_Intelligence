// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { analyticsBatchSchema } from "../shared/analytics";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("preserves direct destinations and records keyboard/middle-click actions, including stopped bubbling", async () => {
  vi.useFakeTimers();
  vi.stubEnv(
    "VITE_ANALYTICS_API_URL",
    "https://events.example.test/api/events"
  );
  const send = vi.fn(
    async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(null, { status: 204 })
  );
  vi.stubGlobal("fetch", send);
  const { analytics, startAnalytics } =
    await import("../client/src/lib/analytics");
  startAnalytics();
  const anchor = document.createElement("a");
  anchor.href = "https://provider.example.test/exact?sku=123";
  anchor.dataset.analyticsProvider = "example";
  anchor.dataset.analyticsSource = "offers";
  anchor.dataset.analyticsKind = "gpu";
  anchor.addEventListener("click", event => {
    event.stopPropagation();
    event.preventDefault();
  });
  document.body.append(anchor);
  anchor.click();
  await Promise.resolve();
  await Promise.resolve();
  expect(anchor.href).toBe("https://provider.example.test/exact?sku=123");
  expect(send).toHaveBeenCalledOnce();
  const batch = JSON.parse(String(send.mock.calls[0][1]?.body));
  expect(analyticsBatchSchema.safeParse(batch).success).toBe(true);
  expect(batch.events.at(-1)).toMatchObject({
    event: "provider_outbound_click",
    properties: { provider: "example", source: "offers" },
  });
  expect(batch.events[0].browserId).toBeUndefined();
  expect(JSON.stringify(batch)).not.toContain(anchor.href);
  await analytics().flush();
  anchor.dispatchEvent(
    new MouseEvent("auxclick", { button: 1, bubbles: true })
  );
  await Promise.resolve();
  await Promise.resolve();
  expect(send).toHaveBeenCalledTimes(2);
  analytics().setPreference("off");
  anchor.click();
  await analytics().flush();
  expect(send).toHaveBeenCalledTimes(2);
  anchor.remove();
});
