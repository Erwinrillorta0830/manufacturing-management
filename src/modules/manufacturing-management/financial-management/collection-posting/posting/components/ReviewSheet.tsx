import React, { useMemo, useState } from "react";
import {

    Lock, Loader2, Wallet, Receipt, Calculator, User,
    Calendar, Briefcase, MapPin, MessageSquare, ShieldAlert, CheckCircle2,
    Banknote, Percent, Undo2, FileSignature, Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CompanyProfileHeader } from "./CompanyProfileHeader";
import type { CompanyProfile, CompanyProfileStatus } from "../hooks/usePosting";

const POSTING_BALANCE_TOLERANCE = 0.01;

export interface CashBucket {
    detailId?: number;
    tempId?: string;
    paymentMethodId?: number;
    coaId?: number;
    bankId?: number | null;
    bankName?: string | null;
    customerCode?: string;
    invoiceId?: number;
    referenceNo?: string;
    amount?: number;
    chequeDate?: string | null;
    quantity?: number;
    findingId?: number;
    balanceTypeId?: number;
    resolvedType?: string;
}

export interface PouchAllocation {
    amountApplied?: number;
    allocationType?: string;
    customerName?: string;
    invoiceNo?: string;
    invoiceId?: string | number;
    referenceNo?: string;
    sourceTempId?: string;
    grossAmount?: number;
    originalAmount?: number;
    remainingBalance?: number;
}

interface InvoiceReviewRow {
    invoiceId: string;
    invoiceNo?: string;
    customerName: string;
    grossAmount?: number;
    originalAmount?: number;
    prePouchRemainingBalance?: number;
    appliedAmount: number;
    remainingOpenBalance: number | null;
    allocations: PouchAllocation[];
}

const formatMoney = (value?: number | null) => `₱${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
})}`;

const formatOptionalMoney = (value?: number) => value == null ? "—" : formatMoney(value);

const finiteNonNegative = (value?: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.max(value, 0) : undefined;

export interface TreasuryPouch {
    id: number;
    docNo?: string;
    collectionDate?: string;
    salesmanName?: string;
    salesmanId?: string | number;
    operationName?: string;
    encoderName?: string;
    encoderId?: string | number;
    remarks?: string;
    cashBuckets?: CashBucket[];
    allocations?: PouchAllocation[];
}

interface ReviewSheetProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    isLoading: boolean;
    pouch: TreasuryPouch | null;
    isPosting: boolean;
    onPost: (id: number, docNo: string) => void;
    error?: string | null;
    companyProfile: CompanyProfile | null;
    companyProfileStatus: CompanyProfileStatus;
}

