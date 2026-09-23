"use client";

import { Fragment, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, FileSpreadsheet, FileText, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchableSelect } from "@/modules/manufacturing-management/shared/components/SearchableSelect";
import { JOB_ORDER_STATUS, normalizeJobOrderStatus } from "@/modules/manufacturing-management/job-order-status";
import { useLaborEfficiencyProductivityReport } from "./hooks/useLaborEfficiencyProductivityReport";
import type { LaborEfficiencyRow, LaborEfficiencySortKey } from "./types";

const hoursFormat = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const quantityFormat = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 4 });
const percentageFormat = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_STYLES: Record<string, string> = {
    [JOB_ORDER_STATUS.IN_PRODUCTION]: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    [JOB_ORDER_STATUS.ON_HOLD]: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400",
    [JOB_ORDER_STATUS.QA_HOLD]: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
    [JOB_ORDER_STATUS.PRODUCTION_COMPLETED]: "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
    [JOB_ORDER_STATUS.FOR_QA_RECONCILIATION]: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
    [JOB_ORDER_STATUS.CLOSED]: "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-400"
};

function formatHours(value: number | null): string {
    return value === null ? "—" : hoursFormat.format(value);
}

function formatPercent(value: number | null): string {
    return value === null ? "—" : `${percentageFormat.format(value)}%`;
}

function varianceColor(value: number | null): string {
    if (value === null || value === 0) return "text-muted-foreground";
    return value > 0 ? "text-red-600" : "text-emerald-700";
}

