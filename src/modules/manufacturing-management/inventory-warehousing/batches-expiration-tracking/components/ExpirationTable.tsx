import React, { useState } from "react";
import { motion } from "framer-motion";
import {
    ChevronRight,
    ArrowUpDown,
    Boxes,
    PackageSearch,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BatchExpirationItem, ExpirationStatus } from "../types";

interface ExpirationTableProps {
    items: BatchExpirationItem[];
    loading: boolean;
    onSelectBatch: (batch: BatchExpirationItem) => void;
}

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return "-";
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return "-";
        return d.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    } catch {
        return "-";
    }
}

function getStatusBadge(status: ExpirationStatus, daysRemaining: number | null) {
    switch (status) {
        case "EXPIRED":
            return (
                <Badge
                    variant="outline"
                    className="border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold text-[10px] tracking-wide uppercase px-2 py-0.5"
                >
                    Expired ({daysRemaining !== null ? `${Math.abs(daysRemaining)}d ago` : ""})
                </Badge>
            );
        case "EXPIRING_TODAY":
            return (
                <Badge
                    variant="outline"
                    className="border-orange-500/40 bg-orange-500/15 text-orange-600 dark:text-orange-400 font-bold text-[10px] tracking-wide uppercase px-2 py-0.5 animate-pulse"
                >
                    Expiring Today
                </Badge>
            );
        case "CRITICAL":
            return (
                <Badge
                    variant="outline"
                    className="border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400 font-bold text-[10px] tracking-wide uppercase px-2 py-0.5"
                >
                    Critical ({daysRemaining}d left)
                </Badge>
            );
        case "WARNING":
            return (
                <Badge
                    variant="outline"
                    className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-[10px] tracking-wide uppercase px-2 py-0.5"
                >
                    Warning ({daysRemaining}d left)
                </Badge>
            );
        case "UPCOMING":
            return (
                <Badge
                    variant="outline"
                    className="border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium text-[10px] tracking-wide uppercase px-2 py-0.5"
                >
                    Upcoming ({daysRemaining}d)
                </Badge>
            );
        case "SAFE":
            return (
                <Badge
                    variant="outline"
                    className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium text-[10px] tracking-wide uppercase px-2 py-0.5"
                >
                    Safe
                </Badge>
            );
        case "NO_EXPIRY":
        default:
            return (
                <Badge
                    variant="outline"
                    className="border-muted bg-muted/30 text-muted-foreground font-medium text-[10px] tracking-wide uppercase px-2 py-0.5"
                >
                    No Expiry
                </Badge>
            );
    }
}



