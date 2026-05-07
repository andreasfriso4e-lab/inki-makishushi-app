import { getActiveRestaurantId } from "@/lib/restaurant-config";

type SupabaseJsonStateRecord<TPayload> = {
  restaurant_id: string;
  payload: TPayload;
  updated_at: string;
};

type SupabaseFilterOperator = "eq" | "neq" | "in" | "not.in" | "is";

type SupabaseRowReadOptions = {
  select?: string;
  filters?: Array<{
    column: string;
    operator?: SupabaseFilterOperator;
    value: string | number | boolean | null | Array<string | number>;
  }>;
  orderBy?: string;
  ascending?: boolean;
  limit?: number;
};

const SUPABASE_REST_TIMEOUT_MS = 5000;

function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
}

function getSupabaseServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey());
}

function buildSupabaseHeaders() {
  const apiKey = getSupabaseServiceRoleKey();

  return {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

async function fetchSupabase(input: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUPABASE_REST_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildTableUrl(tableName: string, query = "") {
  const baseUrl = getSupabaseUrl()
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/i, "");
  return `${baseUrl}/rest/v1/${tableName}${query}`;
}

export async function probeSupabaseTable(tableName: string) {
  if (!isSupabaseConfigured()) {
    return {
      tableName,
      schema: "public",
      existsInDatabase: false,
      restAccessible: false,
      statusCode: null as number | null,
      error: "Supabase not configured",
    };
  }

  const response = await fetchSupabase(buildTableUrl(tableName, "?select=*&limit=1"), {
    method: "GET",
    headers: {
      ...buildSupabaseHeaders(),
      Accept: "application/json",
    },
  });

  const responseText = await response.text();
  const parsedBody = (() => {
    try {
      return JSON.parse(responseText) as { code?: string; message?: string };
    } catch {
      return null;
    }
  })();

  const invalidPath = parsedBody?.code === "PGRST125";
  const relationMissing = parsedBody?.code === "PGRST205";

  return {
    tableName,
    schema: "public",
    existsInDatabase: response.ok ? true : relationMissing ? false : !invalidPath,
    restAccessible: response.ok,
    statusCode: response.status,
    error: response.ok ? null : parsedBody?.message ?? responseText.slice(0, 300),
  };
}

function buildRowsQuery(options: SupabaseRowReadOptions = {}) {
  const searchParams = new URLSearchParams();
  searchParams.set("select", options.select ?? "*");

  options.filters?.forEach((filter) => {
    const operator = filter.operator ?? "eq";
    const value =
      operator === "in" && Array.isArray(filter.value)
        ? `(${filter.value.join(",")})`
        : filter.value === null
          ? "null"
          : String(filter.value);
    searchParams.set(filter.column, `${operator}.${value}`);
  });

  if (options.orderBy) {
    searchParams.set("order", `${options.orderBy}.${options.ascending === false ? "desc" : "asc"}`);
  }

  if (typeof options.limit === "number" && options.limit > 0) {
    searchParams.set("limit", String(options.limit));
  }

  return `?${searchParams.toString()}`;
}

export async function readSupabaseJsonState<TPayload>(tableName: string) {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const restaurantId = getActiveRestaurantId();
  const query = `?restaurant_id=eq.${encodeURIComponent(
    restaurantId
  )}&select=payload,updated_at&limit=1`;
  const response = await fetchSupabase(buildTableUrl(tableName, query), {
    method: "GET",
    headers: {
      ...buildSupabaseHeaders(),
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase read failed for ${tableName} (${response.status})`);
  }

  const payload = (await response.json()) as Array<SupabaseJsonStateRecord<TPayload>>;
  const record = Array.isArray(payload) ? payload[0] : null;

  if (!record) {
    return null;
  }

  return {
    payload: record.payload,
    updatedAt: record.updated_at,
  };
}

export async function writeSupabaseJsonState<TPayload>(tableName: string, payload: TPayload) {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const restaurantId = getActiveRestaurantId();
  const response = await fetchSupabase(buildTableUrl(tableName), {
    method: "POST",
    headers: {
      ...buildSupabaseHeaders(),
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify([
      {
        restaurant_id: restaurantId,
        payload,
      },
    ]),
  });

  if (!response.ok) {
    throw new Error(`Supabase write failed for ${tableName} (${response.status})`);
  }

  const records = (await response.json()) as Array<SupabaseJsonStateRecord<TPayload>>;
  const record = Array.isArray(records) ? records[0] : null;

  if (!record) {
    return null;
  }

  return {
    payload: record.payload,
    updatedAt: record.updated_at,
  };
}

export async function readSupabaseRows<TRow>(
  tableName: string,
  options: SupabaseRowReadOptions = {}
) {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const response = await fetchSupabase(buildTableUrl(tableName, buildRowsQuery(options)), {
    method: "GET",
    headers: {
      ...buildSupabaseHeaders(),
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase read failed for ${tableName} (${response.status})`);
  }

  const payload = (await response.json()) as TRow[];
  return Array.isArray(payload) ? payload : [];
}

export async function createSupabaseRows<TRow extends Record<string, unknown>>(
  tableName: string,
  rows: TRow[]
) {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const response = await fetchSupabase(buildTableUrl(tableName), {
    method: "POST",
    headers: {
      ...buildSupabaseHeaders(),
      Prefer: "return=representation",
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    throw new Error(`Supabase insert failed for ${tableName} (${response.status})`);
  }

  const payload = (await response.json()) as TRow[];
  return Array.isArray(payload) ? payload : [];
}

export async function updateSupabaseRows<TRow extends Record<string, unknown>>(
  tableName: string,
  patch: Partial<TRow>,
  filters: SupabaseRowReadOptions["filters"]
) {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const response = await fetchSupabase(
    buildTableUrl(tableName, buildRowsQuery({ filters, limit: 1 })),
    {
      method: "PATCH",
      headers: {
        ...buildSupabaseHeaders(),
        Prefer: "return=representation",
      },
      body: JSON.stringify(patch),
    }
  );

  if (!response.ok) {
    throw new Error(`Supabase update failed for ${tableName} (${response.status})`);
  }

  const payload = (await response.json()) as TRow[];
  return Array.isArray(payload) ? payload : [];
}

export async function deleteSupabaseRows(
  tableName: string,
  filters: SupabaseRowReadOptions["filters"]
) {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const response = await fetchSupabase(
    buildTableUrl(tableName, buildRowsQuery({ filters, limit: 1000 })),
    {
      method: "DELETE",
      headers: {
        ...buildSupabaseHeaders(),
        Prefer: "return=representation",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Supabase delete failed for ${tableName} (${response.status})`);
  }

  return true;
}
