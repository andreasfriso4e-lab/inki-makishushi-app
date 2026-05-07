import { getDefaultHomeAreas } from "@/lib/home-settings";
import type { CompanyRecord, CustomerRecord, PosTableState } from "@/lib/pos-data";
import type { PosOperatorRecord } from "@/types/operator";
import {
  readFallbackSharedBusinessDirectoryState,
} from "@/lib/server/shared-business-directory-store";
import {
  readFallbackSharedCatalogConfigState,
  readSharedCatalogConfigState,
} from "@/lib/server/shared-catalog-config-store";
import {
  readFallbackSharedHomeAreasState,
} from "@/lib/server/shared-home-areas-store";
import {
  readFallbackSharedOperatorRolesState,
  readSharedOperatorRolesState,
} from "@/lib/server/shared-operator-roles-store";
import {
  readFallbackSharedTablesState,
} from "@/lib/server/shared-tables-store";
import {
  writeRelationalBusinessDirectoryState,
  writeRelationalOperatorRolesState,
  writeRelationalRoomsState,
  writeRelationalTablesState,
} from "@/lib/server/supabase-relational-read-repository";
import {
  writeRelationalCatalogState,
  type CatalogCategoryRecord,
  type CatalogDepartmentRecord,
  type CatalogPaymentMethodRecord,
  type CatalogProductRecord,
  type CatalogVatRateRecord,
} from "@/lib/server/supabase-relational-catalog-repository";

export type StableDomainsSeedReport = {
  roomsImported: number;
  tablesImported: number;
  operatorRolesImported: number;
  operatorsImported: number;
  companiesImported: number;
  customersImported: number;
  departmentsImported: number;
  categoriesImported: number;
  productsImported: number;
  paymentMethodsImported: number;
  vatRatesImported: number;
  errors: string[];
  skipped: string[];
};

function emptyReport(): StableDomainsSeedReport {
  return {
    roomsImported: 0,
    tablesImported: 0,
    operatorRolesImported: 0,
    operatorsImported: 0,
    companiesImported: 0,
    customersImported: 0,
    departmentsImported: 0,
    categoriesImported: 0,
    productsImported: 0,
    paymentMethodsImported: 0,
    vatRatesImported: 0,
    errors: [],
    skipped: [],
  };
}

function splitOperatorRecords(records: PosOperatorRecord[]) {
  return {
    roles: records.filter((record) => record.roleType === "admin" || record.roleType === "operator"),
    operators: records,
  };
}

function normalizeTextKey(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function buildCompanyDedupKey(company: CompanyRecord) {
  return [
    normalizeTextKey(company.vatNumber),
    normalizeTextKey(company.taxCode),
    normalizeTextKey(company.name),
  ].join("|");
}

function dedupeCompanies(companies: CompanyRecord[]) {
  const canonical = new Map<string, CompanyRecord>();

  for (const company of companies) {
    const key = buildCompanyDedupKey(company);
    if (!key.replace(/\|/g, "")) {
      canonical.set(`${normalizeTextKey(company.id)}|${canonical.size}`, company);
      continue;
    }

    const existing = canonical.get(key);
    if (!existing) {
      canonical.set(key, company);
      continue;
    }

    const existingUpdatedAt = Date.parse(existing.updatedAt ?? "");
    const candidateUpdatedAt = Date.parse(company.updatedAt ?? "");
    if (
      Number.isFinite(candidateUpdatedAt) &&
      (!Number.isFinite(existingUpdatedAt) || candidateUpdatedAt >= existingUpdatedAt)
    ) {
      canonical.set(key, company);
    }
  }

  return Array.from(canonical.values());
}

async function resolveRoomsSource() {
  const fallback = await readFallbackSharedHomeAreasState();
  return fallback?.areas ?? getDefaultHomeAreas();
}

async function resolveTablesSource() {
  const fallback = await readFallbackSharedTablesState();
  return fallback?.tables ?? ([] as PosTableState[]);
}

async function resolveOperatorsSource() {
  const fallback = await readFallbackSharedOperatorRolesState();
  if (fallback?.roles?.length) {
    return fallback.roles;
  }

  const sharedState = await readSharedOperatorRolesState();
  return sharedState.roles ?? ([] as PosOperatorRecord[]);
}

async function resolveBusinessDirectorySource() {
  const fallback = await readFallbackSharedBusinessDirectoryState({
    customers: [] as CustomerRecord[],
    companies: [] as CompanyRecord[],
  });

  return {
    customers: fallback?.customers ?? ([] as CustomerRecord[]),
    companies: dedupeCompanies(fallback?.companies ?? ([] as CompanyRecord[])),
  };
}

async function resolveCatalogSource() {
  const fallbackState = await readFallbackSharedCatalogConfigState();
  if (fallbackState) {
    return fallbackState;
  }

  return await readSharedCatalogConfigState();
}

export async function seedStableDomainsToSupabase() {
  const report = emptyReport();

  const [rooms, tables, operatorRecords, businessDirectory, catalog] = await Promise.all([
    resolveRoomsSource(),
    resolveTablesSource(),
    resolveOperatorsSource(),
    resolveBusinessDirectorySource(),
    resolveCatalogSource(),
  ]);

  try {
    await writeRelationalRoomsState(rooms);
    report.roomsImported = rooms.length;
  } catch (error) {
    report.errors.push(
      `[rooms] ${error instanceof Error ? error.message : "seed failed"}`
    );
  }

  try {
    await writeRelationalTablesState(tables);
    report.tablesImported = tables.length;
  } catch (error) {
    report.errors.push(
      `[tables] ${error instanceof Error ? error.message : "seed failed"}`
    );
  }

  try {
    const { roles, operators } = splitOperatorRecords(operatorRecords);
    await writeRelationalOperatorRolesState(operatorRecords);
    report.operatorRolesImported = roles.length;
    report.operatorsImported = operators.length;
  } catch (error) {
    report.errors.push(
      `[operators] ${error instanceof Error ? error.message : "seed failed"}`
    );
  }

  try {
    await writeRelationalBusinessDirectoryState(
      businessDirectory.customers,
      businessDirectory.companies
    );
    report.companiesImported = businessDirectory.companies.length;
    report.customersImported = businessDirectory.customers.length;
  } catch (error) {
    report.errors.push(
      `[business-directory] ${error instanceof Error ? error.message : "seed failed"}`
    );
  }

  if (!catalog) {
    report.skipped.push("catalog fallback state unavailable");
    return report;
  }

  try {
    await writeRelationalCatalogState({
      departments: catalog.departments as CatalogDepartmentRecord[],
      categories: catalog.categories as CatalogCategoryRecord[],
      products: catalog.products as CatalogProductRecord[],
      paymentMethods: catalog.paymentMethods as CatalogPaymentMethodRecord[],
      vatRates: catalog.vatRates as CatalogVatRateRecord[],
    });
    report.departmentsImported = catalog.departments.length;
    report.categoriesImported = catalog.categories.length;
    report.productsImported = catalog.products.length;
    report.paymentMethodsImported = catalog.paymentMethods.length;
    report.vatRatesImported = catalog.vatRates.length;
  } catch (error) {
    report.errors.push(
      `[catalog] ${error instanceof Error ? error.message : "seed failed"}`
    );
  }

  return report;
}
