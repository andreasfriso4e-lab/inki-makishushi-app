import { NextResponse } from "next/server";

import { getCompanies, getCustomers } from "@/lib/pos-data";
import { lookupCompanyByVatNumberServer } from "@/lib/server/company-vat-lookup";
import { readSharedBusinessDirectoryState } from "@/lib/server/shared-business-directory-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const vatNumber = searchParams.get("vatNumber") ?? "";
  const directory = await readSharedBusinessDirectoryState({
    customers: getCustomers(),
    companies: getCompanies(),
  });
  const result = await lookupCompanyByVatNumberServer(vatNumber, directory.companies);

  if (!result.ok) {
    const status =
      result.errorCode === "invalid_format"
        ? 400
        : result.errorCode === "not_found"
          ? 404
          : 503;

    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}
