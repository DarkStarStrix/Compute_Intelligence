import { useState } from "react";
import { Modal } from "./Modal";
import { analytics } from "@/lib/analytics";

export function PrivacyDialog({ onClose }: { onClose: () => void }) {
  const client = analytics();
  const [choice, setChoice] = useState(client.getPreference());
  const blocked = client.isBlocked();
  return (
    <Modal titleId="privacy-title" onClose={onClose}>
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h2 id="privacy-title" className="text-xl font-semibold">
            Privacy & analytics
          </h2>
          <button
            className="header-control"
            aria-label="Close privacy settings"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          We measure searches, comparisons, and provider clicks to improve
          compute discovery. We do not record your search text, complete URLs,
          IP addresses, or notification details. Product records expire after 90
          days.
        </p>
        {!client.isEnabled() && (
          <p role="status" className="text-sm">
            Custom product analytics is not enabled in this build. Your
            preference will apply when it is enabled.
          </p>
        )}
        <fieldset disabled={blocked} className="space-y-3">
          <legend className="text-sm font-semibold mb-2">
            Product analytics
          </legend>
          {(
            [
              [
                "session",
                "Session only",
                "Measure actions during this visit without a persistent browser identifier.",
              ],
              [
                "return",
                "Allow return-visit measurement",
                "Also use a random browser identifier for up to 90 days to understand repeat use. This is optional.",
              ],
              ["off", "Off", "Send no custom product events."],
            ] as const
          ).map(([value, label, detail]) => (
            <label key={value} className="flex gap-3 text-sm">
              <input
                type="radio"
                name="analytics-preference"
                value={value}
                checked={choice === value}
                onChange={() => setChoice(value)}
                className="mt-1"
              />
              <span>
                {label}
                <span className="block text-xs text-muted-foreground mt-1">
                  {detail}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        {blocked && (
          <p role="status" className="text-sm">
            Your browser’s privacy signal has disabled custom product analytics.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          The separate Cloudflare Web Analytics beacon measures page traffic and
          performance without our browser identifier. Changing this setting
          controls custom product events. Provider links open directly even when
          analytics is unavailable. Clearing or disabling return measurement
          removes the local identifier; previously received records expire under
          the retention policy.
        </p>
        <button
          className="primary-action rounded-lg px-4 py-2 text-sm"
          onClick={() => {
            if (!blocked) client.setPreference(choice);
            onClose();
          }}
        >
          Save preferences
        </button>
      </div>
    </Modal>
  );
}
