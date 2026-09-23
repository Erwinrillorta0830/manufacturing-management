"use client";

import { Fragment, useState } from "react";
import { FileSpreadsheet, FileText, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableSelect } from "@/modules/manufacturing-management/shared/components/SearchableSelect";
import { fetchJobOrderProfitabilityExport } from "./services/report-api";
import { useJobOrderProfitabilityReport } from "./hooks/useJobOrderProfitabilityReport";
import { describeProfitabilityFilters, exportProfitabilityExcel, exportProfitabilityPdf } from "./utils/export-report";
import type { JobOrderProfitabilityRow, ProfitabilityBatchDetails } from "./types";

const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantity = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 4 });

function money(value: number | null): string {
    return value === null ? "—" : currency.format(value);
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

function CostDetails({ row, detail }: { row: JobOrderProfitabilityRow; detail: ProfitabilityBatchDetails }) {
    return (
        <div className="space-y-4 border-t bg-muted/20 p-4 sm:p-5">
            {row.incompleteReasons.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <div className="font-semibold">Profitability data is incomplete</div>
                    <ul className="mt-1 list-inside list-disc">{row.incompleteReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                </div>
            )}
            {row.unallocatedQuantity > 0 && (
                <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                    {quantity.format(row.unallocatedQuantity)} {row.uom} has no linked Sales Order revenue or margin. Its share of batch cost is shown as unallocated COGS.
                </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Full batch COGS" value={money(row.totalBatchCogs)} note="All QA-passed good output in this batch" />
                <SummaryCard label="Allocated COGS" value={money(row.allocatedCogs)} note={`${quantity.format(row.allocatedQuantity)} ${row.uom} linked to SO demand`} />
                <SummaryCard label="Unallocated COGS" value={money(row.unallocatedCogs)} note={`${quantity.format(row.unallocatedQuantity)} ${row.uom} excluded from margin`} />
                <SummaryCard label="Rejected quantity" value={`${quantity.format(row.rejectedQuantity)} ${row.uom}`} note="Reported separately; excluded from revenue and gross margin" />
            </div>

            <div className="overflow-x-auto rounded-lg border bg-background">
                <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr><th className="px-3 py-2">Cost source</th><th className="px-3 py-2">Material / Operator / Work center</th><th className="px-3 py-2">Lot / Operation</th><th className="px-3 py-2 text-right">Quantity / Hours</th><th className="px-3 py-2 text-right">Unit rate</th><th className="px-3 py-2 text-right">Batch cost</th></tr>
                    </thead>
                    <tbody className="divide-y">
                        {detail.materials.map((line, index) => (
                            <tr key={`material-${index}`}>
                                <td className="px-3 py-2">Direct materials</td><td className="px-3 py-2">{line.productName}{line.productCode ? ` · ${line.productCode}` : ""}</td>
                                <td className="px-3 py-2">{line.lotNumber} / {line.batchNumber}</td><td className="px-3 py-2 text-right tabular-nums">{quantity.format(line.quantity)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{money(line.unitCost)}</td><td className="px-3 py-2 text-right tabular-nums">{money(line.totalCost)}</td>
                            </tr>
                        ))}
                        {detail.labor.map((line, index) => (
                            <tr key={`labor-${index}`}>
                                <td className="px-3 py-2">Direct labor</td><td className="px-3 py-2">{line.operatorName}</td><td className="px-3 py-2">{line.operationName}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{quantity.format(line.hours)} hrs</td><td className="px-3 py-2 text-right tabular-nums">{money(line.hourlyRate)}</td><td className="px-3 py-2 text-right tabular-nums">{money(line.batchCost)}</td>
                            </tr>
                        ))}
                        {detail.overhead.map((line, index) => (
                            <tr key={`overhead-${index}`}>
                                <td className="px-3 py-2">Manufacturing overhead</td><td className="px-3 py-2">{line.workCenterName}</td><td className="px-3 py-2">{line.operationName}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{quantity.format(line.hours)} hrs</td><td className="px-3 py-2 text-right tabular-nums">{money(line.hourlyRate)}</td><td className="px-3 py-2 text-right tabular-nums">{money(line.batchCost)}</td>
                            </tr>
                        ))}
                        {detail.materials.length + detail.labor.length + detail.overhead.length === 0 && (
                            <tr><td colSpan={6} className="px-3 py-5 text-center text-muted-foreground">No cost detail records are available for this batch.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function JobOrderProfitabilityReportModule() {
    const report = useJobOrderProfitabilityReport();
    const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

    async function handleExport(format: "excel" | "pdf") {
        if (report.totalRows === 0 || exporting) return;
        setExporting(format);
        try {
            const result = await fetchJobOrderProfitabilityExport(report.filters);
            const description = describeProfitabilityFilters(report.filters);
            if (format === "excel") exportProfitabilityExcel(result.rows, report.filters);
            else exportProfitabilityPdf(result.rows, report.filters);
            toast.success(`${format === "excel" ? "Excel" : "PDF"} report downloaded.`, { description });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to export the report.");
        } finally {
            setExporting(null);
        }
    }

    const summary = report.summary;
    return (
        <div className="space-y-5 p-4 sm:p-6">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Job &amp; Order Profitability</h1>
                    <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
                        Batch-level gross margins from committed, QA-passed output, linked Sales Order net prices, consumed-lot genealogy, and recorded labor and overhead.
                    </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 sm:mt-0">
                    <Button variant="outline" size="sm" onClick={report.refresh} disabled={report.loading || report.refreshing} className="h-9 bg-background text-sm">
                        <RefreshCw className={`mr-1.5 h-4 w-4 ${report.refreshing ? "animate-spin" : ""}`} /> Refresh report
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void handleExport("excel")} disabled={report.loading || report.totalRows === 0 || exporting !== null} className="h-9 bg-background text-sm">
                        <FileSpreadsheet className="mr-1.5 h-4 w-4 text-emerald-600" /> Excel
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void handleExport("pdf")} disabled={report.loading || report.totalRows === 0 || exporting !== null} className="h-9 bg-background text-sm">
                        <FileText className="mr-1.5 h-4 w-4 text-rose-600" /> PDF
                    </Button>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {report.loading ? Array.from({ length: 5 }, (_, index) => <div key={index} className="rounded-xl border bg-card p-4"><Skeleton className="h-3 w-28" /><Skeleton className="mt-2 h-6 w-2/3" /><Skeleton className="mt-2 h-3 w-full" /></div>) : (
                    <>
                        <SummaryCard label="QA-passed batches" value={summary.batchCount.toLocaleString()} note={`${summary.incompleteBatchCount} incomplete / not margin-ready`} />
                        <SummaryCard label="Linked revenue" value={currency.format(summary.revenue)} note="Complete linked batch margins only" />
                        <SummaryCard label="Allocated COGS" value={currency.format(summary.cogs)} note="Cost assigned to SO-linked good output" />
                        <SummaryCard label="Gross profit" value={currency.format(summary.grossProfit)} note={summary.grossMarginPercent === null ? "Margin unavailable" : `${summary.grossMarginPercent.toFixed(2)}% weighted margin`} color={summary.grossProfit < 0 ? "text-red-600" : "text-emerald-700"} />
                        <SummaryCard label="Unallocated good output" value={quantity.format(summary.unallocatedOutput)} note="Excluded from revenue and margin" />
                    </>
                )}
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
                    <label className="space-y-1 text-xs font-medium sm:col-span-2 xl:col-span-2">
                        <span>Search JO, SO, product, or batch</span>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input aria-label="Search job order profitability" placeholder="Search JO / SO / product / batch" value={report.filters.search} onChange={(event) => report.updateFilter("search", event.target.value)} className="h-9 pl-9 pr-9 text-sm" />
                            {report.filters.search && <button type="button" aria-label="Clear search" className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground" onClick={() => report.updateFilter("search", "")}><X className="h-4 w-4" /></button>}
                        </div>
                    </label>
                    <label className="space-y-1 text-xs font-medium">
                        <span>Branch</span>
                        <select value={report.filters.branchId} onChange={(event) => report.updateFilter("branchId", event.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                            <option value="all">All branches</option>
                            {report.branches.map((option) => <option key={option.id} value={String(option.id)}>{option.label}</option>)}
                        </select>
                    </label>
                    <label className="space-y-1 text-xs font-medium">
                        <span>Product</span>
                        <SearchableSelect options={[{ value: "all", label: "All products" }, ...report.products.map((option) => ({ value: String(option.id), label: option.label }))]} value={report.filters.productId} onValueChange={(value) => report.updateFilter("productId", value)} placeholder="All products" className="h-9 text-sm" />
                    </label>
                    <label className="space-y-1 text-xs font-medium">
                        <span>JO status</span>
                        <select value={report.filters.status} onChange={(event) => report.updateFilter("status", event.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                            <option value="all">All statuses</option>
                            {report.statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                    </label>
                    <div className="space-y-1 text-xs font-medium sm:col-span-2 xl:col-span-2">
                        <span className="block">Manufacturing date range</span>
                        <div className="flex items-center gap-2">
                            <label className="min-w-0 flex-1"><span className="sr-only">Manufactured from</span><Input type="date" value={report.filters.dateFrom} onChange={(event) => report.updateFilter("dateFrom", event.target.value)} className="h-9 px-2 text-sm" /></label>
                            <span className="text-xs text-muted-foreground">to</span>
                            <label className="min-w-0 flex-1"><span className="sr-only">Manufactured to</span><Input type="date" value={report.filters.dateTo} onChange={(event) => report.updateFilter("dateTo", event.target.value)} className="h-9 px-2 text-sm" /></label>
                            <Button type="button" variant="ghost" size="sm" className="h-9 shrink-0 px-2" onClick={report.resetFilters}>Clear</Button>
                        </div>
                    </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                    Only committed yield-ledger batches that passed daily QA are included. JO-level labor and overhead are apportioned by batch good-output share; output without an active SO allocation has no revenue or margin.
                </p>
            </div>

            {report.error && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{report.error}</div>}

            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="flex items-center justify-between border-b px-4 py-3">
                    <div>
                        <h2 className="font-semibold">Finished Product Batch Profitability</h2>
                        {report.loading ? <Skeleton className="mt-1 h-3 w-40" /> : <p className="text-xs text-muted-foreground">{report.totalRows.toLocaleString()} QA-passed batch{report.totalRows === 1 ? "" : "es"} · expand a row to inspect batch cost sources and completeness notes.</p>}
                    </div>
                </div>
                {report.loading ? (
                    <div className="overflow-x-auto"><table className="w-full min-w-[1450px] text-sm"><thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr>{["Batch / JO", "Sales Order", "Product", "Mfg. Date", "QA good / allocated", "Materials", "Labor", "Overhead", "Allocated COGS", "Revenue", "Gross profit / margin"].map((header) => <th key={header} className="px-3 py-3">{header}</th>)}</tr></thead><tbody className="divide-y">{Array.from({ length: 6 }, (_, index) => <tr key={index}>{Array.from({ length: 11 }, (_, cell) => <td key={cell} className="px-3 py-3"><Skeleton className="h-4 w-24" /></td>)}</tr>)}</tbody></table></div>
                ) : report.rows.length === 0 ? (
                    <div className="p-12 text-center text-sm text-muted-foreground">No committed, QA-passed batches match these filters.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1450px] text-sm">
                            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                <tr><th className="w-10 px-3 py-3"></th><th className="px-3 py-3">Batch / Job Order</th><th className="px-3 py-3">Sales Order</th><th className="px-3 py-3">Product / Branch</th><th className="px-3 py-3">Mfg. Date</th><th className="px-3 py-3 text-right">QA good / allocated</th><th className="px-3 py-3 text-right">Materials</th><th className="px-3 py-3 text-right">Labor</th><th className="px-3 py-3 text-right">Overhead</th><th className="px-3 py-3 text-right">Allocated COGS</th><th className="px-3 py-3 text-right">Revenue</th><th className="px-3 py-3 text-right">Gross profit / margin</th></tr>
                            </thead>
                            <tbody className="divide-y">
                                {report.rows.map((row) => {
                                    const expanded = report.expandedRows.has(row.key);
                                    return (
                                        <Fragment key={row.key}>
                                            <tr className="align-top hover:bg-muted/20">
                                                <td className="px-3 py-3"><button type="button" aria-label={`${expanded ? "Collapse" : "Expand"} ${row.jobOrderNo} batch ${row.batchNumber}`} onClick={() => report.toggleExpanded(row.key, row.yieldLedgerId)} className="rounded border px-2 py-1 text-xs hover:bg-muted">{expanded ? "−" : "+"}</button></td>
                                                <td className="px-3 py-3"><div className="font-semibold">{row.batchNumber}</div><div className="mt-0.5 text-xs text-muted-foreground">{row.jobOrderNo}{row.lotNumber && row.lotNumber !== row.batchNumber ? ` · Lot ${row.lotNumber}` : ""}</div></td>
                                                <td className="px-3 py-3"><div>{row.salesOrderNumbers.length ? row.salesOrderNumbers.join(", ") : <span className="text-muted-foreground">Unlinked</span>}</div><div className="mt-1 text-xs text-muted-foreground">JO {row.status}</div></td>
                                                <td className="px-3 py-3"><div className="font-medium">{row.productName}</div><div className="mt-0.5 text-xs text-muted-foreground">{row.productCode}{row.productCode ? " · " : ""}{row.branchName}</div></td>
                                                <td className="px-3 py-3 whitespace-nowrap">{row.manufacturingDate || "—"}</td>
                                                <td className="px-3 py-3 text-right tabular-nums"><div>{quantity.format(row.goodQuantity)} {row.uom}</div><div className="mt-0.5 text-xs text-muted-foreground">{quantity.format(row.allocatedQuantity)} allocated</div>{row.unallocatedQuantity > 0 && <div className="text-xs text-amber-700">{quantity.format(row.unallocatedQuantity)} unallocated</div>}</td>
                                                <td className="px-3 py-3 text-right tabular-nums">{money(row.directMaterialsCost)}</td>
                                                <td className="px-3 py-3 text-right tabular-nums">{money(row.directLaborCost)}</td>
                                                <td className="px-3 py-3 text-right tabular-nums">{money(row.manufacturingOverheadCost)}</td>
                                                <td className="px-3 py-3 text-right tabular-nums">{money(row.allocatedCogs)}</td>
                                                <td className="px-3 py-3 text-right tabular-nums">{money(row.revenue)}</td>
                                                <td className={`px-3 py-3 text-right font-semibold tabular-nums ${row.grossProfit === null ? "text-muted-foreground" : row.grossProfit < 0 ? "text-red-600" : "text-emerald-700"}`}><div>{money(row.grossProfit)}</div><div className="mt-0.5 text-xs font-normal">{row.grossMarginPercent === null ? "Margin N/A" : `${row.grossMarginPercent.toFixed(2)}%`}</div>{!row.complete && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">Incomplete</span>}</td>
                                            </tr>
                                            {expanded && <tr><td colSpan={12} className="p-0">
                                                {report.batchDetails[row.yieldLedgerId]?.status === "loaded" && report.batchDetails[row.yieldLedgerId].detail ? (
                                                    <CostDetails row={row} detail={report.batchDetails[row.yieldLedgerId].detail!} />
                                                ) : report.batchDetails[row.yieldLedgerId]?.status === "error" ? (
                                                    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 p-4 text-sm text-red-700">
                                                        <span>{report.batchDetails[row.yieldLedgerId].error}</span>
                                                        <Button variant="outline" size="sm" onClick={() => report.loadBatchDetails(row.yieldLedgerId, true)}>Retry details</Button>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-3 border-t bg-muted/20 p-4" aria-label="Loading batch cost details">
                                                        <Skeleton className="h-4 w-48" />
                                                        <Skeleton className="h-20 w-full" />
                                                    </div>
                                                )}
                                            </td></tr>}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                <div className="flex flex-col gap-2 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-muted-foreground">Showing {report.totalRows === 0 ? 0 : (report.page - 1) * report.pageSize + 1}–{Math.min(report.page * report.pageSize, report.totalRows)} of {report.totalRows.toLocaleString()}</div>
                    <div className="flex items-center gap-2">
                        <select aria-label="Rows per page" className="h-8 rounded-md border bg-background px-2 text-xs" value={report.pageSize} onChange={(event) => report.setPageSize(Number(event.target.value))}>{[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size} rows</option>)}</select>
                        <Button variant="outline" size="sm" disabled={report.loading || report.page <= 1} onClick={() => report.setPage(report.page - 1)}>Previous</Button>
                        <span className="min-w-20 text-center text-xs text-muted-foreground">Page {report.page} of {report.pageCount}</span>
                        <Button variant="outline" size="sm" disabled={report.loading || report.page >= report.pageCount} onClick={() => report.setPage(report.page + 1)}>Next</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
