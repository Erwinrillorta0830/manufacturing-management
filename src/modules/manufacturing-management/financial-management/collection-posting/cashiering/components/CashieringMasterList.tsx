"use client";

import React from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Edit2, Eye, ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { CollectionSummary, CashieringState } from "../../types";
import { format, isValid } from "date-fns";
import { cn } from "@/lib/utils";

interface MasterListProps {
    data: CollectionSummary[];
    isLoading: boolean;
    listError: string | null;
    state: CashieringState;
    sortField: keyof CollectionSummary;
    sortDirection: "asc" | "desc";
    onSort: (field: keyof CollectionSummary) => void;
    currentPage: number;
    totalElements: number;
    totalPages: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
}

export default function CashieringMasterList({
    data,
    isLoading,
    listError,
    state,
    sortField,
    sortDirection,
    onSort,
    currentPage,
    totalElements,
    totalPages,
    pageSize,
    onPageChange,
    onPageSizeChange,
}: MasterListProps) {

    const parseAnyDate = (val: string | number | Date | [number, number, number, number?, number?]): Date | null => {
        if (!val) return null;
        if (Array.isArray(val)) return new Date(val[0], val[1] - 1, val[2], val[3] || 0, val[4] || 0);
        const d = new Date(val);
        return isValid(d) ? d : null;
    };

    if (isLoading) {
        return (
            <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                ))}
            </div>
        );
    }

    const getStatus = (col: CollectionSummary) => {
        if (col.isCancelled === true || col.isCancelled === 1) return "Cancelled";
        if (col.isPosted === true || col.isPosted === 1) return "Posted";
        if (col.isPosted === false || col.isPosted === 0) return "Draft";
        return col.status || "Draft";
    };

    const getCollectedBy = (val: unknown) => {
        if (val === null || val === undefined) return "N/A";
        if (typeof val === 'object') {
            const v = val as Record<string, unknown>;
            const fname = v.user_fname || v.firstName || "";
            const lname = v.user_lname || v.lastName || "";
            const name = `${fname} ${lname}`.trim();
            return name || "N/A";
        }
        const strVal = String(val).trim();
        return strVal !== '' ? strVal : "N/A";
    };

    return (
        <div className="rounded-md border border-border bg-card overflow-hidden">
            <Table>
                <TableHeader className="bg-muted/50">
                    <TableRow>
                        <TableHead
                            className="w-[150px] font-bold text-[11px] uppercase tracking-wider cursor-pointer hover:bg-muted/80 transition-colors"
                            onClick={() => onSort("docNo")}
                        >
                            <div className="flex items-center gap-1">
                                <span>Doc / CP No.</span>
                                {sortField === "docNo" ? (
                                    sortDirection === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />
                                ) : (
                                    <ArrowUpDown className="h-3 w-3 text-muted-foreground opacity-50" />
                                )}
                            </div>
                        </TableHead>
                        <TableHead
                            className="font-bold text-[11px] uppercase tracking-wider cursor-pointer hover:bg-muted/80 transition-colors"
                            onClick={() => onSort("date")}
                        >
                            <div className="flex items-center gap-1">
                                <span>Collection Date</span>
                                {sortField === "date" ? (
                                    sortDirection === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />
                                ) : (
                                    <ArrowUpDown className="h-3 w-3 text-muted-foreground opacity-50" />
                                )}
                            </div>
                        </TableHead>
                        <TableHead
                            className="font-bold text-[11px] uppercase tracking-wider cursor-pointer hover:bg-muted/80 transition-colors"
                            onClick={() => onSort("encodedDate")}
                        >
                            <div className="flex items-center gap-1">
                                <span>Date Encoded</span>
                                {sortField === "encodedDate" ? (
                                    sortDirection === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />
                                ) : (
                                    <ArrowUpDown className="h-3 w-3 text-muted-foreground opacity-50" />
                                )}
                            </div>
                        </TableHead>
                        <TableHead
                            className="font-bold text-[11px] uppercase tracking-wider cursor-pointer hover:bg-muted/80 transition-colors"
                            onClick={() => onSort("collectedBy")}
                        >
                            <div className="flex items-center gap-1">
                                <span>Collected By</span>
                                {sortField === "collectedBy" ? (
                                    sortDirection === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />
                                ) : (
                                    <ArrowUpDown className="h-3 w-3 text-muted-foreground opacity-50" />
                                )}
                            </div>
                        </TableHead>
                        {/* 🚀 RENAMED TO COLLECTOR */}
                        <TableHead
                            className="font-bold text-[11px] uppercase tracking-wider cursor-pointer hover:bg-muted/80 transition-colors"
                            onClick={() => onSort("salesmanName")}
                        >
                            <div className="flex items-center gap-1">
                                <span>Collector</span>
                                {sortField === "salesmanName" ? (
                                    sortDirection === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />
                                ) : (
                                    <ArrowUpDown className="h-3 w-3 text-muted-foreground opacity-50" />
                                )}
                            </div>
                        </TableHead>
                        <TableHead
                            className="font-bold text-[11px] uppercase tracking-wider cursor-pointer hover:bg-muted/80 transition-colors"
                            onClick={() => onSort("status")}
                        >
                            <div className="flex items-center gap-1">
                                <span>Status</span>
                                {sortField === "status" ? (
                                    sortDirection === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />
                                ) : (
                                    <ArrowUpDown className="h-3 w-3 text-muted-foreground opacity-50" />
                                )}
                            </div>
                        </TableHead>
                        <TableHead
                            className="text-right font-bold text-[11px] uppercase tracking-wider cursor-pointer hover:bg-muted/80 transition-colors"
                            onClick={() => onSort("amount")}
                        >
                            <div className="flex items-center gap-1 justify-end">
                                <span>Total Counted</span>
                                {sortField === "amount" ? (
                                    sortDirection === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />
                                ) : (
                                    <ArrowUpDown className="h-3 w-3 text-muted-foreground opacity-50" />
                                )}
                            </div>
                        </TableHead>
                        <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={8} className="h-24 text-center text-muted-foreground italic">
                                {listError
                                    ? "Collection pouches could not be loaded. Use Retry to try again."
                                    : "No collection pouches found matching the filters."}
                            </TableCell>
                        </TableRow>
                    ) : (
                        data.map((col) => {
                            const safeDate = parseAnyDate(col.date);
                            const safeEncodedDate = parseAnyDate(col.encodedDate);
                            const safeAmount = col.amount || 0;

                            return (
                                <TableRow key={col.id} className="group hover:bg-muted/30 transition-colors cursor-default">
                                    <TableCell className="font-mono font-bold text-primary">
                                        {col.docNo}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {safeDate ? format(safeDate, "MMM dd, yyyy") : "---"}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {safeEncodedDate ? format(safeEncodedDate, "MMM dd, yyyy h:mm a") : "---"}
                                    </TableCell>
                                    <TableCell className="text-sm text-foreground">
                                        {getCollectedBy(col.collectedBy)}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-semibold text-foreground">{col.salesmanName}</span>
                                            <span className="text-[10px] font-mono text-muted-foreground uppercase">{col.salesmanCode}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                "text-[10px] uppercase font-bold",
                                                getStatus(col) === "Draft"
                                                    ? "border-amber-500/50 text-amber-600 bg-amber-50/50 dark:bg-amber-900/20"
                                                    : "border-emerald-500/50 text-emerald-600 bg-emerald-50/50 dark:bg-emerald-900/20"
                                            )}
                                        >
                                            {getStatus(col)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-sm text-foreground tracking-tight">
                                        ₱{safeAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {getStatus(col) === "Draft" ? (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0 hover:text-primary"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    state.loadPouchForEdit(Number(col.id));
                                                }}
                                            >
                                                <Edit2 size={14} />
                                            </Button>
                                        ) : (
                                            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-50 cursor-not-allowed">
                                                <Eye size={14} />
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })
                    )}
                </TableBody>
            </Table>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
                <span>
                    {totalElements === 0
                        ? "No records"
                        : `Showing ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, totalElements)} of ${totalElements}`}
                </span>
                <div className="flex items-center gap-2">
                    <label htmlFor="cashiering-page-size" className="whitespace-nowrap">Rows</label>
                    <select
                        id="cashiering-page-size"
                        value={pageSize}
                        onChange={event => onPageSizeChange(Number(event.target.value))}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    >
                        {[25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
                    </select>
                    <Button type="button" variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
                        <ChevronLeft className="h-4 w-4"/>
                        <span className="sr-only">Previous page</span>
                    </Button>
                    <span className="min-w-20 text-center">Page {currentPage} of {Math.max(totalPages, 1)}</span>
                    <Button type="button" variant="outline" size="sm" disabled={currentPage >= totalPages || totalPages === 0} onClick={() => onPageChange(currentPage + 1)}>
                        <ChevronRight className="h-4 w-4"/>
                        <span className="sr-only">Next page</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}
