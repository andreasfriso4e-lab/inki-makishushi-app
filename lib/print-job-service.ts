"use client";

import {
  getOrderCommandSettings,
  reserveNextOrderCommandNumber,
  type OrderCommandSettings,
} from "@/lib/order-command-settings";
import type { CourseGroup, OrderItem, Product } from "@/lib/pos-data";
import { appendFiscalPrinterLog } from "@/lib/fiscal-printer-log";
import { PrinterConfigService } from "@/lib/printer-config-service";
import {
  EpsonRtXmlPrinterAdapter,
  EscPosPrinterAdapter,
  MockFiscalPrinterAdapter,
  MockPrinterAdapter,
  type PrinterAdapter,
} from "@/lib/printer-adapters";
import {
  getPrinterRoleForOrderItem,
  getPrinterRoleForDepartment,
  getPrinterRoleForProductionStation,
  getProductionStationForOrderItem,
  resolveProductForOrderItem,
  shouldKeepGuestCodeForOrderItem,
  type ProductionStation,
  type PrinterRoutingTargetRole,
} from "@/lib/printer-routing";
import { getRestaurantStorageKey } from "@/lib/restaurant-storage";
import { syncSharedPrintingConfig } from "@/lib/shared-printing-config";
import type {
  PrinterConnectionMode,
  PrinterRecord,
  PrinterRole,
} from "@/lib/printer-settings";

export type PrintJobStatus = "pending" | "simulated" | "sent" | "failed" | "cancelled";
export type PrintJobType =
  | "order"
  | "fiscal-document"
  | "connection-test"
  | "prebill"
  | "table-move"
  | "void"
  | "test-print";

export type PrintJobItem = {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  guestCode?: string | null;
  course?: CourseGroup;
  note?: string;
  category?: string;
  printerRole: string;
  productionStation?: ProductionStation;
};

export type PrintJobEvent = {
  id: string;
  at: string;
  message: string;
};

export type PrintJob = {
  id: string;
  type: PrintJobType;
  printerId: string;
  printerName: string;
  printerRole: string;
  printerModel: string;
  printerIpAddress: string;
  printerPort: number | null;
  connectionMode: PrinterConnectionMode;
  status: PrintJobStatus;
  createdAt: string;
  updatedAt: string;
  tableId?: string;
  tableLabel?: string;
  sourceTableLabel?: string;
  destinationTableLabel?: string;
  roomLabel?: string;
  destinationRoomLabel?: string;
  operator?: string;
  commandNumber?: string;
  guests?: number;
  customerLabel?: string;
  companyLabel?: string;
  commandSettingsSnapshot?: OrderCommandSettings;
  documentType?: string;
  paymentMethod?: string;
  subtotal?: number;
  discountLabel?: string;
  total?: number;
  summary: string;
  items: PrintJobItem[];
  events: PrintJobEvent[];
  errorMessage?: string;
  lastAttemptAt?: string;
  attemptCount: number;
};

type OrderPrintSourceItem = Pick<
  OrderItem,
  "id" | "productId" | "name" | "quantity" | "course" | "note" | "commensaleCode"
>;

type OrderPrintDispatchInput = {
  tableId: string;
  tableLabel: string;
  roomLabel: string;
  operator: string;
  operatorId?: string | null;
  deviceMode?: "cassa" | "palmare";
  guests?: number;
  customerLabel?: string;
  companyLabel?: string;
  commandNumber?: string;
  transmissionType?: "order" | "reprint";
  items: OrderPrintSourceItem[];
  products: Product[];
};

type FiscalPrintDispatchInput = {
  tableId: string;
  tableLabel: string;
  roomLabel: string;
  operator: string;
  documentType: string;
  paymentMethod: string;
  total: number;
  items: OrderPrintSourceItem[];
  products: Product[];
};

type DepartmentPrintDispatchInput = {
  tableId: string;
  tableLabel: string;
  roomLabel: string;
  operator: string;
  guests?: number;
  customerLabel?: string;
  companyLabel?: string;
  commandNumber?: string;
  items: OrderPrintSourceItem[];
  products: Product[];
  type: "order" | "void";
  summaryPrefix: string;
};

