"use client";

import * as React from "react";
import { Eye, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import type { ListMeta, PriceChangeBatchHeader } from "../types";
import {
    displayPcrStatus,
    pcrApproveButtonClass,
    pcrRejectButtonClass,
    pcrStatusBadgeClass,
} from "../utils/pcrStatusStyles";

function numberText(value: number | null | undefined) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "-";
    return Number(value).toLocaleString("en-PH");
}

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
    rows: PriceChangeBatchHeader[];
    loading: boolean;
    acting: boolean;
    meta?: ListMeta | null;
    page: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
    onOpen: (headerId: number) => void;
    onApprove: (headerId: number) => void;
    onReject: (headerId: number) => void;
};

export function PriceChangeBatchesTable({
    rows,
    loading,
    acting,
    meta,
    page,
    pageSize,
    onPageChange,
    onPageSizeChange,
    onOpen,
    onApprove,
    onReject,
}: Props) {
    const total = getTotal(meta);
    const totalPages = total > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 0;
    const canPrev = page > 1;
    const canNext = totalPages > 0 ? page < totalPages : rows.length >= pageSize;
    const startIndex = rows.length ? (page - 1) * pageSize + 1 : 0;
    const endIndex = rows.length ? startIndex + rows.length - 1 : 0;

    return (
        <div className="rounded-xl border bg-background">
            <Table>
                <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                    <TableRow>
                        <TableHead className="w-[120px]">Batch #</TableHead>
                        <TableHead className="w-[220px]">Supplier</TableHead>
                        <TableHead>Remarks</TableHead>
                        <TableHead className="w-[90px] text-right">Lines</TableHead>
                        <TableHead className="w-[120px]">Status</TableHead>
                        <TableHead className="w-[180px]">Requested At</TableHead>
                        <TableHead className="min-w-[280px] text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow>
                            <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                                Loading batches
                            </TableCell>
                        </TableRow>
                    ) : rows.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                No price change batches found.
                            </TableCell>
                        </TableRow>
                    ) : (
                        rows.map((row) => {
                            const isPending = row.status === "PENDING";
                            const displayStatus = displayPcrStatus(row.status, row.application_status, row.effective_at);
                            const headerId = Number(row.header_id || row.id);

                            return (
                                <TableRow key={headerId}>
                                    <TableCell className="font-medium">PCB-{headerId}</TableCell>
                                    <TableCell className="max-w-[220px] truncate">
                                        {row.supplier_name || (row.supplier_id ? `Supplier #${row.supplier_id}` : "-")}
                                    </TableCell>
                                    <TableCell className="max-w-[420px]">
                                        <div className="line-clamp-2">{row.remarks || "-"}</div>
                                        {row.reference_no ? (
                                            <div className="mt-0.5 text-xs text-muted-foreground">Ref: {row.reference_no}</div>
                                        ) : null}
                                    </TableCell>
                                    <TableCell className="text-right">{numberText(row.line_count ?? 0)}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={pcrStatusBadgeClass(displayStatus)}>
                                            {displayStatus}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{safeDate(row.requested_at)}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="inline-flex flex-nowrap items-center justify-end gap-2">
                                            <Button size="sm" variant="outline" onClick={() => onOpen(headerId)}>
                                                <Eye className="mr-2 size-4" />
                                                Review
                                            </Button>
                                            <Button size="sm" className={pcrApproveButtonClass} onClick={() => onApprove(headerId)} disabled={acting || !isPending}>
                                                Approve
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className={pcrRejectButtonClass}
                                                onClick={() => onReject(headerId)}
                                                disabled={acting || !isPending}
                                            >
                                                Reject
                                            </Button>
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
                            {" "}of <span className="font-medium text-foreground">{total}</span> batches
                        </>
                    ) : (
                        " batches"
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
                    <Button variant="outline" size="sm" disabled={!canNext} onClick={() => onPageChange(totalPages > 0 ? Math.min(page + 1, totalPages) : page + 1)}>
                        Next
                    </Button>
                </div>
            </div>
        </div>
    );
}
