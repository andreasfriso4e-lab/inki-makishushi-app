"use client";

import { getRestaurantStorageKey } from "@/lib/restaurant-storage";
import { recordAuditEvent } from "@/services/audit-log-service";

export type VatRateKind = "taxable" | "exempt" | "non_taxable" | "outside_scope";

export type VatRateConfig = {
  key: string;
  label: string;
  value: number | null;
  enabled: boolean;
  sortOrder: number;
  kind: VatRateKind;
};

export type VatRateSelectionOption = VatRateConfig & {
  historical?: boolean;
};

const VAT_RATES_STORAGE_KEY = getRestaurantStorageKey("pos-vat-rate-settings");
const CATALOG_CONFIG_API_ENDPOINT = "/api/catalog-config";

const defaultVatRateSettings: VatRateConfig[] = [
  { key: "iva_10", label: "IVA 10%", value: 10, enabled: true, sortOrder: 0, kind: "taxable" },
  { key: "iva_4", label: "IVA 4%", value: 4, enabled: false, sortOrder: 1, kind: "taxable" },
  { key: "iva_5", label: "IVA 5%", value: 5, enabled: false, sortOrder: 2, kind: "taxable" },
  { key: "iva_22", label: "IVA 22%", value: 22, enabled: false, sortOrder: 3, kind: "taxable" },
  { key: "iva_0", label: "IVA 0% / Esente", value: 0, enabled: false, sortOrder: 4, kind: "exempt" },
  {
    key: "non_imponibile",
    label: "Non imponibile",
    value: null,
    enabled: false,
    sortOrder: 5,
    kind: "non_taxable",
  },
  {
    key: "fuori_campo",
    label: "Fuori campo IVA",
    value: null,
    enabled: false,
    sortOrder: 6,
    kind: "outside_scope",
  },
];

function normalizeVatRateSettings(settings: VatRateConfig[]) {
  const defaultsByKey = new Map(defaultVatRateSettings.map((rate) => [rate.key, rate]));
  const nextSettings = settings
    .filter((rate): rate is VatRateConfig => defaultsByKey.has(rate.key))
    .map((rate) => ({
      ...defaultsByKey.get(rate.key)!,
      ...rate,
    }));

  const existingKeys = new Set(nextSettings.map((rate) => rate.key));
  const missingDefaults = defaultVatRateSettings.filter((rate) => !existingKeys.has(rate.key));

  return [...nextSettings, ...missingDefaults]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((rate, index) => ({
      ...rate,
      sortOrder: index,
    }));
}

export function getDefaultVatRateSettings() {
  return defaultVatRateSettings.map((rate) => ({ ...rate }));
}

export function getVatRateSettings() {
  if (typeof window === "undefined") {
    return getDefaultVatRateSettings();
  }

  const rawValue = window.localStorage.getItem(VAT_RATES_STORAGE_KEY);

  if (!rawValue) {
    return getDefaultVatRateSettings();
  }

  try {
    const parsedValue = JSON.parse(rawValue) as VatRateConfig[];
    return normalizeVatRateSettings(Array.isArray(parsedValue) ? parsedValue : []);
  } catch {
    window.localStorage.removeItem(VAT_RATES_STORAGE_KEY);
    return getDefaultVatRateSettings();
  }
}

export function saveVatRateSettings(settings: VatRateConfig[]) {
  const previousSettings = getVatRateSettings();
  const normalizedSettings = normalizeVatRateSettings(settings);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(VAT_RATES_STORAGE_KEY, JSON.stringify(normalizedSettings));
  }

  recordAuditEvent({
    eventType: "CONFIG_VAT_CHANGED",
    entityType: "vat-settings",
    entityId: "vat-rate-settings",
    previousValue: previousSettings,
    nextValue: normalizedSettings,
    origin: "configuration",
  });

  return normalizedSettings;
}

export async function hydrateVatRateSettingsFromServer() {
  if (typeof window === "undefined") {
    return getVatRateSettings();
  }

  try {
    const response = await fetch(CATALOG_CONFIG_API_ENDPOINT, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-store",
      },
    });

    if (!response.ok) {
      return getVatRateSettings();
    }

    const payload = (await response.json()) as { vatRates?: VatRateConfig[] };
    if (Array.isArray(payload.vatRates) && payload.vatRates.length > 0) {
      const normalizedSettings = normalizeVatRateSettings(payload.vatRates);
      window.localStorage.setItem(VAT_RATES_STORAGE_KEY, JSON.stringify(normalizedSettings));
      return normalizedSettings;
    }
  } catch {
    // fallback locale
  }

  return getVatRateSettings();
}

export async function persistVatRateSettingsToServer(settings: VatRateConfig[]) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const response = await fetch(CATALOG_CONFIG_API_ENDPOINT, {
      method: "PUT",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({ vatRates: settings }),
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as { vatRates?: VatRateConfig[]; updatedAt?: string };
  } catch {
    return null;
  }
}

export function getEnabledVatRateSettings() {
  return getVatRateSettings()
    .filter((rate) => rate.enabled)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

export function getVatRateByKey(rateKey?: string | null) {
  if (!rateKey) {
    return null;
  }

  return getVatRateSettings().find((rate) => rate.key === rateKey) ?? null;
}

export function getDefaultOperationalVatRate() {
  const enabledRates = getEnabledVatRateSettings();
  const standardTenRate = getVatRateSettings().find((rate) => rate.key === "iva_10");

  return enabledRates.find((rate) => rate.key === "iva_10") ?? enabledRates[0] ?? standardTenRate ?? getDefaultVatRateSettings()[0];
}

export function getVatRateSelectionOptions(currentRateKey?: string | null): VatRateSelectionOption[] {
  const allRates = getVatRateSettings();
  const enabledRates = allRates.filter((rate) => rate.enabled).sort((left, right) => left.sortOrder - right.sortOrder);

  if (!currentRateKey) {
    return enabledRates;
  }

  const currentRate = allRates.find((rate) => rate.key === currentRateKey);

  if (!currentRate || enabledRates.some((rate) => rate.key === currentRate.key)) {
    return enabledRates;
  }

  return [...enabledRates, { ...currentRate, historical: true }];
}

export function getVatRateDisplayLabel(rateKey?: string | null) {
  return getVatRateByKey(rateKey)?.label ?? "IVA 10%";
}
