// Public settings only. Add approved links here; never add API keys or payout details.
export interface Referral {
  providerId: string;
  providerName: string;
  signupUrl: string;
  reward: "commission" | "credits" | "commission-or-credits";
}
export interface Sponsor {
  name: string;
  url: string;
}
export interface SupportSettings {
  stripeUrl: string;
  sponsorshipUrl: string;
  referrals: Referral[];
  sponsors: Sponsor[];
}
export const supportSettings: SupportSettings = {
  stripeUrl: "",
  // Leave blank to use the public GitHub sponsorship inquiry form.
  sponsorshipUrl: "",
  // Example: { providerId: "runpod", providerName: "RunPod", signupUrl: "YOUR_APPROVED_URL", reward: "credits" }
  referrals: [],
  // Add only confirmed, active sponsors. These never affect provider rankings.
  sponsors: [],
};

export const repositoryUrl =
  "https://github.com/DarkStarStrix/gpu-price-tracker";
export const sponsorshipFallback = `${repositoryUrl}/issues/new?template=sponsorship.yml`;

export function publicUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function stripePaymentUrl(value: string): string | undefined {
  const href = publicUrl(value);
  return href &&
    ["buy.stripe.com", "donate.stripe.com"].includes(new URL(href).hostname)
    ? href
    : undefined;
}
export function sponsorshipContact(value: string): string {
  // Allow a plain email address through a mailto link, without injected headers.
  if (/^mailto:[^\s@?]+@[^\s@?]+\.[^\s@?]+$/.test(value)) return value;
  return publicUrl(value) ?? sponsorshipFallback;
}
export function activeReferrals(settings = supportSettings) {
  return settings.referrals.filter(referral => publicUrl(referral.signupUrl));
}
export function activeSponsors(settings = supportSettings) {
  return settings.sponsors.filter(
    sponsor => sponsor.name.trim() && publicUrl(sponsor.url)
  );
}
export function referralDisclosure(referral: Referral) {
  return referral.reward === "credits"
    ? "We may earn compute credits from eligible signups."
    : referral.reward === "commission"
      ? "We may earn a commission from eligible signups."
      : "We may earn a commission or compute credits from eligible signups.";
}
