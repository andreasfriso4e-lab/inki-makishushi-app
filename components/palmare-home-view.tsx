"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { buildOrderRoute } from "@/lib/app-mode";
import { getRestaurantConfig } from "@/lib/restaurant-config";
import { getTableOperationalModeLabel, getTableOperationalState } from "@/lib/table-operational-status";
import { useAuth } from "@/store/auth-context";
import { useTables } from "@/store/table-context";

type PalmareFilterMode = "all" | "free" | "busy" | "mine";
const PALMARE_LOGIN_TIMEOUT_MS = 6000;
const PALMARE_SESSION_OPERATOR_STORAGE_KEY = "inki-palmare-session-operator-id";

export function PalmareHomeView() {
  const router = useRouter();
  const restaurantConfig = getRestaurantConfig();
  const { rooms } = useTables();
  const { activeUsers, currentUser, hasPermission, loginAsUser } = useAuth();
  const [isPalmareAuthenticated, setIsPalmareAuthenticated] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [filterMode, setFilterMode] = useState<PalmareFilterMode>("all");
  const [isOperatorSheetOpen, setIsOperatorSheetOpen] = useState(true);
  const [isBurgerMenuOpen, setIsBurgerMenuOpen] = useState(false);
  const [selectedOperatorId, setSelectedOperatorId] = useState<string | null>(null);
  const [operatorPassword, setOperatorPassword] = useState("");
  const [operatorError, setOperatorError] = useState("");
  const [operatorInfoMessage, setOperatorInfoMessage] = useState("");
  const [isSubmittingOperatorLogin, setIsSubmittingOperatorLogin] = useState(false);

  useEffect(() => {
    if (rooms.length === 0) {
      setActiveRoomId("");
      return;
    }

    if (!rooms.some((room) => room.roomId === activeRoomId)) {
      setActiveRoomId(rooms[0].roomId);
    }
  }, [activeRoomId, rooms]);

  useEffect(() => {
    if (!selectedOperatorId && activeUsers.length > 0) {
      setSelectedOperatorId(activeUsers[0].id);
    }
  }, [activeUsers, selectedOperatorId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedOperatorId = window.sessionStorage.getItem(PALMARE_SESSION_OPERATOR_STORAGE_KEY);

    if (savedOperatorId && activeUsers.some((user) => user.id === savedOperatorId)) {
      setIsPalmareAuthenticated(true);
      setIsOperatorSheetOpen(false);
      setSelectedOperatorId(savedOperatorId);
    }
  }, [activeUsers]);

  const activeRoom = rooms.find((room) => room.roomId === activeRoomId) ?? rooms[0];
  const normalizedSearch = searchValue.trim().toLowerCase();
  const visibleTables = useMemo(() => {
    if (!activeRoom) {
      return [];
    }

    return activeRoom.tables.filter((table) => {
      const state = getTableOperationalState(table);
      const matchesSearch =
        !normalizedSearch ||
        table.name.toLowerCase().includes(normalizedSearch) ||
        table.customerName.toLowerCase().includes(normalizedSearch);

      if (!matchesSearch) {
        return false;
      }

      if (filterMode === "free") {
        return state.key === "free";
      }

      if (filterMode === "busy") {
        return state.key !== "free";
      }

      if (filterMode === "mine") {
        return Boolean(table.operator) && table.operator === currentUser.displayName;
      }

      return true;
    });
  }, [activeRoom, currentUser.displayName, filterMode, normalizedSearch]);

  const statusCounters = useMemo(() => {
    const counters = {
      free: 0,
      occupied: 0,
      working: 0,
      payment: 0,
    };

    for (const table of activeRoom?.tables ?? []) {
      const state = getTableOperationalState(table);

      if (state.key === "free") {
        counters.free += 1;
      } else {
        counters.occupied += 1;
      }

      if (state.key === "command-sent" || state.key === "changes-pending") {
        counters.working += 1;
      }

      if (state.key === "ready-payment" || state.key === "prebill-printed") {
        counters.payment += 1;
      }
    }

    return counters;
  }, [activeRoom]);

  const selectedOperator = activeUsers.find((user) => user.id === selectedOperatorId) ?? null;

  const openPalmareTable = (tableId: string, tableStatus: string) => {
    if (!hasPermission("canOpenTables")) {
      return;
    }

    const panelMode = tableStatus === "occupied" ? "sent-summary" : "draft";
    const nextPath = buildOrderRoute(tableId, panelMode, "palmare");

    setIsBurgerMenuOpen(false);
    setIsOperatorSheetOpen(false);
    router.push(nextPath);

    window.setTimeout(() => {
      if (
        typeof window !== "undefined" &&
        `${window.location.pathname}${window.location.search}` !== nextPath
      ) {
        window.location.assign(nextPath);
      }
    }, 120);
  };

  const handleConfirmOperator = async () => {
    setOperatorError("");
    setOperatorInfoMessage("");

    if (!selectedOperatorId) {
      setOperatorError("Seleziona un operatore");
      return;
    }

    setIsSubmittingOperatorLogin(true);
    console.log("[PALMARE][LOGIN] Tentativo login", {
      operatorId: selectedOperatorId,
      passwordLength: operatorPassword.length,
      activeUsers: activeUsers.map((user) => user.id),
    });

    try {
      const result = await Promise.race([
        loginAsUser(
          selectedOperatorId as "admin" | "operator1" | "operator2" | "operator3",
          operatorPassword
        ),
        new Promise<{ success: false; error: string }>((resolve) => {
          window.setTimeout(() => {
            resolve({
              success: false,
              error: "Timeout login operatore: riprova",
            });
          }, PALMARE_LOGIN_TIMEOUT_MS);
        }),
      ]);

      console.log("[PALMARE][LOGIN] Risultato login", {
        operatorId: selectedOperatorId,
        success: result.success,
        error: result.error ?? null,
      });

      if (!result.success) {
        setOperatorError(result.error ?? "Accesso non riuscito");
        return;
      }

      if (result.warning) {
        setOperatorInfoMessage(result.warning);
      }
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(PALMARE_SESSION_OPERATOR_STORAGE_KEY, selectedOperatorId);
      }
      setIsPalmareAuthenticated(true);
      setIsOperatorSheetOpen(false);
      setSelectedOperatorId(null);
      setOperatorPassword("");
      setOperatorError("");
    } catch (error) {
      console.error("[PALMARE][LOGIN] Errore imprevisto", error);
      setOperatorError(
        error instanceof Error ? error.message : "Errore inatteso durante il login"
      );
    } finally {
      setIsSubmittingOperatorLogin(false);
    }
  };

  const openOperatorSheet = () => {
    setIsBurgerMenuOpen(false);
    setIsOperatorSheetOpen(true);
    setSelectedOperatorId(currentUser.id);
    setOperatorPassword("");
    setOperatorError("");
    setOperatorInfoMessage("");
  };

  const handlePalmareLogout = () => {
    setIsBurgerMenuOpen(false);
    setIsPalmareAuthenticated(false);
    setIsOperatorSheetOpen(true);
    setSelectedOperatorId(null);
    setOperatorPassword("");
    setOperatorError("");
    setOperatorInfoMessage("");
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(PALMARE_SESSION_OPERATOR_STORAGE_KEY);
    }
  };

  const renderOperatorAccessCard = () => (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-[#fffdfa] px-4 py-6">
      <form
        className="w-full max-w-sm rounded-[18px] border border-[#d8d5cc] bg-white p-4 shadow-[0_18px_36px_rgba(31,26,21,0.08)]"
        onSubmit={(event) => {
          event.preventDefault();
          void handleConfirmOperator();
        }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8a8379]">
          Modalita palmare
        </div>
        <div className="mt-1 text-lg font-bold text-[#2e2a25]">{restaurantConfig.appTitle}</div>
        <div className="mt-4 text-sm font-semibold text-[#2e2a25]">Seleziona operatore</div>
        <div className="mt-3 grid gap-2">
          {activeUsers.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => {
                setSelectedOperatorId(user.id);
                setOperatorPassword("");
                setOperatorError("");
                setOperatorInfoMessage("");
              }}
              className={[
                "rounded-[12px] border px-4 py-3 text-left text-sm font-semibold",
                selectedOperatorId === user.id
                  ? "border-[#a9c9e6] bg-[#eef7ff] text-[#0b3c5d]"
                  : "border-[#d8d5cc] bg-white text-[#2e2a25]",
              ].join(" ")}
            >
              {user.displayName}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <div className="mb-2 text-sm font-medium text-[#2e2a25]">Password / PIN</div>
          <input
            type="password"
            value={operatorPassword}
            onChange={(event) => setOperatorPassword(event.target.value)}
            className="h-12 w-full rounded-[12px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
            placeholder="Inserisci password o PIN"
            autoComplete="current-password"
          />
        </div>

        {operatorError ? (
          <div className="mt-3 rounded-[10px] border border-[#e5c8c8] bg-[#fff5f5] px-3 py-2 text-sm text-[#9a3d3d]">
            {operatorError}
          </div>
        ) : null}
        {operatorInfoMessage ? (
          <div className="mt-3 rounded-[10px] border border-[#d8d5cc] bg-[#f8f6f1] px-3 py-2 text-sm text-[#6a645b]">
            {operatorInfoMessage}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSubmittingOperatorLogin}
          className="mt-4 h-12 w-full rounded-[12px] border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-sm font-semibold text-[#0b3c5d] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmittingOperatorLogin ? "Accesso..." : "Entra"}
        </button>
      </form>
    </div>
  );

  if (!isPalmareAuthenticated) {
    return renderOperatorAccessCard();
  }

  return (
    <main className="min-h-[100dvh] w-full bg-[#fffdfa] text-[#2e2a25]">
      <div className="flex min-h-[100dvh] w-full flex-col bg-[#fffdfa]">
        <header className="sticky top-0 z-20 border-b border-[#d8d5cc] bg-[#111111] px-3 py-2.5 text-white">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                Modalita palmare
              </div>
              <div className="mt-0.5 text-[13px] font-bold leading-tight">{restaurantConfig.appTitle}</div>
            </div>
            <div className="relative flex items-center gap-3">
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.08em] text-white/60">Operatore</div>
                <div className="text-[13px] font-semibold leading-tight">{currentUser.displayName}</div>
              </div>
              <button
                type="button"
                aria-label="Apri menu operatore"
                aria-expanded={isBurgerMenuOpen}
                onClick={() => setIsBurgerMenuOpen((current) => !current)}
                className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-white/15 bg-white/10"
              >
                <span className="flex flex-col gap-1">
                  <span className="block h-0.5 w-4 rounded-full bg-white" />
                  <span className="block h-0.5 w-4 rounded-full bg-white" />
                  <span className="block h-0.5 w-4 rounded-full bg-white" />
                </span>
              </button>
              {isBurgerMenuOpen ? (
                <>
                  <button
                    type="button"
                    aria-label="Chiudi menu operatore"
                    onClick={() => setIsBurgerMenuOpen(false)}
                    className="fixed inset-0 z-20 cursor-default bg-transparent"
                  />
                  <div className="absolute right-0 top-[calc(100%+10px)] z-30 max-h-[calc(100dvh-84px)] w-52 overflow-y-auto rounded-[14px] border border-[#2f2f2f] bg-[#1a1a1a] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] shadow-[0_18px_36px_rgba(0,0,0,0.28)]">
                    <div className="px-3 pb-2 pt-1 text-[10px] uppercase tracking-[0.12em] text-white/45">
                      Menu operatore
                    </div>
                    <button
                      type="button"
                      onClick={openOperatorSheet}
                      className="flex w-full items-center justify-between rounded-[10px] px-3 py-3 text-left text-sm font-semibold text-white hover:bg-white/10"
                    >
                      <span>Cambia operatore</span>
                      <span className="text-white/45">›</span>
                    </button>
                    <button
                      type="button"
                      onClick={handlePalmareLogout}
                      className="mt-1 flex w-full items-center justify-between rounded-[10px] px-3 py-3 text-left text-sm font-semibold text-white hover:bg-white/10"
                    >
                      <span>Logout</span>
                      <span className="text-white/45">×</span>
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </header>
        {operatorInfoMessage ? (
          <div className="border-b border-[#e5e0d7] bg-[#f8f6f1] px-3 py-2 text-xs font-medium text-[#6a645b]">
            {operatorInfoMessage}
          </div>
        ) : null}

        <section className="border-b border-[#e5e0d7] bg-[#f7f4ee] px-2.5 py-2.5">
          <div className="mb-2.5 grid grid-cols-4 gap-1.5 text-center">
            <div className="rounded-[10px] border border-[#d8d5cc] bg-white px-1.5 py-1.5">
              <div className="text-[10px] uppercase text-[#7a736a]">Liberi</div>
              <div className="mt-0.5 text-[13px] font-bold text-[#2e2a25]">{statusCounters.free}</div>
            </div>
            <div className="rounded-[10px] border border-[#d8d5cc] bg-white px-1.5 py-1.5">
              <div className="text-[10px] uppercase text-[#7a736a]">Occupati</div>
              <div className="mt-0.5 text-[13px] font-bold text-[#2e2a25]">{statusCounters.occupied}</div>
            </div>
            <div className="rounded-[10px] border border-[#d8d5cc] bg-white px-1.5 py-1.5">
              <div className="text-[10px] uppercase text-[#7a736a]">Lavorazione</div>
              <div className="mt-0.5 text-[13px] font-bold text-[#8d4f00]">{statusCounters.working}</div>
            </div>
            <div className="rounded-[10px] border border-[#d8d5cc] bg-white px-1.5 py-1.5">
              <div className="text-[10px] uppercase text-[#7a736a]">Conto</div>
              <div className="mt-0.5 text-[13px] font-bold text-[#0b3c5d]">{statusCounters.payment}</div>
            </div>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {rooms.map((room) => (
              <button
                key={room.roomId}
                type="button"
                onClick={() => setActiveRoomId(room.roomId)}
                className={[
                  "shrink-0 rounded-[999px] border px-3 py-1.5 text-xs font-semibold",
                  room.roomId === activeRoomId
                    ? "border-[#a9c9e6] bg-[#cfe8ff] text-[#0b3c5d]"
                    : "border-[#d8d5cc] bg-white text-[#2e2a25]",
                ].join(" ")}
              >
                {room.roomName}
              </button>
            ))}
          </div>

          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {[
              { id: "all" as const, label: "Tutti" },
              { id: "free" as const, label: "Liberi" },
              { id: "busy" as const, label: "Occupati" },
              { id: "mine" as const, label: "Miei" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilterMode(item.id)}
                className={[
                  "shrink-0 rounded-[999px] border px-2.5 py-1.5 text-[11px] font-semibold",
                  filterMode === item.id
                    ? "border-[#1d1d1d] bg-[#1d1d1d] text-white"
                    : "border-[#d8d5cc] bg-white text-[#2e2a25]",
                ].join(" ")}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-2">
            <input
              type="text"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Cerca tavolo o cliente"
              className="h-10 w-full rounded-[10px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
            />
          </div>
        </section>

        <section className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-[13px] font-bold text-[#2e2a25]">{activeRoom?.roomName || "Sale"}</div>
              <div className="text-[11px] text-[#6a645b]">
                {visibleTables.length} tavoli disponibili
              </div>
            </div>
          </div>

          {!activeRoom ? (
            <div className="rounded-[12px] border border-[#d8d5cc] bg-white px-4 py-5 text-center text-sm text-[#6a645b]">
              Nessuna sala configurata.
            </div>
          ) : visibleTables.length === 0 ? (
            <div className="rounded-[12px] border border-[#d8d5cc] bg-white px-4 py-5 text-center text-sm text-[#6a645b]">
              Nessun tavolo trovato per il filtro corrente.
            </div>
          ) : (
            <div className="space-y-1.5">
              {visibleTables.map((table) => (
                <div
                  key={table.id}
                  onClick={() => openPalmareTable(table.id, table.status)}
                  role="button"
                  tabIndex={hasPermission("canOpenTables") ? 0 : -1}
                  onKeyDown={(event) => {
                    if ((event.key === "Enter" || event.key === " ") && hasPermission("canOpenTables")) {
                      event.preventDefault();
                      openPalmareTable(table.id, table.status);
                    }
                  }}
                  className="rounded-[12px] border border-[#d8d5cc] bg-white px-2.5 py-2 shadow-[0_1px_0_rgba(0,0,0,0.02)]"
                >
                  {(() => {
                    const operationalState = getTableOperationalState(table);
                    const displayStateLabel =
                      getTableOperationalModeLabel(operationalState.key, "palmare") ===
                      "Conto richiesto"
                        ? "Conto"
                        : getTableOperationalModeLabel(operationalState.key, "palmare");

                    return (
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[19px] font-extrabold leading-none text-[#2e2a25]">{table.name}</span>
                        <span
                          className={[
                            "rounded-[999px] border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em]",
                            operationalState.key === "free"
                              ? "border-[#d7d1c7] bg-[#f8f6f1] text-[#6e685f]"
                              : operationalState.key === "changes-pending"
                                ? "border-[#f1c35a] bg-[#fff4da] text-[#8d4f00]"
                                : operationalState.key === "command-sent"
                                  ? "border-[#b9d3ee] bg-[#eef7ff] text-[#24557e]"
                                  : operationalState.key === "ready-payment" ||
                                      operationalState.key === "prebill-printed"
                                    ? "border-[#cbc0f2] bg-[#f5f1ff] text-[#5b4aa5]"
                                    : "border-[#f1d7a4] bg-[#fff9ec] text-[#906428]",
                          ].join(" ")}
                        >
                          {displayStateLabel}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-[#6a645b]">
                        <span>{`${table.guests} coperti`}</span>
                        <span>{`Totale ${operationalState.total.toFixed(2)} EUR`}</span>
                        {table.operator ? <span>{`Operatore: ${table.operator}`}</span> : null}
                        {table.customerName ? <span>{table.customerName}</span> : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!hasPermission("canOpenTables")}
                      onClick={(event) => {
                        event.stopPropagation();
                        openPalmareTable(table.id, table.status);
                      }}
                      className="h-10 shrink-0 rounded-[10px] border border-[#a9c9e6] bg-[#cfe8ff] px-3.5 text-sm font-semibold text-[#0b3c5d] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Apri
                    </button>
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </section>

        {isPalmareAuthenticated && isOperatorSheetOpen ? (
          <div className="fixed inset-0 z-[90] flex items-end bg-black/35">
            <form
              className="max-h-[88dvh] w-full overflow-y-auto rounded-t-[20px] border border-[#d8d5cc] bg-white px-4 pb-[max(1.5rem,calc(env(safe-area-inset-bottom,0px)+1rem))] pt-4 shadow-[0_-20px_48px_rgba(31,26,21,0.18)]"
              onSubmit={(event) => {
                event.preventDefault();
                void handleConfirmOperator();
              }}
            >
              <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-[#ddd6ca]" />
              <div className="text-base font-semibold text-[#2e2a25]">Seleziona operatore</div>
              <div className="mt-4 grid gap-2">
                {activeUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      setSelectedOperatorId(user.id);
                      setOperatorPassword("");
                      setOperatorError("");
                      setOperatorInfoMessage("");
                    }}
                    className={[
                      "rounded-[12px] border px-4 py-3 text-left text-sm font-semibold",
                      selectedOperatorId === user.id
                        ? "border-[#a9c9e6] bg-[#eef7ff] text-[#0b3c5d]"
                        : "border-[#d8d5cc] bg-white text-[#2e2a25]",
                    ].join(" ")}
                  >
                    {user.displayName}
                  </button>
                ))}
              </div>

              {selectedOperator ? (
                <div className="mt-4">
                  <div className="mb-2 text-sm font-medium text-[#2e2a25]">
                    Password per {selectedOperator.displayName}
                  </div>
                  <input
                    type="password"
                    value={operatorPassword}
                    onChange={(event) => setOperatorPassword(event.target.value)}
                    className="h-12 w-full rounded-[12px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                    placeholder="Inserisci password"
                    autoComplete="current-password"
                  />
                </div>
              ) : null}

              {operatorError ? (
                <div className="mt-3 rounded-[10px] border border-[#e5c8c8] bg-[#fff5f5] px-3 py-2 text-sm text-[#9a3d3d]">
                  {operatorError}
                </div>
              ) : null}
              {operatorInfoMessage ? (
                <div className="mt-3 rounded-[10px] border border-[#d8d5cc] bg-[#f8f6f1] px-3 py-2 text-sm text-[#6a645b]">
                  {operatorInfoMessage}
                </div>
              ) : null}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsOperatorSheetOpen(false);
                    setIsBurgerMenuOpen(false);
                  }}
                  className="h-12 rounded-[12px] border border-[#d8d5cc] bg-white px-3 text-sm font-semibold text-[#2e2a25]"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingOperatorLogin}
                  className="h-12 rounded-[12px] border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-sm font-semibold text-[#0b3c5d] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmittingOperatorLogin ? "Accesso..." : "Entra"}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </div>
    </main>
  );
}
