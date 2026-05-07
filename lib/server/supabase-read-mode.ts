export type SupabaseReadMode =
  | "fallback-first"
  | "supabase-read-with-fallback"
  | "supabase-primary-read";

export type SupabaseReadDomain =
  | "rooms"
  | "tables-metadata"
  | "operators"
  | "operator-roles"
  | "companies"
  | "customers"
  | "departments"
  | "categories"
  | "products"
  | "payment-methods"
  | "vat-rates"
  | "orders-live"
  | "payments"
  | "fiscal-documents"
  | "cash-closures"
  | "daily-reports"
  | "printer-configs"
  | "printer-routing-rules"
  | "fidelity"
  | "operational-logs";

const VALID_MODES = new Set<SupabaseReadMode>([
  "fallback-first",
  "supabase-read-with-fallback",
  "supabase-primary-read",
]);

const DEFAULT_MODES: Record<SupabaseReadDomain, SupabaseReadMode> = {
  "rooms": "supabase-read-with-fallback",
  "tables-metadata": "supabase-read-with-fallback",
  "operators": "supabase-read-with-fallback",
  "operator-roles": "supabase-read-with-fallback",
  "companies": "supabase-read-with-fallback",
  "customers": "supabase-read-with-fallback",
  "departments": "supabase-read-with-fallback",
  "categories": "supabase-read-with-fallback",
  "products": "supabase-read-with-fallback",
  "payment-methods": "supabase-read-with-fallback",
  "vat-rates": "supabase-read-with-fallback",
  "orders-live": "supabase-read-with-fallback",
  "payments": "supabase-read-with-fallback",
  "fiscal-documents": "supabase-read-with-fallback",
  "cash-closures": "supabase-read-with-fallback",
  "daily-reports": "supabase-read-with-fallback",
  "printer-configs": "supabase-read-with-fallback",
  "printer-routing-rules": "supabase-read-with-fallback",
  "fidelity": "supabase-read-with-fallback",
  "operational-logs": "fallback-first",
};

function normalizeMode(value: unknown): SupabaseReadMode | null {
  return typeof value === "string" && VALID_MODES.has(value as SupabaseReadMode)
    ? (value as SupabaseReadMode)
    : null;
}

function readOverrides() {
  const rawOverrides = process.env.POS_SUPABASE_READ_MODE_OVERRIDES?.trim();

  if (!rawOverrides) {
    return {} as Partial<Record<SupabaseReadDomain, SupabaseReadMode>>;
  }

  try {
    const parsedValue = JSON.parse(rawOverrides) as Record<string, unknown>;
    const normalizedEntries = Object.entries(parsedValue)
      .map(([domain, mode]) => [domain, normalizeMode(mode)] as const)
      .filter(
        (entry): entry is [SupabaseReadDomain, SupabaseReadMode] =>
          Boolean(entry[1]) && entry[0] in DEFAULT_MODES
      );

    return Object.fromEntries(normalizedEntries) as Partial<
      Record<SupabaseReadDomain, SupabaseReadMode>
    >;
  } catch {
    return {};
  }
}

export function getSupabaseReadMode(domain: SupabaseReadDomain): SupabaseReadMode {
  const overrides = readOverrides();
  const override = overrides[domain];

  if (override) {
    return override;
  }

  const globalOverride = normalizeMode(process.env.POS_SUPABASE_READ_MODE_DEFAULT?.trim());
  return globalOverride ?? DEFAULT_MODES[domain];
}

export function prefersSupabaseRead(domain: SupabaseReadDomain) {
  const mode = getSupabaseReadMode(domain);
  return mode === "supabase-read-with-fallback" || mode === "supabase-primary-read";
}

export function allowsFallbackRead(domain: SupabaseReadDomain) {
  return getSupabaseReadMode(domain) !== "supabase-primary-read";
}

export function getDefaultSupabaseReadModes() {
  return { ...DEFAULT_MODES };
}
