// @vitest-environment happy-dom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAnalyticsSearch } from "../client/src/hooks/useAnalyticsSearch";
import { emptyOfferFilters } from "../client/src/lib/view-link";
import { PrivacyDialog } from "../client/src/components/PrivacyDialog";

const { track, newSearch, getPreference, setPreference } = vi.hoisted(() => ({
  track: vi.fn(),
  newSearch: vi.fn(() => crypto.randomUUID()),
  getPreference: vi.fn(() => "session"),
  setPreference: vi.fn(),
}));
vi.mock("../client/src/lib/analytics", () => ({
  track,
  analytics: () => ({
    newSearch,
    getPreference,
    setPreference,
    isBlocked: () => false,
    isEnabled: () => true,
  }),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="test"></div>';
  root = createRoot(document.getElementById("test")!);
  vi.clearAllMocks();
  Object.defineProperty(document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
});
afterEach(async () => {
  await act(() => root.unmount());
  vi.useRealTimers();
  document.body.innerHTML = "";
});
function Search({
  text = "",
  active = true,
  intent = 0,
  total = 3,
}: {
  text?: string;
  active?: boolean;
  intent?: number;
  total?: number;
}) {
  useAnalyticsSearch(
    { ...emptyOfferFilters, search: text },
    active,
    intent,
    { total, fresh: 0 },
    "gpu"
  );
  return <div>{total} results</div>;
}
it("emits one search/results pair after a committed render, suppressing defaults, polling, Strict Mode and hidden tabs", async () => {
  const render = (props: Parameters<typeof Search>[0]) =>
    act(() =>
      root.render(
        <StrictMode>
          <Search {...props} />
        </StrictMode>
      )
    );
  await render({});
  await act(() => vi.advanceTimersByTimeAsync(600));
  expect(track).not.toHaveBeenCalled();
  await render({ text: "H100", intent: 1 });
  await act(() => vi.advanceTimersByTimeAsync(100));
  await render({ text: "H100 SXM", intent: 2 });
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(track.mock.calls.map(call => call[0])).toEqual([
    "search_submitted",
    "results_viewed",
  ]);
  expect(track.mock.calls[0][1]).not.toHaveProperty("searchText");
  expect(track.mock.calls[1][1]).toMatchObject({
    results: 3,
    freshResults: 0,
    query: "text",
  });
  await render({ text: "H100 SXM", intent: 2, total: 5 });
  await act(() => vi.advanceTimersByTimeAsync(600));
  expect(track).toHaveBeenCalledTimes(2);
  await render({ text: "A100", intent: 3, active: false });
  await act(() => vi.advanceTimersByTimeAsync(600));
  expect(track).toHaveBeenCalledTimes(2);
  await render({ text: "A100", intent: 3, active: true, total: 0 });
  await act(() => vi.advanceTimersByTimeAsync(600));
  expect(track.mock.calls[3][1]).toMatchObject({ results: 0, freshResults: 0 });
});
it("shows explicit privacy choices without an automatic popup or preselected persistent identifier", async () => {
  await act(() => root.render(<PrivacyDialog onClose={() => {}} />));
  expect(
    document.querySelector<HTMLInputElement>('input[value="session"]')?.checked
  ).toBe(true);
  expect(
    document.querySelector<HTMLInputElement>('input[value="return"]')?.checked
  ).toBe(false);
  expect(document.body.textContent).toContain(
    "Product records expire after 90 days"
  );
  const input = document.querySelector<HTMLInputElement>(
    'input[value="return"]'
  )!;
  await act(() => input.click());
  await act(() =>
    [...document.querySelectorAll("button")]
      .find(button => button.textContent === "Save preferences")!
      .click()
  );
  expect(setPreference).toHaveBeenCalledWith("return");
});
