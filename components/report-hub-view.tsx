"use client";

import { useMemo, useState } from "react";

import {
  getCategoryReportRows,
  getCompletedSalesMovements,
  getDailySalesRows,
  getMonthlySalesRows,
  getProductReportRows,
  getReportRange,
  getRevenueSummary,
  getYearlySalesRows,
  type ReportPeriodKey,
  type ReportSectionId,
} from "@/lib/sales-reports";

const reportSections: Array<{ id: ReportSectionId; label: string }> = [
  { id: "prodotti", label: "Report prodotti" },
  { id: "categorie", label: "Report categorie" },
  { id: "incassi", label: "Report incassi" },
  { id: "vendite-giornaliere", label: "Report vendite giornaliere" },
  { id: "vendite-mensili", label: "Report vendite mensili" },
  { id: "vendite-annuali", label: "Report vendite annuali" },
];

const periodOptions: Array<{ id: ReportPeriodKey; label: string }> = [
  { id: "oggi", label: "Oggi" },
  { id: "ieri", label: "Ieri" },
  { id: "settimana", label: "Settimana" },
  { id: "mese", label: "Mese" },
  { id: "anno", label: "Anno" },
  { id: "ultimi-15-giorni", label: "Ultimi 15 giorni" },
  { id: "intervallo-personalizzato", label: "Intervallo personalizzato" },
];

