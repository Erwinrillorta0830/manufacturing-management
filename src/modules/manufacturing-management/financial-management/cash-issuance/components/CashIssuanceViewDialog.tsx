"use client";

import React, { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    Loader2, CheckCircle, Send, SendIcon, Wallet, Building2,
    Printer, Pencil, Lock, AlertTriangle, FileText, Receipt,
    CheckCircle2, CircleDashed, X, ArrowDownToLine, ArrowUpFromLine,
    Paperclip, ExternalLink
} from "lucide-react";
import { Disbursement, BankAccountDto, COADto, DisbursementStatusResult } from "../types";
import { disbursementProvider } from "../providers/fetchProvider";
import { format } from "date-fns";
import { generateDisbursementPDF } from "../utils/pdfGenerator";
import { cn } from "@/lib/utils";
import { StickyTableWrapper } from "./StickyTableWrapper";
import { getCookie, decodeToken, formatCurrency, getPaymentStateLabel, getVoucherStepIndex, VOUCHER_STEPS } from "../utils/disbursement-utils";

interface CashIssuanceViewDialogProps {
    disbursement: Disbursement | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUpdateStatus: (id: number, status: string) => Promise<DisbursementStatusResult>;
    onEdit?: (d: Disbursement) => void;
    loading: boolean;
    subModule?: "preparation" | "approval" | "releasing" | "posting" | "all" | "dashboard";
}

