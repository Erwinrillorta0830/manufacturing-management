"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { UnpaidInvoice, SettlementAllocation, UserDto } from "../../types";
import { fetchProvider } from "../../providers/fetchProvider";
import { fetchCompanyProfile } from "../../company-profile";
import type { CompanyProfile } from "../../company-profile";
import { toast } from "sonner";
import {
    mapRawPouchToSettlementPrintableData,
} from "../utils/settlement-printable-data";
import type { RawTreasuryPouch, SettlementPrintableWalletItem } from "../utils/settlement-printable-data";
import {
    capSettlementAllocation,
    findOverAllocatedInvoice,
    findUnderAllocatedInvoice,
    getCartBalanceTotals,
    getInvoiceAllocationCapacity,
    getInvoiceAppliedForSettlement,
    getInvoiceRequiredBalance,
    getSourceAllocationCapacity,
    SETTLEMENT_BALANCE_TOLERANCE,
} from "../utils/settlement-balance";

export type { RawAllocation, RawCashBucket, RawTreasuryPouch } from "../utils/settlement-printable-data";

export interface RawSalesman {
    id: number;
    salesmanName: string;
}

export interface RawMemoOrReturn {
    id: number;
    amount?: number;
    appliedAmount?: number;
    memoNumber?: string;
    memo_number?: string;
    customerCode?: string;
    customerName?: string;
    isApplied?: boolean;
    totalAmount?: number;
    availableAmount?: number;
    returnNumber?: string;
}

interface PaginatedRawReturnResponse {
    content?: RawMemoOrReturn[];
    totalPages?: number;
    currentPage?: number;
    hasMore?: boolean;
}

const getAvailableReturnAmount = (salesReturn: RawMemoOrReturn) => {
    if (salesReturn.availableAmount !== undefined) {
        return Math.max(0, Number(salesReturn.availableAmount) || 0);
    }
    return salesReturn.isApplied
        ? 0
        : Math.max(0, Number(salesReturn.totalAmount) || 0);
};

const normalizeCustomerValue = (value?: string) => value?.trim().toUpperCase() || "";

const isSameCustomer = (
    source: { customerCode?: string; customerName?: string },
    target: { customerCode?: string; customerName?: string },
) => {
    const targetCode = normalizeCustomerValue(target.customerCode);
    if (targetCode) return normalizeCustomerValue(source.customerCode) === targetCode;

    const targetName = normalizeCustomerValue(target.customerName);
    return Boolean(targetName) && normalizeCustomerValue(source.customerName) === targetName;
};

export interface WalletItem extends SettlementPrintableWalletItem {
    dbId?: number;
    findingId?: number;
    customerCode?: string;
    balanceTypeId?: number;
    isLocal?: boolean;
    invoiceId?: number;
}

export interface GeneralFinding {
    id: number;
    findingName: string;
    chartOfAccount?: { id?: number; coaId?: number; accountTitle: string; };
}

export interface DispatchPlan {
    id: number;
    docNo: string;
    driverName: string;
    vehicleName: string;
}

export interface PendingEditPayload {
    amount?: number;
    referenceNo?: string;
    findingId?: number;
    balanceTypeId?: number;
    remarks?: string;
}

