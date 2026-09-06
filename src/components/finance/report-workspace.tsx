import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listReportRows } from "@/lib/finance-reports.functions";
import { defaultFilters, formatMoney, type ReportFilters } from "@/lib/report-filters";
import { ReportFilterBar } from "@/components/finance/report-filter-bar";
import { ReportTable } from "@/components/finance/report-table";
import { ExportMenu } from "@/components/finance/export-menu";
import { KpiTile } from "@/components/branta/kpi-tile";

const PAGE_SIZE = 25;

/**
 * Filter bar + live summary cards + paginated transaction table + export menu.
 * Shared by the Finance dashboard (combined) and the Income page.
 */
export function ReportWorkspace({
  kind,
  title,
  description,
}: {
  kind: "finance" | "income" | "expense";
  title: string;
  description?: string;
}) {
  const [filters, setFilters] = useState<ReportFilters>(() =>
    defaultFilters(kind === "finance" ? "all" : kind),
  );
  const [page, setPage] = useState(1);
  const [labels, setLabels] = useState<{ client?: string | null; invoice?: string | null; createdBy?: string | null }>({});

  useEffect(() => setPage(1), [filters]);

  const listFn = useServerFn(listReportRows);
  const q = useQuery({
    queryKey: ["finance-report-rows", kind, filters, page],
    queryFn: () =>
      listFn({
        data: {
          from: filters.from,
          to: filters.to,
          currency: filters.currency,
          type: filters.type,
          categories: filters.categories,
          clientId: filters.clientId,
          invoiceId: filters.invoiceId,
          paymentMethod: filters.paymentMethod,
          status: filters.status,
          vendor: filters.vendor,
          department: filters.department,
          createdBy: filters.createdBy,
          minAmount: filters.minAmount,
          maxAmount: filters.maxAmount,
          search: filters.search,
          page,
          pageSize: PAGE_SIZE,
        },
      }),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

  const s = q.data?.summary;
  const cur = filters.currency;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold text-foreground">{title}</h2>
          {description && <p className="text-[12px] text-muted-foreground">{description}</p>}
        </div>
        <ExportMenu filters={filters} kind={kind} labels={labels} />
      </div>

      <ReportFilterBar filters={filters} onChange={setFilters} kind={kind} onFacets={setLabels} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Total income" value={formatMoney(s?.income ?? 0, cur)} delta="received" positive={true} />
        <KpiTile label="Total expense" value={formatMoney(s?.expense ?? 0, cur)} delta="spent" positive={false} />
        <KpiTile
          label="Net balance"
          value={formatMoney(s?.net ?? 0, cur)}
          delta={(s?.net ?? 0) >= 0 ? "profit" : "loss"}
          positive={(s?.net ?? 0) >= 0}
        />
        <KpiTile label="Transactions" value={String(s?.count ?? 0)} delta="in range" positive={null} />
      </div>

      <ReportTable
        rows={q.data?.rows ?? []}
        currency={cur}
        loading={q.isLoading}
        page={page}
        pageSize={PAGE_SIZE}
        total={q.data?.total ?? 0}
        onPage={setPage}
        hideType={kind !== "finance"}
      />

      {q.isError && (
        <p className="text-[12px] text-rose-600">
          {q.error instanceof Error ? q.error.message : "Could not load the report."}
        </p>
      )}
    </div>
  );
}
