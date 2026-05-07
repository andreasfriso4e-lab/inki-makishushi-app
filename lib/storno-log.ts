"use client";

export type StornoRecordType = "product" | "multiple" | "table";

export type StornoRecordItem = {
  itemId?: string;
  productId: string;
  name: string;
  quantity: number;
  department: string;
  printerRole: string;
  printerName?: string;
};

export type StornoRecord = {
  id: string;
  type: StornoRecordType;
  tableId: string;
  tableLabel: string;
  operator: string;
  operatorId: string;
  createdAt: string;
  reason?: string;
  printed: boolean;
  printerNames: string[];
  items: StornoRecordItem[];
};

const STORNO_LOG_STORAGE_KEY = "pos-storno-log";
const OPERATIONAL_LOGS_API_ENDPOINT = "/api/operational-logs";
export const STORNO_LOG_CHANGED_EVENT = "pos-storno-log-changed";

function dispatchStornoLogChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STORNO_LOG_CHANGED_EVENT));
  }
}

function mergeStornoRecords(primary: StornoRecord[], secondary: StornoRecord[]) {
  const merged = new Map<string, StornoRecord>();

  for (const record of secondary) {
    merged.set(record.id, record);
  }

  for (const record of primary) {
    merged.set(record.id, record);
  }

  return [...merged.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function normalizeRecord(record: StornoRecord): StornoRecord {
  return {
    ...record,
    printerNames: Array.isArray(record.printerNames) ? record.printerNames : [],
    items: Array.isArray(record.items) ? record.items : [],
  };
}

export function getStornoRecords() {
  if (typeof window === "undefined") {
    return [] as StornoRecord[];
  }

  const rawValue = window.localStorage.getItem(STORNO_LOG_STORAGE_KEY);

  if (!rawValue) {
    return [] as StornoRecord[];
  }

  try {
    const parsedValue = JSON.parse(rawValue) as StornoRecord[];
    return Array.isArray(parsedValue) ? parsedValue.map(normalizeRecord) : [];
  } catch {
    window.localStorage.removeItem(STORNO_LOG_STORAGE_KEY);
    return [] as StornoRecord[];
  }
}

export function appendStornoRecord(record: StornoRecord) {
  const nextRecords = [normalizeRecord(record), ...getStornoRecords()];

  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORNO_LOG_STORAGE_KEY, JSON.stringify(nextRecords));
    dispatchStornoLogChanged();
    void persistStornoRecordsToServer(nextRecords);
  }

  return record;
}

async function persistStornoRecordsToServer(entries: StornoRecord[]) {
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
        voidLogs: entries,
      }),
    });

    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
}

export async function hydrateStornoRecordsFromServer() {
  if (typeof window === "undefined") {
    return [] as StornoRecord[];
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
      return getStornoRecords();
    }

    const payload = (await response.json()) as { voidLogs?: StornoRecord[] };
    const merged = mergeStornoRecords(
      Array.isArray(payload.voidLogs) ? payload.voidLogs.map(normalizeRecord) : [],
      getStornoRecords()
    );
    window.localStorage.setItem(STORNO_LOG_STORAGE_KEY, JSON.stringify(merged));
    dispatchStornoLogChanged();
    return merged;
  } catch {
    return getStornoRecords();
  }
}
