"use client";

import * as React from "react";
import { Eye, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import type { ListMeta, UnifiedApprovalRow } from "../types";
import {
    displayPcrStatus,
    pcrApproveButtonClass,
    pcrRejectButtonClass,
    pcrStatusBadgeClass,
} from "../utils/pcrStatusStyles";

function safeDate(value: string | null | undefined) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}

function getTotal(meta?: ListMeta | null) {
    const n = Number(meta?.total_count ?? 0);
    return Number.isFinite(n) ? n : 0;
}

type Props = {
    rows: UnifiedApprovalRow[];
    loading: boolean;
    acting: boolean;
    meta?: ListMeta | null;
    page: number;
    pageSize: number;
    selectedCostIds: number[];
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
    onOpenBatch: (headerId: number) => void;
    onApproveBatch: (headerId: number) => void;
    onRejectBatch: (headerId: number) => void;
    onOpenCost?: (requestId: number) => void;
    onApproveCost: (requestId: number) => void;
    onRejectCost: (requestId: number) => void;
    onToggleCostSelect?: (requestId: number, checked: boolean, row?: UnifiedApprovalRow) => void;
    onToggleSelectAllPendingCost?: (checked: boolean) => void;
    showCostSelection?: boolean;
};

export function UnifiedApprovalsTable({
    rows,
    loading,
    acting,
    meta,
    page,
    pageSize,
    selectedCostIds,
    onPageChange,
    onPageSizeChange,
    onOpenBatch,
    onApproveBatch,
    onRejectBatch,
    onOpenCost,
    onApproveCost,
    onRejectCost,
    onToggleCostSelect,
    onToggleSelectAllPendingCost,
    showCostSelection = false,
}: Props) {
    const total = getTotal(meta);
    const totalPages = total > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 0;
    const canPrev = page > 1;
    const canNext = totalPages > 0 ? page < totalPages : rows.length >= pageSize;
    const startIndex = rows.length ? (page - 1) * pageSize + 1 : 0;
    const endIndex = rows.length ? startIndex + rows.length - 1 : 0;

    const pendingCostIdsOnPage = React.useMemo(
        () =>
            rows.flatMap((row) => {
                if (row.kind !== "list_price" || row.status !== "PENDING" || !row.request_id) return [];
                return [Number(row.request_id)];
            }),
        [rows],
    );

    const selectedOnPageCount = pendingCostIdsOnPage.filter((id) => selectedCostIds.includes(id)).length;
    const allPendingCostSelected =
        pendingCostIdsOnPage.length > 0 && selectedOnPageCount === pendingCostIdsOnPage.length;
    const somePendingCostSelected =
        selectedOnPageCount > 0 && selectedOnPageCount < pendingCostIdsOnPage.length;

    return (
        <div className="rounded-xl border bg-background">
            <Table>
                <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                    <TableRow>
                        {showCostSelection ? (
                            <TableHead className="w-[44px]">
                                <div className="flex items-center justify-center p-1">
                                    <Checkbox
                                        className="h-[18px] w-[18px]"
                                        checked={allPendingCostSelected ? true : somePendingCostSelected ? "indeterminate" : false}
                                        onCheckedChange={(checked) =>
                                            onToggleSelectAllPendingCost?.(checked === true)
                                        }
                                        aria-label="Select all pending list cost requests on this page"
                                        disabled={acting || pendingCostIdsOnPage.length === 0}
                                    />
                                </div>
                            </TableHead>
                        ) : null}
                        <TableHead className="w-[120px]">Kind</TableHead>
                        <TableHead className="w-[120px]">Record</TableHead>
                        <TableHead>Summary</TableHead>
                        <TableHead className="w-[120px]">Status</TableHead>
                        <TableHead className="w-[180px]">Requested At</TableHead>
                        <TableHead className="min-w-[280px] text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow>
                            <TableCell colSpan={showCostSelection ? 7 : 6} className="h-32 text-center text-muted-foreground">
                                <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                                Loading approvals
                            </TableCell>
                        </TableRow>
                    ) : rows.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={showCostSelection ? 7 : 6} className="h-32 text-center text-muted-foreground">
                                No approval records found.
                            </TableCell>
                        </TableRow>
                    ) : (
                        rows.map((row) => {
                            const isPending = row.status === "PENDING";
                            const displayStatus = displayPcrStatus(row.status, row.application_status, row.effective_at);
                            const isBatch = row.kind === "price_batch";
                            const requestId = row.kind === "list_price" && row.request_id ? Number(row.request_id) : null;
                            const batchId = row.kind === "price_batch" && row.batch_id ? Number(row.batch_id) : null;
                            const isCostSelected = requestId ? selectedCostIds.includes(requestId) : false;

                            return (
                                <TableRow key={row.row_key}>
                                    {showCostSelection ? (
                                        <TableCell>
                                            {row.kind === "list_price" && requestId ? (
                                                <div className="flex items-center justify-center p-1">
                                                    <Checkbox
                                                        className="h-[18px] w-[18px]"
                                                        checked={isCostSelected}
                                                        onCheckedChange={(checked) =>
                                                            onToggleCostSelect?.(requestId, checked === true, row)
                                                        }
                                                        aria-label={`Select ${row.record_label}`}
                                                        disabled={acting || !isPending}
                                                    />
                                                </div>
                                            ) : null}
                                        </TableCell>
                                    ) : null}
                                    <TableCell>
                                        <Badge variant={isBatch ? "default" : "secondary"}>
                                            {isBatch ? "Price Batch" : "List Cost"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="font-medium">{row.record_label}</TableCell>
                                    <TableCell className="max-w-[420px]">
                                        <div className="font-medium">{row.title}</div>
                                        {row.subtitle ? (
                                            <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                                {row.subtitle}
                                            </div>
                                        ) : null}
                                        {row.kind === "price_batch" && row.line_count != null ? (
                                            <div className="mt-0.5 text-xs text-muted-foreground">
                                                {row.line_count} line(s)
                                            </div>
                                        ) : null}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={pcrStatusBadgeClass(displayStatus)}>
                                            {displayStatus}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{safeDate(row.requested_at)}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="inline-flex flex-nowrap items-center justify-end gap-2">
                                            {isBatch && batchId ? (
                                                <>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => onOpenBatch(batchId)}
                                                    >
                                                        <Eye className="mr-2 size-4" />
                                                        Review
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        className={pcrApproveButtonClass}
                                                        onClick={() => onApproveBatch(batchId)}
                                                        disabled={acting || !isPending}
                                                    >
                                                        Approve
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className={pcrRejectButtonClass}
                                                        onClick={() => onRejectBatch(batchId)}
                                                        disabled={acting || !isPending}
                                                    >
                                                        Reject
                                                    </Button>
                                                </>
                                            ) : requestId ? (
                                                <>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => onOpenCost?.(requestId)}
                                                    >
                                                        <Eye className="mr-2 size-4" />
                                                        Review
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        className={pcrApproveButtonClass}
                                                        onClick={() => onApproveCost(requestId)}
                                                        disabled={acting || !isPending}
                                                    >
                                                        Approve
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className={pcrRejectButtonClass}
                                                        onClick={() => onRejectCost(requestId)}
                                                        disabled={acting || !isPending}
                                                    >
                                                        Reject
                                                    </Button>
                                                </>
                                            ) : null}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })
                    )}
                </TableBody>
            </Table>

            <div className="flex flex-col gap-3 border-t px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                    Showing <span className="font-medium text-foreground">{startIndex}</span> -{" "}
                    <span className="font-medium text-foreground">{endIndex}</span>
                    {total > 0 ? (
                        <>
                            {" "}of <span className="font-medium text-foreground">{total}</span> records
                        </>
                    ) : (
                        " records"
                    )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                    <select
                        className={cn("h-9 rounded-md border bg-background px-2 text-sm")}
                        value={String(pageSize)}
                        onChange={(event) => {
                            onPageSizeChange(Number(event.target.value));
                            onPageChange(1);
                        }}
                    >
                        {[25, 50, 100].map((size) => (
                            <option key={size} value={String(size)}>
                                {size} / page
                            </option>
                        ))}
                    </select>
                    <Button variant="outline" size="sm" disabled={!canPrev} onClick={() => onPageChange(page - 1)}>
                        Prev
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!canNext}
                        onClick={() => onPageChange(totalPages > 0 ? Math.min(page + 1, totalPages) : page + 1)}
                    >
                        Next
                    </Button>
                </div>
            </div>
        </div>
    );
}
