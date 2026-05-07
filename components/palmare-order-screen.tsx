"use client";

import type { ReactNode } from "react";

type PalmareOrderScreenProps = {
  tableLabel: string;
  totalLabel: string;
  operatorLabel: string;
  roomLabel?: string;
  statusLabel: string;
  onBack: () => void;
  onHome?: () => void;
  onTableToolsOpen?: () => void;
  onSearchOpen: () => void;
  content: ReactNode;
  summaryPanel?: ReactNode;
  courseSelector?: ReactNode;
  bottomBar?: ReactNode;
};

export function PalmareOrderScreen({
  tableLabel,
  totalLabel,
  operatorLabel,
  roomLabel,
  statusLabel,
  onBack,
  onHome,
  onTableToolsOpen,
  onSearchOpen,
  content,
  summaryPanel,
  courseSelector,
  bottomBar,
}: PalmareOrderScreenProps) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#fffdfa]">
      <header className="shrink-0 border-b border-[#d8d5cc] bg-[#fbf8f2] px-2 py-1.5 text-[#2e2a25]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onBack}
              className="h-7 rounded-[8px] border border-[#d8d5cc] bg-white px-2 text-[10px] font-semibold"
            >
              Indietro
            </button>
            {onHome ? (
              <button
                type="button"
                onClick={onHome}
                className="h-7 rounded-[8px] border border-[#d8d5cc] bg-white px-2 text-[10px] font-semibold"
              >
                Tavoli
              </button>
            ) : null}
          </div>
          <div className="min-w-0 flex-1 text-center">
            <div className="truncate text-[13px] font-bold leading-tight">{tableLabel}</div>
            <div className="truncate text-[9px] leading-tight text-[#6a645b]">{operatorLabel}</div>
          </div>
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-[0.06em] text-[#7a736a]">Totale</div>
            <div className="text-[11px] font-bold leading-tight">{totalLabel}</div>
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-1">
          {courseSelector ? <div className="min-w-0 flex-1">{courseSelector}</div> : <div className="flex-1" />}
          {onTableToolsOpen ? (
            <button
              type="button"
              onClick={onTableToolsOpen}
              className="h-7 rounded-[8px] border border-[#d8d5cc] bg-white px-2 text-[10px] font-semibold text-[#2e2a25]"
              title="Apri commensali e riepilogo tavolo"
            >
              Tavolo
            </button>
          ) : null}
          <button
            type="button"
            onClick={onSearchOpen}
            className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-[#d8d5cc] bg-white text-sm font-semibold text-[#2e2a25]"
            aria-label="Apri ricerca prodotti"
            title="Cerca prodotti"
          >
            ⌕
          </button>
          <button
            type="button"
            disabled
            className="h-7 rounded-[8px] border border-[#d8d5cc] bg-[#f7f4ee] px-2 text-[10px] font-semibold text-[#8a8379]"
            title="PLU non disponibile in questa demo"
          >
            PLU
          </button>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[9px] text-[#6a645b]">
          <span className="truncate">{roomLabel || "Sala"}</span>
          <span className="rounded-[999px] border border-[#d8d5cc] bg-white px-2 py-0.5 text-[9px] font-semibold text-[#2e2a25]">
            {statusLabel}
          </span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">{content}</div>

          {summaryPanel ? (
            <div className="shrink-0 border-t border-[#d8d5cc] bg-[#fffefb] px-2 py-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#5d564e]">
                  Riepilogo tavolo
                </div>
                <div className="text-[10px] font-semibold text-[#6a645b]">{totalLabel}</div>
              </div>
              <div className="max-h-[30dvh] overflow-y-auto rounded-[10px] border border-[#d8d5cc] bg-white p-2">
                {summaryPanel}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {bottomBar ? (
        <div className="shrink-0 border-t border-[#d8d5cc] bg-white px-2 py-2 shadow-[0_-8px_18px_rgba(31,26,21,0.06)]">
          {bottomBar}
        </div>
      ) : null}
    </div>
  );
}
