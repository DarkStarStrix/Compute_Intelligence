import type {
  AnalyticsProperties,
  ProductEvent,
  ProductEventName,
} from "@shared/analytics";

type Preference = "session" | "return" | "off";
interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
interface Options {
  endpoint: string;
  local: StorageLike;
  session: StorageLike;
  now: () => number;
  uuid: () => string;
  send: (body: string) => Promise<boolean>;
  blocked: () => boolean;
  acquisition: () => NonNullable<ProductEvent["acquisition"]>;
}
const PREF = "compute-analytics-preference-v1",
  BROWSER = "compute-analytics-browser-v1",
  SESSION = "compute-analytics-session-v1";
const lifetime = 90 * 86400000;
export class AnalyticsClient {
  private queue: ProductEvent[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private current?: {
    id: string;
    last: number;
    sequence: number;
    browserId?: string;
    acquisition: NonNullable<ProductEvent["acquisition"]>;
  };
  private sending = false;
  private epoch = 0;
  private preference?: { value: Preference; at: number };
  private search?: { id: string; session: string };
  constructor(private options: Options) {}
  private read(storage: StorageLike, key: string): unknown {
    try {
      return JSON.parse(storage.getItem(key) ?? "null");
    } catch {
      return null;
    }
  }
  private save(storage: StorageLike, key: string, value?: unknown) {
    try {
      if (value === undefined) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(value));
    } catch {
      /* Memory-only remains usable. */
    }
  }
  getPreference(): Preference {
    if (this.options.blocked()) return "off";
    const saved = this.preference ?? this.read(this.options.local, PREF);
    if (
      saved &&
      typeof saved === "object" &&
      "value" in saved &&
      "at" in saved &&
      typeof saved.at === "number" &&
      this.options.now() - saved.at < lifetime &&
      ["session", "return", "off"].includes(String(saved.value))
    )
      return saved.value as Preference;
    this.save(this.options.local, BROWSER);
    return "session";
  }
  isEnabled() {
    return Boolean(this.options.endpoint);
  }
  isBlocked() {
    return this.options.blocked();
  }
  setPreference(value: Preference) {
    this.epoch++;
    this.preference = { value, at: this.options.now() };
    this.save(this.options.local, PREF, this.preference);
    this.save(this.options.local, BROWSER);
    this.save(this.options.session, SESSION);
    this.current = undefined;
    this.search = undefined;
    this.queue = []; // Consent changes never attach earlier activity to a browser ID.
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
  externalPreferenceChanged() {
    this.epoch++;
    this.preference = undefined;
    this.save(this.options.session, SESSION);
    this.current = undefined;
    this.search = undefined;
    this.queue = [];
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
  private context() {
    if (!this.options.endpoint || this.getPreference() === "off") return;
    const now = this.options.now();
    if (!this.current) {
      const saved = this.read(this.options.session, SESSION);
      if (
        saved &&
        typeof saved === "object" &&
        "id" in saved &&
        "last" in saved &&
        "sequence" in saved &&
        "acquisition" in saved &&
        typeof saved.id === "string" &&
        typeof saved.last === "number" &&
        typeof saved.sequence === "number" &&
        saved.acquisition &&
        typeof saved.acquisition === "object"
      )
        this.current = saved as NonNullable<typeof this.current>;
    }
    if (
      this.current &&
      this.current.browserId &&
      this.getPreference() !== "return"
    )
      this.current = undefined;
    if (
      !this.current ||
      now - this.current.last >= 1800000 ||
      now < this.current.last
    ) {
      this.queue = [];
      let browserId: string | undefined;
      if (this.getPreference() === "return") {
        const stored = this.read(this.options.local, BROWSER);
        if (
          stored &&
          typeof stored === "object" &&
          "id" in stored &&
          "at" in stored &&
          typeof stored.id === "string" &&
          typeof stored.at === "number" &&
          now - stored.at < lifetime
        )
          browserId = stored.id;
        else {
          browserId = this.options.uuid();
          this.save(this.options.local, BROWSER, { id: browserId, at: now });
        }
      }
      this.current = {
        id: this.options.uuid(),
        last: now,
        sequence: 0,
        browserId,
        acquisition: this.options.acquisition(),
      };
      this.search = undefined;
      this.enqueue("session_started", {});
    }
    this.current.last = now;
    return this.current;
  }
  private enqueue(
    event: ProductEventName,
    properties: AnalyticsProperties,
    searchId?: string
  ) {
    const context = this.current!;
    if (this.queue.length >= 40) return;
    this.queue.push({
      version: 1,
      eventId: this.options.uuid(),
      sessionId: context.id,
      browserId: context.browserId,
      event,
      occurredAt: new Date(this.options.now()).toISOString(),
      sequence: context.sequence++,
      properties,
      searchId,
      acquisition: context.acquisition,
    });
    this.save(this.options.session, SESSION, context);
  }
  track(
    event: ProductEventName,
    properties: AnalyticsProperties = {},
    searchId?: string
  ) {
    try {
      const context = this.context();
      if (!context) return;
      this.enqueue(
        event,
        properties,
        searchId ??
          (this.search?.session === context.id ? this.search.id : undefined)
      );
      if (!this.timer)
        this.timer = setTimeout(() => {
          this.timer = undefined;
          void this.flush();
        }, 2000);
    } catch {
      /* Telemetry must never break the product. */
    }
  }
  newSearch() {
    const context = this.context();
    if (!context) return undefined;
    this.search = { id: this.options.uuid(), session: context.id };
    return this.search.id;
  }
  async flush() {
    if (this.sending || !this.queue.length) return;
    if (this.options.blocked() || this.getPreference() === "off") {
      this.queue = [];
      return;
    }
    this.sending = true;
    const epoch = this.epoch;
    const batch = this.queue.splice(0, 10);
    const body = JSON.stringify({ events: batch });
    try {
      // Bound the wire payload without sending raw text or persisting an offline queue.
      if (new TextEncoder().encode(body).length <= 16384) {
        const delivered = await this.options.send(body).catch(() => false);
        if (
          !delivered &&
          this.epoch === epoch &&
          !this.options.blocked() &&
          this.getPreference() !== "off"
        )
          await this.options.send(body).catch(() => false);
      }
    } finally {
      this.sending = false;
      if (this.queue.length && !this.timer)
        this.timer = setTimeout(() => {
          this.timer = undefined;
          void this.flush();
        }, 2000);
    }
  }
}

function acquisition(): NonNullable<ProductEvent["acquisition"]> {
  const params = new URLSearchParams(location.search);
  let hostname = "";
  try {
    hostname = new URL(document.referrer).hostname.toLowerCase();
  } catch {
    /* Direct. */
  }
  if (hostname === location.hostname) hostname = "";
  const source = params.get("utm_source")?.toLowerCase();
  const isX =
    ["x.com", "twitter.com", "t.co"].includes(hostname) ||
    source === "x" ||
    source === "twitter";
  const campaign = params.has("utm_campaign")
    ? ["x", "launch", "demo", "newsletter"].includes(
        params.get("utm_campaign") ?? ""
      )
      ? (params.get("utm_campaign") as "x" | "launch" | "demo" | "newsletter")
      : "other"
    : undefined;
  return {
    channel: isX
      ? "x"
      : source || campaign
        ? "campaign"
        : hostname === "github.com"
          ? "github"
          : /(^|\.)(google|bing|duckduckgo)\./.test(hostname)
            ? "search"
            : hostname
              ? "referral"
              : "direct",
    referrer: /^[a-z0-9.-]{1,120}$/.test(hostname) ? hostname : undefined,
    campaign,
  };
}
let instance: AnalyticsClient | undefined;
export function analytics() {
  if (!instance) {
    let endpoint = import.meta.env.VITE_ANALYTICS_API_URL ?? "";
    try {
      const url = new URL(endpoint);
      if (
        url.protocol !== "https:" &&
        !(import.meta.env.DEV && url.hostname === "127.0.0.1")
      )
        endpoint = "";
    } catch {
      endpoint = "";
    }
    const safeStorage = (
      type: "localStorage" | "sessionStorage"
    ): StorageLike => ({
      getItem: key => window[type].getItem(key),
      setItem: (key, value) => window[type].setItem(key, value),
      removeItem: key => window[type].removeItem(key),
    });
    instance = new AnalyticsClient({
      endpoint,
      local: safeStorage("localStorage"),
      session: safeStorage("sessionStorage"),
      now: Date.now,
      uuid: () => crypto.randomUUID(),
      acquisition,
      blocked: () =>
        (navigator as Navigator & { globalPrivacyControl?: boolean })
          .globalPrivacyControl === true || navigator.doNotTrack === "1",
      send: async body =>
        (
          await fetch(endpoint, {
            method: "POST",
            body,
            headers: { "Content-Type": "application/json" },
            keepalive: true,
            credentials: "omit",
            signal: AbortSignal.timeout(3000),
          })
        ).ok,
    });
  }
  return instance;
}
export function track(
  event: ProductEventName,
  properties: AnalyticsProperties = {},
  searchId?: string
) {
  analytics().track(event, properties, searchId);
}
let listening = false;
export function startAnalytics() {
  if (listening) return;
  listening = true;
  const outbound = (event: MouseEvent) => {
    if (event.type === "auxclick" && event.button !== 1) return;
    const anchor =
      event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>(
            "a[data-analytics-provider],a[data-analytics-commercial]"
          )
        : null;
    if (!anchor) return;
    const source = anchor.dataset
      .analyticsSource as AnalyticsProperties["source"];
    const listingDetails: AnalyticsProperties = {};
    const numericPrice = Number(anchor.dataset.analyticsPrice);
    if (anchor.dataset.analyticsPrice && Number.isFinite(numericPrice))
      listingDetails.price = numericPrice;
    if (anchor.dataset.analyticsRegion)
      listingDetails.region = anchor.dataset.analyticsRegion.slice(0, 120);
    if (anchor.dataset.analyticsUnit)
      listingDetails.unit = anchor.dataset
        .analyticsUnit as AnalyticsProperties["unit"];
    if (anchor.dataset.analyticsStock)
      listingDetails.stock = anchor.dataset
        .analyticsStock as AnalyticsProperties["stock"];
    if (anchor.dataset.analyticsRetained)
      listingDetails.retained = anchor.dataset.analyticsRetained === "true";
    if (anchor.dataset.analyticsCommercial)
      track("commercial_link_clicked", {
        action: anchor.dataset
          .analyticsCommercial as AnalyticsProperties["action"],
        provider: anchor.dataset.analyticsProvider,
        source,
      });
    else
      track("provider_outbound_click", {
        ...listingDetails,
        provider: anchor.dataset.analyticsProvider,
        listing: anchor.dataset.analyticsListing,
        model: anchor.dataset.analyticsModel,
        kind: anchor.dataset.analyticsKind as AnalyticsProperties["kind"],
        source,
      });
    void analytics().flush(); // Direct href remains untouched, including middle-click/keyboard navigation.
  };
  document.addEventListener("click", outbound, true);
  document.addEventListener("auxclick", outbound, true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void analytics().flush();
  });
  window.addEventListener("pagehide", () => void analytics().flush());
  window.addEventListener("storage", event => {
    if (event.key === PREF || event.key === null)
      instance?.externalPreferenceChanged();
  });
}