function SummaryCard({ label, value, note, color }: { label: string; value: string; note?: string; color?: string }) {
    return <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 text-xl font-bold tabular-nums ${color || ""}`}>{value}</div>
        {note && <div className="mt-1 text-xs text-muted-foreground">{note}</div>}
    </div>;
}

function RowDetails({ row }: { row: LaborEfficiencyRow }) {
    return <div className="space-y-4 border-t bg-muted/20 p-4 sm:p-5">
        {row.incompleteReasons.length > 0 && <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">{row.incompleteReasons.join(" ")}</div>}
        <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-lg border bg-background p-3">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Standard labor allowance by position</h3>
                {row.standardLines.length === 0 ? <p className="py-2 text-xs text-muted-foreground">No linked direct-labor standard is available.</p> : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[520px] text-xs">
                            <thead className="border-b text-left text-muted-foreground"><tr>
                                <th className="px-2 py-2">Route / Position</th><th className="px-2 py-2 text-right">People</th><th className="px-2 py-2 text-right">Hours / person</th><th className="px-2 py-2 text-right">Earned standard</th>
                            </tr></thead>
                            <tbody className="divide-y">{row.standardLines.map((line, index) => <tr key={`${line.routeName}-${line.positionName}-${index}`}>
                                <td className="px-2 py-2"><div className="font-medium">{line.routeName}</div><div className="text-muted-foreground">{line.positionName}</div></td>
                                <td className="px-2 py-2 text-right tabular-nums">{line.manpowerCount}</td>
                                <td className="px-2 py-2 text-right tabular-nums">{formatHours(line.hoursRequired)}</td>
                                <td className="px-2 py-2 text-right tabular-nums">{formatHours(line.earnedStandardHours)}</td>
                            </tr>)}</tbody>
                        </table>
                    </div>
                )}
            </section>
            <section className="rounded-lg border bg-background p-3">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Actual hours by route and operator</h3>
                {row.actualLines.length === 0 ? <p className="py-2 text-xs text-muted-foreground">No operator labor time is recorded.</p> : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[520px] text-xs">
                            <thead className="border-b text-left text-muted-foreground"><tr>
                                <th className="px-2 py-2">Route / Operator</th><th className="px-2 py-2 text-right">Logged</th><th className="px-2 py-2 text-right">Running</th><th className="px-2 py-2 text-right">Actual total</th>
                            </tr></thead>
                            <tbody className="divide-y">{row.actualLines.map((line, index) => <tr key={`${line.operationName}-${line.operatorName}-${index}`}>
                                <td className="px-2 py-2"><div className="font-medium">{line.operationName}</div><div className="text-muted-foreground">{line.operatorName}</div></td>
                                <td className="px-2 py-2 text-right tabular-nums">{formatHours(line.loggedHours)}</td>
                                <td className="px-2 py-2 text-right tabular-nums">{line.timerRunning ? <span className="text-amber-700">{formatHours(line.runningHours)} · provisional</span> : "—"}</td>
                                <td className="px-2 py-2 text-right tabular-nums">{formatHours(line.totalHours)}</td>
                            </tr>)}</tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    </div>;
}

export default function LaborEfficiencyProductivityReportModule() {
    const report = useLaborEfficiencyProductivityReport();
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
    const [exportingFormat, setExportingFormat] = useState<"excel" | "pdf" | null>(null);
    const isLoading = report.loading || report.refreshing;

    const exportReport = async (format: "excel" | "pdf") => {
        setExportingFormat(format);
        try {
            const downloaded = await report.exportReport(format === "excel" ? "xlsx" : "pdf");
            if (!downloaded) {
                toast.info("There are no filtered rows to export.");
                return;
            }
            toast.success(`${format === "excel" ? "Excel" : "PDF"} report downloaded.`);
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Unable to export the report.");
        } finally {
            setExportingFormat(null);
        }
    };

    const toggleExpanded = (id: number) => setExpandedRows((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });

    const sortHeader = (label: string, key: LaborEfficiencySortKey, align: "left" | "right" = "left") => {
        const active = report.sortKey === key;
        const Icon = active ? (report.sortDirection === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
        return <TableHead className={`whitespace-normal px-2 py-3 text-xs uppercase leading-tight tracking-wide text-muted-foreground ${align === "right" ? "text-right" : "text-left"}`}>
            <button type="button" onClick={() => report.toggleSort(key)} className={`flex w-full items-center gap-1 font-semibold hover:text-foreground ${align === "right" ? "justify-end" : "justify-start"}`}>
                {label}<Icon className="h-3.5 w-3.5 shrink-0" />
            </button>
        </TableHead>;
    };

    return <div className="space-y-5 p-4 sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
                <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Labor Efficiency &amp; Productivity Report</h1>
                <p className="mt-1 text-sm text-muted-foreground">Compares version labor allowance earned by QA-passed output with actual shop-floor operator hours.</p>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 sm:mt-0">
                <Button variant="outline" size="sm" onClick={report.refresh} disabled={isLoading} className="h-9 bg-background text-sm"><RefreshCw className={`mr-1.5 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />Refresh report</Button>
                <Button variant="outline" size="sm" onClick={() => void exportReport("excel")} disabled={isLoading || report.exporting || exportingFormat !== null} className="h-9 bg-background text-sm"><FileSpreadsheet className="mr-1.5 h-4 w-4 text-emerald-600" />Excel</Button>
                <Button variant="outline" size="sm" onClick={() => void exportReport("pdf")} disabled={isLoading || report.exporting || exportingFormat !== null} className="h-9 bg-background text-sm"><FileText className="mr-1.5 h-4 w-4 text-rose-600" />PDF</Button>
            </div>
        </div>

        {report.error && <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"><span>{report.error}</span><Button variant="outline" size="sm" onClick={report.refresh}>Retry</Button></div>}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {isLoading ? Array.from({ length: 5 }, (_, index) => <div key={index} className="rounded-xl border bg-card p-4 shadow-sm"><Skeleton className="h-3 w-32" /><Skeleton className="mt-2 h-6 w-2/3" /><Skeleton className="mt-2 h-3 w-full" /></div>) : <>
                <SummaryCard label="Comparable JOs" value={report.summary.comparableCount.toLocaleString()} note={`${report.summary.incompleteCount} incomplete or awaiting QA-passed output`} />
                <SummaryCard label="Standard labor hours" value={hoursFormat.format(report.summary.standardHours)} note="Earned by passed good output" />
                <SummaryCard label="Actual labor hours" value={hoursFormat.format(report.summary.actualHours)} note="Includes active timer time provisionally" />
                <SummaryCard label="Labor efficiency" value={formatPercent(report.summary.efficiencyPercent)} note="Standard hours ÷ actual hours" color={report.summary.efficiencyPercent === null ? "" : report.summary.efficiencyPercent >= 100 ? "text-emerald-700" : "text-red-600"} />
                <SummaryCard label="Productivity" value={report.summary.productivityByUom.map((item) => `${item.productivity === null ? "—" : quantityFormat.format(item.productivity)} ${item.uom}/hr`).join(" · ") || "—"} note="QA-passed output per labor hour, grouped by UOM" />
            </>}
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
                <label className="space-y-1 text-xs font-medium sm:col-span-2 xl:col-span-2"><span>Search</span><div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input aria-label="Search Job Orders" maxLength={200} placeholder="Search JO number" value={report.filters.jobOrder} onChange={(event) => report.setFilter("jobOrder", event.target.value)} className="h-9 pl-9 pr-9 text-sm" />
                    {report.filters.jobOrder && <button type="button" aria-label="Clear search" className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground" onClick={() => report.setFilter("jobOrder", "")}><X className="h-4 w-4" /></button>}
                </div></label>
                <label className="space-y-1 text-xs font-medium"><span>Branch</span><select aria-label="Filter by branch" value={report.filters.branchId} onChange={(event) => report.setFilter("branchId", event.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="all">All branches</option>{report.branches.map((item) => <option key={item.id} value={String(item.id)}>{item.label}</option>)}</select></label>
                <label className="space-y-1 text-xs font-medium"><span>Product</span><SearchableSelect options={[{ value: "all", label: "All products" }, ...report.products.map((item) => ({ value: String(item.id), label: item.label }))]} value={report.filters.productId} onValueChange={(value) => report.setFilter("productId", value)} placeholder="All products" searchPlaceholder="Search products..." emptyMessage="No products found." triggerClassName="h-9 text-sm" /></label>
                <label className="space-y-1 text-xs font-medium"><span>JO status</span><select aria-label="Filter by status" value={report.filters.status} onChange={(event) => report.setFilter("status", event.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="all">All included statuses</option>{[JOB_ORDER_STATUS.IN_PRODUCTION, JOB_ORDER_STATUS.ON_HOLD, JOB_ORDER_STATUS.QA_HOLD, JOB_ORDER_STATUS.PRODUCTION_COMPLETED, JOB_ORDER_STATUS.FOR_QA_RECONCILIATION, JOB_ORDER_STATUS.CLOSED].map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
                <div className="space-y-1 text-xs font-medium sm:col-span-2 xl:col-span-2"><span className="block">Created date range</span><div className="flex items-center gap-2">
                    <label className="min-w-0 flex-1"><span className="sr-only">Created from</span><Input aria-label="Created from" type="date" value={report.filters.dateFrom} onChange={(event) => report.setFilter("dateFrom", event.target.value)} className="h-9 px-2 text-sm" /></label><span className="text-xs text-muted-foreground">to</span>
                    <label className="min-w-0 flex-1"><span className="sr-only">Created to</span><Input aria-label="Created to" type="date" value={report.filters.dateTo} onChange={(event) => report.setFilter("dateTo", event.target.value)} className="h-9 px-2 text-sm" /></label>
                    <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 px-2 text-sm" onClick={report.clearFilters}>Clear</Button>
                </div></div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Positive hour variance means actual labor exceeded the standard allowance. Active timers are included in actual hours and labeled provisional.</p>
        </div>

        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-4 py-3"><div><h2 className="font-semibold">Job Order Labor Efficiency</h2>{isLoading ? <Skeleton className="mt-1 h-3 w-40" /> : <p className="text-xs text-muted-foreground">{report.totalRows.toLocaleString()} Job Orders · expand a row for standard and operator details.</p>}</div></div>
            <div className="overflow-x-auto">
                <Table className="min-w-[1040px] text-sm">
                    <TableHeader className="bg-muted/60"><TableRow className="hover:bg-transparent">
                        <TableHead className="w-10 px-2" />
                        {sortHeader("Job Order / Product", "jobOrderNo")}{sortHeader("Branch / Status", "branchName")}{sortHeader("QA-passed output", "goodOutputQuantity", "right")}{sortHeader("Standard hrs", "standardHours", "right")}{sortHeader("Actual hrs", "actualHours", "right")}{sortHeader("Variance hrs", "varianceHours", "right")}{sortHeader("Efficiency", "efficiencyPercent", "right")}{sortHeader("Productivity", "productivity", "right")}
                    </TableRow></TableHeader>
                    <TableBody>
                        {isLoading ? Array.from({ length: 6 }, (_, index) => <TableRow key={index}><TableCell><Skeleton className="h-5 w-5" /></TableCell><TableCell><Skeleton className="h-4 w-32" /><Skeleton className="mt-2 h-3 w-24" /></TableCell><TableCell><Skeleton className="h-4 w-28" /><Skeleton className="mt-2 h-4 w-20" /></TableCell>{Array.from({ length: 6 }, (_, cell) => <TableCell key={cell}><Skeleton className="ml-auto h-4 w-16" /></TableCell>)}</TableRow>)
                            : report.rows.length === 0 ? <TableRow><TableCell colSpan={9} className="p-12 text-center text-sm text-muted-foreground">No Job Orders match these filters.</TableCell></TableRow>
                                : report.rows.map((row) => <Fragment key={row.jobOrderId}>
                                    <TableRow>
                                        <TableCell className="px-2"><Button type="button" variant="ghost" size="icon" aria-label={`${expandedRows.has(row.jobOrderId) ? "Collapse" : "Expand"} ${row.jobOrderNo}`} className="h-7 w-7" onClick={() => toggleExpanded(row.jobOrderId)}>{expandedRows.has(row.jobOrderId) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</Button></TableCell>
                                        <TableCell className="max-w-60"><div className="truncate font-semibold">{row.jobOrderNo}</div><div className="truncate text-xs text-muted-foreground">{row.productName}{row.productCode ? ` · ${row.productCode}` : ""}</div></TableCell>
                                        <TableCell><div className="truncate">{row.branchName}</div><Badge variant="outline" className={`mt-1 whitespace-nowrap ${STATUS_STYLES[normalizeJobOrderStatus(row.status) || row.status] || ""}`}>{row.status}</Badge>{row.provisional && <Badge variant="outline" className="ml-1 border-amber-500/30 bg-amber-500/10 text-amber-700">Provisional</Badge>}</TableCell>
                                        <TableCell className="text-right tabular-nums">{quantityFormat.format(row.goodOutputQuantity)} {row.uom}</TableCell>
                                        <TableCell className="text-right tabular-nums">{formatHours(row.standardHours)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{formatHours(row.actualHours)}</TableCell>
                                        <TableCell className={`text-right tabular-nums ${varianceColor(row.varianceHours)}`}>{row.varianceHours === null ? "—" : `${row.varianceHours > 0 ? "+" : ""}${formatHours(row.varianceHours)}`}</TableCell>
                                        <TableCell className={`text-right tabular-nums ${row.efficiencyPercent === null ? "text-muted-foreground" : row.efficiencyPercent >= 100 ? "text-emerald-700" : "text-red-600"}`}>{formatPercent(row.efficiencyPercent)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.productivity === null ? "—" : `${quantityFormat.format(row.productivity)} ${row.uom}/hr`}</TableCell>
                                    </TableRow>
                                    {expandedRows.has(row.jobOrderId) && <TableRow><TableCell colSpan={9} className="p-0"><RowDetails row={row} /></TableCell></TableRow>}
                                </Fragment>)}
                    </TableBody>
                </Table>
            </div>
            <div className="flex flex-col gap-2 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-muted-foreground">Showing {report.totalRows === 0 ? 0 : (report.page - 1) * report.pageSize + 1}-{Math.min(report.page * report.pageSize, report.totalRows)} of {report.totalRows.toLocaleString()}</div>
                <div className="flex items-center gap-2"><select aria-label="Rows per page" className="h-8 rounded-md border bg-background px-2 text-xs" value={report.pageSize} onChange={(event) => report.setPageSize(Number(event.target.value))}>{[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size} rows</option>)}</select><Button variant="outline" size="sm" disabled={isLoading || report.page <= 1} onClick={() => report.setPage(report.page - 1)}>Previous</Button><span className="min-w-20 text-center text-xs text-muted-foreground">Page {report.page} of {report.pageCount}</span><Button variant="outline" size="sm" disabled={isLoading || report.page >= report.pageCount} onClick={() => report.setPage(report.page + 1)}>Next</Button></div>
            </div>
        </div>
    </div>;
}
