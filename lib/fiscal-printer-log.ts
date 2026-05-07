"use client";

import { getRestaurantStorageKey } from "@/lib/restaurant-storage";
import { createStableId } from "@/utils/id";

export type FiscalPrinterLogEntry = {
  id: string;
  timestamp: string;
  operator: string;
  tableId?: string;
  tableLabel?: string;
  amount?: number;
  paymentMethod?: string;
  printerId: string;
  printerName: string;
  printerIpAddress: string;
  printerPort: number | null;
  mode: "mock" | "real";
  outcome: "success" | "failed" | "simulated" | "connection-test";
  errorMessage: string;
  payloadSummary: string;
};

const FISCAL_PRINTER_LOG_STORAGE_KEY = getRestaurantStorageKey("pos-fiscal-printer-log");
const OPERATIONAL_LOGS_API_ENDPOINT = "/api/operational-logs";
export const FISCAL_PRINTER_LOG_CHANGED_EVENT = "pos-fiscal-printer-log-changed";

function dispatchFiscalPrinterLogChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(FISCAL_PRINTER_LOG_CHANGED_EVENT));
  }
}

function mergeFiscalPrinterLogs(primary: FiscalPrinterLogEntry[], secondary: FiscalPrinterLogEntry[]) {
  const merged = new Map<string, FiscalPrinterLogEntry>();

  for (const entry of secondary) {
    merged.set(entry.id, entry);
  }

  for (const entry of primary) {
    merged.set(entry.id, entry);
  }

  return [...merged.values()].sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

export function getFiscalPrinterLogs() {
  if (typeof window === "undefined") {
    return [] as FiscalPrinterLogEntry[];
  }

  const rawValue = window.localStorage.getItem(FISCAL_PRINTER_LOG_STORAGE_KEY);

  if (!rawValue) {
    return [] as FiscalPrinterLogEntry[];
  }

  try {
    const parsedValue = JSON.parse(rawValue) as FiscalPrinterLogEntry[];
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    window.localStorage.removeItem(FISCAL_PRINTER_LOG_STORAGE_KEY);
    return [] as FiscalPrinterLogEntry[];
  }
}

export function appendFiscalPrinterLog(
  input: Omit<FiscalPrinterLogEntry, "id" | "timestamp">
) {
  const nextEntry: FiscalPrinterLogEntry = {
    id: createStableId("fiscal-log"),
    timestamp: new Date().toISOString(),
    ...input,
  };

  if (typeof window !== "undefined") {
    const nextLogs = [nextEntry, ...getFiscalPrinterLogs()];
    window.localStorage.setItem(FISCAL_PRINTER_LOG_STORAGE_KEY, JSON.stringify(nextLogs));
    dispatchFiscalPrinterLogChanged();
    void persistFiscalPrinterLogsToServer(nextLogs);
  }

  return nextEntry;
}

async function persistFiscalPrinterLogsToServer(entries: FiscalPrinterLogEntry[]) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const response = await fetch(OPERATIONAL_LOGS_API_ENDPOINT, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      cache: "no-store",
      body: JSON.stringify({
        fiscalPrinterLogs: entries,
      }),
    });

    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
}

export async function hydrateFiscalPrinterLogsFromServer() {
  if (typeof window === "undefined") {
    return [] as FiscalPrinterLogEntry[];
  }

  try {
    const response = await fetch(OPERATIONAL_LOGS_API_ENDPOINT, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-store",
      },
    });

    if (!response.ok) {
      return getFiscalPrinterLogs();
    }

    const payload = (await response.json()) as { fiscalPrinterLogs?: FiscalPrinterLogEntry[] };
    const merged = mergeFiscalPrinterLogs(
      Array.isArray(payload.fiscalPrinterLogs) ? payload.fiscalPrinterLogs : [],
      getFiscalPrinterLogs()
    );
    window.localStorage.setItem(FISCAL_PRINTER_LOG_STORAGE_KEY, JSON.stringify(merged));
    dispatchFiscalPrinterLogChanged();
    return merged;
  } catch {
    return getFiscalPrinterLogs();
  }
}
