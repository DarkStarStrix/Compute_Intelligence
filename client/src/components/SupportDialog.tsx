import { X, ExternalLink } from "lucide-react";
import { Modal } from "./Modal";
import { ProviderReferral } from "./ProviderReferral";
import {
  activeReferrals,
  activeSponsors,
  publicUrl,
  repositoryUrl,
  sponsorshipContact,
  sponsorshipFallback,
  stripePaymentUrl,
  supportSettings,
  type SupportSettings,
} from "@/config/support";

export function SupportDialog({
  onClose,
  settings = supportSettings,
}: {
  onClose: () => void;
  settings?: SupportSettings;
}) {
  const stripe = stripePaymentUrl(settings.stripeUrl);
  const contact = sponsorshipContact(settings.sponsorshipUrl);
  const referrals = activeReferrals(settings);
  const sponsors = activeSponsors(settings);
  return (
    <Modal titleId="support-title" onClose={onClose}>
      <div className="p-5 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id="support-title" className="text-xl font-semibold">
            Support Compute Intelligence
          </h2>
          <button
            type="button"
            aria-label="Close support"
            onClick={onClose}
            className="header-control shrink-0"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          A free, open-source project. Optional support helps me maintain
          provider integrations, improve data reliability, and build new
          features.
        </p>
        <section aria-labelledby="direct-support-title" className="space-y-2">
          <h3 id="direct-support-title" className="text-sm font-semibold">
            Contribute directly
          </h3>
          {stripe ? (
            <>
              <a
                href={stripe}
                target="_blank"
                rel="noopener noreferrer"
                className="primary-action inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium"
              >
                Contribute via Stripe <ExternalLink size={14} />
              </a>
              <p className="text-xs text-muted-foreground">
                Choose your amount on Stripe. No app features are purchased.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Direct contributions will be available here soon.
            </p>
          )}
        </section>
        {referrals.length > 0 && (
          <section
            aria-labelledby="referral-support-title"
            className="border-t border-border pt-4 space-y-2"
          >
            <h3 id="referral-support-title" className="text-sm font-semibold">
              Support through provider referrals
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              If you’re choosing a provider, eligible new-account referrals can
              support development. Each provider sets its eligibility and reward
              terms.
            </p>
            <ul className="space-y-3">
              {referrals.map(referral => (
                <li key={referral.providerId}>
                  <ProviderReferral
                    providerId={referral.providerId}
                    settings={settings}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
        <section
          aria-labelledby="sponsorship-title"
          className="border-t border-border pt-4 space-y-2"
        >
          <h3 id="sponsorship-title" className="text-sm font-semibold">
            For teams and companies
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Sponsor ongoing development with a clearly labeled project
            acknowledgment. Placement, duration, and terms are agreed
            individually.
          </p>
          <a
            href={contact}
            target={contact.startsWith("https:") ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-teal underline underline-offset-2"
          >
            Discuss project sponsorship <ExternalLink size={14} />
          </a>
          {contact === sponsorshipFallback && (
            <p className="text-xs text-muted-foreground">
              Opens a public GitHub inquiry. Don’t include private contact,
              budget, or payment details.
            </p>
          )}
        </section>
        {sponsors.length > 0 && (
          <section
            aria-labelledby="project-sponsors-title"
            className="border-t border-border pt-4"
          >
            <h3 id="project-sponsors-title" className="text-sm font-semibold">
              Project sponsors
            </h3>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {sponsors.map(sponsor => (
                <li key={sponsor.url}>
                  <a
                    href={publicUrl(sponsor.url)}
                    target="_blank"
                    rel="sponsored noopener noreferrer"
                    className="text-teal underline"
                  >
                    {sponsor.name} ↗
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="border-t border-border pt-4 text-xs text-muted-foreground leading-relaxed">
          Contributions, referrals, and sponsorships do not influence prices,
          rankings, or provider coverage.
        </p>
        <a
          href={repositoryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs text-teal underline"
        >
          View the open-source project on GitHub ↗
        </a>
      </div>
    </Modal>
  );
}
