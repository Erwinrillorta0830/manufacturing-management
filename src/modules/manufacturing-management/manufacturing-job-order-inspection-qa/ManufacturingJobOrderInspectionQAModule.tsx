"use client";

import React from "react";
import {
    AlertCircle,
    Calendar as CalendarIcon,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    ClipboardCheck,
    Eye,
    Loader2,
    PackageCheck,
    RefreshCw,
    Search,
    X,
} from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPhtDate, formatPhtTimestamp } from "../shared/pht-date";
import { useDailyYieldAudit } from "./hooks/useDailyYieldAudit";
import { useJobOrderInspectionQA } from "./hooks/useJobOrderInspectionQA";
import { DailyYieldAuditDialog } from "./components/DailyYieldAuditDialog";
import type { JobOrderDailyYieldRecord } from "./types";

type AuditActionMode = "edit" | "view";

function quantity(value: number): string {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function dateRangeLabel(range: DateRange | undefined): string {
    if (!range?.from) return "Date: All";
    const from = format(range.from, "MMM d, yyyy");
    return range.to ? `${from} - ${format(range.to, "MMM d, yyyy")}` : `From ${from}`;
}

function statusClass(status: string): string {
    const normalized = status.toLowerCase();
    if (["passed", "production completed", "for qa and reconciliation", "closed"].includes(normalized)) {
        return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    }
    if (["on hold", "qa hold", "cancelled", "canceled"].includes(normalized)) {
        return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
    }
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function qaStatusClass(status: string): string {
    if (status === "Passed") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    if (status === "QA Hold") return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function qaStatusLabel(status: string): string {
    if (status === "Passed") return "Verified";
    if (status === "QA Hold") return "Discrepancy";
    return "Pending";
}

function auditNumber(record: JobOrderDailyYieldRecord, ...keys: string[]): number | null {
    const audit = record.audits.find((entry) => keys.some((key) => entry[key] !== undefined && entry[key] !== null));
    if (!audit) return null;
    const value = keys.map((key) => audit[key]).find((entry) => entry !== undefined && entry !== null);
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function discrepancyNote(record: JobOrderDailyYieldRecord): string | null {
    if (record.qaStatus !== "QA Hold") return null;
    const scannedQuantity = auditNumber(record, "actual_quantity", "actualQuantity", "scanned_quantity", "scannedQuantity");
    if (scannedQuantity !== null && Math.abs(record.totalQuantity - scannedQuantity) > 0.000001) {
        return `Logged total (${quantity(record.totalQuantity)}) doesn't match scanned pallet count (${quantity(scannedQuantity)})`;
    }
    return "QA discrepancy requires resolution before this Job Order can be closed.";
}

function DailyYieldRow({
    record,
    onAction,
}: {
    record: JobOrderDailyYieldRecord;
    onAction: (record: JobOrderDailyYieldRecord, mode: AuditActionMode) => void;
}) {
    const isVerified = record.qaStatus === "Passed";
    const isDiscrepancy = record.qaStatus === "QA Hold";
    const actionMode: AuditActionMode = isVerified ? "view" : "edit";
    const actionLabel = isVerified ? "View Audit" : isDiscrepancy ? "Resolve" : "Perform Audit";
    const note = discrepancyNote(record);

    return (
        <TableRow className={isDiscrepancy ? "bg-red-500/10 hover:bg-red-500/15" : undefined}>
            <TableCell className="min-w-[180px] align-top">
                <div className="font-semibold text-foreground">{record.shiftName}</div>
                <div className="mt-1 text-[11px] text-muted-foreground font-mono">Ledger #{record.ledgerId}</div>
                {record.sessionKey && <div className="text-[10px] text-muted-foreground truncate max-w-[180px]" title={record.sessionKey}>{record.sessionKey}</div>}
            </TableCell>
            <TableCell className="min-w-[150px] align-top">
                <div className="font-medium">{formatPhtDate(record.productionDate)}</div>
                {record.loggedAt && <div className="mt-1 text-[11px] text-muted-foreground">Logged {formatPhtTimestamp(record.loggedAt)}</div>}
            </TableCell>
            <TableCell className="font-mono text-right align-top font-semibold text-emerald-700 dark:text-emerald-300">{quantity(record.goodQuantity)}</TableCell>
            <TableCell className="font-mono text-right align-top font-semibold text-red-600 dark:text-red-300">{quantity(record.rejectedQuantity)}</TableCell>
            <TableCell className="font-mono text-right align-top text-muted-foreground">{quantity(record.scrapQuantity)}</TableCell>
            <TableCell className="min-w-[130px] align-top">
                <div className="font-semibold">{record.lotName || "—"}</div>
                {record.mmLotId && <div className="text-[10px] text-muted-foreground font-mono">#{record.mmLotId}</div>}
            </TableCell>
            <TableCell className="min-w-[130px] align-top font-mono">{record.batchNo || "—"}</TableCell>
            <TableCell className="min-w-[130px] align-top text-right">
                <div className="font-mono font-semibold">{quantity(record.totalQuantity)}</div>
                <div className="mt-1 text-[10px] text-muted-foreground">Good {quantity(record.goodQuantity)} · Scrap {quantity(record.scrapQuantity)}</div>
            </TableCell>
            <TableCell className="min-w-[165px] align-top">
                <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${isVerified ? "bg-emerald-600" : isDiscrepancy ? "bg-red-600" : "bg-amber-600"}`} />
                    <Badge variant="outline" className={qaStatusClass(record.qaStatus)}>{qaStatusLabel(record.qaStatus)}</Badge>
                </div>
                {note && <div className="mt-2 text-[11px] leading-4 text-red-600 dark:text-red-300">{note}</div>}
            </TableCell>
            <TableCell className="sticky right-0 z-10 min-w-[170px] align-top bg-card text-right shadow-[-8px_0_12px_-12px_hsl(var(--foreground)/0.45)]">
                <div className="flex flex-col items-end gap-2">
                    <Button
                        type="button"
                        size="sm"
                        variant={isVerified ? "outline" : "default"}
                        onClick={() => onAction(record, actionMode)}
                        title={isVerified ? "View the completed QA audit." : isDiscrepancy ? "Resolve the QA discrepancy." : "Record the daily yield QA audit."}
                        className={`min-h-9 gap-1.5 ${isDiscrepancy ? "border-red-500/30 bg-red-500/5 text-red-700 hover:bg-red-500/10 dark:text-red-300" : ""}`}
                    >
                        <ClipboardCheck className="h-4 w-4" /> {actionLabel}
                    </Button>
                </div>
            </TableCell>
        </TableRow>
    );
}

export default function ManufacturingJobOrderInspectionQAModule({ inspectorName }: { inspectorName?: string }) {
    const jobOrderState = useJobOrderInspectionQA();
    const auditState = useDailyYieldAudit({ onSaved: jobOrderState.refresh, inspectorName });
    const [closeConfirmOpen, setCloseConfirmOpen] = React.useState(false);
    const details = jobOrderState.selectedDetails;
    const canClose = details?.status === "For QA and Reconciliation";
    const isClosed = details?.status === "Closed";
    const closeSubmitting = details
        ? jobOrderState.closingJobOrderId === details.jobOrderId
        : false;
    const closeReady = details?.closeReadiness.ready === true;
    const verifiedYields = details?.dailyYields.filter((record) => record.qaStatus === "Passed") || [];
    const acceptedQuantity = verifiedYields.reduce((sum, record) => sum + record.goodQuantity, 0);
    const pendingYieldCount = details?.dailyYields.filter((record) => record.qaStatus === "Pending").length || 0;
    const discrepancyYieldCount = details?.dailyYields.filter((record) => record.qaStatus === "QA Hold").length || 0;

    return (
        <div className="space-y-5">
            <section className="rounded-2xl border bg-card shadow-sm">
                <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><PackageCheck className="h-5 w-5" /></div>
                        <div>
                            <h1 className="text-lg font-bold tracking-tight">Job Order Inspection QA</h1>
                            <p className="text-xs text-muted-foreground">Review daily production yields and complete in-process QA for each Job Order.</p>
                        </div>
                    </div>
                    <Button type="button" variant="outline" onClick={() => void jobOrderState.refresh()} disabled={jobOrderState.loading} className="min-h-10 gap-2 self-start sm:self-auto">
                        <RefreshCw className={`h-4 w-4 ${jobOrderState.loading ? "animate-spin" : ""}`} /> Refresh
                    </Button>
                </div>

                <div className="space-y-3 border-b px-4 py-3">
                    <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
                        <div className="relative min-w-0 flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                aria-label="Search Job Orders"
                                placeholder="Search Job Order or Product..."
                                value={jobOrderState.searchQuery}
                                onChange={(event) => jobOrderState.setSearchQuery(event.target.value)}
                                className="h-10 pl-9"
                            />
                        </div>
                        <Select
                            value={jobOrderState.statusFilter || "all"}
                            onValueChange={(value) => jobOrderState.setStatusFilter(value === "all" ? "" : value)}
                        >
                            <SelectTrigger className="h-10 w-full shrink-0 sm:w-[155px]" aria-label="Filter by status">
                                <SelectValue placeholder="Status: All" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Status: All</SelectItem>
                                {jobOrderState.statusOptions.map((status) => (
                                    <SelectItem key={status} value={status}>{status}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button type="button" variant="outline" className="h-10 w-full shrink-0 justify-start gap-2 font-normal sm:w-[220px]">
                                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                                    <span className="truncate">{dateRangeLabel(jobOrderState.dateRange)}</span>
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="range"
                                    selected={jobOrderState.dateRange}
                                    onSelect={jobOrderState.setDateRange}
                                    numberOfMonths={2}
                                    captionLayout="dropdown"
                                />
                                {jobOrderState.dateRange?.from && (
                                    <div className="flex items-center justify-between border-t bg-muted/20 p-2">
                                        <span className="text-xs text-muted-foreground">Range active</span>
                                        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => jobOrderState.setDateRange(undefined)}>
                                            <X className="mr-1 h-3.5 w-3.5" /> Clear
                                        </Button>
                                    </div>
                                )}
                            </PopoverContent>
                        </Popover>
                        <SearchableSelect
                            options={jobOrderState.productOptions}
                            value={jobOrderState.productFilter || undefined}
                            onValueChange={jobOrderState.setProductFilter}
                            placeholder="Product: All"
                            className="h-10 w-full shrink-0 sm:w-[190px]"
                        />
                    </div>

                    {jobOrderState.hasActiveFilters && (
                        <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
                            <span className="text-xs font-medium text-muted-foreground">Active filters:</span>
                            {jobOrderState.statusFilter && (
                                <Badge variant="outline" className="gap-1 rounded-full border-primary/30 bg-primary/5 pr-1 text-xs font-normal">
                                    Status: {jobOrderState.statusFilter}
                                    <button type="button" className="rounded-full p-0.5 hover:bg-primary/10" onClick={() => jobOrderState.setStatusFilter("")} aria-label="Clear status filter">
                                        <X className="h-3 w-3" />
                                    </button>
                                </Badge>
                            )}
                            {(jobOrderState.dateRange?.from || jobOrderState.dateRange?.to) && (
                                <Badge variant="outline" className="gap-1 rounded-full border-primary/30 bg-primary/5 pr-1 text-xs font-normal">
                                    {dateRangeLabel(jobOrderState.dateRange)}
                                    <button type="button" className="rounded-full p-0.5 hover:bg-primary/10" onClick={() => jobOrderState.setDateRange(undefined)} aria-label="Clear date filter">
                                        <X className="h-3 w-3" />
                                    </button>
                                </Badge>
                            )}
                            {jobOrderState.productFilter && (
                                <Badge variant="outline" className="gap-1 rounded-full border-primary/30 bg-primary/5 pr-1 text-xs font-normal">
                                    Product: {jobOrderState.productOptions.find((option) => option.value === jobOrderState.productFilter)?.label || jobOrderState.productFilter}
                                    <button type="button" className="rounded-full p-0.5 hover:bg-primary/10" onClick={() => jobOrderState.setProductFilter("")} aria-label="Clear product filter">
                                        <X className="h-3 w-3" />
                                    </button>
                                </Badge>
                            )}
                            {jobOrderState.flaggedOnly && (
                                <Badge variant="outline" className="gap-1 rounded-full border-red-500/30 bg-red-500/5 pr-1 text-xs font-normal text-red-700 dark:text-red-300">
                                    Needs review
                                    <button type="button" className="rounded-full p-0.5 hover:bg-red-500/10" onClick={() => jobOrderState.setFlaggedOnly(false)} aria-label="Clear flagged filter">
                                        <X className="h-3 w-3" />
                                    </button>
                                </Badge>
                            )}
                            <button type="button" className="text-xs font-medium text-primary underline-offset-2 hover:underline" onClick={jobOrderState.clearFilters}>
                                Clear all
                            </button>
                        </div>
                    )}
                </div>

                {jobOrderState.unresolvedJobOrderCount > 0 && (
                    <div className="mx-4 mt-3 flex flex-col gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between dark:text-red-300" role="status" aria-live="polite">
                        <div className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span>{jobOrderState.unresolvedJobOrderCount} Job Order{jobOrderState.unresolvedJobOrderCount === 1 ? " has" : "s have"} daily yield records with unresolved audit flags.</span>
                        </div>
                        <Button type="button" size="sm" variant="outline" className="min-h-9 shrink-0 border-red-500/30 bg-background text-red-700 hover:bg-red-500/10 dark:text-red-300" onClick={() => jobOrderState.setFlaggedOnly(!jobOrderState.flaggedOnly)}>
                            {jobOrderState.flaggedOnly ? "Show all" : "View flagged"}
                        </Button>
                    </div>
                )}

                {jobOrderState.loading ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading Job Orders...</div>
                ) : jobOrderState.error ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center" role="alert">
                        <AlertCircle className="h-7 w-7 text-destructive" />
                        <p className="max-w-lg text-sm text-destructive">{jobOrderState.error}</p>
                        <Button type="button" variant="outline" onClick={() => void jobOrderState.refresh()}>Retry</Button>
                    </div>
                ) : jobOrderState.jobOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
                        <PackageCheck className="h-8 w-8 opacity-50" />
                        <p className="text-sm font-medium">No daily yields are available.</p>
                        <p className="text-xs">Yield-bearing Job Orders will appear here after a production session is recorded.</p>
                    </div>
                ) : jobOrderState.filteredJobOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground" role="status">
                        <Search className="h-8 w-8 opacity-50" />
                        <p className="text-sm font-medium">No Job Orders match your search.</p>
                        <p className="text-xs">Try a different Job Order number or product name.</p>
                        <Button type="button" variant="outline" size="sm" onClick={jobOrderState.clearFilters}>
                            Clear filters
                        </Button>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="min-w-[170px]">Job Order</TableHead>
                                        <TableHead className="min-w-[170px]">Product</TableHead>
                                        <TableHead className="min-w-[145px]">Latest Yield</TableHead>
                                        <TableHead className="text-right">Target Qty</TableHead>
                                        <TableHead className="min-w-[145px] text-right">Produced Qty</TableHead>
                                        <TableHead className="min-w-[165px]">Status</TableHead>
                                        <TableHead className="min-w-[135px] text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {jobOrderState.visibleJobOrders.map((jobOrder) => (
                                        <TableRow key={jobOrder.jobOrderId}>
                                            <TableCell>
                                                <div className="font-mono font-bold text-primary">{jobOrder.jobOrderNo}</div>
                                                <div className="mt-1 text-[11px] text-muted-foreground">{jobOrder.yieldCount} daily yield{jobOrder.yieldCount === 1 ? "" : "s"}</div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="font-medium">{jobOrder.productName}</div>
                                                {jobOrder.productCode && <div className="text-[11px] text-muted-foreground font-mono">{jobOrder.productCode}</div>}
                                            </TableCell>
                                            <TableCell className="min-w-[145px] text-sm">
                                                <div>{jobOrder.latestYieldAt ? formatPhtDate(jobOrder.latestYieldAt) : "-"}</div>
                                                {jobOrder.latestYieldAt && <div className="mt-1 text-[11px] text-muted-foreground">{formatPhtTimestamp(jobOrder.latestYieldAt).split(", ").slice(-1)[0]}</div>}
                                            </TableCell>
                                            <TableCell className="text-right font-mono">{quantity(jobOrder.targetQuantity)}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="font-mono font-semibold">{quantity(jobOrder.producedQuantity)}</div>
                                                <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                                                    {quantity(jobOrder.producedQuantity)} accepted
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={statusClass(jobOrder.status)}>{jobOrder.status}</Badge>
                                                {jobOrder.unresolvedYieldCount > 0 && (
                                                    <div className="mt-1 flex items-center gap-1 text-[11px] text-red-600 dark:text-red-300">
                                                        <AlertCircle className="h-3 w-3 shrink-0" />
                                                        {jobOrder.unresolvedYieldCount} record{jobOrder.unresolvedYieldCount === 1 ? "" : "s"} needs review
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button type="button" size="sm" variant="outline" onClick={() => jobOrderState.openDetails(jobOrder)} className="min-h-9 gap-2">
                                                    <Eye className="h-4 w-4" /> View Details
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <p className="font-medium text-muted-foreground" aria-live="polite">
                            Showing {((jobOrderState.page - 1) * jobOrderState.pageSize + 1).toLocaleString()}-{Math.min(jobOrderState.page * jobOrderState.pageSize, jobOrderState.filteredJobOrders.length).toLocaleString()} of {jobOrderState.filteredJobOrders.length.toLocaleString()} Job Orders
                        </p>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            <label className="flex min-h-9 items-center gap-2 font-medium text-muted-foreground">
                                <span>Rows per page</span>
                                <Select value={String(jobOrderState.pageSize)} onValueChange={(value) => jobOrderState.setPageSize(Number(value))}>
                                    <SelectTrigger className="h-9 w-[70px]" aria-label="Rows per page"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="8">8</SelectItem>
                                        <SelectItem value="16">16</SelectItem>
                                        <SelectItem value="32">32</SelectItem>
                                    </SelectContent>
                                </Select>
                            </label>
                            <Button type="button" variant="outline" size="icon" className="h-9 w-9" disabled={jobOrderState.page <= 1} onClick={() => jobOrderState.setPage(jobOrderState.page - 1)} aria-label="Previous page">
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="min-w-24 text-center text-xs font-semibold" aria-label={`Page ${jobOrderState.page} of ${jobOrderState.totalPages}`}>
                                Page {jobOrderState.page} of {jobOrderState.totalPages}
                            </span>
                            <Button type="button" variant="outline" size="icon" className="h-9 w-9" disabled={jobOrderState.page >= jobOrderState.totalPages} onClick={() => jobOrderState.setPage(jobOrderState.page + 1)} aria-label="Next page">
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                        </div>
                    </>
                )}
            </section>

            <Dialog open={Boolean(jobOrderState.selectedJobOrder)} onOpenChange={(open) => { if (!open) jobOrderState.closeDetails(); }}>
                <DialogContent className="w-[calc(100vw-1rem)] max-w-none sm:w-[calc(100vw-2rem)] sm:max-w-none max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col bg-background text-foreground">
                    <DialogHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-1">
                            <DialogTitle className="flex items-center gap-2 text-primary"><PackageCheck className="h-5 w-5 shrink-0" /> {details?.jobOrderNo || jobOrderState.selectedJobOrder?.jobOrderNo || "Job Order Details"}</DialogTitle>
                            <DialogDescription className="text-xs">Daily yield QA and Job Order closure details.</DialogDescription>
                        </div>
                        {details && canClose ? (
                            <Button
                                type="button"
                                size="sm"
                                variant={closeReady ? "default" : "outline"}
                                disabled={!closeReady || closeSubmitting || jobOrderState.detailsLoading}
                                onClick={() => setCloseConfirmOpen(true)}
                                title={closeReady ? "Close this Job Order after confirming the completed QA and reconciliation checks." : "Resolve the listed QA and reconciliation blockers before closing this Job Order."}
                                className="min-h-9 shrink-0 gap-2 self-start"
                            >
                                {closeSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                {closeSubmitting ? "Marking as Closed..." : "Mark as Closed"}
                            </Button>
                        ) : details && isClosed ? (
                            <Button type="button" size="sm" variant="outline" disabled className="min-h-9 shrink-0 gap-2 self-start">
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> JO Closed
                            </Button>
                        ) : null}
                    </DialogHeader>

                    {jobOrderState.detailsLoading ? (
                        <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading JO details...</div>
                    ) : jobOrderState.detailsError ? (
                        <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center" role="alert">
                            <AlertCircle className="h-7 w-7 text-destructive" />
                            <p className="max-w-lg text-sm text-destructive">{jobOrderState.detailsError}</p>
                            <Button type="button" variant="outline" onClick={() => jobOrderState.selectedJobOrder && jobOrderState.openDetails(jobOrderState.selectedJobOrder)}>Retry</Button>
                        </div>
                    ) : details ? (
                        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
                            <div className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/20 p-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
                                <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Product</div><div className="mt-1 font-semibold">{details.productName}</div></div>
                                <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">JO Status</div><Badge variant="outline" className={`mt-1 ${statusClass(details.status)}`}>{details.status}</Badge></div>
                                <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Target Qty</div><div className="mt-1 font-mono font-semibold">{quantity(details.targetQuantity)}</div></div>
                                <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Accepted Qty</div><div className="mt-1 font-mono font-semibold text-emerald-700 dark:text-emerald-300">{quantity(acceptedQuantity)}</div><div className="text-[10px] text-muted-foreground">From verified records only</div></div>
                                <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Produced Qty</div><div className="mt-1 font-mono font-semibold">{quantity(details.producedQuantity)}</div><div className="text-[10px] text-muted-foreground">Accepted + Rejected, verified</div></div>
                                <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Yield Records</div><div className="mt-1 font-semibold">{details.dailyYields.length}</div><div className="text-[10px] text-muted-foreground">{pendingYieldCount} pending · {discrepancyYieldCount} discrepancy</div></div>
                            </div>

                            {canClose && (
                                <div className={`rounded-xl border p-3 text-sm ${closeReady ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`} role="status">
                                    <div className="flex items-start gap-2">
                                        {closeReady ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
                                        <div className="min-w-0">
                                            <p className="font-semibold">{closeReady ? "Ready to mark as closed" : "Mark as Closed is blocked"}</p>
                                            {closeReady ? (
                                                <p className="mt-1 text-xs text-muted-foreground">All daily yields have completed Passed QA outcomes, QA dispositions are resolved, and raw-material WIP is balanced.</p>
                                            ) : (
                                                <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                                                    {details.closeReadiness.blockers.map((blocker, index) => <li key={`${blocker.code}-${index}`}>{blocker.message}</li>)}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <section className="rounded-xl border">
                                <div className="border-b p-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <h3 className="font-bold">JO Daily Yield Table</h3>
                                            <p className="mt-1 max-w-3xl text-xs text-muted-foreground">Each production session is listed once with its QA state and output traceability. A verified yield contributes its Accepted Qty and Rejected Qty to Produced Qty; Scrap Qty is always excluded, and pending or flagged records are not counted yet.</p>
                                        </div>
                                        <div className="flex shrink-0 flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                                            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-600" /> Pending</span>
                                            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-600" /> Verified</span>
                                            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-600" /> Discrepancy</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Daily Yield Details</TableHead>
                                                <TableHead>Created for that day</TableHead>
                                                <TableHead className="text-right">Accepted</TableHead>
                                                <TableHead className="text-right">Rejected Qty</TableHead>
                                                <TableHead className="text-right">Scrap</TableHead>
                                                <TableHead>Lot</TableHead>
                                                <TableHead>Batch</TableHead>
                                                <TableHead className="text-right">Total Qty</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="sticky right-0 z-20 min-w-[170px] bg-card text-right shadow-[-8px_0_12px_-12px_hsl(var(--foreground)/0.45)]">Action</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {details.dailyYields.length === 0 ? (
                                                <TableRow><TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">No daily yields recorded for this Job Order.</TableCell></TableRow>
                                            ) : details.dailyYields.map((record) => (
                                                <DailyYieldRow key={record.ledgerId} record={record} onAction={(yieldRecord) => auditState.openAudit(yieldRecord, details)} />
                                            ))}
                                            {details.dailyYields.length > 0 && (
                                                <TableRow className="font-semibold">
                                                    <TableCell colSpan={2}>Totals (all records)</TableCell>
                                                    <TableCell className="text-right font-mono text-emerald-700 dark:text-emerald-300">{quantity(details.dailyYields.reduce((sum, record) => sum + record.goodQuantity, 0))}</TableCell>
                                                    <TableCell className="text-right font-mono text-red-600 dark:text-red-300">{quantity(details.dailyYields.reduce((sum, record) => sum + record.rejectedQuantity, 0))}</TableCell>
                                                    <TableCell className="text-right font-mono text-muted-foreground">{quantity(details.dailyYields.reduce((sum, record) => sum + record.scrapQuantity, 0))}</TableCell>
                                                    <TableCell colSpan={2} />
                                                    <TableCell className="text-right font-mono">{quantity(details.dailyYields.reduce((sum, record) => sum + record.totalQuantity, 0))}</TableCell>
                                                    <TableCell colSpan={2} />
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </section>

                            <div className="flex items-start gap-2 rounded-lg bg-primary/5 p-3 text-xs text-muted-foreground">
                                <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                <p><span className="font-semibold text-foreground">Produced Qty only counts Verified records.</span> Pending and Discrepancy rows remain visible in the table and totals for traceability, but their units stay out of Accepted and Produced Qty until they are audited or resolved.</p>
                            </div>

                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>

            <AlertDialog open={closeConfirmOpen} onOpenChange={(open) => { if (!closeSubmitting) setCloseConfirmOpen(open); }}>
                <AlertDialogContent size="sm">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Mark Job Order as Closed?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will mark {details?.jobOrderNo || "this Job Order"} as Closed after the completed QA and raw-material reconciliation checks. This status change does not create inventory movements or repost finished goods.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={closeSubmitting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={!details || !closeReady || closeSubmitting}
                            onClick={(event) => {
                                event.preventDefault();
                                if (!details) return;
                                setCloseConfirmOpen(false);
                                void jobOrderState.handleCloseJobOrder(details.jobOrderId);
                            }}
                        >
                            {closeSubmitting ? "Marking as Closed..." : "Mark as Closed"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <DailyYieldAuditDialog controller={auditState} />
        </div>
    );
}
