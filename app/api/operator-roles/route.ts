export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { NextResponse } = await import("next/server");
  const { readSharedOperatorRolesState } = await import(
    "@/lib/server/shared-operator-roles-store"
  );

  try {
    const state = await readSharedOperatorRolesState();
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
          error instanceof Error ? error.message : "Impossibile leggere gli operatori condivisi",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const { NextResponse } = await import("next/server");
  const { writeSharedOperatorRolesState } = await import(
    "@/lib/server/shared-operator-roles-store"
  );

  try {
    const body = (await request.json()) as { roles?: import("@/types/operator").PosOperatorRecord[] };

    if (!Array.isArray(body.roles)) {
      return NextResponse.json(
        { message: "Payload non valido: roles richiesto" },
        { status: 400 }
      );
    }

    const state = await writeSharedOperatorRolesState(body.roles);
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
          error instanceof Error ? error.message : "Impossibile salvare gli operatori condivisi",
      },
      { status: 500 }
    );
  }
}
