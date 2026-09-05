"use client";

import React, { useState } from "react";
import { Search, Wallet, Percent } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UnpaidInvoice, SettlementAllocation } from "../../types";
import { WalletItem } from "../hooks/useSettlement";
import {
    capSettlementAllocation,
    getInvoiceAllocationCapacity,
    getInvoiceRequiredBalance,
    getSourceAllocationCapacity,
} from "../utils/settlement-balance";
import { cn } from "@/lib/utils";

interface AllocationSidePanelProps {
    activeInvoiceId: number | null;
    cartInvoices: UnpaidInvoice[];
    wallet: WalletItem[];
    credits: WalletItem[];
    allocations: SettlementAllocation[];
    handleAllocate: (invoiceId: number, sourceId: string, amountInput: number) => void;
    getUsedAmount: (sourceId: string) => number;
    getInvoiceApplied: (invoiceId: number) => number;
}

export default function AllocationSidePanel({
                                                activeInvoiceId,
                                                cartInvoices,
                                                wallet,
                                                credits,
                                                allocations,
                                                handleAllocate,
                                                getUsedAmount,
                                                getInvoiceApplied
                                            }: AllocationSidePanelProps) {
    const [localSearch, setLocalSearch] = useState("");

    const inv = cartInvoices.find(i => i.id === activeInvoiceId);

    if (!inv) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground bg-muted/10 p-6 text-center">
                <Wallet className="w-12 h-12 mb-4 opacity-20" />
                <p className="font-bold uppercase tracking-widest text-xs">No Invoice Selected</p>
                <p className="text-[10px] mt-2">Click a row in the master list to allocate funds.</p>
            </div>
        );
    }

    const appliedSession = getInvoiceApplied(inv.id);
    const requiredBalance = getInvoiceRequiredBalance(inv);
    const hasEWTApplied = allocations.some(a => a.invoiceId === inv.id && a.allocationType === "EWT" && a.amountApplied > 0);

    return (
        <div className="flex flex-col h-full bg-card border-l border-border shadow-inner animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Header */}
            <div className="bg-muted/30 p-4 border-b border-border/50 shrink-0">
                <div className="flex justify-between items-start">
                    <div>
                        <h4 className="font-black text-sm text-foreground leading-none">{inv.invoiceNo}</h4>
                        <p className="text-[10px] font-bold text-muted-foreground mt-1.5 leading-none">{inv.customerName}</p>
                    </div>
                </div>
                <div className="mt-3 flex justify-between items-center bg-background border border-border rounded p-2">
                    <span className="text-[10px] font-black uppercase text-muted-foreground">Target Balance</span>
                    <span className="font-mono font-black text-emerald-600 text-sm">₱{Math.max(0, requiredBalance - appliedSession).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
            </div>

            {/* Body */}
            <div className="p-4 flex-1 overflow-y-auto space-y-6 scrollbar-thin">
                {/* Physical Funds Section */}
                <div className="space-y-3">
                    <h5 className="text-[10px] font-black uppercase tracking-widest text-emerald-600 flex items-center border-b pb-1">
                        <Wallet size={12} className="mr-1.5"/> Physical Funds & EWT
                    </h5>

                    {wallet.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground italic">No funds available.</p>
                    ) : wallet.map(w => {
                        const existingAlloc = allocations.find(a => a.invoiceId === inv.id && a.sourceTempId === w.id);
                        const usedElsewhere = getUsedAmount(w.id) - (existingAlloc?.amountApplied || 0);
                        const remaining = getSourceAllocationCapacity(w.originalAmount, usedElsewhere);
                        const invoiceAvailable = getInvoiceAllocationCapacity(
                            requiredBalance,
                            appliedSession - (existingAlloc?.amountApplied || 0)
                        );
                        const targetMax = capSettlementAllocation(invoiceAvailable, remaining, invoiceAvailable);

                        const isExactMatch = w.invoiceId === inv.id;
                        // Fixed strict null-check linting error here by using ?? 0
                        const isEWTDisabled = w.type === 'EWT' && hasEWTApplied && !((existingAlloc?.amountApplied ?? 0) > 0);

                        return (
                            <div key={`apply-${inv.id}-${w.id}`} className={cn("flex flex-col gap-1.5 py-2 border-b border-border/50 last:border-0", isExactMatch ? "bg-blue-50/50 px-2 -mx-2 rounded-md" : "", isEWTDisabled ? "opacity-40 grayscale pointer-events-none" : "")}>
                                <div className="flex justify-between items-start gap-2">
                                    <div className="flex flex-col min-w-0">
                                        <div className="flex items-center gap-1 flex-wrap">
                                            <span className={cn("text-[10px] font-black uppercase leading-tight break-words", w.type === 'ADJUSTMENT' ? 'text-purple-600' : (w.type === 'EWT' ? 'text-teal-600' : 'text-foreground'))}>{w.label}</span>
                                            {isExactMatch && <Badge variant="outline" className="bg-blue-100 text-blue-700 text-[8px] px-1 h-3.5">Pre-Linked</Badge>}
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end shrink-0 text-right">
                                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Rem: ₱{remaining.toLocaleString()}</span>
                                    </div>
                                </div>
                                <div className="relative mt-1">
                                    <span className="absolute left-2.5 top-2 text-[10px] font-black text-muted-foreground">₱</span>
                                    <Input
                                        type="number"
                                        disabled={isEWTDisabled}
                                        className="h-8 pl-6 pr-12 text-xs font-black text-right shadow-inner bg-background"
                                        placeholder="0.00"
                                        value={existingAlloc?.amountApplied || ""}
                                        onChange={(e) => handleAllocate(inv.id, w.id, e.target.value === "" ? 0 : parseFloat(e.target.value))}
                                    />
                                    <Button size="sm" disabled={isEWTDisabled} onClick={() => handleAllocate(inv.id, w.id, targetMax)} className="absolute right-1 top-1 h-6 px-2 bg-muted text-[9px] font-black text-foreground hover:bg-emerald-100 transition-colors">MAX</Button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Credits Section */}
                <div className="space-y-3">
                    <h5 className="text-[10px] font-black uppercase tracking-widest text-purple-600 flex items-center border-b pb-1">
                        <Percent size={12} className="mr-1.5"/> Credits (Memos/Returns)
                    </h5>
                    <div className="relative">
                        <Input type="text" placeholder="Search credits..." className="h-8 pr-7 text-xs bg-background" value={localSearch} onChange={(e) => setLocalSearch(e.target.value)} />
                        <Search size={14} className="absolute right-2.5 top-2 text-muted-foreground"/>
                    </div>

                    {credits.filter(c => {
                        const targetCode = inv.customerCode?.trim().toUpperCase();
                        const targetName = inv.customerName?.trim().toUpperCase();
                        const sourceCode = c.customerCode?.trim().toUpperCase();
                        const sourceName = c.customerName?.trim().toUpperCase();
                        
                        // If no customer code exists on the invoice, it's safer not to show anything than to leak
                        if (!targetCode && !targetName) return false;

                        return (
                            (targetCode && targetCode === sourceCode) ||
                            (targetName && targetName === sourceName) ||
                            (targetName && targetName === sourceCode) ||
                            (targetCode && targetCode === sourceName)
                        );
                    }).map(c => {
                        if (!c.label.toLowerCase().includes(localSearch.toLowerCase()) && !(c.customerName || "").toLowerCase().includes(localSearch.toLowerCase())) return null;

                        const existingAlloc = allocations.find(a => a.invoiceId === inv.id && a.sourceTempId === c.id);
                        const usedElsewhere = getUsedAmount(c.id) - (existingAlloc?.amountApplied || 0);
                        const remaining = getSourceAllocationCapacity(c.originalAmount, usedElsewhere);
                        const invoiceAvailable = getInvoiceAllocationCapacity(
                            requiredBalance,
                            appliedSession - (existingAlloc?.amountApplied || 0)
                        );
                        const targetMax = capSettlementAllocation(invoiceAvailable, remaining, invoiceAvailable);

                        return (
                            <div key={`apply-${inv.id}-${c.id}`} className="flex flex-col gap-1.5 py-2 border-b border-border/50 last:border-0">
                                <div className="flex justify-between items-start">
                                    <span className="text-[10px] font-black uppercase text-foreground leading-tight">{c.label}</span>
                                    <span className="text-[9px] font-bold text-muted-foreground uppercase">Rem: ₱{remaining.toLocaleString()}</span>
                                </div>
                                <div className="relative mt-1">
                                    <span className="absolute left-2.5 top-2 text-[10px] font-black text-muted-foreground">₱</span>
                                    <Input type="number" className="h-8 pl-6 pr-12 text-xs font-black text-right shadow-inner bg-background" placeholder="0.00" value={existingAlloc?.amountApplied || ""} onChange={(e) => handleAllocate(inv.id, c.id, parseFloat(e.target.value) || 0)} />
                                    <Button size="sm" onClick={() => handleAllocate(inv.id, c.id, targetMax)} className="absolute right-1 top-1 h-6 px-2 bg-purple-50 text-[9px] font-black text-purple-600 hover:bg-purple-200">MAX</Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
