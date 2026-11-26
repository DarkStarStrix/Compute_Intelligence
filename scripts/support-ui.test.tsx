// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SupportDialog } from "../client/src/components/SupportDialog";
import { ProviderReferral } from "../client/src/components/ProviderReferral";
import {
  publicUrl,
  stripePaymentUrl,
  sponsorshipContact,
  sponsorshipFallback,
  type SupportSettings,
} from "../client/src/config/support";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
const empty: SupportSettings = {
  stripeUrl: "",
  sponsorshipUrl: "",
  referrals: [],
  sponsors: [],
};
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
});

it("shows honest unconnected support and a clearly public sponsorship inquiry without fake payments", async () => {
  mount();
  const close = vi.fn();
  await act(() =>
    root!.render(<SupportDialog settings={empty} onClose={close} />)
  );
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain(
    "Direct contributions will be available here soon"
  );
  expect(dialog.querySelector('a[href^="https://buy.stripe.com"]')).toBeNull();
  expect(dialog.textContent).not.toContain(
    "Support through provider referrals"
  );
  expect(dialog.textContent).not.toContain("Project sponsors");
  expect(
    dialog.querySelector(`a[href="${sponsorshipFallback}"]`)
  ).not.toBeNull();
  expect(dialog.textContent).toContain("public GitHub inquiry");
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
  );
  expect(close).toHaveBeenCalledTimes(1);
});

it("renders configured Stripe, contact, referral and sponsor links with accurate disclosures", async () => {
  mount();
  const settings: SupportSettings = {
    stripeUrl: "https://buy.stripe.com/test_example",
    sponsorshipUrl: "mailto:partners@example.com",
    referrals: [
      {
        providerId: "runpod",
        providerName: "RunPod",
        signupUrl: "https://runpod.io/?ref=test",
        reward: "credits",
      },
    ],
    sponsors: [{ name: "Example sponsor", url: "https://sponsor.example" }],
  };
  await act(() =>
    root!.render(<SupportDialog settings={settings} onClose={() => {}} />)
  );
  expect(
    document.querySelector('a[href="https://buy.stripe.com/test_example"]')
      ?.textContent
  ).toContain("Contribute via Stripe");
  expect(
    document.querySelector('a[href="mailto:partners@example.com"]')
  ).not.toBeNull();
  expect(document.body.textContent).not.toContain("public GitHub inquiry");
  expect(document.body.textContent).toContain("Paid referral link");
  expect(document.body.textContent).toContain("earn compute credits");
  expect(document.body.textContent).toContain(
    "do not influence prices, rankings, or provider coverage"
  );
  expect(
    document
      .querySelector('a[href="https://runpod.io/?ref=test"]')
      ?.getAttribute("rel")
  ).toContain("sponsored");
  expect(
    document
      .querySelector('a[href="https://sponsor.example/"]')
      ?.getAttribute("rel")
  ).toContain("sponsored");
});

it("only adds a referral signup action for matching configured providers", async () => {
  const host = mount();
  const settings: SupportSettings = {
    ...empty,
    referrals: [
      {
        providerId: "runpod",
        providerName: "RunPod",
        signupUrl: "https://runpod.io/?ref=test",
        reward: "commission",
      },
    ],
  };
  await act(() =>
    root!.render(<ProviderReferral providerId="lambda" settings={settings} />)
  );
  expect(host.innerHTML).toBe("");
  await act(() =>
    root!.render(<ProviderReferral providerId="runpod" settings={settings} />)
  );
  expect(host.querySelector("a")?.href).toBe("https://runpod.io/?ref=test");
  expect(host.textContent).toContain("earn a commission");
});

it("activates the owner's RunPod link with a credit disclosure in the default support panel", async () => {
  mount();
  await act(() => root!.render(<SupportDialog onClose={() => {}} />));
  const link = document.querySelector<HTMLAnchorElement>(
    'a[data-analytics-commercial="referral"][data-analytics-provider="runpod"]'
  );
  expect(link?.href).toBe("https://runpod.io/?ref=e6fqbtyq");
  expect(link?.rel).toContain("sponsored");
  expect(link?.parentElement?.textContent).toContain("earn compute credits");
});

it("rejects unsafe links and non-Stripe payment destinations", () => {
  for (const url of [
    "",
    "javascript:alert(1)",
    "http://example.com",
    "https://user:pass@example.com",
  ])
    expect(publicUrl(url)).toBeUndefined();
  for (const url of [
    "https://buy.stripe.com.evil.example/path",
    "https://other.example",
    "javascript:alert(1)",
  ])
    expect(stripePaymentUrl(url)).toBeUndefined();
  expect(stripePaymentUrl("https://donate.stripe.com/test")).toBe(
    "https://donate.stripe.com/test"
  );
  expect(
    sponsorshipContact("mailto:hello@example.com?bcc=other@example.com")
  ).toBe(sponsorshipFallback);
});
