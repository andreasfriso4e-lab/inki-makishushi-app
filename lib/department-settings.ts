"use client";

import { getRestaurantConfig } from "@/lib/restaurant-config";
import { getRestaurantStorageKey } from "@/lib/restaurant-storage";
import { recordAuditEvent } from "@/services/audit-log-service";

export type DepartmentRecord = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  description: string;
  created_at: string;
  updated_at: string;
};

export const DEPARTMENT_SETTINGS_STORAGE_KEY = getRestaurantStorageKey("pos-department-settings");
export const DEPARTMENT_SETTINGS_CHANGED_EVENT = "pos-department-settings-changed";
export const PRODUCTS_SETTINGS_STORAGE_KEY = getRestaurantStorageKey("pos-settings-products");
const CATALOG_CONFIG_API_ENDPOINT = "/api/catalog-config";

const LEGACY_DEPARTMENT_MAP: Record<string, string> = {
  BAR: "bar",
  CUCINA: "cucina",
  SERVIZI: "servizi",
  ALTRO: "altro",
};

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function slugifyDepartmentName(value: string) {
  return normalizeSearchValue(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createDepartment(id: string, name: string, description = ""): DepartmentRecord {
  const now = new Date().toISOString();

  return {
    id,
    name,
    slug: slugifyDepartmentName(name),
    is_active: true,
    description,
    created_at: now,
    updated_at: now,
  };
}

function getDefaultDepartmentSettingsConfig(): DepartmentRecord[] {
  const configuredDepartments = getRestaurantConfig().departments;

  if (configuredDepartments && configuredDepartments.length > 0) {
    return configuredDepartments.map((department) =>
      createDepartment(department.id, department.name, department.description)
    );
  }

  return [
    createDepartment("department-cucina", "Cucina"),
    createDepartment("department-bar", "Bar"),
    createDepartment("department-servizi", "Servizi"),
    createDepartment("department-altro", "Altro"),
  ];
}

function normalizeDepartmentSettings(settings: DepartmentRecord[]) {
  const defaultDepartmentSettings = getDefaultDepartmentSettingsConfig();
  const defaultsBySlug = new Map(defaultDepartmentSettings.map((department) => [department.slug, department]));
  const nextSettings = settings
    .filter(
      (department): department is DepartmentRecord =>
        Boolean(department) && typeof department.name === "string" && typeof department.slug === "string"
    )
    .map((department) => {
      const normalizedSlug = slugifyDepartmentName(department.slug || department.name);
      const defaultDepartment = defaultsBySlug.get(normalizedSlug);

      return {
        id: department.id || `department-${normalizedSlug || Date.now()}`,
        name: department.name.trim() || defaultDepartment?.name || department.slug,
        slug: normalizedSlug,
        is_active: department.is_active ?? true,
        description: department.description ?? "",
        created_at: department.created_at || defaultDepartment?.created_at || new Date().toISOString(),
        updated_at: department.updated_at || new Date().toISOString(),
      };
    })
    .filter((department, index, collection) => department.slug && collection.findIndex((entry) => entry.slug === department.slug) === index);

  const existingSlugs = new Set(nextSettings.map((department) => department.slug));
  const missingDefaults = defaultDepartmentSettings.filter((department) => !existingSlugs.has(department.slug));

  return [...nextSettings, ...missingDefaults].sort((left, right) => left.name.localeCompare(right.name, "it"));
}

export function getDefaultDepartmentSettings() {
  const defaultDepartmentSettings = getDefaultDepartmentSettingsConfig();
  return defaultDepartmentSettings.map((department) => ({ ...department }));
}

export function getDepartmentSettings() {
  if (typeof window === "undefined") {
    return getDefaultDepartmentSettings();
  }

  const rawValue = window.localStorage.getItem(DEPARTMENT_SETTINGS_STORAGE_KEY);

  if (!rawValue) {
    return getDefaultDepartmentSettings();
  }

  try {
    const parsedValue = JSON.parse(rawValue) as DepartmentRecord[];
    return normalizeDepartmentSettings(Array.isArray(parsedValue) ? parsedValue : []);
  } catch {
    window.localStorage.removeItem(DEPARTMENT_SETTINGS_STORAGE_KEY);
    return getDefaultDepartmentSettings();
  }
}

export function saveDepartmentSettings(settings: DepartmentRecord[]) {
  const previousSettings = getDepartmentSettings();
  const normalizedSettings = normalizeDepartmentSettings(settings).map((department) => ({
    ...department,
    updated_at: department.updated_at || new Date().toISOString(),
  }));

  if (typeof window !== "undefined") {
    window.localStorage.setItem(DEPARTMENT_SETTINGS_STORAGE_KEY, JSON.stringify(normalizedSettings));
    window.dispatchEvent(new CustomEvent(DEPARTMENT_SETTINGS_CHANGED_EVENT, { detail: normalizedSettings }));
  }

  recordAuditEvent({
    eventType: "CONFIG_DEPARTMENT_CHANGED",
    entityType: "department-settings",
    entityId: "department-settings",
    previousValue: previousSettings,
    nextValue: normalizedSettings,
    origin: "configuration",
  });

  return normalizedSettings;
}

export async function hydrateDepartmentSettingsFromServer() {
  if (typeof window === "undefined") {
    return getDepartmentSettings();
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
      return getDepartmentSettings();
    }

    const payload = (await response.json()) as { departments?: DepartmentRecord[] };

    if (Array.isArray(payload.departments) && payload.departments.length > 0) {
      const normalizedSettings = normalizeDepartmentSettings(payload.departments);
      window.localStorage.setItem(DEPARTMENT_SETTINGS_STORAGE_KEY, JSON.stringify(normalizedSettings));
      window.dispatchEvent(
        new CustomEvent(DEPARTMENT_SETTINGS_CHANGED_EVENT, {
          detail: normalizedSettings,
        })
      );
      return normalizedSettings;
    }
  } catch {
    // fallback locale
  }

  return getDepartmentSettings();
}

export async function persistDepartmentSettingsToServer(settings: DepartmentRecord[]) {
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
      body: JSON.stringify({ departments: settings }),
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as { departments?: DepartmentRecord[]; updatedAt?: string };
  } catch {
    return null;
  }
}

export function getActiveDepartmentSettings() {
  return getDepartmentSettings().filter((department) => department.is_active);
}

export function getDepartmentBySlug(slug?: string | null) {
  const normalizedSlug = normalizeDepartmentValue(slug);

  if (!normalizedSlug) {
    return null;
  }

  return getDepartmentSettings().find((department) => department.slug === normalizedSlug) ?? null;
}

export function normalizeDepartmentValue(value?: string | null, fallback = "altro") {
  if (!value) {
    return fallback;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return fallback;
  }

  const legacyMatch = LEGACY_DEPARTMENT_MAP[trimmedValue.toUpperCase()];

  if (legacyMatch) {
    return legacyMatch;
  }

  const slug = slugifyDepartmentName(trimmedValue);
  return slug || fallback;
}

export function getDepartmentDisplayName(slug?: string | null) {
  const normalizedSlug = normalizeDepartmentValue(slug, "");
  const department = normalizedSlug ? getDepartmentBySlug(normalizedSlug) : null;

  if (department) {
    return department.name;
  }

  if (!normalizedSlug) {
    return "Altro";
  }

  return normalizedSlug
    .split("-")
    .filter(Boolean)
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(" ");
}
