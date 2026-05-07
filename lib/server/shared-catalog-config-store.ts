import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Product } from "@/lib/pos-data";
import { getProductCategories, getProducts } from "@/lib/pos-data";
import {
  isSupabaseConfigured,
  readSupabaseJsonState,
  writeSupabaseJsonState,
} from "@/lib/server/supabase-json-store";
import {
  readRelationalCatalogState,
  writeRelationalCatalogState,
  type CatalogCategoryRecord,
  type CatalogDepartmentRecord,
  type CatalogPaymentMethodRecord,
  type CatalogProductRecord,
  type CatalogVatRateRecord,
} from "@/lib/server/supabase-relational-catalog-repository";
import {
  allowsFallbackRead,
  prefersSupabaseRead,
} from "@/lib/server/supabase-read-mode";

export type SharedCatalogConfigState = {
  departments: CatalogDepartmentRecord[];
  categories: CatalogCategoryRecord[];
  products: CatalogProductRecord[];
  paymentMethods: CatalogPaymentMethodRecord[];
  vatRates: CatalogVatRateRecord[];
  updatedAt: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const CATALOG_CONFIG_FILE = path.join(DATA_DIR, "shared-catalog-config.json");
const SUPABASE_CATALOG_TABLE = "pos_catalog_state";

function nowIso() {
  return new Date().toISOString();
}

function createManagedProduct(product: Product): CatalogProductRecord {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    price: product.price,
    pricePending: product.pricePending ?? false,
    department: "altro",
    favorite: false,
    buttonLabel: product.name,
    soldByWeight: false,
    taraGrams: "",
    color: "#f7f9fb",
    icon: "",
    receiptDescription: product.name,
    kitchenDescription: "",
    code: "",
    prebillDescription: product.name,
    barcode: "",
    hidden: false,
    channels: ["Inki Makisushi app", "Inki Makisushi comande"],
    vatRateKey: product.vatRateKey ?? "iva_10",
  };
}

function buildDefaultState(): SharedCatalogConfigState {
  const updatedAt = nowIso();
  return {
    departments: [],
    categories: getProductCategories().map((category, index) => ({
      id: `category-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-") || index}`,
      name: category,
      description: "",
      color: "#f7f9fb",
      icon: "",
      order: index + 1,
    })),
    products: getProducts().map(createManagedProduct),
    paymentMethods: [
      { id: "CONTANTI", label: "Contanti", enabled: true, sortOrder: 0 },
      { id: "CARTA", label: "Carta", enabled: true, sortOrder: 1 },
      { id: "BANCOMAT", label: "Bancomat", enabled: true, sortOrder: 2 },
      { id: "FIDELITY", label: "Fidelity card", enabled: true, sortOrder: 3 },
      { id: "ASSEGNO", label: "Assegno", enabled: false, sortOrder: 4 },
    ],
    vatRates: [
      { key: "iva_10", label: "IVA 10%", value: 10, enabled: true, sortOrder: 0, kind: "taxable" },
      { key: "iva_4", label: "IVA 4%", value: 4, enabled: false, sortOrder: 1, kind: "taxable" },
      { key: "iva_5", label: "IVA 5%", value: 5, enabled: false, sortOrder: 2, kind: "taxable" },
      { key: "iva_22", label: "IVA 22%", value: 22, enabled: false, sortOrder: 3, kind: "taxable" },
      { key: "iva_0", label: "IVA 0% / Esente", value: 0, enabled: false, sortOrder: 4, kind: "exempt" },
      { key: "non_imponibile", label: "Non imponibile", value: null, enabled: false, sortOrder: 5, kind: "non_taxable" },
      { key: "fuori_campo", label: "Fuori campo IVA", value: null, enabled: false, sortOrder: 6, kind: "outside_scope" },
    ],
    updatedAt,
  };
}

function cloneState(state: SharedCatalogConfigState): SharedCatalogConfigState {
  return JSON.parse(JSON.stringify(state)) as SharedCatalogConfigState;
}

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

export async function readFallbackSharedCatalogConfigState(): Promise<SharedCatalogConfigState | null> {
  await ensureDataDir();

  try {
    const rawValue = await readFile(CATALOG_CONFIG_FILE, "utf8");
    const parsedValue = JSON.parse(rawValue) as Partial<SharedCatalogConfigState>;
    return cloneState({
      ...buildDefaultState(),
      ...parsedValue,
      updatedAt:
        typeof parsedValue.updatedAt === "string" && parsedValue.updatedAt.length > 0
          ? parsedValue.updatedAt
          : nowIso(),
    });
  } catch {
    return cloneState(buildDefaultState());
  }
}

