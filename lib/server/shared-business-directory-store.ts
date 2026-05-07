import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CompanyRecord, CustomerRecord } from "@/lib/pos-data";
import {
  isSupabaseConfigured,
  readSupabaseJsonState,
  writeSupabaseJsonState,
} from "@/lib/server/supabase-json-store";
import {
  readRelationalBusinessDirectoryState,
  writeRelationalBusinessDirectoryState,
} from "@/lib/server/supabase-relational-read-repository";
import {
  allowsFallbackRead,
  prefersSupabaseRead,
} from "@/lib/server/supabase-read-mode";

export type SharedBusinessDirectoryState = {
  customers: CustomerRecord[];
  companies: CompanyRecord[];
  updatedAt: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const BUSINESS_DIRECTORY_FILE = path.join(DATA_DIR, "shared-business-directory.json");
const SUPABASE_BUSINESS_DIRECTORY_TABLE = "pos_business_directory_state";

function getNowIso() {
  return new Date().toISOString();
}

function cloneCustomers(customers: CustomerRecord[]) {
  return customers.map((customer) => ({ ...customer }));
}

function cloneCompanies(companies: CompanyRecord[]) {
  return companies.map((company) => ({ ...company }));
}

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

export async function readFallbackSharedBusinessDirectoryState(
  fallback: { customers: CustomerRecord[]; companies: CompanyRecord[] }
): Promise<SharedBusinessDirectoryState | null> {
  await ensureDataDir();

  try {
    const rawValue = await readFile(BUSINESS_DIRECTORY_FILE, "utf8");
    const parsedValue = JSON.parse(rawValue) as Partial<SharedBusinessDirectoryState>;

    return {
      customers: Array.isArray(parsedValue.customers)
        ? cloneCustomers(parsedValue.customers)
        : cloneCustomers(fallback.customers),
      companies: Array.isArray(parsedValue.companies)
        ? cloneCompanies(parsedValue.companies)
        : cloneCompanies(fallback.companies),
      updatedAt:
        typeof parsedValue.updatedAt === "string" && parsedValue.updatedAt.length > 0
          ? parsedValue.updatedAt
          : getNowIso(),
    };
  } catch {
    return null;
  }
}

export async function readSharedBusinessDirectoryState(
  fallback: { customers: CustomerRecord[]; companies: CompanyRecord[] }
): Promise<SharedBusinessDirectoryState> {
  if (isSupabaseConfigured() && (prefersSupabaseRead("companies") || prefersSupabaseRead("customers"))) {
    try {
      const relationalState = await readRelationalBusinessDirectoryState();

      if (relationalState) {
        console.info("[shared-business-directory-store] read source=supabase");
        return {
          customers:
            relationalState.customers.length > 0
              ? cloneCustomers(relationalState.customers)
              : cloneCustomers(fallback.customers),
          companies:
            relationalState.companies.length > 0
              ? cloneCompanies(relationalState.companies)
              : cloneCompanies(fallback.companies),
          updatedAt: relationalState.updatedAt,
        };
      }

      const remoteState = await readSupabaseJsonState<{
        customers?: CustomerRecord[];
        companies?: CompanyRecord[];
      }>(SUPABASE_BUSINESS_DIRECTORY_TABLE);

      if (remoteState?.payload) {
        console.info("[shared-business-directory-store] read source=fallback-blob");
        return {
          customers: Array.isArray(remoteState.payload.customers)
            ? cloneCustomers(remoteState.payload.customers)
            : cloneCustomers(fallback.customers),
          companies: Array.isArray(remoteState.payload.companies)
            ? cloneCompanies(remoteState.payload.companies)
            : cloneCompanies(fallback.companies),
          updatedAt: remoteState.updatedAt,
        };
      }
    } catch {
      // Fallback locale/blob: non bloccare la lettura anagrafiche.
    }
  }

  if (!allowsFallbackRead("companies") || !allowsFallbackRead("customers")) {
    console.info("[shared-business-directory-store] read source=fallback-inline");
    return {
      customers: cloneCustomers(fallback.customers),
      companies: cloneCompanies(fallback.companies),
      updatedAt: getNowIso(),
    };
  }

  const fallbackState = await readFallbackSharedBusinessDirectoryState(fallback);
  if (fallbackState) {
    console.info("[shared-business-directory-store] read source=fallback-file");
    return fallbackState;
  }

  const initialState: SharedBusinessDirectoryState = {
    customers: cloneCustomers(fallback.customers),
    companies: cloneCompanies(fallback.companies),
    updatedAt: getNowIso(),
  };
  await writeSharedBusinessDirectoryState(initialState.customers, initialState.companies);
  console.info("[shared-business-directory-store] read source=default");
  return initialState;
}

export async function writeSharedBusinessDirectoryState(
  customers: CustomerRecord[],
  companies: CompanyRecord[]
): Promise<SharedBusinessDirectoryState> {
  const normalizedCustomers = cloneCustomers(customers);
  const normalizedCompanies = cloneCompanies(companies);
  let nextState: SharedBusinessDirectoryState | null = null;

  if (isSupabaseConfigured()) {
    try {
      const remoteState = await writeSupabaseJsonState(SUPABASE_BUSINESS_DIRECTORY_TABLE, {
        customers: normalizedCustomers,
        companies: normalizedCompanies,
      });

      if (remoteState?.payload) {
        nextState = {
          customers: Array.isArray(remoteState.payload.customers)
            ? cloneCustomers(remoteState.payload.customers)
            : normalizedCustomers,
          companies: Array.isArray(remoteState.payload.companies)
            ? cloneCompanies(remoteState.payload.companies)
            : normalizedCompanies,
          updatedAt: remoteState.updatedAt,
        };
      }
    } catch (error) {
      console.error("[shared-business-directory-store] Blob Supabase write failed", error);
    }
  }

  if (!nextState) {
    await ensureDataDir();

    nextState = {
      customers: normalizedCustomers,
      companies: normalizedCompanies,
      updatedAt: getNowIso(),
    };

    await writeFile(BUSINESS_DIRECTORY_FILE, JSON.stringify(nextState, null, 2), "utf8");
  }

  if (isSupabaseConfigured()) {
    try {
      await writeRelationalBusinessDirectoryState(nextState.customers, nextState.companies);
    } catch (error) {
      console.error("[shared-business-directory-store] Relational Supabase write failed", error);
    }
  }

  return nextState;
}
