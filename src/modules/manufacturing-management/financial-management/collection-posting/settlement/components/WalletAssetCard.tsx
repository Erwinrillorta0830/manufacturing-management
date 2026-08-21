"use client";

import React from "react";
import { X, Check, Edit2, Layers, ChevronsUpDown, Save, Trash2, User, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { WalletItem, GeneralFinding } from "../hooks/useSettlement";
import { UnpaidInvoice } from "../../types";
import { getSourceAllocationCapacity } from "../utils/settlement-balance";

export interface WalletAssetCardProps {
    item: WalletItem;
    getUsedAmount: (id: string) => number;
    editingId: string | null;
    setEditingId: (id: string | null) => void;
    editAmt: string;
    setEditAmt: (val: string) => void;
    editRef: string;
    setEditRef: (val: string) => void;
    editBalType: number;
    setEditBalType: (val: number) => void;
    editCoaId: number | "";
    setEditCoaId: (val: number | "") => void;
    editFId: number | "";
    setEditFId: (val: number | "") => void;
    editCoaOpen: boolean;
    setEditCoaOpen: (val: boolean) => void;
    editAccountOpen: boolean;
    setEditAccountOpen: (val: boolean) => void;
    uniqueCategories: { id: number; title: string }[];
    editFilteredFindings: GeneralFinding[];
    findings: GeneralFinding[];
    editWalletItem: (id: string, updates: Partial<WalletItem>) => void;
    deleteWalletItem: (id: string, type: string) => void;
    isPosted: boolean;
    cartInvoices: UnpaidInvoice[];
}

export default function WalletAssetCard({
                                            item, getUsedAmount, editingId, setEditingId, editAmt, setEditAmt,
                                            editRef, setEditRef, editBalType, setEditBalType, editCoaId, setEditCoaId,
                                            editFId, setEditFId, editCoaOpen, setEditCoaOpen, editAccountOpen, setEditAccountOpen,
                                            uniqueCategories, editFilteredFindings, findings, editWalletItem, deleteWalletItem, isPosted, cartInvoices
                                        }: WalletAssetCardProps) {

    const used = item.originalAmount > 0 ? getUsedAmount(item.id) : 0;
    const remaining = getSourceAllocationCapacity(item.originalAmount, used);
    const isExhausted = item.originalAmount > 0 && remaining <= 0;

    let borderLeft = "border-l-emerald-500";
    let badgeColor: "default" | "secondary" | "destructive" | "outline" = "default";

    if (item.type === "CHECK") { borderLeft = "border-l-blue-500"; badgeColor = "secondary"; }
    if (item.type === "MEMO") { borderLeft = "border-l-purple-500"; badgeColor = "outline"; }
    if (item.type === "RETURN") { borderLeft = "border-l-orange-500"; badgeColor = "destructive"; }
    if (item.type === "EWT") { borderLeft = "border-l-teal-500"; badgeColor = "secondary"; }
    if (item.type === "ADJUSTMENT") {
        borderLeft = item.balanceTypeId === 1 ? "border-l-red-500 border-dashed" : "border-l-purple-400 border-dashed";
        badgeColor = item.balanceTypeId === 1 ? "destructive" : "outline";
    }

    if (editingId === item.id) {
        return (
            <div className="p-2 rounded-md border shadow-md bg-card border-primary/40 space-y-2 animate-in fade-in zoom-in-95 duration-200 relative overflow-hidden">
                <div className="flex justify-between items-center pb-1.5 border-b border-border/50">
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1.5"><Edit2 size={10}/> Edit {item.type}</span>
                    <Button variant="ghost" size="icon" className="h-4 w-4 text-muted-foreground hover:text-foreground hover:bg-muted" onClick={() => setEditingId(null)}><X size={10}/></Button>
                </div>

                <div className="space-y-1.5">
                    {item.type === "ADJUSTMENT" && (
                        <>
                            <div className="flex gap-1.5">
                                <Button size="sm" variant={editBalType === 2 ? "default" : "outline"} onClick={() => setEditBalType(2)} className={`h-6 w-1/2 text-[9px] px-1 font-black tracking-widest uppercase ${editBalType === 2 ? 'bg-purple-600 text-white' : 'text-muted-foreground'}`}>Shortage (Cr)</Button>
                                <Button size="sm" variant={editBalType === 1 ? "default" : "outline"} onClick={() => setEditBalType(1)} className={`h-6 w-1/2 text-[9px] px-1 font-black tracking-widest uppercase ${editBalType === 1 ? 'bg-red-600 text-white' : 'text-muted-foreground'}`}>Overage (Dr)</Button>
                            </div>
                            <Popover open={editCoaOpen} onOpenChange={setEditCoaOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" role="combobox" className={cn("w-full h-7 px-2 justify-between text-[10px] font-bold bg-muted/30", !editCoaId && "text-muted-foreground border-dashed")}>
                                        <span className="truncate flex items-center gap-1.5"><Layers size={12}/>{editCoaId ? uniqueCategories.find((c) => c.id === editCoaId)?.title : "Select Category..."}</span>
                                        <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50"/>
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[260px] p-0 shadow-xl" align="start">
                                    <Command>
                                        <CommandInput placeholder="Search category..." className="text-xs h-7"/>
                                        <CommandList className="max-h-[200px] overflow-y-auto scrollbar-thin" onWheelCapture={(e) => e.stopPropagation()}>
                                            <CommandEmpty className="py-2 text-xs text-center">No categories found.</CommandEmpty>
                                            <CommandGroup>
                                                {uniqueCategories.map((coa) => (
                                                    <CommandItem key={coa.id} value={coa.title} onSelect={() => { setEditCoaId(coa.id); setEditFId(""); setEditCoaOpen(false); }} className="text-[11px] cursor-pointer py-1">
                                                        <Check className={cn("mr-1.5 h-3 w-3 text-primary", editCoaId === coa.id ? "opacity-100" : "opacity-0")}/>{coa.title}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>

                            <Popover open={editAccountOpen} onOpenChange={setEditAccountOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" role="combobox" disabled={!editCoaId} className={cn("w-full h-7 px-2 justify-between text-[10px] font-bold bg-muted/30", !editFId && "text-muted-foreground border-dashed")}>
                                        <span className="truncate">{editFId ? editFilteredFindings.find((f) => f.id === editFId)?.findingName : "Select specific reason..."}</span>
                                        <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50"/>
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[260px] p-0 shadow-xl" align="start">
                                    <Command>
                                        <CommandInput placeholder="Search reason..." className="text-xs h-7"/>
                                        <CommandList className="max-h-[200px] overflow-y-auto scrollbar-thin" onWheelCapture={(e) => e.stopPropagation()}>
                                            <CommandEmpty className="py-2 text-xs text-center">No account found.</CommandEmpty>
                                            <CommandGroup>
                                                {editFilteredFindings.map((f) => (
                                                    <CommandItem key={f.id} value={f.findingName} onSelect={() => { setEditFId(f.id); setEditAccountOpen(false); }} className="text-[11px] cursor-pointer py-1">
                                                        <Check className={cn("mr-1.5 h-3 w-3 text-primary", editFId === f.id ? "opacity-100" : "opacity-0")}/>{f.findingName}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </>
                    )}
                    <div className="relative">
                        <span className="absolute left-2 top-1.5 text-[9px] font-black text-muted-foreground">₱</span>
                        <Input type="number" value={editAmt} onChange={e => setEditAmt(e.target.value)} placeholder="0.00" className="h-7 pl-5 text-xs font-mono font-black shadow-inner bg-muted/20"/>
                    </div>
                    <Input value={editRef} onChange={e => setEditRef(e.target.value.toUpperCase())} placeholder={item.type === "EWT" ? "Form 2307 Ref" : "Remarks"} className="h-7 text-xs bg-muted/20 shadow-inner px-2"/>
                </div>

                <Button size="sm" className="w-full h-7 text-[9px] font-black tracking-widest uppercase bg-primary text-white mt-0.5 shadow-md active:scale-95"
                        onClick={() => {
                            const numAmt = parseFloat(editAmt);
                            if (isNaN(numAmt) || numAmt <= 0) return toast.error("Please enter a valid amount greater than 0.");
                            if (item.type === "ADJUSTMENT" && !editFId) return toast.error("Please select a specific reason.");

                            const label = item.type === "EWT" ? `Form 2307: ${editRef}` : (findings.find((f) => f.id === editFId)?.findingName || "Adjustment");
                            editWalletItem(item.id, { originalAmount: numAmt, customerName: editRef, findingId: item.type === "ADJUSTMENT" ? Number(editFId) : undefined, balanceTypeId: item.type === "ADJUSTMENT" ? editBalType : 2, label });
                            setEditingId(null);
                        }}>
                    <Save size={10} className="mr-1.5"/> Confirm
                </Button>
            </div>
        );
    }

    return (
        <div className={`p-2 rounded-md border shadow-sm transition-all group ${isExhausted ? 'bg-muted/30 border-dashed opacity-60' : `bg-background border-border border-l-[3px] ${borderLeft}`}`}>
            <div className="flex justify-between items-start mb-1">
                <span className={`text-[10px] font-black uppercase tracking-widest truncate pr-2 leading-tight ${item.type === 'ADJUSTMENT' ? (item.balanceTypeId === 1 ? 'text-red-700' : 'text-purple-700') : ''}`}>{item.label}</span>
                <div className="flex items-center gap-0.5 shrink-0">
                    <Badge variant={badgeColor} className={`text-[7px] uppercase px-1 py-0 h-3.5 leading-none ${item.type === 'ADJUSTMENT' && item.balanceTypeId === 2 ? 'border-purple-200 text-purple-700 bg-purple-50' : (item.type === 'EWT' ? 'border-teal-200 text-teal-700 bg-teal-50' : '')}`}>{item.type}</Badge>
                    {!isPosted && (item.type === "ADJUSTMENT" || item.type === "EWT") && (
                        <div className="flex items-center ml-0.5 border-l border-border/50 pl-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => {
                                setEditingId(item.id); setEditAmt(item.originalAmount.toString()); setEditRef(item.customerName || "");
                                const matchedFinding = findings?.find((f) => f.id === item.findingId || f.findingName === item.label);
                                const cId = matchedFinding?.chartOfAccount?.coaId || matchedFinding?.chartOfAccount?.id;
                                setEditCoaId(cId || ""); setEditFId(matchedFinding?.id || item.findingId || ""); setEditBalType(item.balanceTypeId || 2);
                            }} className="text-muted-foreground hover:text-blue-500 transition-colors p-0.5" title="Edit Item"><Edit2 size={10}/></button>
                            <button onClick={() => deleteWalletItem(item.id, item.type)} className="text-muted-foreground hover:text-destructive transition-colors p-0.5" title="Remove Item"><Trash2 size={10}/></button>
                        </div>
                    )}
                </div>
            </div>

            {(item.customerName || item.invoiceId) && (
                <div className="bg-muted/40 rounded px-1.5 py-1 mb-1.5 flex flex-col gap-0.5 border border-border/50">
                    {item.customerName && (
                        <div className="flex items-center gap-1.5 text-[8px] font-bold text-muted-foreground truncate" title={item.customerName}>
                            <User size={8} className="shrink-0"/> {item.customerName}
                        </div>
                    )}
                    {item.invoiceId && (
                        <div className="flex items-center gap-1.5 text-[8px] font-black text-blue-600 dark:text-blue-400 truncate" title="Pre-linked Invoice">
                            <Receipt size={8} className="shrink-0"/>
                            {cartInvoices.find(inv => inv.id === item.invoiceId)?.invoiceNo || `Invoice ID: ${item.invoiceId}`}
                        </div>
                    )}
                </div>
            )}

            <div className={`flex justify-between gap-2 text-[10px] ${item.customerName || item.invoiceId ? 'mt-1 border-t border-border/50 pt-1' : 'mt-1.5'}`}>
                <div className="min-w-0 flex-1"><p className="text-[7px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-0.5">Original</p><p className="font-mono truncate leading-none">₱{item.originalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</p></div>
                <div className="text-right min-w-0 flex-1"><p className="text-[7px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-0.5">Remaining</p><p className={`font-mono font-black truncate leading-none ${isExhausted ? 'text-muted-foreground' : (item.balanceTypeId === 1 ? 'text-red-600' : 'text-emerald-600')}`}>₱{remaining.toLocaleString(undefined, {minimumFractionDigits: 2})}</p></div>
            </div>
        </div>
    );
}
