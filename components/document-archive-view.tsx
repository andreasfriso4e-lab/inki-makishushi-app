"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createArchiveLogEntry,
  DOCUMENT_ARCHIVE_CHANGED_EVENT,
  getDocumentArchive,
  hydrateDocumentArchiveFromServer,
  saveDocumentArchive,
  type ArchivedMovement,
  type ArchivedMovementStatus,
} from "@/lib/document-archive";
import { PrintJobService } from "@/lib/print-job-service";
import { useTables } from "@/store/table-context";

const AUTO_COVER_PRODUCT_ID = "auto-cover-charge";

type DocumentSection =
  | "Scontrini"
  | "Scontrini parlanti"
  | "Fatture"
  | "Tavoli chiusi"
  | "Corrispettivi inviati";

type ArchiveFilters = {
  dateFrom: string;
  dateTo: string;
  documentNumber: string;
  tableLabel: string;
  saleMode: string;
  customerName: string;
  companyName: string;
  operator: string;
  paymentMethod: string;
  status: string;
  operationType: string;
};

const sectionOptions: DocumentSection[] = [
  "Scontrini",
  "Scontrini parlanti",
  "Fatture",
  "Tavoli chiusi",
  "Corrispettivi inviati",
];

const initialFilters: ArchiveFilters = {
  dateFrom: "",
  dateTo: "",
  documentNumber: "",
  tableLabel: "",
  saleMode: "",
  customerName: "",
  companyName: "",
  operator: "",
  paymentMethod: "",
  status: "",
  operationType: "",
};

const operatorFilterOptions = ["Tutti", "Admin", "Operatore 1", "Operatore 2", "Operatore 3"] as const;
const paymentMethodFilterOptions = [
  "Tutti",
  "Carta",
  "Contanti",
  "Fidelity card",
  "Bancomat",
  "Assegno",
] as const;
const statusFilterOptions = ["Tutti", "Inviati", "Respinti", "In attesa"] as const;

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
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

function formatEuro(value: number) {
  return `EUR ${value.toFixed(2)}`;
}

function normalizeValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function toIsoDate(value: string) {
  const [day, month, year] = value.split("/");

  if (!day || !month || !year) {
    return "";
  }

  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function matchesArchiveSection(entry: ArchivedMovement, section: DocumentSection) {
  if (section === "Scontrini") {
    return entry.documentType === "Scontrino";
  }

  if (section === "Scontrini parlanti") {
    return entry.documentType === "Scontrino parlante";
  }

  if (section === "Fatture") {
    return entry.documentType === "Fattura";
  }

  if (section === "Tavoli chiusi") {
    return entry.sourceType === "tavolo" && entry.operationKind === "sale";
  }

  return entry.operationKind === "financial-report" || entry.operationKind === "daily-close" || entry.transmissionState !== null;
}

function canTransformToInvoice(entry: ArchivedMovement) {
  return entry.documentType !== "Fattura" && entry.status !== "Annullato";
}

function canReopen(entry: ArchivedMovement) {
  return entry.sourceType === "tavolo" && entry.operationKind === "sale" && entry.status !== "Annullato";
}

function getArchivePaymentMethodLabel(paymentMethod: string) {
  if (paymentMethod === "CARTA") {
    return "Carta";
  }

  if (paymentMethod === "CONTANTI") {
    return "Contanti";
  }

  if (paymentMethod === "FIDELITY") {
    return "Fidelity card";
  }

  if (paymentMethod === "BANCOMAT") {
    return "Bancomat";
  }

  if (paymentMethod === "ASSEGNO") {
    return "Assegno";
  }

  return paymentMethod;
}

function getArchiveStatusFilterLabel(entry: ArchivedMovement) {
  if (entry.operationKind === "financial-report" || entry.operationKind === "daily-close") {
    if (entry.outcome === "success") {
      return "Inviati";
    }

    if (entry.outcome === "error") {
      return "Respinti";
    }

    return "In attesa";
  }

  if (entry.transmissionState === "Inviato") {
    return "Inviati";
  }

  if (entry.transmissionState === "Errore invio") {
    return "Respinti";
  }

  return "In attesa";
}

function getArchiveOperationLabel(entry: ArchivedMovement) {
  if (entry.operationKind === "financial-report") {
    return "Report finanziario";
  }

  if (entry.operationKind === "daily-close") {
    return "Chiusura giornaliera RT";
  }

  return entry.documentType;
}

export function DocumentArchiveView() {
  const router = useRouter();
  const { rooms, setTableOrders, updateTable } = useTables();
  const [activeSection, setActiveSection] = useState<DocumentSection>("Scontrini");
  const [entries, setEntries] = useState<ArchivedMovement[]>([]);
  const [filters, setFilters] = useState<ArchiveFilters>(initialFilters);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [targetTableId, setTargetTableId] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    setEntries(getDocumentArchive());
    void hydrateDocumentArchiveFromServer().then((nextEntries) => {
      setEntries(nextEntries);
    });

    const handleArchiveChanged = () => {
      setEntries(getDocumentArchive());
    };

    window.addEventListener(DOCUMENT_ARCHIVE_CHANGED_EVENT, handleArchiveChanged);

    return () => {
      window.removeEventListener(DOCUMENT_ARCHIVE_CHANGED_EVENT, handleArchiveChanged);
    };
  }, []);

  const allTables = useMemo(
    () => rooms.flatMap((room) => room.tables.map((table) => ({ ...table, roomName: room.roomName }))),
    [rooms]
  );

  const filteredEntries = useMemo(() => {
    return entries
      .filter((entry) => matchesArchiveSection(entry, activeSection))
      .filter((entry) => {
        const entryDate = toIsoDate(entry.date);
        const dateFromMatches = !filters.dateFrom || (entryDate && entryDate >= filters.dateFrom);
        const dateToMatches = !filters.dateTo || (entryDate && entryDate <= filters.dateTo);

        if (!dateFromMatches || !dateToMatches) {
          return false;
        }

        const matchesText = (candidate: string, searchValue: string) =>
          !searchValue || searchValue === "Tutti" ||
          normalizeValue(candidate).includes(normalizeValue(searchValue));

        return (
          matchesText(entry.documentNumber, filters.documentNumber) &&
          matchesText(entry.tableLabel, filters.tableLabel) &&
          matchesText(entry.saleMode, filters.saleMode) &&
          matchesText(entry.customerName, filters.customerName) &&
          matchesText(entry.companyName, filters.companyName) &&
          matchesText(entry.operator, filters.operator) &&
          matchesText(getArchivePaymentMethodLabel(entry.paymentMethod), filters.paymentMethod) &&
          matchesText(getArchiveStatusFilterLabel(entry), filters.status) &&
          matchesText(getArchiveOperationLabel(entry), filters.operationType)
        );
      })
      .sort((firstEntry, secondEntry) => {
        if (firstEntry.createdAt === secondEntry.createdAt) {
          return secondEntry.documentNumber.localeCompare(firstEntry.documentNumber, "it");
        }

        return secondEntry.createdAt.localeCompare(firstEntry.createdAt);
      });
  }, [activeSection, entries, filters]);

  useEffect(() => {
    if (filteredEntries.length === 0) {
      setSelectedEntryId(null);
      return;
    }

    if (!selectedEntryId || !filteredEntries.some((entry) => entry.id === selectedEntryId)) {
      setSelectedEntryId(filteredEntries[0].id);
    }
  }, [filteredEntries, selectedEntryId]);

  const selectedEntry =
    filteredEntries.find((entry) => entry.id === selectedEntryId) ??
    entries.find((entry) => entry.id === selectedEntryId) ??
    null;

  useEffect(() => {
    if (!selectedEntry) {
      setTargetTableId("");
      return;
    }

    setTargetTableId(selectedEntry.reopenedTableId ?? selectedEntry.tableId);
  }, [selectedEntry]);

  const persistEntries = (nextEntries: ArchivedMovement[]) => {
    setEntries(nextEntries);
    saveDocumentArchive(nextEntries);
  };

  const patchEntry = (
    entryId: string,
    updateEntry: (entry: ArchivedMovement) => ArchivedMovement
  ) => {
    const nextEntries = entries.map((entry) => (entry.id === entryId ? updateEntry(entry) : entry));
    persistEntries(nextEntries);
    return nextEntries.find((entry) => entry.id === entryId) ?? null;
  };

  const handleActionLog = (
    entryId: string,
    status: ArchivedMovementStatus,
    action: Parameters<typeof createArchiveLogEntry>[1],
    note: string,
    extraPatch?: Partial<ArchivedMovement>
  ) => {
    patchEntry(entryId, (entry) => ({
      ...entry,
      ...extraPatch,
      status,
      actionLog: [...entry.actionLog, createArchiveLogEntry(entry.operator, action, note)],
    }));
    setActionMessage(note);
  };

  const handleReopenOrder = async (mode: "reopen" | "move") => {
    if (!selectedEntry || !canReopen(selectedEntry)) {
      return;
    }

    const destinationTableId = targetTableId || selectedEntry.tableId;
    const destinationTable = allTables.find((table) => table.id === destinationTableId);

    if (!destinationTable) {
      setActionMessage("Seleziona un tavolo valido");
      return;
    }

    const restoredItems = selectedEntry.lines
      .filter((line) => line.productId !== AUTO_COVER_PRODUCT_ID)
      .map((line, index) => ({
        ...line,
        id: `${line.productId}-${Date.now()}-${index}`,
        paymentState: "unpaid" as const,
      }));

    setTableOrders(destinationTableId, (currentItems) => [...currentItems, ...restoredItems]);
    updateTable(destinationTableId, {
      status: "occupied",
      paymentStatus: "idle",
      guests: selectedEntry.guests,
      note: selectedEntry.note,
      customerName: selectedEntry.customerName,
      companyName: selectedEntry.companyName,
      operator: selectedEntry.operator,
      saleMode: selectedEntry.saleMode,
    });

    const note =
      mode === "move"
        ? `Ordine spostato su ${destinationTable.name}`
        : `Ordine riaperto su ${destinationTable.name}`;

    patchEntry(selectedEntry.id, (entry) => ({
      ...entry,
      status: mode === "move" ? "Corretto" : "Riaperto",
      reopenedTableId: destinationTableId,
      actionLog: [
        ...entry.actionLog,
        createArchiveLogEntry(
          selectedEntry.operator,
          mode === "move" ? "moved" : "reopened",
          note
        ),
      ],
    }));

    if (mode === "move") {
      const movePrintJobs = await new PrintJobService().dispatchTableMovePrintJob({
        sourceTableLabel: selectedEntry.tableLabel,
        destinationTableLabel: destinationTable.name,
        sourceRoomLabel: selectedEntry.saleMode,
        destinationRoomLabel: destinationTable.roomName,
        operator: selectedEntry.operator,
        total: selectedEntry.total,
        items: selectedEntry.lines
          .filter((line) => line.productId !== AUTO_COVER_PRODUCT_ID)
          .map((line) => ({
            id: line.id,
            productId: line.productId,
            name: line.name,
            quantity: line.quantity,
            note: line.note ?? undefined,
            course: line.course ?? undefined,
          })),
      });
      const failedJob = movePrintJobs.find((job) => job.status === "failed");
      setActionMessage(
        failedJob
          ? failedJob.errorMessage || note
          : `${note} · notifica BAR stampata`
      );
    } else {
      setActionMessage(note);
    }

    router.push("/?view=tables");
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#fffefb] p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#2e2a25]">Documenti</h1>
          <p className="mt-1 text-sm text-[#6b645c]">
            Archivio interno di scontrini, fatture, tavoli chiusi e corrispettivi.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex h-10 items-center gap-2 rounded-[8px] border border-[#d7d2c8] bg-white px-3 text-sm text-[#5d574f]">
            <SearchIcon />
            <input
              type="text"
              value={filters.documentNumber}
              onChange={(event) =>
                setFilters((current) => ({ ...current, documentNumber: event.target.value }))
              }
              placeholder="Cerca documento"
              className="w-48 bg-transparent outline-none placeholder:text-[#9d9588]"
            />
          </label>
          <button
            type="button"
            onClick={() =>
              setActionMessage("I documenti vengono generati dai pagamenti completati e restano in archivio.")
            }
            className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#cfe2f8] bg-[#e8f2fd] px-4 text-sm font-semibold text-[#265d8c]"
          >
            <PlusIcon />
            Nuovo movimento
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {sectionOptions.map((section) => (
          <button
            key={section}
            type="button"
            onClick={() => setActiveSection(section)}
            className={[
              "rounded-[8px] border px-4 py-2 text-sm font-semibold",
              activeSection === section
                ? "border-[#bfd6ef] bg-[#eaf3fe] text-[#285d8d]"
                : "border-[#d8d5cc] bg-white text-[#4d463e]",
            ].join(" ")}
          >
            {section}
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 rounded-[10px] border border-[#ddd8ce] bg-white p-4 xl:grid-cols-4">
        <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#766f66]">
          Data da
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
            className="mt-1 h-10 w-full rounded-[8px] border border-[#d8d5cc] px-3 text-sm font-normal text-[#2e2a25] outline-none"
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#766f66]">
          Data a
          <input
            type="date"
            value={filters.dateTo}
            onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
            className="mt-1 h-10 w-full rounded-[8px] border border-[#d8d5cc] px-3 text-sm font-normal text-[#2e2a25] outline-none"
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#766f66]">
          Tavolo
          <input
            type="text"
            value={filters.tableLabel}
            onChange={(event) => setFilters((current) => ({ ...current, tableLabel: event.target.value }))}
            className="mt-1 h-10 w-full rounded-[8px] border border-[#d8d5cc] px-3 text-sm font-normal text-[#2e2a25] outline-none"
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#766f66]">
          Sala / Takeaway
          <input
            type="text"
            value={filters.saleMode}
            onChange={(event) => setFilters((current) => ({ ...current, saleMode: event.target.value }))}
            className="mt-1 h-10 w-full rounded-[8px] border border-[#d8d5cc] px-3 text-sm font-normal text-[#2e2a25] outline-none"
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#766f66]">
          Cliente
          <input
            type="text"
            value={filters.customerName}
            onChange={(event) =>
              setFilters((current) => ({ ...current, customerName: event.target.value }))
            }
            className="mt-1 h-10 w-full rounded-[8px] border border-[#d8d5cc] px-3 text-sm font-normal text-[#2e2a25] outline-none"
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#766f66]">
          Azienda
          <input
            type="text"
            value={filters.companyName}
            onChange={(event) =>
              setFilters((current) => ({ ...current, companyName: event.target.value }))
            }
            className="mt-1 h-10 w-full rounded-[8px] border border-[#d8d5cc] px-3 text-sm font-normal text-[#2e2a25] outline-none"
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#766f66]">
          Operatore
          <select
            value={filters.operator}
            onChange={(event) => setFilters((current) => ({ ...current, operator: event.target.value }))}
            className="mt-1 h-10 w-full rounded-[8px] border border-[#d8d5cc] px-3 text-sm font-normal text-[#2e2a25] outline-none"
          >
            {operatorFilterOptions.map((operator) => (
              <option key={operator} value={operator}>
                {operator}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#766f66]">
          Metodo pagamento
          <select
            value={filters.paymentMethod}
            onChange={(event) =>
              setFilters((current) => ({ ...current, paymentMethod: event.target.value }))
            }
            className="mt-1 h-10 w-full rounded-[8px] border border-[#d8d5cc] px-3 text-sm font-normal text-[#2e2a25] outline-none"
          >
            {paymentMethodFilterOptions.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#766f66]">
          Stato
          <select
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            className="mt-1 h-10 w-full rounded-[8px] border border-[#d8d5cc] px-3 text-sm font-normal text-[#2e2a25] outline-none"
          >
            {statusFilterOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#766f66]">
          Operazione
          <select
            value={filters.operationType}
            onChange={(event) =>
              setFilters((current) => ({ ...current, operationType: event.target.value }))
            }
            className="mt-1 h-10 w-full rounded-[8px] border border-[#d8d5cc] px-3 text-sm font-normal text-[#2e2a25] outline-none"
          >
            {["Tutti", "Report finanziario", "Chiusura giornaliera RT"].map((operation) => (
              <option key={operation} value={operation}>
                {operation}
              </option>
            ))}
          </select>
        </label>
      </div>

      {actionMessage ? (
        <div className="mb-3 rounded-[8px] border border-[#d6e5c4] bg-[#f2f8ea] px-3 py-2 text-sm text-[#50613f]">
          {actionMessage}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)] gap-4 overflow-hidden">
        <div className="min-h-0 overflow-hidden rounded-[10px] border border-[#ddd8ce] bg-white">
          <div className="grid grid-cols-[92px_72px_148px_120px_120px_120px_96px_128px_118px_100px_96px] gap-2 border-b border-[#ece7dc] bg-[#f7f4ed] px-3 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[#6f685f]">
            <span>Data</span>
            <span>Ora</span>
            <span>Documento</span>
            <span>Tavolo</span>
            <span>Cliente</span>
            <span>Azienda</span>
            <span>Operatore</span>
            <span>Tipo</span>
            <span>Pagamento</span>
            <span className="text-right">Totale</span>
            <span>Stato</span>
          </div>
          <div className="min-h-0 overflow-y-auto">
            {filteredEntries.length === 0 ? (
              <div className="px-4 py-8 text-sm text-[#7a746c]">
                Nessun documento presente per i filtri selezionati.
              </div>
            ) : (
              filteredEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedEntryId(entry.id)}
                  className={[
                    "grid w-full grid-cols-[92px_72px_148px_120px_120px_120px_96px_128px_118px_100px_96px] gap-2 border-b border-[#efebe2] px-3 py-3 text-left text-sm text-[#2e2a25]",
                    selectedEntryId === entry.id ? "bg-[#eef5fe]" : "bg-white hover:bg-[#faf7f1]",
                  ].join(" ")}
                >
                  <span>{entry.date}</span>
                  <span>{entry.time}</span>
                  <span className="font-semibold">{entry.documentNumber}</span>
                  <span>{entry.tableLabel}</span>
                  <span className="truncate">{entry.customerName || "—"}</span>
                  <span className="truncate">{entry.companyName || "—"}</span>
                  <span>{entry.operator || "—"}</span>
                    <span>{getArchiveOperationLabel(entry)}</span>
                  <span>{entry.paymentMethod || "—"}</span>
                  <span className="text-right font-semibold">{formatEuro(entry.finalTotal)}</span>
                  <span>{entry.status}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="min-h-0 overflow-hidden rounded-[10px] border border-[#ddd8ce] bg-white">
          {selectedEntry ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-[#ece7dc] px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[#2e2a25]">
                      {selectedEntry.documentNumber}
                    </div>
                    <div className="mt-1 text-xs text-[#6f685f]">
                      {getArchiveOperationLabel(selectedEntry)} · {selectedEntry.date} · {selectedEntry.time}
                    </div>
                  </div>
                  <div className="rounded-full border border-[#d8d5cc] bg-[#ffffff] px-3 py-1 text-xs font-semibold text-[#5f584f]">
                    {selectedEntry.status}
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <div className="grid grid-cols-2 gap-3 text-sm text-[#2e2a25]">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.08em] text-[#7a7269]">
                      Tavolo / Riferimento
                    </div>
                    <div className="mt-1">{selectedEntry.tableLabel}</div>
                    <div className="text-xs text-[#6f685f]">
                      {selectedEntry.roomLabel} · {selectedEntry.saleMode}
                    </div>
                    {selectedEntry.origin === "APP" ? (
                      <div className="mt-1 text-xs text-[#0b3c5d]">
                        Origine APP · {selectedEntry.appOrderExternalCode || selectedEntry.appOrderInternalId || "—"}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.08em] text-[#7a7269]">
                      Cliente / Azienda
                    </div>
                    <div className="mt-1">{selectedEntry.customerName || "—"}</div>
                    <div className="text-xs text-[#6f685f]">{selectedEntry.companyName || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.08em] text-[#7a7269]">
                      Metodo pagamento
                    </div>
                    <div className="mt-1">{selectedEntry.paymentMethod || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.08em] text-[#7a7269]">
                      Metodo operazione
                    </div>
                    <div className="mt-1">{getArchiveOperationLabel(selectedEntry)}</div>
                    <div className="text-xs text-[#6f685f]">{selectedEntry.closureMethod || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.08em] text-[#7a7269]">
                      Stato invio
                    </div>
                    <div className="mt-1">{selectedEntry.transmissionState ?? "—"}</div>
                    <div className="text-xs text-[#6f685f]">
                      {selectedEntry.transmissionNote || selectedEntry.outcome || "Nessuna nota invio"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.08em] text-[#7a7269]">
                      Dispositivo / RT
                    </div>
                    <div className="mt-1">{selectedEntry.deviceLabel || "—"}</div>
                    <div className="text-xs text-[#6f685f]">{selectedEntry.rtDeviceId || selectedEntry.referenceNumber || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.08em] text-[#7a7269]">
                      Totale originale
                    </div>
                    <div className="mt-1">{formatEuro(selectedEntry.originalTotal)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.08em] text-[#7a7269]">
                      Sconto applicato
                    </div>
                    <div className="mt-1">
                      {selectedEntry.discountValue > 0
                        ? `-${formatEuro(selectedEntry.discountValue)}`
                        : "Nessuno"}
                    </div>
                    <div className="text-xs text-[#6f685f]">
                      {selectedEntry.discountLabel || selectedEntry.discountSummary || "Nessuno"}
                    </div>
                  </div>
                </div>

                {selectedEntry.financialSummary ? (
                  <div className="mt-5 rounded-[8px] border border-[#ece7dc] bg-[#fffefc] px-3 py-3">
                    <div className="text-xs font-bold uppercase tracking-[0.08em] text-[#71695f]">
                      Riepilogo giornata
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-[#2e2a25]">
                      <div>
                        <div className="text-xs text-[#6f685f]">Totale incassato</div>
                        <div className="mt-1 font-semibold">
                          {formatEuro(selectedEntry.financialSummary.totalSales)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-[#6f685f]">Documenti</div>
                        <div className="mt-1 font-semibold">
                          {selectedEntry.financialSummary.totalDocuments}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-[#6f685f]">Scontrini chiusi</div>
                        <div className="mt-1 font-semibold">
                          {selectedEntry.financialSummary.receiptCount ?? 0}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-[#6f685f]">Fatture chiuse</div>
                        <div className="mt-1 font-semibold">
                          {selectedEntry.financialSummary.invoiceCount ?? 0}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-[#6f685f]">Tavoli ancora aperti</div>
                        <div className="mt-1 font-semibold">
                          {selectedEntry.financialSummary.openTablesCount ?? 0}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {Object.entries(selectedEntry.financialSummary.byPaymentMethod).map(([method, amount]) => (
                        <div key={method} className="flex items-center justify-between text-sm text-[#2e2a25]">
                          <span>{method}</span>
                          <span className="font-semibold">{formatEuro(amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 rounded-[8px] border border-[#ece7dc] bg-[#fffefc]">
                  <div className="border-b border-[#ece7dc] px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[#71695f]">
                    Lista prodotti completa
                  </div>
                  <div className="divide-y divide-[#efebe2]">
                    {selectedEntry.lines.map((line) => (
                      <div key={line.id} className="flex items-start justify-between gap-3 px-3 py-3 text-sm">
                        <div>
                          <div className="font-semibold text-[#2e2a25]">{line.name}</div>
                          {line.note ? (
                            <div className="mt-1 text-xs text-[#70695f]">Note: {line.note}</div>
                          ) : null}
                          {line.additions?.length ? (
                            <div className="mt-1 text-xs text-[#70695f]">
                              + {line.additions.join(", ")}
                            </div>
                          ) : null}
                          {line.removals?.length ? (
                            <div className="mt-1 text-xs text-[#70695f]">
                              - {line.removals.join(", ")}
                            </div>
                          ) : null}
                          {line.vatRateLabel ? (
                            <div className="mt-1 text-xs text-[#70695f]">
                              {line.vatRateValue === null
                                ? line.vatRateLabel
                                : `${line.vatRateLabel} · ${line.vatRateValue}%`}
                            </div>
                          ) : null}
                        </div>
                        <div className="text-right text-[#2e2a25]">
                          <div>{line.quantity}x</div>
                          <div className="text-xs text-[#70695f]">{formatEuro(line.unitPrice)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5 rounded-[8px] border border-[#ece7dc] bg-[#fffefc] px-3 py-3">
                  <div className="text-xs font-bold uppercase tracking-[0.08em] text-[#71695f]">
                    Storico azioni
                  </div>
                  <div className="mt-3 space-y-2">
                    {selectedEntry.actionLog.map((logEntry) => (
                      <div
                        key={logEntry.id}
                        className="rounded-[8px] border border-[#ece7dc] bg-white px-3 py-2 text-sm text-[#2e2a25]"
                      >
                        <div className="font-semibold">{logEntry.action}</div>
                        <div className="text-xs text-[#6f685f]">
                          {new Date(logEntry.at).toLocaleDateString("it-IT")}{" "}
                          {new Date(logEntry.at).toLocaleTimeString("it-IT", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          · {logEntry.operator}
                        </div>
                        {logEntry.note ? (
                          <div className="mt-1 text-xs text-[#6f685f]">{logEntry.note}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5 rounded-[8px] border border-[#ece7dc] bg-[#fffefc] px-3 py-3">
                  <div className="text-xs font-bold uppercase tracking-[0.08em] text-[#71695f]">
                    Azioni controllate
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setActionMessage(`Dettaglio ${selectedEntry.documentNumber} visualizzato`)}
                      className="rounded-[8px] border border-[#d8d5cc] bg-white px-3 py-2 text-sm font-semibold text-[#3f3830]"
                    >
                      Visualizza dettaglio
                    </button>
                    <button
                      type="button"
                      disabled={!canReopen(selectedEntry)}
                      onClick={() => handleReopenOrder("reopen")}
                      className="rounded-[8px] border border-[#d8d5cc] bg-white px-3 py-2 text-sm font-semibold text-[#3f3830] disabled:opacity-45"
                    >
                      Riapri ordine
                    </button>
                    <button
                      type="button"
                      disabled={!canReopen(selectedEntry)}
                      onClick={() => handleReopenOrder("move")}
                      className="rounded-[8px] border border-[#d8d5cc] bg-white px-3 py-2 text-sm font-semibold text-[#3f3830] disabled:opacity-45"
                    >
                      Sposta su altro tavolo
                    </button>
                    <button
                      type="button"
                      disabled={selectedEntry.status === "Annullato"}
                      onClick={() =>
                        handleActionLog(
                          selectedEntry.id,
                          "Annullato",
                          "annulled",
                          `Documento ${selectedEntry.documentNumber} annullato`
                        )
                      }
                      className="rounded-[8px] border border-[#f0d5d5] bg-[#fff8f8] px-3 py-2 text-sm font-semibold text-[#8a4545] disabled:opacity-45"
                    >
                      Annulla documento
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleActionLog(
                          selectedEntry.id,
                          selectedEntry.status,
                          "reprinted",
                          `Documento ${selectedEntry.documentNumber} marcato per ristampa`
                        )
                      }
                      className="rounded-[8px] border border-[#d8d5cc] bg-white px-3 py-2 text-sm font-semibold text-[#3f3830]"
                    >
                      Ristampa
                    </button>
                    <button
                      type="button"
                      disabled={!canTransformToInvoice(selectedEntry)}
                      onClick={() => {
                        patchEntry(selectedEntry.id, (entry) => ({
                          ...entry,
                          documentType: "Fattura",
                          status: "Trasformato in fattura",
                          transmissionState: null,
                          transmissionNote: "",
                          actionLog: [
                            ...entry.actionLog,
                            createArchiveLogEntry(
                              entry.operator,
                              "converted-to-invoice",
                              `Documento ${entry.documentNumber} trasformato in fattura`
                            ),
                          ],
                        }));
                        setActionMessage(
                          `Documento ${selectedEntry.documentNumber} trasformato in fattura`
                        );
                      }}
                      className="rounded-[8px] border border-[#d8d5cc] bg-white px-3 py-2 text-sm font-semibold text-[#3f3830] disabled:opacity-45"
                    >
                      Trasforma in fattura
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleActionLog(
                          selectedEntry.id,
                          "Corretto",
                          "corrected",
                          `Segnalato errore operatore su ${selectedEntry.documentNumber}`
                        )
                      }
                      className="rounded-[8px] border border-[#d8d5cc] bg-white px-3 py-2 text-sm font-semibold text-[#3f3830]"
                    >
                      Segna errore operatore
                    </button>
                  </div>

                  {canReopen(selectedEntry) ? (
                    <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <select
                        value={targetTableId}
                        onChange={(event) => setTargetTableId(event.target.value)}
                        className="h-10 rounded-[8px] border border-[#d8d5cc] bg-white px-3 text-sm text-[#2e2a25] outline-none"
                      >
                        {allTables.map((table) => (
                          <option key={table.id} value={table.id}>
                            {table.roomName} · Tavolo {table.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center text-xs text-[#6f685f]">
                        Tavolo di ripristino
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="border-t border-[#ece7dc] px-4 py-3">
                <div className="space-y-2 text-sm text-[#2e2a25]">
                  <div className="flex items-center justify-between">
                    <span>Totale prodotti</span>
                    <span className="font-semibold">{formatEuro(selectedEntry.subtotal_amount)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Coperto / servizio</span>
                    <span className="font-semibold">{formatEuro(selectedEntry.service_amount ?? 0)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Totale originale</span>
                    <span className="font-semibold">{formatEuro(selectedEntry.originalTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Sconto applicato</span>
                    <span className="font-semibold text-[#8a3434]">
                      {selectedEntry.discountValue > 0 ? `-${formatEuro(selectedEntry.discountValue)}` : "Nessuno"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-[#ece7dc] pt-2">
                    <span>Totale finale pagato</span>
                    <span className="font-semibold">
                      {formatEuro(selectedEntry.final_total_amount ?? selectedEntry.finalTotal)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="px-4 py-8 text-sm text-[#7a746c]">Seleziona un movimento archivato.</div>
          )}
        </div>
      </div>
    </section>
  );
}
