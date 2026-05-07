"use client";

import {
  getOrderCommandSettings,
  saveOrderCommandSettings,
  type OrderCommandSettings,
} from "@/lib/order-command-settings";
import {
  getPrintingFeatureFlags,
  savePrintingFeatureFlags,
  type PrintingFeatureFlags,
} from "@/lib/printer-config-service";
import {
  getPrinterRoutingRules,
  savePrinterRoutingRules,
  type PrinterRoutingRule,
} from "@/lib/printer-routing";
import {
  getPrinterSettings,
  savePrinterSettings,
  type PrinterRecord,
} from "@/lib/printer-settings";

export type SharedPrintingConfigPayload = {
  printers: PrinterRecord[];
  featureFlags: PrintingFeatureFlags | null;
  routingRules: PrinterRoutingRule[];
  commandSettings: OrderCommandSettings | null;
  updatedAt?: string | null;
};

const PRINTING_CONFIG_API_ENDPOINT = "/api/printing-config";

function hasRealDepartmentPrinter(config: SharedPrintingConfigPayload) {
  return config.printers.some(
    (printer) =>
      printer.enabled &&
      printer.connectionMode === "real" &&
      printer.model === "ESC/POS" &&
      printer.role !== "fiscal"
  );
}

function hasSharedPrintingConfigData(config: SharedPrintingConfigPayload | null) {
  if (!config) {
    return false;
  }

  return (
    config.printers.length > 0 ||
    config.routingRules.length > 0 ||
    Boolean(config.featureFlags) ||
    Boolean(config.commandSettings)
  );
}

export function getLocalPrintingConfigSnapshot(): SharedPrintingConfigPayload {
  return {
    printers: getPrinterSettings(),
    featureFlags: getPrintingFeatureFlags(),
    routingRules: getPrinterRoutingRules(),
    commandSettings: getOrderCommandSettings(),
  };
}

export function applySharedPrintingConfigToLocal(config: SharedPrintingConfigPayload | null) {
  if (!config) {
    return;
  }

  if (Array.isArray(config.printers) && config.printers.length > 0) {
    savePrinterSettings(config.printers);
  }

  if (config.featureFlags) {
    savePrintingFeatureFlags(config.featureFlags);
  }

  if (Array.isArray(config.routingRules) && config.routingRules.length > 0) {
    savePrinterRoutingRules(config.routingRules);
  }

  if (config.commandSettings) {
    saveOrderCommandSettings(config.commandSettings);
  }
}

export async function fetchSharedPrintingConfig() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const response = await fetch(PRINTING_CONFIG_API_ENDPOINT, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-store",
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as SharedPrintingConfigPayload;
  } catch {
    return null;
  }
}

export async function pushSharedPrintingConfig(config?: SharedPrintingConfigPayload | null) {
  if (typeof window === "undefined") {
    return null;
  }

  const payload = config ?? getLocalPrintingConfigSnapshot();

  try {
    const response = await fetch(PRINTING_CONFIG_API_ENDPOINT, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      cache: "no-store",
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as SharedPrintingConfigPayload;
  } catch {
    return null;
  }
}

export async function syncSharedPrintingConfig() {
  const remoteConfig = await fetchSharedPrintingConfig();

  if (
    hasSharedPrintingConfigData(remoteConfig)
  ) {
    applySharedPrintingConfigToLocal(remoteConfig);
    return remoteConfig;
  }

  const localSnapshot = getLocalPrintingConfigSnapshot();

  if (!hasRealDepartmentPrinter(localSnapshot)) {
    return localSnapshot;
  }

  const persistedConfig = await pushSharedPrintingConfig(localSnapshot);

  if (persistedConfig) {
    applySharedPrintingConfigToLocal(persistedConfig);
    return persistedConfig;
  }

  return localSnapshot;
}