type TaggedDepartmentPrintDispatchInput = {
  tableId: string;
  tableLabel: string;
  roomLabel: string;
  operator: string;
  guests?: number;
  customerLabel?: string;
  companyLabel?: string;
  commandNumber?: string;
  items: Array<{
    id: string;
    productId: string;
    name: string;
    quantity: number;
    guestCode?: string | null;
    note?: string;
    course?: CourseGroup;
    department: string;
    category?: string;
  }>;
  type: "order" | "void";
  summaryPrefix: string;
};

type PrebillPrintDispatchInput = {
  tableId: string;
  tableLabel: string;
  roomLabel: string;
  operator: string;
  items: OrderPrintSourceItem[];
  products: Product[];
  subtotal: number;
  total: number;
  discountLabel?: string;
};

type TableMovePrintDispatchInput = {
  sourceTableLabel: string;
  destinationTableLabel: string;
  operator: string;
  sourceRoomLabel?: string;
  destinationRoomLabel?: string;
  total?: number;
  items?: Array<{
    id: string;
    productId?: string;
    name: string;
    quantity: number;
    note?: string;
    course?: CourseGroup;
  }>;
};

const PRINT_JOBS_STORAGE_KEY = getRestaurantStorageKey("pos-print-jobs");

function getNowIso() {
  return new Date().toISOString();
}

function createPrintEvent(message: string): PrintJobEvent {
  return {
    id: `print-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: getNowIso(),
    message,
  };
}

async function persistOrderTransmissionsToServer(input: {
  tableId: string;
  operator: string;
  operatorId?: string | null;
  deviceMode?: "cassa" | "palmare";
  commandNumber?: string;
  transmissionType?: "order" | "reprint";
  jobs: PrintJob[];
}) {
  if (typeof window === "undefined" || input.jobs.length === 0) {
    return;
  }

  try {
    await fetch("/api/order-transmissions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      cache: "no-store",
      body: JSON.stringify({
        tableId: input.tableId,
        operatorId: input.operatorId ?? null,
        operatorLabel: input.operator,
        deviceMode: input.deviceMode,
        commandNumber: input.commandNumber,
        transmissionType: input.transmissionType ?? "order",
        jobs: input.jobs.map((job) => ({
          id: job.id,
          type: job.type,
          status: job.status,
          printerId: job.printerId,
          printerName: job.printerName,
          printerRole: job.printerRole,
          summary: job.summary,
          errorMessage: job.errorMessage,
          commandNumber: job.commandNumber,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          items: job.items.map((item) => ({
            id: item.id,
            productId: item.productId,
            name: item.name,
            quantity: item.quantity,
            guestCode: item.guestCode ?? null,
            course: item.course,
            printerRole: item.printerRole,
            productionStation: item.productionStation,
            note: item.note,
          })),
        })),
      }),
    });
  } catch (error) {
    console.error("[print-job-service] Relational transmission sync request failed", error);
  }
}

function normalizePrintJob(job: PrintJob): PrintJob {
  return {
    ...job,
    connectionMode: job.connectionMode === "real" ? "real" : "mock",
    status:
      job.status === "cancelled" ||
      job.status === "simulated" ||
      job.status === "sent" ||
      job.status === "failed"
        ? job.status
        : "pending",
    events: Array.isArray(job.events) ? job.events : [],
    items: Array.isArray(job.items) ? job.items : [],
    attemptCount: typeof job.attemptCount === "number" ? job.attemptCount : 1,
    errorMessage: job.errorMessage ?? "",
  };
}

export function getPrintJobs() {
  if (typeof window === "undefined") {
    return [] as PrintJob[];
  }

  const rawValue = window.localStorage.getItem(PRINT_JOBS_STORAGE_KEY);

  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue) as PrintJob[];
    return Array.isArray(parsedValue) ? parsedValue.map(normalizePrintJob) : [];
  } catch {
    window.localStorage.removeItem(PRINT_JOBS_STORAGE_KEY);
    return [];
  }
}

export function savePrintJobs(jobs: PrintJob[]) {
  const normalizedJobs = jobs.map(normalizePrintJob);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(PRINT_JOBS_STORAGE_KEY, JSON.stringify(normalizedJobs));
  }

  return normalizedJobs;
}

function prependPrintJobs(jobs: PrintJob[]) {
  return savePrintJobs([...jobs, ...getPrintJobs()]);
}

function replacePrintJob(jobId: string, replacement: PrintJob) {
  return savePrintJobs(
    getPrintJobs().map((job) => (job.id === jobId ? normalizePrintJob(replacement) : job))
  );
}

function getAdapterForPrinter(printer: PrinterRecord): PrinterAdapter {
  if (printer.connectionMode === "mock") {
    return printer.model === "Epson RT v.10 XML7"
      ? new MockFiscalPrinterAdapter(printer)
      : new MockPrinterAdapter(printer);
  }

  if (printer.model === "Epson RT v.10 XML7") {
    return new EpsonRtXmlPrinterAdapter(printer);
  }

  return new EscPosPrinterAdapter(printer);
}

function createFailedJobFromReason({
  role,
  printer,
  summary,
  items,
  reason,
  type,
  base,
}: {
  role: PrinterRole;
  printer: PrinterRecord | null;
  summary: string;
  items: PrintJobItem[];
  reason: string;
  type: PrintJobType;
  base: Partial<PrintJob>;
}) {
  const now = getNowIso();

  return normalizePrintJob({
    id: `print-job-${Date.now()}-${role}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    printerId: printer?.id ?? `missing-${role}`,
    printerName: printer?.name ?? `Stampante ${role} non configurata`,
    printerRole: printer?.role ?? role,
    printerModel: printer?.model ?? "ESC/POS",
    printerIpAddress: printer?.ipAddress ?? "",
    printerPort: printer?.port ?? null,
    connectionMode: printer?.connectionMode ?? "mock",
    status: "failed",
    createdAt: now,
    updatedAt: now,
    summary,
    items,
    errorMessage: reason,
    lastAttemptAt: now,
    attemptCount: 1,
    events: [createPrintEvent(reason)],
    ...base,
  });
}

