import type { AnalyticsProperties } from "@shared/analytics";
import {
  activeReferrals,
  publicUrl,
  referralDisclosure,
  type SupportSettings,
} from "@/config/support";

// Signup links are separate from exact-listing and source links.
export function ProviderReferral({
  providerId,
  settings,
  source = "support",
}: {
  providerId: string;
  settings?: SupportSettings;
  source?: AnalyticsProperties["source"];
}) {
  const referral = activeReferrals(settings).find(
    item => item.providerId === providerId
  );
  if (!referral) return null;
  return (
    <div className="mt-2 text-xs leading-relaxed">
      <a
        data-analytics-commercial="referral"
        data-analytics-provider={providerId}
        data-analytics-source={source}
        href={publicUrl(referral.signupUrl)}
        target="_blank"
        rel="sponsored noopener noreferrer"
        className="text-teal underline underline-offset-2"
      >
        Create a {referral.providerName} account ↗
      </a>
      <span className="ml-1 text-muted-foreground">Paid referral link.</span>
      <p className="text-muted-foreground">{referralDisclosure(referral)}</p>
    </div>
  );
}
