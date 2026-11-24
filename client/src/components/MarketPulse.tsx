/*
  MarketPulse — Current market metrics
*/

import { catalog, eligibleOffers } from "@/lib/catalog";
import { displayQuote } from "@shared/market";
import { Activity, TrendingDown, Server, Cpu } from "lucide-react";

export function MarketPulse() {
  const offers = eligibleOffers();
  const quote = displayQuote(catalog, "h100-sxm");
  const stats = {
    totalOffers: catalog.offers.length,
    availableOffers: offers.filter(
      o => o.availability === "available" || o.availability === "limited"
    ).length,
    providerCount: new Set(catalog.offers.map(o => o.providerId)).size,
    gpuModelCount: new Set(catalog.offers.map(o => o.gpuModelId)).size,
    h100Floor: quote?.offer.pricePerGpuHr ?? null,
  };

  const metrics = {
    totalOffers: stats.totalOffers,
    availableOffers: stats.availableOffers,
    providers: stats.providerCount,
    gpuModels: stats.gpuModelCount,
    lowestH100: stats.h100Floor,
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
      <MetricCard
        icon={<Activity className="w-4 h-4" />}
        label="Reported capacity"
        value={metrics.availableOffers}
        suffix=""
        subtext={
          offers.length
            ? `of ${metrics.totalOffers} tracked`
            : "Awaiting a fresh stock report"
        }
        missing={offers.length === 0}
      />
      <MetricCard
        icon={<Server className="w-4 h-4" />}
        label="Providers"
        value={metrics.providers}
        suffix=""
        subtext="tracked cloud platforms"
      />
      <MetricCard
        icon={<TrendingDown className="w-4 h-4" />}
        label={quote?.retained ? "Last observed H100" : "H100 Floor"}
        value={metrics.lowestH100 ? Math.round(metrics.lowestH100 * 100) : 0}
        suffix=""
        prefix="$"
        divisor={100}
        decimals={2}
        subtext="On-demand · USD / GPU-hour"
        missing={metrics.lowestH100 === null}
      />
      <MetricCard
        icon={<Cpu className="w-4 h-4" />}
        label="GPU Models"
        value={metrics.gpuModels}
        suffix=""
        subtext="tracked configurations"
      />
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  suffix = "",
  prefix = "",
  subtext,
  divisor = 1,
  decimals = 0,
  missing = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
  prefix?: string;
  subtext: string;
  missing?: boolean;
  divisor?: number;
  decimals?: number;
}) {
  const displayValue =
    decimals > 0 ? (value / divisor).toFixed(decimals) : value.toString();

  return (
    <div className="bg-card border border-border rounded-xl px-5 py-4">
      <div className="flex items-center gap-2 mb-3 text-muted-foreground">
        <span aria-hidden="true">{icon}</span>
        <span className="text-sm">{label}</span>
      </div>

      <div className="flex items-baseline gap-0.5">
        {prefix && (
          <span className="font-data text-lg text-muted-foreground">
            {prefix}
          </span>
        )}
        <span className="font-data text-3xl font-semibold text-foreground tracking-tight">
          {missing ? "—" : displayValue}
        </span>
        {suffix && (
          <span className="font-data text-sm text-muted-foreground ml-1">
            {suffix}
          </span>
        )}
      </div>

      {subtext && (
        <p className="text-xs text-muted-foreground mt-2">{subtext}</p>
      )}
    </div>
  );
}