export function useSettlement(pouchId: string | number, activeInvoiceId: number | null) {
    const [isLoading, setIsLoading] = useState(true);
    const [wallet, setWallet] = useState<WalletItem[]>([]);
    const [credits, setCredits] = useState<WalletItem[]>([]);
    const [salesmanName, setSalesmanName] = useState("Loading...");
    const [salesmanId, setSalesmanId] = useState<number | null>(null);
    const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);

    const [collectedBy, setCollectedBy] = useState<number | null>(null);
    const [collectedByName, setCollectedByName] = useState<string>("Encoder/System");
    const [crNo, setCrNo] = useState<string>("");

    const [docNo, setDocNo] = useState<string>(pouchId.toString());
    const [isPosted, setIsPosted] = useState<boolean>(false);
    const [collectionDate, setCollectionDate] = useState<string>("");
    const [cartInvoices, setCartInvoices] = useState<UnpaidInvoice[]>([]);
    const [allocations, setAllocations] = useState<SettlementAllocation[]>([]);
    const [findings, setFindings] = useState<GeneralFinding[]>([]);

    const [isLoadingRoute, setIsLoadingRoute] = useState(false);
    const [dispatchPlans, setDispatchPlans] = useState<DispatchPlan[]>([]);
    const [isLoadingPlans, setIsLoadingPlans] = useState(false);
    const [dispatchDate, setDispatchDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [isLoadingCredits, setIsLoadingCredits] = useState(false);
    const [creditsError, setCreditsError] = useState<string | null>(null);
    const [creditsPage, setCreditsPage] = useState(0);
    const [hasMoreCredits, setHasMoreCredits] = useState(false);
    const creditRequestController = useRef<AbortController | null>(null);
    const creditRequestVersion = useRef(0);
    const [isClearing, setIsClearing] = useState(false);
    const [hasPendingCartClear, setHasPendingCartClear] = useState(false);
    const [pendingDeletions, setPendingDeletions] = useState<{ id: string; dbId: number; type: "EWT" | "ADJUSTMENT" }[]>([]);
    const [pendingEdits, setPendingEdits] = useState<Record<string, { type: "EWT" | "ADJUSTMENT"; dbId: number; payload: PendingEditPayload }>>({});

    const fetchData = useCallback(async () => {
        if (!pouchId) return;
        setIsLoading(true);
        try {
            setPendingEdits({});
            setPendingDeletions([]);
            setAllocations([]);
            setCartInvoices([]);
            setWallet([]);
            setCredits([]);
            setCreditsPage(0);
            setHasMoreCredits(false);

            // 🚀 Strictly typing the users array
            const [pouch, salesmen, fetchedFindings, fetchedUsers, profileResult] = await Promise.all([
                fetchProvider.get<RawTreasuryPouch>(`/api/manufacturing/financial-management/collection-posting/collections/${pouchId}`),
                fetchProvider.get<RawSalesman[]>("/api/manufacturing/financial-management/collection-posting/master-data/salesmen"),
                fetchProvider.get<GeneralFinding[]>("/api/manufacturing/financial-management/collection-posting/findings").catch(() => []),
                fetchProvider.get<UserDto[]>("/api/manufacturing/financial-management/collection-posting/master-data/users").catch(() => []),
                fetchCompanyProfile().catch(() => ({ profile: null, status: "error" as const })),
            ]);

            if (!pouch) return;

            setDocNo(pouch.docNo || pouchId.toString());
            setIsPosted(pouch.isPosted === true);
            setCollectedBy(pouch.collectedBy || null);
            setCrNo(pouch.crNo || "");

            if (pouch.collectionDate) {
                const cDate = pouch.collectionDate.split('T')[0];
                setCollectionDate(cDate);
                setDispatchDate(cDate);
            }

            const currentSalesmanId = pouch.salesmanId || null;
            setSalesmanId(currentSalesmanId);
            setSalesmanName(salesmen?.find(s => s.id === currentSalesmanId)?.salesmanName || `Owner ID: ${currentSalesmanId}`);
            setCompanyProfile(profileResult.profile);
            setFindings(fetchedFindings || []);

            // 🚀 Strictly typing the user iteration
            if (pouch.collectedBy && fetchedUsers) {
                const u = fetchedUsers.find((user: UserDto) => user.id === pouch.collectedBy);
                if (u) setCollectedByName(`${u.firstName || ''} ${u.lastName || ''}`.trim());
            }

            const { wallet: newWallet, allocations: existingAllocations } = mapRawPouchToSettlementPrintableData(pouch);
            setWallet(newWallet);

            if (existingAllocations.length > 0) {
                const existingCartMap: Map<number, UnpaidInvoice> = new Map();

                existingAllocations.forEach((mappedAlloc) => {
                    if (mappedAlloc.invoiceId && !existingCartMap.has(mappedAlloc.invoiceId)) existingCartMap.set(mappedAlloc.invoiceId, {
                        ...mappedAlloc, id: mappedAlloc.invoiceId
                    } as unknown as UnpaidInvoice);
                });

                const finalInvoices = Array.from(existingCartMap.values()).map(inv => {
                    const myAllocs = existingAllocations.filter(a => a.invoiceId === inv.id);
                    const myPayments = myAllocs.filter(a => ["CASH", "CHECK", "EWT", "ADJUSTMENT"].includes(a.allocationType)).reduce((s, a) => s + a.amountApplied, 0);
                    const myMemos = myAllocs.filter(a => a.allocationType === "MEMO").reduce((s, a) => s + a.amountApplied, 0);
                    const myReturns = myAllocs.filter(a => a.allocationType === "RETURN").reduce((s, a) => s + a.amountApplied, 0);

                    const histPayments = Math.max(0, (inv.totalPayments || 0) - myPayments);
                    const histMemos = Math.max(0, (inv.totalMemos || 0) - myMemos);
                    const histReturns = Math.max(0, (inv.totalReturns || 0) - myReturns);

                    const trueStartingBalance = (inv.originalAmount || 0) - histPayments - histMemos - histReturns;

                    return { ...inv, totalPayments: histPayments, totalMemos: histMemos, totalReturns: histReturns, remainingBalance: trueStartingBalance };
                });

                setAllocations(existingAllocations);
                setCartInvoices(finalInvoices);
            }
        } catch (err) {
            console.error("Failed to fetch settlement data:", err);
        } finally {
            setIsLoading(false);
        }
    }, [pouchId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const activeInvoice = useMemo(
        () => cartInvoices.find(invoice => invoice.id === activeInvoiceId) || null,
        [activeInvoiceId, cartInvoices]
    );

    const creditCustomerCodes = useMemo(
        () => activeInvoice?.customerCode ? [activeInvoice.customerCode.trim().toUpperCase()] : [],
        [activeInvoice]
    );

    const creditCustomerNames = useMemo(
        () => !activeInvoice?.customerCode && activeInvoice?.customerName ? [activeInvoice.customerName] : [],
        [activeInvoice]
    );

    const loadCreditsPage = useCallback(async (page: number, append: boolean) => {
        creditRequestController.current?.abort();
        const controller = new AbortController();
        creditRequestController.current = controller;
        const version = ++creditRequestVersion.current;

        setIsLoadingCredits(true);
        setCreditsError(null);
        try {
            const customerFilter = new URLSearchParams();
            if (creditCustomerCodes.length > 0) customerFilter.set("customerCodes", creditCustomerCodes.join("|"));
            if (creditCustomerNames.length > 0) customerFilter.set("customerNames", creditCustomerNames.join("|"));
            const customerQuery = customerFilter.toString();
            const [memosResult, returnsResult] = await Promise.allSettled([
                page === 1
                    ? fetchProvider.getOrThrow<RawMemoOrReturn[]>(
                        `/api/manufacturing/financial-management/collection-posting/memos/available?${customerQuery}`,
                        {signal: controller.signal},
                    )
                    : Promise.resolve<RawMemoOrReturn[] | null>([]),
                fetchProvider.getOrThrow<PaginatedRawReturnResponse>(
                    `/api/manufacturing/financial-management/collection-posting/returns/available?${customerQuery}&currentPouchId=${encodeURIComponent(String(pouchId))}&page=${page}&size=25`,
                    {signal: controller.signal},
                ),
            ]);

            if (controller.signal.aborted || creditRequestVersion.current !== version) return;

            const memos = memosResult.status === "fulfilled" ? memosResult.value : null;
            const returnsResponse = returnsResult.status === "fulfilled" ? returnsResult.value : null;
            const failedSources = [
                memosResult.status === "rejected" && page === 1 ? "memos" : null,
                returnsResult.status === "rejected" ? "returns" : null,
            ].filter(Boolean);
            if (failedSources.length > 0) {
                setCreditsError(`Available ${failedSources.join(" and ")} could not be loaded. Please retry.`);
            }

            const returnsPage = (returnsResponse || {}) as PaginatedRawReturnResponse;
            const returnItems = returnsPage.content || [];
            setCredits(prev => {
                const newCredits = append ? [...prev] : [];
                memos?.forEach(m => {
                    const remainingMemoAmount = (m.amount || 0) - (m.appliedAmount || 0);
                    const id = `memo-${m.id}`;
                    if (remainingMemoAmount > 0 && !newCredits.some(c => c.id === id)) {
                        newCredits.push({id, dbId: m.id, type: "MEMO", label: `Memo: ${m.memo_number || m.memoNumber}`, originalAmount: remainingMemoAmount, customerCode: m.customerCode, customerName: m.customerName});
                    }
                });
                returnItems.forEach(r => {
                    const id = `return-${r.id}`;
                    const availableReturnAmount = getAvailableReturnAmount(r);
                    if (availableReturnAmount > SETTLEMENT_BALANCE_TOLERANCE && !newCredits.some(c => c.id === id)) {
                        newCredits.push({id, dbId: r.id, type: "RETURN", label: `Return: ${r.returnNumber}`, originalAmount: availableReturnAmount, customerCode: r.customerCode, customerName: r.customerName});
                    }
                });
                return newCredits;
            });
            if (returnsResult.status === "fulfilled") {
                const currentPage = returnsPage.currentPage || page;
                setCreditsPage(currentPage);
                setHasMoreCredits(returnsPage.hasMore ?? (currentPage < (returnsPage.totalPages || 0)));
            } else if (!append) {
                setCreditsPage(0);
                setHasMoreCredits(false);
            }
        } catch (error) {
            if (!controller.signal.aborted && creditRequestVersion.current === version) {
                console.error("Failed to fetch credits dynamically for linked customers", error);
                setCreditsError("Available credits could not be loaded. Please retry.");
                if (!append) setHasMoreCredits(false);
            }
        } finally {
            if (creditRequestVersion.current === version) setIsLoadingCredits(false);
        }
    }, [creditCustomerCodes, creditCustomerNames, pouchId]);

    useEffect(() => {
        creditRequestController.current?.abort();
        ++creditRequestVersion.current;

        if (creditCustomerCodes.length === 0 && creditCustomerNames.length === 0) {
            setCredits([]);
            setCreditsPage(0);
            setHasMoreCredits(false);
            setCreditsError(null);
            setIsLoadingCredits(false);
            return;
        }

        setCredits([]);
        setCreditsPage(0);
        setHasMoreCredits(false);
        void loadCreditsPage(1, false);
        return () => creditRequestController.current?.abort();
    }, [creditCustomerCodes, creditCustomerNames, loadCreditsPage]);

    const loadMoreCredits = useCallback(() => {
        if (!hasMoreCredits || isLoadingCredits || creditsPage === 0) return;
        void loadCreditsPage(creditsPage + 1, true);
    }, [creditsPage, hasMoreCredits, isLoadingCredits, loadCreditsPage]);

    const retryCredits = useCallback(() => {
        void loadCreditsPage(1, false);
    }, [loadCreditsPage]);

    useEffect(() => {
        if (!salesmanId || !dispatchDate) return;
        setIsLoadingPlans(true);
        fetchProvider.get<DispatchPlan[]>(`/api/manufacturing/financial-management/collection-posting/dispatch-plans?salesmanId=${salesmanId}&date=${dispatchDate}`)
            .then(data => setDispatchPlans(data || []))
            .catch(err => console.error("Failed to load dispatch plans", err))
            .finally(() => setIsLoadingPlans(false));
    }, [salesmanId, dispatchDate]);

    const fetchAndInjectExternalCredit = async (documentNo: string, type: "MEMO" | "RETURN") => {
        try {
            if (!activeInvoice) return false;

            const safeDocNo = encodeURIComponent(documentNo.trim());
            const customerQuery = activeInvoice.customerCode
                ? `&customerCode=${encodeURIComponent(activeInvoice.customerCode)}`
                : "";
            const endpoint = type === "MEMO"
                ? `/api/manufacturing/financial-management/collection-posting/memos/search?documentNo=${safeDocNo}${customerQuery}`
                : `/api/manufacturing/financial-management/collection-posting/returns/search?documentNo=${safeDocNo}&currentPouchId=${encodeURIComponent(String(pouchId))}${customerQuery}`;

            const data = await fetchProvider.get<RawMemoOrReturn>(endpoint);
            if (!data || !isSameCustomer(data, activeInvoice)) return false;

            setCredits(prev => {
                const newCredits = [...prev];
                const id = type === "MEMO" ? `memo-${data.id}` : `return-${data.id}`;

                if (!newCredits.some(c => c.id === id)) {
                    if (type === "MEMO") {
                        const remaining = (data.amount || 0) - (data.appliedAmount || 0);
                        if (remaining > 0) {
                        newCredits.unshift({ id, dbId: data.id, type: "MEMO", label: `Memo: ${data.memo_number || data.memoNumber}`, originalAmount: remaining, customerCode: data.customerCode, customerName: data.customerName });
                        }
                    } else {
                        const availableReturnAmount = getAvailableReturnAmount(data);
                        if (availableReturnAmount > SETTLEMENT_BALANCE_TOLERANCE) {
                            newCredits.unshift({ id, dbId: data.id, type: "RETURN", label: `Return: ${data.returnNumber}`, originalAmount: availableReturnAmount, customerCode: data.customerCode, customerName: data.customerName });
                        }
                    }
                }
                return newCredits;
            });
            return true;
        } catch (err) {
            console.error(`Failed to fetch external ${type}`, err);
            return false;
        }
    };

    const editWalletItem = async (itemId: string, updatedFields: Partial<WalletItem>) => {
        const item = wallet.find(w => w.id === itemId);
        if (!item) return;

        if (!item.isLocal && (item.type === "ADJUSTMENT" || item.type === "EWT")) {
            const dbId = item.dbId;
            if (!dbId) {
                toast.error("Database ID missing. Cannot update.");
                return;
            }
            const payload = item.type === "EWT" ? {
                amount: updatedFields.originalAmount !== undefined ? updatedFields.originalAmount : item.originalAmount,
                referenceNo: updatedFields.customerName !== undefined ? updatedFields.customerName : item.customerName
            } : {
                findingId: updatedFields.findingId !== undefined ? updatedFields.findingId : item.findingId,
                amount: updatedFields.originalAmount !== undefined ? updatedFields.originalAmount : item.originalAmount,
                balanceTypeId: updatedFields.balanceTypeId !== undefined ? updatedFields.balanceTypeId : item.balanceTypeId,
                remarks: updatedFields.customerName !== undefined ? updatedFields.customerName : item.customerName
            };

            setPendingEdits(prev => ({
                ...prev,
                [itemId]: {
                    type: item.type as "ADJUSTMENT" | "EWT",
                    dbId,
                    payload
                }
            }));
        }

        setWallet(prev => prev.map(w => w.id === itemId ? {...w, ...updatedFields} : w));
        if (updatedFields.originalAmount !== undefined) {
            setAllocations(prev => prev.map(a => {
                if (a.sourceTempId === itemId && a.amountApplied > updatedFields.originalAmount!) {
                    return {...a, amountApplied: updatedFields.originalAmount!};
                }
                return a;
            }));
        }
    };

    const deleteWalletItem = async (itemId: string, type: string, silent = false) => {
        const item = wallet.find(w => w.id === itemId);
        if (!item) return;

        if (!item.isLocal && (type === "ADJUSTMENT" || type === "EWT")) {
            if (!silent && !confirm("Are you sure you want to delete this record? This deletion will be committed once you save the settlement session.")) return;
            const dbId = item.dbId;
            if (!dbId) {
                if (!silent) toast.error("Database ID missing. Cannot delete.");
                return;
            }

            setPendingEdits(prev => {
                const copy = { ...prev };
                delete copy[itemId];
                return copy;
            });

            setPendingDeletions(prev => [
                ...prev,
                { id: itemId, dbId, type: type as "EWT" | "ADJUSTMENT" }
            ]);
        }

        setWallet(prev => prev.filter(w => w.id !== itemId));
        setAllocations(prev => prev.filter(a => a.sourceTempId !== itemId));
    };

    const addToCart = (invoice: Partial<UnpaidInvoice>) => {
        const safeId = invoice.id || (invoice as unknown as { invoiceId: number }).invoiceId;
        if (!safeId) return;

        setCartInvoices(prev => {
            if (prev.some(inv => Number(inv.id) === Number(safeId))) {
                return prev;
            }
            return [...prev, {
                ...invoice,
                originalAmount: invoice.originalAmount || 0,
                id: safeId
            } as UnpaidInvoice];
        });
    };

    const removeFromCart = async (invoiceId: number) => {
        const linkedItems = wallet.filter(w => w.invoiceId === invoiceId && (w.type === "EWT" || w.type === "ADJUSTMENT"));
        for (const item of linkedItems) {
            await deleteWalletItem(item.id, item.type, true);
        }
        setCartInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
        setAllocations(prev => prev.filter(a => a.invoiceId !== invoiceId));
    };

    const clearCart = async (): Promise<boolean> => {
        if (!confirm("Are you sure you want to clear all invoices and allocations from this session? Any linked Variances or EWTs will be destroyed.")) {
            return false;
        }

        setIsClearing(true);
        try {
            await fetchProvider.post(`/api/manufacturing/financial-management/collection-posting/collections/${pouchId}/allocate/clear`, {});
            setPendingEdits({});
            setPendingDeletions([]);
            await fetchData();
            setHasPendingCartClear(true);
            toast.success("Cart cleared and staged allocations rolled back.");
            return true;
        } catch (err) {
            toast.error("Failed to clear staged settlement allocations.");
            console.error("Failed to clear settlement cart:", err);
            return false;
        } finally {
            setIsClearing(false);
        }
    };

    const loadDispatchPlanInvoices = async (planId: number) => {
        setIsLoadingRoute(true);
        try {
            const data = await fetchProvider.get<UnpaidInvoice[]>(`/api/manufacturing/financial-management/collection-posting/dispatch-plans/invoices?planId=${planId}&currentPouchId=${encodeURIComponent(String(pouchId))}`);
            if (!data || data.length === 0) {
                toast.info("No additional pending invoices found for this specific Dispatch Plan.");
                return;
            }

            setCartInvoices(prev => {
                const newInvoices = data.filter(inv => {
                    const safeId = inv.id || (inv as unknown as { invoiceId: number }).invoiceId;
                    return !prev.some(cartInv => Number(cartInv.id) === Number(safeId));
                }).map(inv => ({
                    ...inv,
                    originalAmount: inv.originalAmount || 0,
                    id: inv.id || (inv as unknown as { invoiceId: number }).invoiceId
                }));

                if (newInvoices.length === 0) {
                    toast.info("No additional pending invoices found for this specific Dispatch Plan.");
                    return prev;
                }
                return [...prev, ...newInvoices];
            });
        } catch (err) {
            console.error("Failed to load dispatch plan invoices", err);
            toast.error("Failed to fetch dispatch data.");
        } finally {
            setIsLoadingRoute(false);
        }
    };

    const loadRouteInvoices = async () => {
        if (!salesmanId || !collectionDate) return toast.error("Cannot load route: Missing Salesman ID or Date.");
        setIsLoadingRoute(true);
        try {
            const data = await fetchProvider.get<UnpaidInvoice[]>(`/api/manufacturing/financial-management/collection-posting/invoices/route?salesmanId=${encodeURIComponent(String(salesmanId))}&date=${encodeURIComponent(collectionDate)}&currentPouchId=${encodeURIComponent(String(pouchId))}`);
            if (!data || data.length === 0) {
                toast.info("No additional pending invoices found for this route on or before " + collectionDate);
                return;
            }

            setCartInvoices(prev => {
                const newInvoices = data.filter(inv => {
                    const safeId = inv.id || (inv as unknown as { invoiceId: number }).invoiceId;
                    return !prev.some(cartInv => Number(cartInv.id) === Number(safeId));
                }).map(inv => ({
                    ...inv,
                    originalAmount: inv.originalAmount || 0,
                    id: inv.id || (inv as unknown as { invoiceId: number }).invoiceId
                }));

                if (newInvoices.length === 0) {
                    toast.info("No additional pending invoices found for this route on or before " + collectionDate);
                    return prev;
                }
                return [...prev, ...newInvoices];
            });
        } catch (err) {
            console.error("Failed to load route invoices", err);
        } finally {
            setIsLoadingRoute(false);
        }
    };

    const getUsedAmount = (sourceId: string) => Math.round(allocations.filter(a => a.sourceTempId === sourceId).reduce((sum, a) => sum + a.amountApplied, 0) * 100) / 100;
    const getInvoiceApplied = (invoiceId: number) => getInvoiceAppliedForSettlement(allocations, invoiceId);

    const handleAllocate = (invoiceId: number, sourceId: string, amountInput: number) => {
        setAllocations(prev => {
            const filtered = prev.filter(a => !(a.invoiceId === invoiceId && a.sourceTempId === sourceId));
            const safeInput = Math.abs(amountInput);

            if (safeInput > 0.009) {
                const combinedSources = [...wallet, ...credits];
                const wItem = combinedSources.find(w => w.id === sourceId);
                const inv = cartInvoices.find(i => i.id === invoiceId);

                if (wItem && inv) {
                    const isCredit = wItem.type === "MEMO" || wItem.type === "RETURN";
                    if (isCredit && !isSameCustomer(wItem, inv)) return filtered;

                    const walletUsedElsewhere = prev
                        .filter(a => a.sourceTempId === sourceId && a.invoiceId !== invoiceId)
                        .reduce((sum, a) => sum + a.amountApplied, 0);
                    const walletAvailable = getSourceAllocationCapacity(wItem.originalAmount, walletUsedElsewhere);
                    const invoiceUsedElsewhere = prev
                        .filter(a => a.invoiceId === invoiceId && a.sourceTempId !== sourceId)
                        .reduce((sum, a) => sum + a.amountApplied, 0);
                    const invoiceAvailable = getInvoiceAllocationCapacity(
                        getInvoiceRequiredBalance(inv),
                        invoiceUsedElsewhere
                    );
                    const finalAmount = capSettlementAllocation(safeInput, walletAvailable, invoiceAvailable);

                    if (finalAmount > 0.009) {
                        filtered.push({
                            invoiceId: invoiceId,
                            invoiceNo: inv.invoiceNo || "",
                            customerCode: inv.customerCode,
                            customerName: inv.customerName || "",
                            amountApplied: finalAmount,
                            allocationType: wItem.type || "CASH",
                            sourceTempId: sourceId,
                            originalAmount: inv.originalAmount || 0,
                            remainingBalance: inv.remainingBalance || 0,
                            maxSettleableAmount: inv.maxSettleableAmount,
                            totalPayments: inv.totalPayments || 0,
                            totalMemos: inv.totalMemos || 0,
                            totalReturns: inv.totalReturns || 0,
                            transactionDate: inv.transactionDate ? String(inv.transactionDate) : "",
                            dueDate: inv.dueDate ? String(inv.dueDate) : "",
                            agingDays: inv.agingDays || 0,
                            history: inv.history || []
                        });
                    }
                }
            }
            return filtered;
        });
    };

    const createEwt = async (amount: number, referenceNo: string, invoiceId?: number | null) => {
        try {
            const tempEwtId = `ewt-new-${Date.now()}`;
            setWallet(prev => [...prev, {
                id: tempEwtId, type: "EWT", label: `Form 2307: ${referenceNo}`, originalAmount: Math.abs(amount),
                customerName: referenceNo, balanceTypeId: 2, isLocal: true, invoiceId: invoiceId || undefined
            }]);

            if (invoiceId && amount > 0) {
                setAllocations(prevAlloc => {
                    const inv = cartInvoices.find(i => i.id === invoiceId);
                    if (!inv) return prevAlloc;
                    return [...prevAlloc, {
                        invoiceId: invoiceId, invoiceNo: inv.invoiceNo || "", customerName: inv.customerName || "",
                        amountApplied: amount, allocationType: "EWT", sourceTempId: tempEwtId, originalAmount: inv.originalAmount || 0,
                        remainingBalance: inv.remainingBalance || 0, totalPayments: inv.totalPayments || 0, totalMemos: inv.totalMemos || 0,
                        maxSettleableAmount: inv.maxSettleableAmount,
                        totalReturns: inv.totalReturns || 0, transactionDate: inv.transactionDate ? String(inv.transactionDate) : "",
                        dueDate: inv.dueDate ? String(inv.dueDate) : "", agingDays: inv.agingDays || 0, history: inv.history || []
                    }];
                });
            }
        } catch (err) {
            console.error("Failed to create EWT in UI.", err);
        }
    };

    const createAdjustment = async (findingId: number, amount: number, balanceTypeId: number, remarks?: string, invoiceId?: number | null) => {
        try {
            const finding = findings.find(f => f.id === findingId);
            const findingName = finding ? finding.findingName : "Adjustment";
            const tempAdjId = `adj-new-${Date.now()}`;

            setWallet(prev => [...prev, {
                id: tempAdjId, type: "ADJUSTMENT", label: findingName, originalAmount: Math.abs(amount),
                dbId: findingId, findingId: findingId, customerName: remarks, balanceTypeId: balanceTypeId, isLocal: true, invoiceId: invoiceId || undefined
            }]);

            if (invoiceId && amount > 0) {
                setAllocations(prevAlloc => {
                    const inv = cartInvoices.find(i => i.id === invoiceId);
                    if (!inv) return prevAlloc;
                    return [...prevAlloc, {
                        invoiceId: invoiceId, invoiceNo: inv.invoiceNo || "", customerName: inv.customerName || "",
                        amountApplied: Math.abs(amount), allocationType: "ADJUSTMENT", sourceTempId: tempAdjId, originalAmount: inv.originalAmount || 0,
                        remainingBalance: inv.remainingBalance || 0, totalPayments: inv.totalPayments || 0, totalMemos: inv.totalMemos || 0,
                        maxSettleableAmount: inv.maxSettleableAmount,
                        totalReturns: inv.totalReturns || 0, transactionDate: inv.transactionDate ? String(inv.transactionDate) : "",
                        dueDate: inv.dueDate ? String(inv.dueDate) : "", agingDays: inv.agingDays || 0, history: inv.history || []
                    }];
                });
            }
        } catch (err) {
            console.error("Failed to create temporary adjustment in UI.", err);
        }
    };

    const hasClearableCart = cartInvoices.length > 0
        || allocations.length > 0
        || wallet.some(item => item.isLocal)
        || Object.keys(pendingEdits).length > 0
        || pendingDeletions.length > 0;

    const hasPartialChanges = hasClearableCart || hasPendingCartClear;

    const savePartialSettlement = async (): Promise<boolean> => {
        if (!hasPartialChanges) {
            toast.error("Add settlement progress before saving a partial settlement.");
            return false;
        }

        const overAllocatedInvoice = findOverAllocatedInvoice(cartInvoices, allocations);
        if (overAllocatedInvoice) {
            toast.error(`The allocation for ${overAllocatedInvoice.invoiceNo} exceeds its remaining balance.`);
            return false;
        }

        try {
            for (const [, editInfo] of Object.entries(pendingEdits)) {
                const endpoint = editInfo.type === "EWT"
                    ? `/api/manufacturing/financial-management/collection-posting/ewts/${editInfo.dbId}`
                    : `/api/manufacturing/financial-management/collection-posting/adjustments/${editInfo.dbId}`;
                await fetchProvider.put(endpoint, editInfo.payload);
            }

            for (const delInfo of pendingDeletions) {
                const endpoint = delInfo.type === "EWT"
                    ? `/api/manufacturing/financial-management/collection-posting/ewts/${delInfo.dbId}`
                    : `/api/manufacturing/financial-management/collection-posting/adjustments/${delInfo.dbId}`;
                await fetchProvider.delete(endpoint);
            }

            const newAdjustments = wallet.filter(w => w.type === "ADJUSTMENT" && w.isLocal).map(w => ({
                findingId: w.findingId || w.dbId, amount: w.originalAmount, balanceTypeId: w.balanceTypeId || 1,
                remarks: w.customerName || "Session Variance", invoiceId: allocations.find(a => a.sourceTempId === w.id)?.invoiceId || null, tempId: w.id
            }));

            const newEwts = wallet.filter(w => w.type === "EWT" && w.isLocal).map(w => ({
                amount: w.originalAmount, referenceNo: w.customerName || "Form 2307", tempId: w.id
            }));

            if (newAdjustments.some(adjustment => !adjustment.findingId)) {
                throw new Error("Cannot save: An adjustment is missing a valid Finding Type.");
            }

            const persistentAllocations: { invoiceId: number; amountApplied: number; allocationType: string; sourceTempId: string; }[] = [];
            cartInvoices.forEach(inv => {
                const invAllocs = allocations.filter(a => a.invoiceId === inv.id && a.amountApplied > 0);
                if (invAllocs.length > 0) {
                    persistentAllocations.push(...invAllocs.map(a => ({
                        invoiceId: a.invoiceId, amountApplied: a.amountApplied, allocationType: a.allocationType, sourceTempId: a.sourceTempId
                    })));
                } else {
                    persistentAllocations.push({ invoiceId: inv.id, amountApplied: 0, allocationType: "NONE", sourceTempId: "NONE" });
                }
            });

            await fetchProvider.post(`/api/manufacturing/financial-management/collection-posting/collections/${pouchId}/allocate/partial`, {
                collectedBy: collectedBy || undefined,
                crNo: crNo || undefined,
                newAdjustments,
                newEwts,
                allocations: persistentAllocations
            });

            setPendingEdits({});
            setPendingDeletions([]);
            toast.success("Partial settlement saved. You can resume it from the queue.");
            setHasPendingCartClear(false);
            await fetchData();
            return true;
        } catch (err) {
            toast.error(err instanceof Error && err.message ? err.message : "Failed to save partial settlement.");
            console.error(err);
            return false;
        }
    };

    const submitSettlement = async (): Promise<boolean> => {
        try {
            const underAllocatedInvoice = findUnderAllocatedInvoice(cartInvoices, allocations);
            if (underAllocatedInvoice) {
                const remaining = getInvoiceRequiredBalance(underAllocatedInvoice) - getInvoiceApplied(underAllocatedInvoice.id);
                toast.error(
                    `Invoice ${underAllocatedInvoice.invoiceNo} still has ₱${remaining.toLocaleString(undefined, { minimumFractionDigits: 2 })} unallocated. Apply the balance or remove it from the cart.`
                );
                return false;
            }

            const overAllocatedInvoice = findOverAllocatedInvoice(cartInvoices, allocations);
            if (overAllocatedInvoice) {
                toast.error(`The allocation for ${overAllocatedInvoice.invoiceNo} exceeds its remaining balance.`);
                return false;
            }

            const cartTotals = getCartBalanceTotals(cartInvoices, allocations);
            if (Math.abs(cartTotals.difference) > SETTLEMENT_BALANCE_TOLERANCE) {
                toast.error(
                    `Settlement cart is not balanced. ₱${Math.abs(cartTotals.difference).toLocaleString(undefined, { minimumFractionDigits: 2 })} remains unallocated.`
                );
                return false;
            }

            // 1. Process all pending edits in database
            for (const [, editInfo] of Object.entries(pendingEdits)) {
                const endpoint = editInfo.type === "EWT"
                    ? `/api/manufacturing/financial-management/collection-posting/ewts/${editInfo.dbId}`
                    : `/api/manufacturing/financial-management/collection-posting/adjustments/${editInfo.dbId}`;
                await fetchProvider.put(endpoint, editInfo.payload);
            }

            // 2. Process all pending deletions in database
            for (const delInfo of pendingDeletions) {
                const endpoint = delInfo.type === "EWT"
                    ? `/api/manufacturing/financial-management/collection-posting/ewts/${delInfo.dbId}`
                    : `/api/manufacturing/financial-management/collection-posting/adjustments/${delInfo.dbId}`;
                await fetchProvider.delete(endpoint);
            }

            // Clear the queues since DB changes succeeded
            setPendingEdits({});
            setPendingDeletions([]);

            const newAdjustments = wallet.filter(w => w.type === "ADJUSTMENT" && w.isLocal).map(w => ({
                findingId: w.findingId || w.dbId, amount: w.originalAmount, balanceTypeId: w.balanceTypeId || 1,
                remarks: w.customerName || "Session Variance", invoiceId: allocations.find(a => a.sourceTempId === w.id)?.invoiceId || null, tempId: w.id
            }));

            const newEwts = wallet.filter(w => w.type === "EWT" && w.isLocal).map(w => ({
                amount: w.originalAmount, referenceNo: w.customerName || "Form 2307", tempId: w.id
            }));

            const invalidAdjustment = newAdjustments.find(a => !a.findingId);
            if (invalidAdjustment) {
                toast.error("Cannot save: An adjustment is missing a valid Finding Type.");
                return false;
            }

            const persistentAllocations: { invoiceId: number; amountApplied: number; allocationType: string; sourceTempId: string; }[] = [];

            cartInvoices.forEach(inv => {
                const invAllocs = allocations.filter(a => a.invoiceId === inv.id && a.amountApplied > 0);
                if (invAllocs.length > 0) {
                    persistentAllocations.push(...invAllocs.map(a => ({
                        invoiceId: a.invoiceId, amountApplied: a.amountApplied, allocationType: a.allocationType, sourceTempId: a.sourceTempId
                    })));
                } else {
                    persistentAllocations.push({ invoiceId: inv.id, amountApplied: 0, allocationType: "NONE", sourceTempId: "NONE" });
                }
            });

            const payload = {
                collectedBy: collectedBy || undefined,
                crNo: crNo || undefined,
                newAdjustments,
                newEwts,
                allocations: persistentAllocations
            };

            await fetchProvider.post(`/api/manufacturing/financial-management/collection-posting/collections/${pouchId}/allocate`, payload);
            toast.success("Settlement successfully committed to the ledger!");
            await fetchData();
            return true;
        } catch (err) {
            toast.error(err instanceof Error && err.message ? err.message : "Failed to secure settlement to ledger.");
            console.error(err);
            return false;
        }
    };

    return {
        isLoading, wallet, credits, cartInvoices, allocations, setAllocations, salesmanName, salesmanId, findings, docNo, isPosted, isClearing, companyProfile,
        isLoadingRoute, addToCart, removeFromCart, clearCart, loadRouteInvoices, fetchAndInjectExternalCredit,
        getUsedAmount, getInvoiceApplied, handleAllocate, createAdjustment, createEwt, submitSettlement,
        hasPartialChanges, hasClearableCart, savePartialSettlement,
        deleteWalletItem, editWalletItem, dispatchPlans, isLoadingPlans, loadDispatchPlanInvoices, dispatchDate, setDispatchDate,
        collectedByName, isLoadingCredits, creditsError, retryCredits, hasMoreCredits, loadMoreCredits, collectionDate
    };
}
