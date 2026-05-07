"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getPaymentMethodSettings,
  hydratePaymentMethodSettingsFromServer,
  persistPaymentMethodSettingsToServer,
  savePaymentMethodSettings,
  type ConfigurablePaymentMethodId,
  type PaymentMethodSetting,
} from "@/lib/payment-method-settings";

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

export function PaymentSettingsView() {
  const [methods, setMethods] = useState<PaymentMethodSetting[]>(() => getPaymentMethodSettings());
  const [draggedMethodId, setDraggedMethodId] = useState<ConfigurablePaymentMethodId | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    setMethods(getPaymentMethodSettings());
    void hydratePaymentMethodSettingsFromServer().then((nextMethods) => {
      setMethods(nextMethods);
    });
  }, []);

  const sortedMethods = useMemo(
    () => [...methods].sort((left, right) => left.sortOrder - right.sortOrder),
    [methods]
  );

  const persistMethods = (nextMethods: PaymentMethodSetting[], message: string) => {
    const savedMethods = savePaymentMethodSettings(nextMethods);
    setMethods(savedMethods);
    setStatusMessage(message);
    void persistPaymentMethodSettingsToServer(savedMethods);
  };

  const handleToggleMethod = (methodId: ConfigurablePaymentMethodId, enabled: boolean) => {
    persistMethods(
      methods.map((method) => (method.id === methodId ? { ...method, enabled } : method)),
      "Configurazione pagamenti salvata"
    );
  };

  const handleDropOnMethod = (targetId: ConfigurablePaymentMethodId) => {
    if (!draggedMethodId || draggedMethodId === targetId) {
      setDraggedMethodId(null);
      return;
    }

    const reordered = [...sortedMethods];
    const draggedIndex = reordered.findIndex((method) => method.id === draggedMethodId);
    const targetIndex = reordered.findIndex((method) => method.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedMethodId(null);
      return;
    }

    const [draggedMethod] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, draggedMethod);

    persistMethods(
      reordered.map((method, index) => ({ ...method, sortOrder: index })),
      "Ordine metodi aggiornato"
    );
    setDraggedMethodId(null);
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#fffefb] p-4">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-[#2e2a25]">Pagamenti</h1>
        <p className="mt-1 text-sm text-[#6b645c]">
          Scegli quali metodi di pagamento mostrare nel conto tavolo e in quale ordine.
        </p>
      </div>

      <div className="min-h-0 flex-1 rounded-[12px] border border-[#ddd8ce] bg-white p-4">
        {statusMessage ? (
          <div className="mb-3 text-xs font-semibold uppercase text-[#5d564e]">{statusMessage}</div>
        ) : null}

        <div className="space-y-2">
          {sortedMethods.map((method) => (
            <div
              key={method.id}
              draggable
              onDragStart={() => setDraggedMethodId(method.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDropOnMethod(method.id)}
              onDragEnd={() => setDraggedMethodId(null)}
              className={[
                "grid grid-cols-[minmax(0,1fr)_72px_36px] items-center gap-3 rounded-[10px] border px-4 py-3",
                draggedMethodId === method.id
                  ? "border-[#b9d3ee] bg-[#eef6fd]"
                  : "border-[#e2ddd3] bg-[#ffffff]",
              ].join(" ")}
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#2e2a25]">{method.label}</div>
                <div className="mt-1 text-xs text-[#766f66]">
                  {method.enabled ? "Visibile nella schermata pagamento tavolo" : "Nascosto nella schermata pagamento tavolo"}
                </div>
              </div>
              <div className="flex justify-end">
                <Toggle checked={method.enabled} onChange={(nextValue) => handleToggleMethod(method.id, nextValue)} />
              </div>
              <div className="flex justify-center text-[#766f66]" aria-label={`Trascina ${method.label}`}>
                <DragHandleIcon />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
