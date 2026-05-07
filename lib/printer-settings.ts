"use client";

import { getRestaurantConfig } from "@/lib/restaurant-config";
import { getRestaurantStorageKey } from "@/lib/restaurant-storage";
import { recordAuditEvent } from "@/services/audit-log-service";

export type PrinterModel = "ESC/POS" | "Epson RT v.10 XML7";
export type PrinterRole = "fiscal" | "bar" | "kitchen" | "generic";
export type PrinterConnectionMode = "mock" | "real";
export type PrinterStatus = "configured" | "online" | "offline" | "error";
export type PrinterConnectionResult = "never" | "success" | "failed";

export type PrinterRecord = {
  id: string;
  name: string;
  model: PrinterModel;
  ipAddress: string;
  port: number | null;
  timeoutMs: number;
  paperColumns: number | null;
  role: PrinterRole;
  enabled: boolean;
  connectionMode: PrinterConnectionMode;
  status: PrinterStatus;
  lastSeenAt?: string | null;
  lastTestedAt?: string | null;
  lastConnectionResult: PrinterConnectionResult;
  lastErrorMessage?: string;
  fiscalDeviceId?: string;
  createdAt: string;
  updatedAt: string;
};

const PRINTER_SETTINGS_STORAGE_KEY = getRestaurantStorageKey("pos-settings-printers");

function getNowIso() {
  return new Date().toISOString();
}

