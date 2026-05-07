"use client";

import { getRestaurantConfig } from "@/lib/restaurant-config";
import { getRestaurantStorageKey } from "@/lib/restaurant-storage";

export type ManagedCategoryRecord = {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  order: number;
};

export type ManagedProductRecord = {
  id: string;
  name: string;
  category: string;
  price: number;
  pricePending?: boolean;
  department: string;
  favorite: boolean;
  buttonLabel: string;
  soldByWeight: boolean;
  taraGrams: string;
  color: string;
  icon: string;
  receiptDescription: string;
  kitchenDescription: string;
  code: string;
  prebillDescription: string;
  barcode: string;
  hidden: boolean;
  channels: string[];
  vatRateKey: string;
};

export type CatalogConfigPayload = {
  categories: ManagedCategoryRecord[];
  products: ManagedProductRecord[];
  updatedAt?: string | null;
};

export const CATEGORIES_STORAGE_KEY = getRestaurantStorageKey("pos-settings-categories");
export const PRODUCTS_SETTINGS_STORAGE_KEY = getRestaurantStorageKey("pos-settings-products");
export const CATALOG_CONFIG_CHANGED_EVENT = "pos:catalog-config-changed";

const CATALOG_CONFIG_API_ENDPOINT = "/api/catalog-config";

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function slugifyCatalogValue(value: string) {
  return normalizeSearchValue(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getDefaultManagedCategories(): ManagedCategoryRecord[] {
  return (getRestaurantConfig().categories ?? []).map((category, index) => ({
    id: `category-${slugifyCatalogValue(category) || index}`,
    name: category,
    description: "",
    color: "#f7f9fb",
    icon: "",
    order: index + 1,
  }));
}

export function readStoredManagedCategories() {
  if (typeof window === "undefined") {
    return getDefaultManagedCategories();
  }

  const rawValue = window.localStorage.getItem(CATEGORIES_STORAGE_KEY);
  if (!rawValue) {
    return getDefaultManagedCategories();
  }

  try {
    const parsedValue = JSON.parse(rawValue) as ManagedCategoryRecord[];
    return Array.isArray(parsedValue) && parsedValue.length > 0
      ? parsedValue
      : getDefaultManagedCategories();
  } catch {
    window.localStorage.removeItem(CATEGORIES_STORAGE_KEY);
    return getDefaultManagedCategories();
  }
}

export function saveManagedCategories(categories: ManagedCategoryRecord[]) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
    window.dispatchEvent(
      new CustomEvent(CATALOG_CONFIG_CHANGED_EVENT, {
        detail: { categories },
      })
    );
  }

  return categories;
}

export function readStoredManagedProducts<TFallback extends ManagedProductRecord>(
  fallbackProducts: TFallback[]
) {
  if (typeof window === "undefined") {
    return fallbackProducts;
  }

  const rawValue = window.localStorage.getItem(PRODUCTS_SETTINGS_STORAGE_KEY);
  if (!rawValue) {
    return fallbackProducts;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as ManagedProductRecord[];
    return Array.isArray(parsedValue) && parsedValue.length > 0
      ? (parsedValue as TFallback[])
      : fallbackProducts;
  } catch {
    window.localStorage.removeItem(PRODUCTS_SETTINGS_STORAGE_KEY);
    return fallbackProducts;
  }
}

export function saveManagedProducts(products: ManagedProductRecord[]) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(PRODUCTS_SETTINGS_STORAGE_KEY, JSON.stringify(products));
    window.dispatchEvent(
      new CustomEvent(CATALOG_CONFIG_CHANGED_EVENT, {
        detail: { products },
      })
    );
  }

  return products;
}

export async function fetchCatalogConfigFromServer() {
  if (typeof window === "undefined") {
    return null;
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
      return null;
    }

    return (await response.json()) as CatalogConfigPayload;
  } catch {
    return null;
  }
}

export async function hydrateCatalogConfigFromServer() {
  const remoteState = await fetchCatalogConfigFromServer();

  if (!remoteState) {
    return {
      categories: readStoredManagedCategories(),
      products: readStoredManagedProducts([] as ManagedProductRecord[]),
    };
  }

  const nextCategories =
    Array.isArray(remoteState.categories) && remoteState.categories.length > 0
      ? remoteState.categories
      : readStoredManagedCategories();
  const nextProducts =
    Array.isArray(remoteState.products) && remoteState.products.length > 0
      ? remoteState.products
      : readStoredManagedProducts([] as ManagedProductRecord[]);

  saveManagedCategories(nextCategories);
  saveManagedProducts(nextProducts);

  return {
    categories: nextCategories,
    products: nextProducts,
  };
}

export async function persistCatalogConfigToServer(payload: {
  categories?: ManagedCategoryRecord[];
  products?: ManagedProductRecord[];
}) {
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
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as CatalogConfigPayload;
  } catch {
    return null;
  }
}
