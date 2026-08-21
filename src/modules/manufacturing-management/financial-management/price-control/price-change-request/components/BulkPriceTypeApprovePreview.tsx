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

import type { PriceTypeSelectionSnapshot } from "../types";

type Props = {
    items: PriceTypeSelectionSnapshot[];
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

export function BulkPriceTypeApprovePreview({ items }: Props) {
    if (items.length === 0) {
        return <p className="text-sm text-muted-foreground">No selected requests to preview.</p>;
    }

    return (
        <div className="space-y-2">
            <div className="max-h-60 overflow-y-auto rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[90px]">Request</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead className="w-[80px]">Type</TableHead>
                            <TableHead className="w-[80px]">Batch</TableHead>
                            <TableHead className="w-[90px] text-right">Current</TableHead>
                            <TableHead className="w-[90px] text-right">Proposed</TableHead>
                            <TableHead className="w-[80px] text-right">Change</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.map((item) => (
                            <TableRow key={item.request_id}>
                                <TableCell className="font-medium">{item.record_label}</TableCell>
                                <TableCell className="max-w-[180px] truncate" title={item.product_label}>
                                    {item.product_label}
                                </TableCell>
                                <TableCell className="truncate">{item.price_type_label}</TableCell>
                                <TableCell>{item.batch_label}</TableCell>
                                <TableCell className="text-right">{money(item.current_price)}</TableCell>
                                <TableCell className="text-right font-medium">{money(item.proposed_price)}</TableCell>
                                <TableCell
                                    className={cn(
                                        "text-right font-medium",
                                        changeClass(item.current_price, item.proposed_price),
                                    )}
                                >
                                    {changeLabel(item.current_price, item.proposed_price)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            {items.length > 10 ? (
                <p className="text-xs text-muted-foreground">Showing all {items.length} selected requests.</p>
            ) : null}
        </div>
    );
}
