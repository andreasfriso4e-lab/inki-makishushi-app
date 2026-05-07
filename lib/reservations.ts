"use client";

export type ReservationService = "Pranzo" | "Cena";
export type ReservationSource = "Manuale" | "Telefono" | "TheFork";
export type ReservationStatus =
  | "Confermata"
  | "In attesa"
  | "Arrivato"
  | "No-show"
  | "Annullata";

export type ReservationEntry = {
  id: string;
  date: string;
  time: string;
  service: ReservationService;
  customerName: string;
  partySize: number;
  phone?: string;
  assignedTable?: string;
  note?: string;
  status: ReservationStatus;
  source: ReservationSource;
};

const RESERVATIONS_STORAGE_KEY = "pos-reservations-calendar";

function currentYear() {
  return new Date().getFullYear();
}

function buildInitialReservations(): ReservationEntry[] {
  const year = currentYear();

  return [
    {
      id: "reservation-manuale-1",
      date: `${year}-04-18`,
      time: "12:45",
      service: "Pranzo",
      customerName: "Laura Conti",
      partySize: 2,
      phone: "+39 333 1122334",
      assignedTable: "12",
      note: "Vicino finestra",
      status: "Confermata",
      source: "Manuale",
    },
    {
      id: "reservation-telefono-1",
      date: `${year}-04-18`,
      time: "20:15",
      service: "Cena",
      customerName: "Marco De Santis",
      partySize: 4,
      phone: "+39 333 5566778",
      assignedTable: "07",
      note: "Compleanno",
      status: "In attesa",
      source: "Telefono",
    },
    {
      id: "reservation-thefork-1",
      date: `${year}-04-19`,
      time: "21:00",
      service: "Cena",
      customerName: "Giulia Ferri",
      partySize: 3,
      phone: "+39 333 7788990",
      assignedTable: "15",
      note: "Importata da TheFork",
      status: "Confermata",
      source: "TheFork",
    },
  ];
}

function readStoredReservations() {
  if (typeof window === "undefined") {
    return buildInitialReservations();
  }

  const storedValue = window.localStorage.getItem(RESERVATIONS_STORAGE_KEY);

  if (!storedValue) {
    return buildInitialReservations();
  }

  try {
    const parsedValue = JSON.parse(storedValue) as ReservationEntry[];
    return Array.isArray(parsedValue) && parsedValue.length > 0
      ? parsedValue
      : buildInitialReservations();
  } catch {
    window.localStorage.removeItem(RESERVATIONS_STORAGE_KEY);
    return buildInitialReservations();
  }
}

export function getReservations() {
  return readStoredReservations();
}

export function saveReservations(nextReservations: ReservationEntry[]) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(RESERVATIONS_STORAGE_KEY, JSON.stringify(nextReservations));
  }

  return nextReservations;
}
