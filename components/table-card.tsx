"use client";

import type { OrderItem, RestaurantTable } from "@/lib/pos-data";
import { getTableOperationalState } from "@/lib/table-operational-status";

type TableCardProps = {
  table: RestaurantTable & { orders?: OrderItem[] };
  isSelected: boolean;
  onSelect: (table: RestaurantTable & { orders?: OrderItem[] }) => void;
};

export function TableCard({ table, isSelected, onSelect }: TableCardProps) {
  const operationalState = getTableOperationalState(table);
  const statePalette = {
    free: {
      card: "border-[#d8d5cc] bg-[#f8f6f1] hover:bg-[#f1eee7]",
      selected: "border-[#a8a297] bg-[#ece7dc]",
      ring: "focus:ring-[#c7c2b7]",
      badge: "border-[#d7d1c7] bg-white text-[#6e685f]",
      footer: "border-[#d9d4ca]",
    },
    "open-no-command": {
      card: "border-[#efd8af] bg-[#fff5dd] hover:bg-[#ffefce]",
      selected: "border-[#e0bf7e] bg-[#ffebc2]",
      ring: "focus:ring-[#efd8af]",
      badge: "border-[#f1d7a4] bg-[#fff9ec] text-[#906428]",
      footer: "border-[#edd9b5]",
    },
    "command-sent": {
      card: "border-[#b7cfe4] bg-[#dcefff] hover:bg-[#d0e9ff]",
      selected: "border-[#8fb7d4] bg-[#c3e1fb]",
      ring: "focus:ring-[#aac8e2]",
      badge: "border-[#b9d3ee] bg-[#eef7ff] text-[#24557e]",
      footer: "border-[#c9dced]",
    },
    "changes-pending": {
      card: "border-[#f0c36b] bg-[#ffe8ba] hover:bg-[#ffdf9d]",
      selected: "border-[#deaa41] bg-[#ffd782]",
      ring: "focus:ring-[#efc060]",
      badge: "border-[#f1c35a] bg-[#fff4da] text-[#8d4f00]",
      footer: "border-[#efcf8f]",
    },
    "ready-payment": {
      card: "border-[#c8c1f0] bg-[#eee8ff] hover:bg-[#e6ddff]",
      selected: "border-[#afa2e5] bg-[#ded2ff]",
      ring: "focus:ring-[#cbc0f2]",
      badge: "border-[#cbc0f2] bg-[#f5f1ff] text-[#5b4aa5]",
      footer: "border-[#d8cff2]",
    },
    "prebill-printed": {
      card: "border-[#8fcbb8] bg-[#dbf3ea] hover:bg-[#cfede2]",
      selected: "border-[#6fb89f] bg-[#c3e8db]",
      ring: "focus:ring-[#9cd5c3]",
      badge: "border-[#9cd5c3] bg-[#effbf6] text-[#216756]",
      footer: "border-[#bde3d6]",
    },
  }[operationalState.key];

  return (
    <button
      type="button"
      onClick={() => onSelect(table)}
      className={[
        "flex h-full flex-col justify-between rounded-[4px] border px-2 py-1.5 text-left text-[#2e2a25]",
        "active:translate-y-px focus:outline-none focus:ring-1",
        isSelected ? statePalette.selected : statePalette.card,
        statePalette.ring,
      ].join(" ")}
    >
      <div className="flex items-start justify-between text-[10px] uppercase leading-none text-[#6e685f]">
        <span
          className={[
            "rounded-[999px] border px-1.5 py-0.5 font-bold tracking-[0.04em]",
            statePalette.badge,
          ].join(" ")}
        >
          {operationalState.shortLabel}
        </span>
        <span>{operationalState.covers}</span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <span className="text-[34px] font-bold leading-none text-[#302c26]">{table.name}</span>
        <span className="mt-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#4f4840]">
          {operationalState.label}
        </span>
      </div>

      <div className={["flex items-center justify-between border-t pt-1 text-[10px] leading-none text-[#756f67]", statePalette.footer].join(" ")}>
        <span>{`Coperti: ${operationalState.covers}`}</span>
        <div className="flex items-center gap-1.5">
          {operationalState.total > 0 ? <span>{`${operationalState.total.toFixed(2)} €`}</span> : null}
          {operationalState.hasPendingChanges ? <span title="Modifiche da inviare">!</span> : null}
          {operationalState.hasPrintedPrebill ? <span title="Preconto stampato">PC</span> : null}
        </div>
      </div>
    </button>
  );
}
