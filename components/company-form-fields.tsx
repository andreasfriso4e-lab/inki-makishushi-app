"use client";

import type { CompanyRecord } from "@/lib/pos-data";

type CompanyFormFieldsProps = {
  company: CompanyRecord;
  onChange: <Key extends keyof CompanyRecord>(field: Key, value: CompanyRecord[Key]) => void;
  onLookup: () => void;
  lookupLoading?: boolean;
  lookupMessage?: string;
  lookupError?: string;
};

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

export function CompanyFormFields({
  company,
  onChange,
  onLookup,
  lookupLoading = false,
  lookupMessage = "",
  lookupError = "",
}: CompanyFormFieldsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="block">
        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Ragione sociale</div>
        <input
          value={company.name}
          onChange={(event) => onChange("name", event.target.value)}
          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
        />
      </label>
      <div className="block">
        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Partita IVA</div>
        <div className="flex gap-2">
          <input
            value={company.vatNumber}
            inputMode="numeric"
            onChange={(event) => onChange("vatNumber", event.target.value)}
            className="h-10 min-w-0 flex-1 rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
          />
          <button
            type="button"
            onClick={onLookup}
            disabled={lookupLoading}
            className="flex h-10 shrink-0 items-center gap-2 rounded-[4px] border border-[#b7cfe4] bg-[#cfe8ff] px-3 text-sm font-semibold text-[#0b3c5d] disabled:opacity-60"
          >
            <SearchIcon />
            <span>{lookupLoading ? "Ricerca..." : "Cerca"}</span>
          </button>
        </div>
        {lookupError ? <div className="mt-1 text-xs text-[#b44343]">{lookupError}</div> : null}
        {!lookupError && lookupMessage ? (
          <div className="mt-1 text-xs text-[#4d6b52]">{lookupMessage}</div>
        ) : null}
      </div>
      <label className="block">
        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Codice fiscale</div>
        <input
          value={company.taxCode ?? ""}
          onChange={(event) => onChange("taxCode", event.target.value)}
          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
        />
      </label>
      <label className="block">
        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Codice SDI</div>
        <input
          value={company.sdiCode ?? ""}
          onChange={(event) => onChange("sdiCode", event.target.value)}
          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
        />
      </label>
      <label className="block">
        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">PEC</div>
        <input
          value={company.pec ?? ""}
          onChange={(event) => onChange("pec", event.target.value)}
          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
        />
      </label>
      <label className="block">
        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Email</div>
        <input
          value={company.email ?? ""}
          onChange={(event) => onChange("email", event.target.value)}
          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
        />
      </label>
      <label className="block md:col-span-2">
        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Via</div>
        <input
          value={company.addressStreet ?? ""}
          onChange={(event) => onChange("addressStreet", event.target.value)}
          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
        />
      </label>
      <label className="block">
        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Numero civico</div>
        <input
          value={company.addressNumber ?? ""}
          onChange={(event) => onChange("addressNumber", event.target.value)}
          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
        />
      </label>
      <label className="block">
        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">CAP</div>
        <input
          value={company.postalCode ?? ""}
          onChange={(event) => onChange("postalCode", event.target.value)}
          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
        />
      </label>
      <label className="block">
        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Città</div>
        <input
          value={company.city ?? ""}
          onChange={(event) => onChange("city", event.target.value)}
          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
        />
      </label>
      <label className="block">
        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Provincia</div>
        <input
          value={company.province ?? ""}
          onChange={(event) => onChange("province", event.target.value)}
          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
        />
      </label>
      <label className="block">
        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Nazione</div>
        <input
          value={company.country ?? ""}
          onChange={(event) => onChange("country", event.target.value)}
          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
        />
      </label>
      <label className="block">
        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Telefono</div>
        <input
          value={company.phone ?? ""}
          onChange={(event) => onChange("phone", event.target.value)}
          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
        />
      </label>
      <label className="block">
        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Referente</div>
        <input
          value={company.contactPerson ?? ""}
          onChange={(event) => onChange("contactPerson", event.target.value)}
          className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
        />
      </label>
      <label className="block md:col-span-2">
        <div className="mb-1 text-xs font-semibold uppercase text-[#5d564e]">Note</div>
        <textarea
          value={company.note ?? ""}
          onChange={(event) => onChange("note", event.target.value)}
          className="min-h-[96px] w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 py-2 text-sm outline-none"
        />
      </label>
      <label className="flex items-center gap-3 rounded-[4px] border border-[#d8d5cc] bg-[#fbf8f2] px-3 py-2 md:col-span-2">
        <input
          type="checkbox"
          checked={company.isActive ?? true}
          onChange={(event) => onChange("isActive", event.target.checked)}
          className="h-4 w-4 rounded border-[#d8d5cc]"
        />
        <span className="text-sm font-semibold text-[#2e2a25]">Azienda attiva</span>
      </label>
    </div>
  );
}