function AttachmentPreview({ docUrl }: { docUrl: string }) {
    const [contentType, setContentType] = useState<string>("");
    const [imgError, setImgError] = useState(false);
    const fileId = docUrl.split(/[/?#]/).filter(Boolean).pop() || "";
    const viewUrl = `/api/manufacturing/financial-management/cash-issuance/disbursements/attachments/${encodeURIComponent(fileId)}`;

    useEffect(() => {
        setImgError(false);
        if (!viewUrl) return;
        const controller = new AbortController();
        fetch(viewUrl, { method: "HEAD", signal: controller.signal })
            .then((res) => {
                if (!res.ok) return;
                const type = res.headers.get("content-type");
                if (type) setContentType(type.toLowerCase());
            })
            .catch(() => {
                if (!controller.signal.aborted) setContentType("");
            });
        return () => controller.abort();
    }, [viewUrl]);

    const isPdf = docUrl.toLowerCase().endsWith(".pdf") || viewUrl.toLowerCase().endsWith(".pdf") || contentType.includes("pdf");

    return (
        <div className="space-y-3">
            <div className="bg-card rounded-xl border border-border p-4 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <Paperclip className="w-4 h-4" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Attachment / Supporting Docs</p>
                        <p className="text-xs font-bold text-foreground truncate max-w-[220px]">
                            {docUrl.split("/").pop() || "view_attachment"}
                        </p>
                    </div>
                </div>
                <Button variant="outline" size="sm" asChild className="text-[10px] font-black uppercase tracking-widest h-8 px-3">
                    <a href={viewUrl} target="_blank" rel="noopener noreferrer">
                        View <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                    </a>
                </Button>
            </div>

            {/* Inline Preview */}
            <div className="overflow-hidden rounded-xl border border-border bg-muted/20">
                <div className="px-4 py-2 bg-muted/50 border-b border-border text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center justify-between">
                    <span>Attachment Preview</span>
                </div>
                <div className="p-3 flex justify-center items-center bg-card max-h-[320px] overflow-hidden">
                    {isPdf ? (
                        <iframe 
                            src={viewUrl} 
                            className="w-full h-[280px] border-0 rounded-lg" 
                            title="Supporting Document PDF" 
                        />
                    ) : imgError ? (
                        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground p-4 text-center">Preview not available. Click "View" above to open.</div>
                    ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img 
                            src={viewUrl} 
                            alt="Supporting Document" 
                            className="max-h-[280px] max-w-full object-contain rounded-lg shadow-sm"
                            onError={() => setImgError(true)}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

export function CashIssuanceViewDialog({ disbursement, open, onOpenChange, onUpdateStatus, onEdit, loading, subModule = "preparation" }: CashIssuanceViewDialogProps) {
    const [showPrintOptions, setShowPrintOptions] = useState(false);
    const [banks, setBanks] = useState<BankAccountDto[]>([]);
    const [coas, setCoas] = useState<COADto[]>([]);
    const [statusError, setStatusError] = useState<{disbursementId: number; message: string; detail?: string} | null>(null);

    useEffect(() => {
        if (open) {
            disbursementProvider.getBanks()
                .then(setBanks)
                .catch(() => console.warn("Failed to fetch banks for view lookup."));
            disbursementProvider.getCOAs()
                .then(setCoas)
                .catch(() => console.warn("Failed to fetch COAs for view lookup."));
        }
    }, [open]);

    if (!disbursement) return null;

    const token = getCookie("vos_access_token");
    const tokenPayload = decodeToken(token);
    const currentUserId = tokenPayload?.sub;
    const isApprover = disbursement.approverId != null && currentUserId != null && String(disbursement.approverId) === String(currentUserId);
    const isEncoder = disbursement.encoderId != null && currentUserId != null && String(disbursement.encoderId) === String(currentUserId);

    const handleAction = async (status: string) => {
        setStatusError(null);
        const result = await onUpdateStatus(disbursement.id, status);
        if (result.success) {
            setStatusError(null);
            onOpenChange(false);
            return;
        }

        setStatusError({
            disbursementId: disbursement.id,
            message: result.message || `Failed to update status to ${status}.`,
            detail: result.detail,
        });
    };

    const handlePrint = (size: "A4" | "58mm") => {
        generateDisbursementPDF(disbursement, size);
        setShowPrintOptions(false);
    };

    const totalDebit = disbursement.totalDebit ?? disbursement.payables?.reduce((sum, p) => sum + (p.amount || 0), 0) ?? 0;
    const totalCredit = disbursement.totalCredit ?? disbursement.payments?.reduce((sum, p) => sum + (p.amount || 0), 0) ?? 0;
    const balance = disbursement.balance ?? (totalDebit - totalCredit);
    const isBalanced = Math.abs(balance) < 0.01;

    const currentStepIndex = getVoucherStepIndex(disbursement.status);
    return (
        <Sheet open={open} onOpenChange={(val) => { onOpenChange(val); setShowPrintOptions(false); if (!val) setStatusError(null); }}>
            <SheetContent className="sm:max-w-[1000px] w-full p-0 flex flex-col bg-background border-l border-border overflow-hidden shadow-2xl">

                <SheetHeader className="p-6 border-b border-border bg-card shrink-0 shadow-sm relative z-10">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <SheetTitle className="text-2xl font-black uppercase text-foreground tracking-tight flex items-center gap-2">
                                <FileText className="w-5 h-5 text-primary opacity-70" />
                                {disbursement.docNo}
                                {disbursement.isPosted === 1 && (
                                    <span title="Locked & Posted to GL"><Lock className="w-4 h-4 text-destructive" /></span>
                                )}
                            </SheetTitle>
                            <SheetDescription className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                                Transaction Date: {disbursement.transactionDate ? format(new Date(disbursement.transactionDate), "MMMM dd, yyyy") : "No Date Recorded"}
                            </SheetDescription>
                        </div>
                        <Badge variant="outline" className="px-3 py-1 bg-muted font-black uppercase tracking-widest text-[10px]">
                            {disbursement.status}
                        </Badge>
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                            Payment: {getPaymentStateLabel(disbursement.paymentState, disbursement.paidAmount)}
                        </span>
                    </div>

                    <div className="mt-6 pt-4 border-t border-border/50">
                        <div className="flex items-center justify-between relative">
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-muted"></div>
                            <div
                                className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-primary transition-all duration-500"
                                style={{ width: `${(Math.max(0, currentStepIndex) / (VOUCHER_STEPS.length - 1)) * 100}%` }}
                            ></div>

                            {VOUCHER_STEPS.map((step, idx) => {
                                const isCompleted = idx < currentStepIndex;
                                const isCurrent = idx === currentStepIndex;
                                return (
                                    <div key={step} className="relative z-10 flex flex-col items-center gap-2 bg-card px-2">
                                        <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                                            isCompleted ? 'bg-primary text-primary-foreground' :
                                                isCurrent ? 'bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]' :
                                                    'bg-muted border-2 border-border text-muted-foreground'
                                        }`}>
                                            {isCompleted ? <CheckCircle2 className="w-3 h-3" /> :
                                                isCurrent ? <CircleDashed className="w-3 h-3 animate-spin-slow" /> :
                                                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50"></span>}
                                        </div>
                                        <span className={`text-[8px] font-black uppercase tracking-widest ${isCurrent ? 'text-foreground' : 'text-muted-foreground'}`}>
                                            {step}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin bg-muted/10 space-y-6">
                    {statusError?.disbursementId === disbursement.id && (
                        <div
                            role="alert"
                            aria-live="assertive"
                            className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive shadow-sm"
                        >
                            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-black uppercase tracking-widest">{statusError.message}</p>
                                {statusError.detail && (
                                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide">
                                        {statusError.detail}
                                    </p>
                                )}
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Dismiss status error"
                                onClick={() => setStatusError(null)}
                                className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    )}

                    {/* Approver Action Banner */}
                    {disbursement.status === "Submitted" && subModule === "approval" && (
                        <div className="space-y-3">
                            <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50 dark:border-blue-900/40 dark:bg-blue-950/10 text-blue-800 dark:text-blue-400 flex items-center gap-3 shadow-sm animate-in fade-in duration-300">
                                <CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0" />
                                <div>
                                    <p className="text-xs font-black uppercase tracking-widest">Pending Verification & Approval</p>
                                    <p className="text-[10px] font-semibold mt-0.5 uppercase tracking-wide opacity-80">
                                        Please verify all voucher particulars, account titles, division codes, and supporting attachments below. Once validated, approve to proceed to check releasing.
                                    </p>
                                </div>
                            </div>

                            {isEncoder && (
                                <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/10 text-rose-800 dark:text-rose-400 flex items-center gap-3 shadow-sm animate-in shake duration-300">
                                    <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-widest">Segregation of Duties Warning</p>
                                        <p className="text-[10px] font-semibold mt-0.5 uppercase tracking-wide opacity-80">
                                            You encoded/submitted this voucher. An independent accountant must verify and approve it.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {!isBalanced && (disbursement.status as string) !== "Draft" && (disbursement.status as string) !== "Submitted" && (
                                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/10 text-amber-800 dark:text-amber-400 flex items-center gap-3 shadow-sm animate-in fade-in duration-300">
                                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-widest">Double-Entry Balance Mismatch</p>
                                        <p className="text-[10px] font-semibold mt-0.5 uppercase tracking-wide opacity-80">
                                            Total Debits ({formatCurrency(totalDebit)}) do not equal Total Credits ({formatCurrency(totalCredit)}). This voucher must be balanced before posting to the ledger.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {/* SUMMARY CARDS */}
                    <div className="grid grid-cols-2 gap-4 p-5 bg-card rounded-xl border border-border shadow-sm relative overflow-hidden">
                        <div className={`absolute top-0 left-0 w-1 h-full ${disbursement.isPosted ? 'bg-muted-foreground' : 'bg-primary'}`} />
                        <div>
                            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                                <Building2 className="w-3 h-3" /> Payee
                            </p>
                            <p className="text-sm font-black text-foreground uppercase">{disbursement.payeeName || "N/A"}</p>
                        </div>
                        <div className="text-right">
                            <p className="flex items-center justify-end gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                                <Wallet className="w-3 h-3" /> Total Amount
                            </p>
                            <p className="text-xl font-black text-emerald-600 dark:text-emerald-500">{formatCurrency(disbursement.totalAmount)}</p>
                        </div>

                        <div className="grid grid-cols-3 gap-2 col-span-2 border-t border-border pt-3 mt-1 bg-muted/30 -mx-5 px-5 pb-2">
                            <div>
                                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Total Debits</p>
                                <p className="text-xs font-bold text-foreground">{formatCurrency(totalDebit)}</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Total Credits</p>
                                <p className="text-xs font-bold text-foreground">{formatCurrency(totalCredit)}</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Balance</p>
                                <p className={cn("text-xs font-bold", isBalanced ? "text-emerald-600" : "text-destructive")}>
                                    {formatCurrency(balance)}
                                </p>
                            </div>
                        </div>

                        <div className="col-span-2 mt-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Particulars / Remarks</p>
                            <p className="text-xs font-bold text-foreground bg-muted p-2 rounded-md border border-border/50">{disbursement.remarks || "No remarks provided."}</p>
                        </div>
                        <div className="mt-1">
                            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Department</p>
                            <p className="text-xs font-bold text-foreground">{disbursement.departmentName || "N/A"}</p>
                        </div>
                    </div>

                    {disbursement.supportingDocumentsUrl ? (
                        <AttachmentPreview docUrl={disbursement.supportingDocumentsUrl} />
                    ) : null}

                    {!isBalanced && (disbursement.status as string) !== "Draft" && (disbursement.status as string) !== "Submitted" && (disbursement.status as string) !== "Posted" && (
                        <div className="bg-destructive/10 text-destructive border border-destructive/20 p-3 rounded-md text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>Warning: Debits do not match Credits. This voucher cannot be posted.</span>
                        </div>
                    )}

                    {/* 🚀 UI FIX: STACKED TABLES (ZERO CLICKS) */}
                    <div className="space-y-4">

                        {/* PAYABLES SECTION */}
                        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden flex flex-col">
                            <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-foreground font-black uppercase tracking-widest text-[11px]">
                                    <ArrowDownToLine className="w-4 h-4 text-orange-500"/> Payables (Debits)
                                </div>
                                <Badge variant="secondary" className="h-5 px-2">{disbursement.payables?.length || 0} Lines</Badge>
                            </div>
                            <StickyTableWrapper className="overflow-auto max-h-[280px] custom-scrollbar">
                                <Table>
                                    <TableHeader className="bg-muted/80 backdrop-blur-md sticky top-0 z-10 shadow-[0_1px_0_0_hsl(var(--border))]">
                                        <TableRow className="border-border">
                                            <TableHead className="text-[9px] font-black uppercase tracking-widest text-muted-foreground min-w-[150px]">Ref No</TableHead>
                                            <TableHead className="text-[9px] font-black uppercase tracking-widest text-muted-foreground min-w-[120px]">Division</TableHead>
                                            <TableHead className="text-[9px] font-black uppercase tracking-widest text-muted-foreground min-w-[300px]">Chart of Account</TableHead>
                                            <TableHead className="text-[9px] font-black uppercase tracking-widest text-muted-foreground min-w-[150px]">Remarks</TableHead>
                                            <TableHead className="text-[9px] font-black uppercase tracking-widest text-right text-muted-foreground min-w-[120px]">Amount</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {!disbursement.payables?.length ? (
                                            <TableRow><TableCell colSpan={5} className="text-center text-[10px] text-muted-foreground py-6 font-bold">No payables attached.</TableCell></TableRow>
                                        ) : disbursement.payables.map((p, i) => (
                                            <TableRow key={i} className="hover:bg-muted/50 border-border">
                                                <TableCell className="text-xs font-bold uppercase text-foreground">{p.referenceNo || "N/A"}</TableCell>
                                                <TableCell className="text-xs font-bold uppercase text-foreground">{p.divisionName || "N/A"}</TableCell>
                                                <TableCell className="text-[10px] font-bold text-muted-foreground uppercase">{p.accountTitle || `COA: ${p.coaId}`}</TableCell>
                                                <TableCell className="text-[10px] font-medium text-muted-foreground truncate max-w-[200px]">{p.remarks || "-"}</TableCell>
                                                <TableCell className="text-xs font-black text-right text-foreground">{formatCurrency(p.amount)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </StickyTableWrapper>
                            <div className="bg-muted/50 px-4 py-2 border-t border-border flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                                <span className="text-muted-foreground">Total Debits</span>
                                <span className="text-foreground">{formatCurrency(totalDebit)}</span>
                            </div>
                        </div>

                        {/* PAYMENTS SECTION */}
                        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden flex flex-col">
                            <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-foreground font-black uppercase tracking-widest text-[11px]">
                                    <ArrowUpFromLine className="w-4 h-4 text-emerald-500"/> Bank Checks (Credits)
                                </div>
                                <Badge variant="secondary" className="h-5 px-2">{disbursement.payments?.length || 0} Lines</Badge>
                            </div>
                            <StickyTableWrapper className="overflow-auto max-h-[280px] custom-scrollbar">
                                <Table>
                                    <TableHeader className="bg-muted/80 backdrop-blur-md sticky top-0 z-10 shadow-[0_1px_0_0_hsl(var(--border))]">
                                        <TableRow className="border-border">
                                            <TableHead className="text-[9px] font-black uppercase tracking-widest text-muted-foreground min-w-[120px]">Date</TableHead>
                                            <TableHead className="text-[9px] font-black uppercase tracking-widest text-muted-foreground min-w-[150px]">Check No</TableHead>
                                            <TableHead className="text-[9px] font-black uppercase tracking-widest text-muted-foreground min-w-[300px]">Bank Acct & GL</TableHead>
                                            <TableHead className="text-[9px] font-black uppercase tracking-widest text-right text-muted-foreground min-w-[120px]">Amount</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {!disbursement.payments?.length ? (
                                            <TableRow><TableCell colSpan={4} className="text-center text-[10px] text-muted-foreground py-6 font-bold">No payments processed yet.</TableCell></TableRow>
                                        ) : disbursement.payments.map((p, i) => {
                                            const matchedBank = banks.find(b => b.bankId === p.bankId);
                                            const displayBank = matchedBank
                                                ? `${matchedBank.bankName} - ${matchedBank.accountNumber}`
                                                : p.bankName
                                                    ? `${p.bankName}${p.bankAccountNumber ? ` - ${p.bankAccountNumber}` : ""}`
                                                    : (p.bankId ? `Bank ID: ${p.bankId}` : "No Bank Selected");

                                            const matchedCoa = coas.find(c => c.coaId === p.coaId);
                                            const displayCoa = matchedCoa
                                                ? matchedCoa.accountTitle
                                                : (p.accountTitle || `GL Code: ${p.coaId}`);

                                            return (
                                                <TableRow key={i} className="hover:bg-muted/50 border-border">
                                                    <TableCell className="text-[10px] font-bold uppercase text-muted-foreground">
                                                        {p.date ? format(new Date(p.date), "MMM dd, yyyy") : "N/A"}
                                                    </TableCell>
                                                    <TableCell className="text-xs font-bold uppercase text-foreground">{p.checkNo || "N/A"}</TableCell>
                                                    <TableCell className="text-[10px] font-bold text-muted-foreground uppercase">
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="text-foreground">{displayBank}</span>
                                                            <span className="text-primary/70">{displayCoa}</span>
                                                            {(p.releasedDate || p.releasedBy) && (
                                                                <span className="text-[8px] text-purple-600 dark:text-purple-400 font-black mt-1 uppercase tracking-wider">
                                                                    Released: {p.releasedDate ? (() => {
                                                                        try {
                                                                            return format(new Date(p.releasedDate), "MMM dd, yyyy");
                                                                        } catch {
                                                                            return p.releasedDate;
                                                                        }
                                                                    })() : ""} {p.releasedBy ? `by ${p.releasedBy}` : ""}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-xs font-black text-emerald-600 dark:text-emerald-500 text-right">{formatCurrency(p.amount)}</TableCell>
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                            </StickyTableWrapper>
                            <div className="bg-muted/50 px-4 py-2 border-t border-border flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                                <span className="text-muted-foreground">Total Credits</span>
                                <span className="text-emerald-600 dark:text-emerald-500">{formatCurrency(totalCredit)}</span>
                            </div>
                        </div>

                    </div>
                </div>

                {/* 🚀 FOOTER: CONSOLIDATED ACTIONS */}
                <div className="p-4 sm:p-6 bg-card border-t border-border shrink-0 flex justify-between items-center z-10 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.1)]">

                    {/* LEFT SIDE: Secondary Tools */}
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            {showPrintOptions ? (
                                <div className="flex items-center gap-2 animate-in slide-in-from-bottom-2 fade-in absolute bottom-full mb-2 left-0 bg-card p-1 border border-border shadow-lg rounded-lg">
                                    <Button variant="outline" onClick={() => handlePrint("A4")} className="text-[10px] font-black uppercase tracking-widest h-9 px-3 hover:bg-muted">
                                        <FileText className="w-3.5 h-3.5 mr-2 text-blue-500" /> A4
                                    </Button>
                                    <Button variant="outline" onClick={() => handlePrint("58mm")} className="text-[10px] font-black uppercase tracking-widest h-9 px-3 hover:bg-muted">
                                        <Receipt className="w-3.5 h-3.5 mr-2 text-amber-500" /> Thermal
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => setShowPrintOptions(false)} className="h-9 w-9 text-muted-foreground"><X className="w-4 h-4"/></Button>
                                </div>
                            ) : (
                                <Button variant="outline" onClick={() => setShowPrintOptions(true)} className="text-[10px] font-black uppercase tracking-widest h-10 px-4 border-input shadow-sm">
                                    <Printer className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">Print</span>
                                </Button>
                            )}
                        </div>

                        {/* Dynamic Edit Button */}
                        {(((subModule === "preparation" && (
                            disbursement.status === "Draft" || 
                            disbursement.status === "Returned for Revision"
                          )) || 
                          ((disbursement.status === "Approved" || disbursement.status === "Partially Released") && subModule === "releasing")) && onEdit) && (
                            <Button variant="outline" onClick={() => onEdit(disbursement)} className="text-[10px] font-black uppercase tracking-widest h-10 px-4 sm:px-6 text-amber-600 border-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/30">
                                <Pencil className="w-4 h-4 sm:mr-2" />
                                <span className="hidden sm:inline">{disbursement.status === "Approved" || disbursement.status === "Partially Released" ? "Add/Edit Checks" : "Edit Voucher"}</span>
                            </Button>
                        )}

                        {/* Revert Tool */}
                        {disbursement.status !== "Draft" && disbursement.status !== "Returned for Revision" && disbursement.status !== "Posted" &&
                         (disbursement.status !== "Submitted" || subModule === "approval") &&
                         (subModule === "preparation" || subModule === "approval" || subModule === "releasing") && (
                            <Button variant="ghost" onClick={() => handleAction(subModule === "preparation" ? "Draft" : "Returned for Revision")} disabled={loading} className="text-[10px] font-black uppercase tracking-widest h-10 px-4 text-destructive hover:bg-destructive/10 flex">
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4 mr-2" />} 
                                {subModule === "preparation" ? "Return to Draft" : "Return for Revision"}
                            </Button>
                        )}
                    </div>

                    {/* RIGHT SIDE: Dynamic Primary Action Pipeline */}
                    <div className="flex gap-2">
                        {(disbursement.status === "Draft" || disbursement.status === "Returned for Revision") && subModule === "preparation" && (
                            <Button onClick={() => handleAction("Submitted")} disabled={loading} className="text-[10px] font-black uppercase tracking-widest h-10 px-6 sm:px-10 bg-blue-600 hover:bg-blue-700 text-white shadow-md disabled:opacity-50">
                                {loading ? <Loader2 className="w-4 h-4 animate-spin sm:mr-2" /> : <SendIcon className="w-4 h-4 sm:mr-2" />}
                                Submit for Approval
                            </Button>
                        )}

                        {disbursement.status === "Submitted" && subModule === "approval" && (
                            <Button 
                                onClick={() => handleAction("Approved")} 
                                disabled={loading || isEncoder} 
                                className="text-[10px] font-black uppercase tracking-widest h-10 px-6 sm:px-10 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md disabled:opacity-50"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin sm:mr-2" /> : <CheckCircle className="w-4 h-4 sm:mr-2" />}
                                Approve Voucher
                            </Button>
                        )}

                        {(disbursement.status === "Approved" || disbursement.status === "Partially Released") && subModule === "releasing" && (
                            <Button
                                onClick={() => handleAction("Released")}
                                disabled={loading || !disbursement.payments || disbursement.payments.length === 0}
                                className="text-[10px] font-black uppercase tracking-widest h-10 px-6 sm:px-10 bg-purple-600 hover:bg-purple-700 text-white shadow-md disabled:opacity-50">
                                {loading ? <Loader2 className="w-4 h-4 animate-spin sm:mr-2" /> : <Send className="w-4 h-4 sm:mr-2" />}
                                Release Check
                            </Button>
                        )}

                        {disbursement.status === "Released" && subModule === "posting" && (
                            <div className="flex flex-col items-end gap-1">
                                <Button 
                                    onClick={() => handleAction("Posted")} 
                                    disabled={loading || !isBalanced || isApprover} 
                                    className="text-[10px] font-black uppercase tracking-widest h-10 px-6 sm:px-10 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md disabled:opacity-50"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin sm:mr-2" /> : <Lock className="w-4 h-4 sm:mr-2" />}
                                    Post to Ledger
                                </Button>
                                {isApprover && (
                                    <span className="text-[9px] text-destructive font-black uppercase tracking-widest mt-1">
                                        Segregation of Duties: Approver cannot post
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
