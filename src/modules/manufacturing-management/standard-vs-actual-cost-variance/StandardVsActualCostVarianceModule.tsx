"use client";

import { Fragment, type ReactNode, useState } from "react";
import { FileSpreadsheet, FileText, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableSelect } from "@/modules/manufacturing-management/shared/components/SearchableSelect";
import { useStandardVsActualCostReport } from "./hooks/useStandardVsActualCostReport";
import { fetchStandardVsActualCostReport } from "./services/report-api";
import type { CostComparison, StandardVsActualCostRow } from "./types";

const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantity = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 4 });

function money(value: number | null): string {
    return value === null ? "—" : currency.format(value);
}

function varianceClass(value: number | null): string {
    if (value === null || value === 0) return "text-muted-foreground";
    return value > 0 ? "text-red-600" : "text-emerald-700";
}

function ComparisonTable({ row }: { row: StandardVsActualCostRow }) {
    const categories: Array<[string, CostComparison]> = [
        ["Direct materials", row.costs.directMaterials],
        ["Direct labor", row.costs.directLabor],
        ["Manufacturing overhead", row.costs.manufacturingOverhead],
        ["Total", row.costs.total]
    ];

    return (
        <div className="space-y-5 border-t bg-muted/20 p-4 sm:p-5">
            <div className="overflow-x-auto rounded-lg border bg-background">
                <table className="w-full min-w-[660px] text-sm">
                    <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                            <th className="px-3 py-2">Cost element</th>
                            <th className="px-3 py-2 text-right">Standard allowed</th>
                            <th className="px-3 py-2 text-right">Actual</th>
                            <th className="px-3 py-2 text-right">Variance</th>
                            <th className="px-3 py-2 text-right">Variance %</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {categories.map(([label, cost]) => (
                            <tr key={label} className={label === "Total" ? "font-bold" : ""}>
                                <td className="px-3 py-2">{label}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{money(cost.standard)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{money(cost.actual)}</td>
                                <td className={`px-3 py-2 text-right tabular-nums ${varianceClass(cost.variance)}`}>{money(cost.variance)}</td>
                                <td className={`px-3 py-2 text-right tabular-nums ${varianceClass(cost.variancePercent)}`}>
                                    {cost.variancePercent === null ? "—" : `${cost.variancePercent.toFixed(2)}%`}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {row.incompleteReasons.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {row.incompleteReasons.join(" ")}
                </div>
            )}

            <div className="grid gap-4 xl:grid-cols-3">
                <CostDetail title="Consumed materials" empty="No material consumption is recorded.">
                    {row.detail.materials.map((line, index) => (
                        <div key={`${line.productId}-${line.lotNumber}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b py-2 last:border-0 text-xs">
                            <div className="min-w-0">
                                <div className="truncate font-medium">{line.productName}</div>
                                <div className="text-muted-foreground">{line.lotNumber} · {quantity.format(line.consumedQuantity)}</div>
                            </div>
                            <div className="text-right tabular-nums">
                                <div>{money(line.actualCost)}</div>
                                <div className="text-muted-foreground">@ {money(line.currentUnitCost)}</div>
                            </div>
                        </div>
                    ))}
                </CostDetail>
                <CostDetail title="Direct labor" empty="No operator hours are recorded.">
                    {row.detail.labor.map((line, index) => (
                        <div key={`${line.operatorName}-${line.operationName}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b py-2 last:border-0 text-xs">
                            <div className="min-w-0">
                                <div className="truncate font-medium">{line.operatorName}</div>
                                <div className="text-muted-foreground">{line.operationName} · {quantity.format(line.hours)} hr</div>
                            </div>
                            <div className="text-right tabular-nums">
                                <div>{money(line.actualCost)}</div>
                                <div className="text-muted-foreground">@ {money(line.hourlyRate)}/hr</div>
                            </div>
                        </div>
                    ))}
                </CostDetail>
                <CostDetail title="Applied overhead" empty="No route hours are recorded.">
                    {row.detail.overhead.map((line, index) => (
                        <div key={`${line.operationName}-${line.workCenterName}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b py-2 last:border-0 text-xs">
                            <div className="min-w-0">
                                <div className="truncate font-medium">{line.workCenterName}</div>
                                <div className="text-muted-foreground">{line.operationName} · {quantity.format(line.hours)} hr</div>
                            </div>
                            <div className="text-right tabular-nums">
                                <div>{money(line.actualCost)}</div>
                                <div className="text-muted-foreground">@ {money(line.hourlyRate)}/hr</div>
                            </div>
                        </div>
                    ))}
                </CostDetail>
            </div>
        </div>
    );
}

function CostDetail({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
    const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
    return (
        <section className="rounded-lg border bg-background p-3">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h4>
            {hasChildren ? children : <p className="py-2 text-xs text-muted-foreground">{empty}</p>}
        </section>
    );
}

function SummaryCard({ label, value, note, color }: { label: string; value: string; note?: string; color?: string }) {
    return (
        <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className={`mt-1 text-xl font-bold tabular-nums ${color || ""}`}>{value}</div>
            {note && <div className="mt-1 text-xs text-muted-foreground">{note}</div>}
        </div>
    );
}

function SummaryCardSkeleton() {
    return (
        <div className="rounded-xl border bg-card p-4 shadow-sm">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-2 h-6 w-2/3" />
            <Skeleton className="mt-2 h-3 w-full" />
        </div>
    );
}

export default function StandardVsActualCostVarianceModule() {
    const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
    const {
        filters, rows, paginatedRows, branches, products, loading, error, totals, totalRows,
        page, pageSize, pageCount, setPage, setPageSize, expandedRows,
        loadData, updateFilter, toggleExpanded, clearFilters
    } = useStandardVsActualCostReport();

    const handleExport = async (format: "excel" | "pdf") => {
        if (totalRows === 0 || exporting) return;
        setExporting(format);
        try {
            const exportPayload = await fetchStandardVsActualCostReport({
                filters,
                allRows: true,
                includeOptions: false
            });
            const {
                describeCostVarianceFilters,
                exportCostVarianceExcel,
                exportCostVariancePdf
            } = await import("./utils/export-report");
            const filterDescription = describeCostVarianceFilters(filters, branches, products);
            if (format === "excel") {
                exportCostVarianceExcel(exportPayload.rows, exportPayload.summary, filterDescription);
                toast.success("Excel report downloaded.");
            } else {
                exportCostVariancePdf(exportPayload.rows, exportPayload.summary, filterDescription);
                toast.success("PDF report downloaded.");
            }
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Unable to export the report.");
        } finally {
            setExporting(null);
        }
    };

    return (
        <div className="space-y-5 p-4 sm:p-6">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Standard vs. Actual Cost Variance</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        JO-level comparison of standard cost allowed for QA-passed output against recorded manufacturing costs.
                    </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 sm:mt-0">
                    <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading} className="h-9 bg-background text-sm">
                        <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh report
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void handleExport("excel")} disabled={loading || totalRows === 0 || exporting !== null} className="h-9 bg-background text-sm">
                        <FileSpreadsheet className="mr-1.5 h-4 w-4 text-emerald-600" /> Excel
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void handleExport("pdf")} disabled={loading || totalRows === 0 || exporting !== null} className="h-9 bg-background text-sm">
                        <FileText className="mr-1.5 h-4 w-4 text-rose-600" /> PDF
                    </Button>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {loading ? (
                    Array.from({ length: 4 }, (_, index) => <SummaryCardSkeleton key={index} />)
                ) : (
                    <>
                        <SummaryCard label="Compared JOs" value={String(totals.comparableCount)} note={`${totals.incompleteCount} incomplete or awaiting passed output`} />
                        <SummaryCard label="Standard allowed" value={currency.format(totals.standard)} note="For passed good output" />
                        <SummaryCard label="Actual cost" value={currency.format(totals.actual)} note="Recorded / applied costs" />
                        <SummaryCard label="Net variance" value={currency.format(totals.variance)} note="Positive is unfavorable" color={totals.variance > 0 ? "text-red-600" : totals.variance < 0 ? "text-emerald-700" : ""} />
                    </>
                )}
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
                    <label className="space-y-1 text-xs font-medium sm:col-span-2 xl:col-span-2">
                        <span>Search</span>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input aria-label="Search Job Orders" placeholder="Search JO number" value={filters.jobOrder} onChange={(event) => updateFilter("jobOrder", event.target.value)} className="h-9 pl-9 pr-9 text-sm" />
                            {filters.jobOrder && <button type="button" aria-label="Clear search" className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground" onClick={() => updateFilter("jobOrder", "")}><X className="h-4 w-4" /></button>}
                        </div>
                    </label>
                    <label className="space-y-1 text-xs font-medium">
                        <span>Branch</span>
                        <select value={filters.branchId} onChange={(event) => updateFilter("branchId", event.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                            <option value="all">All branches</option>
                            {branches.map((branch) => <option key={branch.id} value={String(branch.id)}>{branch.label}</option>)}
                        </select>
                    </label>
                    <label className="space-y-1 text-xs font-medium">
                        <span>Product</span>
                        <SearchableSelect
                            options={[
                                { value: "all", label: "All products" },
                                ...products.map((product) => ({ value: String(product.id), label: product.label }))
                            ]}
                            value={filters.productId}
                            onValueChange={(value) => updateFilter("productId", value)}
                            placeholder="All products"
                            searchPlaceholder="Search products..."
                            emptyMessage="No products found."
                            triggerClassName="h-9 text-sm"
                        />
                    </label>
                    <label className="space-y-1 text-xs font-medium">
                        <span>JO status</span>
                        <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                            <option value="all">All included statuses</option>
                            {["In Production", "On Hold", "QA Hold", "Production Completed", "For QA and Reconciliation", "Closed"].map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                    </label>
                    <div className="space-y-1 text-xs font-medium sm:col-span-2 xl:col-span-2">
                        <span className="block">Created date range</span>
                        <div className="flex items-center gap-2">
                            <label className="min-w-0 flex-1"><span className="sr-only">Created from</span><Input type="date" value={filters.dateFrom} onChange={(event) => updateFilter("dateFrom", event.target.value)} className="h-9 px-2 text-sm" /></label>
                            <span className="text-xs text-muted-foreground">to</span>
                            <label className="min-w-0 flex-1"><span className="sr-only">Created to</span><Input type="date" value={filters.dateTo} onChange={(event) => updateFilter("dateTo", event.target.value)} className="h-9 px-2 text-sm" /></label>
                            <Button type="button" variant="ghost" size="sm" className="h-9 shrink-0 px-2" onClick={clearFilters}>Clear</Button>
                        </div>
                    </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                    Material costs use current consumed-lot unit cost. Overhead is applied from actual route hours and current work-center rates. In-progress rows are provisional.
                </p>
            </div>

            {error && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="flex items-center justify-between border-b px-4 py-3">
                    <div>
                        <h2 className="font-semibold">Job Order Cost Variance</h2>
                        {loading ? (
                            <Skeleton className="mt-1 h-3 w-40" />
                        ) : (
                            <p className="text-xs text-muted-foreground">{totalRows.toLocaleString()} Job Order{totalRows === 1 ? "" : "s"} · expand a row to inspect cost elements and actual source lines.</p>
                        )}
                    </div>
                </div>
                {loading ? (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[900px] text-sm">
                            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                    <th className="w-10 px-3 py-3"></th>
                                    <th className="px-3 py-3">Job Order / Product</th>
                                    <th className="px-3 py-3">Branch / Status</th>
                                    <th className="px-3 py-3 text-right">QA-passed output</th>
                                    <th className="px-3 py-3 text-right">Standard</th>
                                    <th className="px-3 py-3 text-right">Actual</th>
                                    <th className="px-3 py-3 text-right">Variance</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {Array.from({ length: 6 }, (_, index) => (
                                    <tr key={index}>
                                        <td className="px-3 py-3"><Skeleton className="h-5 w-5" /></td>
                                        <td className="px-3 py-3"><Skeleton className="h-4 w-32" /><Skeleton className="mt-2 h-3 w-24" /></td>
                                        <td className="px-3 py-3"><Skeleton className="h-4 w-28" /><Skeleton className="mt-2 h-3 w-20" /></td>
                                        <td className="px-3 py-3"><Skeleton className="ml-auto h-4 w-20" /></td>
                                        <td className="px-3 py-3"><Skeleton className="ml-auto h-4 w-24" /></td>
                                        <td className="px-3 py-3"><Skeleton className="ml-auto h-4 w-24" /></td>
                                        <td className="px-3 py-3"><Skeleton className="ml-auto h-4 w-24" /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="p-12 text-center text-sm text-muted-foreground">No Job Orders match these filters.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[900px] text-sm">
                            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                    <th className="w-10 px-3 py-3"></th>
                                    <th className="px-3 py-3">Job Order / Product</th>
                                    <th className="px-3 py-3">Branch / Status</th>
                                    <th className="px-3 py-3 text-right">QA-passed output</th>
                                    <th className="px-3 py-3 text-right">Standard</th>
                                    <th className="px-3 py-3 text-right">Actual</th>
                                    <th className="px-3 py-3 text-right">Variance</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {paginatedRows.map((row) => {
                                    const expanded = expandedRows.has(row.jobOrderId);
                                    return (
                                        <Fragment key={row.jobOrderId}>
                                            <tr className="align-top hover:bg-muted/20">
                                                <td className="px-3 py-3">
                                                    <button type="button" aria-label={`${expanded ? "Collapse" : "Expand"} ${row.jobOrderNo}`} onClick={() => toggleExpanded(row.jobOrderId)} className="rounded border px-2 py-1 text-xs hover:bg-muted">{expanded ? "−" : "+"}</button>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <div className="font-semibold">{row.jobOrderNo}</div>
                                                    <div className="mt-0.5 text-xs text-muted-foreground">{row.productName}{row.productCode ? ` · ${row.productCode}` : ""}</div>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <div>{row.branchName}</div>
                                                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                                        <span>{row.status}</span>
                                                        {row.provisional && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">Provisional</span>}
                                                        {!row.costs.total.complete && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">Incomplete</span>}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 text-right tabular-nums">{quantity.format(row.goodOutputQuantity)} {row.uom}</td>
                                                <td className="px-3 py-3 text-right tabular-nums">{money(row.costs.total.standard)}</td>
                                                <td className="px-3 py-3 text-right tabular-nums">{money(row.costs.total.actual)}</td>
                                                <td className={`px-3 py-3 text-right font-semibold tabular-nums ${varianceClass(row.costs.total.variance)}`}>{money(row.costs.total.variance)}</td>
                                            </tr>
                                            {expanded && <tr><td colSpan={7} className="p-0"><ComparisonTable row={row} /></td></tr>}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                <div className="flex flex-col gap-2 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-muted-foreground">
                        Showing {totalRows === 0 ? 0 : (page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalRows)} of {totalRows.toLocaleString()}
                    </div>
                    <div className="flex items-center gap-2">
                        <select aria-label="Rows per page" className="h-8 rounded-md border bg-background px-2 text-xs" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
                            {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size} rows</option>)}
                        </select>
                        <Button variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                        <span className="min-w-20 text-center text-xs text-muted-foreground">Page {page} of {pageCount}</span>
                        <Button variant="outline" size="sm" disabled={loading || page >= pageCount} onClick={() => setPage(page + 1)}>Next</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
