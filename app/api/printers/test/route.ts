import { NextResponse } from "next/server";

import type { PrinterTestRequest } from "@/lib/printer-transport";
import { runPrinterConnectionTest } from "@/lib/server/printer-tcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PrinterTestRequest;
    const result = await runPrinterConnectionTest(body);
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Errore interno test stampante",
        openedSocket: false,
        printed: false,
        at: new Date().toISOString(),
        errorCode: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
