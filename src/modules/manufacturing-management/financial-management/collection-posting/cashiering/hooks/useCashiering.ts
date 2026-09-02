"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchProvider } from "../../providers/fetchProvider";
import { toast } from "sonner";
import {
    CurrentUser, CollectionSummary, Salesman, Bank, Denomination,
    COA, PaymentMethod, Customer, UnpaidInvoice, CheckDetail, UserDto,
    PaginatedCollectionResponse
} from "../../types";

export interface CashieringListQuery {
    search: string;
    salesmanCode: string;
    dateFrom: string;
    dateTo: string;
    page: number;
    size: number;
    sortField: keyof CollectionSummary;
    sortDirection: "asc" | "desc";
    refreshKey: number;
}

interface ModalLookupData {
    banks: Bank[];
    denominationMaster: Denomination[];
    coas: COA[];
    paymentMethods: PaymentMethod[];
    customers: Customer[];
    users: UserDto[];
}

interface PouchDetailResponse {
    id: number;
    salesmanId: number;
    collectedBy?: number; // 🚀 Added for hydration
    crNo?: string;        // 🚀 Added for hydration
    collectionDate: string;
    remarks: string;
    cashBuckets: {
        tempId: string;
        denominationId?: number;
        paymentMethodId?: number;
        coaId: number;
        bankId: number | null;
        customerCode?: string;
        invoiceId?: number;
        referenceNo: string;
        amount: number;
        quantity: number;
        chequeDate: string | null;
    }[];
}

export const getPositiveAmount = (value: string): number | null => {
    if (!value?.trim()) return null;

    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
};

export interface CheckValidationErrors {
    paymentMethod: boolean;
    coa: boolean;
    bank: boolean;
    reference: boolean;
    chequeDate: boolean;
    amount: boolean;
}

export const getCheckValidationErrors = (check: CheckDetail): CheckValidationErrors => {
    const isAdjustment = check.tempId?.startsWith("adj-") ?? false;
    const isEwt = check.tempId?.startsWith("ewt-") ?? false;
    const isGenericRemittance = !isAdjustment && !isEwt;

    return {
        paymentMethod: isGenericRemittance && !check.paymentMethodId?.trim(),
        coa: isGenericRemittance && !check.coaId?.trim(),
        bank: isGenericRemittance && !check.bankId?.trim(),
        reference: !isAdjustment && !check.checkNo?.trim(),
        chequeDate: isGenericRemittance && !check.chequeDate?.trim(),
        amount: getPositiveAmount(check.amount) === null,
    };
};

const getSubmissionErrorMessage = (error: unknown): string => {
    const fallback = "Error securing pouch.";
    if (!(error instanceof Error) || !error.message) return fallback;

    try {
        const parsed = JSON.parse(error.message) as { message?: string; detail?: string; error?: string };
        return parsed.detail || parsed.message || parsed.error || fallback;
    } catch {
        return error.message;
    }
};

const getListErrorMessage = (error: unknown): string => {
    const fallback = "Unable to load collection pouches. Please retry.";
    if (!(error instanceof Error) || !error.message) return fallback;

    const message = error.message.trim();
    if (!message || /^<(!doctype|html)/i.test(message)) return fallback;
    return message.length > 240 ? `${message.slice(0, 237)}...` : message;
};

