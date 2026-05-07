"use client";

import type { RestaurantTable } from "@/lib/pos-data";

type OrderPanelProps = {
  table: RestaurantTable | undefined;
};

type FieldRowProps = {
  label: string;
  value: string;
  tall?: boolean;
};

function FieldRow({ label, value, tall = false }: FieldRowProps) {
  return (
    <div className="rounded-[4px] border border-[#d8d5cc] bg-[#f7f4ee]">
      <div className="border-b border-[#d8d5cc] bg-[#e3dfd5] px-2 py-1 text-[11px] font-semibold text-[#575148]">
        {label}
      </div>
      <div
        className={[
          "bg-[#ffffff] px-2 py-1.5 text-sm text-[#2e2a25]",
          tall ? "min-h-[108px]" : "min-h-8",
        ].join(" ")}
      >
        {value || "\u00A0"}
      </div>
    </div>
  );
}

export function OrderPanel({ table }: OrderPanelProps) {
  if (!table) {
    return (
      <aside className="flex h-full min-h-0 flex-col border-l border-[#d8d5cc] bg-[#fbf8f2]">
        <div className="flex h-10 items-center justify-between border-b border-[#d8d5cc] bg-[#e6e1d7] px-3">
          <h2 className="text-sm font-bold text-[#2e2a25]">Dettaglio tavolo</h2>
          <button type="button" className="h-7 rounded-[4px] border border-[#c7c1b6] bg-[#ffffff] px-2 text-[11px] text-[#4d483f]">
            Azioni
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-[#6a645b]">
          <p>Seleziona un tavolo dalla mappa.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-[#d8d5cc] bg-[#fbf8f2]">
      <div className="flex h-10 items-center justify-between border-b border-[#d8d5cc] bg-[#e6e1d7] px-3">
        <h2 className="text-sm font-bold text-[#2e2a25]">{`Tavolo ${table.name}`}</h2>
        <button type="button" className="h-7 rounded-[4px] border border-[#c7c1b6] bg-[#ffffff] px-2 text-[11px] text-[#4d483f]">
          Azioni
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-2">
          <FieldRow label="Cliente" value={table.customerName} />
          <FieldRow label="Azienda" value={table.companyName} />
          <FieldRow label="Operatore" value={table.operator} />
          <FieldRow label="Modalita di vendita" value={table.saleMode} />
          <FieldRow label="Prezzo coperto" value={table.servicePriceLabel} />
          <FieldRow label="Numero di coperti" value={String(table.guests)} />
          <FieldRow label="Sconto o maggiorazione" value={table.discountType} />
          <FieldRow label="Note" value={table.note} tall />
        </div>
      </div>

      <div className="border-t border-[#d8d5cc] px-3 py-3">
        <div className="rounded-[4px] border border-[#d8d5cc] bg-[#f7f4ee]">
          <div className="border-b border-[#d8d5cc] bg-[#e3dfd5] px-2 py-1 text-[11px] font-semibold text-[#575148]">
            Tavoli uniti
          </div>
          <div className="min-h-9 bg-[#ffffff] px-2 py-2 text-sm text-[#6a645b]">Nessuno</div>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="h-9 rounded-[4px] border border-[#c7c1b6] bg-[#ffffff] px-2 text-xs font-semibold text-[#2e2a25]"
          >
            Unisci tavoli
          </button>
          <button
            type="button"
            className="h-9 rounded-[4px] border border-[#c7c1b6] bg-[#ffffff] px-2 text-xs font-semibold text-[#2e2a25]"
          >
            Separa tutti
          </button>
        </div>
      </div>
    </aside>
  );
}
