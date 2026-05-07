"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AppOrdersView } from "@/components/app-orders-view";
import { CategoriesSettingsView } from "@/components/categories-settings-view";
import {
  buildTodayFinancialSummary,
  canRunDailyClose,
  createFinancialReportDocument,
  runDailyClose,
} from "@/lib/cash-close";
import { hydrateDocumentArchiveFromServer } from "@/lib/document-archive";
import { hydrateFidelityStateFromServer } from "@/lib/fidelity-data";
import { hydrateFiscalPrinterLogsFromServer } from "@/lib/fiscal-printer-log";
import { CompanySettingsView } from "@/components/company-settings-view";
import { CompaniesSettingsView } from "@/components/companies-settings-view";
import { DepartmentsSettingsView } from "@/components/departments-settings-view";
import { DocumentArchiveView } from "@/components/document-archive-view";
import { FidelityCardView } from "@/components/fidelity-card-view";
import { FavoritesView } from "@/components/favorites-view";
import { HomeSettingsView } from "@/components/home-settings-view";
import { OperatorRolesSettingsView } from "@/components/operator-roles-settings-view";
import { OrderStatusView } from "@/components/order-status-view";
import { OrderCommandSettingsView } from "@/components/order-command-settings-view";
import { OrderPanel } from "@/components/order-panel";
import { PaymentSettingsView } from "@/components/payment-settings-view";
import { PosSidebar } from "@/components/pos-sidebar";
import { PrinterSettingsView } from "@/components/printer-settings-view";
import { ProductsSettingsView } from "@/components/products-settings-view";
import { ReportHubView } from "@/components/report-hub-view";
import { ReservationsCalendarView } from "@/components/reservations-calendar-view";
import { TableCard } from "@/components/table-card";
import { VatRatesSettingsView } from "@/components/vat-rates-settings-view";
import { buildOrderRoute } from "@/lib/app-mode";
import { getProductCategories } from "@/lib/pos-data";
import { PrintJobService } from "@/lib/print-job-service";
import { getRestaurantConfig, isRestaurantViewEnabled } from "@/lib/restaurant-config";
import { syncSharedPrintingConfig } from "@/lib/shared-printing-config";
import { hydrateStornoRecordsFromServer } from "@/lib/storno-log";
import { getTableOperationalState } from "@/lib/table-operational-status";
import { hydrateAuditLogFromServer } from "@/repositories/audit-log-repository";
import { recordAuditEvent } from "@/services/audit-log-service";
import { useAuth } from "@/store/auth-context";
import { useTables } from "@/store/table-context";

