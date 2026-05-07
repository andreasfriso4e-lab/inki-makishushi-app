"use client";

import {
  normalizeDepartmentValue,
  PRODUCTS_SETTINGS_STORAGE_KEY,
} from "@/lib/department-settings";
import { getRestaurantConfig } from "@/lib/restaurant-config";
import { getRestaurantStorageKey } from "@/lib/restaurant-storage";
import type { Product, ProductCategory } from "@/lib/pos-data";
import type { PrinterRole } from "@/lib/printer-settings";

export type PrinterRoutingTargetRole = Exclude<PrinterRole, "fiscal">;
export type ProductionStation = "BAR" | "FREDDO" | "CALDO" | "GENERIC";
type ManagedProductReference = {
  id: string;
  department?: string;
  category?: ProductCategory;
};

export type PrinterRoutingRule = {
  category: ProductCategory;
  printerRole: PrinterRoutingTargetRole;
  updatedAt: string;
};

const PRINTER_ROUTING_STORAGE_KEY = getRestaurantStorageKey("pos-printer-routing-rules");

const barCategories: ProductCategory[] = [
  "Champagne",
  "Bollicine",
  "Cocktail",
  "Distillati",
  "Amari",
  "Sakè",
  "Vino",
  "Vino mescita",
  "Birre",
  "Aperitivo",
  "Caffetteria",
  "Bevande",
];

const kitchenCategories: ProductCategory[] = [
  "Bao",
  "Uramaki Deluxe",
  "Uramaki classici",
  "Hosomaki",
  "Gunkan",
  "Nigiri",
  "Futomaki",
  "Temaki",
  "Sashimi",
  "Crudità",
  "Inki box",
  "Chirashi",
  "Insalate",
  "Ramen and soup",
  "Riso",
  "Udon",
  "Hot",
  "Ravioli",
  "Tempura",
  "Poke",
  "Dessert",
];

const genericCategories: ProductCategory[] = ["Servizi"];

const coldKitchenCategories = new Set(
  [
    "Uramaki Deluxe",
    "Uramaki classici",
    "Hosomaki",
    "Gunkan",
    "Nigiri",
    "Futomaki",
    "Temaki",
    "Sashimi",
    "Crudità",
    "Inki box",
    "Chirashi",
    "Poke",
  ].map((value) => value.trim().toLowerCase())
);

const hotKitchenCategories = new Set(
  [
    "Bao",
    "Ramen and soup",
    "Riso",
    "Udon",
    "Hot",
    "Ravioli",
    "Tempura",
  ].map((value) => value.trim().toLowerCase())
);

const guestSplitCategories = new Set(
  [
    "Uramaki Deluxe",
    "Uramaki classici",
    "Hosomaki",
    "Gunkan",
    "Nigiri",
    "Futomaki",
    "Temaki",
    "Sashimi",
  ].map((value) => value.trim().toLowerCase())
);

function getNowIso() {
  return new Date().toISOString();
}

function normalizeCategoryName(category?: string | null) {
  return category?.trim().toLowerCase() ?? "";
}

function normalizeProductName(name?: string | null) {
  return name
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase() ?? "";
}

function createRule(category: ProductCategory, printerRole: PrinterRoutingTargetRole): PrinterRoutingRule {
  return {
    category,
    printerRole,
    updatedAt: getNowIso(),
  };
}

export function getDefaultPrinterRoutingRules() {
  const configuredRoles = getRestaurantConfig().categoryPrinterRoles;

  if (configuredRoles && Object.keys(configuredRoles).length > 0) {
    return Object.entries(configuredRoles).map(([category, printerRole]) =>
      createRule(category, printerRole)
    );
  }

  return [
    ...barCategories.map((category) => createRule(category, "bar")),
    ...kitchenCategories.map((category) => createRule(category, "kitchen")),
    ...genericCategories.map((category) => createRule(category, "generic")),
  ];
}

export function getPrinterRoutingRules() {
  if (typeof window === "undefined") {
    return getDefaultPrinterRoutingRules();
  }

  const rawValue = window.localStorage.getItem(PRINTER_ROUTING_STORAGE_KEY);

  if (!rawValue) {
    const defaults = getDefaultPrinterRoutingRules();
    window.localStorage.setItem(PRINTER_ROUTING_STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as PrinterRoutingRule[];
    const parsedRules = Array.isArray(parsedValue) ? parsedValue : [];
    const defaultsByCategory = new Map(
      getDefaultPrinterRoutingRules().map((rule) => [rule.category, rule])
    );

    const mergedRules = [
      ...parsedRules.filter(
        (rule): rule is PrinterRoutingRule => defaultsByCategory.has(rule.category)
      ),
      ...getDefaultPrinterRoutingRules().filter(
        (defaultRule) => !parsedRules.some((rule) => rule.category === defaultRule.category)
      ),
    ].map((rule) => ({
      ...defaultsByCategory.get(rule.category)!,
      ...rule,
      updatedAt: rule.updatedAt || getNowIso(),
    }));

    window.localStorage.setItem(PRINTER_ROUTING_STORAGE_KEY, JSON.stringify(mergedRules));
    return mergedRules;
  } catch {
    window.localStorage.removeItem(PRINTER_ROUTING_STORAGE_KEY);
    const defaults = getDefaultPrinterRoutingRules();
    window.localStorage.setItem(PRINTER_ROUTING_STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  }
}

export function savePrinterRoutingRules(rules: PrinterRoutingRule[]) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(PRINTER_ROUTING_STORAGE_KEY, JSON.stringify(rules));
  }

  return rules;
}

