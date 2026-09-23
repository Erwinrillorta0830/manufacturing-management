"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, FileSpreadsheet, FileText, RefreshCw, Search, X } from "lucide-react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchableSelect } from "@/modules/manufacturing-management/shared/components/SearchableSelect";
import { JOB_ORDER_STATUS, normalizeJobOrderStatus } from "@/modules/manufacturing-management/job-order-status";
import { useProductionOutputVarianceReport } from "./hooks/useProductionOutputVarianceReport";
import type { ProductionOutputVarianceRow, ProductionOutputVarianceSortKey } from "./types";
import { displayDateInManila, formatCompletionVariance, formatQuantity } from "./utils/report-metrics";

const STATUS_BADGE_STYLES: Record<string, string> = {
    [JOB_ORDER_STATUS.DRAFT]: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    [JOB_ORDER_STATUS.FOR_PICKING]: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
    [JOB_ORDER_STATUS.PICKED]: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
    [JOB_ORDER_STATUS.IN_PRODUCTION]: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    [JOB_ORDER_STATUS.PRODUCTION_COMPLETED]: "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
    [JOB_ORDER_STATUS.FOR_QA_RECONCILIATION]: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
    [JOB_ORDER_STATUS.ON_HOLD]: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400",
    [JOB_ORDER_STATUS.QA_HOLD]: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
    [JOB_ORDER_STATUS.CLOSED]: "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-400",
    [JOB_ORDER_STATUS.CANCELLED]: "border-destructive/30 bg-destructive/10 text-destructive"
};

function filterDescription(filters: ReturnType<typeof useProductionOutputVarianceReport>["filters"]): string {
    return [
        filters.dateFrom || filters.dateTo ? `Planned completion: ${filters.dateFrom || "Any"} to ${filters.dateTo || "Any"}` : "",
        filters.branchId !== "all" ? `Branch: ${filters.branchId}` : "",
        filters.productId !== "all" ? `Product: ${filters.productId}` : "",
        filters.status !== "all" ? `Status: ${filters.status}` : "",
        filters.search ? `Search: ${filters.search}` : ""
    ].filter(Boolean).join(" | ") || "All Job Orders";
}

function exportRows(rows: ProductionOutputVarianceRow[]) {
    return rows.map((row) => ({
        "Job Order": row.jobOrderNo,
        Product: row.productName,
        SKU: row.productCode,
        UOM: row.uom,
        Branch: row.branchName,
        Status: row.status,
        "Planned Quantity": row.plannedQuantity,
        "Actual Good Yield": row.actualGoodQuantity,
        "Rejected Quantity": row.rejectedQuantity,
        "Quantity Variance": row.quantityVariance,
        "Variance %": row.quantityVariancePercent,
        "Planned Completion": row.plannedCompletionDate ? displayDateInManila(row.plannedCompletionDate) : "",
        "Actual Completion": row.actualCompletionDate ? displayDateInManila(row.actualCompletionDate) : "",
        "Completion Variance (Days)": row.completionVarianceDays
    }));
}