export function useCashiering(
    currentUser: CurrentUser,
    listQuery: CashieringListQuery,
    onCreated?: () => void
) {
    const [isSheetOpen, setIsSheetOpen] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isLookupsLoading, setIsLookupsLoading] = useState<boolean>(false);
    const [isSheetLoading, setIsSheetLoading] = useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [submissionError, setSubmissionError] = useState<string | null>(null);
    const [submitAttempted, setSubmitAttempted] = useState<boolean>(false);
    const [touchedChecks, setTouchedChecks] = useState<Record<string, Record<string, boolean>>>({});

    const setCheckTouched = useCallback((tempId: string, field: string) => {
        setTouchedChecks(prev => ({
            ...prev,
            [tempId]: {
                ...(prev[tempId] || {}),
                [field]: true
            }
        }));
    }, []);
    const [listError, setListError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<number | null>(null);

    const [masterList, setMasterList] = useState<CollectionSummary[]>([]);
    const [totalElements, setTotalElements] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [salesmen, setSalesmen] = useState<Salesman[]>([]);
    const [users, setUsers] = useState<UserDto[]>([]); // 🚀 NEW: Users state
    const [banks, setBanks] = useState<Bank[]>([]);
    const [coas, setCoas] = useState<COA[]>([]);
    const [denominationMaster, setDenominationMaster] = useState<Denomination[]>([]);

    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);

    const [customerInvoices, setCustomerInvoices] = useState<Record<string, UnpaidInvoice[]>>({});
    const [routeInvoices, setRouteInvoices] = useState<UnpaidInvoice[]>([]);

    const [salesmanId, setSalesmanId] = useState<string>("");
    const [collectedBy, setCollectedBy] = useState<string>(""); // 🚀 NEW: Collected By state
    const [crNo, setCrNo] = useState<string>("");               // 🚀 NEW: CR No. state
    const [collectionDate, setCollectionDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [remarks, setRemarks] = useState<string>("");

    const [denominations, setDenominations] = useState<Record<number, number>>({});
    const [checks, setChecks] = useState<CheckDetail[]>([]);
    const modalLookupsCache = useRef<ModalLookupData | null>(null);
    const modalLookupsPromise = useRef<Promise<ModalLookupData> | null>(null);
    const listRequestController = useRef<AbortController | null>(null);
    const listRequestVersion = useRef(0);
    const invoiceRequestController = useRef<AbortController | null>(null);
    const invoiceRequestVersion = useRef(0);

    const totalCash = denominationMaster.reduce((sum, d) => sum + (d.amount * (denominations[d.id] || 0)), 0);
    const totalChecks = checks.reduce((sum, check) => sum + (parseFloat(check.amount) || 0), 0);
    const grandTotal = totalCash + totalChecks;

    const fetchCollections = useCallback(async () => {
        listRequestController.current?.abort();
        const controller = new AbortController();
        listRequestController.current = controller;
        const version = ++listRequestVersion.current;
        setIsLoading(true);
        setListError(null);
        try {
            const query = new URLSearchParams({
                search: listQuery.search,
                salesmanCode: listQuery.salesmanCode,
                page: String(listQuery.page),
                size: String(listQuery.size),
                sortField: String(listQuery.sortField),
                sortDir: listQuery.sortDirection,
            });
            if (listQuery.dateFrom) query.set("dateFrom", listQuery.dateFrom);
            if (listQuery.dateTo) query.set("dateTo", listQuery.dateTo);

            const collectionsData = await fetchProvider.getOrThrow<PaginatedCollectionResponse>(
                `/api/manufacturing/financial-management/collection-posting/collections/unposted?${query.toString()}`,
                {signal: controller.signal},
            );
            if (controller.signal.aborted || listRequestVersion.current !== version) return;
            if (!collectionsData) throw new Error("The collection pouch list returned no data. Please retry.");

            setMasterList(collectionsData.content || []);
            setTotalElements(collectionsData.totalElements || 0);
            setTotalPages(collectionsData.totalPages || 0);
            setCurrentPage(collectionsData.currentPage || listQuery.page);
            setListError(null);

        } catch (error) {
            if (controller.signal.aborted || listRequestVersion.current !== version) return;
            console.error("Failed to fetch cashiering collections:", error instanceof Error ? error.message : error);
            setListError(getListErrorMessage(error));
        } finally {
            if (listRequestVersion.current === version) setIsLoading(false);
        }
    }, [
        listQuery.search,
        listQuery.salesmanCode,
        listQuery.dateFrom,
        listQuery.dateTo,
        listQuery.page,
        listQuery.size,
        listQuery.sortField,
        listQuery.sortDirection,
    ]);

    useEffect(() => {
        void fetchCollections();
        return () => listRequestController.current?.abort();
    }, [fetchCollections, listQuery.refreshKey]);

    useEffect(() => {
        let cancelled = false;
        void fetchProvider.get<Record<string, unknown>[]>("/api/manufacturing/financial-management/collection-posting/master-data/salesmen").then(data => {
            if (!cancelled && data) {
                setSalesmen(data.map((s: Record<string, unknown>) => ({
                    ...s,
                    salesmanCode: s.salesmanCode || s.salesman_code,
                    salesmanName: s.salesmanName || s.salesman_name
                } as unknown as Salesman)));
            }
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const loadModalLookups = useCallback(async (): Promise<ModalLookupData> => {
        if (modalLookupsCache.current) return modalLookupsCache.current;
        if (modalLookupsPromise.current) return modalLookupsPromise.current;

        const request = (async (): Promise<ModalLookupData> => {
            setIsLookupsLoading(true);
            try {
                const [banksData, denomData, coasData, pmData, custData, usersData] = await Promise.all([
                    fetchProvider.get<Record<string, unknown>[]>("/api/manufacturing/financial-management/collection-posting/master-data/banks"),
                    fetchProvider.get<Record<string, unknown>[]>("/api/manufacturing/financial-management/collection-posting/master-data/denominations"),
                    fetchProvider.get<Record<string, unknown>[]>("/api/manufacturing/financial-management/collection-posting/master-data/coas"),
                    fetchProvider.get<Record<string, unknown>[]>("/api/manufacturing/financial-management/collection-posting/master-data/payment-methods"),
                    fetchProvider.get<Record<string, unknown>[]>("/api/manufacturing/financial-management/collection-posting/master-data/customers"),
                    fetchProvider.get<Record<string, unknown>[]>("/api/manufacturing/financial-management/collection-posting/master-data/users"),
                ]);

                const data: ModalLookupData = {
                    banks: (banksData || []).map((b: Record<string, unknown>) => ({
                        ...b,
                        bankName: b.bankName || b.bank_name
                    } as unknown as Bank)),
                    denominationMaster: (denomData || []) as unknown as Denomination[],
                    coas: (coasData || []).map((c: Record<string, unknown>) => ({
                        ...c,
                        coaId: c.coaId || c.coa_id,
                        accountTitle: c.accountTitle || c.account_title,
                        glCode: c.glCode || c.gl_code,
                        isPayment: c.isPayment !== undefined ? c.isPayment : c.is_payment
                    }) as unknown as COA).filter(c => c.isPayment),
                    paymentMethods: (pmData || []).map((pm: Record<string, unknown>) => ({
                        ...pm,
                        methodId: pm.methodId || pm.method_id,
                        methodName: pm.methodName || pm.method_name
                    }) as unknown as PaymentMethod).filter(pm =>
                        pm.methodId !== 1 && (pm.methodName || "").toLowerCase() !== "cash"
                    ),
                    customers: (custData || []).map((c: Record<string, unknown>) => ({
                        ...c,
                        customerCode: c.customerCode || c.customer_code,
                        customerName: c.customerName || c.customer_name
                    } as unknown as Customer)),
                    users: (usersData || []).map((u: Record<string, unknown>) => {
                        const firstName = u.firstName || u.user_fname || "";
                        const lastName = u.lastName || u.user_lname || "";
                        return {
                            ...u,
                            id: u.id || u.user_id,
                            firstName,
                            lastName,
                            name: `${firstName} ${lastName}`.trim(),
                        };
                    }) as unknown as UserDto[],
                };

                setBanks(data.banks);
                setDenominationMaster(data.denominationMaster);
                setCoas(data.coas);
                setPaymentMethods(data.paymentMethods);
                setCustomers(data.customers);
                setUsers(data.users);
                setDenominations(data.denominationMaster.reduce<Record<number, number>>(
                    (acc, denomination) => ({...acc, [denomination.id]: 0}), {}
                ));
                modalLookupsCache.current = data;
                return data;
            } finally {
                setIsLookupsLoading(false);
            }
        })();

        modalLookupsPromise.current = request;
        try {
            return await request;
        } finally {
            if (modalLookupsPromise.current === request) modalLookupsPromise.current = null;
        }
    }, []);

    const refreshList = useCallback(async () => {
        await fetchCollections();
    }, [fetchCollections]);

    useEffect(() => {
        if (!salesmanId) {
            setRouteInvoices([]);
            setSubmissionError(null);
            return;
        }

        let cancelled = false;
        const controller = new AbortController();
        const query = new URLSearchParams({salesmanId});
        if (editingId) query.set("currentPouchId", String(editingId));

        setRouteInvoices([]);
        setSubmissionError(null);
        void fetchProvider.getOrThrow<Record<string, unknown>[]>(
            `/api/manufacturing/financial-management/collection-posting/invoices/unpaid?${query.toString()}`,
            {signal: controller.signal, timeoutMs: 15_000},
        ).then(data => {
            if (!cancelled) {
                const mapped = (data || []).map(inv => ({
                    ...inv,
                    id: inv.id || inv.invoice_id,
                    invoiceNo: inv.invoiceNo || inv.invoice_no,
                    customerName: inv.customerName || inv.customer_name,
                    transactionDate: inv.transactionDate || inv.invoice_date,
                    dueDate: inv.dueDate || inv.due_date,
                    remainingBalance: inv.remainingBalance !== undefined ? inv.remainingBalance : (inv.net_amount || 0)
                } as unknown as UnpaidInvoice));
                setRouteInvoices(mapped);
                setSubmissionError(null);
            }
        }).catch(error => {
            if (cancelled || controller.signal.aborted) return;
            console.error("Failed to load route invoices", error instanceof Error ? error.message : error);
            setRouteInvoices([]);
            setSubmissionError("Could not load unpaid invoices. Please retry.");
        });

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [salesmanId, editingId]);

    const loadPouchForEdit = useCallback(async (id: number) => {
        if (!id || isNaN(id)) return;

        const requestVersion = ++invoiceRequestVersion.current;
        invoiceRequestController.current?.abort();
        const controller = new AbortController();
        invoiceRequestController.current = controller;

        setIsSheetLoading(true);
        setIsSheetOpen(true);
        setSubmissionError(null);
        setCustomerInvoices({});

        try {
            const [lookupData, pouch] = await Promise.all([
                loadModalLookups(),
                fetchProvider.getOrThrow<PouchDetailResponse>(
                    `/api/manufacturing/financial-management/collection-posting/collections/${id}`,
                    {signal: controller.signal, timeoutMs: 15_000},
                ),
            ]);
            if (!pouch) throw new Error("Collection details were empty.");
            {
                setEditingId(id);
                setSalesmanId(pouch.salesmanId.toString());

                // 🚀 Hydrate the new fields if backend returns them
                setCollectedBy(pouch.collectedBy ? pouch.collectedBy.toString() : "");
                setCrNo(pouch.crNo || "");

                setCollectionDate(pouch.collectionDate.split('T')[0]);
                setRemarks(pouch.remarks || "");

                const newDenoms: Record<number, number> = lookupData.denominationMaster.reduce<Record<number, number>>((acc, d) => ({ ...acc, [d.id]: 0 }), {});

                pouch.cashBuckets?.filter((b) => b.coaId === 1).forEach((bucket) => {
                    const denomId = bucket.denominationId || parseInt(bucket.tempId?.replace("cash-", "") || "");
                    if (!isNaN(denomId) && bucket.quantity) newDenoms[denomId] = bucket.quantity;
                });

                setDenominations(newDenoms);

                const mappedChecks = pouch.cashBuckets?.filter((b) => b.coaId !== 1).map((b) => {
                    const custObj = lookupData.customers.find(c => (c.customerCode || c.code) === b.customerCode);
                    return {
                        tempId: b.tempId,
                        paymentMethodId: b.paymentMethodId?.toString() || "",
                        coaId: b.coaId?.toString() || "",
                        bankId: b.bankId?.toString() || "",
                        customerId: custObj ? custObj.id.toString() : "",
                        invoiceId: b.invoiceId?.toString() || "",
                        checkNo: String(b.referenceNo ?? ""),
                        amount: b.amount.toString(),
                        chequeDate: b.chequeDate ? b.chequeDate.split('T')[0] : ""
                    };
                }) || [];
                setChecks(mappedChecks);

                const uniqueCustomerIds = Array.from(new Set(mappedChecks.map(c => c.customerId).filter(Boolean)));
                // Do not keep the edit sheet blocked while invoice ledgers warm.
                void Promise.all(uniqueCustomerIds.map(async cId => {
                    try {
                        const query = new URLSearchParams({
                            salesmanId: String(pouch.salesmanId),
                            customerId: String(cId),
                            currentPouchId: String(id),
                        });
                        const data = await fetchProvider.getOrThrow<Record<string, unknown>[]>(
                            `/api/manufacturing/financial-management/collection-posting/invoices/unpaid?${query.toString()}`,
                            {signal: controller.signal, timeoutMs: 15_000},
                        );
                        if (!controller.signal.aborted && invoiceRequestVersion.current === requestVersion) {
                            const mapped = (data || []).map(inv => ({
                                ...inv,
                                id: inv.id || inv.invoice_id,
                                invoiceNo: inv.invoiceNo || inv.invoice_no,
                                customerName: inv.customerName || inv.customer_name,
                                transactionDate: inv.transactionDate || inv.invoice_date,
                                dueDate: inv.dueDate || inv.due_date,
                                remainingBalance: inv.remainingBalance !== undefined ? inv.remainingBalance : (inv.net_amount || 0)
                            } as unknown as UnpaidInvoice));
                            setCustomerInvoices(prev => ({...prev, [cId]: mapped}));
                        }
                    } catch (error) {
                        if (controller.signal.aborted || invoiceRequestVersion.current !== requestVersion) return;
                        console.error("Could not preload invoices for customer", {customerId: cId, error: error instanceof Error ? error.message : error});
                        setSubmissionError("Some customer invoices could not be loaded. Please retry the customer selection.");
                    }
                }));
            }
        } catch (err) {
            if (!controller.signal.aborted && invoiceRequestVersion.current === requestVersion) {
                console.error("Hydration Error:", err instanceof Error ? err.message : err);
                setSubmissionError("Could not load pouch details. Please retry.");
            }
        } finally {
            if (invoiceRequestVersion.current === requestVersion) setIsSheetLoading(false);
        }
    }, [loadModalLookups]);

    const handleDenomChange = (id: number, qty: string) => setDenominations(prev => ({
        ...prev,
        [id]: parseInt(qty) || 0
    }));

    const addCheck = () => setChecks([...checks, {
        tempId: `chk-${Date.now()}`,
        paymentMethodId: "",
        coaId: "",
        bankId: "",
        customerId: "",
        invoiceId: "",
        checkNo: "",
        amount: "",
        chequeDate: ""
    }]);

    const updateCheck = (index: number, field: keyof CheckDetail, value: string) => {
        const updated = [...checks];
        updated[index] = { ...updated[index], [field]: value };
        setChecks(updated);
    };

    const handlePaymentMethodSelect = (index: number, methodId: string) => {
        const updated = [...checks];
        updated[index] = { ...updated[index], paymentMethodId: methodId };
        setChecks(updated);
    };

    const handleCustomerSelect = async (index: number, customerId: string) => {
        const updated = [...checks];
        updated[index] = { ...updated[index], customerId, invoiceId: "" };
        setChecks(updated);
        setSubmissionError(null);

        if (salesmanId && customerId && !customerInvoices[customerId]) {
            try {
                const query = new URLSearchParams({
                    salesmanId,
                    customerId,
                    ...(editingId ? { currentPouchId: String(editingId) } : {}),
                });
                const data = await fetchProvider.getOrThrow<Record<string, unknown>[]>(
                    `/api/manufacturing/financial-management/collection-posting/invoices/unpaid?${query.toString()}`,
                    {timeoutMs: 15_000},
                );
                const mapped = (data || []).map(inv => ({
                    ...inv,
                    id: inv.id || inv.invoice_id,
                    invoiceNo: inv.invoiceNo || inv.invoice_no,
                    customerName: inv.customerName || inv.customer_name,
                    transactionDate: inv.transactionDate || inv.invoice_date,
                    dueDate: inv.dueDate || inv.due_date,
                    remainingBalance: inv.remainingBalance !== undefined ? inv.remainingBalance : (inv.net_amount || 0)
                } as unknown as UnpaidInvoice));
                setCustomerInvoices(prev => ({ ...prev, [customerId]: mapped }));
                setSubmissionError(null);
            } catch (err) {
                console.error("Failed to load customer invoices", err instanceof Error ? err.message : err);
                setSubmissionError("Could not load unpaid invoices for the selected customer. Please retry.");
            }
        }
    };

    const handleInvoiceSelect = (index: number, invoiceId: string) => {
        const updated = [...checks];
        const newCheck = { ...updated[index], invoiceId };

        if (!newCheck.customerId && routeInvoices.length > 0) {
            const selectedInv = routeInvoices.find(inv => (inv.invoiceId || inv.id)?.toString() === invoiceId);
            if (selectedInv) {
                const custMatch = customers.find(c => (c.customerName || c.name) === selectedInv.customerName);
                if (custMatch) {
                    newCheck.customerId = custMatch.id.toString();
                }
            }
        }
        updated[index] = newCheck;
        setChecks(updated);
    };

    const removeCheck = (index: number) => setChecks(checks.filter((_, i) => i !== index));

    const resetForm = () => {
        invoiceRequestVersion.current += 1;
        invoiceRequestController.current?.abort();
        setEditingId(null);
        setSubmissionError(null);
        setSubmitAttempted(false);
        setTouchedChecks({});
        setSalesmanId("");
        setCollectedBy(""); // 🚀 Reset
        setCrNo("");        // 🚀 Reset
        setRemarks("");
        setDenominations(denominationMaster.reduce<Record<number, number>>((acc, d) => ({ ...acc, [d.id]: 0 }), {}));
        setChecks([]);
        setCustomerInvoices({});
    };

    const handleSubmit = async () => {
        if (isSheetLoading || isLookupsLoading) return;
        setSubmissionError(null);
        setSubmitAttempted(true);
        if (!salesmanId) return setSubmissionError("Please select a Collector.");
        if (Object.values(denominations).some(quantity => !Number.isInteger(quantity) || quantity < 0)) {
            return setSubmissionError("Cash quantities must be non-negative whole numbers.");
        }
        if (grandTotal <= 0) return setSubmissionError("Cannot save an empty pouch.");
        if (checks.some(check => Object.values(getCheckValidationErrors(check)).some(Boolean))) {
            return setSubmissionError("Complete all required non-cash remittance fields before saving.");
        }

        const selectedInvoiceAmounts = new Map<string, number>();
        for (const check of checks) {
            if (!check.invoiceId) continue;

            const availableInvoices = check.customerId
                ? (customerInvoices[check.customerId] || [])
                : routeInvoices;
            const invoice = availableInvoices.find(inv =>
                String(inv.id || inv.invoiceId) === String(check.invoiceId)
            );
            if (!invoice) continue;

            selectedInvoiceAmounts.set(
                String(check.invoiceId),
                (selectedInvoiceAmounts.get(String(check.invoiceId)) || 0) + (getPositiveAmount(check.amount) || 0)
            );
            const requestedAmount = selectedInvoiceAmounts.get(String(check.invoiceId)) || 0;
            if (requestedAmount > invoice.remainingBalance + 0.01) {
                return setSubmissionError(`Invoice ${invoice.invoiceNo} has only ₱${invoice.remainingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} remaining.`);
            }
        }

        setIsSubmitting(true);

        const payload = {
            salesmanId: parseInt(salesmanId),
            collectedBy: collectedBy ? parseInt(collectedBy) : (parseInt(currentUser.id) || 1), // 🚀 Dynamic
            crNo: crNo || undefined, // 🚀 Payload mapping
            collectionDate: `${collectionDate}T00:00:00`,
            remarks: remarks || "",
            cashBuckets: [
                ...denominationMaster.filter(d => (denominations[d.id] || 0) > 0).map(d => ({
                    tempId: `cash-${d.id}`,
                    denominationId: d.id,
                    coaId: 1,
                    amount: d.amount * denominations[d.id],
                    quantity: denominations[d.id],
                    referenceNo: `${d.amount} x ${denominations[d.id]}`
                })),
                ...checks.map(c => {
                    const custObj = customers.find(cust => cust.id.toString() === c.customerId);
                    return {
                        tempId: c.tempId,
                        paymentMethodId: Number(c.paymentMethodId),
                        coaId: Number(c.coaId),
                        bankId: Number(c.bankId),
                        customerCode: custObj ? (custObj.customerCode || custObj.code) : null,
                        invoiceId: c.invoiceId ? parseInt(c.invoiceId) || null : null,
                        referenceNo: c.checkNo.trim(),
                        amount: getPositiveAmount(c.amount) as number,
                        chequeDate: c.chequeDate ? `${c.chequeDate}T00:00:00` : null
                    };
                })
            ]
        };

        try {
            const url = editingId ? `/api/manufacturing/financial-management/collection-posting/collections/${editingId}` : "/api/manufacturing/financial-management/collection-posting/collections/receive";
            const res = editingId
                ? await fetchProvider.put<string>(url, payload, {timeoutMs: 35_000})
                : await fetchProvider.post<string>(url, payload, {timeoutMs: 35_000});
            if (res) {
                toast.success(editingId ? "Pouch updated!" : "Pouch secured!");
                setIsSheetOpen(false);
                resetForm();
                if (editingId) {
                    await refreshList();
                } else if (onCreated) {
                    onCreated();
                } else {
                    await refreshList();
                }
            }
        } catch (error) {
            console.error("Submission Error:", error instanceof Error ? error.message : error);
            setSubmissionError(getSubmissionErrorMessage(error));
        } finally {
            setIsSubmitting(false);
        }
    };

    return {
        isSheetOpen, setIsSheetOpen, isSheetLoading, isLookupsLoading, isSubmitting, submissionError, listError,
        submitAttempted, setSubmitAttempted, touchedChecks, setCheckTouched,
        masterList, totalElements, totalPages, currentPage, salesmen, isLoading, salesmanId, setSalesmanId,
        users, collectedBy, setCollectedBy, crNo, setCrNo, // 🚀 Expose the new states to the component!
        collectionDate, setCollectionDate, remarks, setRemarks, denominations, handleDenomChange,
        denominationMaster, checks, banks, coas, paymentMethods, customers, customerInvoices, routeInvoices,
        addCheck, updateCheck, handlePaymentMethodSelect, handleCustomerSelect, handleInvoiceSelect, removeCheck, totalCash,
        totalChecks, grandTotal, handleSubmit, loadPouchForEdit, resetForm, editingId,
        refreshList, loadModalLookups: async () => { await loadModalLookups(); }
    };
}
