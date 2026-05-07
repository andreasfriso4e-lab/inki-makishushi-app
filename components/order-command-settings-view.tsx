"use client";

import { useEffect, useMemo, useState } from "react";

import { getProductCategories, type ProductCategory } from "@/lib/pos-data";
import { PrinterConfigService } from "@/lib/printer-config-service";
import {
  buildOrderCommandRenderLines,
  buildOrderCommandNumberLabel,
  getDefaultOrderCommandSettings,
  getOrderCommandSettings,
  saveOrderCommandSettings,
  type OrderCommandRenderContext,
  type OrderCommandHeaderDisplayMode,
  type OrderCommandHeaderFieldConfig,
  type OrderCommandSettings,
  type OrderPrintStation,
  type ProductTextStyle,
  type SavedBillPrintMode,
  type VariantSizeStyle,
  type VariantTextStyle,
} from "@/lib/order-command-settings";
import { pushSharedPrintingConfig } from "@/lib/shared-printing-config";

type StationModalState =
  | { mode: "create"; station: OrderPrintStation }
  | { mode: "edit"; station: OrderPrintStation };

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

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (nextValue: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-7 w-12 items-center rounded-full border transition-colors",
        checked ? "border-[#b9d3ee] bg-[#dff0ff]" : "border-[#d8d5cc] bg-[#fbf8f2]",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-5 w-5 rounded-full border bg-white transition-transform",
          checked ? "translate-x-6 border-[#8fb8dc]" : "translate-x-1 border-[#d0cbc1]",
        ].join(" ")}
      />
    </button>
  );
}

function MoveIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
    >
      {direction === "up" ? <path d="m6 14 6-6 6 6" /> : <path d="m6 10 6 6 6-6" />}
    </svg>
  );
}