export function CassaHomeView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const restaurantConfig = getRestaurantConfig();
  const { rooms, tables } = useTables();
  const { activeUsers, currentUser, currentSession, currentActor, loginAsUser, hasPermission } =
    useAuth();
  const [activeRoomId, setActiveRoomId] = useState<string>("");
  const [selectedTableId, setSelectedTableId] = useState<string>("");
  const [searchValue, setSearchValue] = useState("");
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [selectedLoginUserId, setSelectedLoginUserId] = useState<string | null>(null);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isCloseCashModalOpen, setIsCloseCashModalOpen] = useState(false);
  const [isDailyCloseConfirmOpen, setIsDailyCloseConfirmOpen] = useState(false);
  const [closeCashMessage, setCloseCashMessage] = useState("");
  const requestedView = searchParams.get("view");
  const requestedOrDefaultView =
    requestedView === "favorites"
      ? "favorites"
      : requestedView === "order-status"
        ? "order-status"
        : requestedView === "app-orders"
          ? "app-orders"
          : requestedView === "settings-company"
            ? "settings-company"
            : requestedView === "settings-home"
              ? "settings-home"
              : requestedView === "settings-companies"
                ? "settings-companies"
                : requestedView === "settings-departments"
                  ? "settings-departments"
                  : requestedView === "settings-categories"
                    ? "settings-categories"
                    : requestedView === "settings-products"
                      ? "settings-products"
                      : requestedView === "settings-vat"
                        ? "settings-vat"
                        : requestedView === "settings-printers"
                          ? "settings-printers"
                          : requestedView === "settings-roles"
                            ? "settings-roles"
                            : requestedView === "settings-commands"
                              ? "settings-commands"
                              : requestedView === "settings-payments"
                                ? "settings-payments"
                                : requestedView === "fidelity"
                                  ? "fidelity"
                                  : requestedView === "documenti"
                                    ? "documenti"
                                    : requestedView === "report"
                                      ? "report"
                                      : requestedView === "calendar"
                                        ? "calendar"
                                        : "tables";
  const activeView = isRestaurantViewEnabled(requestedOrDefaultView)
    ? requestedOrDefaultView
    : "tables";

  const activeRoom = rooms.find((room) => room.roomId === activeRoomId) ?? rooms[0];
  const normalizedSearch = searchValue.trim().toLowerCase();
  const filteredTables = !activeRoom
    ? []
    : !normalizedSearch
      ? activeRoom.tables
      : activeRoom.tables.filter((table) =>
          [
            table.name,
            table.customerName ?? "",
            table.companyName ?? "",
            table.operator ?? "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch)
        );

  useEffect(() => {
    void syncSharedPrintingConfig();
    void hydrateDocumentArchiveFromServer();
    void hydrateFidelityStateFromServer();
    void hydrateAuditLogFromServer();
    void hydrateFiscalPrinterLogsFromServer();
    void hydrateStornoRecordsFromServer();
  }, []);

  useEffect(() => {
    if (rooms.length === 0) {
      setActiveRoomId("");
      setSelectedTableId("");
      return;
    }

    if (!rooms.some((room) => room.roomId === activeRoomId)) {
      setActiveRoomId(rooms[0].roomId);
    }
  }, [activeRoomId, rooms]);

  useEffect(() => {
    if (!activeRoom) {
      return;
    }

    setSelectedTableId(activeRoom.tables[0]?.id ?? "");
    setSearchValue("");
  }, [activeRoomId, activeRoom]);

  const selectedTable =
    filteredTables.find((table) => table.id === selectedTableId) ||
    activeRoom?.tables.find((table) => table.id === selectedTableId) ||
    filteredTables[0] ||
    activeRoom?.tables[0];

  useEffect(() => {
    if (filteredTables.length === 0) {
      return;
    }

    const tableStillVisible = filteredTables.some((table) => table.id === selectedTableId);

    if (!tableStillVisible) {
      setSelectedTableId(filteredTables[0].id);
    }
  }, [filteredTables, selectedTableId]);

  const selectedLoginUser = activeUsers.find((user) => user.id === selectedLoginUserId) ?? null;
  const openTablesCount = tables.filter(
    (table) => table.status === "occupied" && table.paymentStatus !== "paid"
  ).length;
  const roomOperationalSummary = filteredTables.reduce(
    (summary, table) => {
      const state = getTableOperationalState(table);

      if (state.key === "free") {
        summary.free += 1;
      } else {
        summary.busy += 1;
      }

      if (state.key === "changes-pending") {
        summary.working += 1;
      }

      if (state.key === "command-sent") {
        summary.toServe += 1;
      }

      if (state.key === "ready-payment" || state.key === "prebill-printed") {
        summary.payment += 1;
      }

      return summary;
    },
    { free: 0, busy: 0, working: 0, toServe: 0, payment: 0 }
  );

  const handleOpenUserModal = () => {
    setSelectedLoginUserId(null);
    setLoginPassword("");
    setLoginError("");
    setIsUserModalOpen(true);
  };

  const handleOpenCloseCashModal = () => {
    if (!hasPermission("canCloseCash")) {
      return;
    }

    setCloseCashMessage("");
    setIsDailyCloseConfirmOpen(false);
    setIsCloseCashModalOpen(true);
  };

  const handleCreateFinancialReport = async () => {
    const archivedEntry = createFinancialReportDocument({
      operator: currentUser.displayName,
      operatorId: currentActor.operatorId,
      workstationId: currentSession.workstationId,
      openTablesCount,
    });
    const summary = buildTodayFinancialSummary();
    const printJobs = await new PrintJobService().dispatchPrebillPrintJob({
      tableId: "cash-close",
      tableLabel: "Report finanziario",
      roomLabel: "Cassa",
      operator: currentUser.displayName,
      items: [],
      products: [],
      subtotal: summary.totalSales,
      total: summary.totalSales,
      discountLabel: `Documenti ${summary.totalDocuments}`,
    });
    const failedJob = printJobs.find((job) => job.status === "failed");

    recordAuditEvent({
      eventType: "RECEIPT_PRINTED",
      entityType: "document",
      entityId: archivedEntry.id,
      nextValue: {
        operation: "financial-report",
        totalSales: summary.totalSales,
        totalDocuments: summary.totalDocuments,
      },
      origin: "document",
    });

    setCloseCashMessage(
      failedJob
        ? failedJob.errorMessage || "Report finanziario salvato, ma non stampato"
        : "Report finanziario creato, stampabile e salvato nei Documenti inviati"
    );
    setIsCloseCashModalOpen(false);
    router.push("/cassa?view=documenti");
  };

  const handleConfirmDailyClose = async () => {
    const result = await runDailyClose({
      operator: currentUser.displayName,
      operatorId: currentActor.operatorId,
      workstationId: currentSession.workstationId,
      openTablesCount,
    });

    recordAuditEvent({
      eventType: "FISCAL_PRINT_REQUESTED",
      entityType: "document",
      entityId: result.archivedEntry.id,
      nextValue: {
        operation: "daily-close",
        success: result.success,
        message: result.message,
      },
      origin: "printing",
    });

    setCloseCashMessage(result.message);
    setIsCloseCashModalOpen(false);
    setIsDailyCloseConfirmOpen(false);
    router.push("/cassa?view=documenti");
  };

  const handleConfirmLogin = async () => {
    if (!selectedLoginUserId) {
      setLoginError("Seleziona un utente");
      return;
    }

    const result = await loginAsUser(
      selectedLoginUserId as "admin" | "operator1" | "operator2" | "operator3",
      loginPassword
    );

    if (!result.success) {
      setLoginError(result.error ?? "Accesso non riuscito");
      return;
    }

    setIsUserModalOpen(false);
    setSelectedLoginUserId(null);
    setLoginPassword("");
    setLoginError("");
  };

  return (
    <main className="pos-shell min-h-screen bg-[#fffdfa] text-[#2e2a25]">
      <div className="flex h-screen min-h-screen w-full overflow-hidden border border-[#d8d5cc] bg-[#fffdfa]">
        <PosSidebar
          activeItemId={
            activeView === "favorites"
              ? "favorites"
              : activeView === "order-status"
                ? "order-status"
                : activeView === "app-orders"
                  ? "application"
                  : activeView === "calendar"
                    ? "calendar"
                    : "tables"
          }
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="shrink-0 border-b border-[#cac6bc]">
            <div className="flex min-h-12 flex-wrap items-center gap-2 bg-[#111111] px-3 py-2 text-white">
              <div className="flex h-9 min-w-[160px] items-center rounded-[8px] border border-[#3a3a3a] bg-[#1e1e1e] px-3 text-xs font-bold uppercase tracking-[0.14em]">
                {restaurantConfig.appTitle}
              </div>
              <button
                type="button"
                disabled={!hasPermission("canOpenDrawer")}
                className="h-9 rounded-[8px] border border-[#545454] bg-[#2a2a2a] px-4 text-xs font-semibold"
              >
                Apri cassetto
              </button>
              <button
                type="button"
                disabled={!hasPermission("canCloseCash")}
                onClick={handleOpenCloseCashModal}
                className="h-9 rounded-[8px] border border-[#545454] bg-[#2a2a2a] px-4 text-xs font-semibold"
              >
                Chiudi cassa
              </button>
              <button
                type="button"
                disabled={!hasPermission("canAccessBasePrices")}
                className="h-9 rounded-[8px] border border-[#545454] bg-[#2a2a2a] px-4 text-xs font-semibold"
              >
                Prezzi base
              </button>
              <div className="ml-auto flex min-w-[180px] items-center justify-between rounded-[8px] border border-[#353535] bg-[#1b1b1b] px-3 py-2 text-[11px] text-white/80">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-white/50">
                    Operatore
                  </div>
                  <div className="text-xs font-semibold text-white">{currentUser.displayName}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-white/50">
                    Cassa
                  </div>
                  <div className="text-xs font-semibold text-white">{currentSession.workstationId}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleOpenUserModal}
                className="flex h-9 items-center rounded-[8px] border border-[#545454] bg-[#1f1f1f] px-4 text-xs font-semibold"
              >
                Cambio operatore
              </button>
            </div>

            <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-t border-[#2e2e2e] bg-[#ece9e0] px-3 py-2">
              <div className="flex flex-wrap items-center gap-1">
                {rooms.map((room) => (
                  <button
                    key={room.roomId}
                    type="button"
                    onClick={() => setActiveRoomId(room.roomId)}
                    className={[
                      "h-9 rounded-[8px] border px-4 text-sm font-semibold",
                      room.roomId === activeRoomId
                        ? "border-[#b7b2a7] bg-[#fffefb] text-[#2e2a25]"
                        : "border-[#d4d0c7] bg-[#e4e0d7] text-[#5c564f]",
                    ].join(" ")}
                  >
                    {room.roomName}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex h-9 items-center rounded-[8px] border border-[#d2cdc3] bg-[#fffefc] px-3">
                  <span className="mr-2 text-[10px] font-bold text-[#6d665e]">SRC</span>
                  <input
                    type="text"
                    value={searchValue}
                    onChange={(event) => setSearchValue(event.target.value)}
                    placeholder="Cerca tavolo o cliente"
                    className="h-full w-[180px] bg-transparent text-sm outline-none placeholder:text-[#9c9488]"
                  />
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { label: "Liberi", value: roomOperationalSummary.free },
                    { label: "Occupati", value: roomOperationalSummary.busy },
                    { label: "Lavorazione", value: roomOperationalSummary.working },
                    { label: "Da servire", value: roomOperationalSummary.toServe },
                    { label: "Conto", value: roomOperationalSummary.payment },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex h-9 min-w-[76px] items-center justify-between rounded-[8px] border border-[#d2cdc3] bg-[#fffefc] px-3 text-[11px] text-[#575147]"
                    >
                      <span className="font-semibold">{item.label}</span>
                      <span className="text-sm font-bold text-[#2e2a25]">{item.value}</span>
                    </div>
                  ))}
                </div>
                <div className="ml-1 flex h-9 items-center rounded-[8px] border border-[#d2cdc3] bg-[#fffefc] px-3 text-[12px] text-[#575147]">
                  {selectedTable ? `Tavolo ${selectedTable.name}` : "Nessun tavolo"}
                </div>
              </div>
            </div>
          </header>

          {activeView === "favorites" ? (
            <FavoritesView categories={getProductCategories()} />
          ) : activeView === "order-status" ? (
            <OrderStatusView />
          ) : activeView === "app-orders" && restaurantConfig.features.appOrders ? (
            <AppOrdersView />
          ) : activeView === "settings-company" ? (
            <CompanySettingsView />
          ) : activeView === "settings-home" ? (
            <HomeSettingsView />
          ) : activeView === "settings-companies" ? (
            <CompaniesSettingsView />
          ) : activeView === "settings-departments" ? (
            <DepartmentsSettingsView />
          ) : activeView === "settings-categories" ? (
            <CategoriesSettingsView />
          ) : activeView === "settings-products" ? (
            <ProductsSettingsView />
          ) : activeView === "settings-vat" ? (
            <VatRatesSettingsView />
          ) : activeView === "settings-printers" ? (
            <PrinterSettingsView />
          ) : activeView === "settings-roles" ? (
            <OperatorRolesSettingsView />
          ) : activeView === "settings-commands" ? (
            <OrderCommandSettingsView />
          ) : activeView === "settings-payments" ? (
            <PaymentSettingsView />
          ) : activeView === "fidelity" && restaurantConfig.features.fidelity ? (
            <FidelityCardView />
          ) : activeView === "documenti" ? (
            <DocumentArchiveView />
          ) : activeView === "report" ? (
            <ReportHubView />
          ) : activeView === "calendar" && restaurantConfig.features.calendar ? (
            <ReservationsCalendarView />
          ) : (
            <section className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_344px] overflow-hidden xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="flex min-h-0 min-w-0 flex-col bg-[#fffefb] px-3 py-3">
                {!activeRoom ? (
                  <div className="flex min-h-0 flex-1 items-center justify-center rounded-[12px] border border-[#d8d5cc] bg-white px-6 text-center text-sm text-[#6a645b]">
                    Nessuna sala configurata.
                  </div>
                ) : filteredTables.length === 0 ? (
                  <div className="flex min-h-0 flex-1 items-center justify-center rounded-[12px] border border-[#d8d5cc] bg-white px-6 text-center text-sm text-[#6a645b]">
                    Nessun tavolo trovato per il filtro corrente.
                  </div>
                ) : (
                  <div className="grid min-h-0 flex-1 auto-rows-[120px] grid-cols-3 gap-3 overflow-y-auto pr-1 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                    {filteredTables.map((table) => (
                      <TableCard
                        key={table.id}
                        table={table}
                        isSelected={table.id === selectedTable?.id}
                        onSelect={(selectedTableData) => {
                          if (!hasPermission("canOpenTables")) {
                            return;
                          }
                          const panelMode =
                            selectedTableData.status === "occupied" ? "sent-summary" : "draft";
                          setSelectedTableId(selectedTableData.id);
                          const nextPath = buildOrderRoute(
                            selectedTableData.id,
                            panelMode,
                            "cassa"
                          );
                          router.push(nextPath);

                          window.setTimeout(() => {
                            if (
                              typeof window !== "undefined" &&
                              (window.location.pathname === "/cassa" || window.location.pathname === "/")
                            ) {
                              window.location.assign(nextPath);
                            }
                          }, 120);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              <OrderPanel table={selectedTable} />
            </section>
          )}
        </div>
      </div>

      {isUserModalOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-lg rounded-[12px] border border-[#d8d5cc] bg-white shadow-[0_24px_60px_rgba(31,26,21,0.18)]">
            <div className="border-b border-[#f7f4ee] px-5 py-4">
              <h2 className="text-base font-semibold text-[#2e2a25]">Cambio utente</h2>
            </div>

            <div className="grid gap-4 px-5 py-5">
              <div className="grid gap-2">
                {activeUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      setSelectedLoginUserId(user.id);
                      setLoginPassword("");
                      setLoginError("");
                    }}
                    className={[
                      "rounded-[8px] border px-4 py-3 text-left text-sm font-semibold",
                      currentUser.id === user.id
                        ? "border-[#b7cfe4] bg-[#eef6ff] text-[#0b3c5d]"
                        : "border-[#d8d5cc] bg-[#ffffff] text-[#2e2a25]",
                      selectedLoginUserId === user.id ? "ring-2 ring-[#cfe8ff]" : "",
                    ].join(" ")}
                  >
                    {user.displayName}
                  </button>
                ))}
              </div>

              {selectedLoginUser ? (
                <div className="grid gap-2">
                  <div className="text-sm font-medium text-[#2e2a25]">
                    Password per {selectedLoginUser.displayName}
                  </div>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(event) => setLoginPassword(event.target.value)}
                    className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                    placeholder="Inserisci password"
                  />
                  {!selectedLoginUser.passwordHash ? (
                    <div className="text-xs text-[#9a3d3d]">
                      Password non configurata per questo utente.
                    </div>
                  ) : null}
                </div>
              ) : null}

              {loginError ? (
                <div className="rounded-[8px] border border-[#e5c8c8] bg-[#fff5f5] px-3 py-2 text-sm text-[#9a3d3d]">
                  {loginError}
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#f7f4ee] px-5 py-4">
              <button
                type="button"
                onClick={() => setIsUserModalOpen(false)}
                className="rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-4 py-2 text-sm font-medium text-[#4a4540]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmLogin()}
                className="rounded-[8px] border border-[#b7cfe4] bg-[#cfe8ff] px-4 py-2 text-sm font-semibold text-[#0b3c5d]"
              >
                Entra
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCloseCashModalOpen ? (
        <div className="fixed inset-0 z-[82] flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-xl rounded-[12px] border border-[#d8d5cc] bg-white shadow-[0_24px_60px_rgba(31,26,21,0.18)]">
            <div className="border-b border-[#f7f4ee] px-5 py-4">
              <h2 className="text-base font-semibold text-[#2e2a25]">Chiudi cassa</h2>
              <p className="mt-1 text-sm text-[#6b645c]">
                Selezionare il tipo di chiusura di cassa che si vuole eseguire
              </p>
            </div>

            <div className="grid gap-4 px-5 py-5">
              {closeCashMessage ? (
                <div className="rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 py-2 text-sm text-[#4a4540]">
                  {closeCashMessage}
                </div>
              ) : null}

              {isDailyCloseConfirmOpen ? (
                <div className="rounded-[10px] border border-[#f0d5d5] bg-[#fff8f8] px-4 py-4 text-sm text-[#7c2626]">
                  Confermi la chiusura giornaliera fiscale? I documenti fiscali del giorno verranno
                  chiusi e azzerati. I tavoli ancora aperti resteranno aperti.
                </div>
              ) : (
                <div className="rounded-[10px] border border-[#d8d5cc] bg-[#ffffff] px-4 py-4 text-sm text-[#4a4540]">
                  <div>{`Operatore: ${currentUser.displayName}`}</div>
                  <div className="mt-1">{`Cassa / dispositivo: ${currentSession.workstationId}`}</div>
                  <div className="mt-1">{`Tavoli ancora aperti: ${openTablesCount}`}</div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#f7f4ee] px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setIsCloseCashModalOpen(false);
                  setIsDailyCloseConfirmOpen(false);
                }}
                className="rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-4 py-2 text-sm font-medium text-[#4a4540]"
              >
                Annulla
              </button>
              {!isDailyCloseConfirmOpen ? (
                <>
                  <button
                    type="button"
                    onClick={handleCreateFinancialReport}
                    className="rounded-[8px] border border-[#bfd6ef] bg-[#eaf3fe] px-4 py-2 text-sm font-semibold text-[#285d8d]"
                  >
                    Report finanziario
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!canRunDailyClose()) {
                        setCloseCashMessage("Stampante RT fiscale non configurata");
                        return;
                      }
                      setCloseCashMessage("");
                      setIsDailyCloseConfirmOpen(true);
                    }}
                    className="rounded-[8px] border border-[#d9b5b5] bg-[#fce8e8] px-4 py-2 text-sm font-semibold text-[#7c2626]"
                  >
                    Chiusura giornaliera
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmDailyClose}
                  className="rounded-[8px] border border-[#d9b5b5] bg-[#fce8e8] px-4 py-2 text-sm font-semibold text-[#7c2626]"
                >
                  Conferma chiusura
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
