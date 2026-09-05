"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useSettlement, WalletItem } from "../hooks/useSettlement";
import {
    ShieldCheck,
    Wallet,
    Save,
    Plus,
    X,
    Loader2,
    Percent,
    Trash2,
    Lock,
    Printer,
    Wand2,
    Truck,
    ChevronsUpDown,
    Check,
    Layers,
    FileText,
    CheckCircle2,
    Receipt
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { fetchProvider } from "../../providers/fetchProvider";
import { UnpaidInvoice, UnpaidInvoiceSearchResponse } from "../../types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import SettlementInvoiceCartTable from "./SettlementInvoiceCartTable";
import WalletAssetCard from "./WalletAssetCard";
import InvoiceSearchPopover from "./InvoiceSearchPopover";
import AllocationSidePanel from "./AllocationSidePanel";
import { generateAdjustmentPDF } from "../utils/adjustment-pdf-generator";
import { printSettlementReceiptA4 } from "../utils/printSettlementReceiptA4";
import {
    capSettlementAllocation,
    findOverAllocatedInvoice,
    findUnderAllocatedInvoice,
    getCartBalanceTotals,
    getInvoiceAllocationCapacity,
    getInvoiceAppliedForSettlement,
    getInvoiceRequiredBalance,
    getSourceAllocationCapacity,
    roundCurrency,
    SETTLEMENT_BALANCE_TOLERANCE,
} from "../utils/settlement-balance";

export interface SettlementCommandCenterProps {
    id: string | number;
    onClose?: (hasSaved?: boolean) => void;
    onChanged?: () => void;
    autoAddInvoiceNo?: string;
}

export default function SettlementCommandCenter({ id, onClose, onChanged, autoAddInvoiceNo }: SettlementCommandCenterProps) {
    const [activeInvoiceId, setActiveInvoiceId] = useState<number | null>(null);

    const {
        isLoading, wallet, credits, cartInvoices, allocations, setAllocations, salesmanName, findings, docNo, isPosted, isClearing, companyProfile,
        isLoadingRoute, loadRouteInvoices, addToCart, removeFromCart, clearCart, 
        getUsedAmount, getInvoiceApplied, handleAllocate, createAdjustment, createEwt, submitSettlement,
        hasPartialChanges, hasClearableCart, savePartialSettlement,
        deleteWalletItem, editWalletItem,
        isLoadingCredits, creditsError, retryCredits, hasMoreCredits, loadMoreCredits, collectionDate
    } = useSettlement(id, activeInvoiceId);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isPartialSaving, setIsPartialSaving] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<UnpaidInvoice[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [searchHasMore, setSearchHasMore] = useState(false);
    const [searchCursor, setSearchCursor] = useState<number | null>(null);
    const searchAbortRef = useRef<AbortController | null>(null);

    const [creditSearch, setCreditSearch] = useState("");
    const [poolSearch, setPoolSearch] = useState("");


    const [editingId, setEditingId] = useState<string | null>(null);
    const [editAmt, setEditAmt] = useState("");
    const [editRef, setEditRef] = useState("");
    const [editBalType, setEditBalType] = useState<number>(2);

    const [editCoaId, setEditCoaId] = useState<number | "">("");
    const [editCoaOpen, setEditCoaOpen] = useState(false);
    const [editFId, setEditFId] = useState<number | "">("");
    const [editAccountOpen, setEditAccountOpen] = useState(false);

    const [adjOpen, setAdjOpen] = useState(false);
    const [adjCoaId, setAdjCoaId] = useState<number | "">("");
    const [adjCoaOpen, setAdjCoaOpen] = useState(false);
    const [adjFindingId, setAdjFindingId] = useState<number | "">("");
    const [adjAccountOpen, setAdjAccountOpen] = useState(false);
    const [adjAmount, setAdjAmount] = useState<string>("");
    const [adjRemarks, setAdjRemarks] = useState("");
    const [adjInvoiceId, setAdjInvoiceId] = useState<number | null>(null);
    const [adjBalanceType, setAdjBalanceType] = useState<number>(2);
    const [isCreatingAdj, setIsCreatingAdj] = useState(false);

    const [ewtOpen, setEwtOpen] = useState(false);
    const [globalEwtAmount, setGlobalEwtAmount] = useState("");
    const [globalEwtRef, setGlobalEwtRef] = useState("");



    const uniqueCategories = useMemo(() => {
        const coaMap = new Map<number, {id: number, title: string}>();
        findings.forEach(f => {
            if (f.chartOfAccount) {
                const cId = f.chartOfAccount.coaId || f.chartOfAccount.id;
                if (cId && !coaMap.has(cId)) coaMap.set(cId, { id: cId, title: f.chartOfAccount.accountTitle });
            }
        });
        return Array.from(coaMap.values()).sort((a, b) => a.title.localeCompare(b.title));
    }, [findings]);

    const filteredFindings = useMemo(() => {
        if (!adjCoaId) return [];
        return findings.filter(f => (f.chartOfAccount?.coaId || f.chartOfAccount?.id) === adjCoaId);
    }, [findings, adjCoaId]);

    const editFilteredFindings = useMemo(() => {
        if (!editCoaId) return [];
        return findings.filter(f => (f.chartOfAccount?.coaId || f.chartOfAccount?.id) === editCoaId);
    }, [findings, editCoaId]);

    useEffect(() => {
        searchAbortRef.current?.abort();
        searchAbortRef.current = null;
        setSearchError(null);
        setSearchCursor(null);
        setSearchHasMore(false);

        if (!searchQuery || searchQuery.trim().length < 2 || isPosted) {
            setSearchResults([]);
            return;
        }

        const delayDebounceFn = setTimeout(async () => {
            const controller = new AbortController();
            searchAbortRef.current = controller;
            setIsSearching(true);
            try {
                const data = await fetchProvider.getOrThrow<UnpaidInvoiceSearchResponse>(
                    `/api/manufacturing/financial-management/collection-posting/collections/search-unpaid?query=${encodeURIComponent(searchQuery.trim())}&pouchId=${encodeURIComponent(String(id))}&limit=50`,
                    {signal: controller.signal, timeoutMs: 12_000}
                );
                const cleanResults = (data?.items || []).filter(inv => !cartInvoices.some(cartInv => cartInv.id === inv.id));
                setSearchResults(cleanResults);
                setSearchHasMore(Boolean(data?.hasMore));
                setSearchCursor(data?.nextCursor ?? null);
            } catch (error) {
                if (!(error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"))) {
                    console.error("Search failed:", error);
                    setSearchError(error instanceof Error ? error.message : "Unable to search unpaid invoices.");
                    setSearchResults([]);
                }
            } finally {
                if (searchAbortRef.current === controller) setIsSearching(false);
            }
        }, 300);

        return () => {
            clearTimeout(delayDebounceFn);
            searchAbortRef.current?.abort();
        };
    }, [searchQuery, cartInvoices, isPosted, id]);

    const loadMoreSearchResults = async () => {
        if (!searchHasMore || !searchCursor || isSearching || !searchQuery.trim() || isPosted) return;

        searchAbortRef.current?.abort();
        const controller = new AbortController();
        searchAbortRef.current = controller;
        setIsSearching(true);
        setSearchError(null);

        try {
            const data = await fetchProvider.getOrThrow<UnpaidInvoiceSearchResponse>(
                `/api/manufacturing/financial-management/collection-posting/collections/search-unpaid?query=${encodeURIComponent(searchQuery.trim())}&pouchId=${encodeURIComponent(String(id))}&limit=50&cursor=${encodeURIComponent(String(searchCursor))}`,
                {signal: controller.signal, timeoutMs: 12_000}
            );
            const cleanResults = (data?.items || []).filter(inv => !cartInvoices.some(cartInv => cartInv.id === inv.id));
            setSearchResults(previous => [...previous, ...cleanResults]);
            setSearchHasMore(Boolean(data?.hasMore));
            setSearchCursor(data?.nextCursor ?? null);
        } catch (error) {
            if (!(error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"))) {
                console.error("Loading more search results failed:", error);
                setSearchError(error instanceof Error ? error.message : "Unable to load more unpaid invoices.");
            }
        } finally {
            if (searchAbortRef.current === controller) setIsSearching(false);
        }
    };

    useEffect(() => {
        if (cartInvoices.length === 0) {
            setActiveInvoiceId(null);
        } else if (!cartInvoices.some(invoice => invoice.id === activeInvoiceId)) {
            setActiveInvoiceId(cartInvoices[0].id);
        }
    }, [cartInvoices, activeInvoiceId]);
 
    const [autoAdded, setAutoAdded] = useState(false);

    useEffect(() => {
        if (autoAddInvoiceNo && !isPosted && !autoAdded && cartInvoices.length >= 0) {
            fetchProvider.getOrThrow<UnpaidInvoiceSearchResponse>(
                `/api/manufacturing/financial-management/collection-posting/collections/search-unpaid?query=${encodeURIComponent(autoAddInvoiceNo.trim())}&pouchId=${encodeURIComponent(String(id))}&limit=50`,
                {timeoutMs: 12_000}
            ).then((res) => {
                const found = res?.items?.find(inv => inv.invoiceNo === autoAddInvoiceNo);
                if (found) {
                    addToCart(found);
                    setAutoAdded(true);
                    toast.success(`Automatically added ${autoAddInvoiceNo} to active cart.`);
                }
            }).catch(err => {
                console.error("Auto add invoice failed:", err);
                toast.error(err instanceof Error ? err.message : "Unable to find the invoice.");
            });
        }
    }, [autoAddInvoiceNo, isPosted, autoAdded, cartInvoices, addToCart, id]);

    const handleSmartMatch = () => {
        if (cartInvoices.length === 0) {
            toast.error("Please add invoices to the cart first.");
            return;
        }

        let matchCount = 0;
        const tempAllocations = [...allocations];

        const getRemainingInvoiceBal = (invoiceId: number, baseBal: number) => {
            const applied = tempAllocations
                .filter(a => a.invoiceId === invoiceId)
                .reduce((s, a) => s + a.amountApplied, 0);
            return getInvoiceAllocationCapacity(baseBal, applied);
        };

        const getRemainingWalletAmt = (sourceId: string, baseAmt: number) => {
            const used = tempAllocations
                .filter(a => a.sourceTempId === sourceId)
                .reduce((s, a) => s + a.amountApplied, 0);
            return getSourceAllocationCapacity(baseAmt, used);
        };

        const allocateSim = (invoice: UnpaidInvoice, source: WalletItem, amount: number) => {
            const sourceUsedElsewhere = tempAllocations
                .filter(a => a.sourceTempId === source.id && a.invoiceId !== invoice.id)
                .reduce((sum, allocation) => sum + allocation.amountApplied, 0);
            const invoiceUsedElsewhere = tempAllocations
                .filter(a => a.invoiceId === invoice.id && a.sourceTempId !== source.id)
                .reduce((sum, allocation) => sum + allocation.amountApplied, 0);
            const finalAmount = capSettlementAllocation(
                amount,
                getSourceAllocationCapacity(source.originalAmount, sourceUsedElsewhere),
                getInvoiceAllocationCapacity(getInvoiceRequiredBalance(invoice), invoiceUsedElsewhere)
            );
            if (finalAmount <= SETTLEMENT_BALANCE_TOLERANCE) return;
            const index = tempAllocations.findIndex(a => a.invoiceId === invoice.id && a.sourceTempId === source.id);
            if (index > -1) {
                tempAllocations[index].amountApplied = roundCurrency(
                    tempAllocations[index].amountApplied + finalAmount
                );
            } else {
                tempAllocations.push({
                    invoiceId: invoice.id,
                    invoiceNo: invoice.invoiceNo || "",
                    customerName: invoice.customerName || "",
                    amountApplied: finalAmount,
                    allocationType: source.type || "CASH",
                    sourceTempId: source.id,
                    originalAmount: invoice.originalAmount || 0,
                    remainingBalance: invoice.remainingBalance || 0,
                    maxSettleableAmount: invoice.maxSettleableAmount,
                    totalPayments: invoice.totalPayments || 0,
                    totalMemos: invoice.totalMemos || 0,
                    totalReturns: invoice.totalReturns || 0,
                    transactionDate: invoice.transactionDate ? String(invoice.transactionDate) : "",
                    dueDate: invoice.dueDate ? String(invoice.dueDate) : "",
                    agingDays: invoice.agingDays || 0,
                    history: invoice.history || []
                });
            }
            matchCount++;
        };

        const combinedSources = [...wallet, ...credits];

        // 1. EXACT MATCHES FIRST
        for (const inv of cartInvoices) {
            const invBal = getRemainingInvoiceBal(inv.id, getInvoiceRequiredBalance(inv));
            if (invBal <= 0.01) continue;

            const exactSource = combinedSources.find(src => {
                const srcAmt = getRemainingWalletAmt(src.id, src.originalAmount);
                return Math.abs(srcAmt - invBal) <= 0.01 && src.type !== 'EWT';
            });

            if (exactSource) {
                const srcAmt = getRemainingWalletAmt(exactSource.id, exactSource.originalAmount);
                allocateSim(inv, exactSource, srcAmt);
            }
        }

        // 2. REFERENCE/NAME MATCHING
        for (const inv of cartInvoices) {
            const invBal = getRemainingInvoiceBal(inv.id, getInvoiceRequiredBalance(inv));
            if (invBal <= 0.01) continue;

            const matchingSource = combinedSources.find(src => {
                const srcAmt = getRemainingWalletAmt(src.id, src.originalAmount);
                if (srcAmt <= 0.01) return false;
                return src.label.toLowerCase().includes(inv.invoiceNo.toLowerCase());
            });

            if (matchingSource) {
                const srcAmt = getRemainingWalletAmt(matchingSource.id, matchingSource.originalAmount);
                const allocationAmt = Math.min(invBal, srcAmt);
                allocateSim(inv, matchingSource, allocationAmt);
            }
        }

        // 3. FIFO / AGING MATCHING
        const sortedInvoices = [...cartInvoices].sort((a, b) => (b.agingDays || 0) - (a.agingDays || 0));
        for (const src of combinedSources) {
            if (src.type === 'EWT' || src.type === 'ADJUSTMENT') continue;

            let srcAmt = getRemainingWalletAmt(src.id, src.originalAmount);
            if (srcAmt <= 0.01) continue;

            for (const inv of sortedInvoices) {
                const invBal = getRemainingInvoiceBal(inv.id, getInvoiceRequiredBalance(inv));
                if (invBal <= 0.01) continue;

                const allocationAmt = Math.min(invBal, srcAmt);
                allocateSim(inv, src, allocationAmt);
                srcAmt -= allocationAmt;

                if (srcAmt <= 0.01) break;
            }
        }

        if (matchCount > 0) {
            setAllocations(tempAllocations);
            toast.success(`Successfully auto-allocated ${matchCount} payment sources!`);
        } else {
            toast.info("No matching allocations found.");
        }
    };

    const pouchTotal = useMemo(() => wallet.filter(w => w.type === 'CASH' || w.type === 'CHECK').reduce((sum, w) => sum + w.originalAmount, 0), [wallet]);
    const ewtTotal = useMemo(() => wallet.filter(w => w.type === 'EWT').reduce((sum, w) => sum + w.originalAmount, 0), [wallet]);
    const varianceTotal = useMemo(() => wallet.filter(w => w.type === 'ADJUSTMENT').reduce((sum, w) => w.balanceTypeId === 1 ? sum - w.originalAmount : sum + w.originalAmount, 0), [wallet]);

    const totalAllocated = useMemo(() => allocations.filter(a => wallet.some(w => w.id === a.sourceTempId)).reduce((sum, a) => {
        const source = wallet.find(w => w.id === a.sourceTempId);
        return source?.balanceTypeId === 1 ? sum - a.amountApplied : sum + a.amountApplied;
    }, 0), [allocations, wallet]);

    const remainingToAllocate = Math.round(((pouchTotal + ewtTotal + varianceTotal) - totalAllocated) * 100) / 100;
    const cartBalanceTotals = getCartBalanceTotals(cartInvoices, allocations);
    const cartTotalBalance = cartBalanceTotals.required;
    const cartTotalAppliedSession = cartBalanceTotals.applied;
    const underAllocatedInvoice = findUnderAllocatedInvoice(cartInvoices, allocations);
    const overAllocatedInvoice = findOverAllocatedInvoice(cartInvoices, allocations);
    const isCartBalanced = !underAllocatedInvoice
        && !overAllocatedInvoice
        && Math.abs(cartBalanceTotals.difference) <= SETTLEMENT_BALANCE_TOLERANCE;
    const isPouchBalanced = Math.abs(remainingToAllocate) <= 0.01;
    const isCommitReady = isPouchBalanced && isCartBalanced;
    const cartBalanceMessage = underAllocatedInvoice
        ? `Invoice ${underAllocatedInvoice.invoiceNo} still has ₱${(
            getInvoiceRequiredBalance(underAllocatedInvoice)
            - getInvoiceAppliedForSettlement(allocations, underAllocatedInvoice.id)
        ).toLocaleString(undefined, { minimumFractionDigits: 2 })} unallocated. Apply the balance or remove it from the cart.`
        : overAllocatedInvoice
            ? `The allocation for ${overAllocatedInvoice.invoiceNo} exceeds its remaining balance.`
            : `Settlement cart is not balanced. ₱${Math.abs(cartBalanceTotals.difference).toLocaleString(undefined, { minimumFractionDigits: 2 })} remains unallocated.`;

    const handleMasterSave = async () => {
        if (!isCommitReady) {
            toast.error(!isCartBalanced ? `Cannot commit: ${cartBalanceMessage}` : "Cannot commit: the pouch allocation is not balanced.");
            return;
        }

        setIsSubmitting(true);
        const success = await submitSettlement();
        if (success) {
            setIsSuccess(true);
            setTimeout(() => { if (onClose) onClose(true); }, 1200);
        } else {
            setIsSubmitting(false);
        }
    };

    const handlePartialSave = async () => {
        setIsPartialSaving(true);
        const success = await savePartialSettlement();
        if (success) {
            setIsSuccess(true);
            setTimeout(() => { if (onClose) onClose(true); }, 1200);
        } else {
            setIsPartialSaving(false);
        }
    };

    const handleClearCart = async () => {
        const cleared = await clearCart();
        if (cleared) onChanged?.();
    };

    const handleCreateAdjustment = async () => {
        const parsedAmount = Math.abs(parseFloat(adjAmount));
        const validFindingId = Number(adjFindingId);
        const validCoaId = Number(adjCoaId);
        if (!validFindingId || validFindingId <= 0 || !validCoaId || isNaN(parsedAmount) || parsedAmount === 0) return toast.error("Please select a valid Ledger Account.");
        setIsCreatingAdj(true);
        await createAdjustment(validFindingId, validCoaId, parsedAmount, adjBalanceType, adjRemarks, adjInvoiceId);
        setIsCreatingAdj(false);
        setAdjOpen(false);
        setAdjCoaId(""); setAdjFindingId(""); setAdjAmount(""); setAdjRemarks(""); setAdjBalanceType(2); setAdjInvoiceId(null);
    };

    const handleCreateGlobalEwt = () => {
        const amt = parseFloat(globalEwtAmount);
        if (isNaN(amt) || amt <= 0 || !globalEwtRef) return toast.error("Invalid amount or reference.");
        createEwt(amt, globalEwtRef, null);
        setEwtOpen(false); setGlobalEwtAmount(""); setGlobalEwtRef("");
    };

    const handleAutoBalance = () => {
        const requiredAdjustment = -remainingToAllocate;
        setAdjAmount(Math.abs(requiredAdjustment).toFixed(2));
        setAdjRemarks(requiredAdjustment > 0 ? "Auto-balance: Shortage / Variance" : "Auto-balance: Overage");
        setAdjBalanceType(requiredAdjustment > 0 ? 2 : 1);
        setAdjCoaId(""); setAdjFindingId(""); setAdjInvoiceId(null); setAdjOpen(true);
    };

    const handleInvoiceDiscrepancy = (inv: UnpaidInvoice) => {
        const appliedSession = getInvoiceApplied(inv.id);
        const remaining = getInvoiceRequiredBalance(inv);
        const discrepancy = remaining - appliedSession;
        if (discrepancy <= 0.01) return toast.error(`Cannot accept a variance adjustment. Variance: ₱${discrepancy.toFixed(2)}`);
        setAdjAmount(Math.abs(discrepancy).toFixed(2));
        setAdjBalanceType(2);
        setAdjRemarks(`Variance for ${inv.invoiceNo}`);
        setAdjCoaId(""); setAdjFindingId(""); setAdjInvoiceId(inv.id); setAdjOpen(true);
    };

    const handleAutoCalculateEWT = (inv: UnpaidInvoice) => {
        const netOfVat = getInvoiceRequiredBalance(inv) / 1.12;
        const refNo = prompt(`Generate Form 2307 for ${inv.invoiceNo}\n\nEnter Reference Number:`, `2307-${inv.invoiceNo}`);
        if (refNo) createEwt(netOfVat * 0.01, refNo, inv.id);
    };


    const handlePrintAdjustments = () => {
        generateAdjustmentPDF(wallet, findings, allocations, docNo, salesmanName);
    };

    const handlePrintReceipt = () => {
        printSettlementReceiptA4(wallet, allocations, docNo, salesmanName, collectionDate, isPosted, companyProfile);
    };

    const filteredWallet = useMemo(() => {
        if (!poolSearch) return wallet;
        const searchLower = poolSearch.toLowerCase();
        return wallet.filter(w => 
            w.label.toLowerCase().includes(searchLower) ||
            w.type.toLowerCase().includes(searchLower) ||
            (w.customerName && w.customerName.toLowerCase().includes(searchLower))
        );
    }, [wallet, poolSearch]);

    if (isLoading) return <div className="p-10 flex h-full items-center justify-center text-center animate-pulse font-bold text-muted-foreground uppercase tracking-widest">Initializing Command Center...</div>;

    const combinedSources = [...wallet, ...credits];
    const filteredCredits = credits.filter(c => !creditSearch || c.label.toLowerCase().includes(creditSearch.toLowerCase()) || (c.customerName && c.customerName.toLowerCase().includes(creditSearch.toLowerCase())));

    return (
        <div className="fixed inset-0 w-full h-screen flex flex-col bg-muted/10 overflow-hidden relative z-50">

            {/* TOP NAVBAR */}
            <div className="bg-card border-b border-border py-2.5 px-4 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 shadow-sm shrink-0 relative z-20">
                <div className="flex items-start lg:items-center gap-3 w-full lg:w-auto">
                    {onClose && <Button variant="ghost" size="icon" onClick={() => onClose(false)} disabled={isSubmitting || isSuccess} className="shrink-0 h-8 w-8 rounded-full hover:bg-muted border border-border/50 disabled:opacity-50"><X size={16} className="text-muted-foreground hover:text-foreground"/></Button>}
                    <div className="min-w-0">
                        <h1 className="text-lg font-black flex items-center gap-1.5 truncate leading-none"><ShieldCheck className="text-primary shrink-0" size={16}/><span className="truncate">Settlement Console</span>{isPosted && <Badge variant="destructive" className="ml-2 bg-red-600 tracking-widest shadow-sm text-[8px] shrink-0 h-4 py-0"><Lock size={8} className="mr-1"/> LOCKED</Badge>}</h1>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1.5 truncate leading-none">Doc No: <span className="font-mono text-primary">{docNo}</span> • Collector: <span className="text-primary">{salesmanName}</span></p>
                    </div>
                </div>

                <div className="flex flex-wrap lg:flex-nowrap items-center gap-2 lg:gap-3 bg-muted/50 p-1.5 px-2.5 rounded-lg border border-border w-full lg:w-auto overflow-x-auto scrollbar-none">
                    <div className="flex flex-col border-r pr-2 lg:pr-3 border-border/50 shrink-0">
                        <span className="text-[8px] font-black uppercase text-muted-foreground tracking-tighter leading-none mb-0.5">Physical Pouch</span>
                        <span className="text-sm font-black font-mono text-foreground truncate leading-none">₱{pouchTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    </div>

                    {ewtTotal > 0 && (
                        <div className="flex flex-col border-r pr-2 lg:pr-3 border-border/50 shrink-0 animate-in fade-in slide-in-from-left-2">
                            <span className="text-[8px] font-black uppercase text-teal-600 tracking-tighter leading-none mb-0.5">EWT Holdings</span>
                            <span className="text-sm font-black font-mono text-teal-600 truncate leading-none">+₱{ewtTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                        </div>
                    )}

                    {Math.abs(varianceTotal) > 0.001 && (
                        <div className="flex flex-col border-r pr-2 lg:pr-3 border-border/50 shrink-0 animate-in fade-in slide-in-from-left-2">
                            <span className={cn("text-[8px] font-black uppercase tracking-tighter leading-none mb-0.5", varianceTotal > 0 ? "text-purple-600" : "text-red-600")}>
                                {varianceTotal > 0 ? "Shortage Credit" : "Overage Debit"}
                            </span>
                            <span className={cn("text-sm font-black font-mono truncate leading-none", varianceTotal > 0 ? "text-purple-600" : "text-red-600")}>
                                {varianceTotal < 0 ? '-' : '+'}₱{Math.abs(varianceTotal).toLocaleString(undefined, {minimumFractionDigits: 2})}
                            </span>
                        </div>
                    )}

                    <div className="flex flex-col border-r pr-2 lg:pr-3 border-border/50 shrink-0">
                        <span className="text-[8px] font-black uppercase text-emerald-600 tracking-tighter leading-none mb-0.5">Allocated</span>
                        <span className="text-sm font-black font-mono text-emerald-600 truncate leading-none">₱{totalAllocated.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    </div>
                    <div className="flex flex-col pr-1 shrink-0">
                        <span className="text-[8px] font-black uppercase tracking-tighter text-muted-foreground leading-none mb-0.5">Unallocated</span>
                        <span className={`text-sm font-black font-mono truncate leading-none ${Math.abs(remainingToAllocate) < 0.01 ? 'text-muted-foreground' : 'text-orange-500'}`}>₱{remainingToAllocate.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full lg:w-auto shrink-0">
                    {!isPosted && Math.abs(remainingToAllocate) > 0.01 && (
                        <Button onClick={handleAutoBalance} disabled={isSubmitting || isSuccess} variant="outline" size="sm" className="flex-1 lg:flex-none font-black text-[10px] uppercase tracking-widest shadow-sm border-orange-500 text-orange-600 hover:bg-orange-50 h-8">
                            <Wand2 size={12} className="mr-1.5"/> Auto-Balance
                        </Button>
                    )}

                    {wallet.filter(w => w.type === 'ADJUSTMENT').length > 0 && (
                        <Button onClick={handlePrintAdjustments} disabled={isSubmitting || isSuccess} variant="outline" size="sm" className="flex-1 lg:flex-none font-black text-[10px] uppercase tracking-widest shadow-sm border-purple-500 text-purple-600 hover:bg-purple-50 h-8">
                            <Printer size={12} className="mr-1.5"/> Print Adjustments
                        </Button>
                    )}

                    <Button onClick={handlePrintReceipt} disabled={isSubmitting} variant="outline" size="sm" className="flex-1 lg:flex-none font-black text-[10px] uppercase tracking-widest shadow-sm border-primary text-primary hover:bg-primary/10 h-8">
                        <Printer size={12} className="mr-1.5"/> Print Receipt
                    </Button>

                    {!isPosted && (
                        <>
                        <Button
                            onClick={handlePartialSave}
                            disabled={!hasPartialChanges || isSubmitting || isPartialSaving || isSuccess}
                            variant="outline"
                            size="sm"
                            className="flex-1 lg:flex-none font-black text-[10px] uppercase tracking-widest shadow-sm border-amber-500 text-amber-700 hover:bg-amber-50 h-8"
                        >
                            {isSuccess ? (
                                <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5"/> Saved!</span>
                            ) : isPartialSaving ? (
                                <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin"/> Saving...</span>
                            ) : (
                                <span className="flex items-center gap-1.5"><Save className="w-3.5 h-3.5"/> Save Partial</span>
                            )}
                        </Button>
                        <Button
                            onClick={handleMasterSave}
                            disabled={!isCommitReady || isSubmitting || isPartialSaving || isSuccess}
                            size="sm"
                            className={cn(
                                "flex-1 lg:flex-none font-black text-[10px] uppercase tracking-widest shadow-sm transition-all duration-300 h-8 overflow-hidden relative",
                                isSuccess ? "bg-emerald-500 hover:bg-emerald-600 text-white scale-105 shadow-emerald-500/50" :
                                    isSubmitting ? "bg-primary/80 cursor-wait" :
                                        !isCommitReady ? 'bg-muted text-muted-foreground' : 'bg-primary'
                            )}
                        >
                            {isSuccess ? (
                                <span className="flex items-center gap-1.5 animate-in zoom-in-50 duration-200"><CheckCircle2 className="w-3.5 h-3.5 animate-bounce"/> Saved!</span>
                            ) : isSubmitting ? (
                                <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin"/> Processing...</span>
                            ) : (
                                <span className="flex items-center gap-1.5">
                                    <Save className="w-3.5 h-3.5" />
                                    {!isPouchBalanced ? "Balance Pouch" : (!isCartBalanced ? "Balance Cart" : "Commit")}
                                </span>
                            )}
                        </Button>
                        </>
                    )}
                </div>
            </div>

            {/* MAIN WORKSPACE - NOW 3 COLUMNS */}
            <div className={cn(
                "flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3 p-3 lg:p-4 overflow-y-auto lg:overflow-hidden transition-all duration-500",
                (isSubmitting || isPartialSaving || isSuccess) ? "opacity-60 blur-[1px] pointer-events-none grayscale-[20%]" : "opacity-100"
            )}>
                {/* LEFT SIDEBAR: WALLET & CREDITS (col-span-3) */}
                <div className="col-span-1 lg:col-span-3 flex flex-col gap-3 overflow-hidden lg:h-full">
                    <div className="bg-card rounded-xl border border-border shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
                        <div className="bg-emerald-500/10 py-2 px-3 border-b border-emerald-500/20 flex flex-col gap-1.5 shrink-0">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5"><Wallet size={12}/> Liquidation Pool</span>
                                {!isPosted && (
                                    <div className="flex gap-1.5">
                                        <Popover open={ewtOpen} onOpenChange={setEwtOpen}>
                                            <PopoverTrigger asChild><Button size="sm" variant="outline" className="h-5 text-[8px] px-1.5 font-black uppercase tracking-widest text-teal-600 border-teal-200 hover:bg-teal-50 gap-1"><Plus size={8} strokeWidth={3}/> Form 2307</Button></PopoverTrigger>
                                            <PopoverContent className="w-[280px] p-4 space-y-3 shadow-xl border-teal-200" align="start">
                                                <div className="space-y-0.5 mb-2 border-b border-border/50 pb-2"><h4 className="font-black text-xs text-foreground flex items-center gap-1.5"><FileText size={14} className="text-teal-500"/> Pooled EWT</h4><p className="text-[9px] font-bold text-muted-foreground leading-tight">Add a Form 2307 that can be distributed across multiple invoices.</p></div>
                                                <div className="space-y-2">
                                                    <div className="flex flex-col gap-1"><label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Amount (₱)</label><Input type="number" placeholder="0.00" value={globalEwtAmount} onChange={(e) => setGlobalEwtAmount(e.target.value)} className="h-7 text-xs"/></div>
                                                    <div className="flex flex-col gap-1"><label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Reference No.</label><Input placeholder="E.g. 2307-XXX" value={globalEwtRef} onChange={(e) => setGlobalEwtRef(e.target.value)} className="h-7 text-xs"/></div>
                                                    <Button className="w-full mt-1 h-7 text-[9px] font-black uppercase tracking-widest bg-teal-600 hover:bg-teal-700 text-white" onClick={handleCreateGlobalEwt}>Add to Pouch</Button>
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                        <Popover open={adjOpen} onOpenChange={setAdjOpen}>
                                            <PopoverTrigger asChild><Button onClick={() => { setAdjInvoiceId(null); setAdjAmount(""); setAdjRemarks(""); setAdjBalanceType(2); setAdjCoaId(""); }} size="sm" variant="outline" className="h-5 text-[8px] px-1.5 font-black uppercase tracking-widest text-purple-600 border-purple-200 hover:bg-purple-50 gap-1"><Plus size={8} strokeWidth={3}/> Variance</Button></PopoverTrigger>
                                            <PopoverContent className="w-[280px] p-4 space-y-3 shadow-xl border-purple-200" align="start">
                                                <div className="space-y-0.5 mb-2 border-b border-border/50 pb-2"><h4 className="font-black text-xs text-foreground flex items-center gap-1.5"><Wallet size={14} className="text-purple-500"/> Record Variance</h4><p className="text-[9px] font-bold text-muted-foreground leading-tight">Select whether this increases assets or decreases them.</p></div>
                                                <div className="space-y-2">
                                                    <div className="flex flex-col gap-1">
                                                        <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Type</label>
                                                        <div className="flex gap-1.5">
                                                            <Button variant={adjBalanceType === 2 ? "default" : "outline"} onClick={() => { setAdjBalanceType(2); setAdjCoaId(""); setAdjFindingId(""); }} className={`h-7 w-1/2 text-[10px] font-bold ${adjBalanceType === 2 ? 'bg-purple-600 text-white' : 'text-muted-foreground'}`}>Shortage (Cr)</Button>
                                                            <Button variant={adjBalanceType === 1 ? "default" : "outline"} onClick={() => { setAdjBalanceType(1); setAdjCoaId(""); setAdjFindingId(""); }} className={`h-7 w-1/2 text-[10px] font-bold ${adjBalanceType === 1 ? 'bg-red-600 text-white' : 'text-muted-foreground'}`}>Overage (Dr)</Button>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col gap-1"><label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Category</label><Popover open={adjCoaOpen} onOpenChange={setAdjCoaOpen}><PopoverTrigger asChild><Button variant="outline" role="combobox" className={cn("w-full h-7 justify-between text-xs font-bold bg-background", !adjCoaId && "text-muted-foreground border-dashed border-primary/50")}><span className="truncate flex items-center gap-1.5"><Layers size={12}/>{adjCoaId ? uniqueCategories.find((c) => c.id === adjCoaId)?.title : "Select..."}</span><ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50"/></Button></PopoverTrigger><PopoverContent className="w-[260px] p-0" align="start"><Command><CommandInput placeholder="Search..." className="text-xs h-7"/><CommandList className="max-h-[200px] overflow-y-auto" onWheelCapture={(e) => e.stopPropagation()}><CommandEmpty>No categories found.</CommandEmpty><CommandGroup>{uniqueCategories.map((coa) => ( <CommandItem key={coa.id} value={coa.title} onSelect={() => { setAdjCoaId(coa.id); setAdjFindingId(""); setAdjCoaOpen(false); }} className="text-[11px] cursor-pointer py-1"><Check className={cn("mr-1.5 h-3 w-3 text-primary", adjCoaId === coa.id ? "opacity-100" : "opacity-0")}/>{coa.title}</CommandItem> ))}</CommandGroup></CommandList></Command></PopoverContent></Popover></div>
                                                    <div className="flex flex-col gap-1"><label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Reason</label><Popover open={adjAccountOpen} onOpenChange={setAdjAccountOpen}><PopoverTrigger asChild><Button variant="outline" role="combobox" disabled={!adjCoaId} className={cn("w-full h-7 justify-between text-xs font-bold bg-background", !adjFindingId && "text-muted-foreground border-dashed border-primary/50")}><span className="truncate pl-5">{adjFindingId ? filteredFindings.find((f) => f.id === adjFindingId)?.findingName : "Select reason..."}</span><ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50"/></Button></PopoverTrigger><PopoverContent className="w-[260px] p-0" align="start"><Command><CommandInput placeholder="Search reason..." className="text-xs h-7"/><CommandList className="max-h-[250px] overflow-y-auto" onWheelCapture={(e) => e.stopPropagation()}><CommandEmpty>No findings under this category.</CommandEmpty><CommandGroup>{filteredFindings.map((f) => ( <CommandItem key={f.id} value={f.findingName} onSelect={() => { setAdjFindingId(f.id); setAdjAccountOpen(false); }} className="text-[11px] cursor-pointer py-1"><Check className={cn("mr-1.5 h-3 w-3 text-primary", adjFindingId === f.id ? "opacity-100" : "opacity-0")}/>{f.findingName}</CommandItem> ))}</CommandGroup></CommandList></Command></PopoverContent></Popover></div>
                                                    <div className="flex flex-col gap-1"><label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Amount (₱)</label><Input type="number" placeholder="0.00" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} className="h-7 text-xs"/></div>
                                                    <div className="flex flex-col gap-1"><label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Remarks</label><Input placeholder="Reason for variance" value={adjRemarks} onChange={(e) => setAdjRemarks(e.target.value)} className="h-7 text-xs"/></div>
                                                    <Button className="w-full mt-1 h-7 text-[9px] font-black uppercase tracking-widest bg-purple-600 hover:bg-purple-700 text-white" disabled={!adjFindingId || adjAmount === "" || parseFloat(adjAmount) === 0 || isNaN(parseFloat(adjAmount)) || isCreatingAdj} onClick={handleCreateAdjustment}>{isCreatingAdj ? <Loader2 size={12} className="animate-spin"/> : "Inject into Pouch"}</Button>
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                )}
                            </div>
                            <Input placeholder="Search liquidation pool..." value={poolSearch} onChange={(e) => setPoolSearch(e.target.value)} className="h-6 text-[10px] font-bold shadow-inner bg-background border-emerald-200 focus-visible:ring-emerald-500 px-2"/>
                        </div>

                        <div className="p-2 flex-1 overflow-y-auto space-y-1.5 scrollbar-thin">
                            {filteredWallet.map(w => (
                                <WalletAssetCard
                                    key={w.id} item={w} getUsedAmount={getUsedAmount}
                                    editingId={editingId} setEditingId={setEditingId} editAmt={editAmt} setEditAmt={setEditAmt}
                                    editRef={editRef} setEditRef={setEditRef} editBalType={editBalType} setEditBalType={setEditBalType}
                                    editCoaId={editCoaId} setEditCoaId={setEditCoaId} editFId={editFId} setEditFId={setEditFId}
                                    editCoaOpen={editCoaOpen} setEditCoaOpen={setEditCoaOpen} editAccountOpen={editAccountOpen} setEditAccountOpen={setEditAccountOpen}
                                    uniqueCategories={uniqueCategories} editFilteredFindings={editFilteredFindings} findings={findings}
                                    editWalletItem={editWalletItem} deleteWalletItem={deleteWalletItem} isPosted={isPosted} cartInvoices={cartInvoices}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="bg-card rounded-xl border border-border shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
                        <div className="bg-purple-500/10 py-2 px-3 border-b border-purple-500/20 flex flex-col gap-1.5 shrink-0">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black uppercase tracking-widest text-purple-700 dark:text-purple-400 flex items-center gap-1.5">
                                    <Percent size={12}/> Available Credits
                                    {filteredCredits.length > 0 && (
                                        <Badge className="ml-1.5 bg-purple-600 hover:bg-purple-700 text-white font-black text-[9px] px-1.5 h-4 py-0 leading-none shrink-0 animate-bounce">
                                            {filteredCredits.length} Suggested
                                        </Badge>
                                    )}
                                </span>

                            </div>

                            <Input placeholder="Search local pool..." value={creditSearch} onChange={(e) => setCreditSearch(e.target.value)} className="h-6 text-[10px] font-bold shadow-inner bg-background border-purple-200 focus-visible:ring-purple-500 px-2"/>
                        </div>
                        <div className="p-2 flex-1 overflow-y-auto space-y-1.5 scrollbar-thin">
                            {creditsError && !isLoadingCredits && (
                                <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-center dark:border-amber-900/50 dark:bg-amber-950/20">
                                    <p className="text-[9px] font-bold text-amber-700 dark:text-amber-300">{creditsError}</p>
                                    <Button type="button" variant="outline" size="sm" className="mt-1 h-6 text-[9px] font-black uppercase tracking-widest text-amber-700 border-amber-300" onClick={retryCredits}>
                                        Retry
                                    </Button>
                                </div>
                            )}
                            {isLoadingCredits ? (
                                <div className="flex flex-col items-center justify-center h-full py-8">
                                    <Loader2 size={20} className="animate-spin text-purple-500 mb-2"/>
                                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest animate-pulse">Loading Credits...</p>
                                </div>
                            ) : filteredCredits.length === 0 ? (
                                <p className="text-[10px] text-center text-muted-foreground font-bold uppercase pt-6 italic">No matching credits</p>
                            ) : (
                                <>
                                {filteredCredits.map(c => {
                                    const used = c.originalAmount > 0 ? getUsedAmount(c.id) : 0;
                                    const remaining = getSourceAllocationCapacity(c.originalAmount, used);
                                    const isExhausted = c.originalAmount > 0 && remaining <= 0;
                                    return (
                                        <div key={`source-${c.id}`} className={`p-2 rounded-md border shadow-sm transition-all group ${isExhausted ? 'bg-muted/30 border-dashed opacity-60' : 'bg-background border-border border-l-[3px] border-l-purple-500'}`}>
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-[10px] font-black uppercase tracking-widest truncate pr-2 leading-tight">{c.label}</span>
                                                <Badge variant="outline" className="text-[7px] uppercase px-1 py-0 h-3.5 leading-none border-purple-200 text-purple-700 bg-purple-50">{c.type}</Badge>
                                            </div>
                                            {c.customerName && <div className="text-[8px] font-bold text-muted-foreground truncate mb-1 leading-tight" title={c.customerName}>{c.customerName}</div>}
                                            <div className={`flex justify-between gap-2 text-[10px] ${c.customerName ? 'mt-1 border-t border-border/50 pt-1' : 'mt-1.5'}`}>
                                                <div className="min-w-0 flex-1"><p className="text-[7px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-0.5">Original</p><p className="font-mono truncate leading-none">₱{c.originalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</p></div>
                                                <div className="text-right min-w-0 flex-1"><p className="text-[7px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-0.5">Remaining</p><p className={`font-mono font-black truncate leading-none ${isExhausted ? 'text-muted-foreground' : 'text-emerald-600'}`}>₱{remaining.toLocaleString(undefined, {minimumFractionDigits: 2})}</p></div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {hasMoreCredits && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="w-full h-7 text-[9px] font-black uppercase tracking-widest text-purple-700 border-purple-200"
                                        disabled={isLoadingCredits}
                                        onClick={loadMoreCredits}
                                    >
                                        {isLoadingCredits ? <Loader2 size={12} className="mr-1 animate-spin"/> : null}
                                        Load More Returns
                                    </Button>
                                )}
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* MIDDLE PANEL: CART TABLE (col-span-6) */}
                <div className="col-span-1 lg:col-span-6 bg-card rounded-xl border border-border shadow-sm flex flex-col overflow-hidden lg:h-full min-h-0">
                    <div className="bg-blue-500/10 py-2.5 px-4 border-b border-blue-500/20 flex flex-col gap-2 shrink-0">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black uppercase tracking-widest text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                                <Receipt size={14}/> Active Cart
                            </span>
                            <div className="flex gap-1.5 items-center">
                                {!isPosted && (
                                    <>
                                        <Button 
                                            onClick={handleSmartMatch} 
                                            variant="outline" 
                                            size="sm" 
                                            className="h-6 text-[8px] uppercase font-black tracking-widest border-purple-300 text-purple-700 dark:text-purple-400 hover:bg-purple-500/10 px-2.5"
                                        >
                                            <Wand2 size={10} className="mr-1 text-purple-500"/> Smart Match
                                        </Button>
                                        <Button onClick={loadRouteInvoices} disabled={isLoadingRoute} variant="secondary" size="sm" className="h-6 text-[8px] uppercase font-black tracking-widest bg-blue-100 hover:bg-blue-200 text-blue-700 px-2.5">{isLoadingRoute ? <Loader2 size={10} className="mr-1 animate-spin"/> : <Truck size={10} className="mr-1"/>}Load Route</Button>

                                    </>
                                )}
                    {!isPosted && hasClearableCart && <Button onClick={handleClearCart} disabled={isClearing || isSubmitting || isPartialSaving || isSuccess} variant="ghost" size="sm" className="h-6 text-[8px] uppercase font-black tracking-widest text-destructive hover:bg-destructive/10 px-2.5">{isClearing ? <Loader2 size={10} className="mr-1 animate-spin"/> : <Trash2 size={10} className="mr-1"/>}{isClearing ? "Clearing..." : "Clear Cart"}</Button>}
                            </div>
                        </div>

                        {!isPosted && (
                            <InvoiceSearchPopover searchOpen={searchOpen} setSearchOpen={setSearchOpen} searchQuery={searchQuery} setSearchQuery={setSearchQuery} isSearching={isSearching} searchResults={searchResults} searchError={searchError} searchHasMore={searchHasMore} addToCart={addToCart} loadMoreSearchResults={loadMoreSearchResults} />
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto scrollbar-thin bg-muted/5 relative">
                        <SettlementInvoiceCartTable
                            isPosted={isPosted} cartInvoices={cartInvoices} allocations={allocations} wallet={wallet} credits={credits} combinedSources={combinedSources}
                            cartTotalBalance={cartTotalBalance} cartTotalAppliedSession={cartTotalAppliedSession} removeFromCart={removeFromCart} handleInvoiceDiscrepancy={handleInvoiceDiscrepancy}
                            handleAutoCalculateEWT={handleAutoCalculateEWT} getInvoiceApplied={getInvoiceApplied} getUsedAmount={getUsedAmount}
                            activeInvoiceId={activeInvoiceId}
                            setActiveInvoiceId={setActiveInvoiceId}
                        />
                    </div>
                </div>

                {/* RIGHT PANEL: NEW ALLOCATION SIDE PANEL (col-span-3) */}
                <div className="col-span-1 lg:col-span-3 bg-card rounded-xl border border-border shadow-sm overflow-hidden lg:h-full">
                    <AllocationSidePanel
                        activeInvoiceId={activeInvoiceId}
                        cartInvoices={cartInvoices}
                        wallet={wallet}
                        credits={credits}
                        allocations={allocations}
                        handleAllocate={handleAllocate}
                        getUsedAmount={getUsedAmount}
                        getInvoiceApplied={getInvoiceApplied}
                    />
                </div>
            </div>
        </div>
    );
}
