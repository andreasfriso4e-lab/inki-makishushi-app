import { NextResponse } from "next/server";

import {
  readSharedOperationalLogsState,
  writeSharedOperationalLogsState,
} from "@/lib/server/shared-operational-logs-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await readSharedOperationalLogsState({
      fiscalPrinterLogs: [],
      voidLogs: [],
      auditLogs: [],
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
          error instanceof Error ? error.message : "Impossibile leggere log operativi condivisi",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      fiscalPrinterLogs?: unknown[];
      voidLogs?: unknown[];
      auditLogs?: unknown[];
    };

    const currentState = await readSharedOperationalLogsState({
      fiscalPrinterLogs: [],
      voidLogs: [],
      auditLogs: [],
    });

    const state = await writeSharedOperationalLogsState({
      fiscalPrinterLogs: Array.isArray(body.fiscalPrinterLogs)
        ? (body.fiscalPrinterLogs as never[])
        : currentState.fiscalPrinterLogs,
      voidLogs: Array.isArray(body.voidLogs)
        ? (body.voidLogs as never[])
        : currentState.voidLogs,
      auditLogs: Array.isArray(body.auditLogs)
        ? (body.auditLogs as never[])
        : currentState.auditLogs,
    });

    return NextResponse.json(state, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[api/operational-logs] Operational logs sync failed", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Impossibile sincronizzare log operativi",
      },
      { status: 500 }
    );
  }
}
