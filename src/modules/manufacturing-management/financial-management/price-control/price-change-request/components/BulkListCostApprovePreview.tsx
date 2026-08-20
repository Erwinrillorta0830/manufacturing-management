"use client";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import type { ListCostSelectionSnapshot } from "../types";

type Props = {
    items: ListCostSelectionSnapshot[];
};

function money(value: number | null | undefined) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
    }).format(Number(value));
}

function changeLabel(current: number | null, proposed: number) {
    if (current === null || !Number.isFinite(current) || !Number.isFinite(proposed)) return "—";
    const delta = proposed - current;
    const prefix = delta > 0 ? "+" : "";
    return `${prefix}${money(delta)}`;
}

function changeClass(current: number | null, proposed: number) {
    if (current === null || !Number.isFinite(current) || !Number.isFinite(proposed)) {
        return "text-muted-foreground";
    }
    const delta = proposed - current;
    if (delta > 0) return "text-red-600 dark:text-red-400";
    if (delta < 0) return "text-emerald-600 dark:text-emerald-400";
    return "text-muted-foreground";
}

export function BulkListCostApprovePreview({ items }: Props) {
    if (items.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">No selected requests to preview.</p>
        );
    }

    return (
        <div className="space-y-2">
            <div className="max-h-60 overflow-y-auto rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[100px]">Request</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead className="w-[110px] text-right">Current</TableHead>
                            <TableHead className="w-[110px] text-right">Proposed</TableHead>
                            <TableHead className="w-[100px] text-right">Change</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.map((item) => (
                            <TableRow key={item.request_id}>
                                <TableCell className="font-medium">{item.record_label}</TableCell>
                                <TableCell className="max-w-[220px] truncate" title={item.product_label}>
                                    {item.product_label}
                                </TableCell>
                                <TableCell className="text-right">{money(item.current_cost)}</TableCell>
                                <TableCell className="text-right font-medium">{money(item.proposed_cost)}</TableCell>
                                <TableCell
                                    className={cn(
                                        "text-right font-medium",
                                        changeClass(item.current_cost, item.proposed_cost),
                                    )}
                                >
                                    {changeLabel(item.current_cost, item.proposed_cost)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            {items.length > 10 ? (
                <p className="text-xs text-muted-foreground">
                    Showing all {items.length} selected requests.
                </p>
            ) : null}
        </div>
    );
}
