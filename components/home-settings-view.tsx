"use client";

import { useEffect, useMemo, useState } from "react";

import {
  countConfiguredTables,
  createHomeAreaId,
  getHomeAreaSettings,
  getHomeAreaTableNumbers,
  hydrateHomeAreaSettingsFromServer,
  persistHomeAreaSettingsToServer,
  saveHomeAreaSettings,
  type HomeAreaRecord,
} from "@/lib/home-settings";
import { useTables } from "@/store/table-context";

type HomeAreaFormState = {
  id: string | null;
  name: string;
  is_active: boolean;
  start_table_number: string;
  end_table_number: string;
};

const emptyFormState: HomeAreaFormState = {
  id: null,
  name: "",
  is_active: true,
  start_table_number: "1",
  end_table_number: "20",
};

function getNowIso() {
  return new Date().toISOString();
}

function isProtectedArea(area: HomeAreaRecord) {
  return area.id === "take-away";
}

function formatRange(area: HomeAreaRecord) {
  return `${area.start_table_number} - ${area.end_table_number}`;
}

export function HomeSettingsView() {
  const { tables, resetLocalTableState } = useTables();
  const [areas, setAreas] = useState<HomeAreaRecord[]>(() => getHomeAreaSettings());
  const [searchValue, setSearchValue] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [editingArea, setEditingArea] = useState<HomeAreaFormState | null>(null);
  const [areaPendingDeletion, setAreaPendingDeletion] = useState<HomeAreaRecord | null>(null);
  const [isResettingTables, setIsResettingTables] = useState(false);

  useEffect(() => {
    setAreas(getHomeAreaSettings());
    void hydrateHomeAreaSettingsFromServer().then((nextAreas) => {
      setAreas(nextAreas);
    });
  }, []);

  const normalizedSearchValue = searchValue.trim().toLowerCase();

  const filteredAreas = useMemo(
    () =>
      !normalizedSearchValue
        ? areas
        : areas.filter((area) => area.name.toLowerCase().includes(normalizedSearchValue)),
    [areas, normalizedSearchValue]
  );

  const getAreaTables = (area: HomeAreaRecord) =>
    tables.filter((table) => (table.roomId || table.id.split("-").slice(0, -1).join("-")) === area.id);

  const getAreaWithOpenOrders = (area: HomeAreaRecord) =>
    getAreaTables(area).some(
      (table) =>
        table.status === "occupied" ||
        table.paymentStatus === "pending" ||
        (Array.isArray(table.orders) && table.orders.length > 0)
    );

  const getRemovedNumbersWithOpenOrders = (
    area: HomeAreaRecord,
    nextStart: number,
    nextEnd: number
  ) => {
    const excludedNumbers = getHomeAreaTableNumbers(area).filter(
      (tableNumber) => tableNumber < nextStart || tableNumber > nextEnd
    );

    return excludedNumbers.filter((tableNumber) => {
      const tableId = `${area.id}-${tableNumber < 100 ? String(tableNumber).padStart(2, "0") : tableNumber}`;
      const table = tables.find((entry) => entry.id === tableId);

      return Boolean(
        table &&
          (table.status === "occupied" ||
            table.paymentStatus === "pending" ||
            (Array.isArray(table.orders) && table.orders.length > 0))
      );
    });
  };

  const hasRangeOverlap = (
    startTableNumber: number,
    endTableNumber: number,
    areaType: HomeAreaRecord["type"],
    areaIdToIgnore?: string | null
  ) =>
    areas.some((area) => {
      if (area.id === areaIdToIgnore) {
        return false;
      }

      if (area.type !== areaType) {
        return false;
      }

      return !(
        endTableNumber < area.start_table_number || startTableNumber > area.end_table_number
      );
    });

  const openCreateModal = () => {
    setEditingArea({
      ...emptyFormState,
      start_table_number: "1",
      end_table_number: "20",
    });
    setStatusMessage("");
  };

  const openEditModal = (area: HomeAreaRecord) => {
    setEditingArea({
      id: area.id,
      name: area.name,
      is_active: area.is_active,
      start_table_number: String(area.start_table_number),
      end_table_number: String(area.end_table_number),
    });
    setStatusMessage("");
  };

  const closeModal = () => {
    setEditingArea(null);
  };

  const persistAreas = (nextAreas: HomeAreaRecord[]) => {
    const savedAreas = saveHomeAreaSettings(nextAreas);
    setAreas(savedAreas);
    void persistHomeAreaSettingsToServer(savedAreas).then((remoteAreas) => {
      setAreas(remoteAreas);
    });
    return savedAreas;
  };

  const handleSubmitArea = () => {
    if (!editingArea) {
      return;
    }

    const trimmedName = editingArea.name.trim();
    const startTableNumber = Number.parseInt(editingArea.start_table_number, 10);
    const endTableNumber = Number.parseInt(editingArea.end_table_number, 10);

    if (!trimmedName) {
      setStatusMessage("Inserisci il nome sala");
      return;
    }

    if (
      !Number.isFinite(startTableNumber) ||
      !Number.isFinite(endTableNumber) ||
      startTableNumber < 1 ||
      endTableNumber > 200
    ) {
      setStatusMessage("La numerazione tavoli deve restare tra 1 e 200");
      return;
    }

    if (endTableNumber < startTableNumber) {
      setStatusMessage("Il numero finale deve essere maggiore o uguale al numero iniziale");
      return;
    }

    const existingArea = editingArea.id
      ? areas.find((area) => area.id === editingArea.id) ?? null
      : null;

    if (
      hasRangeOverlap(
        startTableNumber,
        endTableNumber,
        existingArea?.type ?? "room",
        editingArea.id
      )
    ) {
      setStatusMessage("Intervallo tavoli sovrapposto a una sala già configurata");
      return;
    }

    if (existingArea) {
      const removedNumbersWithOpenOrders = getRemovedNumbersWithOpenOrders(
        existingArea,
        startTableNumber,
        endTableNumber
      );

      if (removedNumbersWithOpenOrders.length > 0) {
        setStatusMessage(
          `Impossibile ridurre l'intervallo: i tavoli ${removedNumbersWithOpenOrders.join(", ")} hanno ordini aperti`
        );
        return;
      }
    }

    const now = getNowIso();
    const generatedAreaId = editingArea.id || createHomeAreaId(trimmedName);

    if (!existingArea && areas.some((area) => area.id === generatedAreaId)) {
      setStatusMessage("Esiste già una sala con questo nome");
      return;
    }

    const nextArea: HomeAreaRecord = {
      id: generatedAreaId,
      name: trimmedName,
      type: existingArea?.type ?? "room",
      is_active: editingArea.is_active,
      start_table_number: startTableNumber,
      end_table_number: endTableNumber,
      created_at: existingArea?.created_at || now,
      updated_at: now,
    };

    const nextAreas = existingArea
      ? areas.map((area) => (area.id === existingArea.id ? nextArea : area))
      : [...areas, nextArea];

    persistAreas(nextAreas);
    setStatusMessage(existingArea ? "Sala aggiornata" : "Nuova sala creata");
    closeModal();
  };

  const handleToggleArea = (area: HomeAreaRecord) => {
    if (
      !area.is_active &&
      hasRangeOverlap(area.start_table_number, area.end_table_number, area.type, area.id)
    ) {
      setStatusMessage("Intervallo tavoli non disponibile per la riattivazione di questa sala");
      return;
    }

    if (area.is_active && getAreaWithOpenOrders(area)) {
      setStatusMessage("Non puoi disattivare una sala con tavoli aperti o ordini in corso");
      return;
    }

    const nextArea = {
      ...area,
      is_active: !area.is_active,
      updated_at: getNowIso(),
    };

    persistAreas(areas.map((entry) => (entry.id === area.id ? nextArea : entry)));
    setStatusMessage(nextArea.is_active ? "Sala attivata" : "Sala disattivata");
  };

  const handleConfirmDelete = () => {
    if (!areaPendingDeletion) {
      return;
    }

    if (isProtectedArea(areaPendingDeletion)) {
      setStatusMessage("Take Away è una sezione base e non può essere eliminata");
      setAreaPendingDeletion(null);
      return;
    }

    if (getAreaWithOpenOrders(areaPendingDeletion)) {
      setStatusMessage("La sala ha tavoli attivi o ordini aperti: puoi solo disattivarla");
      setAreaPendingDeletion(null);
      return;
    }

    persistAreas(areas.filter((area) => area.id !== areaPendingDeletion.id));
    setStatusMessage(`Sala "${areaPendingDeletion.name}" eliminata`);
    setAreaPendingDeletion(null);
  };

  const handleResetLocalTableState = async () => {
    if (
      !window.confirm(
        "Confermi il reset completo dello stato tavoli locale? Verrà creato prima un backup dello storage POS."
      )
    ) {
      return;
    }

    setIsResettingTables(true);

    try {
      const result = await resetLocalTableState();
      setStatusMessage(
        result.backupFileName
          ? `Reset tavoli completato · backup salvato in ${result.backupFileName}`
          : "Reset tavoli completato · backup salvato nello storage locale di emergenza"
      );
    } finally {
      setIsResettingTables(false);
    }
  };

  const previewNumbers = editingArea
    ? Array.from(
        {
          length:
            Math.max(
              Number.parseInt(editingArea.end_table_number || "0", 10) -
                Number.parseInt(editingArea.start_table_number || "0", 10) +
                1,
              0
            ) || 0,
        },
        (_, index) => Number.parseInt(editingArea.start_table_number || "0", 10) + index
      ).filter((value) => Number.isFinite(value) && value >= 1 && value <= 200)
    : [];

  return (
    <section className="relative flex min-h-0 flex-1 flex-col bg-[#fffefb]">
      <div className="border-b border-[#d8d5cc] bg-[#f7f4ee] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-[#2e2a25]">Home</div>
            <div className="text-xs text-[#6a645b]">
              Gestisci sale e aree visibili nella schermata principale tavoli.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetLocalTableState}
              disabled={isResettingTables}
              className="h-10 rounded-[4px] border border-[#e2c5c5] bg-[#fff5f5] px-4 text-sm font-semibold text-[#8b2d2d] disabled:opacity-60"
            >
              {isResettingTables ? "Reset in corso..." : "Reset stato tavoli locale"}
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="h-10 rounded-[4px] border border-[#a9c9e6] bg-[#cfe8ff] px-4 text-sm font-semibold text-[#0b3c5d]"
            >
              Nuova sala
            </button>
          </div>
        </div>

        <div className="mt-3">
          <div className="flex h-10 items-center rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-[#6a645b]">
            <input
              type="text"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Cerca sala"
              className="h-full w-full bg-transparent text-sm text-[#2e2a25] outline-none placeholder:text-[#9b9489]"
            />
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[4px] border border-[#d8d5cc] bg-[#ffffff]">
          <div className="grid grid-cols-[minmax(0,1.4fr)_120px_140px_130px_56px_56px] items-center border-b border-[#d8d5cc] bg-[#fbf8f2] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.04em] text-[#5d564e]">
            <span>Sala</span>
            <span>Stato</span>
            <span>Tavoli</span>
            <span>Intervallo</span>
            <span className="text-center">Mod</span>
            <span className="text-center">Del</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredAreas.length > 0 ? (
              filteredAreas.map((area) => (
                <div
                  key={area.id}
                  className="grid grid-cols-[minmax(0,1.4fr)_120px_140px_130px_56px_56px] items-center border-b border-[#ece8de] px-4 py-3 text-sm text-[#2e2a25]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{area.name}</div>
                    <div className="mt-1 text-xs text-[#7b7369]">
                      {area.type === "takeaway" ? "Area Take Away" : "Sala"}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#5d564e]">
                    <input
                      type="checkbox"
                      checked={area.is_active}
                      onChange={() => handleToggleArea(area)}
                    />
                    {area.is_active ? "Attiva" : "Non attiva"}
                  </label>
                  <div>
                    <div className="font-semibold">{countConfiguredTables(area)}</div>
                    <div className="text-xs text-[#7b7369]">tavoli configurati</div>
                  </div>
                  <div className="font-semibold">{formatRange(area)}</div>
                  <button
                    type="button"
                    onClick={() => openEditModal(area)}
                    className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] text-[#2e2a25] hover:bg-[#fbf8f2]"
                    aria-label={`Modifica ${area.name}`}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    onClick={() => setAreaPendingDeletion(area)}
                    disabled={isProtectedArea(area)}
                    className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] text-[#7c2626] hover:bg-[#f6e3e3] disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Elimina ${area.name}`}
                  >
                    ×
                  </button>
                </div>
              ))
            ) : (
              <div className="px-4 py-6 text-sm text-[#7b7369]">Nessuna sala trovata.</div>
            )}
          </div>
        </div>
      </div>

      {statusMessage ? (
        <div className="border-t border-[#d8d5cc] bg-[#ffffff] px-4 py-2 text-sm text-[#5d564e]">
          {statusMessage}
        </div>
      ) : null}

      {editingArea ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-[560px] rounded-[6px] border border-[#d8d5cc] bg-[#ffffff] shadow-sm">
            <div className="border-b border-[#d8d5cc] bg-[#f7f4ee] px-5 py-4">
              <div className="text-sm font-bold text-[#2e2a25]">
                {editingArea.id ? "Modifica sala" : "Nuova sala"}
              </div>
            </div>
            <div className="grid gap-4 px-5 py-5">
              <label className="block">
                <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Nome sala</div>
                <input
                  type="text"
                  value={editingArea.name}
                  onChange={(event) =>
                    setEditingArea((current) =>
                      current ? { ...current, name: event.target.value } : current
                    )
                  }
                  className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm outline-none"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">
                    Numero iniziale tavoli
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    value={editingArea.start_table_number}
                    onChange={(event) =>
                      setEditingArea((current) =>
                        current ? { ...current, start_table_number: event.target.value } : current
                      )
                    }
                    className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm outline-none"
                  />
                </label>
                <label className="block">
                  <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">
                    Numero finale tavoli
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    value={editingArea.end_table_number}
                    onChange={(event) =>
                      setEditingArea((current) =>
                        current ? { ...current, end_table_number: event.target.value } : current
                      )
                    }
                    className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm outline-none"
                  />
                </label>
              </div>

              <label className="flex items-center gap-2 rounded-[4px] border border-[#ece8de] bg-[#fffefb] px-3 py-3 text-sm text-[#4a4540]">
                <input
                  type="checkbox"
                  checked={editingArea.is_active}
                  onChange={(event) =>
                    setEditingArea((current) =>
                      current ? { ...current, is_active: event.target.checked } : current
                    )
                  }
                />
                Sala attiva
              </label>

              <div className="rounded-[4px] border border-[#d8d5cc] bg-[#fffefc] p-3">
                <div className="text-xs font-semibold uppercase text-[#5d564e]">
                  Anteprima tavoli che verranno creati
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {previewNumbers.length > 0 ? (
                    previewNumbers.slice(0, 24).map((tableNumber) => (
                      <span
                        key={tableNumber}
                        className="rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-2 py-1 text-xs text-[#2e2a25]"
                      >
                        {editingArea.id === "take-away" ? `TA_${tableNumber < 100 ? String(tableNumber).padStart(2, "0") : tableNumber}` : `Tavolo ${tableNumber}`}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-[#7b7369]">Intervallo non valido</span>
                  )}
                </div>
                {previewNumbers.length > 24 ? (
                  <div className="mt-2 text-xs text-[#7b7369]">
                    ... e altri {previewNumbers.length - 24} tavoli
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#d8d5cc] px-5 py-4">
              <button
                type="button"
                onClick={closeModal}
                className="h-10 rounded-[4px] border border-[#c7c1b6] bg-[#ffffff] px-4 text-sm font-semibold text-[#2e2a25]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleSubmitArea}
                className="h-10 rounded-[4px] border border-[#a9c9e6] bg-[#cfe8ff] px-4 text-sm font-semibold text-[#0b3c5d]"
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {areaPendingDeletion ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-[360px] rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] p-4">
            <div className="text-sm font-bold text-[#2e2a25]">Conferma eliminazione</div>
            <div className="mt-2 text-sm text-[#5d564e]">
              Vuoi eliminare la sala &quot;{areaPendingDeletion.name}&quot;?
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAreaPendingDeletion(null)}
                className="h-10 rounded-[4px] border border-[#c7c1b6] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="h-10 rounded-[4px] border border-[#d7b3b3] bg-[#fff5f5] px-3 text-sm font-semibold text-[#7c2626]"
              >
                Conferma
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
