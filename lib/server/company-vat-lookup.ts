import type { CompanyRecord } from "@/lib/pos-data";
import type { CompanyVatLookupResult } from "@/lib/company-vat-lookup";
import { splitCompanyAddress } from "@/lib/company-records";

function sanitizeVatNumber(rawVatNumber: string) {
  return rawVatNumber.replace(/\D/g, "");
}

function parseProvinceFromCity(city?: string) {
  const trimmedCity = city?.trim() ?? "";
  const match = trimmedCity.match(/\b([A-Z]{2})\b$/);
  return match?.[1] ?? "";
}

function firstNonEmpty(...values: Array<string | undefined | null>) {
  return values.find((value) => value?.trim())?.trim() ?? "";
}

function readPathValue(source: unknown, path: string) {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, source);
}

function readStringPath(source: unknown, path: string) {
  const value = readPathValue(source, path);
  return typeof value === "string" ? value.trim() : "";
}

function getFirstPathString(source: unknown, paths: string[]) {
  for (const path of paths) {
    const value = readStringPath(source, path);

    if (value && value !== "---" && value !== "-") {
      return value;
    }
  }

  return "";
}

function getFirstPathBoolean(source: unknown, paths: string[]) {
  for (const path of paths) {
    const value = readPathValue(source, path);

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      const normalizedValue = value.trim().toLowerCase();

      if (["active", "attiva", "attivo", "true", "1"].includes(normalizedValue)) {
        return true;
      }

      if (["inactive", "inattiva", "inattivo", "false", "0"].includes(normalizedValue)) {
        return false;
      }
    }
  }

  return undefined;
}

function normalizeCountryName(country?: string) {
  const trimmedCountry = country?.trim() ?? "";
  if (!trimmedCountry) {
    return "Italia";
  }

  if (trimmedCountry.toUpperCase() === "IT") {
    return "Italia";
  }

  return trimmedCountry;
}

