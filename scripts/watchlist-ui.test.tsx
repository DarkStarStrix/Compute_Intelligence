// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { parseRunpod } from "./providers";
import fixture from "./fixtures/runpod.json";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it("retries a failed watchlist connection and explains blocked notification permission without saving", async () => {
  vi.stubEnv("VITE_WATCH_API", "https://watch.example.test");
  vi.stubGlobal("localStorage", { getItem: () => null });
  vi.stubGlobal("navigator", { serviceWorker: {} });
  vi.stubGlobal("PushManager", class {});
  const requestPermission = vi.fn();
  vi.stubGlobal("Notification", { permission: "denied", requestPermission });
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ publicKey: "test" }),
    });
  vi.stubGlobal("fetch", fetch);
  const { WatchlistDialog } =
    await import("../client/src/components/WatchlistDialog");
  const offer = parseRunpod(fixture, new Date().toISOString())[0];
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(() =>
      root.render(<WatchlistDialog offer={offer} onClose={() => {}} />)
    );
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Could not load background notifications"
    );
    const retry = [...document.querySelectorAll("button")].find(
      button => button.textContent === "Retry connection"
    )!;
    await act(async () => retry.click());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[role="alert"]')).toBeNull();
    const input = document.querySelector<HTMLInputElement>(
      'input[type="number"]'
    )!;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!;
    await act(() => {
      setter.call(input, "2");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      document
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        );
    });
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "browser site settings"
    );
    expect(requestPermission).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(input.value).toBe("2");
  } finally {
    await act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});
