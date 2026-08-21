"use client";

import React, {useState} from "react";
import {
    CashieringState, CollectionSummary, Salesman, Bank, Denomination,
    COA, CheckDetail, PaymentMethod, Customer, UnpaidInvoice, UserDto
} from "../../types";
import {
    Plus, Calculator, Receipt, ShieldCheck, Check as CheckIcon, ChevronsUpDown, Landmark,
    Wallet, AlertCircle, Trash2, Loader2, CreditCard, User as UserIcon, FileText
} from "lucide-react";
import {cn} from "@/lib/utils";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter} from "@/components/ui/sheet";
import {Popover, PopoverTrigger} from "@/components/ui/popover";
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList} from "@/components/ui/command";
import {getCheckValidationErrors} from "../hooks/useCashiering";
import {CashieringPopoverContent} from "./CashieringPopoverContent";

export default function CashieringSheet({state}: { state: CashieringState }) {
    const {
        isSheetOpen,
        setIsSheetOpen,
        salesmen,
        users, // 🚀 NEW: User list for "Collected By"
        salesmanId,
        setSalesmanId,
        collectedBy, // 🚀 NEW
        setCollectedBy, // 🚀 NEW
        crNo, // 🚀 NEW
        setCrNo, // 🚀 NEW
        banks,
        coas,
        paymentMethods,
        customers,
        customerInvoices,
        routeInvoices,
        collectionDate,
        setCollectionDate,
        remarks,
        setRemarks,
        denominations,
        handleDenomChange,
        denominationMaster,
        checks,
        addCheck,
        updateCheck,
        handlePaymentMethodSelect,
        handleCustomerSelect,
        handleInvoiceSelect,
        removeCheck,
        totalCash,
        totalChecks,
        grandTotal,
        handleSubmit,
        isSheetLoading,
        isLookupsLoading,
        isSubmitting,
        submissionError,
        editingId,
        masterList
    } = state;

    const [openSalesman, setOpenSalesman] = useState(false);
    const [openCollectedBy, setOpenCollectedBy] = useState(false); // 🚀 NEW Popover state

    // Dropdown open states
    const [openPaymentIdx, setOpenPaymentIdx] = useState<number | null>(null);
    const [openCoaIdx, setOpenCoaIdx] = useState<number | null>(null);
    const [openBankIdx, setOpenBankIdx] = useState<number | null>(null);
    const [openCustomerIdx, setOpenCustomerIdx] = useState<number | null>(null);
    const [openInvoiceIdx, setOpenInvoiceIdx] = useState<number | null>(null);
    const [popoverContainer, setPopoverContainer] = useState<HTMLDivElement | null>(null);

    const currentPouch = editingId ? masterList.find((m: CollectionSummary) => m.id === editingId) : null;
    const displayDocNo = currentPouch ? currentPouch.docNo : "AUTO-GENERATED";

    // 🚀 STRICT VALIDATION
    const checkValidationErrors = checks.map((check: CheckDetail) => getCheckValidationErrors(check));
    const hasInvalidCheckLines = checkValidationErrors.some(errors => Object.values(errors).some(Boolean));
    const firstInvalidCheck = checkValidationErrors.find(errors => Object.values(errors).some(Boolean));
    const hasInvalidDenominations = Object.values(denominations).some(quantity => !Number.isInteger(quantity) || quantity < 0);
    const isFormValid = !isSheetLoading && !isLookupsLoading && salesmanId !== "" && grandTotal > 0 && !hasInvalidDenominations && !hasInvalidCheckLines;
    const lineValidationMessage = firstInvalidCheck?.paymentMethod
        ? "Payment method required"
        : firstInvalidCheck?.coa
            ? "Asset type required"
            : firstInvalidCheck?.bank
                ? "Target Bank required"
                : firstInvalidCheck?.chequeDate
                    ? "Date on check required"
                : firstInvalidCheck?.reference
                    ? "Reference or check number required"
                    : firstInvalidCheck?.amount
                            ? "Each non-cash amount must be greater than 0.00"
                            : null;
    const validationMessage = !salesmanId
        ? "Collector required"
        : hasInvalidDenominations
            ? "Cash quantities must be non-negative whole numbers"
        : grandTotal <= 0
            ? "Pouch total must be greater than ₱0.00"
            : lineValidationMessage;

    return (
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetContent
                className="sm:max-w-[1000px] w-full p-0 flex flex-col gap-0 border-l border-border bg-background">

                <SheetHeader
                    className="p-6 bg-card border-b border-border shrink-0 flex flex-row justify-between items-center z-10 shadow-sm">
                    <div className="space-y-1.5">
                        <SheetTitle
                            className="text-2xl font-black tracking-tight flex items-center gap-2 text-foreground">
                            <ShieldCheck className="text-primary h-6 w-6"/> {editingId ? "Edit Pouch" : "Receive Pouch"}
                        </SheetTitle>
                        <SheetDescription
                            className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                            {editingId ? `Updating record for ${displayDocNo}` : "Count physical assets and encode the pouch"}
                        </SheetDescription>
                    </div>
                    <div className="text-right bg-muted/50 p-3 rounded-lg border border-border">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Total
                            Pouch Value</p>
                        <p className="text-2xl font-black text-emerald-600 dark:text-emerald-500 leading-none tracking-tighter">
                            ₱{grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}
                        </p>
                    </div>
                </SheetHeader>

                <div ref={setPopoverContainer}
                     className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-muted/10 custom-scrollbar">
                    {isSheetLoading ? (
                        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground space-y-3">
                            <Loader2 className="animate-spin h-8 w-8 text-primary"/>
                            <span className="text-sm font-bold uppercase tracking-widest">Hydrating data...</span>
                        </div>
                    ) : (
                        <>
                            {/* 🚀 RESTRUCTURED HEADER INFO */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 bg-card rounded-xl border border-border shadow-sm">

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                                        Salesman <span className="text-destructive">*</span>
                                    </label>
                                    <Popover open={openSalesman} onOpenChange={setOpenSalesman}>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" role="combobox"
                                                    className={cn("w-full h-10 justify-between text-xs font-bold bg-background", !salesmanId && "text-muted-foreground border-dashed border-primary/50")}>
                                                <span className="truncate">
                                                    {salesmanId ? salesmen.find((s: Salesman) => s.id.toString() === salesmanId)?.salesmanName : "Select Route Owner..."}
                                                </span>
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>
                                            </Button>
                                        </PopoverTrigger>
                                        <CashieringPopoverContent container={popoverContainer} className="w-[300px] p-0" align="start">
                                            <Command>
                                                <CommandInput placeholder="Type code or name..." className="text-xs"/>
                                                <CommandList className="max-h-[250px] overflow-y-auto custom-scrollbar">
                                                    <CommandEmpty>No salesman found.</CommandEmpty>
                                                    <CommandGroup>
                                                        {salesmen.map((s: Salesman) => (
                                                            <CommandItem key={s.id}
                                                                         value={`${s.salesmanCode} ${s.salesmanName}`}
                                                                         onSelect={() => {
                                                                             setSalesmanId(s.id.toString());
                                                                             setOpenSalesman(false);
                                                                         }} className="text-xs cursor-pointer">
                                                                <CheckIcon className={cn("mr-2 h-4 w-4 text-primary", salesmanId === s.id.toString() ? "opacity-100" : "opacity-0")}/>
                                                                <span className="font-mono font-bold text-muted-foreground mr-2">[{s.salesmanCode}]</span>
                                                                {s.salesmanName}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </CashieringPopoverContent>
                                    </Popover>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                                        Collected By
                                    </label>
                                    <Popover open={openCollectedBy} onOpenChange={setOpenCollectedBy}>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" role="combobox"
                                                    className={cn("w-full h-10 justify-between text-xs font-bold bg-background", !collectedBy && "text-muted-foreground")}>
                                                <span className="truncate">
                                                    {collectedBy ? users.find((u: UserDto) => u.id.toString() === collectedBy)?.name : "Select Collector..."}
                                                </span>
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>
                                            </Button>
                                        </PopoverTrigger>
                                        <CashieringPopoverContent container={popoverContainer} className="w-[300px] p-0" align="start">
                                            <Command>
                                                <CommandInput placeholder="Type name..." className="text-xs"/>
                                                <CommandList className="max-h-[250px] overflow-y-auto custom-scrollbar">
                                                    <CommandEmpty>No user found.</CommandEmpty>
                                                    <CommandGroup>
                                                        {users && users.map((u: UserDto) => (
                                                            <CommandItem key={u.id}
                                                                         value={u.name}
                                                                         onSelect={() => {
                                                                             setCollectedBy(u.id.toString());
                                                                             setOpenCollectedBy(false);
                                                                         }} className="text-xs cursor-pointer">
                                                                <CheckIcon className={cn("mr-2 h-4 w-4 text-primary", collectedBy === u.id.toString() ? "opacity-100" : "opacity-0")}/>
                                                                {u.name}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </CashieringPopoverContent>
                                    </Popover>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Collection Date</label>
                                    <Input type="date" className="h-10 text-xs font-bold bg-background"
                                           value={collectionDate} onChange={(e) => setCollectionDate(e.target.value)}/>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex justify-between">
                                        Doc No {editingId && <span className="text-primary">PREFILLED</span>}
                                    </label>
                                    <Input type="text"
                                           className={cn("h-10 text-xs font-black font-mono disabled:opacity-100", editingId ? "bg-primary/10 text-primary border-primary/30" : "bg-muted text-muted-foreground")}
                                           value={displayDocNo} disabled/>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">CR No.</label>
                                    <Input type="text"
                                           className="h-10 text-xs font-bold uppercase bg-background placeholder:text-muted-foreground/50 placeholder:font-normal placeholder:normal-case"
                                           placeholder="Collection Receipt No." value={crNo}
                                           onChange={(e) => setCrNo(e.target.value)}/>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Remarks</label>
                                    <Input type="text"
                                           className="h-10 text-xs bg-background placeholder:text-muted-foreground/50"
                                           placeholder="Optional notes..." value={remarks}
                                           onChange={(e) => setRemarks(e.target.value)}/>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                                {/* Cash Counter */}
                                <div
                                    className="bg-card rounded-xl border border-border shadow-sm overflow-hidden flex flex-col lg:col-span-4">
                                    <div
                                        className="bg-emerald-500/10 p-4 border-b border-emerald-500/20 flex justify-between items-center">
                                        <span
                                            className="text-xs font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                                            <Calculator size={16}/> Cash Counter
                                        </span>
                                        <span className="text-sm font-black tracking-tight text-foreground">
                                            ₱{totalCash.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                        </span>
                                    </div>
                                    <div className="p-4 space-y-2">
                                        {[...denominationMaster].sort((a: Denomination, b: Denomination) => b.amount - a.amount).map((denom: Denomination) => (
                                            <div key={denom.id}
                                                 className="grid grid-cols-[2fr_auto_3fr_4fr] items-center gap-2 group hover:bg-muted/30 p-1.5 rounded-md transition-colors">
                                                <span
                                                    className="text-right font-bold text-xs text-muted-foreground whitespace-nowrap">{denom.amount >= 1 ? `₱${denom.amount}` : `${denom.amount * 100}¢`}</span>
                                                <span
                                                    className="text-muted-foreground/30 text-[10px] font-black px-1">X</span>
                                                <Input type="number"
                                                       className="h-9 text-center text-xs font-bold bg-background shadow-inner w-full"
                                                       value={denominations[denom.id] || ""}
                                                       onChange={(e) => handleDenomChange(denom.id, e.target.value)}
                                                       onFocus={(e) => e.target.select()} placeholder="0" min="0"/>
                                                <span
                                                    className="text-right font-black text-sm text-foreground tracking-tight truncate">
                                                    ₱{(denom.amount * (denominations[denom.id] || 0)).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Non-Cash Assets */}
                                <div
                                    className="bg-card rounded-xl border border-border shadow-sm overflow-hidden flex flex-col lg:col-span-8">
                                    <div
                                        className="bg-blue-500/10 p-4 border-b border-blue-500/20 flex justify-between items-center">
                                        <span
                                            className="text-xs font-black uppercase tracking-widest text-blue-700 dark:text-blue-400 flex items-center gap-2">
                                            <Wallet size={16}/> Non-Cash Remittances
                                        </span>
                                        <span className="text-sm font-black tracking-tight text-foreground">
                                            ₱{totalChecks.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                        </span>
                                    </div>

                                    <div className="p-4 flex flex-col gap-4">
                                        {checks.length === 0 && (
                                            <div
                                                className="py-10 flex flex-col items-center justify-center text-center border-2 border-dashed border-border rounded-xl bg-muted/20">
                                                <Receipt className="w-10 h-10 text-muted-foreground/30 mb-3"/>
                                                <p className="text-sm font-bold text-muted-foreground">No alternate
                                                    payments added.</p>
                                                <p className="text-xs text-muted-foreground/70 mb-4">Add Checks, GCash,
                                                    EWT, or Direct Transfers here.</p>
                                            </div>
                                        )}

                                        {checks.map((check: CheckDetail, i: number) => {
                                            const availableInvoices = check.customerId ? (customerInvoices[check.customerId] || []) : routeInvoices;
                                            const lineErrors = getCheckValidationErrors(check);
                                            const isSpecialLine = check.tempId?.startsWith("adj-") || check.tempId?.startsWith("ewt-");
                                            const requiresBank = !isSpecialLine;

                                            return (
                                                <div key={check.tempId}
                                                     className="bg-background p-4 rounded-xl border border-border shadow-sm space-y-4 relative group hover:border-blue-500/30 transition-all animate-in fade-in slide-in-from-bottom-2 duration-300">

                                                    <div
                                                        className="absolute top-3 right-3 z-10 bg-background rounded-full">
                                                        <Button variant="ghost" size="icon"
                                                                onClick={() => removeCheck(i)}
                                                                className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive">
                                                            <Trash2 size={15}/>
                                                        </Button>
                                                    </div>

                                                    {/* ROW 1: Type and Bank */}
                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pr-10">
                                                        <div className="space-y-1.5 min-w-0">
                                                            <label
                                                                className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Payment
                                                                Method <span
                                                                    className="text-destructive">*</span></label>
                                                            <Popover open={openPaymentIdx === i}
                                                                     onOpenChange={(open) => setOpenPaymentIdx(open ? i : null)}>
                                                                <PopoverTrigger asChild>
                                                                    <Button variant="outline"
                                                                            aria-invalid={lineErrors.paymentMethod}
                                                                            className={cn("w-full h-8 text-[11px] justify-between px-2 font-bold", !check.paymentMethodId && "border-amber-500/50 text-amber-600 bg-amber-50 dark:bg-amber-900/10", lineErrors.paymentMethod && "border-destructive focus-visible:ring-destructive")}>
                                                                        <div
                                                                            className="flex items-center gap-1.5 truncate pr-2">
                                                                            <CreditCard size={12}
                                                                                        className={check.paymentMethodId ? "text-primary shrink-0" : "text-amber-500 shrink-0"}/>
                                                                            <span
                                                                                className="truncate">{check.paymentMethodId ? paymentMethods.find((m: PaymentMethod) => m.methodId.toString() === check.paymentMethodId)?.methodName : "Select"}</span>
                                                                        </div>
                                                                        <ChevronsUpDown
                                                                            className="ml-1 h-3 w-3 opacity-50 shrink-0"/>
                                                                    </Button>
                                                                </PopoverTrigger>
                                                                <CashieringPopoverContent container={popoverContainer} className="w-[200px] p-0" align="start">
                                                                    <Command>
                                                                        <CommandInput placeholder="Search..."
                                                                                      className="h-8 text-xs"/>
                                                                        <CommandList
                                                                            className="max-h-[250px] overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border hover:scrollbar-thumb-foreground/20 overscroll-contain">
                                                                            <CommandEmpty>No method
                                                                                found.</CommandEmpty>
                                                                            <CommandGroup>
                                                                                {paymentMethods.map((m: PaymentMethod) => (
                                                                                    <CommandItem key={m.methodId}
                                                                                                 onSelect={() => {
                                                                                                     handlePaymentMethodSelect(i, m.methodId.toString());
                                                                                                     setOpenPaymentIdx(null);
                                                                                                 }}
                                                                                                 className="text-[10px] font-bold cursor-pointer py-1.5">{m.methodName}</CommandItem>
                                                                                ))}
                                                                            </CommandGroup>
                                                                        </CommandList>
                                                                    </Command>
                                                                </CashieringPopoverContent>
                                                            </Popover>
                                                        </div>

                                                        <div className="space-y-1.5 min-w-0">
                                                            <label
                                                                className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Asset
                                                                Type <span className="text-destructive">*</span></label>
                                                            <Popover open={openCoaIdx === i}
                                                                     onOpenChange={(open) => setOpenCoaIdx(open ? i : null)}>
                                                                <PopoverTrigger asChild>
                                                                    <Button variant="outline"
                                                                             aria-invalid={lineErrors.coa}
                                                                             className={cn("w-full h-8 text-[11px] justify-between px-2 font-bold", !check.coaId && "border-amber-500/50 text-amber-600 bg-amber-50 dark:bg-amber-900/10", lineErrors.coa && "border-destructive focus-visible:ring-destructive")}>
                                                                        <div
                                                                            className="flex items-center gap-1.5 truncate pr-2">
                                                                            <Landmark size={12}
                                                                                      className={check.coaId ? "text-blue-500 shrink-0" : "text-amber-500 shrink-0"}/>
                                                                            <span
                                                                                className="truncate">{check.coaId ? coas.find((c: COA) => c.coaId?.toString() === check.coaId || c.id?.toString() === check.coaId)?.accountTitle : "Select"}</span>
                                                                        </div>
                                                                        <ChevronsUpDown
                                                                            className="ml-1 h-3 w-3 opacity-50 shrink-0"/>
                                                                    </Button>
                                                                </PopoverTrigger>
                                                                <CashieringPopoverContent container={popoverContainer} className="w-[250px] p-0" align="start">
                                                                    <Command>
                                                                        <CommandInput placeholder="Search COA..."
                                                                                      className="h-8 text-xs"/>
                                                                        <CommandList
                                                                            className="max-h-[250px] overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border hover:scrollbar-thumb-foreground/20 overscroll-contain">
                                                                            <CommandEmpty>No COA found.</CommandEmpty>
                                                                            <CommandGroup>
                                                                                {coas.map((c: COA) => (
                                                                                    <CommandItem key={c.coaId || c.id}
                                                                                                 onSelect={() => {
                                                                                                     updateCheck(i, "coaId", (c.coaId || c.id)?.toString() || "");
                                                                                                     setOpenCoaIdx(null);
                                                                                                 }}
                                                                                                 className="text-[10px] font-bold cursor-pointer py-1.5">{c.accountTitle}</CommandItem>
                                                                                ))}
                                                                            </CommandGroup>
                                                                        </CommandList>
                                                                    </Command>
                                                                </CashieringPopoverContent>
                                                            </Popover>
                                                        </div>

                                                        <div className="space-y-1.5 min-w-0">
                                                            <label
                                                                className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Bank {requiresBank && <span
                                                                className="text-destructive">*</span>}</label>
                                                            <Popover open={openBankIdx === i}
                                                                     onOpenChange={(open) => setOpenBankIdx(open ? i : null)}>
                                                                <PopoverTrigger asChild>
                                                                    <Button variant="outline"
                                                                             aria-invalid={lineErrors.bank}
                                                                             className={cn("w-full h-8 text-[11px] font-bold justify-between px-2", !check.bankId ? "border-amber-500/50 text-amber-600 bg-amber-50" : "text-muted-foreground", lineErrors.bank && "border-destructive focus-visible:ring-destructive")}>
                                                                        <span
                                                                            className="truncate pr-2">{check.bankId ? banks.find((b: Bank) => b.id.toString() === check.bankId)?.bankName : "Required"}</span>
                                                                        <ChevronsUpDown
                                                                            className="ml-1 h-3 w-3 opacity-50 shrink-0"/>
                                                                    </Button>
                                                                </PopoverTrigger>
                                                                <CashieringPopoverContent container={popoverContainer} className="w-[200px] p-0" align="start">
                                                                    <Command>
                                                                        <CommandInput placeholder="Search bank..."
                                                                                      className="h-8 text-xs"/>
                                                                        <CommandList
                                                                            className="max-h-[250px] overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border hover:scrollbar-thumb-foreground/20 overscroll-contain">
                                                                            <CommandEmpty>No bank found.</CommandEmpty>
                                                                            <CommandGroup>
                                                                                {banks.map((bank: Bank) => (
                                                                                    <CommandItem key={bank.id}
                                                                                                 onSelect={() => {
                                                                                                     updateCheck(i, "bankId", bank.id.toString());
                                                                                                     setOpenBankIdx(null);
                                                                                                 }}
                                                                                                 className="text-[10px] font-bold cursor-pointer py-1.5">{bank.bankName}</CommandItem>
                                                                                ))}
                                                                            </CommandGroup>
                                                                        </CommandList>
                                                                    </Command>
                                                                </CashieringPopoverContent>
                                                            </Popover>
                                                        </div>
                                                    </div>

                                                    {/* ROW 2: Customer and Invoice */}
                                                    <div
                                                        className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-border/40 pt-3">
                                                        <div className="space-y-1.5 min-w-0">
                                                            <label
                                                                className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Customer
                                                                Link <span
                                                                    className="text-muted-foreground/50">(Opt)</span></label>
                                                            <Popover open={openCustomerIdx === i}
                                                                     onOpenChange={(open) => setOpenCustomerIdx(open ? i : null)}>
                                                                <PopoverTrigger asChild>
                                                                    <Button variant="outline"
                                                                            className="w-full h-8 text-[11px] font-bold justify-between px-2 text-muted-foreground bg-muted/20">
                                                                        <div
                                                                            className="flex items-center gap-1.5 truncate pr-2">
                                                                            <UserIcon size={12}/>
                                                                            <span className="truncate">
                                                                            {check.customerId
                                                                                ? (customers.find((c: Customer) => c.id.toString() === check.customerId)?.customerName || customers.find((c: Customer) => c.id.toString() === check.customerId)?.name || "Unknown")
                                                                                : "Unassigned"}
                                                                        </span>
                                                                        </div>
                                                                        <ChevronsUpDown
                                                                            className="ml-1 h-3 w-3 opacity-50 shrink-0"/>
                                                                    </Button>
                                                                </PopoverTrigger>
                                                                <CashieringPopoverContent container={popoverContainer} className="w-[300px] p-0" align="start">
                                                                    <Command>
                                                                        <CommandInput placeholder="Search customer..."
                                                                                      className="h-8 text-xs"/>
                                                                        <CommandList className="max-h-[250px] overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border hover:scrollbar-thumb-foreground/20">
                                                                            <CommandEmpty>No customer
                                                                                found.</CommandEmpty>
                                                                            <CommandGroup>
                                                                                {customers.map((c: Customer) => (
                                                                                    <CommandItem key={c.id}
                                                                                                 onSelect={() => {
                                                                                                     handleCustomerSelect(i, c.id.toString());
                                                                                                     setOpenCustomerIdx(null);
                                                                                                 }}
                                                                                                 className="text-[10px] font-bold cursor-pointer py-1.5">
                                                                                        <span
                                                                                            className="text-primary mr-1">[{c.customerCode || c.code || "NO-CODE"}]</span>
                                                                                        {c.customerName || c.name || "Unknown Customer"}
                                                                                    </CommandItem>
                                                                                ))}
                                                                            </CommandGroup>
                                                                        </CommandList>
                                                                    </Command>
                                                                </CashieringPopoverContent>
                                                            </Popover>
                                                        </div>

                                                        <div className="space-y-1.5 min-w-0">
                                                            <label
                                                                className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Invoice
                                                                Link <span
                                                                    className="text-muted-foreground/50">(Opt)</span></label>
                                                            <Popover open={openInvoiceIdx === i}
                                                                     onOpenChange={(open) => setOpenInvoiceIdx(open ? i : null)}>
                                                                <PopoverTrigger asChild>
                                                                    <Button variant="outline" disabled={!salesmanId}
                                                                            className="w-full h-8 text-[11px] font-bold justify-between px-2 text-muted-foreground bg-muted/20">
                                                                        <div
                                                                            className="flex items-center gap-1.5 truncate pr-2">
                                                                            <FileText size={12}/>
                                                                            <span className="truncate">
                                                                            {check.invoiceId && availableInvoices.length > 0
                                                                                ? availableInvoices.find((inv: UnpaidInvoice) => (inv.id || inv.invoiceId)?.toString() === check.invoiceId)?.invoiceNo
                                                                                : "Unassigned"}
                                                                        </span>
                                                                        </div>
                                                                        <ChevronsUpDown
                                                                            className="ml-1 h-3 w-3 opacity-50 shrink-0"/>
                                                                    </Button>
                                                                </PopoverTrigger>
                                                                <CashieringPopoverContent container={popoverContainer} className="w-[250px] p-0" align="start">
                                                                    <Command>
                                                                        <CommandInput placeholder="Search invoice..."
                                                                                      className="h-8 text-xs"/>
                                                                        <CommandList className="max-h-[250px] overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border hover:scrollbar-thumb-foreground/20">
                                                                            <CommandEmpty>No unpaid invoices
                                                                                available.</CommandEmpty>
                                                                            <CommandGroup>
                                                                                {availableInvoices.map((inv: UnpaidInvoice) => {
                                                                                    const actualInvoiceId = inv.id || inv.invoiceId;
                                                                                    return (
                                                                                        <CommandItem
                                                                                            key={actualInvoiceId}
                                                                                            value={inv.invoiceNo}
                                                                                            onSelect={() => {
                                                                                                handleInvoiceSelect(i, actualInvoiceId!.toString());
                                                                                                setOpenInvoiceIdx(null);
                                                                                            }}
                                                                                            className="text-[10px] font-bold cursor-pointer py-1.5 flex justify-between"
                                                                                        >
                                                                                            <span>{inv.invoiceNo}</span>
                                                                                            <span
                                                                                                className="text-orange-600">₱{inv.remainingBalance.toLocaleString()}</span>
                                                                                        </CommandItem>
                                                                                    );
                                                                                })}
                                                                            </CommandGroup>
                                                                        </CommandList>
                                                                    </Command>
                                                                </CashieringPopoverContent>
                                                            </Popover>
                                                        </div>
                                                    </div>

                                                    {/* ROW 3: Details */}
                                                    <div
                                                        className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-border/40 pt-3 bg-muted/5 -mx-4 px-4 pb-1 rounded-b-xl">
                                                        <div className="space-y-1.5">
                                                            <label
                                                                className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Ref
                                                                / Check No <span
                                                                    className="text-destructive">*</span></label>
                                                            <Input
                                                                aria-invalid={lineErrors.reference}
                                                                className={cn("h-8 text-xs font-bold placeholder:font-normal bg-background", lineErrors.reference && "border-destructive focus-visible:ring-destructive")}
                                                                placeholder="00001234" value={check.checkNo}
                                                                onChange={(e) => updateCheck(i, "checkNo", e.target.value)}/>
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <label
                                                                 className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Date
                                                                 on Check <span className="text-destructive">*</span></label>
                                                             <Input type="date"
                                                                    aria-invalid={lineErrors.chequeDate}
                                                                    className={cn("h-8 text-[10px] font-bold text-muted-foreground uppercase bg-background", lineErrors.chequeDate && "border-destructive focus-visible:ring-destructive")}
                                                                    value={check.chequeDate}
                                                                    onChange={(e) => updateCheck(i, "chequeDate", e.target.value)}/>
                                                             {lineErrors.chequeDate && (
                                                                 <p className="text-[10px] font-bold text-destructive" role="alert">
                                                                     Date on check is required.
                                                                 </p>
                                                             )}
                                                         </div>
                                                        <div className="space-y-1.5">
                                                            <label
                                                                className="text-[9px] font-black text-primary uppercase tracking-widest block">Amount <span
                                                                className="text-destructive">*</span></label>
                                                            <div className="relative">
                                                                <span
                                                                    className="absolute left-2.5 top-2 text-[10px] font-black text-muted-foreground">₱</span>
                                                                <Input
                                                                    type="number" min="0.01" step="0.01"
                                                                    aria-invalid={lineErrors.amount}
                                                                    className={cn("h-8 pl-6 text-xs font-black text-right text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10 border-blue-200/60 shadow-inner", lineErrors.amount && "border-destructive focus-visible:ring-destructive")}
                                                                    placeholder="0.00" value={check.amount}
                                                                    onChange={(e) => updateCheck(i, "amount", e.target.value)}
                                                                />
                                                            </div>
                                                            {lineErrors.amount && (
                                                                <p className="text-[10px] font-bold text-destructive" role="alert">
                                                                    {check.amount.trim() ? "Amount must be greater than ₱0.00." : "Amount is required."}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        <Button variant="outline" size="sm" onClick={addCheck}
                                                className="w-full text-[11px] font-black uppercase tracking-widest h-10 border-dashed border-primary/40 text-primary hover:bg-primary/10 mt-2">
                                            <Plus size={14} className="mr-2"/> Add Asset Line
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <SheetFooter
                    className="p-4 sm:p-5 bg-card border-t border-border shrink-0 flex flex-col sm:flex-row justify-between items-center gap-4 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                    <div className="flex items-center w-full sm:w-auto">
                        {submissionError && (
                            <span
                                className="flex items-center justify-center w-full sm:w-auto gap-1.5 text-[11px] font-bold text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-md"
                                role="alert"
                            >
                                <AlertCircle size={14}/> {submissionError}
                            </span>
                        )}
                        {!isFormValid && !isSheetLoading && (
                            <span
                                className="flex items-center justify-center w-full sm:w-auto gap-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-md">
                                <AlertCircle size={14}/> {lineValidationMessage || validationMessage}
                            </span>
                        )}
                    </div>
                    <div className="flex gap-3 w-full sm:w-auto">
                        <Button variant="ghost" onClick={() => setIsSheetOpen(false)}
                                className="flex-1 sm:flex-none text-xs font-bold uppercase tracking-wider h-10">Cancel</Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !isFormValid}
                            className="flex-1 sm:flex-none px-8 text-xs font-black uppercase tracking-widest shadow-md transition-all active:scale-95 h-10"
                        >
                            {isSubmitting ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Processing...</>
                            ) : (
                                editingId ? "Update Pouch" : "Secure Pouch"
                            )}
                        </Button>
                    </div>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
