"use client";

import { useEffect, useMemo, useState } from "react";

import { getProductCategories, type ProductCategory } from "@/lib/pos-data";
import {
  PrinterConfigService,
  type PrintingFeatureFlags,
} from "@/lib/printer-config-service";
import {
  getLastPrintJobs,
  PrintJobService,
  type PrintJob,
} from "@/lib/print-job-service";
import { pushSharedPrintingConfig } from "@/lib/shared-printing-config";
import {
  getPrinterRoutingRules,
  savePrinterRoutingRules,
  type PrinterRoutingRule,
  type PrinterRoutingTargetRole,
} from "@/lib/printer-routing";
import {
  type PrinterConnectionMode,
  type PrinterModel,
  type PrinterRecord,
  type PrinterRole,
  type PrinterStatus,
} from "@/lib/printer-settings";

type PrinterModalState =
  | { mode: "create"; printer: PrinterRecord }
  | { mode: "edit"; printer: PrinterRecord };

type PrinterFieldErrors = Partial<
  Record<"name" | "model" | "ipAddress" | "port" | "timeoutMs" | "paperColumns", string>
>;

const printerModels: PrinterModel[] = ["ESC/POS", "Epson RT v.10 XML7"];
const printerRoles: PrinterRole[] = ["fiscal", "bar", "kitchen", "generic"];
const connectionModes: PrinterConnectionMode[] = ["mock", "real"];
const configurableRoutingRoles: PrinterRoutingTargetRole[] = ["bar", "kitchen", "generic"];
const defaultFeatureFlags: PrintingFeatureFlags = {
  printingEnabled: true,
  hardwarePrintingEnabled: false,
  fiscalPrintingEnabled: false,
  updatedAt: "",
};

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M4 20h4l10-10-4-4L4 16v4Z" />
      <path d="m12 6 4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 12h10l1-12" />
      <path d="M9 7V4h6v3" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function slugify(value: string) {
  return normalizeSearchValue(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isValidIpAddress(value: string) {
  const octets = value.trim().split(".");

  if (octets.length !== 4) {
    return false;
  }

  return octets.every((octet) => {
    if (!/^\d+$/.test(octet)) {
      return false;
    }

    const numericOctet = Number(octet);
    return numericOctet >= 0 && numericOctet <= 255;
  });
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Mai";
  }

  return new Date(value).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createEmptyPrinter(nextIndex: number): PrinterRecord {
  const now = new Date().toISOString();

  return {
    id: `printer-${nextIndex}-${Date.now()}`,
    name: "",
    model: "ESC/POS",
    ipAddress: "",
    port: 9100,
    timeoutMs: 5000,
    paperColumns: 42,
    role: "generic",
    enabled: true,
    connectionMode: "mock",
    status: "configured",
    lastSeenAt: null,
    lastTestedAt: null,
    lastConnectionResult: "never",
    lastErrorMessage: "",
    fiscalDeviceId: "",
    createdAt: now,
    updatedAt: now,
  };
}

function getRoleLabel(role: PrinterRole) {
  switch (role) {
    case "fiscal":
      return "Fiscale RT";
    case "bar":
      return "Bar";
    case "kitchen":
      return "Cucina";
    default:
      return "Generica";
  }
}

function getRoutingRoleLabel(role: PrinterRoutingTargetRole) {
  switch (role) {
    case "bar":
      return "Bar";
    case "kitchen":
      return "Cucina";
    default:
      return "Generica";
  }
}

function getConnectionModeLabel(mode: PrinterConnectionMode) {
  return mode === "mock" ? "Mock" : "Reale";
}

function getStatusLabel(status: PrinterStatus) {
  switch (status) {
    case "online":
      return "Online";
    case "offline":
      return "Offline";
    case "error":
      return "Errore";
    default:
      return "Configurata";
  }
}

function getJobStatusLabel(status: PrintJob["status"]) {
  switch (status) {
    case "pending":
      return "In coda";
    case "simulated":
      return "Simulato";
    case "sent":
      return "Inviato";
    case "cancelled":
      return "Annullato";
    default:
      return "Fallito";
  }
}

function Badge({
  label,
  tone,
}: {
  label: string;
  tone: "neutral" | "success" | "warning" | "info" | "danger";
}) {
  const toneClassName =
    tone === "success"
      ? "border-[#b8d8bf] bg-[#edf8ef] text-[#25603a]"
      : tone === "warning"
        ? "border-[#e4d6a8] bg-[#fcf7e6] text-[#7a5b08]"
        : tone === "danger"
          ? "border-[#e6c1c1] bg-[#fff2f2] text-[#983939]"
          : tone === "info"
            ? "border-[#bcd5ea] bg-[#eef6ff] text-[#0b3c5d]"
            : "border-[#d8d5cc] bg-[#fffefb] text-[#5f5952]";

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneClassName}`}>
      {label}
    </span>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-[6px] border border-[#f7f4ee] bg-[#ffffff] px-3 py-3">
      <div>
        <div className="text-sm font-medium text-[#2e2a25]">{label}</div>
        <div className="mt-1 text-xs text-[#6a645b]">{description}</div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-[#0b3c5d]"
      />
    </label>
  );
}

export function PrinterSettingsView() {
  const configService = useMemo(() => new PrinterConfigService(), []);
  const printJobService = useMemo(() => new PrintJobService(), []);

  const [hasHydrated, setHasHydrated] = useState(false);
  const [printers, setPrinters] = useState<PrinterRecord[]>([]);
  const [featureFlags, setFeatureFlags] = useState<PrintingFeatureFlags>(defaultFeatureFlags);
  const [routingRules, setRoutingRules] = useState<PrinterRoutingRule[]>([]);
  const [printJobs, setPrintJobs] = useState<PrintJob[]>([]);
  const [searchValue, setSearchValue] = useState("");
  const [modalState, setModalState] = useState<PrinterModalState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PrinterRecord | null>(null);
  const [fieldErrors, setFieldErrors] = useState<PrinterFieldErrors>({});
  const [statusMessage, setStatusMessage] = useState("");
  const [busyPrinterId, setBusyPrinterId] = useState<string | null>(null);
  const [busyPrintTestPrinterId, setBusyPrintTestPrinterId] = useState<string | null>(null);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);

  useEffect(() => {
    setPrinters(configService.getPrinters());
    setFeatureFlags(configService.getFeatureFlags());
    setRoutingRules(getPrinterRoutingRules());
    setPrintJobs(getLastPrintJobs(12));
    setHasHydrated(true);
  }, [configService]);

  const refreshState = () => {
    setPrinters(configService.getPrinters());
    setFeatureFlags(configService.getFeatureFlags());
    setRoutingRules(getPrinterRoutingRules());
    setPrintJobs(getLastPrintJobs(12));
  };

  const syncSharedPrintingState = () => {
    void pushSharedPrintingConfig();
  };

  const filteredPrinters = useMemo(() => {
    const normalizedSearch = normalizeSearchValue(searchValue);

    return [...printers]
      .filter((printer) => {
        if (!normalizedSearch) {
          return true;
        }

        return [
          printer.name,
          printer.model,
          printer.ipAddress,
          getRoleLabel(printer.role),
          getConnectionModeLabel(printer.connectionMode),
          getStatusLabel(printer.status),
        ].some((value) => normalizeSearchValue(value).includes(normalizedSearch));
      })
      .sort((left, right) => left.name.localeCompare(right.name, "it"));
  }, [printers, searchValue]);

  const routingSummary = useMemo(
    () => ({
      bar: routingRules.filter((rule) => rule.printerRole === "bar"),
      kitchen: routingRules.filter((rule) => rule.printerRole === "kitchen"),
      generic: routingRules.filter((rule) => rule.printerRole === "generic"),
    }),
    [routingRules]
  );
  const categoryOptions = useMemo(
    () => [...getProductCategories()].sort((left, right) => left.localeCompare(right, "it")),
    []
  );
  const getLastJobForPrinterFromState = (printerId: string) =>
    printJobs
      .filter((job) => job.printerId === printerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;

  const openCreateModal = () => {
    setFieldErrors({});
    setModalState({
      mode: "create",
      printer: createEmptyPrinter(printers.length + 1),
    });
  };

  const openEditModal = (printer: PrinterRecord) => {
    setFieldErrors({});
    setModalState({
      mode: "edit",
      printer: { ...printer },
    });
  };

  const closeModal = () => {
    setFieldErrors({});
    setModalState(null);
  };

  const updateModalPrinter = <Key extends keyof PrinterRecord>(
    field: Key,
    value: PrinterRecord[Key]
  ) => {
    setModalState((currentState) =>
      currentState
        ? {
            ...currentState,
            printer: {
              ...currentState.printer,
              [field]: value,
            },
          }
        : currentState
    );
  };

  const validatePrinter = (printer: PrinterRecord) => {
    const nextErrors: PrinterFieldErrors = {};

    if (!printer.name.trim()) {
      nextErrors.name = "Inserisci la descrizione.";
    }

    if (!printer.model) {
      nextErrors.model = "Seleziona il modello.";
    }

    if (!printer.ipAddress.trim()) {
      nextErrors.ipAddress = "Inserisci l'indirizzo IP.";
    } else if (!isValidIpAddress(printer.ipAddress)) {
      nextErrors.ipAddress = "Inserisci un indirizzo IP valido.";
    }

    if (!printer.port || Number(printer.port) <= 0) {
      nextErrors.port = "Inserisci una porta valida.";
    }

    if (!printer.timeoutMs || Number(printer.timeoutMs) <= 0) {
      nextErrors.timeoutMs = "Inserisci un timeout valido.";
    }

    if (printer.model === "ESC/POS" && (!printer.paperColumns || Number(printer.paperColumns) <= 0)) {
      nextErrors.paperColumns = "Inserisci un numero di colonne valido.";
    }

    return nextErrors;
  };

  const handleSavePrinter = () => {
    if (!modalState) {
      return;
    }

    const validationErrors = validatePrinter(modalState.printer);

    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      return;
    }

    const trimmedName = modalState.printer.name.trim();
    const now = new Date().toISOString();
    const printerToSave: PrinterRecord = {
      ...modalState.printer,
      id:
        modalState.mode === "create"
          ? `printer-${slugify(trimmedName) || Date.now().toString()}`
          : modalState.printer.id,
      name: trimmedName,
      ipAddress: modalState.printer.ipAddress.trim(),
      port: Number(modalState.printer.port ?? 9100),
      timeoutMs: Number(modalState.printer.timeoutMs ?? 5000),
      paperColumns:
        modalState.printer.model === "ESC/POS"
          ? Number(modalState.printer.paperColumns ?? 42)
          : null,
      createdAt: modalState.mode === "create" ? now : modalState.printer.createdAt,
      updatedAt: now,
      lastErrorMessage: modalState.printer.lastErrorMessage ?? "",
      fiscalDeviceId:
        modalState.printer.model === "Epson RT v.10 XML7"
          ? modalState.printer.fiscalDeviceId?.trim() ?? ""
          : "",
    };

    const nextPrinters =
      modalState.mode === "create"
        ? [...printers, printerToSave]
        : printers.map((printer) => (printer.id === printerToSave.id ? printerToSave : printer));

    setPrinters(configService.savePrinters(nextPrinters));
    syncSharedPrintingState();
    setStatusMessage(
      modalState.mode === "create" ? "Stampante aggiunta" : "Stampante aggiornata"
    );
    closeModal();
  };

  const confirmDelete = () => {
    if (!deleteTarget) {
      return;
    }

    setPrinters(configService.savePrinters(printers.filter((printer) => printer.id !== deleteTarget.id)));
    syncSharedPrintingState();
    setStatusMessage("Stampante eliminata");
    setDeleteTarget(null);
  };

  const handleFeatureFlagChange = (
    field: keyof Omit<PrintingFeatureFlags, "updatedAt">,
    value: boolean
  ) => {
    const nextFlags = configService.updateFeatureFlags((currentFlags) => ({
      ...currentFlags,
      [field]: value,
    }));
    setFeatureFlags(nextFlags);
    syncSharedPrintingState();
    setStatusMessage("Configurazione stampa aggiornata");
  };

  const handleQuickPrinterToggle = (
    printerId: string,
    field: "enabled" | "connectionMode",
    value: boolean | PrinterConnectionMode
  ) => {
    configService.updatePrinter(printerId, (printer) => ({
      ...printer,
      [field]: value,
      status:
        field === "connectionMode" && value === "mock"
          ? "configured"
          : printer.status,
      lastErrorMessage:
        field === "connectionMode" && value === "mock" ? "" : printer.lastErrorMessage,
    }));
    refreshState();
    syncSharedPrintingState();
    setStatusMessage("Impostazioni stampante aggiornate");
  };

  const handleTestConnection = async (printerId: string) => {
    setBusyPrinterId(printerId);
    const result = await printJobService.testConnection(printerId);
    refreshState();
    setBusyPrinterId(null);
    setStatusMessage(
      result?.result.ok
        ? `Test connessione completato per ${result.printer?.name ?? "stampante"}`
        : result?.result.message ?? "Test connessione fallito"
    );
  };

  const handleTestPrint = async (printerId: string) => {
    setBusyPrintTestPrinterId(printerId);
    const result = await printJobService.testConnection(printerId, "print");
    refreshState();
    setBusyPrintTestPrinterId(null);
    setStatusMessage(
      result?.result.ok
        ? result?.result.printed
          ? `Test stampa riuscito per ${result.printer?.name ?? "stampante"}`
          : result?.result.message ?? "Test completato"
        : result?.result.message ?? "Test stampa fallito"
    );
  };

  const handleRetryJob = async (jobId: string) => {
    setRetryingJobId(jobId);
    const result = await printJobService.retryPrintJob(jobId);
    refreshState();
    setRetryingJobId(null);
    setStatusMessage(result?.status === "failed" ? result.errorMessage || "Retry fallito" : "Retry eseguito");
  };

  const handleRoutingRoleChange = (
    category: ProductCategory,
    printerRole: PrinterRoutingTargetRole
  ) => {
    const now = new Date().toISOString();
    const nextRules = routingRules.map((rule) =>
      rule.category === category ? { ...rule, printerRole, updatedAt: now } : rule
    );

    setRoutingRules(savePrinterRoutingRules(nextRules));
    syncSharedPrintingState();
    setStatusMessage(`Instradamento aggiornato per ${category}`);
  };

  if (!hasHydrated) {
    return (
      <section className="relative flex min-h-0 flex-1 flex-col overflow-auto bg-[#fffefb]">
        <div className="border-b border-[#d8d5cc] bg-[#f7f4ee] px-4 py-3">
          <h2 className="text-base font-bold text-[#2e2a25]">Stampanti</h2>
          <p className="mt-1 text-xs text-[#6a645b]">Caricamento configurazione stampanti…</p>
        </div>
      </section>
    );
  }

  return (
    <section className="relative flex min-h-0 flex-1 flex-col overflow-auto bg-[#fffefb]">
      <div className="border-b border-[#d8d5cc] bg-[#f7f4ee] px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[#2e2a25]">Stampanti</h2>
            <p className="mt-1 text-xs text-[#6a645b]">
              Gestione mock/reale, routing comande e monitoraggio job di stampa.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-10 items-center rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-[#6a645b]">
              <SearchIcon />
              <input
                type="text"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Cerca stampante"
                className="ml-2 h-full w-[240px] bg-transparent text-sm text-[#2e2a25] outline-none placeholder:text-[#9a948a]"
              />
            </div>
            <button
              type="button"
              onClick={openCreateModal}
              className="flex h-10 items-center gap-2 rounded-[4px] border border-[#b7cfe4] bg-[#cfe8ff] px-3 text-sm font-semibold text-[#0b3c5d]"
            >
              <PlusIcon />
              Nuova stampante
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        {statusMessage ? (
          <div className="rounded-[6px] border border-[#bcd5ea] bg-[#eef6ff] px-3 py-2 text-sm text-[#0b3c5d]">
            {statusMessage}
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-[8px] border border-[#d8d5cc] bg-white">
            <div className="border-b border-[#f7f4ee] px-4 py-3">
              <h3 className="text-sm font-semibold text-[#2e2a25]">Feature flag stampa</h3>
            </div>
            <div className="grid gap-3 p-4">
              <ToggleRow
                label="Printing enabled"
                description="Accende o spegne tutto il flusso di stampa senza toccare tavoli e pagamenti."
                checked={featureFlags.printingEnabled}
                onChange={(checked) => handleFeatureFlagChange("printingEnabled", checked)}
              />
              <ToggleRow
                label="Hardware printing enabled"
                description="Permette l’uso della modalità reale per stampanti di reparto."
                checked={featureFlags.hardwarePrintingEnabled}
                onChange={(checked) => handleFeatureFlagChange("hardwarePrintingEnabled", checked)}
              />
              <ToggleRow
                label="Fiscal printing enabled"
                description="Abilita la parte reale fiscale in modo separato e progressivo."
                checked={featureFlags.fiscalPrintingEnabled}
                onChange={(checked) => handleFeatureFlagChange("fiscalPrintingEnabled", checked)}
              />
            </div>
          </div>

          <div className="rounded-[8px] border border-[#d8d5cc] bg-white">
            <div className="border-b border-[#f7f4ee] px-4 py-3">
              <h3 className="text-sm font-semibold text-[#2e2a25]">Riepilogo routing</h3>
            </div>
            <div className="grid gap-3 p-4 text-sm text-[#2e2a25]">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Badge label="Bar" tone="info" />
                  <span className="text-xs text-[#6a645b]">{routingSummary.bar.length} categorie</span>
                </div>
                <p className="text-xs leading-5 text-[#5f5952]">
                  {routingSummary.bar.map((rule) => rule.category).join(", ")}
                </p>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Badge label="Cucina" tone="info" />
                  <span className="text-xs text-[#6a645b]">{routingSummary.kitchen.length} categorie</span>
                </div>
                <p className="text-xs leading-5 text-[#5f5952]">
                  {routingSummary.kitchen.map((rule) => rule.category).join(", ")}
                </p>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Badge label="Generica" tone="neutral" />
                  <span className="text-xs text-[#6a645b]">{routingSummary.generic.length} categorie</span>
                </div>
                <p className="text-xs leading-5 text-[#5f5952]">
                  {routingSummary.generic.map((rule) => rule.category).join(", ")}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-[8px] border border-[#d8d5cc] bg-white">
          <div className="grid grid-cols-[minmax(0,1.25fr)_140px_140px_170px_220px] items-center gap-3 border-b border-[#f7f4ee] bg-[#fcfaf6] px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#6a645b]">
            <span>Stampante</span>
            <span>Ruolo</span>
            <span>Modalità</span>
            <span>Stato</span>
            <span className="text-right">Azioni</span>
          </div>

          {filteredPrinters.map((printer) => {
            const lastJob = getLastJobForPrinterFromState(printer.id);
            return (
              <div
                key={printer.id}
                className="grid grid-cols-[minmax(0,1.25fr)_140px_140px_170px_220px] gap-3 border-b border-[#f0ede5] px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#2e2a25]">
                    <span>{printer.name}</span>
                    <Badge
                      label={printer.enabled ? "Attiva" : "Off"}
                      tone={printer.enabled ? "success" : "warning"}
                    />
                  </div>
                  <div className="mt-1 text-xs text-[#6a645b]">
                    {printer.model} · {printer.ipAddress}
                    {printer.port ? `:${printer.port}` : ""}
                    {printer.role === "fiscal" ? ` · timeout ${printer.timeoutMs} ms` : ""}
                    {printer.paperColumns ? ` · ${printer.paperColumns} colonne` : ""}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="text-xs text-[#6a645b]">
                      Ultimo test: {formatDateTime(printer.lastTestedAt)}
                    </span>
                    <span className="text-xs text-[#6a645b]">
                      Ultima presenza: {formatDateTime(printer.lastSeenAt)}
                    </span>
                  </div>
                  {printer.lastErrorMessage ? (
                    <div className="mt-2 text-xs text-[#983939]">{printer.lastErrorMessage}</div>
                  ) : null}
                  {lastJob ? (
                    <div className="mt-2 text-xs text-[#5f5952]">
                      Ultimo job: {getJobStatusLabel(lastJob.status)} · tentativi {lastJob.attemptCount}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-start pt-0.5">
                  <Badge label={getRoleLabel(printer.role)} tone="info" />
                </div>

                <div className="grid gap-2">
                  <div className="flex items-start pt-0.5">
                    <Badge
                      label={getConnectionModeLabel(printer.connectionMode)}
                      tone={printer.connectionMode === "real" ? "info" : "neutral"}
                    />
                  </div>
                  <label className="flex items-center justify-between rounded-[4px] border border-[#f7f4ee] bg-[#ffffff] px-2 py-2 text-xs text-[#4a4540]">
                    <span>Modalità reale</span>
                    <input
                      type="checkbox"
                      checked={printer.connectionMode === "real"}
                      onChange={(event) =>
                        handleQuickPrinterToggle(
                          printer.id,
                          "connectionMode",
                          event.target.checked ? "real" : "mock"
                        )
                      }
                      className="h-4 w-4 accent-[#0b3c5d]"
                    />
                  </label>
                </div>

                <div className="grid gap-2">
                  <Badge
                    label={getStatusLabel(printer.status)}
                    tone={
                      printer.status === "online"
                        ? "success"
                        : printer.status === "error"
                          ? "danger"
                          : printer.status === "offline"
                            ? "warning"
                            : "neutral"
                    }
                  />
                  <div className="text-xs text-[#6a645b]">
                    Esito:{" "}
                    {printer.lastConnectionResult === "success"
                      ? "positivo"
                      : printer.lastConnectionResult === "failed"
                        ? "negativo"
                        : "mai testata"}
                  </div>
                </div>

                <div className="flex flex-wrap items-start justify-end gap-2">
                  <label className="flex items-center gap-2 rounded-[4px] border border-[#f7f4ee] bg-[#ffffff] px-2.5 py-2 text-xs text-[#4a4540]">
                    <input
                      type="checkbox"
                      checked={printer.enabled}
                      onChange={(event) =>
                        handleQuickPrinterToggle(printer.id, "enabled", event.target.checked)
                      }
                      className="h-4 w-4 accent-[#0b3c5d]"
                    />
                    ON
                  </label>
                  <button
                    type="button"
                    onClick={() => handleTestConnection(printer.id)}
                    disabled={busyPrinterId === printer.id}
                    className="rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-2.5 py-2 text-xs font-semibold text-[#4a4540] disabled:opacity-60"
                  >
                    {busyPrinterId === printer.id ? "Test..." : "Test collegamento"}
                  </button>
                  {printer.model === "ESC/POS" ? (
                    <button
                      type="button"
                      onClick={() => handleTestPrint(printer.id)}
                      disabled={busyPrintTestPrinterId === printer.id}
                      className="rounded-[4px] border border-[#b7cfe4] bg-[#eef6ff] px-2.5 py-2 text-xs font-semibold text-[#0b3c5d] disabled:opacity-60"
                    >
                      {busyPrintTestPrinterId === printer.id ? "Stampa..." : "Test stampa"}
                    </button>
                  ) : null}
                  {lastJob?.status === "failed" ? (
                    <button
                      type="button"
                      onClick={() => handleRetryJob(lastJob.id)}
                      disabled={retryingJobId === lastJob.id}
                      className="rounded-[4px] border border-[#b7cfe4] bg-[#eef6ff] px-2.5 py-2 text-xs font-semibold text-[#0b3c5d] disabled:opacity-60"
                    >
                      {retryingJobId === lastJob.id ? "Retry..." : "Retry"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => openEditModal(printer)}
                    className="rounded-[4px] border border-[#d8d5cc] p-2 text-[#4a4540] transition hover:bg-[#f4f1ea]"
                    aria-label={`Modifica ${printer.name}`}
                  >
                    <PencilIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(printer)}
                    className="rounded-[4px] border border-[#e5c8c8] p-2 text-[#9a3d3d] transition hover:bg-[#fff5f5]"
                    aria-label={`Elimina ${printer.name}`}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="rounded-[8px] border border-[#d8d5cc] bg-white">
            <div className="border-b border-[#f7f4ee] px-4 py-3">
              <h3 className="text-sm font-semibold text-[#2e2a25]">Associazione categorie → stampante</h3>
            </div>
            <div className="max-h-[440px] overflow-auto">
              {categoryOptions.map((category) => {
                const rule = routingRules.find((currentRule) => currentRule.category === category);

                return (
                  <div
                    key={category}
                    className="grid grid-cols-[minmax(0,1fr)_160px] items-center gap-3 border-b border-[#f0ede5] px-4 py-3 text-sm last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-[#2e2a25]">{category}</div>
                      <div className="mt-1 text-xs text-[#6a645b]">
                        Destinazione: {getRoutingRoleLabel(rule?.printerRole ?? "generic")}
                      </div>
                    </div>
                    <select
                      value={rule?.printerRole ?? "generic"}
                      onChange={(event) =>
                        handleRoutingRoleChange(
                          category,
                          event.target.value as PrinterRoutingTargetRole
                        )
                      }
                      className="h-10 rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm text-[#2e2a25] outline-none"
                    >
                      {configurableRoutingRoles.map((role) => (
                        <option key={role} value={role}>
                          {getRoutingRoleLabel(role)}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-[8px] border border-[#d8d5cc] bg-white">
            <div className="border-b border-[#f7f4ee] px-4 py-3">
              <h3 className="text-sm font-semibold text-[#2e2a25]">Coda print job</h3>
              <p className="mt-1 text-xs text-[#6a645b]">
                Ultimi job con stato, tentativi e possibilità di retry manuale.
              </p>
            </div>
            <div className="max-h-[440px] overflow-auto">
              {printJobs.length === 0 ? (
                <div className="px-4 py-6 text-sm text-[#6a645b]">Nessun print job disponibile.</div>
              ) : (
                printJobs.map((job) => (
                  <div key={job.id} className="border-b border-[#f0ede5] px-4 py-3 last:border-b-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-[#2e2a25]">{job.summary}</div>
                        <div className="mt-1 text-xs text-[#6a645b]">
                          {job.printerName} · {formatDateTime(job.updatedAt)} · tentativi {job.attemptCount}
                        </div>
                      </div>
                      <Badge
                        label={getJobStatusLabel(job.status)}
                        tone={
                          job.status === "sent"
                            ? "success"
                            : job.status === "failed"
                              ? "danger"
                              : job.status === "simulated"
                                ? "info"
                                : "warning"
                        }
                      />
                    </div>
                    <div className="mt-2 text-xs leading-5 text-[#5f5952]">
                      {job.items.length > 0
                        ? job.items.map((item) => `${item.quantity}x ${item.name}`).join(", ")
                        : "Job tecnico / test connessione"}
                    </div>
                    {job.errorMessage ? (
                      <div className="mt-2 text-xs text-[#983939]">{job.errorMessage}</div>
                    ) : null}
                    {job.status === "failed" ? (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => handleRetryJob(job.id)}
                          disabled={retryingJobId === job.id}
                          className="rounded-[4px] border border-[#b7cfe4] bg-[#eef6ff] px-3 py-1.5 text-xs font-semibold text-[#0b3c5d] disabled:opacity-60"
                        >
                          {retryingJobId === job.id ? "Retry..." : "Ritenta"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {modalState ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#1f1a15]/35 px-4 py-6">
          <div className="w-full max-w-2xl rounded-[10px] border border-[#d8d5cc] bg-white shadow-[0_24px_60px_rgba(31,26,21,0.18)]">
            <div className="border-b border-[#f7f4ee] px-5 py-4">
              <h3 className="text-base font-semibold text-[#2e2a25]">
                {modalState.mode === "create" ? "Nuova stampante" : "Modifica stampante"}
              </h3>
            </div>

            <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Descrizione *</span>
                <input
                  type="text"
                  value={modalState.printer.name}
                  onChange={(event) => updateModalPrinter("name", event.target.value)}
                  className="h-11 rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                />
                {fieldErrors.name ? <span className="text-xs text-[#9a3d3d]">{fieldErrors.name}</span> : null}
              </label>

              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Modello *</span>
                <select
                  value={modalState.printer.model}
                  onChange={(event) => updateModalPrinter("model", event.target.value as PrinterModel)}
                  className="h-11 rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                >
                  {printerModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Ruolo *</span>
                <select
                  value={modalState.printer.role}
                  onChange={(event) => updateModalPrinter("role", event.target.value as PrinterRole)}
                  className="h-11 rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                >
                  {printerRoles.map((role) => (
                    <option key={role} value={role}>
                      {getRoleLabel(role)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Modalità test/mock *</span>
                <select
                  value={modalState.printer.connectionMode}
                  onChange={(event) =>
                    updateModalPrinter("connectionMode", event.target.value as PrinterConnectionMode)
                  }
                  className="h-11 rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                >
                  {connectionModes.map((mode) => (
                    <option key={mode} value={mode}>
                      {getConnectionModeLabel(mode)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Indirizzo IP *</span>
                <input
                  type="text"
                  value={modalState.printer.ipAddress}
                  onChange={(event) => updateModalPrinter("ipAddress", event.target.value)}
                  className="h-11 rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                />
                {fieldErrors.ipAddress ? (
                  <span className="text-xs text-[#9a3d3d]">{fieldErrors.ipAddress}</span>
                ) : null}
              </label>

              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Porta *</span>
                <input
                  type="number"
                  min={1}
                  value={modalState.printer.port ?? 9100}
                  onChange={(event) => updateModalPrinter("port", Number(event.target.value))}
                  className="h-11 rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                />
                {fieldErrors.port ? (
                  <span className="text-xs text-[#9a3d3d]">{fieldErrors.port}</span>
                ) : null}
              </label>

              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Timeout connessione (ms) *</span>
                <input
                  type="number"
                  min={500}
                  step={500}
                  value={modalState.printer.timeoutMs}
                  onChange={(event) => updateModalPrinter("timeoutMs", Number(event.target.value))}
                  className="h-11 rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                />
                {fieldErrors.timeoutMs ? (
                  <span className="text-xs text-[#9a3d3d]">{fieldErrors.timeoutMs}</span>
                ) : null}
              </label>

              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Stato</span>
                <select
                  value={modalState.printer.status}
                  onChange={(event) => updateModalPrinter("status", event.target.value as PrinterStatus)}
                  className="h-11 rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                >
                  <option value="configured">Configurata</option>
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                  <option value="error">Errore</option>
                </select>
              </label>

              {modalState.printer.model === "ESC/POS" ? (
                <label className="grid gap-1 text-sm text-[#4a4540]">
                  <span className="font-medium">Capacità colonna scontrini *</span>
                  <input
                    type="number"
                    min={1}
                    value={modalState.printer.paperColumns ?? 42}
                    onChange={(event) => updateModalPrinter("paperColumns", Number(event.target.value))}
                    className="h-11 rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                  />
                  {fieldErrors.paperColumns ? (
                    <span className="text-xs text-[#9a3d3d]">{fieldErrors.paperColumns}</span>
                  ) : null}
                </label>
              ) : (
                <label className="grid gap-1 text-sm text-[#4a4540]">
                  <span className="font-medium">Identificativo fiscale</span>
                  <input
                    type="text"
                    value={modalState.printer.fiscalDeviceId ?? ""}
                    onChange={(event) => updateModalPrinter("fiscalDeviceId", event.target.value)}
                    className="h-11 rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                  />
                </label>
              )}

              <label className="col-span-full flex items-center gap-2 rounded-[4px] border border-[#f7f4ee] bg-[#ffffff] px-3 py-3 text-sm text-[#4a4540]">
                <input
                  type="checkbox"
                  checked={modalState.printer.enabled}
                  onChange={(event) => updateModalPrinter("enabled", event.target.checked)}
                  className="h-4 w-4 accent-[#0b3c5d]"
                />
                Stampante attiva nelle scelte operative
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#f7f4ee] px-5 py-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-4 py-2 text-sm font-medium text-[#4a4540]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleSavePrinter}
                className="rounded-[4px] border border-[#b7cfe4] bg-[#cfe8ff] px-4 py-2 text-sm font-semibold text-[#0b3c5d]"
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#1f1a15]/35 px-4">
          <div className="w-full max-w-md rounded-[10px] border border-[#d8d5cc] bg-white p-5 shadow-[0_24px_60px_rgba(31,26,21,0.18)]">
            <h3 className="text-base font-semibold text-[#2e2a25]">Elimina stampante</h3>
            <p className="mt-2 text-sm text-[#5f5952]">
              Eliminare la stampante {deleteTarget.name}?
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-4 py-2 text-sm font-medium text-[#4a4540]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="rounded-[4px] border border-[#e5c8c8] bg-[#fff5f5] px-4 py-2 text-sm font-semibold text-[#9a3d3d]"
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
