import { NextResponse } from "next/server";

import type { PosTableState } from "@/lib/pos-data";
import {
  readSharedTablesState,
  writeSharedTablesState,
} from "@/lib/server/shared-tables-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await readSharedTablesState();
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
          error instanceof Error ? error.message : "Impossibile leggere lo stato tavoli condiviso",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { tables?: PosTableState[] };

    if (!Array.isArray(body.tables)) {
      return NextResponse.json(
        { message: "Payload non valido: tables richiesto" },
        { status: 400 }
      );
    }

    const state = await writeSharedTablesState(body.tables);
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
          error instanceof Error ? error.message : "Impossibile salvare lo stato tavoli condiviso",
      },
      { status: 500 }
    );
  }
}
