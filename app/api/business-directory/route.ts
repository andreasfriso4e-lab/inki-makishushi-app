import { NextResponse } from "next/server";

import { getCompanies, getCustomers, type CompanyRecord, type CustomerRecord } from "@/lib/pos-data";
import {
  readSharedBusinessDirectoryState,
  writeSharedBusinessDirectoryState,
} from "@/lib/server/shared-business-directory-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await readSharedBusinessDirectoryState({
      customers: getCustomers(),
      companies: getCompanies(),
    });

    return NextResponse.json(state, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Impossibile leggere clienti e aziende condivisi",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      customers?: CustomerRecord[];
      companies?: CompanyRecord[];
    };

    const state = await writeSharedBusinessDirectoryState(
      Array.isArray(body.customers) ? body.customers : [],
      Array.isArray(body.companies) ? body.companies : []
    );

    return NextResponse.json(state, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Impossibile salvare clienti e aziende condivisi",
      },
      { status: 500 }
    );
  }
}
