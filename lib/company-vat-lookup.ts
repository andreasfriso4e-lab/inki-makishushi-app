"use client";

import type { CompanyRecord } from "@/lib/pos-data";

export type CompanyVatLookupData = {
  vatNumber: string;
  taxCode?: string;
  companyName: string;
  companyDisplayName?: string;
  addressStreet?: string;
  addressNumber?: string;
  postalCode?: string;
  city?: string;
  province?: string;
  country?: string;
  pec?: string;
  sdiCode?: string;
  phone?: string;
  email?: string;
  contactPerson?: string;
  note?: string;
  isActive?: boolean;
  source?: "vies" | "archive";
};

export type CompanyVatLookupSuccess = {
  ok: true;
  data: CompanyVatLookupData;
  message?: string;
};

export type CompanyVatLookupFailure = {
  ok: false;
  errorCode: "invalid_format" | "not_found" | "service_unavailable";
  message: string;
};

export type CompanyVatLookupResult = CompanyVatLookupSuccess | CompanyVatLookupFailure;

function sanitizeVatNumber(rawVatNumber: string) {
  return rawVatNumber.replace(/\D/g, "");
}

export async function lookupCompanyByVatNumber(
  vatNumber: string,
  localCompanies: CompanyRecord[] = []
): Promise<CompanyVatLookupResult> {
  const normalizedVatNumber = sanitizeVatNumber(vatNumber.trim());
  const localMatch = localCompanies.find(
    (company) => sanitizeVatNumber(company.vatNumber) === normalizedVatNumber
  );

  if (localMatch) {
    return {
      ok: true,
      message: "Dati azienda caricati dall'archivio locale.",
      data: {
        vatNumber: localMatch.vatNumber,
        taxCode: localMatch.taxCode ?? "",
        companyName: localMatch.name,
        companyDisplayName: localMatch.name,
        addressStreet: localMatch.addressStreet ?? "",
        addressNumber: localMatch.addressNumber ?? "",
        postalCode: localMatch.postalCode ?? "",
        city: localMatch.city ?? "",
        province: localMatch.province ?? "",
        country: localMatch.country ?? "Italia",
        pec: localMatch.pec ?? "",
        sdiCode: localMatch.sdiCode ?? "",
        phone: localMatch.phone ?? "",
        email: localMatch.email ?? "",
        contactPerson: localMatch.contactPerson ?? "",
        note: localMatch.note ?? "",
        isActive: localMatch.isActive ?? true,
        source: "archive",
      },
    };
  }

  const response = await fetch(
    `/api/companies/lookup?vatNumber=${encodeURIComponent(vatNumber.trim())}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  const payload = (await response.json()) as CompanyVatLookupResult;
  return payload;
}
