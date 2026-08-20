"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

import type { BulkActionResult, PriceTypeSelectionSnapshot } from "../types";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    result: BulkActionResult | null;
    snapshots: PriceTypeSelectionSnapshot[];
};

function snapshotForId(snapshots: PriceTypeSelectionSnapshot[], requestId: number) {
    return snapshots.find((item) => item.request_id === requestId);
}

export function BulkPriceTypeActionResultDialog({ open, onOpenChange, result, snapshots }: Props) {
    const rows = React.useMemo(() => {
        if (!result) return [];

        const failureById = new Map(result.failures.map((failure) => [failure.request_id, failure.message]));
        const successSet = new Set(result.successIds);
        const attemptedIds = [...result.successIds, ...result.failedIds];

        return attemptedIds.map((requestId) => {
            const snapshot = snapshotForId(snapshots, requestId);
            const succeeded = successSet.has(requestId);

            return {
                requestId,
                recordLabel: snapshot?.record_label ?? `PCR-${requestId}`,
                productLabel: snapshot?.product_label ?? `PCR-${requestId}`,
                batchLabel: snapshot?.batch_label ?? "—",
                succeeded,
                statusLabel:
                    result.action === "approve"
                        ? succeeded
                            ? "Approved"
                            : "Failed"
                        : succeeded
                          ? "Rejected"
                          : "Failed",
                message: failureById.get(requestId),
            };
        });
    }, [result, snapshots]);

    if (!result) {
        return null;
    }

    const title =
        result.action === "approve" ? "Bulk Approval Results" : "Bulk Rejection Results";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>

                <p className="text-sm text-muted-foreground">
                    {result.successIds.length} succeeded · {result.failedIds.length} failed
                </p>

                <div className="max-h-72 overflow-y-auto rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[100px]">Request</TableHead>
                                <TableHead>Product</TableHead>
                                <TableHead className="w-[90px]">Batch</TableHead>
                                <TableHead className="w-[110px]">Status</TableHead>
                                <TableHead>Details</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row) => (
                                <TableRow key={row.requestId}>
                                    <TableCell className="font-medium">{row.recordLabel}</TableCell>
                                    <TableCell className="max-w-[180px] truncate" title={row.productLabel}>
                                        {row.productLabel}
                                    </TableCell>
                                    <TableCell>{row.batchLabel}</TableCell>
                                    <TableCell>
                                        <Badge
                                            variant="outline"
                                            className={
                                                row.succeeded
                                                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                                                    : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
                                            }
                                        >
                                            {row.statusLabel}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {row.message ?? "—"}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                <DialogFooter>
                    <Button onClick={() => onOpenChange(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
