import { NextResponse } from "next/server";

import type { HomeAreaRecord } from "@/lib/home-settings";
import {
  readSharedHomeAreasState,
  writeSharedHomeAreasState,
} from "@/lib/server/shared-home-areas-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await readSharedHomeAreasState();
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
          error instanceof Error ? error.message : "Impossibile leggere le sale condivise",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { areas?: HomeAreaRecord[] };

    if (!Array.isArray(body.areas)) {
      return NextResponse.json(
        { message: "Payload non valido: areas richiesto" },
        { status: 400 }
      );
    }

    const state = await writeSharedHomeAreasState(body.areas);
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
          error instanceof Error ? error.message : "Impossibile salvare le sale condivise",
      },
      { status: 500 }
    );
  }
}
