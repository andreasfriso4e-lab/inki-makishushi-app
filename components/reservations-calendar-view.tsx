"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getReservations,
  saveReservations,
  type ReservationEntry,
  type ReservationService,
  type ReservationSource,
  type ReservationStatus,
} from "@/lib/reservations";

const monthLabels = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
] as const;

const weekdayLabels = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] as const;
const sourceOptions: ReservationSource[] = ["Manuale", "Telefono", "TheFork"];
const serviceOptions: ReservationService[] = ["Pranzo", "Cena"];
const statusOptions: ReservationStatus[] = [
  "Confermata",
  "In attesa",
  "Arrivato",
  "No-show",
  "Annullata",
];
const lunchSlots = [
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
] as const;
const dinnerSlots = [
  "19:00",
  "19:15",
  "19:30",
  "19:45",
  "20:00",
  "20:15",
  "20:30",
  "20:45",
  "21:00",
  "21:15",
  "21:30",
  "21:45",
  "22:00",
  "22:15",
  "22:30",
  "22:45",
  "23:00",
  "23:15",
  "23:30",
  "23:45",
] as const;

type ReservationModalState =
  | {
      mode: "create" | "edit";
      reservationId?: string;
      date: string;
      service: ReservationService;
      customerName: string;
      partySize: string;
      time: string;
      phone: string;
      assignedTable: string;
      note: string;
      status: ReservationStatus;
      source: ReservationSource;
    }
  | null;

type DeleteReservationTarget = {
  id: string;
  customerName: string;
} | null;

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function monthDate(year: number, monthIndex: number, day: number) {
  return new Date(year, monthIndex, day);
}

function formatDateLabel(date: Date) {
  return date.toLocaleDateString("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeReservationTime(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return time;
  }

  const [, hours, minutes] = match;
  return `${hours.padStart(2, "0")}:${minutes}`;
}

function sortTimes(times: Iterable<string>) {
  return Array.from(new Set(Array.from(times).map(normalizeReservationTime))).sort((left, right) =>
    left.localeCompare(right, "it")
  );
}

