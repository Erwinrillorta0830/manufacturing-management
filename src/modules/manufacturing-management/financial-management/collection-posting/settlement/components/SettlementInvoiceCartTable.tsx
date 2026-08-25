"use client";

import React, { useState, useMemo } from "react";
import { X, History, Info, Percent, Wand2, CheckCircle2, FileText, ArrowUp, ArrowDown, ArrowUpDown, Receipt, Layers, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { UnpaidInvoice, SettlementAllocation } from "../../types";
import { WalletItem } from "../hooks/useSettlement";
import { cn } from "@/lib/utils";
import {
    findOverAllocatedInvoice,
    findUnderAllocatedInvoice,
    getCartBalanceTotals,
    getInvoiceAppliedForSettlement,
    getInvoiceRequiredBalance,
    SETTLEMENT_BALANCE_TOLERANCE,
} from "../utils/settlement-balance";

export interface SettlementInvoiceCartTableProps {
    isPosted: boolean;
    cartInvoices: UnpaidInvoice[];
    allocations: SettlementAllocation[];
    wallet: WalletItem[];
    credits: WalletItem[];
    combinedSources: WalletItem[];
    cartTotalBalance: number;
    cartTotalAppliedSession: number;
    activeInvoiceId: number | null;
    setActiveInvoiceId: (id: number | null) => void;
    removeFromCart: (invoiceId: number) => void;
    handleInvoiceDiscrepancy: (inv: UnpaidInvoice) => void;
    handleAutoCalculateEWT: (inv: UnpaidInvoice) => void;
    getInvoiceApplied: (invoiceId: number) => number;
    getUsedAmount: (sourceId: string) => number;
}

export default function SettlementInvoiceCartTable({
                                                       isPosted, cartInvoices, allocations, combinedSources,
                                                       cartTotalBalance, cartTotalAppliedSession, activeInvoiceId, setActiveInvoiceId,
                                                       removeFromCart, handleInvoiceDiscrepancy, handleAutoCalculateEWT, getInvoiceApplied
                                                   }: SettlementInvoiceCartTableProps) {
    const [cartSortField, setCartSortField] = useState<keyof UnpaidInvoice | null>(null);
    const [cartSortDir, setCartSortDir] = useState<"asc" | "desc">("asc");
    const [cartSearchQuery, setCartSearchQuery] = useState("");

    const handleCartSort = (field: keyof UnpaidInvoice) => {
        if (cartSortField === field) setCartSortDir(cartSortDir === "asc" ? "desc" : "asc");
        else { setCartSortField(field); setCartSortDir("asc"); }
    };

    const sortedCartInvoices = useMemo(() => {
        if (!cartSortField) return cartInvoices;
        return [...cartInvoices].sort((a, b) => {
            const aVal = a[cartSortField];
            const bVal = b[cartSortField];
            if (aVal == null && bVal == null) return 0;
            if (aVal == null) return 1;
            if (bVal == null) return -1;
            const modifier = cartSortDir === "asc" ? 1 : -1;
            return aVal > bVal ? modifier : -modifier;
        });
    }, [cartInvoices, cartSortField, cartSortDir]);

    const filteredCartInvoices = useMemo(() => {
        if (!cartSearchQuery) return sortedCartInvoices;
        const q = cartSearchQuery.toLowerCase().trim();
        return sortedCartInvoices.filter(inv =>
            inv.invoiceNo.toLowerCase().includes(q) ||
            inv.customerName.toLowerCase().includes(q)
        );
    }, [sortedCartInvoices, cartSearchQuery]);

    const cartBalanceTotals = getCartBalanceTotals(cartInvoices, allocations);
    const underAllocatedInvoice = findUnderAllocatedInvoice(cartInvoices, allocations);
    const overAllocatedInvoice = findOverAllocatedInvoice(cartInvoices, allocations);
    const isCartUnbalanced = Boolean(underAllocatedInvoice || overAllocatedInvoice)
        || Math.abs(cartBalanceTotals.difference) > SETTLEMENT_BALANCE_TOLERANCE;
    const cartValidationMessage = underAllocatedInvoice
        ? `Invoice ${underAllocatedInvoice.invoiceNo} still has ₱${(
            getInvoiceRequiredBalance(underAllocatedInvoice)
            - getInvoiceAppliedForSettlement(allocations, underAllocatedInvoice.id)
        ).toLocaleString(undefined, { minimumFractionDigits: 2 })} unallocated. Apply the balance or remove it before committing.`
        : overAllocatedInvoice
            ? `The allocation for ${overAllocatedInvoice.invoiceNo} exceeds its remaining balance.`
            : `Settlement cart is not balanced. ₱${Math.abs(cartBalanceTotals.difference).toLocaleString(undefined, { minimumFractionDigits: 2 })} remains unallocated.`;

    return (
        <div className="relative w-full h-full flex flex-col overflow-hidden bg-card">
            {/* Search Bar for Cart */}
            <div className="p-2 border-b border-border bg-card flex items-center justify-between gap-4 shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Invoices in Cart</span>
                <div className="relative w-full max-w-[280px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                        value={cartSearchQuery}
                        onChange={(e) => setCartSearchQuery(e.target.value)}
                        placeholder="Search customer / invoice..."
                        className="h-7 pl-8 text-xs focus-visible:ring-1 bg-background border-border/60"
                    />
                </div>
            </div>

            {cartInvoices.length > 0 && !isPosted && isCartUnbalanced && (
                <div role="alert" className="px-3 py-2 border-b border-orange-200 bg-orange-50 text-orange-800 flex items-center gap-2 shrink-0">
                    <Info size={13} className="shrink-0" />
                    <span className="text-[10px] font-bold">
                        {cartValidationMessage}
                    </span>
                </div>
            )}

            <div className="relative w-full flex-1 overflow-y-auto scrollbar-thin [&>div]:!overflow-visible">
                <Table className="relative min-w-[700px]">
                    <TableHeader className="bg-muted/90 backdrop-blur-md sticky top-0 z-20 shadow-sm outline outline-1 outline-border">
                        <TableRow>
                            <TableHead className="text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-muted/80 h-8 px-4" onClick={() => handleCartSort("invoiceNo")}>
                                <div className="flex items-center gap-1">
                                    <span>Invoice Info</span>
                                    {cartSortField === "invoiceNo" ? (cartSortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-50" />}
                                </div>
                            </TableHead>
                            <TableHead className="text-[10px] font-black uppercase tracking-widest text-right cursor-pointer hover:bg-muted/80 h-8" onClick={() => handleCartSort("originalAmount")}>
                                <div className="flex items-center justify-end gap-1">
                                    <span>Balance Breakdown</span>
                                    {cartSortField === "originalAmount" ? (cartSortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-50" />}
                                </div>
                            </TableHead>
                            <TableHead className="text-[10px] font-black uppercase tracking-widest text-right h-8 pr-4">Applying Now</TableHead>
                        </TableRow>
                    </TableHeader>

                    <TableBody>
                        {filteredCartInvoices.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={3} className="h-[40vh] text-center">
                                    <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                                        <Receipt size={36} className="opacity-20"/>
                                        <p className="font-bold tracking-widest uppercase text-xs">No Matching Invoices</p>
                                        <p className="text-[10px]">{cartInvoices.length === 0 ? (isPosted ? "This pouch has no allocations." : "Search and select an invoice above to begin allocation.") : "Try checking your search keyword."}</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : filteredCartInvoices.map(inv => {
                            const appliedSession = getInvoiceApplied(inv.id);
                            const invoiceAllocations = allocations.filter(a => a.invoiceId === inv.id && a.amountApplied > 0);
                            const appliedAdj = invoiceAllocations.filter(a => a.allocationType === "ADJUSTMENT").reduce((sum, a) => sum + a.amountApplied, 0);
                            const appliedCredits = invoiceAllocations.filter(a => a.allocationType === "MEMO" || a.allocationType === "RETURN").reduce((sum, a) => sum + a.amountApplied, 0);
                            const hasEWTApplied = invoiceAllocations.some(a => a.allocationType === "EWT");
                            const isFullySettled = appliedSession >= (getInvoiceRequiredBalance(inv) - 0.01);
                            const isPartiallySettled = appliedSession > 0 && !isFullySettled;

                            let rowStatus = ""; let badgeColor = ""; let rowBg = "bg-background"; let IconComponent: React.ReactNode = null;

                            if (isFullySettled) {
                                if (appliedAdj > 0) { rowStatus = "ADJUSTED"; badgeColor = "border-orange-200 text-orange-700 bg-orange-100"; rowBg = "bg-orange-50/30 dark:bg-orange-950/10"; IconComponent = <Wand2 size={8} className="mr-1"/>; }
                                else if (appliedCredits > 0) { rowStatus = "CREDITED"; badgeColor = "border-purple-200 text-purple-700 bg-purple-100"; rowBg = "bg-purple-50/30 dark:bg-purple-950/10"; IconComponent = <Percent size={8} className="mr-1"/>; }
                                else { rowStatus = "PAID"; badgeColor = "border-emerald-200 text-emerald-700 bg-emerald-100"; rowBg = "bg-emerald-50/30 dark:bg-emerald-950/10"; IconComponent = <CheckCircle2 size={8} className="mr-1"/>; }
                            } else if (isPartiallySettled) {
                                rowStatus = "PARTIALLY APPLIED"; badgeColor = "border-blue-200 text-blue-700 bg-blue-100"; rowBg = "bg-blue-50/10 dark:bg-blue-950/5"; IconComponent = <Layers size={8} className="mr-1"/>;
                            }

                            const isActive = activeInvoiceId === inv.id;

                            return (
                                <TableRow
                                    key={inv.id}
                                    onClick={() => setActiveInvoiceId(inv.id)}
                                    className={cn(
                                        "cursor-pointer transition-all border-b border-border/50",
                                        isActive ? "bg-primary/5 dark:bg-primary/10 border-l-[3px] border-l-primary shadow-[inset_0_0_10px_rgba(0,0,0,0.02)]" : `hover:bg-muted/50 ${rowBg}`
                                    )}
                                >
                                    <TableCell className="align-top py-2 px-4 min-w-[180px]">
                                        <div className="flex items-start gap-1.5">
                                            {!isPosted && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); removeFromCart(inv.id); }}
                                                    className="text-muted-foreground hover:text-destructive mt-0.5 shrink-0"
                                                >
                                                    <X size={12} strokeWidth={3}/>
                                                </button>
                                            )}
                                            <div className="flex flex-col min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className={`font-mono font-black text-xs truncate leading-none ${isFullySettled ? 'text-primary/70' : 'text-primary'}`}>{inv.invoiceNo}</span>
                                                    {rowStatus && <Badge variant="outline" className={`text-[7px] px-1 py-0 h-3.5 leading-none shrink-0 uppercase tracking-widest ${badgeColor}`}>{IconComponent}{rowStatus}</Badge>}
                                                </div>
                                                <div className="text-[10px] font-bold text-foreground leading-tight mt-1">{inv.customerName}</div>

                                                {/* Action Buttons moved underneath the name for inline access */}
                                                {!isPosted && isActive && (
                                                    <div className="flex items-center gap-1 mt-2 animate-in fade-in slide-in-from-top-1">
                                                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleInvoiceDiscrepancy(inv); }} className="h-5 text-[8px] px-1.5 font-black uppercase tracking-widest text-orange-600 border-orange-200 hover:bg-orange-50 gap-1"><Wand2 size={8} strokeWidth={3}/> Variance</Button>
                                                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleAutoCalculateEWT(inv); }} disabled={hasEWTApplied} className={cn("h-5 text-[8px] px-1.5 font-black uppercase tracking-widest gap-1", hasEWTApplied ? "opacity-50 cursor-not-allowed" : "text-teal-600 border-teal-200 hover:bg-teal-50")}><FileText size={8} strokeWidth={3}/> Auto-2307</Button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </TableCell>

                                    <TableCell className="text-right align-top py-2">
                                        <div className="flex flex-col items-end">
                                            <div className="font-mono font-black text-xs">₱{inv.originalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                            <div className="mt-1 flex flex-col gap-0.5">
                                                {(inv.totalPayments > 0 || inv.totalMemos > 0 || inv.totalReturns > 0) && (
                                                    <div className="text-[7.5px] font-bold text-muted-foreground uppercase tracking-widest flex gap-1 justify-end leading-none border-b border-dashed pb-0.5 mb-0.5">
                                                        <span>Paid: <span className="text-foreground font-mono">₱{inv.totalPayments.toLocaleString()}</span></span>
                                                        {inv.totalMemos > 0 && <span>Memo: <span className="text-foreground font-mono">₱{inv.totalMemos.toLocaleString()}</span></span>}
                                                        {inv.totalReturns > 0 && <span>Ret: <span className="text-foreground font-mono">₱{inv.totalReturns.toLocaleString()}</span></span>}
                                                    </div>
                                                )}
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <button className="text-[8.5px] font-black uppercase tracking-widest text-primary flex items-center gap-1 hover:underline outline-none group leading-none">
                                                            Open Bal:
                                                            ₱{inv.remainingBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                                            <History size={10} className="text-muted-foreground group-hover:text-primary transition-colors"/>
                                                        </button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-72 p-0 shadow-2xl border-primary/20" align="end" onClick={(e) => e.stopPropagation()}>
                                                        <div className="bg-primary p-2 text-white flex justify-between items-center"><h4 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-1.5"><History size={12}/> Audit Trail</h4><Badge variant="outline" className="text-white border-white/50 text-[8px] h-4 py-0 leading-none">{inv.invoiceNo}</Badge></div>
                                                        <div className="p-2 space-y-1.5 max-h-[250px] overflow-y-auto scrollbar-thin">
                                                            <div className="flex justify-between text-[8px] font-black uppercase text-muted-foreground border-b pb-1"><span>Date / Ref</span><span>Applied</span></div>
                                                            {inv.history && inv.history.length > 0 ? ( inv.history.map((h, i) => ( <div key={`hist-${inv.id}-${i}`} className="flex justify-between items-center py-1.5 border-b border-muted/30 last:border-0"><div className="flex flex-col"><span className="text-[9px] font-mono font-bold text-foreground leading-none">{h.date}</span><span className="text-[7px] font-black uppercase text-muted-foreground mt-0.5 leading-none">{h.type} • {h.reference}</span></div><span className="text-[10px] font-black text-emerald-600">₱{h.amount.toLocaleString()}</span></div>)) ) : ( <div className="py-6 text-center flex flex-col items-center gap-2 text-muted-foreground"><Info size={20} className="opacity-20"/><p className="text-[9px] font-bold uppercase italic">No Historical Records</p></div>)}
                                                        </div>
                                                    </PopoverContent>
                                                </Popover>
                                            </div>
                                        </div>
                                    </TableCell>

                                    <TableCell className="text-right align-top py-2 pr-4">
                                        <div className={`font-mono font-black text-xs leading-none ${appliedSession > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>{appliedSession > 0 ? `₱${appliedSession.toLocaleString(undefined, {minimumFractionDigits: 2})}` : "—"}</div>
                                        <div className="mt-1 flex flex-col gap-0.5">
                                            {invoiceAllocations.map((alloc, idx) => (
                                                <div key={`alloc-${inv.id}-${alloc.sourceTempId}-${idx}`} className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest flex gap-1 justify-end leading-none">
                                                    <span>{combinedSources.find(w => w.id === alloc.sourceTempId)?.type || 'ADJ'}:</span>
                                                    <span className="text-foreground font-mono">₱{alloc.amountApplied.toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>

                    {filteredCartInvoices.length > 0 && (
                        <TableFooter className="bg-muted/90 backdrop-blur-md sticky bottom-0 z-20 outline outline-1 outline-border shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                            <TableRow>
                                <TableCell colSpan={2} className="text-right py-2"><span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mr-4">Open Balance:</span><span className="font-mono font-black text-xs">₱{cartTotalBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></TableCell>
                                <TableCell className="text-right py-2 border-l border-border/50 pr-4"><div className="flex flex-col items-end"><span className="text-[8px] font-black uppercase tracking-widest text-emerald-600 mb-0.5 leading-none">Applied This Pouch</span><span className="font-mono font-black text-emerald-600 text-xs leading-none">₱{cartTotalAppliedSession.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div></TableCell>
                            </TableRow>
                        </TableFooter>
                    )}
                </Table>
            </div>
        </div>
    );
}
