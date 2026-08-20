"use client";

import * as React from "react";
import type { ApprovalRecordRow, ListMeta, PriceChangeRequestRow, CostChangeRequestRow, UnifiedApprovalRow } from "../types";
import { productLabel, priceTypeLabel, uomLabel } from "../utils/labels";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
    approvalTypeBadgeClass,
    approvalTypeLabel,
    displayPcrStatus,
    pcrStatusBadgeClass,
} from "../utils/pcrStatusStyles";
import { COST_MAX_DECIMAL_PLACES, PRICE_MAX_DECIMAL_PLACES } from "../../shared/pricePrecision";

function fmt(v: number | string | null | undefined, maximumFractionDigits = PRICE_MAX_DECIMAL_PLACES) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2,
        maximumFractionDigits,
    }).format(n);
}

function fmtPrice(v: number | string | null | undefined) {
    return fmt(v, PRICE_MAX_DECIMAL_PLACES);
}

function fmtCost(v: number | string | null | undefined) {
    return fmt(v, COST_MAX_DECIMAL_PLACES);
}

function requestedAtParts(value: string | null | undefined) {
    if (!value) return { date: "—", time: "" };
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { date: "—", time: "" };

    return {
        date: date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }),
        time: date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }),
    };
}

function safeInt(v: number | string | null | undefined, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function getTotal(meta?: ListMeta | null) {
    return safeInt(meta?.total_count, 0);
}

function getTotalPages(meta: ListMeta | null | undefined, pageSize: number, currentRowsLength: number) {
    const total = getTotal(meta);
    if (total > 0) {
        return Math.max(1, Math.ceil(total / pageSize));
    }
    if (currentRowsLength >= pageSize) {
        return 0;
    }
    return 0;
}

function approvalKind(row: ApprovalRecordRow): "price_batch" | "cost_batch" | "mixed_batch" | "price_type" | "list_price" {
    if ("kind" in row) return row.kind;
    return "proposed_cost" in row ? "list_price" : "price_type";
}

function requestedByText(row: ApprovalRecordRow) {
    const displayName = "requested_by_name" in row ? String(row.requested_by_name ?? "").trim() : "";
    if (displayName && displayName !== "null" && displayName !== "undefined") return displayName;

    const value = "requested_by" in row ? row.requested_by : null;
    const text = String(value ?? "").trim();
    if (!text || text === "null" || text === "undefined") return "-";
    return /^\d+$/.test(text) ? `User #${text}` : text;
}

function supplierText(row: ApprovalRecordRow): string {
    if ("supplier_names" in row && Array.isArray(row.supplier_names)) {
        const names = row.supplier_names.map((name) => String(name ?? "").trim()).filter(Boolean);
        if (names.length > 0) {
            return names.join(", ");
        }
    }

    const name = "supplier_name" in row ? String(row.supplier_name ?? "").trim() : "";
    return name || "-";
}

function approvalRecordLabel(row: ApprovalRecordRow) {
    const kind = approvalKind(row);
    if ("record_label" in row && row.record_label) return row.record_label;
    if (kind === "price_batch" || kind === "cost_batch" || kind === "mixed_batch") {
        const batch = row as Extract<UnifiedApprovalRow, { kind: "price_batch" | "cost_batch" | "mixed_batch" }>;
        if (kind === "mixed_batch") return `PCB-${Number(batch.batch_id ?? batch.request_id)}`;
        return kind === "cost_batch"
            ? `CCR-${Number(batch.batch_id ?? batch.request_id)}`
            : `PCB-${Number(batch.batch_id ?? batch.request_id)}`;
    }
    if (kind === "list_price") return `CCR-${Number(row.request_id)}`;
    return `PCR-${Number(row.request_id)}`;
}

function totalProductsText(row: ApprovalRecordRow) {
    const kind = approvalKind(row);
    if (kind === "price_batch" || kind === "cost_batch" || kind === "mixed_batch") {
        const batch = row as Extract<UnifiedApprovalRow, { kind: "price_batch" | "cost_batch" | "mixed_batch" }>;
        const totalProducts = Number(batch.total_products ?? 0);
        if (Number.isFinite(totalProducts) && totalProducts > 0) return totalProducts.toLocaleString("en-PH");
        const lineCount = Number(batch.line_count ?? 0);
        return Number.isFinite(lineCount) && lineCount > 0 ? lineCount.toLocaleString("en-PH") : "-";
    }
    return "1";
}

function mixedProposedValues(row: ApprovalRecordRow) {
    const batch = row as Extract<UnifiedApprovalRow, { kind: "mixed_batch" }>;
    const priceMin = batch.price_summary?.proposed_min ?? batch.price_proposed_min;
    const priceMax = batch.price_summary?.proposed_max ?? batch.price_proposed_max;
    const costMin = batch.cost_summary?.proposed_min ?? batch.cost_proposed_min;
    const costMax = batch.cost_summary?.proposed_max ?? batch.cost_proposed_max;
    const priceMinNumber = priceMin == null ? null : Number(priceMin);
    const priceMaxNumber = priceMax == null ? null : Number(priceMax);
    const costMinNumber = costMin == null ? null : Number(costMin);
    const costMaxNumber = costMax == null ? null : Number(costMax);

    return {
        price: Number.isFinite(priceMinNumber) && Number.isFinite(priceMaxNumber)
            ? priceMinNumber === priceMaxNumber ? fmtPrice(priceMinNumber) : `${fmtPrice(priceMinNumber)} - ${fmtPrice(priceMaxNumber)}`
            : null,
        cost: Number.isFinite(costMinNumber) && Number.isFinite(costMaxNumber)
            ? costMinNumber === costMaxNumber ? fmtCost(costMinNumber) : `${fmtCost(costMinNumber)} - ${fmtCost(costMaxNumber)}`
            : null,
    };
}

function proposedText(row: ApprovalRecordRow) {
    const kind = approvalKind(row);
    if (kind === "mixed_batch") {
        const { price, cost } = mixedProposedValues(row);
        return [price ? `Price: ${price}` : null, cost ? `Cost: ${cost}` : null].filter(Boolean).join(" | ") || "-";
    }
    if (kind === "price_batch") {
        const batch = row as Extract<UnifiedApprovalRow, { kind: "price_batch" }>;
        const min = Number(batch.proposed_min);
        const max = Number(batch.proposed_max);
        const hasMin = Number.isFinite(min);
        const hasMax = Number.isFinite(max);
        if (hasMin && hasMax) return min === max ? fmtPrice(min) : `${fmtPrice(min)} - ${fmtPrice(max)}`;
        return fmtPrice(batch.proposed_price);
    }
    if (kind === "cost_batch") {
        const batch = row as Extract<UnifiedApprovalRow, { kind: "cost_batch" }>;
        const min = Number(batch.proposed_min);
        const max = Number(batch.proposed_max);
        const hasMin = Number.isFinite(min);
        const hasMax = Number.isFinite(max);
        if (hasMin && hasMax) return min === max ? fmtCost(min) : `${fmtCost(min)} - ${fmtCost(max)}`;
        return fmtCost(batch.proposed_cost);
    }
    if (kind === "list_price") return fmtCost((row as CostChangeRequestRow).proposed_cost);
    return fmtPrice((row as PriceChangeRequestRow).proposed_price);
}

type LoadingTableBodyProps = {
    rowCount: number;
    showSelectionColumn: boolean;
    showTypeColumn: boolean;
    showActionsColumn: boolean;
};

function LoadingTableBody({
    rowCount,
    showSelectionColumn,
    showTypeColumn,
    showActionsColumn,
}: LoadingTableBodyProps) {
    return (
        <>
            {Array.from({ length: rowCount }).map((_, index) => (
                <TableRow key={`loading-row-${index}`} className="hover:bg-transparent">
                    {showSelectionColumn ? (
                        <TableCell className="px-2">
                            <div className="flex items-center justify-center">
                                <Skeleton className="h-[18px] w-[18px] rounded-sm" />
                            </div>
                        </TableCell>
                    ) : null}
                    <TableCell className="px-2">
                        <Skeleton className="h-4 w-14" />
                    </TableCell>
                    <TableCell className="px-2">
                        <Skeleton className="h-4 w-full max-w-[180px]" />
                    </TableCell>
                    <TableCell className="px-2">
                        <Skeleton className="h-5 w-10 rounded-md" />
                    </TableCell>
                    {showTypeColumn ? (
                        <TableCell className="px-2">
                            <Skeleton className="h-4 w-12" />
                        </TableCell>
                    ) : null}
                    <TableCell className="px-2">
                        <div className="flex flex-col items-end gap-1">
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-3 w-20" />
                        </div>
                    </TableCell>
                    <TableCell className="px-2">
                        <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                    <TableCell className="px-2">
                        <Skeleton className="mb-1 h-3 w-16" />
                        <Skeleton className="h-3 w-12" />
                    </TableCell>
                    {showActionsColumn ? (
                        <TableCell className="px-2 text-right">
                            <div className="inline-flex justify-end gap-1">
                                <Skeleton className="h-7 w-14 rounded-md" />
                                <Skeleton className="h-7 w-16 rounded-md" />
                                <Skeleton className="h-7 w-14 rounded-md" />
                            </div>
                        </TableCell>
                    ) : null}
                </TableRow>
            ))}
        </>
    );
}

type Props = {
    rows: ApprovalRecordRow[];
    mode: "approver" | "mine" | "all";
    requestType?: "price" | "cost" | "mixed";
    loading?: boolean;
    hasLoadError?: boolean;
    acting?: boolean;
    onApprove?: (row: ApprovalRecordRow) => void;
    onReject?: (row: ApprovalRecordRow) => void;
    onReview?: (row: ApprovalRecordRow) => void;
    onCancel?: (row: ApprovalRecordRow) => void;
    canSelectRow?: (row: ApprovalRecordRow) => boolean;
    canReviewRow?: (row: ApprovalRecordRow) => boolean;
    canApproveRow?: (row: ApprovalRecordRow) => boolean;
    canRejectRow?: (row: ApprovalRecordRow) => boolean;

    meta?: ListMeta | null;
    page: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange?: (pageSize: number) => void;

    footerItemLabel?: string;

    selectedIds?: number[];
    selectedKeys?: string[];
    getSelectionKey?: (row: ApprovalRecordRow) => string;
    onToggleSelect?: (
        key: string,
        checked: boolean,
        row?: ApprovalRecordRow,
    ) => void;
    onToggleSelectAllPage?: (checked: boolean) => void;

    showSelectionColumn?: boolean;
    showActionsColumn?: boolean;
};

export default function RequestsTable(props: Props) {
    const mode = props.mode;
    const canSelectRow = props.canSelectRow;
    const getSelectionKey = props.getSelectionKey;
    const requestType = props.requestType ?? "price";
    const rows = React.useMemo<ApprovalRecordRow[]>(
        () => props.rows ?? [],
        [props.rows],
    );
    const page = Math.max(1, safeInt(props.page, 1));
    const pageSize = Math.max(1, safeInt(props.pageSize, 50));

    const total = getTotal(props.meta);
    const totalPages = getTotalPages(props.meta, pageSize, rows.length);

    const canPrev = page > 1;
    const inferredHasNext = rows.length >= pageSize;
    const canNext = totalPages > 0 ? page < totalPages : inferredHasNext;

    const startIndex = rows.length ? (page - 1) * pageSize + 1 : 0;
    const endIndex = rows.length ? startIndex + rows.length - 1 : 0;

    const itemLabel = (props.footerItemLabel ?? "requests").trim() || "requests";

    const resolveSelectionKey = React.useCallback(
        (row: ApprovalRecordRow) =>
            getSelectionKey?.(row) ?? ("row_key" in row ? row.row_key : String(Number(row.request_id))),
        [getSelectionKey],
    );

    const selectedKeySet = React.useMemo(() => {
        if (props.selectedKeys) return new Set(props.selectedKeys);
        return new Set((props.selectedIds ?? []).map((id) => String(id)));
    }, [props.selectedIds, props.selectedKeys]);

    const showSelectionColumn = props.showSelectionColumn ?? mode === "approver";
    const showActionsColumn =
        props.showActionsColumn ?? Boolean(props.onReview || props.onApprove || props.onReject);

    const selectableRows = React.useMemo(
        () =>
            showSelectionColumn
                ? rows.filter((r) => r.status === "PENDING" && (canSelectRow?.(r) ?? true))
                : [],
        [canSelectRow, showSelectionColumn, rows],
    );

    const selectableKeys = React.useMemo(
        () => selectableRows.map((r) => resolveSelectionKey(r)),
        [resolveSelectionKey, selectableRows],
    );

    const canToggleSelect = Boolean(props.onToggleSelect);
    const canToggleSelectAllPage = Boolean(props.onToggleSelectAllPage);
    const selectedOnPageCount = selectableKeys.filter((key) => selectedKeySet.has(key)).length;
    const allPageSelected = selectableKeys.length > 0 && selectedOnPageCount === selectableKeys.length;
    const somePageSelected = selectedOnPageCount > 0 && selectedOnPageCount < selectableKeys.length;

    const showTypeColumn = requestType !== "cost";
    const loading = Boolean(props.loading);
    const hasLoadError = Boolean(props.hasLoadError);
    const skeletonRowCount = Math.min(pageSize, 8);
    const showApprovalSummaryColumns = requestType !== "cost";
    let colSpan = 6;
    if (showTypeColumn) colSpan += 1;
    if (showSelectionColumn) colSpan += 1;
    if (showActionsColumn) colSpan += 1;

    if (showApprovalSummaryColumns) {
        const summaryColSpan = 8 + (showSelectionColumn ? 1 : 0) + (showActionsColumn ? 1 : 0);

        return (
            <div className="overflow-hidden rounded-xl border bg-background">
                <Table className="w-full table-fixed">
                    <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                        <TableRow>
                            {showSelectionColumn ? (
                                <TableHead className="w-10 px-2">
                                    <Checkbox
                                        checked={allPageSelected ? true : somePageSelected ? "indeterminate" : false}
                                        onCheckedChange={(checked) => props.onToggleSelectAllPage?.(checked === true)}
                                        aria-label="Select all pending records on this page"
                                        disabled={selectableKeys.length === 0 || props.acting || !canToggleSelectAllPage}
                                    />
                                </TableHead>
                            ) : null}
                            <TableHead className="w-[110px] px-2">Request #</TableHead>
                            <TableHead className="w-[160px] min-w-[160px] px-2">Type</TableHead>
                            <TableHead className="w-[140px] px-2">Supplier</TableHead>
                            <TableHead className="w-[140px] px-2">Requested By</TableHead>
                            <TableHead className="w-[120px] px-2 text-right">Total Products</TableHead>
                            <TableHead className="w-[180px] px-2 text-right">Proposed</TableHead>
                            <TableHead className="w-[102px] px-2">Status</TableHead>
                            <TableHead className="w-[130px] px-2">Requested</TableHead>
                            {showActionsColumn ? (
                                <TableHead className="sticky right-0 z-20 w-[96px] min-w-[96px] border-l bg-background px-2 text-right shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.12)] sm:w-[188px] sm:min-w-[188px]">
                                    Actions
                                </TableHead>
                            ) : null}
                        </TableRow>
                    </TableHeader>

                    <TableBody>
                        {rows.map((r) => {
                            const selectionKey = resolveSelectionKey(r);
                            const isPending = r.status === "PENDING";
                            const displayStatus = displayPcrStatus(r.status, r.application_status, r.effective_at);
                            const isSelected = selectedKeySet.has(selectionKey);
                            const canSelect = props.canSelectRow?.(r) ?? true;
                            const canReview = props.canReviewRow?.(r) ?? true;
                            const requestedAt = requestedAtParts(r.requested_at);

                            return (
                                <TableRow key={selectionKey}>
                                    {showSelectionColumn ? (
                                        <TableCell className="px-2">
                                            <div className="flex items-center justify-center">
                                                <Checkbox
                                                    className="h-[18px] w-[18px]"
                                                    checked={isSelected}
                                                    onCheckedChange={(checked) =>
                                                        props.onToggleSelect?.(selectionKey, checked === true, r)
                                                    }
                                                    aria-label={`Select ${approvalRecordLabel(r)}`}
                                                    disabled={props.acting || !isPending || !canToggleSelect || !canSelect}
                                                />
                                            </div>
                                        </TableCell>
                                    ) : null}

                                    <TableCell className="truncate px-2 font-medium" title={approvalRecordLabel(r)}>
                                        {approvalRecordLabel(r)}
                                    </TableCell>
                                    <TableCell className="min-w-0 px-2">
                                        <Badge
                                            variant="outline"
                                            className={`${approvalTypeBadgeClass(approvalKind(r))} max-w-full whitespace-normal break-words px-2 text-center text-[11px] leading-tight uppercase`}
                                        >
                                            <span className="min-w-0 max-w-full break-words text-center">
                                                {approvalTypeLabel(approvalKind(r))}
                                            </span>
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="min-w-0 whitespace-normal break-words px-2 align-top" title={supplierText(r)}>
                                        {supplierText(r)}
                                    </TableCell>
                                    <TableCell className="min-w-0 whitespace-normal break-words px-2 align-top" title={requestedByText(r)}>
                                        {requestedByText(r)}
                                    </TableCell>
                                    <TableCell className="px-2 text-right">{totalProductsText(r)}</TableCell>
                                    <TableCell className="min-w-0 px-2 text-right align-top font-semibold">
                                        {approvalKind(r) === "mixed_batch" ? (
                                            <div className="min-w-0 space-y-0.5 text-xs leading-tight" title={proposedText(r)}>
                                                {(() => {
                                                    const { price, cost } = mixedProposedValues(r);
                                                    return (
                                                        <>
                                                            {price ? (
                                                                <div className="flex min-w-0 items-start justify-end gap-1">
                                                                    <span className="shrink-0 text-muted-foreground">Price:</span>
                                                                    <span className="min-w-0 break-words tabular-nums">{price}</span>
                                                                </div>
                                                            ) : null}
                                                            {cost ? (
                                                                <div className="flex min-w-0 items-start justify-end gap-1">
                                                                    <span className="shrink-0 text-muted-foreground">Cost:</span>
                                                                    <span className="min-w-0 break-words tabular-nums">{cost}</span>
                                                                </div>
                                                            ) : null}
                                                            {!price && !cost ? "-" : null}
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        ) : (
                                            <span className="block min-w-0 break-words tabular-nums" title={proposedText(r)}>
                                                {proposedText(r)}
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="min-w-0 px-2 align-top">
                                        <Badge variant="outline" className={`${pcrStatusBadgeClass(displayStatus)} inline-flex max-w-full truncate px-2 text-[11px]`}>
                                            {displayStatus}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="px-2">
                                        <div className="min-w-0 text-xs leading-tight">
                                            <div className="truncate">{requestedAt.date}</div>
                                            {requestedAt.time ? (
                                                <div className="truncate text-muted-foreground">{requestedAt.time}</div>
                                            ) : null}
                                        </div>
                                    </TableCell>

                                    {showActionsColumn ? (
                                        <TableCell className="sticky right-0 z-10 min-w-[96px] whitespace-nowrap border-l bg-background px-2 text-right shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.12)] sm:min-w-[188px]">
                                            <div className="inline-flex flex-nowrap items-center justify-end gap-1">
                                                {props.onReview && canReview ? (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 px-2 text-[11px]"
                                                        onClick={() => props.onReview?.(r)}
                                                        disabled={props.acting}
                                                        aria-label="Review record"
                                                    >
                                                        Review
                                                    </Button>
                                                ) : null}
                                            </div>
                                        </TableCell>
                                    ) : null}
                                </TableRow>
                            );
                        })}

                        {rows.length === 0 && loading ? (
                            <TableRow>
                                <TableCell colSpan={summaryColSpan} className="h-32 text-center text-muted-foreground">
                                    <Skeleton className="mx-auto mb-2 h-5 w-40" />
                                    <Skeleton className="mx-auto h-4 w-64" />
                                </TableCell>
                            </TableRow>
                        ) : rows.length === 0 && !hasLoadError ? (
                            <TableRow>
                                <TableCell colSpan={summaryColSpan} className="py-10 text-center text-muted-foreground">
                                    No records found.
                                </TableCell>
                            </TableRow>
                        ) : null}
                    </TableBody>
                </Table>

                <div className="flex flex-col gap-3 border-t px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-muted-foreground">
                        {total > 0 ? (
                            <>
                                Showing <span className="font-medium text-foreground">{startIndex}</span> -{" "}
                                <span className="font-medium text-foreground">{endIndex}</span> of{" "}
                                <span className="font-medium text-foreground">{total}</span> {itemLabel}
                            </>
                        ) : (
                            <>
                                Showing <span className="font-medium text-foreground">{startIndex}</span> -{" "}
                                <span className="font-medium text-foreground">{endIndex}</span> {itemLabel}
                            </>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                        {props.onPageSizeChange ? (
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">Rows</span>
                                <select
                                    className="h-9 rounded-md border bg-background px-2 text-sm"
                                    value={String(pageSize)}
                                    onChange={(e) => {
                                        const nextSize = clamp(safeInt(e.target.value, pageSize), 1, 500);
                                        props.onPageSizeChange?.(nextSize);
                                        props.onPageChange(1);
                                    }}
                                >
                                    {[25, 50, 100, 200].map((n) => (
                                        <option key={n} value={String(n)}>
                                            {n} / page
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : null}

                        <Button variant="outline" size="sm" disabled={loading || !canPrev} onClick={() => props.onPageChange(page - 1)}>
                            Prev
                        </Button>

                        <Button
                            variant="outline"
                            size="sm"
                            disabled={loading || !canNext}
                            onClick={() => props.onPageChange(totalPages > 0 ? Math.min(page + 1, totalPages) : page + 1)}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    const detailRows = rows as (PriceChangeRequestRow | CostChangeRequestRow)[];

    return (
        <div className="overflow-hidden rounded-xl border bg-background">
            <Table className="w-full table-fixed">
                <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                    <TableRow>
                        {showSelectionColumn ? (
                            <TableHead className="w-10 px-2">
                                <Checkbox
                                    checked={allPageSelected ? true : somePageSelected ? "indeterminate" : false}
                                    onCheckedChange={(checked) => props.onToggleSelectAllPage?.(checked === true)}
                                    aria-label="Select all pending requests on this page"
                                    disabled={selectableKeys.length === 0 || props.acting || !canToggleSelectAllPage}
                                />
                            </TableHead>
                        ) : null}
                        <TableHead className="w-[88px] px-2">Request #</TableHead>
                        <TableHead className="px-2">Product</TableHead>
                        <TableHead className="w-[72px] px-2">UOM</TableHead>
                        {showTypeColumn && <TableHead className="w-[78px] px-2">Type</TableHead>}
                        <TableHead className="w-[112px] px-2 text-right">Proposed</TableHead>
                        <TableHead className="w-[102px] px-2">Status</TableHead>
                        <TableHead className="w-[108px] px-2">Requested</TableHead>
                        {showActionsColumn ? (
                            <TableHead className="sticky right-0 z-20 w-[96px] min-w-[96px] border-l bg-background px-2 text-right shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.12)] sm:w-[188px] sm:min-w-[188px]">
                                Actions
                            </TableHead>
                        ) : null}
                    </TableRow>
                </TableHeader>

                <TableBody>
                    {detailRows.map((r) => {
                        const id = Number(r.request_id);
                        const selectionKey = resolveSelectionKey(r);
                        const isPending = r.status === "PENDING";
                        const displayStatus = displayPcrStatus(r.status, r.application_status, r.effective_at);
                        const isSelected = selectedKeySet.has(selectionKey);
                        const rowType = requestType === "cost" ? "cost" : "price";
                        const canSelect = props.canSelectRow?.(r) ?? true;
                        const canReview = props.canReviewRow?.(r) ?? true;
                        const proposedValue = rowType === "cost"
                            ? (r as CostChangeRequestRow).proposed_cost
                            : (r as PriceChangeRequestRow).proposed_price;
                        const requestedAt = requestedAtParts(r.requested_at);

                        return (
                            <TableRow key={selectionKey}>
                                {showSelectionColumn ? (
                                <TableCell className="px-2">
                                    <div className="flex items-center justify-center">
                                        <Checkbox
                                            className="h-[18px] w-[18px]"
                                            checked={isSelected}
                                            onCheckedChange={(checked) =>
                                                props.onToggleSelect?.(selectionKey, checked === true, r)
                                            }
                                            aria-label={`Select request ${rowType === "cost" ? "CCR" : "PCR"}-${id}`}
                                            disabled={props.acting || !isPending || !canToggleSelect || !canSelect}
                                        />
                                    </div>
                                </TableCell>
                                ) : null}

                                <TableCell className="truncate px-2 font-medium" title={`${rowType === "cost" ? "CCR" : "PCR"}-${id}`}>
                                    {rowType === "cost" ? "CCR" : "PCR"}-{id}
                                </TableCell>
                                <TableCell className="min-w-0 truncate px-2" title={productLabel(r as PriceChangeRequestRow)}>
                                    {productLabel(r as PriceChangeRequestRow)}
                                </TableCell>
                                <TableCell className="px-2">
                                    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                        {uomLabel(r as PriceChangeRequestRow)}
                                    </span>
                                </TableCell>
                                {showTypeColumn && (
                                    <TableCell className="truncate px-2" title={rowType === "cost" ? "List Cost" : priceTypeLabel(r as PriceChangeRequestRow)}>
                                        <span className="block truncate">
                                            {rowType === "cost" ? "List Cost" : priceTypeLabel(r as PriceChangeRequestRow)}
                                        </span>
                                    </TableCell>
                                )}
                                <TableCell className="px-2 text-right">
                                    <div className="flex flex-col items-end gap-0.5">
                                        <div className="text-sm font-semibold">{fmt(proposedValue)}</div>
                                        {(() => {
                                            const currentCost = rowType === "cost"
                                                ? (r as CostChangeRequestRow).current_cost
                                                : typeof r.product_id === "object" ? r.product_id.cost_per_unit : null;
                                            
                                            const currentNum = Number(currentCost);
                                            const proposedNum = Number(proposedValue);
                                            
                                            if (currentNum > 0 && Number.isFinite(proposedNum)) {
                                                const diffPct = ((proposedNum - currentNum) / currentNum) * 100;
                                                return (
                                                    <div className="flex max-w-full items-center gap-1 text-xs">
                                                        <span className="text-muted-foreground line-through" title="Cost Price">{fmt(currentNum)}</span>
                                                        <span className={diffPct > 0 ? "text-green-600 dark:text-green-400 font-medium" : diffPct < 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground font-medium"}>
                                                            {diffPct > 0 ? "+" : ""}{diffPct.toFixed(2)}%
                                                        </span>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })()}
                                    </div>
                                    </TableCell>
                                    <TableCell className="px-2">
                                        <Badge variant="outline" className={`${pcrStatusBadgeClass(displayStatus)} max-w-full truncate px-2 text-[11px]`}>
                                            {displayStatus}
                                        </Badge>
                                    </TableCell>
                                <TableCell className="px-2">
                                    <div className="min-w-0 text-xs leading-tight">
                                        <div className="truncate">{requestedAt.date}</div>
                                        {requestedAt.time ? (
                                            <div className="truncate text-muted-foreground">{requestedAt.time}</div>
                                        ) : null}
                                    </div>
                                </TableCell>

                                {showActionsColumn ? (
                                    <TableCell className="sticky right-0 z-10 min-w-[96px] whitespace-nowrap border-l bg-background px-2 text-right shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.12)] sm:min-w-[188px]">
                                        <div className="inline-flex flex-nowrap items-center justify-end gap-1">
                                            {props.onReview && canReview ? (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 px-2 text-[11px]"
                                                    onClick={() => props.onReview?.(r)}
                                                    disabled={props.acting}
                                                    aria-label="Review request"
                                                >
                                                    Review
                                                </Button>
                                            ) : null}
                                        </div>
                                    </TableCell>
                                ) : null}
                            </TableRow>
                        );
                    })}

                    {rows.length === 0 && loading ? (
                        <LoadingTableBody
                            rowCount={skeletonRowCount}
                            showSelectionColumn={showSelectionColumn}
                            showTypeColumn={showTypeColumn}
                            showActionsColumn={showActionsColumn}
                        />
                    ) : rows.length === 0 && !hasLoadError ? (
                        <TableRow>
                            <TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">
                                No requests found.
                            </TableCell>
                        </TableRow>
                    ) : null}
                </TableBody>
            </Table>

            <div className="flex flex-col gap-3 border-t px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                    {total > 0 ? (
                        <>
                            Showing <span className="font-medium text-foreground">{startIndex}</span> –{" "}
                            <span className="font-medium text-foreground">{endIndex}</span> of{" "}
                            <span className="font-medium text-foreground">{total}</span> {itemLabel}
                        </>
                    ) : (
                        <>
                            Showing <span className="font-medium text-foreground">{startIndex}</span> –{" "}
                            <span className="font-medium text-foreground">{endIndex}</span> {itemLabel}
                        </>
                    )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                    {props.onPageSizeChange ? (
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Rows</span>
                            <select
                                className="h-9 rounded-md border bg-background px-2 text-sm"
                                value={String(pageSize)}
                                onChange={(e) => {
                                    const nextSize = clamp(safeInt(e.target.value, pageSize), 1, 500);
                                    props.onPageSizeChange?.(nextSize);
                                    props.onPageChange(1);
                                }}
                            >
                                {[25, 50, 100, 200].map((n) => (
                                    <option key={n} value={String(n)}>
                                        {n} / page
                                    </option>
                                ))}
                            </select>
                        </div>
                    ) : null}

                    <Button variant="outline" size="sm" disabled={loading || !canPrev} onClick={() => props.onPageChange(page - 1)}>
                        Prev
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        disabled={loading || !canNext}
                        onClick={() => props.onPageChange(totalPages > 0 ? Math.min(page + 1, totalPages) : page + 1)}
                    >
                        Next
                    </Button>
                </div>
            </div>
        </div>
    );
}
