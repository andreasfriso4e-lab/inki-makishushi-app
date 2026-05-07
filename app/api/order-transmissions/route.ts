import { NextResponse } from "next/server";

import { writeRelationalOrderTransmissions } from "@/lib/server/supabase-relational-order-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderTransmissionRequestBody = {
  tableId?: string;
  deviceMode?: "cassa" | "palmare";
  operatorId?: string | null;
  operatorLabel?: string | null;
  commandNumber?: string | null;
  transmissionType?: "order" | "reprint";
  jobs?: Array<{
    id: string;
    type: string;
    status: string;
    printerId: string;
    printerName: string;
    printerRole: string;
    summary: string;
    errorMessage?: string;
    commandNumber?: string;
    createdAt?: string;
    updatedAt?: string;
    items?: Array<{
      id: string;
      productId: string;
      name: string;
      quantity: number;
      guestCode?: string | null;
      course?: "PRIMA PORTATA" | "SECONDA PORTATA" | "TERZA PORTATA";
      printerRole: string;
      productionStation?: string;
      note?: string;
    }>;
  }>;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as OrderTransmissionRequestBody;

    if (typeof body.tableId !== "string" || body.tableId.trim().length === 0) {
      return NextResponse.json({ message: "tableId richiesto" }, { status: 400 });
    }

    if (!Array.isArray(body.jobs)) {
      return NextResponse.json({ message: "jobs richiesto" }, { status: 400 });
    }

    await writeRelationalOrderTransmissions({
      tableId: body.tableId.trim(),
      deviceMode: body.deviceMode,
      operatorId: body.operatorId ?? null,
      operatorLabel: body.operatorLabel ?? null,
        commandNumber: body.commandNumber ?? null,
        transmissionType: body.transmissionType ?? "order",
        jobs: body.jobs.map((job) => ({
          id: job.id,
        type: job.type as "order" | "prebill" | "void" | "table-move" | "connection-test" | "test-print" | "fiscal-document",
        status: job.status as "pending" | "simulated" | "sent" | "failed" | "cancelled",
        printerId: job.printerId,
        printerName: job.printerName,
          printerRole: job.printerRole,
          summary: job.summary,
          errorMessage: job.errorMessage,
          commandNumber: job.commandNumber,
          createdAt: job.createdAt ?? new Date().toISOString(),
          updatedAt: job.updatedAt ?? job.createdAt ?? new Date().toISOString(),
          items: Array.isArray(job.items)
          ? job.items.map((item) => ({
              id: item.id,
              productId: item.productId,
              name: item.name,
              quantity: item.quantity,
              guestCode: item.guestCode ?? null,
              course: item.course,
              printerRole: item.printerRole,
              productionStation: item.productionStation as
                | "BAR"
                | "FREDDO"
                | "CALDO"
                | "GENERIC"
                | undefined,
              note: item.note,
            }))
          : [],
      })),
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("[api/order-transmissions] Relational transmission sync failed", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Impossibile sincronizzare le transmission relazionali",
      },
      { status: 500 }
    );
  }
}
