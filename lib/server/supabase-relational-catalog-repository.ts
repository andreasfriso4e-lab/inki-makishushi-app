import { getRestaurantConfig } from "@/lib/restaurant-config";
import {
  createSupabaseRows,
  deleteSupabaseRows,
  isSupabaseConfigured,
  readSupabaseRows,
  updateSupabaseRows,
} from "@/lib/server/supabase-json-store";
import { getActiveRestaurantId } from "@/lib/restaurant-config";

export type RelationalDepartmentRecord = {
  id: string;
  code: string | null;
  name: string;
  production_station: string | null;
  printer_role: string | null;
  sort_order: number;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  legacy_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type RelationalCategoryRecord = {
  id: string;
  department_id: string | null;
  code: string | null;
  name: string;
  production_station: string | null;
  printer_role: string | null;
  sort_order: number;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  legacy_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type RelationalProductRecord = {
  id: string;
  category_id: string | null;
  department_id: string | null;
  vat_rate_id: string | null;
  legacy_product_id: string | null;
  sku: string | null;
  plu_code: string | null;
  name: string;
  short_name: string | null;
  description: string | null;
  price: number | string;
  production_station: string | null;
  printer_role: string | null;
  track_guest_assignment: boolean;
  is_favorite: boolean;
  is_visible: boolean;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  legacy_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type RelationalPaymentMethodRecord = {
  id: string;
  code: string;
  name: string;
  payment_type: string | null;
  requires_change: boolean;
  supports_split: boolean;
  is_default: boolean;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  legacy_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type RelationalVatRateRecord = {
  id: string;
  code: string | null;
  label: string;
  rate: number | string;
  kind: string;
  is_default: boolean;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  legacy_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type CatalogDepartmentRecord = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  description: string;
  created_at: string;
  updated_at: string;
};

export type CatalogCategoryRecord = {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  order: number;
};

export type CatalogProductRecord = {
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

export type CatalogPaymentMethodRecord = {
  id: "CONTANTI" | "CARTA" | "BANCOMAT" | "FIDELITY" | "ASSEGNO";
  label: string;
  enabled: boolean;
  sortOrder: number;
};

export type CatalogVatRateRecord = {
  key: string;
  label: string;
  value: number | null;
  enabled: boolean;
  sortOrder: number;
  kind: "taxable" | "exempt" | "non_taxable" | "outside_scope";
};

export type RelationalCatalogState = {
  departments: CatalogDepartmentRecord[];
  categories: CatalogCategoryRecord[];
  products: CatalogProductRecord[];
  paymentMethods: CatalogPaymentMethodRecord[];
  vatRates: CatalogVatRateRecord[];
  updatedAt: string;
};

function getRestaurantIdFilter() {
  return {
    column: "restaurant_id",
    value: getActiveRestaurantId(),
  } as const;
}

function nowIso() {
  return new Date().toISOString();
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getDefaultPrinterRoleForCategory(category: string) {
  const configuredRole = getRestaurantConfig().categoryPrinterRoles?.[category];
  return configuredRole ?? null;
}

function getDefaultProductionStationForPrinterRole(role: string | null) {
  if (role === "bar") {
    return "BAR";
  }

  if (role === "kitchen") {
    return "CALDO";
  }

  return "GENERIC";
}

function getDefaultCatalogPaymentMethods(): CatalogPaymentMethodRecord[] {
  const configuredMethods = getRestaurantConfig().paymentMethods;

  if (configuredMethods && configuredMethods.length > 0) {
    return configuredMethods.map((method, index) => ({
      id: method.id,
      label: method.label,
      enabled: method.enabled,
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

function getDefaultCatalogVatRates(): CatalogVatRateRecord[] {
  return [
    { key: "iva_10", label: "IVA 10%", value: 10, enabled: true, sortOrder: 0, kind: "taxable" },
    { key: "iva_4", label: "IVA 4%", value: 4, enabled: false, sortOrder: 1, kind: "taxable" },
    { key: "iva_5", label: "IVA 5%", value: 5, enabled: false, sortOrder: 2, kind: "taxable" },
    { key: "iva_22", label: "IVA 22%", value: 22, enabled: false, sortOrder: 3, kind: "taxable" },
    { key: "iva_0", label: "IVA 0% / Esente", value: 0, enabled: false, sortOrder: 4, kind: "exempt" },
    { key: "non_imponibile", label: "Non imponibile", value: null, enabled: false, sortOrder: 5, kind: "non_taxable" },
    { key: "fuori_campo", label: "Fuori campo IVA", value: null, enabled: false, sortOrder: 6, kind: "outside_scope" },
  ];
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function mapDepartmentRow(row: RelationalDepartmentRecord): CatalogDepartmentRecord {
  const payload = row.legacy_payload ?? {};
  const slug = row.code?.trim() || String(payload.slug ?? slugify(row.name));

  return {
    id: String(payload.id ?? row.id),
    name: String(payload.name ?? row.name),
    slug,
    is_active: Boolean(payload.is_active ?? row.is_active),
    description: String(payload.description ?? ""),
    created_at: String(payload.created_at ?? row.created_at),
    updated_at: String(payload.updated_at ?? row.updated_at),
  };
}

function mapCategoryRow(row: RelationalCategoryRecord): CatalogCategoryRecord {
  const payload = row.legacy_payload ?? {};

  return {
    id: String(payload.id ?? row.id),
    name: String(payload.name ?? row.name),
    description: String(payload.description ?? ""),
    color: String(payload.color ?? "#f7f9fb"),
    icon: String(payload.icon ?? ""),
    order:
      typeof payload.order === "number"
        ? payload.order
        : row.sort_order,
  };
}

function mapProductRow(row: RelationalProductRecord): CatalogProductRecord {
  const payload = row.legacy_payload ?? {};
  return {
    id: String(payload.id ?? row.legacy_product_id ?? row.id),
    name: String(payload.name ?? row.name),
    category: String(payload.category ?? row.metadata?.category_name ?? ""),
    price: typeof payload.price === "number" ? payload.price : toNumber(row.price),
    pricePending: Boolean(payload.pricePending ?? false),
    department: String(payload.department ?? row.metadata?.department_slug ?? "altro"),
    favorite: Boolean(payload.favorite ?? row.is_favorite),
    buttonLabel: String(payload.buttonLabel ?? payload.name ?? row.name),
    soldByWeight: Boolean(payload.soldByWeight ?? false),
    taraGrams: String(payload.taraGrams ?? ""),
    color: String(payload.color ?? "#f7f9fb"),
    icon: String(payload.icon ?? ""),
    receiptDescription: String(payload.receiptDescription ?? row.name),
    kitchenDescription: String(payload.kitchenDescription ?? ""),
    code: String(payload.code ?? row.sku ?? ""),
    prebillDescription: String(payload.prebillDescription ?? row.name),
    barcode: String(payload.barcode ?? row.plu_code ?? ""),
    hidden: Boolean(payload.hidden ?? !row.is_visible),
    channels: Array.isArray(payload.channels) ? payload.channels.map(String) : ["Inki Makisushi app"],
    vatRateKey: String(payload.vatRateKey ?? row.metadata?.vat_rate_key ?? "iva_10"),
  };
}

function mapPaymentMethodRow(row: RelationalPaymentMethodRecord): CatalogPaymentMethodRecord {
  const payload = row.legacy_payload ?? {};
  return {
    id: String(payload.id ?? row.code) as CatalogPaymentMethodRecord["id"],
    label: String(payload.label ?? row.name),
    enabled: Boolean(payload.enabled ?? row.is_active),
    sortOrder:
      typeof payload.sortOrder === "number"
        ? payload.sortOrder
        : Number(row.metadata?.sortOrder ?? 0),
  };
}

function mapVatRateRow(row: RelationalVatRateRecord): CatalogVatRateRecord {
  const payload = row.legacy_payload ?? {};
  return {
    key: String(payload.key ?? row.code ?? row.id),
    label: String(payload.label ?? row.label),
    value:
      typeof payload.value === "number"
        ? payload.value
        : row.rate === null
          ? null
          : toNumber(row.rate),
    enabled: Boolean(payload.enabled ?? row.is_active),
    sortOrder:
      typeof payload.sortOrder === "number"
        ? payload.sortOrder
        : Number(row.metadata?.sortOrder ?? 0),
    kind: String(payload.kind ?? row.kind) as CatalogVatRateRecord["kind"],
  };
}

async function syncByKey<TRow extends { id: string }>(
  tableName: string,
  existingRows: TRow[],
  nextRows: Array<Record<string, unknown>>,
  getExistingKey: (row: TRow) => string,
  getNextKey: (row: Record<string, unknown>) => string
) {
  const existingByKey = new Map(existingRows.map((row) => [getExistingKey(row), row]));
  const nextKeys = new Set<string>();

  for (const nextRow of nextRows) {
    const key = getNextKey(nextRow);
    if (!key) continue;
    nextKeys.add(key);
    const existing = existingByKey.get(key);
    if (existing) {
      await updateSupabaseRows<Record<string, unknown>>(tableName, nextRow, [
        { column: "restaurant_id", value: getActiveRestaurantId() },
        { column: "id", value: existing.id },
      ]);
    } else {
      await createSupabaseRows<Record<string, unknown>>(tableName, [nextRow]);
    }
  }

  const idsToDelete = existingRows
    .filter((row) => {
      const key = getExistingKey(row);
      return key && !nextKeys.has(key);
    })
    .map((row) => row.id);

  if (idsToDelete.length > 0) {
    await deleteSupabaseRows(tableName, [
      { column: "restaurant_id", value: getActiveRestaurantId() },
      { column: "id", operator: "in", value: idsToDelete },
    ]);
  }
}

export async function readRelationalCatalogState(): Promise<RelationalCatalogState | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const [departments, categories, products, paymentMethods, vatRates] = await Promise.all([
    readSupabaseRows<RelationalDepartmentRecord>("departments", { filters: [getRestaurantIdFilter()], orderBy: "sort_order" }),
    readSupabaseRows<RelationalCategoryRecord>("categories", { filters: [getRestaurantIdFilter()], orderBy: "sort_order" }),
    readSupabaseRows<RelationalProductRecord>("products", { filters: [getRestaurantIdFilter()], orderBy: "name" }),
    readSupabaseRows<RelationalPaymentMethodRecord>("payment_methods", { filters: [getRestaurantIdFilter()], orderBy: "name" }),
    readSupabaseRows<RelationalVatRateRecord>("vat_rates", { filters: [getRestaurantIdFilter()], orderBy: "label" }),
  ]);

  if (
    !departments &&
    !categories &&
    !products &&
    !paymentMethods &&
    !vatRates
  ) {
    return null;
  }

  const latestUpdatedAt = [departments ?? [], categories ?? [], products ?? [], paymentMethods ?? [], vatRates ?? []]
    .flat()
    .map((row) => row.updated_at)
    .sort()
    .at(-1) ?? nowIso();

  return {
    departments: (departments ?? []).map(mapDepartmentRow),
    categories: (categories ?? []).map(mapCategoryRow).sort((left, right) => left.order - right.order),
    products: (products ?? []).map(mapProductRow),
    paymentMethods: (paymentMethods ?? [])
      .map(mapPaymentMethodRow)
      .sort((left, right) => left.sortOrder - right.sortOrder),
    vatRates: (vatRates ?? []).map(mapVatRateRow).sort((left, right) => left.sortOrder - right.sortOrder),
    updatedAt: latestUpdatedAt,
  };
}

export async function writeRelationalCatalogState(input: {
  departments: CatalogDepartmentRecord[];
  categories: CatalogCategoryRecord[];
  products: CatalogProductRecord[];
  paymentMethods: CatalogPaymentMethodRecord[];
  vatRates: CatalogVatRateRecord[];
}) {
  if (!isSupabaseConfigured()) {
    return;
  }

  const [existingDepartments, existingCategories, existingProducts, existingPaymentMethods, existingVatRates] =
    await Promise.all([
      readSupabaseRows<RelationalDepartmentRecord>("departments", { filters: [getRestaurantIdFilter()] }),
      readSupabaseRows<RelationalCategoryRecord>("categories", { filters: [getRestaurantIdFilter()] }),
      readSupabaseRows<RelationalProductRecord>("products", { filters: [getRestaurantIdFilter()] }),
      readSupabaseRows<RelationalPaymentMethodRecord>("payment_methods", { filters: [getRestaurantIdFilter()] }),
      readSupabaseRows<RelationalVatRateRecord>("vat_rates", { filters: [getRestaurantIdFilter()] }),
    ]);

  const departmentRows = input.departments.map((department, index) => ({
    restaurant_id: getActiveRestaurantId(),
    code: department.slug,
    name: department.name,
    production_station: getDefaultProductionStationForPrinterRole(null),
    printer_role: null,
    sort_order: index,
    is_active: department.is_active,
    metadata: { description: department.description },
    legacy_payload: department,
    created_at: department.created_at || nowIso(),
    updated_at: department.updated_at || nowIso(),
  }));

  await syncByKey(
    "departments",
    existingDepartments ?? [],
    departmentRows,
    (row) => row.code ?? row.name,
    (row) => String(row.code ?? "")
  );

  const refreshedDepartments =
    (await readSupabaseRows<RelationalDepartmentRecord>("departments", {
      filters: [getRestaurantIdFilter()],
    })) ?? [];
  const departmentIdBySlug = new Map(
    refreshedDepartments.map((row) => [row.code ?? slugify(row.name), row.id])
  );

  const categoryRows = input.categories.map((category) => {
    const printerRole = getDefaultPrinterRoleForCategory(category.name);
    return {
      restaurant_id: getActiveRestaurantId(),
      department_id: null,
      code: slugify(category.name),
      name: category.name,
      production_station: getDefaultProductionStationForPrinterRole(printerRole),
      printer_role: printerRole,
      sort_order: category.order,
      is_active: true,
      metadata: {
        description: category.description,
        color: category.color,
        icon: category.icon,
      },
      legacy_payload: category,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
  });

  await syncByKey(
    "categories",
    existingCategories ?? [],
    categoryRows,
    (row) => row.code ?? slugify(row.name),
    (row) => String(row.code ?? "")
  );

  const refreshedCategories =
    (await readSupabaseRows<RelationalCategoryRecord>("categories", {
      filters: [getRestaurantIdFilter()],
    })) ?? [];
  const categoryIdBySlug = new Map(
    refreshedCategories.map((row) => [row.code ?? slugify(row.name), row.id])
  );

  const vatRateRows = input.vatRates.map((rate, index) => ({
    restaurant_id: getActiveRestaurantId(),
    code: rate.key,
    label: rate.label,
    rate: rate.value ?? 0,
    kind: rate.kind,
    is_default: index === 0 || rate.key === "iva_10",
    is_active: rate.enabled,
    metadata: { sortOrder: rate.sortOrder, originalValue: rate.value },
    legacy_payload: rate,
    created_at: nowIso(),
    updated_at: nowIso(),
  }));

  await syncByKey(
    "vat_rates",
    existingVatRates ?? [],
    vatRateRows,
    (row) => row.code ?? row.label,
    (row) => String(row.code ?? "")
  );

  const refreshedVatRates =
    (await readSupabaseRows<RelationalVatRateRecord>("vat_rates", {
      filters: [getRestaurantIdFilter()],
    })) ?? [];
  const vatRateIdByKey = new Map(
    refreshedVatRates.map((row) => [row.code ?? "", row.id])
  );

  const productRows = input.products.map((product) => ({
    restaurant_id: getActiveRestaurantId(),
    category_id: categoryIdBySlug.get(slugify(product.category)) ?? null,
    department_id: departmentIdBySlug.get(product.department) ?? null,
    vat_rate_id: vatRateIdByKey.get(product.vatRateKey) ?? null,
    legacy_product_id: product.id,
    sku: product.code || null,
    plu_code: product.barcode || null,
    name: product.name,
    short_name: product.buttonLabel || null,
    description: product.receiptDescription || null,
    price: product.price,
    production_station: getDefaultProductionStationForPrinterRole(
      getDefaultPrinterRoleForCategory(product.category)
    ),
    printer_role: getDefaultPrinterRoleForCategory(product.category),
    track_guest_assignment: false,
    is_favorite: product.favorite,
    is_visible: !product.hidden,
    is_active: !product.hidden,
    metadata: {
      category_name: product.category,
      department_slug: product.department,
      vat_rate_key: product.vatRateKey,
      buttonLabel: product.buttonLabel,
      kitchenDescription: product.kitchenDescription,
      prebillDescription: product.prebillDescription,
      channels: product.channels,
      color: product.color,
      icon: product.icon,
      soldByWeight: product.soldByWeight,
      taraGrams: product.taraGrams,
      pricePending: product.pricePending ?? false,
    },
    legacy_payload: product,
    created_at: nowIso(),
    updated_at: nowIso(),
  }));

  await syncByKey(
    "products",
    existingProducts ?? [],
    productRows,
    (row) => row.legacy_product_id ?? row.name,
    (row) => String(row.legacy_product_id ?? "")
  );

  const paymentMethodRows = input.paymentMethods.map((method) => ({
    restaurant_id: getActiveRestaurantId(),
    code: method.id,
    name: method.label,
    payment_type: method.id,
    requires_change: method.id === "CONTANTI",
    supports_split: true,
    is_default: method.sortOrder === 0 || method.id === "CONTANTI",
    is_active: method.enabled,
    metadata: { sortOrder: method.sortOrder },
    legacy_payload: method,
    created_at: nowIso(),
    updated_at: nowIso(),
  }));

  await syncByKey(
    "payment_methods",
    existingPaymentMethods ?? [],
    paymentMethodRows,
    (row) => row.code,
    (row) => String(row.code ?? "")
  );
}