function getWeekStart(date: Date) {
  const clone = new Date(date);
  const day = clone.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  clone.setDate(clone.getDate() + diff);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function buildWeekDays(date: Date) {
  const start = getWeekStart(date);
  return Array.from({ length: 7 }, (_, index) => {
    const nextDate = new Date(start);
    nextDate.setDate(start.getDate() + index);
    return nextDate;
  });
}

function buildMonthGrid(year: number, monthIndex: number) {
  const firstDay = monthDate(year, monthIndex, 1);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = monthDate(year, monthIndex + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  return Array.from({ length: totalCells }, (_, index) => {
    const dayNumber = index - firstWeekday + 1;

    if (dayNumber < 1 || dayNumber > daysInMonth) {
      return null;
    }

    return monthDate(year, monthIndex, dayNumber);
  });
}

function createModalState(date: Date): Exclude<ReservationModalState, null> {
  const hour = date.getHours() < 15 ? "12:30" : "20:00";
  return {
    mode: "create",
    date: toIsoDate(date),
    service: date.getHours() < 15 ? "Pranzo" : "Cena",
    customerName: "",
    partySize: "2",
    time: hour,
    phone: "",
    assignedTable: "",
    note: "",
    status: "Confermata",
    source: "Manuale",
  };
}

function sourceBadgeClass(source: ReservationSource) {
  if (source === "TheFork") {
    return "border-[#cfe4c7] bg-[#eef8ea] text-[#446a39]";
  }

  if (source === "Telefono") {
    return "border-[#d7d2c7] bg-[#f6f1e6] text-[#665a43]";
  }

  return "border-[#cfe1f7] bg-[#eaf3fe] text-[#285d8d]";
}

export function ReservationsCalendarView() {
  const today = useMemo(() => new Date(), []);
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState(today);
  const [isDayDetailOpen, setIsDayDetailOpen] = useState(false);
  const [reservations, setReservations] = useState<ReservationEntry[]>(() => getReservations());
  const [modalState, setModalState] = useState<ReservationModalState>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteReservationTarget>(null);
  const [dragReservationId, setDragReservationId] = useState<string | null>(null);
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [revealedDeleteReservationId, setRevealedDeleteReservationId] = useState<string | null>(null);
  const [suppressReservationClick, setSuppressReservationClick] = useState(false);

  useEffect(() => {
    setReservations(getReservations());
  }, []);

  const monthGrid = useMemo(
    () =>
      selectedMonthIndex === null ? [] : buildMonthGrid(selectedYear, selectedMonthIndex),
    [selectedMonthIndex, selectedYear]
  );
  const selectedWeekDays = useMemo(() => buildWeekDays(selectedDate), [selectedDate]);

  const reservationsByDate = useMemo(() => {
    return reservations.reduce<Record<string, ReservationEntry[]>>((accumulator, reservation) => {
      if (!accumulator[reservation.date]) {
        accumulator[reservation.date] = [];
      }

      accumulator[reservation.date].push(reservation);
      return accumulator;
    }, {});
  }, [reservations]);

  const openMonth = (monthIndex: number) => {
    const nextDate = monthDate(selectedYear, monthIndex, 1);
    setSelectedMonthIndex(monthIndex);
    setSelectedDate(nextDate);
    setIsDayDetailOpen(false);
  };

  const openDay = (date: Date) => {
    setSelectedDate(date);
    setIsDayDetailOpen(true);
  };

  const closeMonthView = () => {
    setSelectedMonthIndex(null);
    setIsDayDetailOpen(false);
  };

  const openCreateReservation = (date: Date, service: ReservationService = "Pranzo") => {
    const nextState = createModalState(date);
    nextState.service = service;
    nextState.time = service === "Pranzo" ? "12:30" : "20:00";
    setModalState(nextState);
  };

  const openEditReservation = (reservation: ReservationEntry) => {
    if (suppressReservationClick) {
      setSuppressReservationClick(false);
      return;
    }

    if (revealedDeleteReservationId && revealedDeleteReservationId !== reservation.id) {
      setRevealedDeleteReservationId(null);
    }

    if (revealedDeleteReservationId === reservation.id) {
      return;
    }

    setModalState({
      mode: "edit",
      reservationId: reservation.id,
      date: reservation.date,
      time: reservation.time,
      service: reservation.service,
      customerName: reservation.customerName,
      partySize: String(reservation.partySize),
      phone: reservation.phone ?? "",
      assignedTable: reservation.assignedTable ?? "",
      note: reservation.note ?? "",
      status: reservation.status,
      source: reservation.source,
    });
  };

  const handleSaveReservation = () => {
    if (!modalState) {
      return;
    }

    const trimmedName = modalState.customerName.trim();
    const nextPartySize = Number(modalState.partySize);

    if (!trimmedName || !Number.isFinite(nextPartySize) || nextPartySize <= 0) {
      return;
    }

    const nextReservation: ReservationEntry = {
      id:
        modalState.mode === "edit" && modalState.reservationId
          ? modalState.reservationId
          : `reservation-${Date.now()}`,
      date: modalState.date,
      time: modalState.time,
      service: modalState.service,
      customerName: trimmedName,
      partySize: nextPartySize,
      phone: modalState.phone.trim(),
      assignedTable: modalState.assignedTable.trim(),
      note: modalState.note.trim(),
      status: modalState.status,
      source: modalState.source,
    };

    const nextReservations = saveReservations(
      modalState.mode === "edit" && modalState.reservationId
        ? reservations.map((reservation) =>
            reservation.id === modalState.reservationId ? nextReservation : reservation
          )
        : [...reservations, nextReservation]
    );

    setReservations(nextReservations);
    setModalState(null);
  };

  const resetReservationSwipe = () => {
    setDragReservationId(null);
    setDragStartX(null);
    setDragOffset(0);
  };

  const handleReservationPointerStart = (reservationId: string, clientX: number) => {
    setDragReservationId(reservationId);
    setDragStartX(clientX);
    setDragOffset(0);
  };

  const handleReservationPointerMove = (clientX: number) => {
    if (!dragReservationId || dragStartX === null) {
      return;
    }

    const delta = Math.min(0, clientX - dragStartX);
    setDragOffset(Math.max(delta, -96));
  };

  const handleReservationPointerEnd = () => {
    if (!dragReservationId) {
      return;
    }

    if (dragOffset <= -56) {
      setRevealedDeleteReservationId(dragReservationId);
      setSuppressReservationClick(true);
    } else if (revealedDeleteReservationId === dragReservationId) {
      setRevealedDeleteReservationId(null);
      setSuppressReservationClick(true);
    }

    resetReservationSwipe();
  };

  const confirmDeleteReservation = () => {
    if (!deleteTarget) {
      return;
    }

    const nextReservations = saveReservations(
      reservations.filter((reservation) => reservation.id !== deleteTarget.id)
    );
    setReservations(nextReservations);
    setRevealedDeleteReservationId(null);
    setDeleteTarget(null);
  };

  const selectedDayReservations = useMemo(
    () =>
      ((reservationsByDate[toIsoDate(selectedDate)] ?? []) as ReservationEntry[]).sort((a, b) =>
        a.time.localeCompare(b.time, "it")
      ),
    [reservationsByDate, selectedDate]
  );

  const lunchReservations = useMemo(
    () =>
      selectedDayReservations
        .filter((reservation) => reservation.service === "Pranzo")
        .map((reservation) => ({ ...reservation, time: normalizeReservationTime(reservation.time) })),
    [selectedDayReservations]
  );

  const dinnerReservations = useMemo(
    () =>
      selectedDayReservations
        .filter((reservation) => reservation.service === "Cena")
        .map((reservation) => ({ ...reservation, time: normalizeReservationTime(reservation.time) })),
    [selectedDayReservations]
  );

  const lunchDaySlots = useMemo(
    () => sortTimes([...lunchSlots, ...lunchReservations.map((reservation) => reservation.time)]),
    [lunchReservations]
  );

  const dinnerDaySlots = useMemo(
    () => sortTimes([...dinnerSlots, ...dinnerReservations.map((reservation) => reservation.time)]),
    [dinnerReservations]
  );

  const renderServiceSlotGrid = (
    service: ReservationService,
    slots: readonly string[],
    reservationsForService: ReservationEntry[]
  ) => {
    const occupiedSlots = slots
      .map((slot) => ({
        slot,
        reservations: reservationsForService.filter((reservation) => reservation.time === slot),
      }))
      .filter(({ reservations }) => reservations.length > 0);

    return (
      <div className="rounded-[10px] border border-[#e4ded2] bg-white p-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-[0.08em] text-[#766f66]">
            {service}
          </div>
          <button
            type="button"
            onClick={() => openCreateReservation(selectedDate, service)}
            className="rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-2.5 py-1 text-[11px] font-semibold text-[#5f584f]"
          >
            + Aggiungi
          </button>
        </div>

        {occupiedSlots.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
            {occupiedSlots.map(({ slot, reservations }) => (
              <div
                key={`${service}-${slot}`}
                className="rounded-[8px] border border-[#ece6dc] bg-[#fffefc] px-2 py-2"
              >
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#857d73]">
                  {slot}
                </div>
                <div className="mt-2 space-y-1.5">
                  {reservations.map((reservation) => (
                    <div
                      key={reservation.id}
                      className="rounded-[6px] border border-[#ddd8ce] bg-white px-2 py-1.5 text-[12px] text-[#2e2a25]"
                    >
                      {`${reservation.time} | ${reservation.customerName} | ${reservation.partySize}`}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const renderWeeklyReservationCard = (reservation: ReservationEntry) => {
    const currentOffset =
      dragReservationId === reservation.id
        ? dragOffset
        : revealedDeleteReservationId === reservation.id
          ? -88
          : 0;

    return (
      <div key={reservation.id} className="relative overflow-hidden rounded-[8px] border border-[#e5dfd4] bg-[#fcfbf7]">
        <div className="absolute inset-y-0 right-0 flex w-[88px] items-center justify-center bg-[#d97070] text-xs font-bold uppercase tracking-[0.04em] text-white">
          <button
            type="button"
            onClick={() =>
              setDeleteTarget({
                id: reservation.id,
                customerName: reservation.customerName,
              })
            }
            className="flex h-full w-full items-center justify-center"
          >
            Elimina
          </button>
        </div>

        <div
          className="relative bg-[#fcfbf7] transition-transform duration-150 ease-out"
          style={{ transform: `translateX(${currentOffset}px)` }}
          onPointerDown={(event) => handleReservationPointerStart(reservation.id, event.clientX)}
          onPointerMove={(event) => handleReservationPointerMove(event.clientX)}
          onPointerUp={handleReservationPointerEnd}
          onPointerCancel={handleReservationPointerEnd}
          onClick={() => openEditReservation(reservation)}
        >
          <div className="px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-[#2e2a25]">
                  {reservation.time} · {reservation.customerName}
                </div>
                <div className="mt-1 text-xs text-[#6f685f]">
                  {reservation.partySize} persone · {reservation.phone || "Telefono non inserito"}
                </div>
              </div>
              <span
                className={[
                  "rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.06em]",
                  sourceBadgeClass(reservation.source),
                ].join(" ")}
              >
                {reservation.source}
              </span>
            </div>
            <div className="mt-1 text-xs text-[#6f685f]">
              Tavolo: {reservation.assignedTable || "Non assegnato"}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#fffefb] p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#2e2a25]">Calendario Prenotazioni</h1>
          <p className="mt-1 text-sm text-[#6b645c]">
            Agenda interna annuale con prenotazioni Manuale, Telefono e TheFork.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedYear((current) => current - 1)}
            className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#d8d5cc] bg-white text-[#5f584f]"
          >
            <ChevronLeftIcon />
          </button>
          <div className="flex h-10 items-center rounded-[8px] border border-[#d8d5cc] bg-white px-4 text-sm font-semibold text-[#2e2a25]">
            {selectedYear}
          </div>
          <button
            type="button"
            onClick={() => setSelectedYear((current) => current + 1)}
            className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#d8d5cc] bg-white text-[#5f584f]"
          >
            <ChevronRightIcon />
          </button>
        </div>
      </div>

      {selectedMonthIndex === null ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-4 overflow-y-auto md:grid-cols-3 xl:grid-cols-4">
          {monthLabels.map((monthLabel, monthIndex) => (
            <button
              key={monthLabel}
              type="button"
              onClick={() => openMonth(monthIndex)}
              className="flex min-h-[156px] flex-col rounded-[12px] border border-[#ddd8ce] bg-white p-4 text-left hover:bg-[#fffefc]"
            >
              <div className="text-lg font-semibold text-[#2e2a25]">{monthLabel}</div>
              <div className="mt-2 text-sm text-[#6b645c]">
                {Object.values(reservationsByDate)
                  .flat()
                  .filter((reservation) => {
                    const reservationDate = new Date(`${reservation.date}T00:00:00`);
                    return (
                      reservationDate.getFullYear() === selectedYear &&
                      reservationDate.getMonth() === monthIndex
                    );
                  }).length}{" "}
                prenotazioni
              </div>
              <div className="mt-auto text-xs uppercase tracking-[0.08em] text-[#8a8178]">
                Apri mese
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-4 overflow-hidden">
          <div className="flex min-h-0 flex-col rounded-[12px] border border-[#ddd8ce] bg-white">
            <div className="flex items-center justify-between border-b border-[#ece7dd] px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-[#2e2a25]">
                  {isDayDetailOpen
                    ? formatDateLabel(selectedDate)
                    : `${monthLabels[selectedMonthIndex]} ${selectedYear}`}
                </div>
                <div className="text-xs text-[#766f66]">
                  {isDayDetailOpen ? "Vista giornaliera operativa" : "Seleziona un giorno"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isDayDetailOpen ? (
                  <button
                    type="button"
                    onClick={() => setIsDayDetailOpen(false)}
                    className="rounded-[8px] border border-[#d8d5cc] bg-white px-3 py-2 text-xs font-semibold text-[#5f584f]"
                  >
                    Vista mese
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={closeMonthView}
                  className="rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 py-2 text-xs font-semibold text-[#5f584f]"
                >
                  Vista anno
                </button>
              </div>
            </div>

            {isDayDetailOpen ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="mb-4 rounded-[10px] border border-[#e5dfd4] bg-[#fffefc] px-3 py-3">
                  <div className="text-base font-semibold text-[#2e2a25]">
                    {selectedDate.toLocaleDateString("it-IT", {
                      weekday: "long",
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  </div>
                  <div className="mt-1 text-sm text-[#6f685f]">
                    {selectedDayReservations.length} prenotazioni operative nel giorno selezionato
                  </div>
                </div>

                <div className="space-y-4">
                  {renderServiceSlotGrid("Pranzo", lunchDaySlots, lunchReservations)}
                  {renderServiceSlotGrid("Cena", dinnerDaySlots, dinnerReservations)}
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-7 gap-px border-b border-[#ece7dd] bg-[#ece7dd] text-center text-[11px] font-bold uppercase tracking-[0.08em] text-[#766f66]">
                  {weekdayLabels.map((label) => (
                    <div key={label} className="bg-[#f7f4ed] px-2 py-2">
                      {label}
                    </div>
                  ))}
                </div>

                <div className="grid min-h-0 flex-1 grid-cols-7 gap-px bg-[#ece7dd]">
                  {monthGrid.map((date, index) =>
                    date ? (
                      <button
                        key={date.toISOString()}
                        type="button"
                        onClick={() => openDay(date)}
                        className={[
                          "min-h-[92px] bg-white px-2 py-2 text-left hover:bg-[#fffefc]",
                          toIsoDate(date) === toIsoDate(selectedDate) ? "ring-2 ring-inset ring-[#b9d3ee]" : "",
                        ].join(" ")}
                      >
                        <div className="text-sm font-semibold text-[#2e2a25]">{date.getDate()}</div>
                        <div className="mt-2 space-y-1">
                          {(reservationsByDate[toIsoDate(date)] ?? []).slice(0, 3).map((reservation) => (
                            <div
                              key={reservation.id}
                              className="truncate rounded-[6px] border border-[#e5e0d6] bg-[#fffefb] px-1.5 py-1 text-[11px] text-[#5f584f]"
                            >
                              {reservation.time} · {reservation.customerName}
                            </div>
                          ))}
                        </div>
                      </button>
                    ) : (
                      <div key={`empty-${index}`} className="min-h-[92px] bg-[#f5f2eb]" />
                    )
                  )}
                </div>
              </>
            )}
          </div>

          <div className="flex min-h-0 flex-col rounded-[12px] border border-[#ddd8ce] bg-white">
            <div className="flex items-center justify-between border-b border-[#ece7dd] px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-[#2e2a25]">
                  Settimana del {formatDateLabel(selectedWeekDays[0])}
                </div>
                <div className="text-xs text-[#766f66]">
                  Planner operativo pranzo / cena del giorno selezionato
                </div>
              </div>
              <button
                type="button"
                onClick={() => openCreateReservation(selectedDate)}
                className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#cfe2f8] bg-[#e8f2fd] px-4 text-sm font-semibold text-[#265d8c]"
              >
                <PlusIcon />
                Nuova prenotazione
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                {selectedWeekDays.map((date) => {
                  const dayReservations = (reservationsByDate[toIsoDate(date)] ?? []).sort((a, b) =>
                    a.time.localeCompare(b.time, "it")
                  );

                  return (
                    <div
                      key={date.toISOString()}
                      className={[
                        "flex h-[320px] min-h-[320px] flex-col rounded-[10px] border border-[#e7e1d6] bg-[#fffefc] p-3",
                        toIsoDate(date) === toIsoDate(selectedDate) ? "ring-2 ring-inset ring-[#b9d3ee]" : "",
                      ].join(" ")}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <div className="text-sm font-semibold text-[#2e2a25]">
                          {formatDateLabel(date)}
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedDate(date)}
                          className="rounded-[8px] border border-[#d8d5cc] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f584f]"
                        >
                          Seleziona giorno
                        </button>
                      </div>

                      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
                        {serviceOptions.map((service) => {
                          const serviceReservations = dayReservations.filter(
                            (reservation) => reservation.service === service
                          );

                          return (
                            <div
                              key={`${date.toISOString()}-${service}`}
                              className="flex min-h-0 flex-col rounded-[10px] border border-[#e4ded2] bg-white p-3"
                            >
                              <div className="mb-3 flex items-center justify-between">
                                <div className="text-xs font-bold uppercase tracking-[0.08em] text-[#766f66]">
                                  {service}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => openCreateReservation(date, service)}
                                  className="rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-2.5 py-1 text-[11px] font-semibold text-[#5f584f]"
                                >
                                  + Aggiungi
                                </button>
                              </div>

                              {serviceReservations.length > 0 ? (
                                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                                  <div className="space-y-2">
                                    {serviceReservations.map((reservation) =>
                                      renderWeeklyReservationCard(reservation)
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="rounded-[8px] border border-dashed border-[#ddd8ce] bg-[#ffffff] px-3 py-4 text-sm text-[#7a746c]">
                                  Nessuna prenotazione per {service.toLowerCase()}.
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {modalState ? (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/30 px-4">
          <div className="max-h-[88vh] w-full max-w-[760px] overflow-y-auto rounded-[14px] border border-[#d8d5cc] bg-white">
            <div className="border-b border-[#ece7dd] px-5 py-4">
              <div className="text-lg font-semibold text-[#2e2a25]">
                {modalState.mode === "edit" ? "Modifica prenotazione" : "Nuova prenotazione"}
              </div>
              <div className="mt-1 text-sm text-[#6b645c]">
                Inserimento interno con origine Manuale, Telefono o TheFork.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 p-5">
              <label className="text-sm font-medium text-[#49423a]">
                Data
                <input
                  type="date"
                  value={modalState.date}
                  onChange={(event) =>
                    setModalState((current) => (current ? { ...current, date: event.target.value } : current))
                  }
                  className="mt-1 h-11 w-full rounded-[8px] border border-[#d8d5cc] px-3 outline-none"
                />
              </label>
              <label className="text-sm font-medium text-[#49423a]">
                Ora
                <input
                  type="time"
                  value={modalState.time}
                  onChange={(event) =>
                    setModalState((current) => (current ? { ...current, time: event.target.value } : current))
                  }
                  className="mt-1 h-11 w-full rounded-[8px] border border-[#d8d5cc] px-3 outline-none"
                />
              </label>
              <label className="text-sm font-medium text-[#49423a]">
                Servizio
                <select
                  value={modalState.service}
                  onChange={(event) =>
                    setModalState((current) =>
                      current ? { ...current, service: event.target.value as ReservationService } : current
                    )
                  }
                  className="mt-1 h-11 w-full rounded-[8px] border border-[#d8d5cc] px-3 outline-none"
                >
                  {serviceOptions.map((service) => (
                    <option key={service} value={service}>
                      {service}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-[#49423a]">
                Origine prenotazione
                <select
                  value={modalState.source}
                  onChange={(event) =>
                    setModalState((current) =>
                      current ? { ...current, source: event.target.value as ReservationSource } : current
                    )
                  }
                  className="mt-1 h-11 w-full rounded-[8px] border border-[#d8d5cc] px-3 outline-none"
                >
                  {sourceOptions.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 text-sm font-medium text-[#49423a]">
                Nome cliente
                <input
                  type="text"
                  value={modalState.customerName}
                  onChange={(event) =>
                    setModalState((current) =>
                      current ? { ...current, customerName: event.target.value } : current
                    )
                  }
                  className="mt-1 h-11 w-full rounded-[8px] border border-[#d8d5cc] px-3 outline-none"
                />
              </label>
              <label className="text-sm font-medium text-[#49423a]">
                Numero persone
                <input
                  type="number"
                  min="1"
                  value={modalState.partySize}
                  onChange={(event) =>
                    setModalState((current) =>
                      current ? { ...current, partySize: event.target.value } : current
                    )
                  }
                  className="mt-1 h-11 w-full rounded-[8px] border border-[#d8d5cc] px-3 outline-none"
                />
              </label>
              <label className="text-sm font-medium text-[#49423a]">
                Telefono
                <input
                  type="text"
                  value={modalState.phone}
                  onChange={(event) =>
                    setModalState((current) => (current ? { ...current, phone: event.target.value } : current))
                  }
                  className="mt-1 h-11 w-full rounded-[8px] border border-[#d8d5cc] px-3 outline-none"
                />
              </label>
              <label className="text-sm font-medium text-[#49423a]">
                Tavolo assegnato
                <input
                  type="text"
                  value={modalState.assignedTable}
                  onChange={(event) =>
                    setModalState((current) =>
                      current ? { ...current, assignedTable: event.target.value } : current
                    )
                  }
                  className="mt-1 h-11 w-full rounded-[8px] border border-[#d8d5cc] px-3 outline-none"
                />
              </label>
              <label className="text-sm font-medium text-[#49423a]">
                Stato prenotazione
                <select
                  value={modalState.status}
                  onChange={(event) =>
                    setModalState((current) =>
                      current ? { ...current, status: event.target.value as ReservationStatus } : current
                    )
                  }
                  className="mt-1 h-11 w-full rounded-[8px] border border-[#d8d5cc] px-3 outline-none"
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 text-sm font-medium text-[#49423a]">
                Note
                <textarea
                  rows={3}
                  value={modalState.note}
                  onChange={(event) =>
                    setModalState((current) => (current ? { ...current, note: event.target.value } : current))
                  }
                  className="mt-1 w-full rounded-[8px] border border-[#d8d5cc] px-3 py-2 outline-none"
                />
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-[#ece7dd] px-5 py-4">
              <button
                type="button"
                onClick={() => setModalState(null)}
                className="rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-4 py-2 text-sm font-semibold text-[#5f584f]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleSaveReservation}
                className="rounded-[8px] border border-[#cfe2f8] bg-[#e8f2fd] px-4 py-2 text-sm font-semibold text-[#265d8c]"
              >
                {modalState.mode === "edit" ? "Salva modifiche" : "Salva prenotazione"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-[181] flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-[420px] rounded-[14px] border border-[#d8d5cc] bg-white p-5">
            <div className="text-lg font-semibold text-[#2e2a25]">Conferma cancellazione</div>
            <div className="mt-2 text-sm text-[#6b645c]">
              {`Cancellare la prenotazione di ${deleteTarget.customerName}?`}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-4 py-2 text-sm font-semibold text-[#5f584f]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={confirmDeleteReservation}
                className="rounded-[8px] border border-[#f0d5d5] bg-[#fff3f3] px-4 py-2 text-sm font-semibold text-[#8a4545]"
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