function canUsePrinterForJob(
  printer: PrinterRecord,
  type: PrintJobType,
  configService: PrinterConfigService
) {
  const flags = configService.getFeatureFlags();

  if (!flags.printingEnabled) {
    return { ok: false, reason: "Stampa disabilitata dalle impostazioni generali" };
  }

  if (!printer.enabled) {
    return { ok: false, reason: `Stampante ${printer.name} disabilitata` };
  }

  if (printer.connectionMode === "real" && !flags.hardwarePrintingEnabled) {
    return {
      ok: false,
      reason: "Stampa hardware reale disabilitata dal feature flag",
    };
  }

  if (type === "fiscal-document" && !flags.fiscalPrintingEnabled && printer.connectionMode === "real") {
    return {
      ok: false,
      reason: "Stampa fiscale reale disabilitata dal feature flag",
    };
  }

  if (!printer.ipAddress.trim()) {
    return { ok: false, reason: `IP mancante per ${printer.name}` };
  }

  if (!printer.port || printer.port <= 0) {
    return { ok: false, reason: `Porta mancante per ${printer.name}` };
  }

  return { ok: true as const };
}

function getCourseDispatchWeight(course?: string) {
  const normalizedCourse = course?.trim().toUpperCase() ?? "";

  if (normalizedCourse === "PRIMA PORTATA") {
    return 1;
  }

  if (normalizedCourse === "SECONDA PORTATA") {
    return 2;
  }

  if (normalizedCourse === "TERZA PORTATA") {
    return 3;
  }

  return normalizedCourse ? 10 : 0;
}

export class PrinterRouter {
  private readonly configService = new PrinterConfigService();

  private findPrinterByNamePattern(pattern: RegExp, allowedRoles: PrinterRole[]) {
    const printers = this.configService.getPrinters().filter((printer) => printer.enabled);
    return (
      printers.find(
        (printer) =>
          allowedRoles.includes(printer.role) &&
          pattern.test(printer.name)
      ) ?? null
    );
  }

  groupOrderItemsByPrinterRole(items: OrderPrintSourceItem[], products: Product[]) {
    const groupedItems = new Map<PrinterRoutingTargetRole, PrintJobItem[]>();

    items.forEach((item) => {
      const printerRole = getPrinterRoleForOrderItem(item.productId, products);
      const product = resolveProductForOrderItem(item.productId, products);
      const nextItem: PrintJobItem = {
        id: item.id,
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        guestCode: item.commensaleCode ?? null,
        course: item.course,
        note: item.note,
        category: product?.category,
        printerRole,
      };

      const currentItems = groupedItems.get(printerRole) ?? [];
      groupedItems.set(printerRole, [...currentItems, nextItem]);
    });

    return groupedItems;
  }