function createDefaultPrinters(): PrinterRecord[] {
  const configuredPrinters = getRestaurantConfig().printers;
  const now = getNowIso();

  if (configuredPrinters && configuredPrinters.length > 0) {
    return configuredPrinters.map((printer) => ({
      ...printer,
      lastSeenAt: null,
      lastTestedAt: null,
      lastConnectionResult: "never",
      lastErrorMessage: "",
      createdAt: now,
      updatedAt: now,
    }));
  }

  return [
    {
      id: "printer-bar",
      name: "Bar",
      model: "ESC/POS",
      ipAddress: "192.168.1.201",
      port: 9100,
      timeoutMs: 3000,
      paperColumns: 42,
      role: "bar",
      enabled: true,
      connectionMode: "mock",
      status: "configured",
      lastSeenAt: null,
      lastTestedAt: null,
      lastConnectionResult: "never",
      lastErrorMessage: "",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "printer-cucina",
      name: "Cucina",
      model: "ESC/POS",
      ipAddress: "192.168.1.202",
      port: 9100,
      timeoutMs: 3000,
      paperColumns: 42,
      role: "kitchen",
      enabled: true,
      connectionMode: "mock",
      status: "configured",
      lastSeenAt: null,
      lastTestedAt: null,
      lastConnectionResult: "never",
      lastErrorMessage: "",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "printer-fiscale",
      name: "Fiscale",
      model: "Epson RT v.10 XML7",
      ipAddress: "192.168.1.200",
      port: 9100,
      timeoutMs: 5000,
      paperColumns: null,
      role: "fiscal",
      enabled: true,
      connectionMode: "mock",
      status: "configured",
      lastSeenAt: null,
      lastTestedAt: null,
      lastConnectionResult: "never",
      lastErrorMessage: "",
      fiscalDeviceId: "",
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function inferRoleFromName(name: string) {
  const normalizedName = name.trim().toLowerCase();

  if (normalizedName === "fiscale") {
    return "fiscal" as const;
  }

  if (normalizedName === "bar") {
    return "bar" as const;
  }

  if (normalizedName === "cucina") {
    return "kitchen" as const;
  }

  return "generic" as const;
}

function normalizePrinterRecord(record: PrinterRecord, index: number): PrinterRecord {
  const now = getNowIso();
  const normalizedModel: PrinterModel =
    record.model === "Epson RT v.10 XML7" ? "Epson RT v.10 XML7" : "ESC/POS";
  const normalizedRole: PrinterRole = record.role ?? inferRoleFromName(record.name ?? "");
  const normalizedConnectionMode: PrinterConnectionMode =
    record.connectionMode === "real" ? "real" : "mock";
  const normalizedStatus: PrinterStatus =
    record.status === "online" || record.status === "offline" || record.status === "error"
      ? record.status
      : "configured";
  const normalizedConnectionResult: PrinterConnectionResult =
    record.lastConnectionResult === "success" || record.lastConnectionResult === "failed"
      ? record.lastConnectionResult
      : "never";

  return {
    id: record.id || `printer-${index + 1}`,
    name: record.name?.trim() || `Stampante ${index + 1}`,
    model: normalizedModel,
    ipAddress: record.ipAddress?.trim() || "",
    port:
      typeof record.port === "number" && record.port > 0
        ? Number(record.port)
        : normalizedModel === "Epson RT v.10 XML7"
          ? 9100
          : 9100,
    timeoutMs:
      typeof record.timeoutMs === "number" && record.timeoutMs > 0
        ? Number(record.timeoutMs)
        : normalizedModel === "Epson RT v.10 XML7"
          ? 5000
          : 3000,
    paperColumns:
      normalizedModel === "ESC/POS" && record.paperColumns && record.paperColumns > 0
        ? Number(record.paperColumns)
        : normalizedModel === "ESC/POS"
          ? 42
          : null,
    role: normalizedRole,
    enabled: record.enabled ?? true,
    connectionMode: normalizedConnectionMode,
    status: normalizedStatus,
    lastSeenAt: record.lastSeenAt || null,
    lastTestedAt: record.lastTestedAt || null,
    lastConnectionResult: normalizedConnectionResult,
    lastErrorMessage: record.lastErrorMessage?.trim() ?? "",
    fiscalDeviceId:
      normalizedModel === "Epson RT v.10 XML7" ? record.fiscalDeviceId?.trim() ?? "" : "",
    createdAt: record.createdAt || now,
    updatedAt: record.updatedAt || record.createdAt || now,
  };
}

export function getDefaultPrinterSettings() {
  return createDefaultPrinters();
}

export function getPrinterSettings() {
  if (typeof window === "undefined") {
    return getDefaultPrinterSettings();
  }

  const rawValue = window.localStorage.getItem(PRINTER_SETTINGS_STORAGE_KEY);

  if (!rawValue) {
    const defaults = getDefaultPrinterSettings();
    window.localStorage.setItem(PRINTER_SETTINGS_STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as PrinterRecord[];

    if (!Array.isArray(parsedValue) || parsedValue.length === 0) {
      const defaults = getDefaultPrinterSettings();
      window.localStorage.setItem(PRINTER_SETTINGS_STORAGE_KEY, JSON.stringify(defaults));
      return defaults;
    }

    const normalized = parsedValue.map((record, index) =>
      normalizePrinterRecord(record, index)
    );
    const existingIds = new Set(normalized.map((printer) => printer.id));
    const missingDefaults = getDefaultPrinterSettings().filter(
      (printer) => !existingIds.has(printer.id)
    );
    const merged = [...normalized, ...missingDefaults];

    window.localStorage.setItem(PRINTER_SETTINGS_STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    window.localStorage.removeItem(PRINTER_SETTINGS_STORAGE_KEY);
    const defaults = getDefaultPrinterSettings();
    window.localStorage.setItem(PRINTER_SETTINGS_STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  }
}

export function savePrinterSettings(printers: PrinterRecord[]) {
  const previousPrinters = getPrinterSettings();
  const normalizedPrinters = printers.map((printer, index) =>
    normalizePrinterRecord(printer, index)
  );

  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      PRINTER_SETTINGS_STORAGE_KEY,
      JSON.stringify(normalizedPrinters)
    );
  }

  recordAuditEvent({
    eventType: "CONFIG_PRINTER_CHANGED",
    entityType: "printer-settings",
    entityId: "printer-settings",
    previousValue: previousPrinters,
    nextValue: normalizedPrinters,
    origin: "configuration",
  });

  return normalizedPrinters;
}

export function updatePrinterById(
  printerId: string,
  updater: (printer: PrinterRecord) => PrinterRecord
) {
  const nextPrinters = savePrinterSettings(
    getPrinterSettings().map((printer) =>
      printer.id === printerId
        ? {
            ...updater(printer),
            updatedAt: getNowIso(),
          }
        : printer
    )
  );

  return nextPrinters.find((printer) => printer.id === printerId) ?? null;
}

export function getEnabledPrinters() {
  return getPrinterSettings().filter((printer) => printer.enabled);
}

export function getPrinterByRole(role: PrinterRole) {
  return (
    getPrinterSettings().find((printer) => printer.role === role && printer.enabled) ?? null
  );
}

export function getDepartmentPrinterMap() {
  return {
    BAR: getPrinterByRole("bar"),
    CUCINA: getPrinterByRole("kitchen"),
    FISCALE: getPrinterByRole("fiscal"),
  };
}
