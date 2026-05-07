import { NextResponse } from "next/server";

import { seedStableDomainsToSupabase } from "@/lib/server/seed-stable-domains-service";
import { isSupabaseConfigured } from "@/lib/server/supabase-json-store";
import {
  readFallbackSharedBusinessDirectoryState,
} from "@/lib/server/shared-business-directory-store";
import {
  readFallbackSharedCatalogConfigState,
} from "@/lib/server/shared-catalog-config-store";
import {
  readFallbackSharedHomeAreasState,
} from "@/lib/server/shared-home-areas-store";
import {
  readFallbackSharedOperatorRolesState,
} from "@/lib/server/shared-operator-roles-store";
import {
  readFallbackSharedTablesState,
} from "@/lib/server/shared-tables-store";
import { readRelationalCatalogState } from "@/lib/server/supabase-relational-catalog-repository";
import {
  readRelationalBusinessDirectoryState,
  readRelationalOperatorRolesState,
  readRelationalRoomsAndTablesState,
} from "@/lib/server/supabase-relational-read-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parityStatus(supabase: number, fallback: number) {
  return supabase === fallback ? "ok" : "mismatch";
}

async function buildPostSeedParity() {
  const [fallbackRooms, fallbackTables, fallbackOperators, fallbackDirectory, fallbackCatalog] =
    await Promise.all([
      readFallbackSharedHomeAreasState(),
      readFallbackSharedTablesState(),
      readFallbackSharedOperatorRolesState(),
      readFallbackSharedBusinessDirectoryState({ customers: [], companies: [] }),
      readFallbackSharedCatalogConfigState(),
    ]);

  const [relationalRoomsTables, relationalOperators, relationalDirectory, relationalCatalog] =
    await Promise.all([
      readRelationalRoomsAndTablesState(),
      readRelationalOperatorRolesState(),
      readRelationalBusinessDirectoryState(),
      readRelationalCatalogState(),
    ]);

  return {
    rooms: {
      supabase: relationalRoomsTables?.areas.length ?? 0,
      fallback: fallbackRooms?.areas.length ?? 0,
      status: parityStatus(
        relationalRoomsTables?.areas.length ?? 0,
        fallbackRooms?.areas.length ?? 0
      ),
    },
    tables: {
      supabase: relationalRoomsTables?.tables.length ?? 0,
      fallback: fallbackTables?.tables.length ?? 0,
      status: parityStatus(
        relationalRoomsTables?.tables.length ?? 0,
        fallbackTables?.tables.length ?? 0
      ),
    },
    operators: {
      supabase: relationalOperators?.roles.length ?? 0,
      fallback: fallbackOperators?.roles.length ?? 0,
      status: parityStatus(
        relationalOperators?.roles.length ?? 0,
        fallbackOperators?.roles.length ?? 0
      ),
    },
    companies: {
      supabase: relationalDirectory?.companies.length ?? 0,
      fallback: fallbackDirectory?.companies.length ?? 0,
      status: parityStatus(
        relationalDirectory?.companies.length ?? 0,
        fallbackDirectory?.companies.length ?? 0
      ),
    },
    customers: {
      supabase: relationalDirectory?.customers.length ?? 0,
      fallback: fallbackDirectory?.customers.length ?? 0,
      status: parityStatus(
        relationalDirectory?.customers.length ?? 0,
        fallbackDirectory?.customers.length ?? 0
      ),
    },
    departments: {
      supabase: relationalCatalog?.departments.length ?? 0,
      fallback: fallbackCatalog?.departments.length ?? 0,
      status: parityStatus(
        relationalCatalog?.departments.length ?? 0,
        fallbackCatalog?.departments.length ?? 0
      ),
    },
    categories: {
      supabase: relationalCatalog?.categories.length ?? 0,
      fallback: fallbackCatalog?.categories.length ?? 0,
      status: parityStatus(
        relationalCatalog?.categories.length ?? 0,
        fallbackCatalog?.categories.length ?? 0
      ),
    },
    products: {
      supabase: relationalCatalog?.products.length ?? 0,
      fallback: fallbackCatalog?.products.length ?? 0,
      status: parityStatus(
        relationalCatalog?.products.length ?? 0,
        fallbackCatalog?.products.length ?? 0
      ),
    },
    paymentMethods: {
      supabase: relationalCatalog?.paymentMethods.length ?? 0,
      fallback: fallbackCatalog?.paymentMethods.length ?? 0,
      status: parityStatus(
        relationalCatalog?.paymentMethods.length ?? 0,
        fallbackCatalog?.paymentMethods.length ?? 0
      ),
    },
    vatRates: {
      supabase: relationalCatalog?.vatRates.length ?? 0,
      fallback: fallbackCatalog?.vatRates.length ?? 0,
      status: parityStatus(
        relationalCatalog?.vatRates.length ?? 0,
        fallbackCatalog?.vatRates.length ?? 0
      ),
    },
  };
}

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      action: "Use POST to launch the stable domains seed import.",
      supabaseConfigured: isSupabaseConfigured(),
      endpoint: "/api/admin/supabase-seed-stable-domains",
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}

export async function POST() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Supabase is not configured. Seed skipped.",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }

  try {
    const report = await seedStableDomainsToSupabase();
    let parity: Awaited<ReturnType<typeof buildPostSeedParity>> | null = null;
    let parityError: string | null = null;

    try {
      parity = await buildPostSeedParity();
    } catch (error) {
      parityError = error instanceof Error ? error.message : "Parity check failed after seed.";
    }

    return NextResponse.json(
      {
        ok: report.errors.length === 0 && !parityError,
        report,
        parityError,
        parity,
        next: "Check /api/admin/supabase-diagnostics and the Supabase Table Editor.",
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Stable domains seed failed.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }
}
