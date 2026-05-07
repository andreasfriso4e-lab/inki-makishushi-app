"use client";

import type { ReactNode } from "react";

type FinalPaymentPanelProps = {
  totalLabel: string;
  paymentMethodLabel: string;
  documentLabel: string;
  canConfirm: boolean;
  showBackToCalculator: boolean;
  onBackToCalculator?: () => void;
  onConfirmPayment: () => void;
  onReturnToTable: () => void;
  children: ReactNode;
};

export function FinalPaymentPanel({
  totalLabel,
  paymentMethodLabel,
  documentLabel,
  canConfirm,
  showBackToCalculator,
  onBackToCalculator,
  onConfirmPayment,
  onReturnToTable,
  children,
}: FinalPaymentPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#fffefb]">
      <div className="shrink-0 border-b border-[#d8d5cc] bg-[#f7f4ee] px-5 py-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#0b3c5d]">
          PANNELLO FINALE PAGAMENTO ATTIVO
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold uppercase text-[#5d564e]">Pagamento</div>
            <div className="mt-1 text-[11px] font-medium text-[#7a736a]">
              Metodo, documento fiscale e conferma pagamento
            </div>
          </div>
          <button
            type="button"
            onClick={onReturnToTable}
            className="h-9 rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-xs font-semibold text-[#2e2a25]"
          >
            Torna al tavolo
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 pb-8">
        <div className="space-y-5">
          <div className="rounded-[4px] border border-[#a9c9e6] bg-[#eef7ff] p-3">
            <div className="text-[11px] font-semibold uppercase text-[#5b6f83]">Totale da pagare</div>
            <div className="mt-1 text-2xl font-bold text-[#0b3c5d]">{totalLabel}</div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-[#4f6272] sm:grid-cols-2">
              <div className="rounded-[4px] border border-[#c7d9ea] bg-white px-3 py-2">
                <div className="uppercase text-[#6e7f8d]">Metodo di pagamento</div>
                <div className="mt-1 font-semibold text-[#0b3c5d]">{paymentMethodLabel}</div>
              </div>
              <div className="rounded-[4px] border border-[#c7d9ea] bg-white px-3 py-2">
                <div className="uppercase text-[#6e7f8d]">Documento fiscale</div>
                <div className="mt-1 font-semibold text-[#0b3c5d]">{documentLabel}</div>
              </div>
            </div>
          </div>

          {children}
        </div>
      </div>

      <div
        className="sticky bottom-0 shrink-0 border-t border-[#d8d5cc] bg-[#f7f4ee] px-5 py-4"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)]">
          {showBackToCalculator ? (
            <button
              type="button"
              onClick={onBackToCalculator}
              className="h-11 rounded-[4px] border border-[#c7c1b6] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25]"
            >
              Indietro
            </button>
          ) : (
            <button
              type="button"
              onClick={onReturnToTable}
              className="h-11 rounded-[4px] border border-[#c7c1b6] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25]"
            >
              Annulla
            </button>
          )}
          <button
            type="button"
            onClick={onReturnToTable}
            className="h-11 rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm font-semibold text-[#2e2a25]"
          >
            Torna al tavolo
          </button>
          <button
            type="button"
            onClick={onConfirmPayment}
            disabled={!canConfirm}
            className="h-12 rounded-[4px] border border-[#a9c9e6] bg-[#cfe8ff] px-4 text-sm font-bold text-[#0b3c5d] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Conferma pagamento
          </button>
        </div>
      </div>
    </div>
  );
}