  groupOrderItemsForKitchenPrint(items: OrderPrintSourceItem[], products: Product[]) {
    const groupedItems = new Map<
      string,
      {
        station: ProductionStation;
        printerRole: PrinterRoutingTargetRole;
        course: string;
        items: PrintJobItem[];
      }
    >();

    items.forEach((item) => {
      const printerRole = getPrinterRoleForOrderItem(item.productId, products);
      const productionStation =
        printerRole === "bar"
          ? ("BAR" as ProductionStation)
          : getProductionStationForOrderItem(item.productId, products);
      const resolvedPrinterRole =
        printerRole === "bar"
          ? ("bar" as PrinterRoutingTargetRole)
          : getPrinterRoleForProductionStation(productionStation);
      const product = resolveProductForOrderItem(item.productId, products);
      const shouldKeepGuest = shouldKeepGuestCodeForOrderItem(item.productId, products);
      const course = item.course?.trim() ?? "";
      const groupKey = `${productionStation}::${course}`;
      const currentGroup = groupedItems.get(groupKey) ?? {
        station: productionStation,
        printerRole: resolvedPrinterRole,
        course,
        items: [],
      };

      currentGroup.items.push({
        id: item.id,
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        guestCode: shouldKeepGuest ? item.commensaleCode ?? null : null,
        course: item.course,
        note: item.note,
        category: product?.category,
        printerRole: resolvedPrinterRole,
        productionStation,
      });

      groupedItems.set(groupKey, currentGroup);
    });

    return Array.from(groupedItems.values()).sort((left, right) => {
      const courseWeightDifference =
        getCourseDispatchWeight(left.course) - getCourseDispatchWeight(right.course);

      if (courseWeightDifference !== 0) {
        return courseWeightDifference;
      }

      return left.station.localeCompare(right.station, "it");
    });
  }

  resolvePrinter(role: PrinterRoutingTargetRole | "fiscal") {
    const printers = this.configService.getPrinters();
    return printers.find((printer) => printer.role === role && printer.enabled) ?? null;
  }

  resolveBarOperationalPrinter() {
    return this.resolvePrinter("bar");
  }

  resolvePrinterForProductionStation(station: ProductionStation, role: PrinterRoutingTargetRole) {
    if (station === "BAR") {
      return this.resolvePrinter("bar");
    }

    if (station === "FREDDO") {
      return (
        this.findPrinterByNamePattern(/(freddo|sushi|crudo|cold)/i, ["kitchen", "generic"]) ??
        this.resolvePrinter("kitchen") ??
        this.resolvePrinter("generic")
      );
    }

    if (station === "CALDO") {
      return (
        this.findPrinterByNamePattern(/(caldo|cucina|hot|kitchen)/i, ["kitchen", "generic"]) ??
        this.resolvePrinter("kitchen") ??
        this.resolvePrinter("generic")
      );
    }

    return this.resolvePrinter(role);
  }
}

export class PrintJobService {
  private readonly router = new PrinterRouter();
  private readonly configService = new PrinterConfigService();

