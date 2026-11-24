import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { isCurrent, isStale, type Snapshot } from "@shared/catalog";
import { computeKinds, type ComputeKind } from "@shared/compute";
import { hourlyPrice } from "@/lib/data";

const featuredModels = new Map([
  ["h100-sxm", "H100 SXM"],
  ["h200-sxm", "H200 SXM"],
  ["b200-sxm", "B200"],
  ["b300", "B300"],
  ["mi300x", "MI300X"],
  ["mi350x", "MI350X"],
  ["a100-sxm-80", "A100 80 GB SXM"],
  ["l40s", "L40S"],
  ["rtx-5090", "RTX 5090"],
  ["rtx-4090", "RTX 4090"],
  ["rtx-pro-6000", "RTX PRO 6000"],
]);

export function ComputeTicker({
  snapshot,
  onGpu,
  onCompute,
}: {
  snapshot: Snapshot;
  onGpu: (id: string) => void;
  onCompute: (kind: ComputeKind) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const hovering = useRef(false);
  const group = useRef<HTMLDivElement>(null);
  const now = Date.now();
  const gpu = new Map<
    string,
    { price: number; providers: Set<string>; retained: boolean }
  >();
  for (const offer of snapshot.offers) {
    if (
      !featuredModels.has(offer.gpuModelId) ||
      offer.billingModel === "spot" ||
      offer.availability === "unavailable"
    )
      continue;
    const retained = !isCurrent(snapshot, offer, now);
    let current = gpu.get(offer.gpuModelId);
    // Prefer fresh quotes for each model; retain an explicitly labeled floor otherwise.
    if (current && !current.retained && retained) continue;
    if (!current || (current.retained && !retained)) {
      current = { price: Infinity, providers: new Set<string>(), retained };
    }
    current.price = Math.min(current.price, offer.pricePerGpuHr);
    current.providers.add(offer.providerId);
    gpu.set(offer.gpuModelId, current);
  }
  const gpuCards = [...gpu]
    .sort(([, a], [, b]) => b.providers.size - a.providers.size)
    .map(([id, { price, retained }]) => ({
      id,
      label: featuredModels.get(id)!,
      price,
      retained,
      unit: "GPU-hour",
      open: () => onGpu(id),
    }));
  const otherCards = (Object.keys(computeKinds) as ComputeKind[]).flatMap(
    kind => {
      const feeds = (snapshot.compute ?? []).filter(feed => feed.observedAt);
      const rates = feeds.flatMap(feed =>
        feed.rates
          .filter(
            rate =>
              rate.kind === kind &&
              rate.billing === "on-demand" &&
              rate.availability !== "unavailable"
          )
          .map(rate => ({
            price: rate.price,
            retained: feed.status !== "ok" || isStale(feed.observedAt!, now),
          }))
      );
      const fresh = rates.filter(rate => !rate.retained);
      const usable = fresh.length ? fresh : rates;
      const prices = usable.map(rate => rate.price);
      return prices.length
        ? [
            {
              id: kind,
              ...computeKinds[kind],
              price: Math.min(...prices),
              retained: !fresh.length,
              open: () => onCompute(kind),
            },
          ]
        : [];
    }
  );
  const cards = [...gpuCards.slice(0, 3), ...otherCards, ...gpuCards.slice(3)];
  useEffect(() => {
    const node = track.current;
    const original = group.current;
    if (!node || !original || paused) return;
    let width = original.offsetWidth;
    let viewportWidth = node.clientWidth;
    const observer = new ResizeObserver(() => {
      width = original.offsetWidth;
      viewportWidth = node.clientWidth;
    });
    observer.observe(original);
    observer.observe(node);
    let frame = 0;
    let previous = 0;
    let position = node.scrollLeft;
    let lastWritten = position;
    const advance = (time: number) => {
      const elapsed = previous ? Math.min(time - previous, 50) : 0;
      previous = time;
      if (node.scrollLeft !== lastWritten) position = node.scrollLeft;
      if (
        width > viewportWidth &&
        !hovering.current &&
        !node.contains(document.activeElement)
      ) {
        position = (position + elapsed * 0.032) % width;
        node.scrollLeft = position;
      }
      lastWritten = node.scrollLeft;
      frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [cards.length, paused]);
  if (!cards.length) return null;

  function scroll(direction: number) {
    const node = track.current;
    if (node) node.scrollBy({ left: direction * node.clientWidth * 0.75 });
  }

  return (
    <section
      aria-label="Compute price ticker"
      className="border-b border-border bg-card"
    >
      <div className="container flex items-center gap-3">
        <div className="hidden sm:block shrink-0 pr-2">
          <h2 className="text-sm font-semibold">Compute watchlist</h2>
          <p className="text-xs text-muted-foreground">
            On-demand price floors
          </p>
        </div>
        <div
          ref={track}
          className="compute-ticker flex flex-1 overflow-x-auto"
          onMouseEnter={() => {
            hovering.current = true;
          }}
          onMouseLeave={() => {
            hovering.current = false;
          }}
        >
          {[false, true].map(copy => (
            <div
              key={String(copy)}
              ref={copy ? undefined : group}
              aria-hidden={copy || undefined}
              className="flex w-max shrink-0"
            >
              {cards.map(card => (
                <button
                  key={card.id}
                  tabIndex={copy ? -1 : undefined}
                  type="button"
                  onClick={card.open}
                  className="min-w-37 shrink-0 border-l border-border px-3 py-2.5 text-left hover:bg-muted focus-visible:bg-muted"
                >
                  <span className="block whitespace-nowrap text-xs font-semibold">
                    {card.label}
                    {card.retained && (
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        Last observed
                      </span>
                    )}
                  </span>
                  <span className="whitespace-nowrap font-data text-xs text-teal">
                    {hourlyPrice.format(card.price)}
                  </span>
                  <span className="ml-1 whitespace-nowrap text-xs text-muted-foreground">
                    / {card.unit}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            aria-label={
              paused ? "Play compute watchlist" : "Pause compute watchlist"
            }
            onClick={() => setPaused(value => !value)}
            className="header-control"
          >
            {paused ? (
              <Play className="size-4" />
            ) : (
              <Pause className="size-4" />
            )}
          </button>
          <button
            type="button"
            aria-label="Scroll compute watchlist left"
            onClick={() => scroll(-1)}
            className="header-control"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Scroll compute watchlist right"
            onClick={() => scroll(1)}
            className="header-control"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