export async function readSharedCatalogConfigState(): Promise<SharedCatalogConfigState> {
  if (
    isSupabaseConfigured() &&
    (prefersSupabaseRead("departments") ||
      prefersSupabaseRead("categories") ||
      prefersSupabaseRead("products") ||
      prefersSupabaseRead("payment-methods") ||
      prefersSupabaseRead("vat-rates"))
  ) {
    try {
      const relationalState = await readRelationalCatalogState();
      const blobState = await readSupabaseJsonState<SharedCatalogConfigState>(SUPABASE_CATALOG_TABLE);
      const blobPayload = blobState?.payload;

      if (
        relationalState &&
        (relationalState.products.length > 0 ||
          relationalState.categories.length > 0 ||
          relationalState.departments.length > 0 ||
          relationalState.paymentMethods.length > 0 ||
          relationalState.vatRates.length > 0)
      ) {
        const defaultState = buildDefaultState();
        console.info("[shared-catalog-config-store] read source=supabase");
        return cloneState({
          departments:
            relationalState.departments.length > 0
              ? relationalState.departments
              : blobPayload?.departments ?? defaultState.departments,
          categories:
            relationalState.categories.length > 0
              ? relationalState.categories
              : blobPayload?.categories ?? defaultState.categories,
          products:
            relationalState.products.length > 0
              ? relationalState.products
              : blobPayload?.products ?? defaultState.products,
          paymentMethods:
            relationalState.paymentMethods.length > 0
              ? relationalState.paymentMethods
              : blobPayload?.paymentMethods ?? defaultState.paymentMethods,
          vatRates:
            relationalState.vatRates.length > 0
              ? relationalState.vatRates
              : blobPayload?.vatRates ?? defaultState.vatRates,
          updatedAt: blobState?.updatedAt ?? relationalState.updatedAt,
        });
      }

      if (blobState?.payload) {
        console.info("[shared-catalog-config-store] read source=fallback-blob");
        return cloneState({
          ...buildDefaultState(),
          ...blobState.payload,
          updatedAt: blobState.updatedAt,
        });
      }
    } catch {
      // fallback locale
    }
  }

  if (
    !allowsFallbackRead("departments") ||
    !allowsFallbackRead("categories") ||
    !allowsFallbackRead("products") ||
    !allowsFallbackRead("payment-methods") ||
    !allowsFallbackRead("vat-rates")
  ) {
    console.info("[shared-catalog-config-store] read source=default");
    return buildDefaultState();
  }

  const fallbackState = await readFallbackSharedCatalogConfigState();
  if (fallbackState) {
    console.info("[shared-catalog-config-store] read source=fallback-file");
    return fallbackState;
  }

  const initialState = buildDefaultState();
  await writeSharedCatalogConfigState(initialState);
  console.info("[shared-catalog-config-store] read source=default");
  return initialState;
}

export async function writeSharedCatalogConfigState(
  nextState: SharedCatalogConfigState
): Promise<SharedCatalogConfigState> {
  let resolvedState: SharedCatalogConfigState | null = null;

  if (isSupabaseConfigured()) {
    try {
      const blobState = await writeSupabaseJsonState(SUPABASE_CATALOG_TABLE, nextState);
      if (blobState?.payload) {
        resolvedState = cloneState({
          ...blobState.payload,
          updatedAt: blobState.updatedAt,
        });
      }
    } catch (error) {
      console.error("[shared-catalog-config-store] Blob Supabase write failed", error);
    }
  }

  if (!resolvedState) {
    await ensureDataDir();
    resolvedState = cloneState({
      ...nextState,
      updatedAt: nextState.updatedAt || nowIso(),
    });
    await writeFile(CATALOG_CONFIG_FILE, JSON.stringify(resolvedState, null, 2), "utf8");
  }

  if (isSupabaseConfigured()) {
    try {
      await writeRelationalCatalogState({
        departments: resolvedState.departments,
        categories: resolvedState.categories,
        products: resolvedState.products,
        paymentMethods: resolvedState.paymentMethods,
        vatRates: resolvedState.vatRates,
      });
    } catch (error) {
      console.error("[shared-catalog-config-store] Relational Supabase write failed", error);
    }
  }

  return resolvedState;
}
