"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { getRestaurantConfig } from "@/lib/restaurant-config";
import type { PosTableState } from "@/lib/pos-data";
import { useTables } from "@/store/table-context";

type OrderStatusTab = "sala" | "takeaway";

function formatEuro(value: number) {
  return `EUR ${value.toFixed(2)}`;
}

function getOpeningTimeLabel(table: PosTableState) {
  if (!table.createdAt) {
    return "";
  }

  const parsedDate = new Date(table.createdAt);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return parsedDate.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getProvisionalTotal(table: PosTableState) {
  return table.orders.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
}

function isOpenActiveTable(table: PosTableState) {
  return table.status === "occupied" && table.paymentStatus !== "paid" && table.orders.length > 0;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

export function OrderStatusView() {
  const router = useRouter();
  const { tables } = useTables();
  const restaurantConfig = getRestaurantConfig();
  const [activeTab, setActiveTab] = useState<OrderStatusTab>("sala");
  const [searchValue, setSearchValue] = useState("");

  const openTables = useMemo(
    () => tables.filter((table) => isOpenActiveTable(table)),
    [tables]
  );
  const normalizedSearch = searchValue.trim().toLowerCase();
  const salaTables = useMemo(
    () =>
      openTables
        .filter((table) => table.saleMode !== "Take Away")
        .filter((table) => table.name.toLowerCase().includes(normalizedSearch)),
    [normalizedSearch, openTables]
  );
  const takeawayTables = useMemo(
    () =>
      openTables
        .filter((table) => table.saleMode === "Take Away")
        .filter((table) => table.name.toLowerCase().includes(normalizedSearch)),
    [normalizedSearch, openTables]
  );
  const visibleTables = activeTab === "sala" ? salaTables : takeawayTables;

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-[#fffefb]">
      <div className="border-b border-[#d8d5cc] bg-[#f7f4ee] px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-bold text-[#2e2a25]">Stato ordini</h2>
          <div className="flex h-10 items-center rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-[#6a645b]">
            <SearchIcon />
            <input
              type="text"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Cerca tavolo aperto"
              className="ml-2 h-full w-[240px] bg-transparent text-sm text-[#2e2a25] outline-none placeholder:text-[#9a948a]"
            />
          </div>
        </div>
      </div>

      <div className="border-b border-[#d8d5cc] bg-[#fbf8f2] px-4 py-2">
        <div
          className={[
            "grid max-w-[320px] gap-2",
            restaurantConfig.features.takeaway ? "grid-cols-2" : "grid-cols-1",
          ].join(" ")}
        >
          <button
            type="button"
            onClick={() => setActiveTab("sala")}
            className={[
              "h-9 rounded-[4px] border px-3 text-sm font-semibold",
              activeTab === "sala"
                ? "border-[#b7b2a7] bg-[#fffefb] text-[#2e2a25]"
                : "border-[#d4d0c7] bg-[#ffffff] text-[#5c564f]",
            ].join(" ")}
          >
            Sala
          </button>
          {restaurantConfig.features.takeaway ? (
            <button
              type="button"
              onClick={() => setActiveTab("takeaway")}
              className={[
                "h-9 rounded-[4px] border px-3 text-sm font-semibold",
                activeTab === "takeaway"
                  ? "border-[#b7b2a7] bg-[#fffefb] text-[#2e2a25]"
                  : "border-[#d4d0c7] bg-[#ffffff] text-[#5c564f]",
              ].join(" ")}
            >
              Take Away
            </button>
          ) : null}
        </div>
      </div>

      <div
        className={[
          "grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4",
          restaurantConfig.features.takeaway ? "xl:grid-cols-2" : "",
        ].join(" ")}
      >
        <div className="flex min-h-0 flex-col overflow-hidden rounded-[4px] border border-[#d8d5cc] bg-[#ffffff]">
          <div className="border-b border-[#d8d5cc] bg-[#fbf8f2] px-4 py-3 text-sm font-bold text-[#2e2a25]">
            Sala
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-white">
            {salaTables.length > 0 ? (
              salaTables.map((table, index) => (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => router.push(`/order/${table.id}?panelMode=sent-summary`)}
                  className={[
                    "grid w-full grid-cols-[minmax(0,1fr)_132px_110px] items-center gap-3 px-4 py-3 text-left hover:bg-[#fffefb]",
                    index !== salaTables.length - 1 ? "border-b border-[#ece7dd]" : "",
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-[#2e2a25]">{`Tavolo ${table.name}`}</div>
                    <div className="mt-1 text-xs text-[#6a645b]">
                      {`Occupato${getOpeningTimeLabel(table) ? ` · Apertura ${getOpeningTimeLabel(table)}` : ""}`}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-[#433d36]">
                    {formatEuro(getProvisionalTotal(table))}
                  </div>
                  <div className="text-xs font-semibold uppercase text-[#5d564e]">
                    {`${table.guests} coperti`}
                  </div>
                </button>
              ))
            ) : (
              <div className="px-4 py-6 text-sm text-[#6a645b]">Nessun tavolo aperto</div>
            )}
          </div>
        </div>

        {restaurantConfig.features.takeaway ? (
          <div className="flex min-h-0 flex-col overflow-hidden rounded-[4px] border border-[#d8d5cc] bg-[#ffffff]">
            <div className="border-b border-[#d8d5cc] bg-[#fbf8f2] px-4 py-3 text-sm font-bold text-[#2e2a25]">
              Take Away
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-white">
              {takeawayTables.length > 0 ? (
                takeawayTables.map((table, index) => (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => router.push(`/order/${table.id}?panelMode=sent-summary`)}
                    className={[
                      "grid w-full grid-cols-[minmax(0,1fr)_132px_110px] items-center gap-3 px-4 py-3 text-left hover:bg-[#fffefb]",
                      index !== takeawayTables.length - 1 ? "border-b border-[#ece7dd]" : "",
                    ].join(" ")}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-[#2e2a25]">{table.name}</div>
                      <div className="mt-1 text-xs text-[#6a645b]">
                        {`Occupato${getOpeningTimeLabel(table) ? ` · Apertura ${getOpeningTimeLabel(table)}` : ""}`}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-[#433d36]">
                      {formatEuro(getProvisionalTotal(table))}
                    </div>
                    <div className="text-xs font-semibold uppercase text-[#5d564e]">
                      {`${table.guests} coperti`}
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-4 py-6 text-sm text-[#6a645b]">Nessun tavolo aperto</div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-t border-[#d8d5cc] bg-[#ffffff] px-4 py-2 text-xs text-[#6a645b]">
        {!restaurantConfig.features.takeaway || activeTab === "sala"
          ? `${visibleTables.length} tavoli aperti in Sala`
          : `${visibleTables.length} tavoli aperti in Take Away`}
      </div>
    </section>
  );
}
