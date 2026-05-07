"use client";

import { useEffect, useMemo, useState } from "react";

import { CodeScannerModal } from "@/components/code-scanner-modal";
import {
  appendFidelityScanLog,
  calculateEarnedPoints,
  createEmptyFidelityCustomer,
  FIDELITY_DATA_CHANGED_EVENT,
  findFidelityCustomerByCode,
  hydrateFidelityStateFromServer,
  getFidelityPointsMovements,
  getFidelityRewards,
  getFidelityRewardRedemptions,
  getFidelityCustomers,
  getFidelityScanLogs,
  searchFidelityCustomers,
  upsertFidelityCustomer,
  validateFidelityCodeUniqueness,
  type FidelityCustomer,
  type FidelityScanType,
} from "@/lib/fidelity-data";

type FidelityTab = "cards" | "customers" | "points";
type CustomerModalErrors = Partial<
  Record<"firstName" | "lastName" | "cardCode" | "qrCodeValue", string>
>;
type CustomerModalState =
  | {
      mode: "create" | "edit";
      customer: FidelityCustomer;
      errors: CustomerModalErrors;
    }
  | null;
type ScannerState =
  | {
      target: "lookup" | "cardCode" | "qrCodeValue";
      customerId?: string;
    }
  | null;

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M4 7V4h3" />
      <path d="M17 4h3v3" />
      <path d="M20 17v3h-3" />
      <path d="M7 20H4v-3" />
      <path d="M7 12h10" />
      <path d="M7 9h1" />
      <path d="M10 9h1" />
      <path d="M13 9h1" />
      <path d="M16 9h1" />
      <path d="M7 15h1" />
      <path d="M10 15h1" />
      <path d="M13 15h1" />
      <path d="M16 15h1" />
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

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="3" />
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

function formatPoints(value: number) {
  return `${value.toFixed(0)} pt`;
}

function getCustomerFullName(customer: Pick<FidelityCustomer, "firstName" | "lastName">) {
  return `${customer.firstName} ${customer.lastName}`.trim();
}