export default function ExpirationTable({
    items,
    loading,
    onSelectBatch,
}: ExpirationTableProps) {
    const [sortField, setSortField] = useState<"days_remaining" | "inventory_value" | "on_hand_quantity">("days_remaining");
    const [sortAsc, setSortAsc] = useState<boolean>(true);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const pageSize = 15;

    const handleSort = (field: "days_remaining" | "inventory_value" | "on_hand_quantity") => {
        if (sortField === field) {
            setSortAsc(!sortAsc);
        } else {
            setSortField(field);
            setSortAsc(true);
        }
    };

    const sortedItems = [...items].sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];

        if (sortField === "days_remaining") {
            if (valA === null && valB === null) return 0;
            if (valA === null) return 1;
            if (valB === null) return -1;
        }

        valA = Number(valA) || 0;
        valB = Number(valB) || 0;

        return sortAsc ? valA - valB : valB - valA;
    });

    const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
    const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);


    const paginatedItems = sortedItems.slice(
        (safeCurrentPage - 1) * pageSize,
        safeCurrentPage * pageSize
    );

    if (loading) {
        return (
            <div className="space-y-3 rounded-xl border border-border/70 bg-card p-6">
                <div className="flex items-center justify-between pb-3 border-b border-border/40">
                    <div className="h-4 w-44 bg-muted rounded animate-pulse" />
                    <div className="h-4 w-28 bg-muted rounded animate-pulse" />
                </div>
                {[...Array(6)].map((_, idx) => (
                    <div
                        key={idx}
                        className="h-14 w-full bg-muted/40 rounded-lg animate-pulse"
                    />
                ))}
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 p-12 text-center"
            >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
                    <PackageSearch className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-bold text-foreground">No Batches Found</h3>
                <p className="text-xs text-muted-foreground max-w-sm mt-1">
                    No inventory batches match your active filter criteria. Try adjusting the status or branch filters.
                </p>
            </motion.div>
        );
    }

    return (
        <div className="space-y-3 rounded-xl border border-border/70 bg-card shadow-sm overflow-hidden">
            {/* Table Container */}
            <motion.div
                key={`${safeCurrentPage}-${sortField}-${sortAsc}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className="overflow-x-auto"
            >
                <table className="w-full text-left border-collapse text-xs">
                    <thead>
                        <tr className="border-b border-border bg-muted/40 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                            <th className="py-3 px-3.5">Status</th>
                            <th className="py-3 px-3.5">Item & Description</th>
                            <th className="py-3 px-3.5">Batch / Lot No.</th>
                            <th className="py-3 px-3.5">Branch</th>
                            <th className="py-3 px-3.5">Expiry Date</th>
                            <th
                                className="py-3 px-3.5 cursor-pointer select-none text-right hover:text-foreground"
                                onClick={() => handleSort("days_remaining")}
                            >
                                <span className="inline-flex items-center gap-1">
                                    Days Left
                                    <ArrowUpDown className="h-3 w-3" />
                                </span>
                            </th>
                            <th
                                className="py-3 px-3.5 cursor-pointer select-none text-right hover:text-foreground"
                                onClick={() => handleSort("on_hand_quantity")}
                            >
                                <span className="inline-flex items-center gap-1">
                                    On-Hand
                                    <ArrowUpDown className="h-3 w-3" />
                                </span>
                            </th>
                            <th className="py-3 px-3.5 text-right">Unit Cost</th>
                            <th
                                className="py-3 px-3.5 cursor-pointer select-none text-right hover:text-foreground"
                                onClick={() => handleSort("inventory_value")}
                            >
                                <span className="inline-flex items-center gap-1">
                                    Value
                                    <ArrowUpDown className="h-3 w-3" />
                                </span>
                            </th>
                            <th className="py-3 px-3.5 text-center">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {paginatedItems.map((item, idx) => {
                            return (
                                <tr
                                    key={`${item.branch_id}-${item.inventory_lot_id}-${item.lot_id}-${item.batch_no || 'nobatch'}-${idx}`}
                                    onClick={() => onSelectBatch(item)}
                                    className="group cursor-pointer transition-colors hover:bg-muted/40"
                                >
                                        {/* Status */}
                                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                                            {getStatusBadge(item.expiration_status, item.days_remaining)}
                                        </td>

                                        {/* Item & Description */}
                                        <td className="py-2.5 px-3.5">
                                            <div className="font-semibold text-foreground truncate max-w-[200px]" title={item.product_name}>
                                                {item.product_name}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                                                <span className="font-mono">{item.product_code || "-"}</span>
                                                {item.product_type_name && (
                                                    <>
                                                        <span>•</span>
                                                        <span className="truncate max-w-[100px]">{item.product_type_name}</span>
                                                    </>
                                                )}
                                            </div>
                                        </td>

                                        {/* Batch / Lot No. */}
                                        <td className="py-2.5 px-3.5 font-mono text-xs whitespace-nowrap">
                                            <div className="font-bold text-foreground">
                                                {item.batch_no || "-"}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                                <Boxes className="h-3 w-3" />
                                                <span>{item.lot_name || `Lot #${item.lot_id}`}</span>
                                            </div>
                                        </td>

                                        {/* Branch */}
                                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                                            <div className="font-mono text-xs font-bold text-foreground">
                                                {item.branch_code || item.branch_name || "-"}
                                            </div>
                                            {item.branch_name && item.branch_code && (
                                                <div className="text-[10px] text-muted-foreground truncate max-w-[130px]" title={item.branch_name}>
                                                    {item.branch_name}
                                                </div>
                                            )}
                                        </td>

                                        {/* Expiry Date */}
                                        <td className="py-2.5 px-3.5 whitespace-nowrap font-medium text-foreground">
                                            {formatDate(item.expiry_date)}
                                        </td>

                                        {/* Days Left */}
                                        <td className="py-2.5 px-3.5 whitespace-nowrap text-right font-mono font-bold">
                                            {item.days_remaining !== null ? (
                                                <span
                                                    className={
                                                        item.days_remaining < 0
                                                            ? "text-rose-500 font-extrabold"
                                                            : item.days_remaining === 0
                                                            ? "text-orange-500 font-extrabold animate-pulse"
                                                            : item.days_remaining <= 3
                                                            ? "text-orange-500"
                                                            : item.days_remaining <= 7
                                                            ? "text-amber-500"
                                                            : "text-foreground"
                                                    }
                                                >
                                                    {item.days_remaining > 0
                                                        ? `+${item.days_remaining}`
                                                        : item.days_remaining}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </td>

                                        {/* On-Hand Quantity */}
                                        <td className="py-2.5 px-3.5 whitespace-nowrap text-right">
                                            <span className="font-bold text-foreground">
                                                {item.on_hand_quantity.toLocaleString(undefined, {
                                                    minimumFractionDigits: 0,
                                                    maximumFractionDigits: 2,
                                                })}
                                            </span>{" "}
                                            <span className="text-[10px] text-muted-foreground uppercase font-medium">
                                                {item.unit_shortcut || item.unit_name || "PCS"}
                                            </span>
                                        </td>

                                        {/* Unit Cost */}
                                        <td className="py-2.5 px-3.5 whitespace-nowrap text-right text-muted-foreground font-mono">
                                            {formatCurrency(item.unit_cost)}
                                        </td>

                                        {/* Inventory Value */}
                                        <td className="py-2.5 px-3.5 whitespace-nowrap text-right font-bold text-foreground font-mono">
                                            {formatCurrency(item.inventory_value)}
                                        </td>

                                        {/* Action Button */}
                                        <td className="py-2.5 px-3.5 whitespace-nowrap text-center">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onSelectBatch(item);
                                                }}
                                                className="h-7 text-[11px] px-2.5 font-semibold shadow-none text-muted-foreground hover:text-foreground"
                                            >
                                                Details
                                                <ChevronRight className="h-3 w-3 ml-1 opacity-70" />
                                            </Button>
                                        </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </motion.div>

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-border/50 px-4 py-2.5 text-xs text-muted-foreground">
                <div>
                    Showing{" "}
                    <span className="font-semibold text-foreground">
                        {sortedItems.length > 0 ? (safeCurrentPage - 1) * pageSize + 1 : 0}
                    </span>{" "}
                    to{" "}
                    <span className="font-semibold text-foreground">
                        {Math.min(safeCurrentPage * pageSize, sortedItems.length)}
                    </span>{" "}
                    of <span className="font-semibold text-foreground">{sortedItems.length}</span> batches
                </div>

                <div className="flex items-center gap-1.5">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={safeCurrentPage <= 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="h-7 px-2.5 text-xs"
                    >
                        Previous
                    </Button>
                    <span className="text-[11px] px-2 font-medium">
                        Page {safeCurrentPage} of {totalPages}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={safeCurrentPage >= totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="h-7 px-2.5 text-xs"
                    >
                        Next
                    </Button>
                </div>
            </div>
        </div>
    );
}
