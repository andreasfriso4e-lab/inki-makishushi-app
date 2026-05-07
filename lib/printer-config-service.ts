"use client";

import {
  getPrinterSettings,
  savePrinterSettings,
  type PrinterRecord,
} from "@/lib/printer-settings";
import { getRestaurantStorageKey } from "@/lib/restaurant-storage";

export type PrintingFeatureFlags = {
  printingEnabled: boolean;
  hardwarePrintingEnabled: boolean;
  fiscalPrintingEnabled: boolean;
  updatedAt: string;
};

const PRINTING_FEATURE_FLAGS_STORAGE_KEY = getRestaurantStorageKey("pos-printing-feature-flags");

function getNowIso() {
  return new Date().toISOString();
}

function getDefaultPrintingFeatureFlags(): PrintingFeatureFlags {
  return {
    printingEnabled: true,
    hardwarePrintingEnabled: false,
    fiscalPrintingEnabled: false,
    updatedAt: getNowIso(),
  };
}

function hasEnabledRealDepartmentPrinter(printers: PrinterRecord[]) {
  return printers.some(
    (printer) =>
      printer.enabled &&
      printer.connectionMode === "real" &&
      printer.model === "ESC/POS" &&
      printer.role !== "fiscal"
  );
}

function getDefaultFlagsWithRealHardware(realDepartmentPrinterEnabled: boolean): PrintingFeatureFlags {
  return {
    ...getDefaultPrintingFeatureFlags(),
    hardwarePrintingEnabled:
      realDepartmentPrinterEnabled || getDefaultPrintingFeatureFlags().hardwarePrintingEnabled,
  };
}

export function getPrintingFeatureFlags() {
  const printers = getPrinterSettings();
  const realDepartmentPrinterEnabled = hasEnabledRealDepartmentPrinter(printers);

  if (typeof window === "undefined") {
    return getDefaultFlagsWithRealHardware(realDepartmentPrinterEnabled);
  }

  const rawValue = window.localStorage.getItem(PRINTING_FEATURE_FLAGS_STORAGE_KEY);

  if (!rawValue) {
    const defaults = getDefaultFlagsWithRealHardware(realDepartmentPrinterEnabled);
    window.localStorage.setItem(PRINTING_FEATURE_FLAGS_STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as Partial<PrintingFeatureFlags>;
    const normalizedValue: PrintingFeatureFlags = {
      printingEnabled: parsedValue.printingEnabled ?? true,
      hardwarePrintingEnabled:
        (parsedValue.hardwarePrintingEnabled ?? false) || realDepartmentPrinterEnabled,
      fiscalPrintingEnabled: parsedValue.fiscalPrintingEnabled ?? false,
      updatedAt: parsedValue.updatedAt || getNowIso(),
    };
    window.localStorage.setItem(
      PRINTING_FEATURE_FLAGS_STORAGE_KEY,
      JSON.stringify(normalizedValue)
    );
    return normalizedValue;
  } catch {
    const defaults = getDefaultFlagsWithRealHardware(realDepartmentPrinterEnabled);
    window.localStorage.setItem(PRINTING_FEATURE_FLAGS_STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  }
}

export function savePrintingFeatureFlags(flags: PrintingFeatureFlags) {
  const normalizedFlags = {
    ...flags,
    updatedAt: flags.updatedAt || getNowIso(),
  };

  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      PRINTING_FEATURE_FLAGS_STORAGE_KEY,
      JSON.stringify(normalizedFlags)
    );
  }

  return normalizedFlags;
}

export class PrinterConfigService {
  getPrinters() {
    return getPrinterSettings();
  }

  savePrinters(printers: PrinterRecord[]) {
    return savePrinterSettings(printers);
  }

  updatePrinter(
    printerId: string,
    updater: (printer: PrinterRecord) => PrinterRecord
  ) {
    const printers = this.getPrinters();
    const now = getNowIso();
    const nextPrinters = this.savePrinters(
      printers.map((printer) =>
        printer.id === printerId
          ? {
              ...updater(printer),
              updatedAt: now,
            }
          : printer
      )
    );

    return nextPrinters.find((printer) => printer.id === printerId) ?? null;
  }

  getPrinterById(printerId: string) {
    return this.getPrinters().find((printer) => printer.id === printerId) ?? null;
  }

  getFeatureFlags() {
    return getPrintingFeatureFlags();
  }

  saveFeatureFlags(flags: PrintingFeatureFlags) {
    return savePrintingFeatureFlags({
      ...flags,
      updatedAt: getNowIso(),
    });
  }

  updateFeatureFlags(
    updater: (flags: PrintingFeatureFlags) => PrintingFeatureFlags
  ) {
    return this.saveFeatureFlags(updater(this.getFeatureFlags()));
  }
}
