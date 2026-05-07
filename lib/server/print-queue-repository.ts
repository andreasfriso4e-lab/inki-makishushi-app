import { getActiveRestaurantId } from "@/lib/restaurant-config";
import type {
  PrinterPrintRequest,
  PrinterTestRequest,
  TcpPrintJobPayload,
  TcpPrinterTarget,
} from "@/lib/printer-transport";
import {
  createSupabaseRows,
  isSupabaseConfigured,
  readSupabaseRows,
  updateSupabaseRows,
} from "@/lib/server/supabase-json-store";

type RelationalPrintJobRow = {
  id: string;
  legacy_client_job_id: string | null;
  legacy_table_id: string | null;
  restaurant_id: string;
  order_id: string | null;
  printer_id: string | null;
  destination: string | null;
  printer_type: string | null;
  printer_name: string | null;
  printer_ip: string | null;
  printer_port: number | null;
  payload_format: string | null;
  idempotency_key: string | null;
  job_type: string;
  status: string;
  error_message: string | null;
  last_error: string | null;
  bridge_id: string | null;
  attempts: number | null;
  request_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
  printed_at: string | null;
  created_at: string;
  updated_at: string;
};

type RelationalBridgeStatusRow = {
  id: string;
  restaurant_id: string;
  bridge_id: string;
  status: string;
  version: string | null;
  metadata: Record<string, unknown> | null;
  last_seen_at: string;
  updated_at: string;
};

type RelationalBridgeHeartbeatRow = {
  id: string;
  restaurant_id: string;
  bridge_id: string;
  hostname: string | null;
  local_ip: string | null;
  version: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  last_seen_at: string;
  updated_at: string;
};

type RelationalPrinterConfigRow = {
  id: string;
  legacy_printer_id: string | null;
  name: string;
};

type RelationalOrderRow = {
  id: string;
  legacy_order_key: string | null;
};

export type BridgeStatusSnapshot = {
  bridgeId: string;
  status: string;
  lastSeenAt: string;
  version: string | null;
  metadata: Record<string, unknown>;
};

export type PrintQueueDiagnostics = {
  queuedCount: number;
  failedCount: number;
  processingCount: number;
  printedCount: number;
  lastPrintedJob: RelationalPrintJobRow | null;
  lastFailedJob: RelationalPrintJobRow | null;
  latestBridgeStatus: BridgeStatusSnapshot | null;
  recentJobs: RelationalPrintJobRow[];
};

function nowIso() {
  return new Date().toISOString();
}

function getRestaurantId() {
  return getActiveRestaurantId();
}

function buildRestaurantFilter() {
  return { column: "restaurant_id", value: getRestaurantId() } as const;
}

function isBridgeOnline(lastSeenAt: string | null | undefined) {
  if (!lastSeenAt) {
    return false;
  }

  const ageMs = Date.now() - new Date(lastSeenAt).getTime();
  return Number.isFinite(ageMs) && ageMs <= 12_000;
}

function mapClientPrintTypeToQueueJobType(job: TcpPrintJobPayload) {
  switch (job.type) {
    case "order":
      return "kitchen_order";
    case "void":
      return "kitchen_cancel";
    case "prebill":
      return "bill";
    case "fiscal-document":
      return "fiscal_document";
    case "table-move":
      return "table-move";
    case "connection-test":
    case "test-print":
      return "test";
    default:
      return "test";
  }
}

function buildIdempotencyKeyFromPrintRequest(request: PrinterPrintRequest) {
  const itemsKey = request.job.items
    .map((item) => `${item.id}:${item.quantity}:${item.note ?? ""}:${item.course ?? ""}`)
    .sort()
    .join("|");

  return [
    request.printer.id,
    request.job.type,
    request.job.tableId ?? request.job.tableLabel ?? "",
    request.job.commandNumber ?? "",
    itemsKey,
  ].join("::");
}

async function findPrintJobByIdempotencyKey(idempotencyKey: string) {
  const rows =
    (await readSupabaseRows<RelationalPrintJobRow>("print_jobs", {
      filters: [buildRestaurantFilter(), { column: "idempotency_key", value: idempotencyKey }],
      limit: 1,
    })) ?? [];
  return rows[0] ?? null;
}

async function resolvePrinterConfigId(printer: TcpPrinterTarget) {
  const printers =
    (await readSupabaseRows<RelationalPrinterConfigRow>("printer_configs", {
      filters: [buildRestaurantFilter(), { column: "legacy_printer_id", value: printer.id }],
      limit: 1,
    })) ?? [];

  return printers[0]?.id ?? null;
}

