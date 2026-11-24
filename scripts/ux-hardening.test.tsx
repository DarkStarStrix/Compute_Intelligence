// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { Modal } from "../client/src/components/Modal";
import { PriceAlertModal } from "../client/src/components/PriceAlertModal";
import { CopyViewLink } from "../client/src/components/CopyViewLink";
import { OffersTable } from "../client/src/components/OffersTable";
import { loadCatalog } from "../client/src/lib/catalog";
import { collect } from "./collect";
import { parseRunpod } from "./providers";
import fixture from "./fixtures/runpod.json";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  return host;
}
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

it("keeps a failed clear operation visible and associates the highlight field with its label", async () => {
  mount();
  const close = vi.fn();
  await act(() =>
    root!.render(
      <PriceAlertModal
        gpuModelId="h100"
        gpuModelName="H100"
        currentPrice={3}
        existingAlert={{ gpuModelId: "h100", targetPrice: 2, createdAt: 1 }}
        onSave={() => false}
        onClear={() => false}
        onClose={close}
      />
    )
  );
  const input = document.querySelector("input")!;
  expect(
    document.querySelector(`label[for="${input.id}"]`)?.textContent
  ).toContain("Highlight at or below");
  expect(input.getAttribute("aria-describedby")).toContain(`${input.id}-help`);
  const button = (text: string) =>
    [...document.querySelectorAll("button")].find(
      b => b.textContent?.trim() === text
    )!;
  await act(() => button("Save highlight").click());
  expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1);
  await act(() => button("Clear").click());
  expect(close).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "Could not clear"
  );
});

it("skips hidden and collapsed controls when wrapping dialog focus", async () => {
  mount();
  await act(() =>
    root!.render(
      <Modal titleId="test-title" onClose={() => {}}>
        <h2 id="test-title">Test</h2>
        <div hidden>
          <button>Hidden first</button>
        </div>
        <button id="first">Visible first</button>
        <details>
          <summary>Cost</summary>
          <input aria-label="Hidden cost field" />
        </details>
        <button id="last">Visible last</button>
        <div style={{ display: "none" }}>
          <button>Hidden last</button>
        </div>
      </Modal>
    )
  );
  const tab = (shiftKey = false) =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey,
        bubbles: true,
        cancelable: true,
      })
    );
  tab();
  expect(document.activeElement?.id).toBe("first");
  tab(true);
  expect(document.activeElement?.id).toBe("last");
  tab();
  expect(document.activeElement?.id).toBe("first");
});

it("explains clipboard failure and focuses the share link for manual copying", async () => {
  const host = mount();
  vi.stubGlobal("navigator", {
    clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
  });
  const url = "https://example.com/?view=offers";
  await act(() => root!.render(<CopyViewLink url={url} />));
  await act(async () => host.querySelector("button")!.click());
  const input = host.querySelector("input")!;
  expect(input.value).toBe(url);
  expect(document.activeElement).toBe(input);
  expect(host.textContent).toContain("Copy the selected link below");
});

it("searches model and provider in either order and removes only the chosen applied filter", async () => {
  const host = mount();
  const at = new Date().toISOString();
  const offers = parseRunpod(fixture, at);
  const snapshot = await collect(
    null,
    [
      {
        id: "runpod",
        name: "RunPod",
        configured: true,
        connected: true,
        fetch: async () => ({ offers }),
      },
    ],
    at
  );
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot })
  );
  await loadCatalog();
  await act(() => root!.render(<OffersTable initialProvider="runpod" />));
  const input = host.querySelector<HTMLInputElement>('input[type="search"]')!;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )!.set!;
  await act(() => {
    setter.call(input, "runpod H100");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(host.querySelectorAll("tbody tr")).toHaveLength(2);
  expect(host.textContent).not.toContain("No offers match");
  const chip = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Remove Search filter: runpod H100"]'
  )!;
  await act(() => chip.click());
  expect(input.value).toBe("");
  expect(
    host.querySelector('button[aria-label="Remove Provider filter: RunPod"]')
  ).not.toBeNull();
  expect(host.querySelectorAll("tbody tr")).toHaveLength(offers.length);
});