export function ReviewSheet({
    isOpen,
    onOpenChange,
    isLoading,
    pouch,
    isPosting,
    onPost,
    error,
    companyProfile,
    companyProfileStatus,
}: ReviewSheetProps) {
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmInput, setConfirmInput] = useState("");

    const reviewMath = useMemo(() => {
        if (!pouch) return { physical: 0, applied: 0, variance: 0, isShortage: false, isOverage: false, invoiceRows: [] as InvoiceReviewRow[], unallocatedInvoices: [] as InvoiceReviewRow[], totalRemainingOpenBalance: 0, totalCash: 0, totalChecks: 0, nonCashBuckets: [] as CashBucket[], cashDenominations: [] as CashBucket[], totalCredits: 0, expectedPhysicalCash: 0 };

        let physical = 0;
        let totalCash = 0;
        let totalChecks = 0;
        const nonCashBuckets: CashBucket[] = [];
        const cashDenominations: CashBucket[] = [];

        pouch.cashBuckets?.forEach((b) => {
            const amt = Math.abs(b.amount || 0);
            const tempId = String(b.tempId || "").toLowerCase();
            const refNo = String(b.referenceNo || "").toLowerCase();

            let typeLabel = "ADJUSTMENT";

            // 1. CASH (Method ID 1 or COA 1)
            const isCash = b.coaId === 1 || b.paymentMethodId === 1 || tempId.startsWith("cash") || refNo.includes(" x ") || refNo === "cash_summary" || refNo === "physical cash";

            if (isCash) {
                typeLabel = "CASH";
            }
            // 2. CHECK (Method ID 2)
            else if (tempId.startsWith("chk") || b.paymentMethodId === 2) {
                typeLabel = "CHECK";
            }
            // 3. EWT (Method ID 10)
            else if (tempId.startsWith("ewt") || b.paymentMethodId === 10) {
                typeLabel = "EWT";
            }
            // 4. OTHER METHODS
            else if (b.paymentMethodId != null) {
                typeLabel = `METHOD_${b.paymentMethodId}`;
            }

            const isCredit = b.balanceTypeId === 1;

            if (isCredit) {
                physical -= amt;
            } else {
                physical += amt;
            }

            if (typeLabel === "CASH") {
                if (isCredit) totalCash -= amt;
                else totalCash += amt;

                if (refNo !== "cash_summary" && amt > 0) {
                    cashDenominations.push(b);
                }
            } else {
                if (typeLabel === "CHECK" && !isCredit) totalChecks += amt;
                nonCashBuckets.push({ ...b, resolvedType: typeLabel });
            }
        });

        cashDenominations.sort((a, b) => (b.amount || 0) - (a.amount || 0));

        let totalApplied = 0;
        let expectedPhysicalCash = 0;
        let totalCredits = 0;
        const invoiceRowsById = new Map<string, InvoiceReviewRow>();

        pouch.allocations?.forEach((a) => {
            const amt = Math.abs(a.amountApplied || 0);
            totalApplied += amt;

            const typeStr = String(a.allocationType || "PAYMENT").toUpperCase();

            // Separate pure credits/taxes from expected physical collections
            const isCreditOrReturn = typeStr.includes("MEMO") || typeStr.includes("CM") || typeStr.includes("DM") || typeStr.includes("RETURN") || typeStr.includes("RTN");
            const isTax = typeStr.includes("EWT") || typeStr.includes("TAX");

            if (isCreditOrReturn) {
                totalCredits += amt;
            } else if (!isTax) {
                expectedPhysicalCash += amt;
            }

            const invoiceKey = a.invoiceId != null
                ? `id:${a.invoiceId}`
                : `invoice:${a.invoiceNo || a.sourceTempId || a.referenceNo || "unknown"}`;
            const existing = invoiceRowsById.get(invoiceKey);

            if (existing) {
                existing.appliedAmount += amt;
                existing.allocations.push(a);
                existing.invoiceNo = existing.invoiceNo || a.invoiceNo;
                existing.customerName = existing.customerName || a.customerName || "No Assigned Customer";
                existing.grossAmount ??= finiteNonNegative(a.grossAmount);
                existing.originalAmount ??= finiteNonNegative(a.originalAmount);
                existing.prePouchRemainingBalance ??= finiteNonNegative(a.remainingBalance);
            } else {
                invoiceRowsById.set(invoiceKey, {
                    invoiceId: String(a.invoiceId ?? a.invoiceNo ?? a.sourceTempId ?? "unknown"),
                    invoiceNo: a.invoiceNo,
                    customerName: a.customerName || "No Assigned Customer",
                    grossAmount: finiteNonNegative(a.grossAmount),
                    originalAmount: finiteNonNegative(a.originalAmount),
                    prePouchRemainingBalance: finiteNonNegative(a.remainingBalance),
                    appliedAmount: amt,
                    remainingOpenBalance: null,
                    allocations: [a],
                });
            }
        });

        const invoiceRows = Array.from(invoiceRowsById.values()).map((row) => ({
            ...row,
            remainingOpenBalance: row.prePouchRemainingBalance == null
                ? null
                : Math.max(row.prePouchRemainingBalance - row.appliedAmount, 0),
        }));
        const totalRemainingOpenBalance = invoiceRows.reduce(
            (sum, row) => sum + (row.remainingOpenBalance ?? 0),
            0
        );
        const unallocatedInvoices = invoiceRows.filter(
            (row) => (row.remainingOpenBalance ?? 0) > POSTING_BALANCE_TOLERANCE
        );

        const variance = expectedPhysicalCash - physical;

        return {
            physical, totalCash, totalChecks, nonCashBuckets, cashDenominations,
            applied: totalApplied,
            expectedPhysicalCash,
            totalCredits,
            invoiceRows,
            unallocatedInvoices,
            totalRemainingOpenBalance,
            variance: Math.abs(variance),
            isShortage: variance > POSTING_BALANCE_TOLERANCE,
            isOverage: variance < -POSTING_BALANCE_TOLERANCE,
        };
    }, [pouch]);

    const hasAllocations = (pouch?.allocations?.length ?? 0) > 0;
    const canPost = !isPosting && hasAllocations && reviewMath.unallocatedInvoices.length === 0;

    return (
        <Sheet open={isOpen} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:max-w-[800px] xl:max-w-[1000px] overflow-hidden border-l-border shadow-2xl flex flex-col p-0">

                <SheetHeader className="sr-only">
                    <SheetTitle>Treasury Pouch Review</SheetTitle>
                    <SheetDescription>Detailed audit breakdown of the selected treasury pouch.</SheetDescription>
                </SheetHeader>

                {isLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-4">
                        <Loader2 size={32} className="animate-spin text-primary/50" />
                        <p className="font-black uppercase tracking-widest text-xs">Extracting Complete Pouch Audit...</p>
                    </div>
                ) : error ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
                        <ShieldAlert size={36} className="text-destructive" />
                        <p className="font-black uppercase tracking-widest text-xs text-destructive">Pouch details unavailable</p>
                        <p className="max-w-md text-sm text-muted-foreground">{error}</p>
                    </div>
                ) : pouch ? (
                    <>
                        <div className="min-h-0 flex-1 overflow-y-auto">
                        <div className="bg-card border-b p-6 shrink-0 shadow-sm z-10 space-y-6">
                            <CompanyProfileHeader profile={companyProfile} status={companyProfileStatus} />

                            <div className="flex justify-between items-start">
                                <div>
                                    <h2 className="text-3xl font-black font-mono text-primary flex items-center gap-3">
                                        {pouch.docNo}
                                        {reviewMath.isShortage && <Badge variant="destructive" className="bg-red-600 text-xs tracking-widest px-2.5 py-1 uppercase shadow-sm"><ShieldAlert size={14} className="mr-1.5"/> AUDIT PENDING</Badge>}
                                        {!reviewMath.isShortage && !reviewMath.isOverage && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs tracking-widest px-2.5 py-1 uppercase shadow-sm"><CheckCircle2 size={14} className="mr-1.5"/> BALANCED</Badge>}
                                    </h2>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Collection Date</p>
                                    <Badge variant="outline" className="text-sm font-mono font-black py-1 px-3 bg-muted/50">
                                        <Calendar size={14} className="mr-2" />
                                        {pouch.collectionDate?.split('T')[0] || "N/A"}
                                    </Badge>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-3 bg-muted/30 border border-border rounded-xl">
                                    <p className="text-[9px] font-black uppercase text-muted-foreground flex items-center gap-1.5 mb-1"><MapPin size={10}/> Route Owner</p>
                                    <p className="font-black text-sm uppercase text-foreground leading-tight">{pouch.salesmanName || pouch.salesmanId || "Unknown Route"}</p>
                                </div>
                                <div className="p-3 bg-muted/30 border border-border rounded-xl">
                                    <p className="text-[9px] font-black uppercase text-muted-foreground flex items-center gap-1.5 mb-1"><Briefcase size={10}/> Operation Type</p>
                                    <p className="font-black text-sm uppercase text-foreground leading-tight">{pouch.operationName || "Unassigned Operation"}</p>
                                </div>
                                <div className="p-3 bg-muted/30 border border-border rounded-xl">
                                    <p className="text-[9px] font-black uppercase text-muted-foreground flex items-center gap-1.5 mb-1"><User size={10}/> Cashier / Encoder</p>
                                    <p className="font-black text-sm uppercase text-foreground leading-tight">{pouch.encoderName || pouch.encoderId || "System Admin"}</p>
                                </div>
                            </div>

                            {pouch.remarks && (
                                <div className="p-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 rounded-xl flex gap-3 items-start">
                                    <MessageSquare size={16} className="text-amber-600 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-[10px] font-black uppercase text-amber-800 tracking-widest mb-0.5">Cashier Remarks</p>
                                        <p className="text-xs font-bold text-amber-900/80 italic">{pouch.remarks}</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-6 space-y-8 bg-muted/10">

                            <div className={`p-6 rounded-xl border-2 shadow-md flex justify-between items-center ${reviewMath.isShortage ? 'bg-red-50/80 border-red-200' : (reviewMath.isOverage ? 'bg-orange-50/80 border-orange-200' : 'bg-emerald-50/80 border-emerald-200')}`}>
                                <div className="flex items-center gap-5">
                                    <div className={`p-4 rounded-xl shadow-inner ${reviewMath.isShortage ? 'bg-red-100 text-red-600' : (reviewMath.isOverage ? 'bg-orange-100 text-orange-600' : 'bg-emerald-100 text-emerald-600')}`}>
                                        <Calculator size={28} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className={`text-xs font-black uppercase tracking-widest ${reviewMath.isShortage ? 'text-red-700' : (reviewMath.isOverage ? 'text-orange-700' : 'text-emerald-700')}`}>
                                            {reviewMath.isShortage ? "Detected Cash Shortage" : (reviewMath.isOverage ? "Detected Unallocated Overage" : "Pouch is Perfectly Balanced")}
                                        </span>
                                        <span className={`text-3xl font-black font-mono tracking-tight ${reviewMath.isShortage ? 'text-red-600' : (reviewMath.isOverage ? 'text-orange-600' : 'text-emerald-600')}`}>
                                            ₱{reviewMath.variance.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                        </span>
                                    </div>
                                </div>
                                {reviewMath.isShortage && (
                                    <div className="text-[10px] font-bold text-red-700 bg-red-100/50 p-3 rounded-lg border border-red-200 max-w-[200px] leading-relaxed shadow-sm">
                                        <ShieldAlert size={14} className="mb-1 text-red-600" />
                                        Posting this pouch will immediately trigger a payroll deduction finding for <span className="uppercase">{pouch.salesmanName || "the route owner"}</span>.
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* SECTION 1: PHYSICAL FUNDS */}
                                <div className="space-y-4">
                                    <div className="flex justify-between items-end border-b-2 border-emerald-100 pb-2">
                                        <h4 className="text-xs font-black uppercase tracking-widest text-emerald-600 flex items-center gap-2">
                                            <Wallet size={16} /> 1. Declared Physical Assets
                                        </h4>
                                        <div className="text-[9px] font-bold text-muted-foreground uppercase flex gap-3 text-right">
                                            <span>Cash: <span className="text-foreground">₱{Math.abs(reviewMath.totalCash).toLocaleString(undefined, {minimumFractionDigits:2})}</span></span>
                                            <span>Checks: <span className="text-foreground">₱{reviewMath.totalChecks.toLocaleString(undefined, {minimumFractionDigits:2})}</span></span>
                                        </div>
                                    </div>

                                    <div className="space-y-2.5">
                                        {pouch.cashBuckets?.length === 0 && <p className="text-xs text-muted-foreground italic bg-card p-4 rounded-xl border border-dashed text-center font-bold">No assets declared in this pouch.</p>}

                                        {reviewMath.totalCash !== 0 && (
                                            <div className={`relative group cursor-help flex justify-between items-center p-3.5 rounded-xl border bg-card shadow-sm transition-all hover:shadow-md hover:border-emerald-300 ${reviewMath.totalCash < 0 ? 'border-red-200' : 'border-border'}`}>
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 hidden group-hover:block w-56 bg-popover border border-border shadow-2xl rounded-xl p-4 z-50 animate-in fade-in zoom-in-95">
                                                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 border-8 border-transparent border-t-popover drop-shadow-sm"></div>
                                                    <h5 className="text-[9px] font-black uppercase text-muted-foreground tracking-widest border-b border-border pb-1.5 mb-2.5">Denomination Breakdown</h5>
                                                    <div className="space-y-1.5 max-h-[200px] overflow-y-auto scrollbar-thin">
                                                        {reviewMath.cashDenominations.length === 0 ? (
                                                            <p className="text-[10px] text-muted-foreground italic text-center">No breakdown saved.</p>
                                                        ) : reviewMath.cashDenominations.map((denom, idx) => {
                                                            const parts = denom.referenceNo?.split('x') || [];
                                                            const faceValue = parts[0]?.trim() || "Cash";
                                                            const qty = denom.quantity || parts[1]?.trim() || "?";
                                                            const isCred = denom.balanceTypeId === 1;

                                                            return (
                                                                <div key={idx} className="flex justify-between items-center text-xs">
                                                                    <div className="flex gap-2 items-baseline">
                                                                        <span className={`font-bold ${isCred ? 'text-red-500' : 'text-foreground'}`}>{faceValue}</span>
                                                                        <span className="text-[9px] font-black text-muted-foreground/60">x{qty}</span>
                                                                    </div>
                                                                    <span className={`font-mono font-bold ${isCred ? 'text-red-600' : 'text-emerald-600'}`}>
                                                                        {isCred ? "-" : ""}₱{Math.abs(denom.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    <div className="flex justify-between items-center mt-2.5 pt-2 border-t border-border">
                                                        <span className="text-[9px] font-black uppercase text-muted-foreground">Net Cash</span>
                                                        <span className={`font-mono font-black text-sm ${reviewMath.totalCash < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                            {reviewMath.totalCash < 0 ? "-" : ""}₱{Math.abs(reviewMath.totalCash).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col">
                                                    <span className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
                                                        Physical Cash (Merged) <Info size={12} className="text-muted-foreground opacity-50 ml-1" />
                                                    </span>
                                                    <span className="text-[9px] font-bold text-muted-foreground uppercase mt-0.5 flex flex-wrap gap-2">
                                                        <span>Type: CASH</span>
                                                        <span>• Hover for Breakdown</span>
                                                    </span>
                                                </div>
                                                <span className={`font-mono font-black text-base ${reviewMath.totalCash < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                    {reviewMath.totalCash < 0 ? "-" : ""}₱{Math.abs(reviewMath.totalCash).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                                </span>
                                            </div>
                                        )}

                                        {reviewMath.nonCashBuckets.map((b, i) => {
                                            const isCredit = b.balanceTypeId === 1;
                                            const typeLabel = b.resolvedType || "ADJUSTMENT";
                                            const isCheck = typeLabel === "CHECK";
                                            const bankLabel = b.bankName || (b.bankId != null ? "Unknown Bank" : null);

                                            return (
                                                <div key={i} className={`flex justify-between items-center p-3.5 rounded-xl border bg-card shadow-sm transition-all hover:shadow-md ${isCredit ? 'border-red-200' : 'border-border'}`}>
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
                                                            {b.referenceNo || typeLabel}
                                                        </span>
                                                        <span className="text-[9px] font-bold text-muted-foreground uppercase mt-0.5 flex flex-wrap gap-2">
                                                            <span className={isCredit ? "text-red-600 font-black" : ""}>Type: {typeLabel}</span>
                                                            {isCheck && (
                                                                <>
                                                                    {bankLabel && <span>• Bank: <span className="text-foreground">{bankLabel}</span></span>}
                                                                    {b.referenceNo && <span>• Ref/Chk#: <span className="text-foreground">{b.referenceNo}</span></span>}
                                                                    {b.chequeDate && <span>• Date: <span className="text-foreground">{b.chequeDate.split('T')[0]}</span></span>}
                                                                </>
                                                            )}
                                                        </span>
                                                    </div>
                                                    <span className={`font-mono font-black text-base ${isCredit ? 'text-red-600' : 'text-emerald-600'}`}>
                                                        {isCredit ? "-" : ""}₱{Math.abs(b.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="flex justify-between items-center px-3 pt-3 border-t-2 border-border">
                                        <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Total Pouch Target:</span>
                                        <span className="font-mono font-black text-emerald-600 text-lg">₱{reviewMath.physical.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                    </div>
                                </div>

                                {/* SECTION 2: AR ALLOCATIONS */}
                                <div className="space-y-4">
                                    <h4 className="text-xs font-black uppercase tracking-widest text-blue-600 flex items-center gap-2 border-b-2 border-blue-100 pb-2">
                                        <Receipt size={16} /> 2. Settled AR Invoices
                                    </h4>
                                    <div className="space-y-3.5">
                                        {reviewMath.invoiceRows.length === 0 && (
                                            <p className="text-xs text-muted-foreground italic bg-card p-4 rounded-xl border border-dashed text-center font-bold">No AR invoices were settled.</p>
                                        )}
                                        {reviewMath.invoiceRows.map((invoice) => {
                                            const hasRemainingBalance = invoice.remainingOpenBalance != null && invoice.remainingOpenBalance > 0.01;
                                            return (
                                                <div key={invoice.invoiceId} className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
                                                    <div className="bg-blue-50/80 dark:bg-blue-950/20 px-4 py-2.5 border-b border-border flex justify-between items-center">
                                                        <div className="min-w-0">
                                                            <span className="text-[10px] font-black uppercase text-foreground flex items-center gap-2">
                                                                <User size={14} className="text-blue-600 shrink-0"/>
                                                                <span className="truncate max-w-[220px]" title={invoice.customerName}>{invoice.customerName}</span>
                                                            </span>
                                                            <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                                                                Invoice {invoice.invoiceNo || invoice.invoiceId}
                                                            </p>
                                                        </div>
                                                        <span className="shrink-0 text-xs font-black font-mono text-blue-700">
                                                            {formatMoney(invoice.appliedAmount)}
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-border/60 bg-muted/10 px-4 py-3">
                                                        <div>
                                                            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Gross Invoice Total</p>
                                                            <p className="mt-1 font-mono text-sm font-black text-foreground">{formatOptionalMoney(invoice.grossAmount)}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Net Receivable</p>
                                                            <p className="mt-1 font-mono text-sm font-black text-foreground">{formatOptionalMoney(invoice.originalAmount)}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Applied This Pouch</p>
                                                            <p className="mt-1 font-mono text-sm font-black text-primary">{formatMoney(invoice.appliedAmount)}</p>
                                                        </div>
                                                        <div className={hasRemainingBalance ? "rounded-md bg-red-50 px-2 py-1 dark:bg-red-950/30" : ""}>
                                                            <p className={`text-[9px] font-black uppercase tracking-widest ${hasRemainingBalance ? "text-red-700 dark:text-red-300" : "text-muted-foreground"}`}>Remaining Open Balance</p>
                                                            <p className={`mt-1 font-mono text-sm font-black ${hasRemainingBalance ? "text-red-600" : "text-emerald-600"}`}>
                                                                {formatOptionalMoney(invoice.remainingOpenBalance ?? undefined)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="p-2 space-y-1 bg-muted/5">
                                                        {invoice.allocations.map((a, i) => {
                                                            const typeStr = (a.allocationType || "PAYMENT").toUpperCase();
                                                            let badgeColor = "bg-blue-100 text-blue-700 border-blue-200";
                                                            let TypeIcon = Banknote;
                                                            let typeLabel = "Payment";

                                                            if (typeStr.includes("EWT") || typeStr.includes("TAX")) {
                                                                badgeColor = "bg-purple-100 text-purple-700 border-purple-200";
                                                                TypeIcon = Percent;
                                                                typeLabel = typeStr;
                                                            } else if (typeStr.includes("MEMO") || typeStr.includes("CM") || typeStr.includes("DM")) {
                                                                badgeColor = "bg-amber-100 text-amber-700 border-amber-200";
                                                                TypeIcon = FileSignature;
                                                                typeLabel = "Credit Memo";
                                                            } else if (typeStr.includes("RETURN") || typeStr.includes("RTN")) {
                                                                badgeColor = "bg-rose-100 text-rose-700 border-rose-200";
                                                                TypeIcon = Undo2;
                                                                typeLabel = "Return";
                                                            } else {
                                                                typeLabel = typeStr;
                                                            }

                                                            return (
                                                                <div key={a.sourceTempId || a.referenceNo || i} className="flex justify-between items-center px-3 py-2 hover:bg-muted/50 rounded-lg transition-colors border border-transparent hover:border-border">
                                                                    <div className="flex flex-col gap-1.5 items-start">
                                                                        <div className="flex items-center gap-2">
                                                                            <Badge variant="outline" className={`h-4 px-1.5 text-[8px] font-black tracking-widest uppercase rounded-sm ${badgeColor}`}>
                                                                                <TypeIcon size={8} className="mr-1" /> {typeLabel}
                                                                            </Badge>
                                                                            {a.referenceNo && (
                                                                                <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">
                                                                                    Ref: {a.referenceNo}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <span className="font-mono font-black text-sm text-foreground/80">
                                                                        {formatMoney(Math.abs(a.amountApplied || 0))}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* 🚀 THE EXPLICIT MATH BREAKDOWN FOR THE AUDITOR */}
                                    <div className="flex flex-col px-3 pt-3 border-t-2 border-border gap-1.5">
                                        <div className="flex justify-between items-center text-[10px] font-black uppercase text-muted-foreground">
                                            <span>Total Allocated This Pouch:</span>
                                            <span className="font-mono">{formatMoney(reviewMath.applied)}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-[10px] font-black uppercase text-red-600">
                                            <span>Total Remaining Open Balance:</span>
                                            <span className="font-mono">{formatMoney(reviewMath.totalRemainingOpenBalance)}</span>
                                        </div>
                                        {reviewMath.totalCredits > 0 && (
                                            <div className="flex justify-between items-center text-[10px] font-black uppercase text-amber-600">
                                                <span>Less Applied Credits (Memos/Returns):</span>
                                                <span className="font-mono">- ₱{reviewMath.totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-center pt-2 mt-1 border-t border-dashed border-border">
                                            <span className="text-xs font-black uppercase tracking-widest text-blue-600">Net Expected Cash Target:</span>
                                            <span className="font-mono font-black text-blue-600 text-lg">₱{reviewMath.expectedPhysicalCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>

                                </div>
                            </div>
                        </div>
                        </div>

                        <div className="bg-card border-t p-6 shrink-0 shadow-[0_-10px_40px_rgba(0,0,0,0.08)] z-10 flex flex-col gap-3">
                            {reviewMath.unallocatedInvoices.length > 0 && (
                                <div
                                    role="alert"
                                    className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
                                >
                                    <Info size={18} className="mt-0.5 shrink-0" />
                                    <div className="min-w-0 flex-1 text-xs font-semibold">
                                        <p className="font-black uppercase tracking-widest">Commit &amp; Post is blocked</p>
                                        <p className="mt-1 text-[11px] font-bold">
                                            {reviewMath.unallocatedInvoices.length} invoice{reviewMath.unallocatedInvoices.length === 1 ? "" : "s"} remain{reviewMath.unallocatedInvoices.length === 1 ? "s" : ""} unallocated.
                                        </p>
                                        <div
                                            tabIndex={0}
                                            aria-label="Commit and Post blocking reasons"
                                            className="mt-2 max-h-[min(30vh,12rem)] space-y-1.5 overflow-y-auto pr-2 scrollbar-thin"
                                        >
                                            {reviewMath.unallocatedInvoices.map((invoice) => (
                                                <p key={invoice.invoiceId} className="break-words">
                                                    Cannot commit settlement for {invoice.invoiceNo || invoice.invoiceId}: {formatMoney(invoice.remainingOpenBalance)} remains unallocated. Apply the remaining balance, remove the invoice, or link a variance/Form 2307 allocation.
                                                </p>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                            <Button
                                onClick={() => { setConfirmInput(""); setShowConfirmModal(true); }}
                                disabled={!canPost}
                                className={`w-full h-14 font-black uppercase tracking-widest text-sm shadow-xl transition-all active:scale-[0.99] ${reviewMath.isShortage ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-primary'}`}
                            >
                                {isPosting ? <Loader2 size={20} className="animate-spin mr-2" /> : <Lock size={20} className="mr-2" />}
                                Commit & Post to General Ledger
                            </Button>
                        </div>
                    </>
                ) : null}
            </SheetContent>

            {pouch && (
                <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2"><Lock size={18}/> Confirm General Ledger Posting</DialogTitle>
                            <DialogDescription asChild>
                                <div className="space-y-4 pt-2">
                                    {reviewMath.isShortage ? (
                                        <div className="text-red-800 font-bold bg-red-50 p-3 rounded-lg border border-red-200 flex gap-3 text-xs leading-relaxed">
                                            <ShieldAlert size={20} className="shrink-0 text-red-600" />
                                            <div>
                                                WARNING: This pouch has a SHORTAGE of ₱{reviewMath.variance.toLocaleString()}.
                                                <br/><br/>
                                                Posting this will permanently lock the pouch AND automatically generate a Payroll Audit Finding for the Route Manager.
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-sm">
                                            Are you sure you want to permanently POST and lock pouch <strong className="font-mono text-primary">{pouch.docNo}</strong>?
                                        </div>
                                    )}
                                    <div className="text-sm">
                                        To confirm, please type <strong className="font-mono text-primary tracking-widest">POST</strong> below.
                                    </div>
                                </div>
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-2">
                            <Input
                                value={confirmInput}
                                onChange={(e) => setConfirmInput(e.target.value.toUpperCase())}
                                placeholder="TYPE POST TO CONFIRM"
                                className="font-mono uppercase text-center tracking-widest font-black h-12 text-lg"
                                autoFocus
                            />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setShowConfirmModal(false)}>Cancel</Button>
                            <Button
                                disabled={confirmInput !== "POST" || isPosting}
                                variant={reviewMath.isShortage ? "destructive" : "default"}
                                onClick={() => {
                                    setShowConfirmModal(false);
                                    onPost(pouch.id, pouch.docNo || "");
                                }}
                            >
                                {isPosting ? <Loader2 size={16} className="animate-spin mr-2" /> : <CheckCircle2 size={16} className="mr-2" />}
                                Confirm Post
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </Sheet>
    );
}