async function resolveOrderIdByLegacyTableId(tableId: string | undefined) {
  if (!tableId) {
    return null;
  }

  const orders =
    (await readSupabaseRows<RelationalOrderRow>("orders", {
      filters: [buildRestaurantFilter(), { column: "legacy_order_key", value: tableId }],
      limit: 1,
    })) ?? [];

  return orders[0]?.id ?? null;
}

export async function readLatestPrintBridgeStatus() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const heartbeatRows =
    (await readSupabaseRows<RelationalBridgeHeartbeatRow>("print_bridge_heartbeats", {
      filters: [buildRestaurantFilter()],
      orderBy: "last_seen_at",
      ascending: false,
      limit: 1,
    })) ?? [];

  const heartbeatRow = heartbeatRows[0];
  if (heartbeatRow) {
    return {
      bridgeId: heartbeatRow.bridge_id,
      status: heartbeatRow.status,
      lastSeenAt: heartbeatRow.last_seen_at,
      version: heartbeatRow.version ?? null,
      metadata: {
        ...(heartbeatRow.metadata ?? {}),
        hostname: heartbeatRow.hostname ?? null,
        localIp: heartbeatRow.local_ip ?? null,
      },
    } satisfies BridgeStatusSnapshot;
  }

  const rows =
    (await readSupabaseRows<RelationalBridgeStatusRow>("print_bridge_status", {
      filters: [buildRestaurantFilter()],
      orderBy: "last_seen_at",
      ascending: false,
      limit: 1,
    })) ?? [];

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    bridgeId: row.bridge_id,
    status: row.status,
    lastSeenAt: row.last_seen_at,
    version: row.version ?? null,
    metadata: row.metadata ?? {},
  } satisfies BridgeStatusSnapshot;
}

export async function enqueuePrinterPrintJob(
  request: PrinterPrintRequest,
  options?: { idempotencyKey?: string | null }
) {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase non configurato per la coda di stampa");
  }

  const idempotencyKey = options?.idempotencyKey?.trim() || buildIdempotencyKeyFromPrintRequest(request);
  const existingJob = await findPrintJobByIdempotencyKey(idempotencyKey);
  if (existingJob) {
    const latestBridgeStatus = await readLatestPrintBridgeStatus();
    return {
      queuedJobId: existingJob.id,
      bridgeOnline: Boolean(latestBridgeStatus && isBridgeOnline(latestBridgeStatus.lastSeenAt)),
      latestBridgeStatus,
    };
  }

  const [printerConfigId, orderId, latestBridgeStatus] = await Promise.all([
    resolvePrinterConfigId(request.printer),
    resolveOrderIdByLegacyTableId(request.job.tableId),
    readLatestPrintBridgeStatus(),
  ]);

  const queuedRows =
    (await createSupabaseRows<Record<string, unknown>>("print_jobs", [
      {
        restaurant_id: getRestaurantId(),
        order_id: orderId,
        transmission_id: null,
        prebill_id: null,
        printer_id: printerConfigId,
        legacy_client_job_id: request.job.id,
        legacy_table_id: request.job.tableId ?? null,
        destination: request.printer.role,
        printer_type: request.printer.model,
        printer_name: request.printer.name,
        printer_ip: request.printer.ipAddress,
        printer_port: request.printer.port ?? 9100,
        payload_format: "json",
        idempotency_key: idempotencyKey,
        job_type: mapClientPrintTypeToQueueJobType(request.job),
        printer_role: request.printer.role,
        production_station: null,
        status: "queued",
        request_payload: request,
        response_payload: {
          queuedAt: nowIso(),
          bridgeOnline: Boolean(latestBridgeStatus && isBridgeOnline(latestBridgeStatus.lastSeenAt)),
        },
        error_message: null,
        last_error: null,
        executed_at: null,
        attempts: 0,
        bridge_id: null,
        claimed_at: null,
        printed_at: null,
        payload_version: 1,
      },
    ])) ?? [];

  return {
    queuedJobId: String(queuedRows[0]?.id ?? ""),
    bridgeOnline: Boolean(latestBridgeStatus && isBridgeOnline(latestBridgeStatus.lastSeenAt)),
    latestBridgeStatus,
  };
}

