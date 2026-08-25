import React, { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ArrowRight, CornerDownRight, ChevronUp, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PouchReportDto } from "../hooks/useCollectionReport";

export function LedgerTable({ pouches }: { pouches: PouchReportDto[] }) {

    // 🚀 SORT STATE
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" }>({
        key: "pouchDate",
        direction: "desc"
    });

    const handleSort = (key: string) => {
        setSortConfig((prev) => ({
            key,
            direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
        }));
    };

    const renderSortIcon = (key: string) => {
        if (sortConfig.key !== key) return <ChevronUp size={12} className="opacity-20 ml-1 inline" />;
        return sortConfig.direction === "asc"
            ? <ChevronUp size={12} className="text-primary ml-1 inline" />
            : <ChevronDown size={12} className="text-primary ml-1 inline" />;
    };

    // 🚀 1. Dynamically flatten the hierarchical pouches into a single ledger list
    const flattenedLedger = useMemo(() => {
        if (!pouches) return [];
        return pouches.flatMap(pouch =>
            pouch.invoices.map(inv => ({
                pouchDate: pouch.date,
                pouchDocNo: pouch.docNo,
                pouchIsPosted: pouch.isPosted,
                ...inv
            }))
        );
    }, [pouches]);

    // 🚀 2. Sort the flattened ledger
    const sortedLedger = useMemo(() => {
        if (!flattenedLedger) return [];
        const sorted = [...flattenedLedger];
        sorted.sort((a, b) => {
            const valA = a[sortConfig.key as keyof typeof a];
            const valB = b[sortConfig.key as keyof typeof b];

            if (valA === undefined || valB === undefined) return 0;

            if (typeof valA === 'string' && typeof valB === 'string') {
                return sortConfig.direction === "asc"
                    ? valA.localeCompare(valB)
                    : valB.localeCompare(valA);
            }

            if (typeof valA === 'number' && typeof valB === 'number') {
                return sortConfig.direction === "asc"
                    ? valA - valB
                    : valB - valA;
            }

            return 0;
        });
        return sorted;
    }, [flattenedLedger, sortConfig]);

    const totalCleared = useMemo(() => {
        return sortedLedger.reduce((sum, inv) => sum + inv.netAmount, 0);
    }, [sortedLedger]);

    return (
        <Card className="shadow-sm overflow-hidden border border-border/60 h-full flex flex-col bg-background rounded-2xl">

            <div className="bg-emerald-500/10 py-3.5 px-5 border-b border-emerald-500/20 flex justify-between items-center shrink-0">
                <h3 className="text-xs font-black uppercase tracking-widest text-emerald-700 flex items-center gap-2">Accounts Settled <ArrowRight size={16}/></h3>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                    Net Receivable Generated:
                    <span className="font-mono text-emerald-700 font-black text-lg tracking-tight">₱{totalCleared.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </span>
            </div>

            {/* 🚀 STICKY HEADER FIX: Use regular table without shadcn wrapper to allow sticky positioning */}
            <div className="flex-1 overflow-y-auto relative scrollbar-thin print-expand">
                <table className="text-xs w-full border-collapse">

                    <thead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-sm shadow-sm">
                        <tr className="border-b border-border/50">
                            <th className="h-11 font-bold uppercase tracking-wider text-[10px] text-muted-foreground pl-5 w-[180px] text-left cursor-pointer hover:bg-muted/50 select-none" onClick={() => handleSort("pouchDate")}>
                                Pouch Details {renderSortIcon("pouchDate")}
                            </th>
                            <th className="h-11 font-bold uppercase tracking-wider text-[10px] text-muted-foreground text-left cursor-pointer hover:bg-muted/50 select-none" onClick={() => handleSort("invoiceNo")}>
                                Invoice & Customer {renderSortIcon("invoiceNo")}
                            </th>
                            <th className="h-11 font-bold uppercase tracking-wider text-[10px] text-muted-foreground text-right pr-5 cursor-pointer hover:bg-muted/50 select-none" onClick={() => handleSort("netAmount")}>
                                Breakdown & Net Applied {renderSortIcon("netAmount")}
                            </th>
                        </tr>
                    </thead>

                    <tbody>
                        {sortedLedger.length === 0 ? (
                            <tr><td colSpan={3} className="text-center italic text-muted-foreground py-12 text-sm">No invoices settled in this period.</td></tr>
                        ) : sortedLedger.map((inv, i) => {
                            const hasCreditMemo = inv.memoAmount > 0;

                            return (
                                <tr key={i} className="hover:bg-muted/30 transition-colors group cursor-default border-b border-border/50">

                                    {/* Column 1: Pouch Info */}
                                    <td className="py-4 pl-5 align-top">
                                        <div className="font-bold text-foreground text-[11px] mb-1.5">{inv.pouchDate ? format(parseISO(inv.pouchDate), "MMM dd, yyyy") : 'N/A'}</div>
                                        <div className="flex flex-col gap-2 items-start">
                                            <span className="font-mono text-[11px] font-black text-primary transition-colors tracking-tight">{inv.pouchDocNo}</span>
                                            {inv.pouchIsPosted
                                                ? <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[8px] px-2 h-4.5 leading-none rounded-md font-bold tracking-widest">POSTED</Badge>
                                                : <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-[8px] px-2 h-4.5 leading-none rounded-md font-bold tracking-widest">DRAFT</Badge>
                                            }
                                        </div>
                                    </td>

                                    {/* Column 2: Invoice Info */}
                                    <td className="py-4 align-top">
                                        <div className="font-black text-foreground font-mono text-[13px] tracking-tight">{inv.invoiceNo}</div>
                                        <div className="text-[11px] text-muted-foreground font-medium mt-1">{inv.customerName}</div>
                                    </td>

                                    {/* Column 3: The Hierarchical Math */}
                                    <td className="text-right py-4 pr-5 align-top">
                                        <div className="font-mono font-bold text-muted-foreground text-[11px]">
                                            Gross: ₱{inv.invoiceTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                        </div>

                                        <div className="flex flex-col items-end gap-1.5 mt-2.5">
                                            {/* Dynamic Memo Render */}
                                            {inv.memoAmount !== 0 && (
                                                <span className={`flex items-center gap-1.5 text-[10px] font-medium font-mono ${hasCreditMemo ? "text-indigo-600 dark:text-indigo-400" : "text-orange-600 dark:text-orange-400"}`}>
                                                    <CornerDownRight size={12} className="opacity-50"/>
                                                    {hasCreditMemo ? "Credit Memo: -" : "Debit Memo: +"} ₱{Math.abs(inv.memoAmount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                                </span>
                                            )}

                                            {/* Return Render */}
                                            {inv.returnAmount > 0 && (
                                                <span className="flex items-center gap-1.5 text-[10px] font-medium font-mono text-pink-600 dark:text-pink-400">
                                                    <CornerDownRight size={12} className="opacity-50"/>
                                                    Return: - ₱{inv.returnAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                                </span>
                                            )}

                                            {/* Final Net Render */}
                                            <span className="text-emerald-700 dark:text-emerald-400 font-black text-[13px] tracking-tight font-mono mt-1 border-t border-border/60 pt-1.5">
                                                Net: ₱{inv.netAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                            </span>
                                        </div>
                                    </td>

                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}