export default function ProductionOutputVarianceReportModule() {
    const report = useProductionOutputVarianceReport();
    const isLoading = report.loading || report.refreshing;
    const formatWithUom = (quantity: number, uom: string) => `${formatQuantity(quantity)} ${uom || "units"}`;
    const formatSummaryByUom = (key: "plannedQuantity" | "actualGoodQuantity" | "rejectedQuantity" | "quantityVariance") =>
        report.summary.quantitiesByUom.map((totals) => `${key === "quantityVariance" && totals[key] > 0 ? "+" : ""}${formatQuantity(totals[key])} ${totals.uom}`).join(" · ") || "—";
    const varianceValues = report.summary.quantitiesByUom.map((totals) => totals.quantityVariance);
    const varianceTone = varianceValues.some((value) => value < 0) && varianceValues.some((value) => value > 0)
        ? undefined
        : varianceValues.some((value) => value < 0) ? "negative" : varianceValues.some((value) => value > 0) ? "positive" : undefined;
    const activeFilterDescription = useMemo(() => filterDescription(report.filters), [report.filters]);

    const exportExcel = async () => {
        try {
            const result = await report.exportAllRows();
            if (result.rows.length === 0) {
                toast.info("There are no filtered rows to export.");
                return;
            }
            const rows = exportRows(result.rows);
            const worksheet = XLSX.utils.json_to_sheet(rows);
            worksheet["!cols"] = Object.keys(rows[0]).map((header) => ({
                wch: Math.min(34, Math.max(header.length + 2, ...rows.map((row) => String(row[header as keyof typeof row] ?? "").length + 2)))
            }));
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Output Variance");
            XLSX.writeFile(workbook, `production-output-variance-${new Date().toISOString().slice(0, 10)}.xlsx`);
            toast.success("Excel report downloaded.");
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Failed to prepare the Excel report.");
        }
    };

    const exportPdf = async () => {
        let rows: ProductionOutputVarianceRow[];
        try {
            rows = (await report.exportAllRows()).rows;
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Failed to prepare the PDF report.");
            return;
        }
        if (rows.length === 0) {
            toast.info("There are no filtered rows to export.");
            return;
        }
        const document = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        document.setFontSize(15);
        document.text("PRODUCTION OUTPUT & VARIANCE REPORT", 12, 14);
        document.setFontSize(8);
        document.text(`Generated: ${new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })}`, 12, 20);
        document.text(`Filters: ${activeFilterDescription}`, 12, 25, { maxWidth: 270 });
        autoTable(document, {
            startY: 31,
            head: [["JO", "Product", "Branch", "Status", "Planned", "Good Yield", "Rejected", "Qty Variance", "Variance %", "Plan Complete", "Actual Complete", "Date Variance"]],
            body: rows.map((row) => [
                row.jobOrderNo,
                `${row.productName}${row.productCode ? ` (${row.productCode})` : ""}`,
                row.branchName,
                row.status,
                `${formatQuantity(row.plannedQuantity)} ${row.uom}`,
                `${formatQuantity(row.actualGoodQuantity)} ${row.uom}`,
                `${formatQuantity(row.rejectedQuantity)} ${row.uom}`,
                `${row.quantityVariance > 0 ? "+" : ""}${formatQuantity(row.quantityVariance)} ${row.uom}`,
                row.quantityVariancePercent === null ? "—" : `${row.quantityVariancePercent.toFixed(2)}%`,
                row.plannedCompletionDate ? displayDateInManila(row.plannedCompletionDate) : "—",
                row.actualCompletionDate ? displayDateInManila(row.actualCompletionDate) : "—",
                formatCompletionVariance(row.completionVarianceDays)
            ]),
            styles: { fontSize: 6.5, cellPadding: 2, overflow: "linebreak" },
            headStyles: { fillColor: [30, 41, 59], fontSize: 6.5 },
            margin: { left: 8, right: 8 }
        });
        document.save(`production-output-variance-${new Date().toISOString().slice(0, 10)}.pdf`);
        toast.success("PDF report downloaded.");
    };

    const sortHeader = (label: string, key: ProductionOutputVarianceSortKey, align: "left" | "right" = "left") => {
        const active = report.sortKey === key;
        const Icon = active ? (report.sortDirection === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
        return (
            <TableHead className={`whitespace-normal break-words px-1.5 py-3 text-xs uppercase leading-tight tracking-wide text-muted-foreground sm:px-2 ${align === "right" ? "text-right" : "text-left"}`}>
                <button type="button" onClick={() => report.toggleSort(key)} className={`flex w-full min-w-0 items-center gap-1 font-semibold hover:text-foreground ${align === "right" ? "justify-end text-right" : "text-left"}`}>
                    <span className="min-w-0 break-words">{label}</span><Icon className="h-3 w-3 shrink-0" />
                </button>
            </TableHead>
        );
    };

    return (
        <div className="space-y-5 p-4 sm:p-6">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Production Output &amp; Variance Report</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Compare planned Job Order quantities and completion dates with actual shop-floor yield.</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 sm:mt-0">
                    <Button variant="outline" size="sm" onClick={() => void report.refresh()} disabled={isLoading} className="h-9 bg-background text-sm">
                        {isLoading ? <><Skeleton className="mr-1.5 h-4 w-4 shrink-0" />{report.refreshing ? "Refreshing report" : "Loading report"}</> : <><RefreshCw className="mr-1.5 h-4 w-4" />Refresh report</>}
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportExcel} disabled={report.exporting} className="h-9 bg-background text-sm">
                        <FileSpreadsheet className="mr-1.5 h-4 w-4 text-emerald-600" /> {report.exporting ? "Preparing…" : "Excel"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportPdf} disabled={report.exporting} className="h-9 bg-background text-sm">
                        <FileText className="mr-1.5 h-4 w-4 text-rose-600" /> {report.exporting ? "Preparing…" : "PDF"}
                    </Button>
                </div>
            </div>

            {report.error && (
                <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <span>{report.error}</span>
                    <Button variant="outline" size="sm" onClick={() => void report.refresh()}>Retry</Button>
                </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <SummaryCard label="Job Orders" value={report.summary.jobCount.toLocaleString()} loading={isLoading} />
                <SummaryCard label="Planned Quantity" value={formatSummaryByUom("plannedQuantity")} loading={isLoading} />
                <SummaryCard label="Actual Good Yield" value={formatSummaryByUom("actualGoodQuantity")} loading={isLoading} />
                <SummaryCard label="Output Variance" value={formatSummaryByUom("quantityVariance")} tone={varianceTone} loading={isLoading} />
                <SummaryCard label="Rejected Quantity" value={formatSummaryByUom("rejectedQuantity")} tone={report.summary.quantitiesByUom.some((totals) => totals.rejectedQuantity > 0) ? "negative" : undefined} loading={isLoading} />
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-8">
                    <label className="space-y-1 text-xs font-medium sm:col-span-2 xl:col-span-2">
                        <span>Search</span>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input aria-label="Search Job Orders" maxLength={200} placeholder="Search JO, product, SKU, branch, status" value={report.filters.search} onChange={(event) => report.setFilter("search", event.target.value)} className="h-9 pl-9 pr-9 text-sm" />
                            {report.filters.search && <button type="button" aria-label="Clear search" className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground" onClick={() => report.setFilter("search", "")}><X className="h-4 w-4" /></button>}
                        </div>
                    </label>
                    <label className="space-y-1 text-xs font-medium">
                        <span>Branch</span>
                        <select aria-label="Filter by branch" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={report.filters.branchId} onChange={(event) => report.setFilter("branchId", event.target.value)}>
                            <option value="all">All branches</option>{report.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.label}</option>)}
                        </select>
                    </label>
                    <label className="space-y-1 text-xs font-medium">
                        <span>Product</span>
                        <SearchableSelect
                            options={[
                                { value: "all", label: "All products" },
                                ...report.products.map((product) => ({ value: String(product.id), label: product.label }))
                            ]}
                            value={report.filters.productId}
                            onValueChange={(value) => report.setFilter("productId", value)}
                            placeholder="All products"
                            searchPlaceholder="Search products..."
                            emptyMessage="No products found."
                            triggerClassName="h-9 text-sm"
                        />
                    </label>
                    <label className="space-y-1 text-xs font-medium">
                        <span>JO status</span>
                        <select aria-label="Filter by status" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={report.filters.status} onChange={(event) => report.setFilter("status", event.target.value)}>
                            <option value="all">All statuses</option>{report.statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                    </label>
                    <div className="space-y-1 text-xs font-medium sm:col-span-2 xl:col-span-3">
                        <span className="block">Planned completion range</span>
                        <div className="flex items-center gap-2">
                            <label className="min-w-0 flex-1"><span className="sr-only">Planned completion from</span><Input type="date" value={report.filters.dateFrom} onChange={(event) => report.setFilter("dateFrom", event.target.value)} className="h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm" /></label>
                            <span className="text-xs text-muted-foreground">to</span>
                            <label className="min-w-0 flex-1"><span className="sr-only">Planned completion to</span><Input type="date" value={report.filters.dateTo} onChange={(event) => report.setFilter("dateTo", event.target.value)} className="h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm" /></label>
                            <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 px-2 text-sm" onClick={report.resetFilters}>Clear</Button>
                        </div>
                    </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Date range filters by planned completion date. Excel and PDF include all rows matching the active filters.</p>
            </div>

            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="flex items-center justify-between border-b px-4 py-3">
                    <div><h2 className="font-semibold">Job Order Output Variance</h2>{isLoading ? <Skeleton className="mt-1 h-3 w-36" /> : <p className="text-xs text-muted-foreground">{report.totalCount.toLocaleString()} matching Job Orders</p>}</div>
                    <Download className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="overflow-hidden">
                    <table className="w-full table-fixed text-sm">
                        <colgroup>
                            <col style={{ width: "8%" }} />
                            <col style={{ width: "12%" }} />
                            <col style={{ width: "8%" }} />
                            <col style={{ width: "8%" }} />
                            <col style={{ width: "8%" }} />
                            <col style={{ width: "8%" }} />
                            <col style={{ width: "7%" }} />
                            <col style={{ width: "8%" }} />
                            <col style={{ width: "7%" }} />
                            <col style={{ width: "9%" }} />
                            <col style={{ width: "9%" }} />
                            <col style={{ width: "8%" }} />
                        </colgroup>
                        <TableHeader className="bg-muted/60"><TableRow className="hover:bg-transparent">
                            {sortHeader("Job Order", "jobOrderNo")}{sortHeader("Product", "productName")}{sortHeader("Branch", "branchName")}{sortHeader("Status", "status")}
                            {sortHeader("Planned Qty", "plannedQuantity", "right")}{sortHeader("Good Yield", "actualGoodQuantity", "right")}{sortHeader("Rejected", "rejectedQuantity", "right")}{sortHeader("Qty Variance", "quantityVariance", "right")}{sortHeader("Variance %", "quantityVariancePercent", "right")}{sortHeader("Planned Completion", "plannedCompletionDate")}{sortHeader("Actual Completion", "actualCompletionDate")}{sortHeader("Date Variance", "completionVarianceDays")}
                        </TableRow></TableHeader>
                        <TableBody>
                            {isLoading ? Array.from({ length: 6 }, (_, index) => <TableRow key={index}><TableCell colSpan={12} className="whitespace-normal"><Skeleton className="h-5 w-full" /></TableCell></TableRow>) : report.rows.length === 0 ? (
                                <TableRow><TableCell colSpan={12} className="h-28 whitespace-normal text-center text-muted-foreground">No Job Orders match the selected filters.</TableCell></TableRow>
                            ) : report.rows.map((row) => (
                                <TableRow key={row.jobOrderId} className="align-top hover:bg-muted/20">
                                    <TableCell className="whitespace-normal break-words px-1.5 py-3 font-semibold sm:px-2">{row.jobOrderNo}</TableCell>
                                    <TableCell className="min-w-0 whitespace-normal break-words px-1.5 py-3 sm:px-2"><div className="break-words font-medium">{row.productName}</div><div className="break-words text-xs text-muted-foreground">{row.productCode || "—"}</div></TableCell>
                                    <TableCell className="whitespace-normal break-words px-1.5 py-3 sm:px-2">{row.branchName}</TableCell>
                                    <TableCell className="whitespace-normal break-words px-1.5 py-3 sm:px-2">
                                        <Badge variant="outline" className={`max-w-full whitespace-normal break-words px-1.5 py-0.5 text-center text-xs leading-tight ${STATUS_BADGE_STYLES[normalizeJobOrderStatus(row.status) ?? ""] ?? "border-border bg-muted text-muted-foreground"}`}>
                                            {row.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="whitespace-normal break-words px-1 py-3 text-right tabular-nums sm:px-1.5">{formatWithUom(row.plannedQuantity, row.uom)}</TableCell>
                                    <TableCell className="whitespace-normal break-words px-1 py-3 text-right font-medium tabular-nums sm:px-1.5">{formatWithUom(row.actualGoodQuantity, row.uom)}</TableCell>
                                    <TableCell className="whitespace-normal break-words px-1 py-3 text-right tabular-nums sm:px-1.5">{formatWithUom(row.rejectedQuantity, row.uom)}</TableCell>
                                    <TableCell className={`whitespace-normal break-words px-1 py-3 text-right font-semibold tabular-nums sm:px-1.5 ${row.quantityVariance < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>{row.quantityVariance > 0 ? "+" : ""}{formatWithUom(row.quantityVariance, row.uom)}</TableCell>
                                    <TableCell className="whitespace-normal break-words px-1 py-3 text-right tabular-nums sm:px-1.5">{row.quantityVariancePercent === null ? "—" : `${row.quantityVariancePercent > 0 ? "+" : ""}${row.quantityVariancePercent.toFixed(2)}%`}</TableCell>
                                    <TableCell className="whitespace-normal break-words px-1.5 py-3 sm:px-2">{displayDateInManila(row.plannedCompletionDate)}</TableCell>
                                    <TableCell className="whitespace-normal break-words px-1.5 py-3 sm:px-2">{displayDateInManila(row.actualCompletionDate)}</TableCell>
                                    <TableCell className="whitespace-normal break-words px-1.5 py-3 sm:px-2"><CompletionVarianceBadge days={row.completionVarianceDays} /></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </table>
                </div>
                <div className="flex flex-col gap-2 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-muted-foreground">Showing {report.totalCount === 0 ? 0 : (report.page - 1) * report.pageSize + 1}–{Math.min(report.page * report.pageSize, report.totalCount)} of {report.totalCount.toLocaleString()}</div>
                    <div className="flex items-center gap-2">
                        <select aria-label="Rows per page" className="h-8 rounded-md border bg-background px-2 text-xs" value={report.pageSize} onChange={(event) => { report.setPageSize(Number(event.target.value)); report.setPage(1); }}>
                            {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size} rows</option>)}
                        </select>
                        <Button variant="outline" size="sm" disabled={report.page <= 1} onClick={() => report.setPage(report.page - 1)}>Previous</Button>
                        <span className="min-w-20 text-center text-xs text-muted-foreground">Page {report.page} of {report.pageCount}</span>
                        <Button variant="outline" size="sm" disabled={report.page >= report.pageCount} onClick={() => report.setPage(report.page + 1)}>Next</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function SummaryCard({ label, value, tone, loading = false }: { label: string; value: string; tone?: "positive" | "negative"; loading?: boolean }) {
    return (
        <div className="rounded-xl border bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            {loading ? <Skeleton className="mt-2 h-7 w-4/5" /> : <p className={`mt-1 break-words text-xl font-bold leading-tight tabular-nums ${tone === "negative" ? "text-destructive" : tone === "positive" ? "text-emerald-700 dark:text-emerald-400" : ""}`}>{value}</p>}
        </div>
    );
}

function CompletionVarianceBadge({ days }: { days: number | null }) {
    const className = "max-w-full whitespace-normal break-words px-1.5 py-0.5 text-center text-xs leading-tight";
    if (days === null) return <Badge variant="secondary" className={className}>Pending</Badge>;
    if (days > 0) return <Badge variant="destructive" className={className}>{formatCompletionVariance(days)}</Badge>;
    if (days < 0) return <Badge className={`border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400 ${className}`}>{formatCompletionVariance(days)}</Badge>;
    return <Badge variant="outline" className={className}>On time</Badge>;
}
