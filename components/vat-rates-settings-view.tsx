"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getVatRateSettings,
  hydrateVatRateSettingsFromServer,
  persistVatRateSettingsToServer,
  saveVatRateSettings,
  type VatRateConfig,
} from "@/lib/vat-rate-settings";

function DragHandleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M9 6h.01" />
      <path d="M9 12h.01" />
      <path d="M9 18h.01" />
      <path d="M15 6h.01" />
      <path d="M15 12h.01" />
      <path d="M15 18h.01" />
    </svg>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (nextValue: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-7 w-12 items-center rounded-full border transition-colors",
        checked ? "border-[#b9d3ee] bg-[#dff0ff]" : "border-[#d8d5cc] bg-[#fbf8f2]",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-5 w-5 rounded-full border bg-white transition-transform",
          checked ? "translate-x-6 border-[#8fb8dc]" : "translate-x-1 border-[#d0cbc1]",
        ].join(" ")}
      />
    </button>
  );
}

export function VatRatesSettingsView() {
  const [rates, setRates] = useState<VatRateConfig[]>(() => getVatRateSettings());
  const [draggedRateKey, setDraggedRateKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    setRates(getVatRateSettings());
    void hydrateVatRateSettingsFromServer().then((nextRates) => {
      setRates(nextRates);
    });
  }, []);

  const sortedRates = useMemo(
    () => [...rates].sort((left, right) => left.sortOrder - right.sortOrder),
    [rates]
  );

  const persistRates = (nextRates: VatRateConfig[], message: string) => {
    const savedRates = saveVatRateSettings(nextRates);
    setRates(savedRates);
    setStatusMessage(message);
    void persistVatRateSettingsToServer(savedRates);
  };

  const handleToggleRate = (rateKey: string, enabled: boolean) => {
    persistRates(
      rates.map((rate) => (rate.key === rateKey ? { ...rate, enabled } : rate)),
      "Configurazione aliquote salvata"
    );
  };

  const handleDropOnRate = (targetKey: string) => {
    if (!draggedRateKey || draggedRateKey === targetKey) {
      setDraggedRateKey(null);
      return;
    }

    const reordered = [...sortedRates];
    const draggedIndex = reordered.findIndex((rate) => rate.key === draggedRateKey);
    const targetIndex = reordered.findIndex((rate) => rate.key === targetKey);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedRateKey(null);
      return;
    }

    const [draggedRate] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, draggedRate);

    persistRates(
      reordered.map((rate, index) => ({ ...rate, sortOrder: index })),
      "Ordine aliquote aggiornato"
    );
    setDraggedRateKey(null);
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#fffefb] p-4">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-[#2e2a25]">Aliquote IVA</h1>
        <p className="mt-1 text-sm text-[#6b645c]">
          Gestisci le aliquote operative disponibili. Per default la ristorazione usa solo IVA 10%.
        </p>
      </div>

      <div className="min-h-0 flex-1 rounded-[12px] border border-[#ddd8ce] bg-white p-4">
        {statusMessage ? (
          <div className="mb-3 text-xs font-semibold uppercase text-[#5d564e]">{statusMessage}</div>
        ) : null}

        <div className="space-y-2">
          {sortedRates.map((rate) => (
            <div
              key={rate.key}
              draggable
              onDragStart={() => setDraggedRateKey(rate.key)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDropOnRate(rate.key)}
              onDragEnd={() => setDraggedRateKey(null)}
              className={[
                "grid grid-cols-[minmax(0,1fr)_72px_36px] items-center gap-3 rounded-[10px] border px-4 py-3",
                draggedRateKey === rate.key
                  ? "border-[#b9d3ee] bg-[#eef6fd]"
                  : "border-[#e2ddd3] bg-[#ffffff]",
              ].join(" ")}
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#2e2a25]">{rate.label}</div>
                <div className="mt-1 text-xs text-[#766f66]">
                  {rate.enabled ? "Selezionabile nelle schermate operative" : "Disponibile solo come aliquota storica"}
                </div>
              </div>
              <div className="flex justify-end">
                <Toggle checked={rate.enabled} onChange={(nextValue) => handleToggleRate(rate.key, nextValue)} />
              </div>
              <div className="flex justify-center text-[#766f66]" aria-label={`Trascina ${rate.label}`}>
                <DragHandleIcon />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
