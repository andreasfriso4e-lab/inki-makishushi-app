import { NextResponse } from "next/server";

import { readSharedCatalogConfigState, writeSharedCatalogConfigState } from "@/lib/server/shared-catalog-config-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await readSharedCatalogConfigState();
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
          error instanceof Error ? error.message : "Impossibile leggere il catalogo condiviso",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Partial<Awaited<ReturnType<typeof readSharedCatalogConfigState>>>;
    const currentState = await readSharedCatalogConfigState();
    const nextState = {
      ...currentState,
      ...body,
      updatedAt: new Date().toISOString(),
    };
    const state = await writeSharedCatalogConfigState(nextState);
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
          error instanceof Error ? error.message : "Impossibile salvare il catalogo condiviso",
      },
      { status: 500 }
    );
  }
}
