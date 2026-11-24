/*
  PriceAlertModal — set/edit/clear price alerts for a GPU model.
  Lightweight modal triggered from the OffersTable row action.
*/

import { Modal } from "./Modal";
import { useState, useEffect, useRef, useId } from "react";
import { listingUnit, type ListingKind } from "@shared/catalog";
import { hourlyPrice } from "@/lib/data";
import { Bell, BellOff, X, Check } from "lucide-react";
import type { PriceAlert } from "../hooks/usePriceAlerts";

interface Props {
  gpuModelId: string;
  gpuModelName: string;
  currentPrice: number;
  kind?: ListingKind;
  existingAlert: PriceAlert | undefined;
  onSave: (gpuModelId: string, targetPrice: number) => boolean | void;
  onClear: (gpuModelId: string) => boolean | void;
  onClose: () => void;
}

export function PriceAlertModal({
  gpuModelId,
  gpuModelName,
  currentPrice,
  kind = "gpu",
  existingAlert,
  onSave,
  onClear,
  onClose,
}: Props) {
  const fieldId = useId();
  const [value, setValue] = useState(
    existingAlert
      ? String(existingAlert.targetPrice)
      : String(Number((currentPrice * 0.9).toFixed(kind === "gpu" ? 2 : 6)))
  );
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  useEffect(() => () => clearTimeout(dismissTimer.current), []);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const parsed = Number(value);
  const isValid = Number.isFinite(parsed) && parsed > 0;

  function handleSave() {
    if (!isValid || saved) return;
    if (onSave(gpuModelId, parsed) === false) {
      setSaveError(
        "Could not save this alert. Browser storage may be blocked or full."
      );
      return;
    }
    setSaveError("");
    setSaved(true);
    dismissTimer.current = setTimeout(onClose, 800);
  }

  function handleClear() {
    if (onClear(gpuModelId) === false) {
      setSaveError(
        "Could not clear this alert. Browser storage may be blocked or full."
      );
      return;
    }
    onClose();
  }

  return (
    <Modal titleId="price-alert-title" onClose={onClose}>
      <div
        className="relative w-full bg-card"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[oklch(0.65_0.18_25_/_0.12)] flex items-center justify-center">
              <Bell className="w-4 h-4 text-[oklch(0.62_0.18_25)]" />
            </div>
            <div>
              <div
                id="price-alert-title"
                className="text-sm font-semibold text-foreground"
              >
                Price highlight
              </div>
              <div className="font-data text-xs text-muted-foreground">
                {gpuModelName}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close price alert"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-card transition-colors duration-150"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label
                htmlFor={fieldId}
                className="mono-label text-muted-foreground"
              >
                Highlight at or below
              </label>
              <span className="font-data text-xs text-muted-foreground">
                Observed:{" "}
                <span className="text-foreground">
                  {hourlyPrice.format(currentPrice)} / {listingUnit(kind)}
                </span>
              </span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-data text-sm text-muted-foreground">
                $
              </span>
              <input
                id={fieldId}
                aria-invalid={!isValid}
                aria-describedby={`${fieldId}-help${!isValid ? ` ${fieldId}-error` : ""}`}
                ref={inputRef}
                type="number"
                step="any"
                min="0"
                value={value}
                onChange={e => {
                  setValue(e.target.value);
                  setSaveError("");
                }}
                onKeyDown={e => {
                  if (e.key === "Enter") handleSave();
                }}
                className={`w-full pl-7 pr-12 py-2.5 text-sm font-data border rounded-lg bg-card text-foreground transition-colors duration-200 ${
                  isValid
                    ? "border-border focus:border-[oklch(0.62_0.19_218)] focus:ring-1 focus:ring-[oklch(0.62_0.19_218_/_0.2)]"
                    : "border-[oklch(0.62_0.18_25)] focus:border-[oklch(0.62_0.18_25)]"
                }`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 font-data text-xs text-muted-foreground">
                /hr
              </span>
            </div>
            {!isValid && (
              <p
                id={`${fieldId}-error`}
                className="mt-1 text-xs text-destructive"
              >
                Enter a valid price greater than $0
              </p>
            )}
          </div>

          {saveError && (
            <p role="alert" className="text-xs text-destructive">
              {saveError}
            </p>
          )}
          {existingAlert && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[oklch(0.65_0.18_25_/_0.08)] border border-[oklch(0.65_0.18_25_/_0.2)]">
              <Bell className="w-3 h-3 text-[oklch(0.62_0.18_25)]" />
              <span className="text-xs text-[oklch(0.45_0.12_25)] dark:text-red-300">
                Highlight saved at{" "}
                <span className="font-data font-semibold">
                  {hourlyPrice.format(existingAlert.targetPrice)} /{" "}
                  {listingUnit(kind)}
                </span>
              </span>
            </div>
          )}

          <p
            id={`${fieldId}-help`}
            className="text-xs text-muted-foreground leading-relaxed"
          >
            Highlights matching offers while you browse. Saved in this browser;
            this does not send notifications. Use the watchlist for background
            alerts.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-5 pb-5">
          <button
            onClick={handleSave}
            disabled={!isValid || saved}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
              saved
                ? "bg-[oklch(0.60_0.18_155)] text-white"
                : isValid
                  ? "primary-action"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}
          >
            {saved ? (
              <>
                <Check className="w-3.5 h-3.5" /> Saved!
              </>
            ) : (
              <>
                <Bell className="w-3.5 h-3.5" /> Save highlight
              </>
            )}
          </button>

          {existingAlert && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[oklch(0.82_0.012_85)] transition-colors duration-200"
            >
              <BellOff className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
