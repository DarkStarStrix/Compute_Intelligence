// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { PriceTrends } from "../client/src/components/PriceTrends";
import { collect } from "./collect";
import { parseRunpod } from "./providers";
import fixture from "./fixtures/runpod.json";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("keeps provider replay and distinguishes flat prices from a return to the starting price", async () => {
  const now = Date.now();
  const at = new Date(now).toISOString();
  const offer = parseRunpod(fixture, at)[0];
  const snapshot = await collect(
    null,
    [
      {
        id: "runpod",
        name: "RunPod",
        configured: true,
        connected: true,
        fetch: async () => ({ offers: [offer] }),
      },
    ],
    at
  );
  const [sample] = snapshot.history;
  const first = {
    ...sample,
    observedAt: new Date(now - 120_000).toISOString(),
  };
  const host = document.createElement("div");
  const root = createRoot(host);
  const render = (history: typeof snapshot.history) =>
    act(() => root.render(<PriceTrends snapshot={{ ...snapshot, history }} />));

  try {
    await render([first, sample]);
    expect(host.textContent).toContain("Unchanged in this range");
    expect(host.textContent).toContain("Provider movement timeline");
    expect(
      host.querySelector('[aria-label="Observation timeline"]')
    ).not.toBeNull();
    expect(host.textContent).not.toContain("Current pool inventory");
    const timelineMode = Array.from(
      host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    ).at(-1)!;
    await act(() => timelineMode.click());
    expect(
      host.querySelector<HTMLSelectElement>('[aria-label="Timeline provider"]')
        ?.disabled
    ).toBe(true);
    await act(() => timelineMode.click());

    const between = {
      ...sample,
      pricePerGpuHr: sample.pricePerGpuHr + 0.25,
      observedAt: new Date(now - 60_000).toISOString(),
    };
    await render([first, between, sample]);
    expect(host.textContent).toContain("0.00% net · varied in this range");
    expect(host.textContent).not.toContain("Unchanged in this range");
  } finally {
    await act(() => root.unmount());
  }
});

it("filters current and past listings by movement inside the selected period", async () => {
  const now = Date.now();
  const at = (minutes: number) =>
    new Date(now - minutes * 60_000).toISOString();
  const base = parseRunpod(fixture, at(0))[0];
  const flat = { ...base, offerId: "flat" };
  const roundTrip = { ...base, offerId: "round-trip" };
  const snapshot = await collect(
    null,
    [
      {
        id: "runpod",
        name: "RunPod",
        configured: true,
        connected: true,
        fetch: async () => ({ offers: [flat, roundTrip] }),
      },
    ],
    at(0)
  );
  const sample = snapshot.history.find(
    point => point.offerId === roundTrip.offerId
  )!;
  snapshot.history.push(
    { ...sample, offerId: flat.offerId, observedAt: at(10) },
    { ...sample, observedAt: at(20) },
    { ...sample, observedAt: at(10), pricePerGpuHr: sample.pricePerGpuHr + 1 },
    { ...sample, offerId: "past", observedAt: at(100) },
    {
      ...sample,
      offerId: "past",
      observedAt: at(90),
      pricePerGpuHr: sample.pricePerGpuHr + 1,
    }
  );

  const host = document.createElement("div");
  const root = createRoot(host);
  const select = () =>
    host.querySelector<HTMLSelectElement>('[aria-label="Historical listing"]')!;
  const choices = () => Array.from(select().options, option => option.value);
  const period = (label: string) =>
    [...host.querySelectorAll("button")].find(
      button => button.textContent === label
    )!;

  try {
    await act(() =>
      root.render(<PriceTrends snapshot={snapshot} initialOfferId="flat" />)
    );
    expect(select().value).toBe("flat");
    await act(() =>
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
    );
    expect(choices()).toEqual(["round-trip", "past"]);
    expect(select().value).toBe("round-trip");
    await act(() => period("1H").click());
    expect(choices()).toEqual(["round-trip"]);
    expect(host.textContent).toContain("0.00% net · varied in this range");

    const chart = host.querySelector('svg[aria-label^="Recorded price"]');
    const [start, end] =
      host.querySelectorAll<HTMLInputElement>(".trend-range");
    expect(chart).not.toBeNull();
    const previousEnd = end.getAttribute("aria-valuetext");
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!;
    await act(() => {
      setValue.call(end, "1");
      end.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(end.value).toBe("1");
    expect(end.getAttribute("aria-valuetext")).not.toBe(previousEnd);
    expect(start.max).toBe("1");
    expect(host.querySelector('svg[aria-label^="Recorded price"]')).toBe(chart);

    await act(() =>
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
    );
    expect(select().value).toBe("flat");
  } finally {
    await act(() => root.unmount());
  }
});

it("offers a recovery action when the selected time window has no samples", async () => {
  const at = new Date(Date.now() - 10 * 24 * 3600000).toISOString();
  const offer = parseRunpod(fixture, at)[0];
  const snapshot = await collect(
    null,
    [
      {
        id: "runpod",
        name: "RunPod",
        configured: true,
        connected: true,
        fetch: async () => ({ offers: [offer] }),
      },
    ],
    at
  );
  snapshot.history.push({
    ...snapshot.history[0],
    observedAt: new Date(Date.parse(at) - 60000).toISOString(),
  });
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(() =>
      root.render(
        <PriceTrends snapshot={snapshot} initialOfferId={offer.offerId} />
      )
    );
    expect(host.textContent).toContain("No recorded samples in this range.");
    const recover = [...host.querySelectorAll("button")].find(
      button => button.textContent === "Show latest recorded history"
    )!;
    expect(recover).toBeDefined();
    await act(() => recover.click());
    expect(host.textContent).toContain("Unchanged in this range");
    expect(host.textContent).not.toContain(
      "No recorded samples in this range."
    );
  } finally {
    await act(() => root.unmount());
  }
});
