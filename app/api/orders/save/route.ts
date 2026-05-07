import { NextResponse } from "next/server";

import type { PosTableState } from "@/lib/pos-data";
import { writeSharedTablesState } from "@/lib/server/shared-tables-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { tables?: PosTableState[] };

    if (!Array.isArray(body.tables)) {
      return NextResponse.json({ message: "tables richiesto" }, { status: 400 });
    }

    const state = await writeSharedTablesState(body.tables);
    return NextResponse.json(
      {
        ok: true,
        saved: true,
        createdPrintJobs: 0,
        message: "Modifiche ordine salvate senza stampa",
        updatedAt: state.updatedAt,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Impossibile salvare l'ordine",
      },
      { status: 500 }
    );
  }
}