function createEmptyStation(nextIndex: number): OrderPrintStation {
  const now = new Date().toISOString();

  return {
    id: `station-${nextIndex}-${Date.now()}`,
    name: "",
    printerId: null,
    enabled: true,
    copies: 1,
    categories: [],
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}

function buildPreviewContext(settings: OrderCommandSettings): OrderCommandRenderContext {
  return {
    tableLabel: "Tavolo 8",
    roomLabel: "Sala 1",
    operator: "Admin",
    createdAt: "2026-04-29T20:31:00.000Z",
    commandNumber: buildOrderCommandNumberLabel(settings, settings.nextOrderNumber),
    guests: 4,
    customerLabel: "Mario Rossi",
    companyLabel: "Inki Srl",
    total: 12,
    items: [
      {
        id: "preview-0",
        category: "Bevande",
        name: "Acqua naturale",
        quantity: 1,
        course: "PRIMA PORTATA",
        price: 3,
      },
      {
        id: "preview-1",
        category: "Nigiri",
        name: "Nigiri Shake",
        quantity: 2,
        variant: "Senza sesamo",
        note: "Poco sale",
        course: "PRIMA PORTATA",
        guestCode: "C1",
        price: 6,
      },
      {
        id: "preview-2",
        category: "Bevande",
        name: "Coca-Cola",
        quantity: 1,
        variant: "Fredda",
        course: "PRIMA PORTATA",
        guestCode: "C2",
        price: 3,
      },
      {
        id: "preview-3",
        category: "Nigiri",
        name: "Nigiri Maguro",
        quantity: 1,
        variant: "Con salsa a parte",
        guestCode: "C2",
        price: 3,
      },
    ],
  };
}

export function OrderCommandSettingsView() {
  const printerConfigService = useMemo(() => new PrinterConfigService(), []);
  const [draftSettings, setDraftSettings] = useState<OrderCommandSettings>(() =>
    getOrderCommandSettings()
  );
  const [statusMessage, setStatusMessage] = useState("");
  const [stationModal, setStationModal] = useState<StationModalState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrderPrintStation | null>(null);
  const [stationSearch, setStationSearch] = useState("");

  useEffect(() => {
    setDraftSettings(getOrderCommandSettings());
  }, []);

  const printers = useMemo(() => printerConfigService.getPrinters(), [printerConfigService]);
  const categories = useMemo(
    () => [...getProductCategories()].sort((left, right) => left.localeCompare(right, "it")),
    []
  );

  const filteredStations = useMemo(() => {
    const normalizedQuery = stationSearch.trim().toLowerCase();

    return draftSettings.stations.filter((station) => {
      if (!normalizedQuery) {
        return true;
      }

      return (
        station.name.toLowerCase().includes(normalizedQuery) ||
        (printers.find((printer) => printer.id === station.printerId)?.name ?? "")
          .toLowerCase()
          .includes(normalizedQuery)
      );
    });
  }, [draftSettings.stations, printers, stationSearch]);

  const previewContext = useMemo(() => buildPreviewContext(draftSettings), [draftSettings]);
  const previewLines = useMemo(
    () => buildOrderCommandRenderLines(draftSettings, previewContext),
    [draftSettings, previewContext]
  );

  const updateSetting = <Key extends keyof OrderCommandSettings>(
    field: Key,
    value: OrderCommandSettings[Key]
  ) => {
    setDraftSettings((currentSettings) => ({
      ...currentSettings,
      [field]: value,
    }));
  };

  const handleSaveSettings = async () => {
    const savedSettings = saveOrderCommandSettings(draftSettings);
    setDraftSettings(savedSettings);
    const syncResult = await pushSharedPrintingConfig();
    setStatusMessage(
      syncResult
        ? "Configurazione comande salvata e sincronizzata"
        : "Configurazione comande salvata"
    );
  };

  const handleResetDefaults = () => {
    const defaults = getDefaultOrderCommandSettings();
    setDraftSettings(defaults);
    setStatusMessage("Default caricati");
  };

  const handleSaveStation = () => {
    if (!stationModal) {
      return;
    }

    const trimmedName = stationModal.station.name.trim();

    if (!trimmedName) {
      setStatusMessage("Inserisci il nome della postazione");
      return;
    }

    const now = new Date().toISOString();
    const normalizedStation: OrderPrintStation = {
      ...stationModal.station,
      name: trimmedName,
      copies: Math.max(1, Number(stationModal.station.copies) || 1),
      updatedAt: now,
      createdAt:
        stationModal.mode === "create" ? now : stationModal.station.createdAt,
    };

    const nextStations =
      stationModal.mode === "create"
        ? [...draftSettings.stations, normalizedStation]
        : draftSettings.stations.map((station) =>
            station.id === normalizedStation.id ? normalizedStation : station
          );

    setDraftSettings((currentSettings) => ({
      ...currentSettings,
      stations: nextStations,
    }));
    setStationModal(null);
    setStatusMessage(
      stationModal.mode === "create" ? "Postazione aggiunta" : "Postazione aggiornata"
    );
  };

  const updateStationModal = <Key extends keyof OrderPrintStation>(
    field: Key,
    value: OrderPrintStation[Key]
  ) => {
    setStationModal((currentModal) =>
      currentModal
        ? {
            ...currentModal,
            station: {
              ...currentModal.station,
              [field]: value,
            },
          }
        : currentModal
    );
  };

  const handleToggleStationCategory = (category: ProductCategory) => {
    setStationModal((currentModal) => {
      if (!currentModal) {
        return currentModal;
      }

      const hasCategory = currentModal.station.categories.includes(category);
      return {
        ...currentModal,
        station: {
          ...currentModal.station,
          categories: hasCategory
            ? currentModal.station.categories.filter((item) => item !== category)
            : [...currentModal.station.categories, category],
        },
      };
    });
  };

  const handleDeleteStation = () => {
    if (!deleteTarget) {
      return;
    }

    setDraftSettings((currentSettings) => ({
      ...currentSettings,
      stations: currentSettings.stations.filter((station) => station.id !== deleteTarget.id),
    }));
    setDeleteTarget(null);
    setStatusMessage("Postazione eliminata");
  };

  const previewTitleStyle = {
    fontSize: `${draftSettings.commandTitle.fontSize}px`,
    fontWeight: draftSettings.commandTitle.fontWeight === "bold" ? 700 : 500,
    textAlign: draftSettings.commandTitle.centered ? ("center" as const) : ("left" as const),
    textTransform: draftSettings.commandTitle.uppercase ? ("uppercase" as const) : ("none" as const),
  };
  const previewHeaderStyle = {
    fontSize: `${draftSettings.headerFontSize}px`,
  };
  const previewGuestGroupStyle = {
    fontSize: `${draftSettings.guestGroupFontSize}px`,
    fontWeight: draftSettings.guestGroupBold ? 700 : 500,
    textAlign: draftSettings.guestGroupCentered ? ("center" as const) : ("left" as const),
    textTransform: draftSettings.guestGroupUppercase ? ("uppercase" as const) : ("none" as const),
  };
  const previewProductStyle = {
    fontSize: `${draftSettings.productFontSize}px`,
    fontWeight: draftSettings.productBold ? 700 : 400,
  };
  const previewVariantStyle = {
    fontSize: `${
      draftSettings.variantSize === "double"
        ? draftSettings.variantFontSize * 1.4
        : draftSettings.variantFontSize
    }px`,
    fontWeight: draftSettings.variantTextStyle === "bold" ? 700 : 400,
  };
  const previewNoteStyle = {
    fontSize: `${draftSettings.noteFontSize}px`,
    fontWeight: draftSettings.noteBold ? 700 : 400,
    textTransform: draftSettings.noteUppercase ? ("uppercase" as const) : ("none" as const),
  };

  const settingToggles: Array<{
    key: keyof OrderCommandSettings;
    label: string;
  }> = [
    { key: "printCommandWithReceiptAndInvoice", label: "Stampa comanda con lo scontrino e la fattura" },
    { key: "printCommandWithBill", label: "Stampa comanda con il conto" },
    { key: "enableDirectCommandPrintButton", label: "Abilita tasto per la stampa diretta della comanda" },
    { key: "printOneCommandPerProduct", label: "Stampa una comanda per ogni singolo prodotto" },
    { key: "printOneCommandPerCategory", label: "Stampa una comanda per ogni categoria" },
    { key: "mergeDuplicateItems", label: "Accorpa su unica riga ordinazioni con prodotti uguali" },
    { key: "printOrderNote", label: "Stampa nota ordine in comanda" },
    { key: "printCustomerCompanyName", label: "Stampa nominativo cliente / azienda in comanda" },
    { key: "alwaysPrintCategoryNames", label: "Stampa sempre nomi categorie in comanda" },
    { key: "printOrdersInInsertionOrder", label: "Stampa ordinazioni in ordine di inserimento" },
    { key: "printOrdersInInterfaceOrder", label: "Stampa ordinazioni nello stesso ordine di disposizione di categorie e prodotti nell’interfaccia grafica" },
    { key: "printPieceCount", label: "Stampa conteggio pezzi in comanda" },
    { key: "printElementPrices", label: "Stampa i prezzi di ogni elemento in comanda" },
    { key: "printCommandTotal", label: "Stampa il totale della comanda" },
  ];

  const headerDisplayModeOptions: Array<{
    value: OrderCommandHeaderDisplayMode;
    label: string;
  }> = [
    { value: "label-value", label: "Etichetta + valore" },
    { value: "label-only", label: "Solo etichetta" },
    { value: "value-only", label: "Solo valore" },
  ];
  const spacingOptions: Array<{
    value: "none" | "small" | "medium" | "large";
    label: string;
  }> = [
    { value: "none", label: "Nessuno" },
    { value: "small", label: "Piccolo" },
    { value: "medium", label: "Medio" },
    { value: "large", label: "Grande" },
  ];

  const updateHeaderField = (
    fieldKey: OrderCommandHeaderFieldConfig["key"],
    updater: (field: OrderCommandHeaderFieldConfig) => OrderCommandHeaderFieldConfig
  ) => {
    setDraftSettings((currentSettings) => ({
      ...currentSettings,
      headerFields: currentSettings.headerFields
        .map((field) => (field.key === fieldKey ? updater(field) : field))
        .sort((left, right) => left.order - right.order),
    }));
  };

  const moveHeaderField = (
    fieldKey: OrderCommandHeaderFieldConfig["key"],
    direction: "up" | "down"
  ) => {
    setDraftSettings((currentSettings) => {
      const sortedFields = [...currentSettings.headerFields].sort(
        (left, right) => left.order - right.order
      );
      const currentIndex = sortedFields.findIndex((field) => field.key === fieldKey);

      if (currentIndex < 0) {
        return currentSettings;
      }

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

      if (targetIndex < 0 || targetIndex >= sortedFields.length) {
        return currentSettings;
      }

      [sortedFields[currentIndex], sortedFields[targetIndex]] = [
        sortedFields[targetIndex],
        sortedFields[currentIndex],
      ];

      return {
        ...currentSettings,
        headerFields: sortedFields.map((field, index) => ({
          ...field,
          order: index + 1,
        })),
      };
    });
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-auto bg-[#fffefb] p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#2e2a25]">Comande</h1>
          <p className="mt-1 text-sm text-[#6b645c]">
            Configura stampa comande, postazioni e stile ticket con preview aggiornata in tempo reale.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-4 py-2 text-sm font-medium text-[#4a4540]"
          >
            Ripristina default
          </button>
          <button
            type="button"
            onClick={handleSaveSettings}
            className="rounded-[8px] border border-[#b7cfe4] bg-[#cfe8ff] px-4 py-2 text-sm font-semibold text-[#0b3c5d]"
          >
            Salva configurazione
          </button>
        </div>
      </div>

      {statusMessage ? (
        <div className="mb-4 rounded-[8px] border border-[#bcd5ea] bg-[#eef6ff] px-3 py-2 text-sm text-[#0b3c5d]">
          {statusMessage}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="flex min-h-0 flex-col gap-4">
          <div className="rounded-[12px] border border-[#ddd8ce] bg-white p-4">
            <h2 className="mb-4 text-base font-semibold text-[#2e2a25]">Sezione Comande</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {settingToggles.map((toggleSetting) => (
                <div
                  key={toggleSetting.key}
                  className="flex items-center justify-between gap-3 rounded-[8px] border border-[#f7f4ee] bg-[#ffffff] px-3 py-3"
                >
                  <span className="text-sm text-[#2e2a25]">{toggleSetting.label}</span>
                  <Toggle
                    checked={Boolean(draftSettings[toggleSetting.key] as boolean)}
                    onChange={(nextValue) =>
                      updateSetting(toggleSetting.key, nextValue as OrderCommandSettings[typeof toggleSetting.key])
                    }
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Stampa comanda da conto salvato</span>
                <select
                  value={draftSettings.printFromSavedBill}
                  onChange={(event) =>
                    updateSetting("printFromSavedBill", event.target.value as SavedBillPrintMode)
                  }
                  className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                >
                  <option value="never">Mai</option>
                  <option value="always">Sempre</option>
                  <option value="on-request">Solo su richiesta</option>
                </select>
              </label>

              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Prefisso</span>
                <input
                  type="text"
                  value={draftSettings.prefix}
                  onChange={(event) => updateSetting("prefix", event.target.value)}
                  className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                />
              </label>

              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Prossimo numero ordine</span>
                <input
                  type="number"
                  min={1}
                  value={draftSettings.nextOrderNumber}
                  onChange={(event) =>
                    updateSetting("nextOrderNumber", Number(event.target.value) || 1)
                  }
                  className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                />
              </label>

              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Massimo numero ordine</span>
                <input
                  type="number"
                  min={1}
                  value={draftSettings.maxOrderNumber}
                  onChange={(event) =>
                    updateSetting("maxOrderNumber", Number(event.target.value) || 1)
                  }
                  className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                />
              </label>

              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Spaziatura superiore comanda</span>
                <input
                  type="number"
                  min={0}
                  value={draftSettings.topSpacing}
                  onChange={(event) =>
                    updateSetting("topSpacing", Math.max(0, Number(event.target.value) || 0))
                  }
                  className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                />
              </label>

              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Numero righe / capacità righe stampa</span>
                <input
                  type="number"
                  min={1}
                  value={draftSettings.lineCapacity}
                  onChange={(event) =>
                    updateSetting("lineCapacity", Number(event.target.value) || 1)
                  }
                  className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                />
              </label>

              <label className="grid gap-1 text-sm text-[#4a4540] md:col-span-2">
                <span className="font-medium">Piè di pagina per la comanda di ogni singolo prodotto</span>
                <textarea
                  value={draftSettings.singleProductFooter}
                  onChange={(event) => updateSetting("singleProductFooter", event.target.value)}
                  rows={3}
                  className="rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 py-2 outline-none"
                />
              </label>
            </div>
          </div>

          <div className="rounded-[12px] border border-[#ddd8ce] bg-white p-4">
            <h2 className="mb-4 text-base font-semibold text-[#2e2a25]">Testata comanda</h2>
            <div className="rounded-[10px] border border-[#ebe5da] bg-[#fcfaf6] p-4">
              <div className="mb-3 text-sm font-semibold text-[#2e2a25]">Titolo principale</div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center justify-between rounded-[8px] border border-[#f2ece2] bg-white px-3 py-3 text-sm text-[#2e2a25]">
                  <span>Mostra titolo</span>
                  <Toggle
                    checked={draftSettings.commandTitle.enabled}
                    onChange={(nextValue) =>
                      setDraftSettings((currentSettings) => ({
                        ...currentSettings,
                        commandTitle: {
                          ...currentSettings.commandTitle,
                          enabled: nextValue,
                        },
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-[8px] border border-[#f2ece2] bg-white px-3 py-3 text-sm text-[#2e2a25]">
                  <span>Includi numero tavolo</span>
                  <Toggle
                    checked={draftSettings.commandTitle.includeTableValue}
                    onChange={(nextValue) =>
                      setDraftSettings((currentSettings) => ({
                        ...currentSettings,
                        commandTitle: {
                          ...currentSettings.commandTitle,
                          includeTableValue: nextValue,
                        },
                      }))
                    }
                  />
                </div>
                <label className="grid gap-1 text-sm text-[#4a4540]">
                  <span className="font-medium">Prefisso titolo</span>
                  <input
                    type="text"
                    value={draftSettings.commandTitle.prefix}
                    onChange={(event) =>
                      setDraftSettings((currentSettings) => ({
                        ...currentSettings,
                        commandTitle: {
                          ...currentSettings.commandTitle,
                          prefix: event.target.value,
                        },
                      }))
                    }
                    className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                  />
                </label>
                <label className="grid gap-1 text-sm text-[#4a4540]">
                  <span className="font-medium">Composizione titolo</span>
                  <select
                    value={draftSettings.commandTitle.displayMode}
                    onChange={(event) =>
                      setDraftSettings((currentSettings) => ({
                        ...currentSettings,
                        commandTitle: {
                          ...currentSettings.commandTitle,
                          displayMode: event.target.value as OrderCommandSettings["commandTitle"]["displayMode"],
                        },
                      }))
                    }
                    className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                  >
                    <option value="prefix-and-table">Prefisso + tavolo</option>
                    <option value="prefix-only">Solo prefisso</option>
                    <option value="table-only">Solo tavolo</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm text-[#4a4540]">
                  <span className="font-medium">Dimensione font titolo</span>
                  <input
                    type="number"
                    min={8}
                    value={draftSettings.commandTitle.fontSize}
                    onChange={(event) =>
                      setDraftSettings((currentSettings) => ({
                        ...currentSettings,
                        titleFontSize: Number(event.target.value) || 8,
                        commandTitle: {
                          ...currentSettings.commandTitle,
                          fontSize: Number(event.target.value) || 8,
                        },
                      }))
                    }
                    className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                  />
                </label>
                <label className="grid gap-1 text-sm text-[#4a4540]">
                  <span className="font-medium">Ordine visualizzazione</span>
                  <input
                    type="number"
                    min={0}
                    value={draftSettings.commandTitle.order}
                    onChange={(event) =>
                      setDraftSettings((currentSettings) => ({
                        ...currentSettings,
                        commandTitle: {
                          ...currentSettings.commandTitle,
                          order: Number(event.target.value) || 0,
                        },
                      }))
                    }
                    className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                  />
                </label>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="flex items-center justify-between rounded-[8px] border border-[#f7f4ee] bg-[#ffffff] px-3 py-3 text-sm text-[#2e2a25]">
                  <span>Titolo grassetto</span>
                  <Toggle
                    checked={draftSettings.commandTitle.fontWeight === "bold"}
                    onChange={(nextValue) =>
                      setDraftSettings((currentSettings) => ({
                        ...currentSettings,
                        titleBold: nextValue,
                        commandTitle: {
                          ...currentSettings.commandTitle,
                          fontWeight: nextValue ? "bold" : "normal",
                        },
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-[8px] border border-[#f7f4ee] bg-[#ffffff] px-3 py-3 text-sm text-[#2e2a25]">
                  <span>Titolo centrato</span>
                  <Toggle
                    checked={draftSettings.commandTitle.centered}
                    onChange={(nextValue) =>
                      setDraftSettings((currentSettings) => ({
                        ...currentSettings,
                        titleCentered: nextValue,
                        commandTitle: {
                          ...currentSettings.commandTitle,
                          centered: nextValue,
                        },
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-[8px] border border-[#f7f4ee] bg-[#ffffff] px-3 py-3 text-sm text-[#2e2a25]">
                  <span>Titolo maiuscolo</span>
                  <Toggle
                    checked={draftSettings.commandTitle.uppercase}
                    onChange={(nextValue) =>
                      setDraftSettings((currentSettings) => ({
                        ...currentSettings,
                        titleUppercase: nextValue,
                        commandTitle: {
                          ...currentSettings.commandTitle,
                          uppercase: nextValue,
                        },
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-3 text-sm font-semibold text-[#2e2a25]">Righe intestazione</div>
              <div className="space-y-3">
                {draftSettings.headerFields
                  .slice()
                  .sort((left, right) => left.order - right.order)
                  .map((field, index, fields) => (
                    <div
                      key={field.key}
                      className="rounded-[10px] border border-[#ebe5da] bg-[#fcfaf6] p-4"
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-[#2e2a25]">
                          {field.key === "table"
                            ? "Tavolo"
                            : field.key === "room"
                              ? "Sala"
                              : field.key === "date"
                                ? "Data"
                                : field.key === "time"
                                  ? "Ora"
                                  : field.key === "operator"
                                    ? "Operatore"
                                    : field.key === "orderNumber"
                                      ? "Numero comanda"
                                      : field.key === "guests"
                                        ? "Coperti"
                                        : field.key === "customer"
                                          ? "Cliente"
                                          : "Azienda"}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => moveHeaderField(field.key, "up")}
                            disabled={index === 0}
                            className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#d8d5cc] bg-white text-[#4a4540] disabled:opacity-40"
                          >
                            <MoveIcon direction="up" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveHeaderField(field.key, "down")}
                            disabled={index === fields.length - 1}
                            className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#d8d5cc] bg-white text-[#4a4540] disabled:opacity-40"
                          >
                            <MoveIcon direction="down" />
                          </button>
                          <Toggle
                            checked={field.enabled}
                            onChange={(nextValue) =>
                              updateHeaderField(field.key, (currentField) => ({
                                ...currentField,
                                enabled: nextValue,
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <label className="grid gap-1 text-sm text-[#4a4540]">
                          <span className="font-medium">Etichetta</span>
                          <input
                            type="text"
                            value={field.label}
                            onChange={(event) =>
                              updateHeaderField(field.key, (currentField) => ({
                                ...currentField,
                                label: event.target.value,
                              }))
                            }
                            className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                          />
                        </label>
                        <label className="grid gap-1 text-sm text-[#4a4540]">
                          <span className="font-medium">Visualizzazione</span>
                          <select
                            value={field.displayMode}
                            onChange={(event) =>
                              updateHeaderField(field.key, (currentField) => ({
                                ...currentField,
                                displayMode: event.target.value as OrderCommandHeaderDisplayMode,
                              }))
                            }
                            className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                          >
                            {headerDisplayModeOptions.map((option) => (
                              <option key={`${field.key}-${option.value}`} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-1 text-sm text-[#4a4540]">
                          <span className="font-medium">Dimensione font</span>
                          <input
                            type="number"
                            min={8}
                            value={field.fontSize}
                            onChange={(event) =>
                              updateHeaderField(field.key, (currentField) => ({
                                ...currentField,
                                fontSize: Number(event.target.value) || 8,
                              }))
                            }
                            className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                          />
                        </label>
                        <div className="flex items-center justify-between rounded-[8px] border border-[#f7f4ee] bg-white px-3 py-3 text-sm text-[#2e2a25]">
                          <span>Grassetto</span>
                          <Toggle
                            checked={field.fontWeight === "bold"}
                            onChange={(nextValue) =>
                              updateHeaderField(field.key, (currentField) => ({
                                ...currentField,
                                fontWeight: nextValue ? "bold" : "normal",
                              }))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-[8px] border border-[#f7f4ee] bg-[#ffffff] px-3 py-3 text-sm text-[#2e2a25]">
                <span>Mostra cliente / azienda se presenti</span>
                <Toggle
                  checked={draftSettings.printCustomerCompanyName}
                  onChange={(nextValue) => updateSetting("printCustomerCompanyName", nextValue)}
                />
              </div>
            </div>

            <div className="mt-5 rounded-[10px] border border-[#ebe5da] bg-[#fcfaf6] p-4">
              <div className="mb-3 text-sm font-semibold text-[#2e2a25]">Intestazione portata</div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="flex items-center justify-between rounded-[8px] border border-[#f7f4ee] bg-white px-3 py-3 text-sm text-[#2e2a25]">
                  <span>Mostra intestazione portata</span>
                  <Toggle
                    checked={draftSettings.showCourseHeader}
                    onChange={(nextValue) => updateSetting("showCourseHeader", nextValue)}
                  />
                </div>
                <label className="grid gap-1 text-sm text-[#4a4540]">
                  <span className="font-medium">Testo base opzionale</span>
                  <input
                    type="text"
                    value={draftSettings.courseHeaderBaseText}
                    onChange={(event) => updateSetting("courseHeaderBaseText", event.target.value)}
                    placeholder="Es. Portata"
                    className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                  />
                </label>
                <label className="grid gap-1 text-sm text-[#4a4540]">
                  <span className="font-medium">Dimensione font</span>
                  <input
                    type="number"
                    min={8}
                    value={draftSettings.courseHeaderFontSize}
                    onChange={(event) =>
                      updateSetting("courseHeaderFontSize", Number(event.target.value) || 8)
                    }
                    className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                  />
                </label>
                <label className="grid gap-1 text-sm text-[#4a4540]">
                  <span className="font-medium">Spazio sopra</span>
                  <select
                    value={draftSettings.courseHeaderSpacingTop}
                    onChange={(event) =>
                      updateSetting(
                        "courseHeaderSpacingTop",
                        event.target.value as OrderCommandSettings["courseHeaderSpacingTop"]
                      )
                    }
                    className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                  >
                    {spacingOptions.map((option) => (
                      <option key={`course-top-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm text-[#4a4540]">
                  <span className="font-medium">Spazio sotto</span>
                  <select
                    value={draftSettings.courseHeaderSpacingBottom}
                    onChange={(event) =>
                      updateSetting(
                        "courseHeaderSpacingBottom",
                        event.target.value as OrderCommandSettings["courseHeaderSpacingBottom"]
                      )
                    }
                    className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                  >
                    {spacingOptions.map((option) => (
                      <option key={`course-bottom-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center justify-between rounded-[8px] border border-[#f7f4ee] bg-white px-3 py-3 text-sm text-[#2e2a25]">
                  <span>Grassetto</span>
                  <Toggle
                    checked={draftSettings.courseHeaderBold}
                    onChange={(nextValue) => updateSetting("courseHeaderBold", nextValue)}
                  />
                </div>
                <div className="flex items-center justify-between rounded-[8px] border border-[#f7f4ee] bg-white px-3 py-3 text-sm text-[#2e2a25]">
                  <span>Maiuscolo</span>
                  <Toggle
                    checked={draftSettings.courseHeaderUppercase}
                    onChange={(nextValue) => updateSetting("courseHeaderUppercase", nextValue)}
                  />
                </div>
                <div className="flex items-center justify-between rounded-[8px] border border-[#f7f4ee] bg-white px-3 py-3 text-sm text-[#2e2a25]">
                  <span>Centrato</span>
                  <Toggle
                    checked={draftSettings.courseHeaderCentered}
                    onChange={(nextValue) => updateSetting("courseHeaderCentered", nextValue)}
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-[10px] border border-[#ebe5da] bg-[#fcfaf6] p-4">
              <div className="mb-3 text-sm font-semibold text-[#2e2a25]">Gruppi commensale</div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="flex items-center justify-between rounded-[8px] border border-[#f7f4ee] bg-white px-3 py-3 text-sm text-[#2e2a25]">
                  <span>Mostra titolo commensale</span>
                  <Toggle
                    checked={draftSettings.showGuestGroupTitle}
                    onChange={(nextValue) => updateSetting("showGuestGroupTitle", nextValue)}
                  />
                </div>
                <label className="grid gap-1 text-sm text-[#4a4540]">
                  <span className="font-medium">Testo base titolo</span>
                  <input
                    type="text"
                    value={draftSettings.guestGroupTitleText}
                    onChange={(event) => updateSetting("guestGroupTitleText", event.target.value)}
                    className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                  />
                </label>
                <label className="grid gap-1 text-sm text-[#4a4540]">
                  <span className="font-medium">Dimensione font titolo</span>
                  <input
                    type="number"
                    min={8}
                    value={draftSettings.guestGroupFontSize}
                    onChange={(event) =>
                      updateSetting("guestGroupFontSize", Number(event.target.value) || 8)
                    }
                    className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                  />
                </label>
                <label className="grid gap-1 text-sm text-[#4a4540]">
                  <span className="font-medium">Spazio tra gruppi</span>
                  <select
                    value={draftSettings.guestGroupSpacing}
                    onChange={(event) =>
                      updateSetting(
                        "guestGroupSpacing",
                        event.target.value as OrderCommandSettings["guestGroupSpacing"]
                      )
                    }
                    className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                  >
                    {spacingOptions.map((option) => (
                      <option key={`guest-group-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm text-[#4a4540]">
                  <span className="font-medium">Spazio tra prodotti</span>
                  <select
                    value={draftSettings.productLineSpacing}
                    onChange={(event) =>
                      updateSetting(
                        "productLineSpacing",
                        event.target.value as OrderCommandSettings["productLineSpacing"]
                      )
                    }
                    className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                  >
                    {spacingOptions.map((option) => (
                      <option key={`product-spacing-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center justify-between rounded-[8px] border border-[#f7f4ee] bg-white px-3 py-3 text-sm text-[#2e2a25]">
                  <span>Titolo commensale grassetto</span>
                  <Toggle
                    checked={draftSettings.guestGroupBold}
                    onChange={(nextValue) => updateSetting("guestGroupBold", nextValue)}
                  />
                </div>
                <div className="flex items-center justify-between rounded-[8px] border border-[#f7f4ee] bg-white px-3 py-3 text-sm text-[#2e2a25]">
                  <span>Titolo commensale maiuscolo</span>
                  <Toggle
                    checked={draftSettings.guestGroupUppercase}
                    onChange={(nextValue) => updateSetting("guestGroupUppercase", nextValue)}
                  />
                </div>
                <div className="flex items-center justify-between rounded-[8px] border border-[#f7f4ee] bg-white px-3 py-3 text-sm text-[#2e2a25]">
                  <span>Titolo commensale centrato</span>
                  <Toggle
                    checked={draftSettings.guestGroupCentered}
                    onChange={(nextValue) => updateSetting("guestGroupCentered", nextValue)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[12px] border border-[#ddd8ce] bg-white p-4">
            <h2 className="mb-4 text-base font-semibold text-[#2e2a25]">Stile comanda</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Stile prodotti</span>
                <select
                  value={draftSettings.productTextStyle}
                  onChange={(event) =>
                    updateSetting("productTextStyle", event.target.value as ProductTextStyle)
                  }
                  className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                >
                  <option value="lowercase">Minuscolo</option>
                  <option value="uppercase">Maiuscolo</option>
                </select>
              </label>

              <div className="flex items-center justify-between rounded-[8px] border border-[#f7f4ee] bg-[#ffffff] px-3 py-3 text-sm text-[#2e2a25]">
                <span>Prodotti in grassetto</span>
                <Toggle
                  checked={draftSettings.productBold}
                  onChange={(nextValue) => updateSetting("productBold", nextValue)}
                />
              </div>

              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Stile varianti</span>
                <select
                  value={draftSettings.variantTextStyle}
                  onChange={(event) =>
                    updateSetting("variantTextStyle", event.target.value as VariantTextStyle)
                  }
                  className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                >
                  <option value="lowercase">Minuscolo</option>
                  <option value="uppercase">Maiuscolo</option>
                  <option value="normal">Normale</option>
                  <option value="bold">Grassetto</option>
                </select>
              </label>

              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Dimensione varianti</span>
                <select
                  value={draftSettings.variantSize}
                  onChange={(event) =>
                    updateSetting("variantSize", event.target.value as VariantSizeStyle)
                  }
                  className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                >
                  <option value="normal">Normale</option>
                  <option value="double">Doppia</option>
                </select>
              </label>

              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Grandezza caratteri prodotti</span>
                <input
                  type="number"
                  min={8}
                  value={draftSettings.productFontSize}
                  onChange={(event) =>
                    updateSetting("productFontSize", Number(event.target.value) || 8)
                  }
                  className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                />
              </label>

              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Grandezza caratteri varianti</span>
                <input
                  type="number"
                  min={8}
                  value={draftSettings.variantFontSize}
                  onChange={(event) =>
                    updateSetting("variantFontSize", Number(event.target.value) || 8)
                  }
                  className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                />
              </label>

              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Font note</span>
                <input
                  type="number"
                  min={8}
                  value={draftSettings.noteFontSize}
                  onChange={(event) =>
                    updateSetting("noteFontSize", Number(event.target.value) || 8)
                  }
                  className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                />
              </label>

              <div className="flex items-center justify-between rounded-[8px] border border-[#f7f4ee] bg-[#ffffff] px-3 py-3 text-sm text-[#2e2a25]">
                <span>Note in grassetto</span>
                <Toggle
                  checked={draftSettings.noteBold}
                  onChange={(nextValue) => updateSetting("noteBold", nextValue)}
                />
              </div>

              <div className="flex items-center justify-between rounded-[8px] border border-[#f7f4ee] bg-[#ffffff] px-3 py-3 text-sm text-[#2e2a25]">
                <span>Note maiuscole</span>
                <Toggle
                  checked={draftSettings.noteUppercase}
                  onChange={(nextValue) => updateSetting("noteUppercase", nextValue)}
                />
              </div>
            </div>
          </div>

          <div className="rounded-[12px] border border-[#ddd8ce] bg-white p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-[#2e2a25]">Postazioni</h2>
              <div className="flex items-center gap-2">
                <div className="flex h-10 items-center rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-[#6a645b]">
                  <SearchIcon />
                  <input
                    type="text"
                    value={stationSearch}
                    onChange={(event) => setStationSearch(event.target.value)}
                    placeholder="Cerca postazione"
                    className="ml-2 h-full w-[180px] bg-transparent text-sm text-[#2e2a25] outline-none placeholder:text-[#9a948a]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setStationModal({
                      mode: "create",
                      station: createEmptyStation(draftSettings.stations.length + 1),
                    })
                  }
                  className="flex h-10 items-center gap-2 rounded-[8px] border border-[#b7cfe4] bg-[#cfe8ff] px-3 text-sm font-semibold text-[#0b3c5d]"
                >
                  <PlusIcon />
                  Nuova postazione
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-[10px] border border-[#e2ddd3]">
              <div className="grid grid-cols-[minmax(0,1fr)_140px_96px_96px] items-center gap-3 border-b border-[#f7f4ee] bg-[#fcfaf6] px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#6a645b]">
                <span>Nome postazione</span>
                <span>Stato</span>
                <span>Modifica</span>
                <span>Elimina</span>
              </div>
              {filteredStations.map((station) => (
                <div
                  key={station.id}
                  className="grid grid-cols-[minmax(0,1fr)_140px_96px_96px] items-center gap-3 border-b border-[#f0ede5] px-4 py-3 text-sm last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-[#2e2a25]">{station.name}</div>
                    <div className="mt-1 text-xs text-[#6b645c]">
                      {printers.find((printer) => printer.id === station.printerId)?.name ??
                        "Nessuna stampante associata"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Toggle
                      checked={station.enabled}
                      onChange={(nextValue) =>
                        setDraftSettings((currentSettings) => ({
                          ...currentSettings,
                          stations: currentSettings.stations.map((item) =>
                            item.id === station.id
                              ? { ...item, enabled: nextValue, updatedAt: new Date().toISOString() }
                              : item
                          ),
                        }))
                      }
                    />
                    <span className="text-xs text-[#6b645c]">
                      {station.enabled ? "Attiva" : "Non attiva"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStationModal({ mode: "edit", station: { ...station } })}
                    className="flex items-center justify-center rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] p-2 text-[#4a4540]"
                  >
                    <PencilIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(station)}
                    className="flex items-center justify-center rounded-[8px] border border-[#e5c8c8] bg-[#fff5f5] p-2 text-[#9a3d3d]"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-4">
          <div className="rounded-[12px] border border-[#ddd8ce] bg-white p-4">
            <h2 className="mb-4 text-base font-semibold text-[#2e2a25]">Preview comanda</h2>
            <div className="rounded-[10px] border border-dashed border-[#d7d1c7] bg-[#ffffff] px-5 py-4 font-mono text-[#2e2a25]">
              {Array.from({ length: draftSettings.topSpacing }).map((_, index) => (
                <div key={`spacing-${index}`} className="h-3" />
              ))}

              {previewLines.map((line, index) => {
                if (line.role === "separator") {
                  return (
                    <div
                      key={`preview-line-${index}`}
                      className="my-3 border-t border-dashed border-[#cfc8bc]"
                    />
                  );
                }

                const style =
                  line.role === "title"
                    ? {
                        ...previewTitleStyle,
                        fontSize: `${line.fontSize ?? draftSettings.commandTitle.fontSize}px`,
                        fontWeight: line.fontWeight === "bold" ? 700 : previewTitleStyle.fontWeight,
                        textAlign: line.centered ? ("center" as const) : previewTitleStyle.textAlign,
                      }
                    : line.role === "header"
                      ? {
                          ...previewHeaderStyle,
                          fontSize: `${line.fontSize ?? draftSettings.headerFontSize}px`,
                          fontWeight: line.fontWeight === "bold" ? 700 : 400,
                        }
                      : line.role === "section"
                        ? {
                            ...previewGuestGroupStyle,
                            fontSize: `${line.fontSize ?? draftSettings.guestGroupFontSize}px`,
                            fontWeight:
                              line.fontWeight === "bold" ? 700 : previewGuestGroupStyle.fontWeight,
                            textAlign: line.centered
                              ? ("center" as const)
                              : previewGuestGroupStyle.textAlign,
                          }
                      : line.role === "product" || line.role === "total"
                        ? previewProductStyle
                        : line.role === "variant"
                          ? previewVariantStyle
                          : line.role === "note" || line.role === "footer"
                            ? previewNoteStyle
                            : previewHeaderStyle;

                const className =
                  line.role === "section"
                    ? "mb-1 text-[#7c756d]"
                    : line.role === "note"
                      ? "mt-1 text-[#736c62]"
                      : line.role === "variant"
                        ? "mt-1 text-[#5d564e]"
                        : line.role === "title"
                          ? "font-semibold"
                          : line.role === "total"
                            ? "pt-2 font-semibold"
                            : "";

                return (
                  <div key={`preview-line-${index}`} style={style} className={className}>
                    {line.text}
                  </div>
                );
              })}

              <div className="mt-4 text-xs text-[#9a948a]">
                Capacità righe impostata: {draftSettings.lineCapacity}
              </div>
            </div>
          </div>
        </div>
      </div>

      {stationModal ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#1f1a15]/35 px-4 py-6">
          <div className="w-full max-w-3xl rounded-[12px] border border-[#d8d5cc] bg-white shadow-[0_24px_60px_rgba(31,26,21,0.18)]">
            <div className="border-b border-[#f7f4ee] px-5 py-4">
              <h3 className="text-base font-semibold text-[#2e2a25]">
                {stationModal.mode === "create" ? "Nuova postazione" : "Modifica postazione"}
              </h3>
            </div>

            <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Nome postazione</span>
                <input
                  type="text"
                  value={stationModal.station.name}
                  onChange={(event) => updateStationModal("name", event.target.value)}
                  className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                />
              </label>

              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Stampante associata</span>
                <select
                  value={stationModal.station.printerId ?? ""}
                  onChange={(event) =>
                    updateStationModal("printerId", event.target.value || null)
                  }
                  className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                >
                  <option value="">Nessuna stampante</option>
                  {printers.map((printer) => (
                    <option key={printer.id} value={printer.id}>
                      {printer.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Numero copie</span>
                <input
                  type="number"
                  min={1}
                  value={stationModal.station.copies}
                  onChange={(event) =>
                    updateStationModal("copies", Math.max(1, Number(event.target.value) || 1))
                  }
                  className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                />
              </label>

              <label className="flex items-center gap-2 rounded-[8px] border border-[#f7f4ee] bg-[#ffffff] px-3 py-3 text-sm text-[#4a4540]">
                <input
                  type="checkbox"
                  checked={stationModal.station.enabled}
                  onChange={(event) => updateStationModal("enabled", event.target.checked)}
                  className="h-4 w-4 accent-[#0b3c5d]"
                />
                Attiva
              </label>

              <div className="md:col-span-2">
                <div className="mb-2 text-sm font-medium text-[#4a4540]">Categorie assegnate</div>
                <div className="grid max-h-[220px] gap-2 overflow-auto rounded-[8px] border border-[#f7f4ee] bg-[#ffffff] p-3 md:grid-cols-2">
                  {categories.map((category) => (
                    <label key={category} className="flex items-center gap-2 text-sm text-[#4a4540]">
                      <input
                        type="checkbox"
                        checked={stationModal.station.categories.includes(category)}
                        onChange={() => handleToggleStationCategory(category)}
                        className="h-4 w-4 accent-[#0b3c5d]"
                      />
                      {category}
                    </label>
                  ))}
                </div>
              </div>

              <label className="grid gap-1 text-sm text-[#4a4540] md:col-span-2">
                <span className="font-medium">Note</span>
                <textarea
                  value={stationModal.station.notes}
                  onChange={(event) => updateStationModal("notes", event.target.value)}
                  rows={3}
                  className="rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 py-2 outline-none"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#f7f4ee] px-5 py-4">
              <button
                type="button"
                onClick={() => setStationModal(null)}
                className="rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-4 py-2 text-sm font-medium text-[#4a4540]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleSaveStation}
                className="rounded-[8px] border border-[#b7cfe4] bg-[#cfe8ff] px-4 py-2 text-sm font-semibold text-[#0b3c5d]"
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
            <h3 className="text-base font-semibold text-[#2e2a25]">Elimina postazione</h3>
            <p className="mt-2 text-sm text-[#5f5952]">
              Eliminare la postazione {deleteTarget.name}?
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-4 py-2 text-sm font-medium text-[#4a4540]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleDeleteStation}
                className="rounded-[8px] border border-[#e5c8c8] bg-[#fff5f5] px-4 py-2 text-sm font-semibold text-[#9a3d3d]"
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
