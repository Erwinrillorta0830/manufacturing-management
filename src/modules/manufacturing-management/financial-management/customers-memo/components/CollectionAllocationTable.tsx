// src/modules/financial-management/accounting/customers-memo/components/CollectionAllocationTable.tsx

"use client";

import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
    ChevronDown, 
    ChevronRight, 
    Search, 
    Loader2,
    History
} from "lucide-react";
import { 
    GroupedCollection, 
    CollectionAllocation, 
    CollectionLookupRow 
} from "../types";

interface CollectionRowProps {
    col: GroupedCollection;
    isExpanded: boolean;
    onToggleExpand: (id: number) => void;
    allocation?: CollectionAllocation;
    onToggleAllocation: (invoice: CollectionLookupRow, col: GroupedCollection) => void;
    onUpdateAmount: (colId: number, invId: number, val: number) => void;
}

const CollectionRow = React.memo(function CollectionRow({
    col, isExpanded, onToggleExpand, allocation, onToggleAllocation, onUpdateAmount
}: CollectionRowProps) {
    const isAllocated = !!allocation;

    return (
        <React.Fragment>
            <TableRow className={`${isAllocated ? "bg-blue-50/50" : "hover:bg-muted/30"} transition-colors cursor-pointer group`} onClick={() => onToggleExpand(col.collectionId)}>
                <TableCell className="w-[50px]">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-muted-foreground group-hover:text-blue-600 transition-colors"
                    >
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                </TableCell>
                <TableCell className="font-black text-sm tracking-tight">{col.collectionNo}</TableCell>
                <TableCell className="font-mono text-xs font-bold">₱{col.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                <TableCell>
                    {isAllocated 
                        ? <Badge className="bg-blue-600 hover:bg-blue-700 shadow-sm">Selected</Badge> 
                        : <Badge variant="outline" className="opacity-50 group-hover:opacity-100 transition-opacity">Unlinked</Badge>
                    }
                </TableCell>
                <TableCell className="text-right">
                    <span className="text-[10px] font-black uppercase text-muted-foreground/60 tracking-widest italic group-hover:text-blue-600 transition-colors">
                        {col.invoices.length} Invoices Found
                    </span>
                </TableCell>
            </TableRow>
            
            {isExpanded && (
                <TableRow className="bg-muted/5 animate-in fade-in slide-in-from-top-1 duration-200">
                    <TableCell colSpan={5} className="p-0">
                        <div className="p-6 pl-14 border-l-[6px] border-l-blue-600/30 space-y-4 bg-gradient-to-r from-muted/5 to-transparent">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                                    Invoice Availability for <span className="text-blue-600">#{col.collectionNo}</span>
                                </h4>
                                {isAllocated && (
                                    <Badge variant="outline" className="text-[10px] font-bold border-blue-200 text-blue-700 bg-blue-50/50">
                                        Total Linked: ₱{allocation.allocatedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </Badge>
                                )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {col.invoices.map(inv => {
                                    const invAlloc = allocation?.invoices.find(i => i.invoiceId === inv.collectionDetailId);
                                    const isActive = !!invAlloc;

                                    return (
                                        <div 
                                            key={inv.collectionDetailId}
                                            className={`group relative p-4 rounded-2xl border-2 transition-all shadow-sm ${
                                                isActive 
                                                    ? "bg-white border-blue-600 ring-4 ring-blue-600/5 translate-y-[-2px]" 
                                                    : "bg-white/50 border-muted hover:border-blue-300 hover:bg-white cursor-pointer"
                                            }`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onToggleAllocation(inv, col);
                                            }}
                                        >
                                            <div className="flex justify-between items-start mb-3">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-black text-foreground uppercase tracking-tighter">INV #{inv.invoiceNo}</span>
                                                    <span className="text-[10px] text-muted-foreground font-bold italic">₱{inv.netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                                </div>
                                                <div className={`p-1 rounded-full ${isActive ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground opacity-30"}`}>
                                                    {isActive ? (
                                                        <svg className="h-3 w-3 fill-current" viewBox="0 0 20 20"><path d="M0 11l2-2 5 5L18 3l2 2L7 18z"/></svg>
                                                    ) : (
                                                        <div className="h-3 w-3" />
                                                    )}
                                                </div>
                                            </div>
                                            
                                            {isActive && (
                                                <div className="mt-4 pt-4 border-t border-blue-50/80 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <Label className="text-[10px] font-black uppercase tracking-tighter text-blue-600">Applied Amount</Label>
                                                        <span className="text-[10px] font-bold text-muted-foreground italic">MAX: ₱{inv.netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                                    </div>
                                                    <div className="relative">
                                                        <span className="absolute left-2.5 top-2 text-xs font-black text-blue-600 opacity-50">₱</span>
                                                        <Input 
                                                            type="number" 
                                                            className="h-9 pl-6 text-sm font-black bg-blue-50/50 border-blue-100 focus:bg-white focus:ring-blue-600 transition-all rounded-lg"
                                                            value={invAlloc.appliedAmount}
                                                            onChange={e => onUpdateAmount(col.collectionId, inv.collectionDetailId, Number(e.target.value))}
                                                            autoFocus
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </TableCell>
                </TableRow>
            )}
        </React.Fragment>
    );
});

interface CollectionAllocationTableProps {
    groupedData: GroupedCollection[];
    allocations: CollectionAllocation[];
    loadingLookup: boolean;
    hasSearched: boolean;
    onViewHistory: () => void;
    onToggleAllocation: (invoice: CollectionLookupRow, col: GroupedCollection) => void;
    onUpdateAmount: (colId: number, invId: number, val: number) => void;
}

export const CollectionAllocationTable = React.memo(function CollectionAllocationTable({
    groupedData, allocations, loadingLookup, hasSearched, onViewHistory, onToggleAllocation, onUpdateAmount
}: CollectionAllocationTableProps) {
    const [expandedIds, setExpandedIds] = React.useState<Set<number>>(new Set());

    const handleToggleExpand = React.useCallback((id: number) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    return (
        <div className="flex flex-col gap-6">
            <div className="bg-white rounded-3xl shadow-xl border border-muted/30 overflow-hidden">
                <div className="p-4 px-6 bg-muted/20 border-b flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-xl bg-blue-600 flex items-center justify-center">
                            <Search className="h-4 w-4 text-white" />
                        </div>
                        <span className="text-xs font-black text-muted-foreground uppercase tracking-widest italic">
                            Collection Linkage Discovery
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        {loadingLookup && (
                            <div className="flex items-center gap-2 text-blue-600 animate-pulse">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="text-[10px] font-black uppercase">Refreshing...</span>
                            </div>
                        )}
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-9 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest border-muted hover:bg-muted/50 transition-all flex items-center gap-2 group"
                            onClick={onViewHistory}
                        >
                            <History className="h-3.5 w-3.5 group-hover:rotate-[-20deg] transition-transform" />
                            View Posted Collections
                        </Button>
                    </div>
                </div>

                <div className="overflow-x-auto min-h-[300px]">
                    {groupedData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-32 text-center px-10">
                            <div className="h-24 w-24 bg-muted/40 rounded-full flex items-center justify-center mb-6 animate-in zoom-in duration-500">
                                <Search className="h-10 w-10 text-muted-foreground opacity-20" />
                            </div>
                            <h3 className="text-lg font-black tracking-tight text-foreground/80 mb-2 uppercase italic">
                                {hasSearched ? "No Collection Available" : "Awaiting Search Parameters"}
                            </h3>
                            <p className="text-muted-foreground text-sm font-medium max-w-[320px] leading-relaxed">
                                {hasSearched 
                                    ? "We couldn't find any pending collections for the selected criteria. Please check your filters." 
                                    : "Select a Supplier, Customer, and Salesman in the header to discover linkable collections."}
                            </p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader className="bg-muted/10">
                                <TableRow className="hover:bg-transparent border-b-2">
                                    <TableHead className="w-[50px]"></TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-widest py-4">Ref Number</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-widest">Gross Amount</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-widest">Allocation Status</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase tracking-widest px-6">Metric</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {groupedData.map(col => (
                                    <CollectionRow 
                                        key={col.collectionId}
                                        col={col}
                                        isExpanded={expandedIds.has(col.collectionId)}
                                        onToggleExpand={handleToggleExpand}
                                        allocation={allocations.find(a => a.collectionId === col.collectionId)}
                                        onToggleAllocation={onToggleAllocation}
                                        onUpdateAmount={onUpdateAmount}
                                    />
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </div>
            </div>
        </div>
    );
});
