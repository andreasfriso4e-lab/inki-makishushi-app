"use client";

import { getRestaurantConfig } from "@/lib/restaurant-config";
import { getRestaurantStorageKey } from "@/lib/restaurant-storage";
import { recordAuditEvent } from "@/services/audit-log-service";

export type ConfigurablePaymentMethodId =
  | "CONTANTI"
  | "CARTA"
  | "BANCOMAT"
  | "FIDELITY"
  | "ASSEGNO";

export type PaymentMethodSetting = {
  id: ConfigurablePaymentMethodId;
  label: string;
  enabled: boolean;
  sortOrder: number;
};

const PAYMENT_METHODS_STORAGE_KEY = getRestaurantStorageKey("pos-payment-method-settings");
const CATALOG_CONFIG_API_ENDPOINT = "/api/catalog-config";

function getDefaultPaymentMethodSettingsConfig(): PaymentMethodSetting[] {
  const configuredMethods = getRestaurantConfig().paymentMethods;

  if (configuredMethods && configuredMethods.length > 0) {
    return configuredMethods.map((method, index) => ({
      ...method,
      sortOrder: index,
    }));
  }

  return [
    { id: "CONTANTI", label: "Contanti", enabled: true, sortOrder: 0 },
    { id: "CARTA", label: "Carta", enabled: true, sortOrder: 1 },
    { id: "BANCOMAT", label: "Bancomat", enabled: true, sortOrder: 2 },
    { id: "FIDELITY", label: "Fidelity card", enabled: true, sortOrder: 3 },
    { id: "ASSEGNO", label: "Assegno", enabled: false, sortOrder: 4 },
  ];
}

function normalizeSettings(settings: PaymentMethodSetting[]) {
  const defaultPaymentMethodSettings = getDefaultPaymentMethodSettingsConfig();
  const defaultsById = new Map(defaultPaymentMethodSettings.map((method) => [method.id, method]));
  const nextSettings = settings
    .filter((method): method is PaymentMethodSetting => defaultsById.has(method.id))
    .map((method) => ({
      ...defaultsById.get(method.id)!,
      ...method,
    }));

  const existingIds = new Set(nextSettings.map((method) => method.id));
  const missingDefaults = defaultPaymentMethodSettings.filter((method) => !existingIds.has(method.id));

  return [...nextSettings, ...missingDefaults]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((method, index) => ({
      ...method,
      sortOrder: index,
    }));
}

export function getDefaultPaymentMethodSettings() {
  const defaultPaymentMethodSettings = getDefaultPaymentMethodSettingsConfig();
  return defaultPaymentMethodSettings.map((method) => ({ ...method }));
}

export function getPaymentMethodSettings() {
  if (typeof window === "undefined") {
    return getDefaultPaymentMethodSettings();
  }

  const rawValue = window.localStorage.getItem(PAYMENT_METHODS_STORAGE_KEY);

  if (!rawValue) {
    return getDefaultPaymentMethodSettings();
  }

  try {
    const parsedValue = JSON.parse(rawValue) as PaymentMethodSetting[];
    return normalizeSettings(Array.isArray(parsedValue) ? parsedValue : []);
  } catch {
    window.localStorage.removeItem(PAYMENT_METHODS_STORAGE_KEY);
    return getDefaultPaymentMethodSettings();
  }
}

export function savePaymentMethodSettings(settings: PaymentMethodSetting[]) {
  const previousSettings = getPaymentMethodSettings();
  const normalizedSettings = normalizeSettings(settings);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(PAYMENT_METHODS_STORAGE_KEY, JSON.stringify(normalizedSettings));
  }

  recordAuditEvent({
    eventType: "CONFIG_PAYMENT_METHOD_CHANGED",
    entityType: "payment-settings",
    entityId: "payment-method-settings",
    previousValue: previousSettings,
    nextValue: normalizedSettings,
    origin: "configuration",
  });

  return normalizedSettings;
}

export async function hydratePaymentMethodSettingsFromServer() {
  if (typeof window === "undefined") {
    return getPaymentMethodSettings();
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
      return getPaymentMethodSettings();
    }

    const payload = (await response.json()) as { paymentMethods?: PaymentMethodSetting[] };
    if (Array.isArray(payload.paymentMethods) && payload.paymentMethods.length > 0) {
      const normalizedSettings = normalizeSettings(payload.paymentMethods);
      window.localStorage.setItem(PAYMENT_METHODS_STORAGE_KEY, JSON.stringify(normalizedSettings));
      return normalizedSettings;
    }
  } catch {
    // fallback locale
  }

  return getPaymentMethodSettings();
}

export async function persistPaymentMethodSettingsToServer(settings: PaymentMethodSetting[]) {
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
      body: JSON.stringify({ paymentMethods: settings }),
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as { paymentMethods?: PaymentMethodSetting[]; updatedAt?: string };
  } catch {
    return null;
  }
}

export function getEnabledPaymentMethodSettings() {
  return getPaymentMethodSettings().filter((method) => method.enabled);
}
