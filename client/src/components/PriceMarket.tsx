import { useMemo, useState } from "react";
import { getProvider } from "@/lib/data";
import {
  marketSeries,
  marketStats,
  movingListingIds,
  normalizedProviderSeries,
  type NormalizedProviderSeries,
} from "@shared/market";
import { computeKinds } from "@shared/compute";
import { billingLabel, cloudLabel, computeSpecs } from "@shared/offer-view";
import {
  computeListings,
  isCurrent,
  listingKind,
  listingUnit,
  type ListingKind,
  type Listing,
  type Snapshot,
} from "@shared/catalog";
import { AvailabilityBadge } from "./AvailabilityBadge";
import { TimeSeriesPlot } from "./TimeSeriesPlot";
import { CopyViewLink } from "./CopyViewLink";
import {
  viewLink,
  type HistoryBounds,
  type HistoryHours,
  type SharedView,
} from "@/lib/view-link";
const date = (t: number) =>
  new Date(t).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export function PriceMarket({
  initialOfferId = "",
  snapshot: catalog,
  shared,
}: {
  initialOfferId?: string;
  snapshot: Snapshot;
  shared?: Extract<SharedView, { view: "trends" }>;
}) {
  const compute = useMemo(() => computeListings(catalog), [catalog]);
  const initial =
    (listingKind(initialOfferId) === "gpu" ? catalog.offers : compute).find(
      o => o.offerId === initialOfferId
    ) ?? catalog.history.find(o => o.offerId === initialOfferId);
  const [kind, setKind] = useState(() => listingKind(initialOfferId));
  const unit = listingUnit(kind);
  const [gpu, setGpu] = useState(
      shared?.gpu || initial?.gpuModelId || "h100-sxm"
    ),
    [billing, setBilling] = useState<string>(
      shared?.billing ?? initial?.billingModel ?? "on-demand"
    ),
    [selected, setSelected] = useState(initialOfferId),
    [hours, setHours] = useState<HistoryHours>(shared?.hours ?? 168),
    [moversOnly, setMoversOnly] = useState(shared?.movers ?? false),
    [allProviders, setAllProviders] = useState(false),
    [hover, setHover] = useState<{ time: number; price: number } | null>(null);
  const [anchoredEnd, setAnchoredEnd] = useState(shared?.through);
  const [chartBounds, setChartBounds] = useState<HistoryBounds | undefined>(
    shared?.bounds
  );
  const windowEnd = useMemo(
    () => anchoredEnd ?? Date.now(),
    [catalog, hours, moversOnly, anchoredEnd]
  );
  const windowStart = windowEnd - hours * 3600000;
  const { models, currentOffers, pastOffers } = useMemo(() => {
    const moved = moversOnly
      ? movingListingIds(catalog, windowStart, windowEnd)
      : undefined;
    const matches = (offer: Pick<Listing, "offerId" | "billingModel">) =>
      listingKind(offer.offerId) === kind &&
      (offer.billingModel ?? "on-demand") === billing &&
      (!moved || moved.has(offer.offerId));
    const currentOffers: Listing[] = (
      kind === "gpu" ? catalog.offers : compute
    ).filter(matches);
    const currentIds = new Set(currentOffers.map(offer => offer.offerId));
    const historical = new Map<string, Snapshot["history"][number]>();
    for (const point of catalog.history) {
      if (!currentIds.has(point.offerId) && matches(point))
        historical.set(point.offerId, point);
    }
    const pastOffers = [...historical.values()];
    const models = [
      ...new Set(
        [...currentOffers, ...pastOffers].map(offer => offer.gpuModelId)
      ),
    ].sort();
    return { models, currentOffers, pastOffers };
  }, [catalog, compute, kind, billing, moversOnly, windowStart, windowEnd]);
  const model = models.includes(gpu) ? gpu : models[0];
  const modelLabel = (id: string) =>
    kind === "gpu"
      ? id.replaceAll("-", " ").toUpperCase()
      : id.slice(`compute:${kind}:`.length);
  const listings = useMemo(
    () =>
      currentOffers
        .filter(offer => offer.gpuModelId === model)
        .sort((a, b) => a.pricePerGpuHr - b.pricePerGpuHr),
    [currentOffers, model]
  );
  const offer =
    listings.find(o => o.offerId === selected) ??
    listings.find(
      o => isCurrent(catalog, o) && o.availability !== "unavailable"
    ) ??
    listings[0];
  const historical = pastOffers.filter(offer => offer.gpuModelId === model);
  const normalized = useMemo(
    () =>
      normalizedProviderSeries(
        catalog,
        new Set([...currentOffers, ...pastOffers].map(offer => offer.offerId)),
        windowStart,
        windowEnd
      ),
    [catalog, currentOffers, pastOffers, windowStart, windowEnd]
  );
  const historicalChoice = historical.find(h => h.offerId === selected);
  const linkedListingMissing = Boolean(
    shared?.id &&
    selected === shared.id &&
    !listings.some(listing => listing.offerId === selected) &&
    !historicalChoice
  );
  const chartId = linkedListingMissing
    ? undefined
    : (historicalChoice?.offerId ?? offer?.offerId ?? historical[0]?.offerId);
  const points = useMemo(
    () =>
      chartId ? marketSeries(catalog, chartId, windowStart, windowEnd) : [],
    [catalog, chartId, windowStart, windowEnd]
  );
  const stats = marketStats(points);
  const color =
    (stats?.change ?? 0) >= 0 ? "var(--sage)" : "var(--destructive)";
  const headline = hover?.price ?? stats?.last;
  let changeLabel;
  if (stats && stats.count > 1) {
    if (stats.high === stats.low) {
      changeLabel = "Unchanged in this range";
    } else if (stats.change === 0) {
      changeLabel = "0.00% net · varied in this range";
    } else {
      changeLabel = `${stats.change > 0 ? "+" : ""}${stats.change.toFixed(3)} (${stats.percent.toFixed(2)}%)`;
    }
  }
  const reset = () => {
    setHover(null);
    setSelected("");
    setChartBounds(undefined);
  };
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm mb-6">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <p className="text-[10px] font-data text-muted-foreground tracking-widest uppercase">
            {kind === "gpu" ? "GPU" : computeKinds[kind].label} market tape ·
            USD / {unit}
          </p>
          <h3 className="font-semibold text-xl mt-1">
            {model ? modelLabel(model) : "Price history"}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            One listing, real timestamps. Automatic snapshot updates.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Chart compute type"
            className="border border-border rounded bg-background p-2 text-xs"
            value={kind}
            onChange={event => {
              setKind(event.target.value as ListingKind);
              reset();
            }}
          >
            <option value="gpu">GPUs</option>
            {Object.entries(computeKinds).map(([id, item]) => (
              <option key={id} value={id}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Price billing model"
            className="border border-border rounded bg-background p-2 text-xs"
            value={billing}
            onChange={e => {
              setBilling(e.target.value);
              reset();
            }}
          >
            <option value="on-demand">On-demand</option>
            <option value="spot">Spot · interruptible</option>
          </select>
          <select
            aria-label={
              kind === "gpu" ? "Chart GPU model" : "Chart configuration"
            }
            className="border border-border rounded bg-background p-2 text-xs max-w-60"
            value={model ?? ""}
            disabled={!models.length}
            onChange={e => {
              setGpu(e.target.value);
              reset();
            }}
          >
            {!models.length && (
              <option value="">No matching configurations</option>
            )}
            {models.map(id => (
              <option key={id} value={id}>
                {modelLabel(id)}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 rounded border border-border bg-background px-2 py-1.5 text-xs">
            <input
              type="checkbox"
              className="accent-teal"
              checked={moversOnly}
              onChange={event => {
                setMoversOnly(event.target.checked);
                setHover(null);
                setChartBounds(undefined);
              }}
            />
            Price movers only
          </label>
          <label className="inline-flex items-center gap-2 rounded border border-border bg-background px-2 py-1.5 text-xs">
            <input
              type="checkbox"
              className="accent-teal"
              checked={allProviders}
              onChange={event => {
                setAllProviders(event.target.checked);
                setHover(null);
                setChartBounds(undefined);
              }}
            />
            All providers · normalized
          </label>
          {chartId && !allProviders && (
            <CopyViewLink
              url={viewLink(
                {
                  view: "trends",
                  id: chartId,
                  gpu: model,
                  billing,
                  hours,
                  movers: moversOnly,
                  through: windowEnd,
                  bounds: chartBounds,
                },
                window.location.href
              )}
            />
          )}
        </div>
      </div>
      {allProviders ? (
        <NormalizedProvidersPlot
          kind={kind}
          modelLabel={model ? modelLabel(model) : "selected configuration"}
          billing={billing}
          series={normalized}
        />
      ) : (
        <>
          <select
            aria-label="Historical listing"
            value={chartId ?? ""}
            disabled={!listings.length && !historical.length}
            onChange={e => {
              setSelected(e.target.value);
              setHover(null);
              setChartBounds(undefined);
            }}
            className="mt-4 w-full border border-border bg-background rounded p-2 text-xs"
          >
            {!chartId && (
              <option value="" disabled>
                {linkedListingMissing
                  ? "Choose another listing"
                  : "No matching listings"}
              </option>
            )}
            {listings.map(o => (
              <option key={o.offerId} value={o.offerId}>
                {o.providerName} · {o.region} ·{" "}
                {o.kind ? "" : `${cloudLabel(o)} · `}
                {o.kind
                  ? computeSpecs(o) || o.gpuModelName
                  : o.configurationKnown === false
                    ? "Per-GPU rate"
                    : `${o.gpuCount}× GPU / ${o.vcpus ?? "—"} vCPU / ${o.ramGb ?? "—"} GB RAM`}{" "}
                · ${o.pricePerGpuHr.toFixed(3)}{" "}
                {isCurrent(catalog, o)
                  ? "current quoted rate"
                  : "last observed rate"}
              </option>
            ))}
            {historical.map(h => (
              <option key={h.offerId} value={h.offerId}>
                {getProvider(h.providerId)?.name ?? h.providerId} · historical /
                removed listing · {h.offerId}
              </option>
            ))}
          </select>
          {linkedListingMissing && (
            <p role="status" className="mt-2 text-xs text-muted-foreground">
              The linked listing is outside the current filters or recorded
              history.
            </p>
          )}
          {anchoredEnd !== undefined && (
            <p className="mt-2 text-xs text-muted-foreground">
              History ending {date(anchoredEnd)}.{" "}
              <button
                className="underline"
                onClick={() => {
                  setAnchoredEnd(undefined);
                  setChartBounds(undefined);
                  setHover(null);
                }}
              >
                Use latest
              </button>
            </p>
          )}
          <div className="flex flex-wrap justify-between gap-4 mt-5 mb-4">
            <div>
              <div className="flex flex-wrap gap-x-3 items-baseline">
                <strong className="font-data text-3xl tabular-nums">
                  {headline !== undefined ? `$${headline.toFixed(3)}` : "—"}
                </strong>
                {changeLabel && (
                  <span
                    className="text-sm font-data"
                    style={{ color: stats?.change ? color : undefined }}
                  >
                    {changeLabel}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {hover
                  ? date(hover.time)
                  : points.length
                    ? `Last recorded ${date(points.at(-1)!.time)}`
                    : "Waiting for recorded observations"}{" "}
                · change since first sample in range
              </p>
            </div>
            <div className="flex gap-1 items-start">
              {(
                [
                  [1, "1H"],
                  [24, "24H"],
                  [168, "7D"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={hours === value}
                  onClick={() => {
                    setHours(value);
                    setHover(null);
                    setAnchoredEnd(undefined);
                    setChartBounds(undefined);
                  }}
                  className={`px-3 py-2 text-xs font-data rounded border ${hours === value ? "border-teal bg-teal/10 text-teal" : "border-border"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {chartId && offer && !historicalChoice && (
            <div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
              <AvailabilityBadge
                providerLink={offer.providerLink}
                state={
                  isCurrent(catalog, offer) ? offer.availability : "unknown"
                }
              />
              <span className="text-muted-foreground">
                {billingLabel(offer)}
                {offer.kind
                  ? offer.terms
                    ? ` · ${offer.terms}`
                    : ""
                  : ` · ${cloudLabel(offer)}`}
                {!isCurrent(catalog, offer) ? " · retained / stale quote" : ""}
              </span>
              <a
                className="text-teal underline ml-auto"
                href={offer.providerLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open provider ↗
              </a>
            </div>
          )}
          {points.length > 1 ? (
            <MarketPlot
              unit={unit}
              key={`${chartId}:${hours}:${anchoredEnd ?? "latest"}`}
              points={points}
              color={color}
              stats={stats!}
              onInspect={setHover}
              bounds={chartBounds}
              onBoundsChange={setChartBounds}
            />
          ) : (
            <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
              {moversOnly && !chartId
                ? "No recorded price moves for this billing type in the selected period."
                : points.length === 1
                  ? "One recorded sample in this range. Widen the range to see history."
                  : "No recorded samples in this range."}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-border pt-4 mt-3 text-xs">
            {[
              ["First sample", stats?.first],
              ["Sampled high", stats?.high],
              ["Sampled low", stats?.low],
              ["Observations", stats?.count],
            ].map(([label, v]) => (
              <div key={label}>
                <p className="text-muted-foreground mb-1">{label}</p>
                <strong className="font-data">
                  {v === undefined
                    ? "—"
                    : label === "Observations"
                      ? v
                      : `$${Number(v).toFixed(3)}`}
                </strong>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-4">
            {kind === "gpu" && billing === "spot"
              ? "Nebius spot history includes provider hourly-last prices at completed interval ends. Interruptible pricing is separate from on-demand."
              : "Collector observations from the selected listing. History starts at its first successful collection."}{" "}
            The line connects recorded samples; between-sample prices are
            unknown. No fabricated candles, volume, or price ticks. Flat rates
            stay flat. Collection is scheduled every 15 minutes. The page checks
            for new snapshots every minute.
          </p>
        </>
      )}
    </div>
  );
}

const providerColors = [
  "#0f766e",
  "#2563eb",
  "#c2410c",
  "#7c3aed",
  "#be123c",
  "#15803d",
  "#a16207",
  "#0369a1",
];

function NormalizedProvidersPlot({
  kind,
  modelLabel,
  billing,
  series,
}: {
  kind: ListingKind;
  modelLabel: string;
  billing: string;
  series: NormalizedProviderSeries[];
}) {
  const overlapStart = Math.max(...series.map(line => line.times[0]), 0);
  const overlapEnd = Math.min(...series.map(line => line.times.at(-1)!), 0);
  const times = [
    ...new Set(
      series.flatMap(line =>
        line.times.filter(time => time >= overlapStart && time <= overlapEnd)
      )
    ),
  ].sort((a, b) => a - b);
  const valueAt = (line: NormalizedProviderSeries, time: number) => {
    let value = line.values[0];
    for (let index = 1; index < line.times.length; index++) {
      if (line.times[index] > time) break;
      value = line.values[index];
    }
    return value;
  };
  const lines = series.map((line, index) => ({
    ...line,
    color: providerColors[index % providerColors.length],
    values: times.map(time => valueAt(line, time)),
  }));
  const values = lines.flatMap(line => line.values);
  const low = values.length ? Math.min(...values) : 95;
  const high = values.length ? Math.max(...values) : 105;
  const padding = Math.max((high - low) * 0.15, 2);
  return (
    <div className="mt-4">
      <div className="rounded-lg border border-teal/30 bg-teal/5 p-3 text-xs text-muted-foreground">
        Each provider is rebased to{" "}
        <strong className="text-foreground">100</strong> at the first shared
        observation. The lines show relative movement, so provider size and
        absolute price do not dominate the comparison.
      </div>
      {times.length > 1 ? (
        <>
          <TimeSeriesPlot
            label={
              "Normalized " +
              kind +
              " provider prices for " +
              modelLabel +
              ". 100 equals each provider's first shared observation."
            }
            times={times}
            series={lines.map(line => ({
              label: getProvider(line.providerId)?.name ?? line.providerId,
              color: line.color,
              values: line.values,
            }))}
            domain={[Math.max(0, low - padding), high + padding]}
            height={300}
            formatTime={date}
            formatValue={value => value.toFixed(0)}
          />
          <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
            {lines.map(line => (
              <li key={line.providerId} className="flex items-center gap-1.5">
                <span
                  className="w-3 h-0.5"
                  style={{ background: line.color }}
                />
                {getProvider(line.providerId)?.name ?? line.providerId}
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-border pt-4 mt-4 text-xs">
            {lines.map(line => (
              <div key={line.providerId}>
                <p className="text-muted-foreground mb-1 truncate">
                  {getProvider(line.providerId)?.name ?? line.providerId}
                </p>
                <strong className="font-data">
                  {line.values.at(-1)!.toFixed(1)} ·{" "}
                  {(line.values.at(-1)! - 100).toFixed(1)}%
                </strong>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
          Not enough shared observations for a provider comparison.
        </div>
      )}
      <p className="text-[11px] text-muted-foreground mt-4">
        {modelLabel} · {billing === "spot" ? "spot" : "on-demand"} · shared
        observation window. Provider points use the median matching listing
        price at each timestamp. Missing intervals carry the last observed value
        until the next observation.
      </p>
    </div>
  );
}

function MarketPlot({
  unit,
  points,
  color,
  stats,
  onInspect,
  bounds,
  onBoundsChange,
}: {
  unit: string;
  points: ReturnType<typeof marketSeries>;
  color: string;
  stats: NonNullable<ReturnType<typeof marketStats>>;
  onInspect: (point: { time: number; price: number } | null) => void;
  bounds?: HistoryBounds;
  onBoundsChange: (bounds: HistoryBounds) => void;
}) {
  const first = bounds
    ? Math.min(
        Math.max(
          0,
          points.findIndex(point => point.time >= bounds.start)
        ),
        points.length - 2
      )
    : 0;
  const last = bounds
    ? Math.max(
        first + 1,
        points.findLastIndex(point => point.time <= bounds.end)
      )
    : points.length - 1;
  const visible = points.slice(first, last + 1);
  const formatPrice = (value: number) => `$${value.toFixed(3)}`;
  return (
    <>
      <TimeSeriesPlot
        label={`Recorded price in USD per ${unit}. Use the arrow keys to inspect samples.`}
        times={visible.map(point => point.time)}
        series={[
          {
            label: "Recorded price",
            color,
            values: visible.map(point => point.price),
          },
        ]}
        domain={[
          Math.max(0, stats.low - Math.max(stats.low * 0.04, 0.01)),
          stats.high + Math.max(stats.high * 0.04, 0.01),
        ]}
        height={285}
        formatTime={date}
        formatValue={formatPrice}
        reference={stats.first}
        onInspect={index => onInspect(index === null ? null : visible[index])}
      />
      <div className="grid grid-cols-2 gap-4 mt-1 text-xs text-muted-foreground">
        <label>
          Chart start
          <input
            type="range"
            min={0}
            max={points.length - 2}
            value={first}
            aria-valuetext={date(points[first].time)}
            onChange={event => {
              const next = Number(event.target.value);
              onBoundsChange({
                start: points[next].time,
                end: points[Math.max(last, next + 1)].time,
              });
              onInspect(null);
            }}
            className="trend-range w-full"
          />
        </label>
        <label>
          Chart end
          <input
            type="range"
            min={1}
            max={points.length - 1}
            value={last}
            aria-valuetext={date(points[last].time)}
            onChange={event => {
              const value = Number(event.target.value);
              onBoundsChange({
                start: points[Math.min(first, value - 1)].time,
                end: points[value].time,
              });
              onInspect(null);
            }}
            className="trend-range w-full"
          />
        </label>
      </div>
    </>
  );
}