function parseItalianAddress(rawAddress?: string) {
  const trimmedAddress = rawAddress
    ?.replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(", ")
    .trim() ?? "";

  const fallbackAddressParts = splitCompanyAddress(trimmedAddress);
  const parsed = {
    addressStreet: fallbackAddressParts.addressStreet,
    addressNumber: fallbackAddressParts.addressNumber,
    postalCode: "",
    city: "",
    province: "",
  };

  if (!trimmedAddress) {
    return parsed;
  }

  const postalCityMatch = trimmedAddress.match(
    /(?:^|,\s*)(\d{5})\s+([A-ZÀ-ÖØ-Ý'`\-\s]+?)(?:\s*\(([A-Z]{2})\)|\s+([A-Z]{2}))?(?:,|$)/i
  );

  if (postalCityMatch) {
    parsed.postalCode = postalCityMatch[1]?.trim() ?? "";
    parsed.city = postalCityMatch[2]?.trim() ?? "";
    parsed.province = (postalCityMatch[3] ?? postalCityMatch[4] ?? "").trim();
  }

  if (!parsed.province) {
    parsed.province = parseProvinceFromCity(parsed.city);
  }

  return parsed;
}

function mapCompanyRecordToLookup(company: CompanyRecord): CompanyVatLookupResult {
  return {
    ok: true,
    message: "Dati azienda caricati dall'archivio.",
    data: {
      vatNumber: company.vatNumber,
      taxCode: company.taxCode ?? "",
      companyName: company.name,
      companyDisplayName: company.name,
      addressStreet: company.addressStreet || splitCompanyAddress(company.address).addressStreet,
      addressNumber: company.addressNumber || splitCompanyAddress(company.address).addressNumber,
      postalCode: company.postalCode ?? "",
      city: company.city ?? "",
      province: company.province ?? "",
      country: company.country ?? "Italia",
      pec: company.pec ?? "",
      sdiCode: company.sdiCode ?? "",
      phone: company.phone ?? "",
      email: company.email ?? "",
      contactPerson: company.contactPerson ?? "",
      note: company.note ?? "",
      isActive: company.isActive ?? true,
      source: "archive",
    },
  };
}

export async function lookupCompanyByVatNumberServer(
  rawVatNumber: string,
  archivedCompanies: CompanyRecord[]
): Promise<CompanyVatLookupResult> {
  const vatNumber = sanitizeVatNumber(rawVatNumber);

  if (!/^\d{11}$/.test(vatNumber)) {
    return {
      ok: false,
      errorCode: "invalid_format",
      message: "Formato Partita IVA non valido",
    };
  }

  const archivedCompany = archivedCompanies.find(
    (company) => sanitizeVatNumber(company.vatNumber) === vatNumber
  );

  if (archivedCompany) {
    return mapCompanyRecordToLookup(archivedCompany);
  }

  try {
    const viesResponse = await fetch(
      `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/IT/vat/${vatNumber}`,
      {
        cache: "no-store",
        headers: {
          accept: "application/json",
        },
      }
    );

    if (!viesResponse.ok) {
      return {
        ok: false,
        errorCode: "service_unavailable",
        message: "Impossibile recuperare i dati, compila manualmente",
      };
    }

    const viesPayload = (await viesResponse.json()) as Record<string, unknown>;

    const isValid =
      getFirstPathBoolean(viesPayload, ["isValid", "valid", "active", "isActive"]) ??
      false;

    if (!isValid) {
      return {
        ok: false,
        errorCode: "not_found",
        message: "Partita IVA non trovata",
      };
    }

    const rawCompanyName = firstNonEmpty(
      getFirstPathString(viesPayload, [
        "traderName",
        "traderNameComponents.name",
        "viesApproximate.name",
        "name",
        "companyName",
        "company_name",
        "denominazione",
        "ragioneSociale",
        "ragione_sociale",
        "azienda.denominazione",
        "sede.denominazione",
      ])
    );
    const rawAddress = firstNonEmpty(
      getFirstPathString(viesPayload, [
        "traderAddress",
        "address",
        "indirizzo",
        "sede.indirizzo",
        "sede.address",
        "registeredOffice.address",
        "registered_office.address",
        "addressLine1",
      ])
    );
    const parsedAddress = parseItalianAddress(rawAddress);
    const addressStreet = firstNonEmpty(
      getFirstPathString(viesPayload, [
        "traderAddressComponent.street",
        "viesApproximate.street",
        "street",
        "toponym",
        "indirizzo",
        "address.street",
        "address.route",
        "address.address",
        "sede.indirizzo",
        "sede.street",
        "sede.toponym",
      ]),
      parsedAddress.addressStreet
    );
    const addressNumber = firstNonEmpty(
      getFirstPathString(viesPayload, [
        "traderAddressComponent.streetNumber",
        "traderAddressComponent.houseNumber",
        "viesApproximate.streetNumber",
        "viesApproximate.houseNumber",
        "civicNumber",
        "numeroCivico",
        "numero_civico",
        "houseNumber",
        "house_number",
        "streetNumber",
        "street_number",
        "address.civicNumber",
        "address.houseNumber",
        "sede.numeroCivico",
        "sede.civicNumber",
      ]),
      parsedAddress.addressNumber
    );
    const postalCode = firstNonEmpty(
      getFirstPathString(viesPayload, [
        "traderAddressComponent.postalCode",
        "viesApproximate.postalCode",
        "postalCode",
        "zipCode",
        "zip_code",
        "cap",
        "address.postalCode",
        "address.zipCode",
        "sede.cap",
        "sede.postalCode",
      ]),
      parsedAddress.postalCode
    );
    const city = firstNonEmpty(
      getFirstPathString(viesPayload, [
        "traderAddressComponent.city",
        "viesApproximate.city",
        "city",
        "comune",
        "municipality",
        "municipio",
        "town",
        "locality",
        "address.city",
        "sede.city",
        "sede.comune",
      ]),
      parsedAddress.city
    );
    const province = firstNonEmpty(
      getFirstPathString(viesPayload, [
        "province",
        "provincia",
        "address.province",
        "sede.provincia",
        "sede.province",
      ]),
      parsedAddress.province,
      parseProvinceFromCity(city)
    );
    const country = normalizeCountryName(
      firstNonEmpty(
        getFirstPathString(viesPayload, [
          "traderAddressComponent.country",
          "country",
          "countryCode",
          "country_code",
          "address.country",
          "sede.nazione",
          "sede.country",
        ])
      )
    );
    const sdiCode = firstNonEmpty(
      getFirstPathString(viesPayload, [
        "sdiCode",
        "sdi",
        "codiceDestinatario",
        "codice_destinatario",
        "recipientCode",
        "recipient_code",
        "ipa",
      ])
    );
    const pec = firstNonEmpty(
      getFirstPathString(viesPayload, ["pec", "emailPec", "postaCertificata", "posta_certificata"])
    );
    const phone = firstNonEmpty(
      getFirstPathString(viesPayload, ["phone", "telefono", "contact.phone", "sede.telefono"])
    );
    const email = firstNonEmpty(
      getFirstPathString(viesPayload, ["email", "mail", "contact.email", "sede.email"])
    );
    const contactPerson = firstNonEmpty(
      getFirstPathString(viesPayload, [
        "contactPerson",
        "referente",
        "contact.name",
        "sede.referente",
      ])
    );
    const isActive =
      getFirstPathBoolean(viesPayload, ["active", "isActive", "status", "state"]) ?? true;
    const resolvedCompanyName =
      rawCompanyName && rawCompanyName !== "---"
        ? rawCompanyName
        : "Ragione sociale non disponibile";
    const missingCriticalFields = [
      !addressStreet ? "via" : null,
      !addressNumber ? "numero civico" : null,
      !postalCode ? "CAP" : null,
      !city ? "città" : null,
      !pec ? "PEC" : null,
      !sdiCode ? "Codice SDI" : null,
    ].filter(Boolean) as string[];

    return {
      ok: true,
      message:
        missingCriticalFields.length === 0
          ? "Dati azienda recuperati dalla Partita IVA."
          : `Dati recuperati parzialmente: mancano ${missingCriticalFields.join(", ")}.`,
      data: {
        vatNumber,
        taxCode: vatNumber,
        companyName: resolvedCompanyName,
        companyDisplayName: firstNonEmpty(
          getFirstPathString(viesPayload, ["traderNameComponents.legalForm", "legalForm"])
            ? `${rawCompanyName} ${getFirstPathString(viesPayload, ["traderNameComponents.legalForm", "legalForm"])}`
            : "",
          resolvedCompanyName
        ),
        addressStreet,
        addressNumber,
        postalCode,
        city,
        province,
        country,
        pec,
        sdiCode,
        phone,
        email,
        contactPerson,
        isActive,
        source: "vies",
      },
    };
  } catch {
    return {
      ok: false,
      errorCode: "service_unavailable",
      message: "Impossibile recuperare i dati, compila manualmente",
    };
  }
}