export function FidelityCardView() {
  const [activeTab, setActiveTab] = useState<FidelityTab>("cards");
  const [customers, setCustomers] = useState<FidelityCustomer[]>(() => getFidelityCustomers());
  const [searchValue, setSearchValue] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [modalState, setModalState] = useState<CustomerModalState>(null);
  const [scannerState, setScannerState] = useState<ScannerState>(null);
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null);

  useEffect(() => {
    const refreshCustomers = () => {
      setCustomers(getFidelityCustomers());
    };

    void hydrateFidelityStateFromServer().then(() => {
      refreshCustomers();
    });

    window.addEventListener(FIDELITY_DATA_CHANGED_EVENT, refreshCustomers);

    return () => {
      window.removeEventListener(FIDELITY_DATA_CHANGED_EVENT, refreshCustomers);
    };
  }, []);

  const filteredCustomers = useMemo(
    () => searchFidelityCustomers(searchValue),
    [customers, searchValue]
  );

  const selectedCustomer =
    customers.find((customer) => customer.id === detailCustomerId) ?? null;
  const recentScanLogs = useMemo(() => getFidelityScanLogs().slice(0, 6), [customers]);
  const recentPointsMovements = useMemo(() => getFidelityPointsMovements().slice(0, 8), [customers]);
  const recentRewardRedemptions = useMemo(
    () => getFidelityRewardRedemptions().slice(0, 6),
    [customers]
  );
  const fidelityRewards = useMemo(() => getFidelityRewards(), [customers]);

  const openCreateModal = () => {
    setModalState({
      mode: "create",
      customer: createEmptyFidelityCustomer(),
      errors: {},
    });
  };

  const openEditModal = (customer: FidelityCustomer) => {
    setModalState({
      mode: "edit",
      customer: { ...customer },
      errors: {},
    });
  };

  const updateModalCustomer = <Key extends keyof FidelityCustomer>(
    field: Key,
    value: FidelityCustomer[Key]
  ) => {
    setModalState((currentState) =>
      currentState
        ? {
            ...currentState,
            customer: {
              ...currentState.customer,
              [field]: value,
            },
            errors: {
              ...currentState.errors,
              [field]: undefined,
            },
          }
        : currentState
    );
  };

  const handleSaveCustomer = () => {
    if (!modalState) {
      return;
    }

    const trimmedFirstName = modalState.customer.firstName.trim();
    const trimmedLastName = modalState.customer.lastName.trim();
    const trimmedCardCode = modalState.customer.cardCode?.trim() ?? "";
    const trimmedQrCode = modalState.customer.qrCodeValue?.trim() ?? "";
    const nextErrors: CustomerModalErrors = {};

    if (!trimmedFirstName) {
      nextErrors.firstName = "Inserisci il nome";
    }

    if (!trimmedLastName) {
      nextErrors.lastName = "Inserisci il cognome";
    }

    const duplicateCardCustomer = trimmedCardCode
      ? validateFidelityCodeUniqueness(
          customers,
          trimmedCardCode,
          "cardCode",
          modalState.customer.id
        )
      : null;
    const duplicateQrCustomer = trimmedQrCode
      ? validateFidelityCodeUniqueness(
          customers,
          trimmedQrCode,
          "qrCodeValue",
          modalState.customer.id
        )
      : null;

    if (duplicateCardCustomer) {
      nextErrors.cardCode = "Codice già assegnato a un altro cliente";
    }

    if (duplicateQrCustomer) {
      nextErrors.qrCodeValue = "Codice già assegnato a un altro cliente";
    }

    if (Object.keys(nextErrors).length > 0) {
      setModalState((currentState) =>
        currentState
          ? {
              ...currentState,
              errors: nextErrors,
            }
          : currentState
      );
      return;
    }

    const savedCustomer = upsertFidelityCustomer({
      ...modalState.customer,
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
      cardCode: trimmedCardCode,
      qrCodeValue: trimmedQrCode,
    });

    setCustomers(getFidelityCustomers());
    setModalState(null);
    setStatusMessage(
      modalState.mode === "create"
        ? "Cliente fidelity salvato correttamente"
        : "Cliente fidelity aggiornato correttamente"
    );
    setDetailCustomerId(savedCustomer.id);
  };

  const handleScannerDetected = (value: string, scanType: FidelityScanType) => {
    if (!scannerState) {
      return;
    }

    appendFidelityScanLog({
      customerId: scannerState.target === "lookup" ? findFidelityCustomerByCode(value)?.id : scannerState.customerId,
      scanType,
      codeValue: value,
      sourceScreen: scannerState.target === "lookup" ? "fidelity_section" : "customer_form",
    });

    const matchedCustomer = findFidelityCustomerByCode(value);

    if (scannerState.target === "lookup") {
      if (matchedCustomer) {
        setDetailCustomerId(matchedCustomer.id);
        setStatusMessage("Cliente fidelity associato correttamente");
      } else {
        const draftCustomer = createEmptyFidelityCustomer();

        setModalState({
          mode: "create",
          customer: {
            ...draftCustomer,
            cardCode: scanType === "barcode" ? value : "",
            qrCodeValue: scanType === "qr" ? value : "",
          },
          errors: {},
        });
        setStatusMessage("Codice letto: completa i dati del nuovo cliente");
      }

      return;
    }

    const field = scannerState.target;
    const duplicateCustomer = validateFidelityCodeUniqueness(
      customers,
      value,
      field,
      scannerState.customerId
    );

    if (duplicateCustomer) {
      setStatusMessage("Codice già assegnato a un altro cliente");
      return;
    }

    setModalState((currentState) =>
      currentState
        ? {
            ...currentState,
            customer: {
              ...currentState.customer,
              [field]: value,
            },
            errors: {
              ...currentState.errors,
              [field]: undefined,
            },
          }
        : currentState
    );
    setStatusMessage(
      field === "cardCode" ? "Numero tessera acquisito correttamente" : "QR code acquisito correttamente"
    );
  };

  return (
    <section className="min-h-0 flex-1 overflow-hidden bg-[#f5f3ec]">
      <div className="flex h-full min-h-0 flex-col px-6 py-5">
        <div className="rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[22px] font-semibold text-[#2e2a25]">Fidelity Card</div>
              <div className="mt-1 text-sm text-[#6f675d]">
                Gestione carte fedeltà, associazione cliente e scansione tessera/QR.
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex h-10 min-w-[260px] items-center rounded-[6px] border border-[#d8d5cc] bg-white px-3">
                <SearchIcon />
                <input
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Cerca cliente, telefono, tessera o QR"
                  className="ml-2 h-full w-full bg-transparent text-sm outline-none placeholder:text-[#9b9489]"
                />
              </div>
              <button
                type="button"
                onClick={() => setScannerState({ target: "lookup" })}
                className="flex h-10 items-center justify-center gap-2 rounded-[6px] border border-[#d8d5cc] bg-white px-3 text-sm font-semibold text-[#2e2a25]"
              >
                <ScanIcon />
                Scansiona
              </button>
              <button
                type="button"
                onClick={openCreateModal}
                className="flex h-10 items-center justify-center gap-2 rounded-[6px] border border-[#a9c9e6] bg-[#cfe8ff] px-4 text-sm font-semibold text-[#0b3c5d]"
              >
                <PlusIcon />
                Nuovo cliente
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {([
              { id: "cards", label: "Carte" },
              { id: "customers", label: "Clienti" },
              { id: "points", label: "Punti" },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "h-9 rounded-[6px] border px-4 text-sm font-semibold",
                  activeTab === tab.id
                    ? "border-[#a9c9e6] bg-[#cfe8ff] text-[#0b3c5d]"
                    : "border-[#d8d5cc] bg-white text-[#2e2a25]",
                ].join(" ")}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {statusMessage ? (
            <div className="mt-4 rounded-[6px] border border-[#d8d5cc] bg-white px-3 py-2 text-sm text-[#5d564e]">
              {statusMessage}
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] gap-4">
          <div className="min-h-0 overflow-hidden rounded-[8px] border border-[#d8d5cc] bg-[#ffffff]">
            <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1.5fr)_110px_110px_90px_92px] gap-3 border-b border-[#e0ddd4] bg-[#fbf8f2] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#6d665e]">
              <div>Cliente</div>
              <div>Telefono</div>
              <div>{activeTab === "points" ? "Tessera / QR" : "Codice tessera"}</div>
              <div>Stato</div>
              <div>Punti</div>
              <div>Modifica</div>
              <div>Dettaglio</div>
            </div>

            <div className="h-full overflow-y-auto">
              {filteredCustomers.length > 0 ? (
                filteredCustomers.map((customer) => (
                  <div
                    key={customer.id}
                    className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1.5fr)_110px_110px_90px_92px] gap-3 border-b border-[#f7f4ee] px-4 py-3 text-sm text-[#2e2a25]"
                  >
                    <button
                      type="button"
                      onClick={() => setDetailCustomerId(customer.id)}
                      className="min-w-0 text-left"
                    >
                      <div className="truncate font-semibold">{getCustomerFullName(customer)}</div>
                      {activeTab !== "points" ? (
                        <div className="mt-1 truncate text-xs text-[#7b7369]">
                          {customer.email || "Nessuna email"}
                        </div>
                      ) : null}
                    </button>
                    <div className="truncate text-[#5d564e]">{customer.phone || "—"}</div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[#2e2a25]">
                        {customer.cardCode || "Nessuna tessera"}
                      </div>
                      <div className="mt-1 truncate text-xs text-[#7b7369]">
                        QR: {customer.qrCodeValue || "non associato"}
                      </div>
                    </div>
                    <div>
                      <span
                        className={[
                          "inline-flex rounded-full px-2 py-1 text-[11px] font-semibold",
                          customer.isActive
                            ? "bg-[#e6f5e8] text-[#25613a]"
                            : "bg-[#f2ece5] text-[#7a6e5c]",
                        ].join(" ")}
                      >
                        {customer.isActive ? "Attiva" : "Non attiva"}
                      </span>
                    </div>
                    <div className="text-[#0b3c5d]">
                      <div className="font-semibold">{formatPoints(customer.currentPoints)}</div>
                      <div className="mt-1 text-xs text-[#6d665e]">
                        Pending {formatPoints(customer.pendingPoints)}
                      </div>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => openEditModal(customer)}
                        className="flex h-9 w-9 items-center justify-center rounded-[6px] border border-[#d8d5cc] bg-white text-[#2e2a25]"
                        aria-label={`Modifica ${getCustomerFullName(customer)}`}
                      >
                        <PencilIcon />
                      </button>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => setDetailCustomerId(customer.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-[6px] border border-[#d8d5cc] bg-white text-[#2e2a25]"
                        aria-label={`Dettaglio ${getCustomerFullName(customer)}`}
                      >
                        <EyeIcon />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-10 text-center text-sm text-[#7b7369]">
                  Nessun cliente fidelity trovato con i filtri attuali.
                </div>
              )}
            </div>
          </div>

          <aside className="min-h-0 overflow-hidden rounded-[8px] border border-[#d8d5cc] bg-[#ffffff]">
            <div className="border-b border-[#e0ddd4] bg-[#fbf8f2] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#6d665e]">
              {activeTab === "points" ? "Punti e scansioni" : "Dettaglio cliente"}
            </div>
            <div className="h-full overflow-y-auto px-4 py-4">
              {activeTab === "points" ? (
                <div className="space-y-4">
                  <div className="rounded-[6px] border border-[#d8d5cc] bg-white p-3">
                    <div className="text-sm font-semibold text-[#2e2a25]">Regola punti attiva</div>
                    <div className="mt-2 text-sm text-[#6c645b]">
                      1 punto ogni 2 euro spesi. I punti vengono caricati sul totale finale pagato e,
                      se viene usato un premio, il saldo viene aggiornato dopo la conferma pagamento.
                    </div>
                    <div className="mt-3 text-xs text-[#7b7369]">
                      Esempio: EUR 150.00 pagati = {calculateEarnedPoints(150)} punti caricati.
                    </div>
                  </div>

                  <div className="rounded-[6px] border border-[#d8d5cc] bg-white p-3">
                    <div className="text-sm font-semibold text-[#2e2a25]">Premi disponibili</div>
                    <div className="mt-3 space-y-2">
                      {fidelityRewards.map((reward) => (
                        <div
                          key={reward.id}
                          className="flex items-center justify-between gap-3 rounded-[6px] border border-[#f7f4ee] px-3 py-2 text-sm"
                        >
                          <div>
                            <div className="font-semibold text-[#2e2a25]">{reward.name}</div>
                            <div className="mt-1 text-xs text-[#6d665e]">
                              {reward.pointsRequired} punti richiesti
                            </div>
                          </div>
                          <div className="font-semibold text-[#0b3c5d]">-{reward.discountAmount}€</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[6px] border border-[#d8d5cc] bg-white p-3">
                    <div className="text-sm font-semibold text-[#2e2a25]">Ultimi movimenti punti</div>
                    <div className="mt-3 space-y-2">
                      {recentPointsMovements.length > 0 ? (
                        recentPointsMovements.map((movement) => {
                          const customer = customers.find((item) => item.id === movement.customerId);

                          return (
                            <div key={movement.id} className="rounded-[6px] border border-[#f7f4ee] px-3 py-2 text-sm">
                              <div className="flex items-center justify-between gap-3">
                                <div className="font-semibold text-[#2e2a25]">
                                  {customer ? getCustomerFullName(customer) : "Cliente"}
                                </div>
                                <div
                                  className={[
                                    "font-semibold",
                                    movement.type === "earn" ? "text-[#0b3c5d]" : "text-[#8a3434]",
                                  ].join(" ")}
                                >
                                  {movement.type === "earn" ? "+" : "-"}
                                  {movement.points} pt
                                </div>
                              </div>
                              <div className="mt-1 text-xs text-[#6d665e]">{movement.description}</div>
                              <div className="mt-1 text-xs text-[#8a8278]">
                                {new Date(movement.createdAt).toLocaleString("it-IT")}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-sm text-[#7b7369]">Nessun movimento punti registrato.</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[6px] border border-[#d8d5cc] bg-white p-3">
                    <div className="text-sm font-semibold text-[#2e2a25]">Ultimi riscatti premio</div>
                    <div className="mt-3 space-y-2">
                      {recentRewardRedemptions.length > 0 ? (
                        recentRewardRedemptions.map((redemption) => {
                          const customer = customers.find((item) => item.id === redemption.customerId);

                          return (
                            <div key={redemption.id} className="rounded-[6px] border border-[#f7f4ee] px-3 py-2 text-sm">
                              <div className="flex items-center justify-between gap-3">
                                <div className="font-semibold text-[#2e2a25]">
                                  {customer ? getCustomerFullName(customer) : "Cliente"}
                                </div>
                                <div className="text-xs font-semibold uppercase text-[#6d665e]">
                                  {redemption.status}
                                </div>
                              </div>
                              <div className="mt-1 text-xs text-[#6d665e]">
                                {redemption.rewardName} · {redemption.pointsUsed} pt · -{redemption.discountApplied}€
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-sm text-[#7b7369]">Nessun premio riscattato.</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[6px] border border-[#d8d5cc] bg-white p-3">
                    <div className="text-sm font-semibold text-[#2e2a25]">Ultime scansioni</div>
                    <div className="mt-3 space-y-2">
                      {recentScanLogs.length > 0 ? (
                        recentScanLogs.map((scanLog) => {
                          const customer = customers.find((item) => item.id === scanLog.customerId);
                          return (
                            <div key={scanLog.id} className="rounded-[6px] border border-[#f7f4ee] px-3 py-2 text-sm">
                              <div className="font-semibold text-[#2e2a25]">
                                {customer ? getCustomerFullName(customer) : "Cliente non associato"}
                              </div>
                              <div className="mt-1 text-xs text-[#6d665e]">
                                {scanLog.scanType.toUpperCase()} · {scanLog.codeValue}
                              </div>
                              <div className="mt-1 text-xs text-[#8a8278]">
                                {new Date(scanLog.createdAt).toLocaleString("it-IT")} · {scanLog.sourceScreen}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-sm text-[#7b7369]">Nessuna scansione registrata.</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : selectedCustomer ? (
                <div className="space-y-4">
                  <div className="rounded-[6px] border border-[#d8d5cc] bg-white p-3">
                    <div className="text-lg font-semibold text-[#2e2a25]">
                      {getCustomerFullName(selectedCustomer)}
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-3 text-sm text-[#5d564e]">
                      <div>
                        <div className="text-xs font-semibold uppercase text-[#6d665e]">Telefono</div>
                        <div className="mt-1">{selectedCustomer.phone || "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-[#6d665e]">Email</div>
                        <div className="mt-1">{selectedCustomer.email || "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-[#6d665e]">Barcode tessera</div>
                        <div className="mt-1">{selectedCustomer.cardCode || "Non associato"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-[#6d665e]">QR code</div>
                        <div className="mt-1">{selectedCustomer.qrCodeValue || "Non associato"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-[#6d665e]">Punti</div>
                        <div className="mt-1">
                          Attuali {formatPoints(selectedCustomer.currentPoints)} · In attesa{" "}
                          {formatPoints(selectedCustomer.pendingPoints)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-[#6d665e]">Premi disponibili</div>
                        <div className="mt-1">
                          {fidelityRewards
                            .filter((reward) => selectedCustomer.currentPoints >= reward.pointsRequired)
                            .map((reward) => reward.name)
                            .join(", ") || "Nessun premio disponibile"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-[#6d665e]">Ultima lettura</div>
                        <div className="mt-1">
                          {selectedCustomer.lastScanAt
                            ? new Date(selectedCustomer.lastScanAt).toLocaleString("it-IT")
                            : "Nessuna scansione"}
                        </div>
                      </div>
                      {selectedCustomer.notes ? (
                        <div>
                          <div className="text-xs font-semibold uppercase text-[#6d665e]">Note</div>
                          <div className="mt-1 whitespace-pre-wrap">{selectedCustomer.notes}</div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-[6px] border border-[#d8d5cc] bg-white p-3">
                    <div className="text-sm font-semibold text-[#2e2a25]">Storico movimenti punti</div>
                    <div className="mt-3 space-y-2">
                      {recentPointsMovements.filter((movement) => movement.customerId === selectedCustomer.id).length > 0 ? (
                        recentPointsMovements
                          .filter((movement) => movement.customerId === selectedCustomer.id)
                          .map((movement) => (
                            <div key={movement.id} className="rounded-[6px] border border-[#f7f4ee] px-3 py-2 text-sm">
                              <div className="flex items-center justify-between gap-3">
                                <div className="font-semibold text-[#2e2a25]">{movement.description}</div>
                                <div
                                  className={[
                                    "font-semibold",
                                    movement.type === "earn" ? "text-[#0b3c5d]" : "text-[#8a3434]",
                                  ].join(" ")}
                                >
                                  {movement.type === "earn" ? "+" : "-"}
                                  {movement.points} pt
                                </div>
                              </div>
                              <div className="mt-1 text-xs text-[#8a8278]">
                                {new Date(movement.createdAt).toLocaleString("it-IT")}
                              </div>
                            </div>
                          ))
                      ) : (
                        <div className="text-sm text-[#7b7369]">Nessun movimento punti per questo cliente.</div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openEditModal(selectedCustomer)}
                    className="h-10 w-full rounded-[6px] border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-sm font-semibold text-[#0b3c5d]"
                  >
                    Modifica cliente
                  </button>
                </div>
              ) : (
                <div className="rounded-[6px] border border-dashed border-[#d8d5cc] bg-white px-4 py-6 text-sm text-[#7b7369]">
                  Seleziona una carta o un cliente per visualizzare il dettaglio.
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {modalState ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/20 px-4">
          <div className="max-h-[92vh] w-full max-w-[760px] overflow-y-auto rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] p-5 shadow-[0_16px_40px_rgba(46,42,37,0.22)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-[#2e2a25]">
                  {modalState.mode === "create" ? "Nuovo cliente fidelity" : "Modifica cliente fidelity"}
                </div>
                <div className="mt-1 text-sm text-[#6f675d]">
                  Associa barcode tessera e QR code Linky allo stesso profilo cliente.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalState(null)}
                className="flex h-9 w-9 items-center justify-center rounded-[6px] border border-[#d8d5cc] bg-white text-lg text-[#2e2a25]"
                aria-label="Chiudi"
              >
                ×
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <label className="block">
                <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Nome *</div>
                <input
                  value={modalState.customer.firstName}
                  onChange={(event) => updateModalCustomer("firstName", event.target.value)}
                  className="h-10 w-full rounded-[6px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                />
                {modalState.errors.firstName ? (
                  <div className="mt-1 text-xs text-[#b64b4b]">{modalState.errors.firstName}</div>
                ) : null}
              </label>

              <label className="block">
                <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Cognome *</div>
                <input
                  value={modalState.customer.lastName}
                  onChange={(event) => updateModalCustomer("lastName", event.target.value)}
                  className="h-10 w-full rounded-[6px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                />
                {modalState.errors.lastName ? (
                  <div className="mt-1 text-xs text-[#b64b4b]">{modalState.errors.lastName}</div>
                ) : null}
              </label>

              <label className="block">
                <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Telefono</div>
                <input
                  value={modalState.customer.phone ?? ""}
                  onChange={(event) => updateModalCustomer("phone", event.target.value)}
                  className="h-10 w-full rounded-[6px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                />
              </label>

              <label className="block">
                <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Email</div>
                <input
                  value={modalState.customer.email ?? ""}
                  onChange={(event) => updateModalCustomer("email", event.target.value)}
                  className="h-10 w-full rounded-[6px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                />
              </label>

              <label className="block">
                <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Data di nascita</div>
                <input
                  type="date"
                  value={modalState.customer.birthDate ?? ""}
                  onChange={(event) => updateModalCustomer("birthDate", event.target.value)}
                  className="h-10 w-full rounded-[6px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex h-10 items-center justify-between rounded-[6px] border border-[#d8d5cc] bg-white px-3 text-sm text-[#2e2a25]">
                  <span>Consenso marketing</span>
                  <input
                    type="checkbox"
                    checked={modalState.customer.marketingConsent}
                    onChange={(event) => updateModalCustomer("marketingConsent", event.target.checked)}
                    className="h-4 w-4 accent-[#0b3c5d]"
                  />
                </label>
                <label className="flex h-10 items-center justify-between rounded-[6px] border border-[#d8d5cc] bg-white px-3 text-sm text-[#2e2a25]">
                  <span>Attiva</span>
                  <input
                    type="checkbox"
                    checked={modalState.customer.isActive}
                    onChange={(event) => updateModalCustomer("isActive", event.target.checked)}
                    className="h-4 w-4 accent-[#0b3c5d]"
                  />
                </label>
              </div>

              <div className="lg:col-span-2">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Numero tessera / barcode</div>
                    <div className="grid grid-cols-[minmax(0,1fr)_44px] gap-2">
                      <input
                        value={modalState.customer.cardCode ?? ""}
                        onChange={(event) => updateModalCustomer("cardCode", event.target.value)}
                        className="h-10 w-full rounded-[6px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setScannerState({ target: "cardCode", customerId: modalState.customer.id })
                        }
                        className="flex h-10 w-11 items-center justify-center rounded-[6px] border border-[#d8d5cc] bg-white text-[#2e2a25]"
                        aria-label="Scansiona tessera"
                      >
                        <ScanIcon />
                      </button>
                    </div>
                    {modalState.errors.cardCode ? (
                      <div className="mt-1 text-xs text-[#b64b4b]">{modalState.errors.cardCode}</div>
                    ) : null}
                  </div>

                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">QR id associato</div>
                    <div className="grid grid-cols-[minmax(0,1fr)_44px] gap-2">
                      <input
                        value={modalState.customer.qrCodeValue ?? ""}
                        onChange={(event) => updateModalCustomer("qrCodeValue", event.target.value)}
                        className="h-10 w-full rounded-[6px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setScannerState({ target: "qrCodeValue", customerId: modalState.customer.id })
                        }
                        className="flex h-10 w-11 items-center justify-center rounded-[6px] border border-[#d8d5cc] bg-white text-[#2e2a25]"
                        aria-label="Scansiona QR"
                      >
                        <ScanIcon />
                      </button>
                    </div>
                    {modalState.errors.qrCodeValue ? (
                      <div className="mt-1 text-xs text-[#b64b4b]">{modalState.errors.qrCodeValue}</div>
                    ) : null}
                  </div>
                </div>
              </div>

              <label className="block lg:col-span-2">
                <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Note</div>
                <textarea
                  value={modalState.customer.notes ?? ""}
                  onChange={(event) => updateModalCustomer("notes", event.target.value)}
                  rows={4}
                  className="w-full rounded-[6px] border border-[#d8d5cc] bg-white px-3 py-2 text-sm outline-none"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalState(null)}
                className="h-10 rounded-[6px] border border-[#c7c1b6] bg-[#ffffff] px-4 text-sm font-semibold text-[#2e2a25]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleSaveCustomer}
                className="h-10 rounded-[6px] border border-[#a9c9e6] bg-[#cfe8ff] px-4 text-sm font-semibold text-[#0b3c5d]"
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <CodeScannerModal
        isOpen={Boolean(scannerState)}
        title="Scansione tessera fidelity"
        description="Usa la fotocamera posteriore se disponibile oppure inserisci manualmente il codice."
        defaultType={
          scannerState?.target === "cardCode"
            ? "barcode"
            : scannerState?.target === "qrCodeValue"
              ? "qr"
              : "auto"
        }
        onClose={() => setScannerState(null)}
        onDetected={(value, scanType) => {
          handleScannerDetected(value, scanType);
          setScannerState(null);
        }}
      />
    </section>
  );
}