  private createPendingJob(
    printer: PrinterRecord,
    type: PrintJobType,
    summary: string,
    items: PrintJobItem[],
    base: Partial<PrintJob>
  ) {
    const now = getNowIso();

    return normalizePrintJob({
      id: `print-job-${Date.now()}-${printer.role}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      printerId: printer.id,
      printerName: printer.name,
      printerRole: printer.role,
      printerModel: printer.model,
      printerIpAddress: printer.ipAddress,
      printerPort: printer.port,
      connectionMode: printer.connectionMode,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      summary,
      items,
      events: [createPrintEvent(`Job creato per ${printer.name}`)],
      attemptCount: 1,
      lastAttemptAt: now,
      ...base,
    });
  }

  private async dispatchWithAdapter(job: PrintJob, printer: PrinterRecord) {
    const validation = canUsePrinterForJob(printer, job.type, this.configService);

    if (!validation.ok) {
      const failedJob = normalizePrintJob({
        ...job,
        status: "failed",
        updatedAt: getNowIso(),
        errorMessage: validation.reason,
        events: [...job.events, createPrintEvent(validation.reason)],
      });

      if (job.type === "fiscal-document") {
        appendFiscalPrinterLog({
          operator: job.operator ?? "",
          tableId: job.tableId,
          tableLabel: job.tableLabel,
          amount: job.total,
          paymentMethod: job.paymentMethod,
          printerId: printer.id,
          printerName: printer.name,
          printerIpAddress: printer.ipAddress,
          printerPort: printer.port,
          mode: printer.connectionMode,
          outcome: "failed",
          errorMessage: validation.reason,
          payloadSummary: job.summary,
        });
      }

      return failedJob;
    }

    const result = await getAdapterForPrinter(printer).send(job);

    if (job.type === "fiscal-document") {
      appendFiscalPrinterLog({
        operator: job.operator ?? "",
        tableId: job.tableId,
        tableLabel: job.tableLabel,
        amount: job.total,
        paymentMethod: job.paymentMethod,
        printerId: printer.id,
        printerName: printer.name,
        printerIpAddress: printer.ipAddress,
        printerPort: printer.port,
        mode: printer.connectionMode,
        outcome:
          result.status === "failed"
            ? "failed"
            : result.status === "simulated"
              ? "simulated"
              : "success",
        errorMessage: result.errorMessage ?? "",
        payloadSummary: job.summary,
      });
    }

    return result;
  }

  private async dispatchDepartmentPrintJobs(input: DepartmentPrintDispatchInput) {
    await syncSharedPrintingConfig();
    const commandSettingsSnapshot =
      input.type === "order" ? getOrderCommandSettings() : undefined;

    const groupedDispatches =
      input.type === "order"
        ? this.router.groupOrderItemsForKitchenPrint(input.items, input.products).map((group) => ({
            role: group.printerRole,
            course: group.course,
            items: group.items,
            station: group.station,
          }))
        : Array.from(this.router.groupOrderItemsByPrinterRole(input.items, input.products).entries()).map(
            ([role, items]) => ({
              role,
              course: "",
              items,
              station: role === "bar" ? ("BAR" as ProductionStation) : ("GENERIC" as ProductionStation),
            })
          );

    const jobs = await Promise.all(groupedDispatches.map(async ({ role, course, items, station }) => {
      const printer =
        input.type === "order"
          ? this.router.resolvePrinterForProductionStation(station, role)
          : this.router.resolvePrinter(role);
      const stationLabel = input.type === "order" && station !== "GENERIC" ? ` · ${station}` : "";
      const summary = `${input.summaryPrefix} ${input.tableLabel}${
        course ? ` · ${course}` : ""
      }${stationLabel} verso ${printer?.name ?? role}`;

      if (!printer) {
        return createFailedJobFromReason({
          role,
          printer: null,
          summary,
          items,
          reason:
            input.type === "order"
              ? `Nessuna stampante configurata per la stazione ${station}`
              : `Nessuna stampante configurata per il reparto ${role}`,
          type: input.type,
          base: {
            tableId: input.tableId,
            tableLabel: input.tableLabel,
            roomLabel: input.roomLabel,
            operator: input.operator,
          },
        });
      }

      const pendingJob = this.createPendingJob(printer, input.type, summary, items, {
        tableId: input.tableId,
        tableLabel: input.tableLabel,
        roomLabel: input.roomLabel,
        operator: input.operator,
        commandNumber: input.commandNumber,
        guests: input.guests,
        customerLabel: input.customerLabel,
        companyLabel: input.companyLabel,
        commandSettingsSnapshot,
      });

      return this.dispatchWithAdapter(pendingJob, printer);
    }));

    prependPrintJobs(jobs);
    return jobs;
  }

  async dispatchOrderPrintJobs(input: OrderPrintDispatchInput) {
    const commandNumber = input.commandNumber ?? reserveNextOrderCommandNumber().label;
    const jobs = await this.dispatchDepartmentPrintJobs({
      ...input,
      commandNumber,
      type: "order",
      summaryPrefix: "Comanda",
    });

    void persistOrderTransmissionsToServer({
      tableId: input.tableId,
      operator: input.operator,
      operatorId: input.operatorId ?? null,
      deviceMode: input.deviceMode,
      commandNumber,
      transmissionType: input.transmissionType ?? "order",
      jobs,
    });

    return jobs;
  }

  async dispatchVoidPrintJobs(input: Omit<DepartmentPrintDispatchInput, "type" | "summaryPrefix">) {
    return this.dispatchDepartmentPrintJobs({
      ...input,
      type: "void",
      summaryPrefix: "STORNO",
    });
  }

  async dispatchTaggedDepartmentPrintJobs(input: TaggedDepartmentPrintDispatchInput) {
    await syncSharedPrintingConfig();
    const groupedItems = new Map<PrinterRoutingTargetRole, PrintJobItem[]>();
    const commandSettingsSnapshot =
      input.type === "order" ? getOrderCommandSettings() : undefined;

    input.items.forEach((item) => {
      const printerRole = getPrinterRoleForDepartment(item.department);
      const nextItem: PrintJobItem = {
        id: item.id,
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        guestCode: item.guestCode ?? null,
        course: item.course,
        note: item.note,
        category: item.category,
        printerRole,
      };

      const currentItems = groupedItems.get(printerRole) ?? [];
      groupedItems.set(printerRole, [...currentItems, nextItem]);
    });

    const jobs = await Promise.all(Array.from(groupedItems.entries()).map(async ([role, items]) => {
      const printer = this.router.resolvePrinter(role);
      const summary = `${input.summaryPrefix} ${input.tableLabel} verso ${printer?.name ?? role}`;

      if (!printer) {
        return createFailedJobFromReason({
          role,
          printer: null,
          summary,
          items,
          reason: `Nessuna stampante configurata per il reparto ${role}`,
          type: input.type,
          base: {
            tableId: input.tableId,
            tableLabel: input.tableLabel,
            roomLabel: input.roomLabel,
            operator: input.operator,
          },
        });
      }

      const pendingJob = this.createPendingJob(printer, input.type, summary, items, {
        tableId: input.tableId,
        tableLabel: input.tableLabel,
        roomLabel: input.roomLabel,
        operator: input.operator,
        guests: input.guests,
        customerLabel: input.customerLabel,
        companyLabel: input.companyLabel,
        commandNumber: input.commandNumber,
        commandSettingsSnapshot,
      });

      return this.dispatchWithAdapter(pendingJob, printer);
    }));

    prependPrintJobs(jobs);
    return jobs;
  }

  async dispatchPrebillPrintJob(input: PrebillPrintDispatchInput) {
    await syncSharedPrintingConfig();
    const printer = this.router.resolveBarOperationalPrinter();
    const summary = `PRECONTO - NON FISCALE ${input.tableLabel} verso ${printer?.name ?? "stampante BAR non configurata"}`;
    const items = input.items.map((item) => {
      const product = resolveProductForOrderItem(item.productId, input.products);

      return {
        id: item.id,
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        guestCode: item.commensaleCode ?? null,
        course: item.course,
        note: item.note,
        category: product?.category,
        printerRole: "bar",
        productionStation: "BAR",
      } satisfies PrintJobItem;
    });

    if (!printer) {
      const failedJob = createFailedJobFromReason({
        role: "bar",
        printer: null,
        summary,
        items,
        reason: "Nessuna stampante BAR configurata per il preconto",
        type: "prebill",
        base: {
          tableId: input.tableId,
          tableLabel: input.tableLabel,
          roomLabel: input.roomLabel,
          operator: input.operator,
          subtotal: input.subtotal,
          discountLabel: input.discountLabel,
          total: input.total,
        },
      });
      prependPrintJobs([failedJob]);
      return [failedJob];
    }

    const pendingJob = this.createPendingJob(printer, "prebill", summary, items, {
      tableId: input.tableId,
      tableLabel: input.tableLabel,
      roomLabel: input.roomLabel,
      operator: input.operator,
      subtotal: input.subtotal,
      discountLabel: input.discountLabel,
      total: input.total,
      summary,
    });
    const result = await this.dispatchWithAdapter(pendingJob, printer);
    prependPrintJobs([result]);
    return [result];
  }

  async dispatchTableMovePrintJob(input: TableMovePrintDispatchInput) {
    await syncSharedPrintingConfig();
    const printer = this.router.resolveBarOperationalPrinter();
    const summary = `SPOSTAMENTO TAVOLO ${input.sourceTableLabel} -> ${input.destinationTableLabel} verso ${printer?.name ?? "stampante BAR non configurata"}`;
    const items: PrintJobItem[] = (input.items ?? []).map((item) => ({
      id: item.id,
      productId: item.productId ?? item.id,
      name: item.name,
      quantity: item.quantity,
      note: item.note,
      course: item.course,
      printerRole: "bar",
      productionStation: "BAR",
    }));

    if (!printer) {
      const failedJob = createFailedJobFromReason({
        role: "bar",
        printer: null,
        summary,
        items,
        reason: "Nessuna stampante BAR configurata per lo spostamento tavolo",
        type: "table-move",
        base: {
          tableLabel: input.sourceTableLabel,
          sourceTableLabel: input.sourceTableLabel,
          destinationTableLabel: input.destinationTableLabel,
          roomLabel: input.sourceRoomLabel,
          destinationRoomLabel: input.destinationRoomLabel,
          operator: input.operator,
          total: input.total,
        },
      });
      prependPrintJobs([failedJob]);
      return [failedJob];
    }

    const pendingJob = this.createPendingJob(printer, "table-move", summary, items, {
      tableLabel: input.sourceTableLabel,
      sourceTableLabel: input.sourceTableLabel,
      destinationTableLabel: input.destinationTableLabel,
      roomLabel: input.sourceRoomLabel,
      destinationRoomLabel: input.destinationRoomLabel,
      operator: input.operator,
      total: input.total,
    });
    const result = await this.dispatchWithAdapter(pendingJob, printer);
    prependPrintJobs([result]);
    return [result];
  }

  async dispatchFiscalPrintJob(input: FiscalPrintDispatchInput) {
    await syncSharedPrintingConfig();
    const printer = this.router.resolvePrinter("fiscal");
    const summary = `${input.documentType} ${input.tableLabel} verso ${printer?.name ?? "Fiscale"}`;
    const items = input.items.map((item) => {
      const product = resolveProductForOrderItem(item.productId, input.products);

      return {
        id: item.id,
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        guestCode: item.commensaleCode ?? null,
        course: item.course,
        note: item.note,
        category: product?.category,
        printerRole: "fiscal",
      } satisfies PrintJobItem;
    });

    if (!printer) {
      const failedJob = createFailedJobFromReason({
        role: "fiscal",
        printer: null,
        summary,
        items,
        reason: "Nessuna stampante fiscale configurata",
        type: "fiscal-document",
        base: {
          tableId: input.tableId,
          tableLabel: input.tableLabel,
          roomLabel: input.roomLabel,
          operator: input.operator,
          documentType: input.documentType,
          paymentMethod: input.paymentMethod,
          total: input.total,
        },
      });
      appendFiscalPrinterLog({
        operator: input.operator,
        tableId: input.tableId,
        tableLabel: input.tableLabel,
        amount: input.total,
        paymentMethod: input.paymentMethod,
        printerId: "missing-fiscal",
        printerName: "Stampante fiscale non configurata",
        printerIpAddress: "",
        printerPort: null,
        mode: "mock",
        outcome: "failed",
        errorMessage: "Nessuna stampante fiscale configurata",
        payloadSummary: summary,
      });
      prependPrintJobs([failedJob]);
      return [failedJob];
    }

    const pendingJob = this.createPendingJob(printer, "fiscal-document", summary, items, {
      tableId: input.tableId,
      tableLabel: input.tableLabel,
      roomLabel: input.roomLabel,
      operator: input.operator,
      documentType: input.documentType,
      paymentMethod: input.paymentMethod,
      total: input.total,
    });

    const result = await this.dispatchWithAdapter(pendingJob, printer);
    prependPrintJobs([result]);
    return [result];
  }

  async testConnection(printerId: string, mode: "connection" | "print" = "connection") {
    const printer = this.configService.getPrinterById(printerId);

    if (!printer) {
      return null;
    }

    if (mode === "print" && printer.model === "ESC/POS") {
      const pendingJob = this.createPendingJob(printer, "test-print", `Test stampa ${printer.name}`, [], {
        summary: `Test stampa ${printer.name}`,
      });
      const finalizedJob = await this.dispatchWithAdapter(pendingJob, printer);
      prependPrintJobs([finalizedJob]);

      const now = getNowIso();
      const connectionResult = {
        ok: finalizedJob.status !== "failed",
        status:
          finalizedJob.status === "failed"
            ? ("error" as const)
            : ("online" as const),
        lastSeenAt: finalizedJob.status === "failed" ? printer.lastSeenAt ?? null : now,
        lastTestedAt: now,
        lastConnectionResult:
          finalizedJob.status === "failed" ? ("failed" as const) : ("success" as const),
        message: finalizedJob.errorMessage || finalizedJob.events.at(-1)?.message || "Test stampa completato",
        printed: finalizedJob.status !== "failed",
      };

      this.configService.updatePrinter(printerId, (currentPrinter) => ({
        ...currentPrinter,
        status: connectionResult.status,
        lastSeenAt: connectionResult.lastSeenAt,
        lastTestedAt: connectionResult.lastTestedAt,
        lastConnectionResult: connectionResult.lastConnectionResult,
        lastErrorMessage: connectionResult.ok ? "" : connectionResult.message,
      }));

      return {
        printer: this.configService.getPrinterById(printerId),
        job: finalizedJob,
        result: connectionResult,
      };
    }

    const adapter = getAdapterForPrinter(printer);
    const connectionResult = await adapter.testConnection(mode);

    this.configService.updatePrinter(printerId, (currentPrinter) => ({
      ...currentPrinter,
      status: connectionResult.status,
      lastSeenAt: connectionResult.lastSeenAt,
      lastTestedAt: connectionResult.lastTestedAt,
      lastConnectionResult: connectionResult.lastConnectionResult,
      lastErrorMessage: connectionResult.ok ? "" : connectionResult.message,
    }));

    const job = this.createPendingJob(
      {
        ...printer,
        status: connectionResult.status,
      },
      "connection-test",
      mode === "print" ? `Test stampa ${printer.name}` : `Test connessione ${printer.name}`,
      [],
      {}
    );

    const finalizedJob = normalizePrintJob({
      ...job,
      type: mode === "print" ? "test-print" : "connection-test",
      status: connectionResult.ok ? (printer.connectionMode === "mock" ? "simulated" : "sent") : "failed",
      updatedAt: getNowIso(),
      errorMessage: connectionResult.ok ? "" : connectionResult.message,
      events: [...job.events, createPrintEvent(connectionResult.message)],
    });

    if (printer.role === "fiscal") {
      appendFiscalPrinterLog({
        operator: "",
        printerId: printer.id,
        printerName: printer.name,
        printerIpAddress: printer.ipAddress,
        printerPort: printer.port,
        mode: printer.connectionMode,
        outcome: "connection-test",
        errorMessage: connectionResult.ok ? "" : connectionResult.message,
        payloadSummary: connectionResult.message,
      });
    }

    prependPrintJobs([finalizedJob]);
    return {
      printer: this.configService.getPrinterById(printerId),
      job: finalizedJob,
      result: connectionResult,
    };
  }

  async retryPrintJob(jobId: string) {
    const existingJob = getPrintJobs().find((job) => job.id === jobId);

    if (!existingJob) {
      return null;
    }

    const printer = this.configService.getPrinterById(existingJob.printerId);

    if (!printer) {
      const failedRetry = normalizePrintJob({
        ...existingJob,
        updatedAt: getNowIso(),
        status: "failed",
        errorMessage: "Stampante non più disponibile per il retry",
        attemptCount: existingJob.attemptCount + 1,
        lastAttemptAt: getNowIso(),
        events: [
          ...existingJob.events,
          createPrintEvent("Retry fallito: stampante non più disponibile"),
        ],
      });
      replacePrintJob(jobId, failedRetry);
      return failedRetry;
    }

    const pendingRetry = normalizePrintJob({
      ...existingJob,
      status: "pending",
      updatedAt: getNowIso(),
      errorMessage: "",
      attemptCount: existingJob.attemptCount + 1,
      lastAttemptAt: getNowIso(),
      events: [...existingJob.events, createPrintEvent(`Retry manuale avviato su ${printer.name}`)],
    });
    const result = await this.dispatchWithAdapter(pendingRetry, printer);
    replacePrintJob(jobId, result);
    return result;
  }

  cancelPrintJob(jobId: string) {
    const existingJob = getPrintJobs().find((job) => job.id === jobId);

    if (!existingJob) {
      return null;
    }

    const cancelledJob = normalizePrintJob({
      ...existingJob,
      status: "cancelled",
      updatedAt: getNowIso(),
      events: [...existingJob.events, createPrintEvent("Job annullato manualmente")],
    });
    replacePrintJob(jobId, cancelledJob);
    return cancelledJob;
  }
}

export function getLastPrintJobs(limit = 8) {
  return getPrintJobs()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

export function getLastJobForPrinter(printerId: string) {
  return (
    getPrintJobs()
      .filter((job) => job.printerId === printerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
  );
}