function formatCurrency(value: number) {
  return value.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function todayInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function SummaryCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-[12px] border border-[#ddd8ce] bg-white px-4 py-4">
      <div className="text-xs font-bold uppercase tracking-[0.08em] text-[#7a736a]">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-[#2e2a25]">{value}</div>
      {helper ? <div className="mt-1 text-sm text-[#6d665e]">{helper}</div> : null}
    </div>
  );
}

export function ReportHubView() {
  const [selectedSection, setSelectedSection] = useState<ReportSectionId>("prodotti");
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriodKey>("oggi");
  const [customStart, setCustomStart] = useState(todayInputValue());
  const [customEnd, setCustomEnd] = useState(todayInputValue());

  const range = useMemo(
    () => getReportRange(selectedPeriod, customStart, customEnd),
    [selectedPeriod, customStart, customEnd]
  );
  const movements = useMemo(() => getCompletedSalesMovements(range), [range]);
  const productRows = useMemo(() => getProductReportRows(movements), [movements]);
  const categoryRows = useMemo(() => getCategoryReportRows(movements), [movements]);
  const revenueSummary = useMemo(() => getRevenueSummary(movements), [movements]);
  const dailyRows = useMemo(() => getDailySalesRows(movements), [movements]);
  const monthlyRows = useMemo(() => getMonthlySalesRows(movements), [movements]);
  const yearlyRows = useMemo(() => getYearlySalesRows(movements), [movements]);
  const periodLabel = periodOptions.find((option) => option.id === selectedPeriod)?.label ?? "Oggi";

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#fffefb] p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#2e2a25]">Report</h1>
          <p className="mt-1 text-sm text-[#6b645c]">
            Analisi aggregate costruite solo su tavoli chiusi e movimenti di vendita finalizzati.
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {reportSections.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => setSelectedSection(section.id)}
            className={[
              "rounded-[10px] border px-4 py-2 text-sm font-semibold",
              selectedSection === section.id
                ? "border-[#cfe2f8] bg-[#e8f2fd] text-[#265d8c]"
                : "border-[#d8d5cc] bg-white text-[#5f584f]",
            ].join(" ")}
          >
            {section.label}
          </button>
        ))}
      </div>

      <div className="mb-4 rounded-[12px] border border-[#ddd8ce] bg-white p-4">
        <div className="mb-3 text-sm font-semibold text-[#2e2a25]">Periodo di analisi</div>
        <div className="flex flex-wrap gap-2">
          {periodOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSelectedPeriod(option.id)}
              className={[
                "rounded-[8px] border px-3 py-2 text-sm font-semibold",
                selectedPeriod === option.id
                  ? "border-[#cfe2f8] bg-[#e8f2fd] text-[#265d8c]"
                  : "border-[#d8d5cc] bg-[#ffffff] text-[#5f584f]",
              ].join(" ")}
            >
              {option.label}
            </button>
          ))}
        </div>

        {selectedPeriod === "intervallo-personalizzato" ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-sm font-medium text-[#49423a]">
              Data da
              <input
                type="date"
                value={customStart}
                onChange={(event) => setCustomStart(event.target.value)}
                className="mt-1 h-11 w-full rounded-[8px] border border-[#d8d5cc] bg-white px-3 outline-none"
              />
            </label>
            <label className="text-sm font-medium text-[#49423a]">
              Data a
              <input
                type="date"
                value={customEnd}
                onChange={(event) => setCustomEnd(event.target.value)}
                className="mt-1 h-11 w-full rounded-[8px] border border-[#d8d5cc] bg-white px-3 outline-none"
              />
            </label>
          </div>
        ) : null}
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <SummaryCard label="Periodo selezionato" value={periodLabel} helper={`${movements.length} movimenti chiusi`} />
        <SummaryCard
          label="Totale incassato"
          value={formatCurrency(revenueSummary.totalCollected)}
          helper="Solo movimenti conclusi"
        />
        <SummaryCard
          label="Prodotti venduti"
          value={String(movements.reduce((sum, movement) => sum + movement.lines.reduce((lineSum, line) => lineSum + line.quantity, 0), 0))}
          helper="Somma quantità dei movimenti finalizzati"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-[12px] border border-[#ddd8ce] bg-white p-4">
        {selectedSection === "prodotti" ? (
          <div>
            <div className="mb-4 text-base font-semibold text-[#2e2a25]">Report prodotti</div>
            <div className="overflow-hidden rounded-[10px] border border-[#e4ded2]">
              <table className="min-w-full text-sm">
                <thead className="bg-[#f6f2ea] text-[#6f685f]">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Nome prodotto</th>
                    <th className="px-4 py-3 text-right font-semibold">Quantità venduta</th>
                    <th className="px-4 py-3 text-right font-semibold">Incasso generato</th>
                    <th className="px-4 py-3 text-right font-semibold">% sul periodo</th>
                  </tr>
                </thead>
                <tbody>
                  {productRows.map((row) => (
                    <tr key={row.productId} className="border-t border-[#ece7dd]">
                      <td className="px-4 py-3 text-[#2e2a25]">{row.productName}</td>
                      <td className="px-4 py-3 text-right text-[#5f584f]">{row.quantitySold}</td>
                      <td className="px-4 py-3 text-right text-[#2e2a25]">{formatCurrency(row.revenue)}</td>
                      <td className="px-4 py-3 text-right text-[#5f584f]">{formatPercent(row.revenueShare)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {selectedSection === "categorie" ? (
          <div>
            <div className="mb-4 text-base font-semibold text-[#2e2a25]">Report categorie</div>
            <div className="overflow-hidden rounded-[10px] border border-[#e4ded2]">
              <table className="min-w-full text-sm">
                <thead className="bg-[#f6f2ea] text-[#6f685f]">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Nome categoria</th>
                    <th className="px-4 py-3 text-right font-semibold">Quantità totale</th>
                    <th className="px-4 py-3 text-right font-semibold">Incasso totale</th>
                    <th className="px-4 py-3 text-right font-semibold">% sul periodo</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryRows.map((row) => (
                    <tr key={row.categoryName} className="border-t border-[#ece7dd]">
                      <td className="px-4 py-3 text-[#2e2a25]">{row.categoryName}</td>
                      <td className="px-4 py-3 text-right text-[#5f584f]">{row.quantitySold}</td>
                      <td className="px-4 py-3 text-right text-[#2e2a25]">{formatCurrency(row.revenue)}</td>
                      <td className="px-4 py-3 text-right text-[#5f584f]">{formatPercent(row.revenueShare)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {selectedSection === "incassi" ? (
          <div className="space-y-4">
            <div className="text-base font-semibold text-[#2e2a25]">Report incassi</div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label="Totale incassato" value={formatCurrency(revenueSummary.totalCollected)} />
              <SummaryCard label="Numero movimenti" value={String(revenueSummary.totalMovements)} />
              <SummaryCard
                label="Media per vendita"
                value={formatCurrency(
                  revenueSummary.totalMovements > 0
                    ? revenueSummary.totalCollected / revenueSummary.totalMovements
                    : 0
                )}
              />
              <SummaryCard
                label="Metodi rilevati"
                value={String(revenueSummary.byMethod.filter((row) => row.total > 0).length)}
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
              <div className="rounded-[10px] border border-[#e4ded2] bg-[#fffefc] p-4">
                <div className="mb-3 text-sm font-semibold text-[#2e2a25]">Totale per metodo di pagamento</div>
                <div className="space-y-2">
                  {revenueSummary.byMethod.map((row) => (
                    <div key={row.method} className="flex items-center justify-between rounded-[8px] border border-[#e5dfd4] bg-white px-3 py-2 text-sm">
                      <span className="text-[#5f584f]">{row.method}</span>
                      <span className="font-semibold text-[#2e2a25]">{formatCurrency(row.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="overflow-hidden rounded-[10px] border border-[#e4ded2]">
                <table className="min-w-full text-sm">
                  <thead className="bg-[#f6f2ea] text-[#6f685f]">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Periodo</th>
                      <th className="px-4 py-3 text-right font-semibold">Totale incassato</th>
                      <th className="px-4 py-3 text-right font-semibold">Movimenti</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueSummary.trend.map((row) => (
                      <tr key={row.label} className="border-t border-[#ece7dd]">
                        <td className="px-4 py-3 text-[#2e2a25]">{row.label}</td>
                        <td className="px-4 py-3 text-right text-[#2e2a25]">{formatCurrency(row.total)}</td>
                        <td className="px-4 py-3 text-right text-[#5f584f]">{row.movements}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {selectedSection === "vendite-giornaliere" ? (
          <div>
            <div className="mb-4 text-base font-semibold text-[#2e2a25]">Report vendite giornaliere</div>
            <div className="overflow-hidden rounded-[10px] border border-[#e4ded2]">
              <table className="min-w-full text-sm">
                <thead className="bg-[#f6f2ea] text-[#6f685f]">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Data</th>
                    <th className="px-4 py-3 text-right font-semibold">Totale incassato</th>
                    <th className="px-4 py-3 text-right font-semibold">Numero vendite</th>
                    <th className="px-4 py-3 text-right font-semibold">Quantità prodotti</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyRows.map((row) => (
                    <tr key={row.label} className="border-t border-[#ece7dd]">
                      <td className="px-4 py-3 text-[#2e2a25]">{row.label}</td>
                      <td className="px-4 py-3 text-right text-[#2e2a25]">{formatCurrency(row.total)}</td>
                      <td className="px-4 py-3 text-right text-[#5f584f]">{row.movements}</td>
                      <td className="px-4 py-3 text-right text-[#5f584f]">{row.itemsSold}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {selectedSection === "vendite-mensili" ? (
          <div>
            <div className="mb-4 text-base font-semibold text-[#2e2a25]">Report vendite mensili</div>
            <div className="overflow-hidden rounded-[10px] border border-[#e4ded2]">
              <table className="min-w-full text-sm">
                <thead className="bg-[#f6f2ea] text-[#6f685f]">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Mese</th>
                    <th className="px-4 py-3 text-right font-semibold">Totale incassato</th>
                    <th className="px-4 py-3 text-right font-semibold">Numero vendite</th>
                    <th className="px-4 py-3 text-right font-semibold">Quantità prodotti</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyRows.map((row) => (
                    <tr key={row.label} className="border-t border-[#ece7dd]">
                      <td className="px-4 py-3 text-[#2e2a25]">{row.label}</td>
                      <td className="px-4 py-3 text-right text-[#2e2a25]">{formatCurrency(row.total)}</td>
                      <td className="px-4 py-3 text-right text-[#5f584f]">{row.movements}</td>
                      <td className="px-4 py-3 text-right text-[#5f584f]">{row.itemsSold}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {selectedSection === "vendite-annuali" ? (
          <div>
            <div className="mb-4 text-base font-semibold text-[#2e2a25]">Report vendite annuali</div>
            <div className="overflow-hidden rounded-[10px] border border-[#e4ded2]">
              <table className="min-w-full text-sm">
                <thead className="bg-[#f6f2ea] text-[#6f685f]">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Anno</th>
                    <th className="px-4 py-3 text-right font-semibold">Totale incassato</th>
                    <th className="px-4 py-3 text-right font-semibold">Numero vendite</th>
                    <th className="px-4 py-3 text-right font-semibold">Quantità prodotti</th>
                  </tr>
                </thead>
                <tbody>
                  {yearlyRows.map((row) => (
                    <tr key={row.label} className="border-t border-[#ece7dd]">
                      <td className="px-4 py-3 text-[#2e2a25]">{row.label}</td>
                      <td className="px-4 py-3 text-right text-[#2e2a25]">{formatCurrency(row.total)}</td>
                      <td className="px-4 py-3 text-right text-[#5f584f]">{row.movements}</td>
                      <td className="px-4 py-3 text-right text-[#5f584f]">{row.itemsSold}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