export async function enqueuePrinterTestJob(
  request: PrinterTestRequest,
  options?: { idempotencyKey?: string | null }
) {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase non configurato per la coda di stampa");
  }

  const idempotencyKey =
    options?.idempotencyKey?.trim() ||
    `test::${request.printer.id}::${request.mode ?? "print"}::${new Date().toISOString().slice(0, 16)}`;
  const [printerConfigId, latestBridgeStatus] = await Promise.all([
    resolvePrinterConfigId(request.printer),
    readLatestPrintBridgeStatus(),
  ]);

  const queuedRows =
    (await createSupabaseRows<Record<string, unknown>>("print_jobs", [
      {
        restaurant_id: getRestaurantId(),
        order_id: null,
        transmission_id: null,
        prebill_id: null,
        printer_id: printerConfigId,
        legacy_client_job_id: `test-${request.printer.id}-${Date.now()}`,
        legacy_table_id: null,
        destination: request.printer.role,
        printer_type: request.printer.model,
        printer_name: request.printer.name,
        printer_ip: request.printer.ipAddress,
        printer_port: request.printer.port ?? 9100,
        payload_format: "json",
        idempotency_key: idempotencyKey,
        job_type: "test",
        printer_role: request.printer.role,
        production_station: null,
        status: "queued",
        request_payload: request,
        response_payload: {
          queuedAt: nowIso(),
          bridgeOnline: Boolean(latestBridgeStatus && isBridgeOnline(latestBridgeStatus.lastSeenAt)),
        },
        error_message: null,
        last_error: null,
        executed_at: null,
        attempts: 0,
        bridge_id: null,
        claimed_at: null,
        printed_at: null,
        payload_version: 1,
      },
    ])) ?? [];

  return {
    queuedJobId: String(queuedRows[0]?.id ?? ""),
    bridgeOnline: Boolean(latestBridgeStatus && isBridgeOnline(latestBridgeStatus.lastSeenAt)),
    latestBridgeStatus,
  };
}

export async function readPrintQueueDiagnostics(): Promise<PrintQueueDiagnostics | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const [queuedJobs, failedJobs, processingJobs, printedJobs, bridgeStatus, recentJobs] = await Promise.all([
    readSupabaseRows<RelationalPrintJobRow>("print_jobs", {
      filters: [buildRestaurantFilter(), { column: "status", value: "queued" }],
      orderBy: "created_at",
      ascending: false,
    }),
    readSupabaseRows<RelationalPrintJobRow>("print_jobs", {
      filters: [
        buildRestaurantFilter(),
        { column: "status", operator: "in", value: ["failed", "timeout"] },
      ],
      orderBy: "updated_at",
      ascending: false,
    }),
    readSupabaseRows<RelationalPrintJobRow>("print_jobs", {
      filters: [buildRestaurantFilter(), { column: "status", value: "processing" }],
      orderBy: "updated_at",
      ascending: false,
    }),
    readSupabaseRows<RelationalPrintJobRow>("print_jobs", {
      filters: [
        buildRestaurantFilter(),
        { column: "status", operator: "in", value: ["printed", "sent", "simulated"] },
      ],
      orderBy: "printed_at",
      ascending: false,
      limit: 20,
    }),
    readLatestPrintBridgeStatus(),
    readSupabaseRows<RelationalPrintJobRow>("print_jobs", {
      filters: [buildRestaurantFilter()],
      orderBy: "created_at",
      ascending: false,
      limit: 20,
    }),
  ]);

  return {
    queuedCount: queuedJobs?.length ?? 0,
    failedCount: failedJobs?.length ?? 0,
    processingCount: processingJobs?.length ?? 0,
    printedCount: printedJobs?.length ?? 0,
    lastPrintedJob: printedJobs?.[0] ?? null,
    lastFailedJob: failedJobs?.[0] ?? null,
    latestBridgeStatus: bridgeStatus,
    recentJobs: recentJobs ?? [],
  };
}

export async function markPrintJobQueuedToFailed(printJobId: string, errorMessage: string) {
  if (!isSupabaseConfigured()) {
    return;
  }

  await updateSupabaseRows<Record<string, unknown>>(
    "print_jobs",
    {
      status: "failed",
      error_message: errorMessage,
      last_error: errorMessage,
      updated_at: nowIso(),
    },
    [buildRestaurantFilter(), { column: "id", value: printJobId }]
  );
}

export async function retryPrintJob(printJobId: string) {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase non configurato");
  }

  await updateSupabaseRows<Record<string, unknown>>(
    "print_jobs",
    {
      status: "queued",
      error_message: null,
      last_error: null,
      bridge_id: null,
      claimed_at: null,
      updated_at: nowIso(),
    },
    [buildRestaurantFilter(), { column: "id", value: printJobId }]
  );
}

export async function cancelPrintJob(printJobId: string) {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase non configurato");
  }

  await updateSupabaseRows<Record<string, unknown>>(
    "print_jobs",
    {
      status: "cancelled",
      updated_at: nowIso(),
    },
    [buildRestaurantFilter(), { column: "id", value: printJobId }]
  );
}