export function getPrinterRoleForCategory(category: ProductCategory) {
  return (
    getPrinterRoutingRules().find((rule) => rule.category === category)?.printerRole ?? "generic"
  );
}

function getProductionStationForResolvedProduct(product: Product | null, printerRole: PrinterRoutingTargetRole) {
  if (printerRole === "bar") {
    return "BAR" as ProductionStation;
  }

  if (!product) {
    return printerRole === "kitchen" ? ("CALDO" as ProductionStation) : ("GENERIC" as ProductionStation);
  }

  const normalizedCategory = normalizeCategoryName(product.category);
  const normalizedName = normalizeProductName(product.name);

  if (normalizedCategory === "insalate") {
    if (normalizedName.includes("wakame")) {
      return "FREDDO";
    }

    return "CALDO";
  }

  if (coldKitchenCategories.has(normalizedCategory)) {
    return "FREDDO";
  }

  if (hotKitchenCategories.has(normalizedCategory)) {
    return "CALDO";
  }

  if (normalizedName.includes("edamame") || normalizedName.includes("verdure spadellate")) {
    return "CALDO";
  }

  if (printerRole === "kitchen") {
    return "CALDO";
  }

  return "GENERIC";
}

export function getProductionStationForOrderItem(productId: string, products: Product[]) {
  const printerRole = getPrinterRoleForOrderItem(productId, products);
  const product = resolveProductForOrderItem(productId, products);
  return getProductionStationForResolvedProduct(product, printerRole);
}

export function shouldKeepGuestCodeForOrderItem(productId: string, products: Product[]) {
  const product = resolveProductForOrderItem(productId, products);

  if (!product) {
    return false;
  }

  return guestSplitCategories.has(normalizeCategoryName(product.category));
}

export function getPrinterRoleForProductionStation(station: ProductionStation) {
  if (station === "BAR") {
    return "bar" as PrinterRoutingTargetRole;
  }

  if (station === "FREDDO" || station === "CALDO") {
    return "kitchen" as PrinterRoutingTargetRole;
  }

  return "generic" as PrinterRoutingTargetRole;
}

function getDepartmentForCategory(category: ProductCategory) {
  const printerRole = getPrinterRoleForCategory(category);

  if (printerRole === "bar") {
    return "bar";
  }

  if (printerRole === "kitchen") {
    return "cucina";
  }

  return category === "Servizi" ? "servizi" : "altro";
}

function getStoredManagedProducts() {
  if (typeof window === "undefined") {
    return [] as ManagedProductReference[];
  }

  const rawValue = window.localStorage.getItem(PRODUCTS_SETTINGS_STORAGE_KEY);

  if (!rawValue) {
    return [] as ManagedProductReference[];
  }

  try {
    const parsedValue = JSON.parse(rawValue) as ManagedProductReference[];
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [] as ManagedProductReference[];
  }
}

function resolveManagedProductForOrderItem(productId: string) {
  const managedProducts = getStoredManagedProducts();

  return (
    managedProducts.find((product) => product.id === productId) ??
    managedProducts.find((product) => productId.startsWith(`${product.id}-`)) ??
    null
  );
}

export function getPrinterRoleForDepartment(departmentSlug?: string | null) {
  const normalizedDepartment = normalizeDepartmentValue(departmentSlug, "altro");

  if (normalizedDepartment === "bar") {
    return "bar" as PrinterRoutingTargetRole;
  }

  if (normalizedDepartment === "cucina") {
    return "kitchen" as PrinterRoutingTargetRole;
  }

  return "generic" as PrinterRoutingTargetRole;
}

export function getDepartmentForOrderItem(productId: string, products: Product[]) {
  const managedProduct = resolveManagedProductForOrderItem(productId);

  if (managedProduct?.department) {
    return normalizeDepartmentValue(managedProduct.department, "altro");
  }

  const product = resolveProductForOrderItem(productId, products);

  if (!product) {
    return "altro";
  }

  return getDepartmentForCategory(product.category);
}

export function resolveProductForOrderItem(
  productId: string,
  products: Product[]
) {
  return (
    products.find((product) => product.id === productId) ??
    products.find((product) => productId.startsWith(`${product.id}-`)) ??
    null
  );
}

export function getPrinterRoleForOrderItem(
  productId: string,
  products: Product[]
) {
  return getPrinterRoleForDepartment(getDepartmentForOrderItem(productId, products));
}

export function getPrinterRoutingSummary() {
  const rules = getPrinterRoutingRules();

  return {
    bar: rules.filter((rule) => rule.printerRole === "bar"),
    kitchen: rules.filter((rule) => rule.printerRole === "kitchen"),
    generic: rules.filter((rule) => rule.printerRole === "generic"),
  };
}
