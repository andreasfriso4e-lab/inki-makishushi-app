import { NextResponse } from "next/server";

import {
  readSharedFinancialArchiveState,
  writeSharedFinancialArchiveState,
} from "@/lib/server/shared-financial-archive-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await readSharedFinancialArchiveState();
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
          error instanceof Error ? error.message : "Impossibile leggere archivio fiscale condiviso",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { entries?: Array<Record<string, unknown> & { id: string }> };

    if (!Array.isArray(body.entries)) {
      return NextResponse.json({ message: "entries richiesto" }, { status: 400 });
    }

    const state = await writeSharedFinancialArchiveState(body.entries);
    return NextResponse.json(state, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[api/financial-archive] Financial archive sync failed", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Impossibile sincronizzare archivio fiscale condiviso",
      },
      { status: 500 }
    );
  }
}
