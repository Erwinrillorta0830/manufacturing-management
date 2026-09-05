"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Save, Search, FileText, DownloadCloud, LockKeyhole } from "lucide-react";
import { format } from "date-fns";
import {
    DisbursementPayload, DisbursementSubmitResult, PayableLine, SupplierDto, COADto,
    Disbursement, UnpaidPoDto, MemoDto, DivisionDto, DepartmentDto, PaymentLine, BankAccountDto
} from "../types";
import { disbursementProvider } from "../providers/fetchProvider";
import { toast } from "sonner";
import { AddPayeeModal } from "@/modules/manufacturing-management/financial-management/payee-registration/components/modals/add-payee-modal";
import type { Payee } from "@/modules/manufacturing-management/financial-management/payee-registration/types/payee.schema";
import { formatCurrency } from "../utils/disbursement-utils";
import { VoucherDetailsSection } from "./VoucherDetailsSection";
import { PayablesSection } from "./PayablesSection";
import { StickyTableWrapper } from "./StickyTableWrapper";

import { CashIssuancePaymentForm } from "./CashIssuancePaymentForm";
import { replaceEmptyPayablePlaceholders } from "@/modules/manufacturing-management/financial-management/treasury/components/payable-line-state";
import { getMemoAvailableAmount } from "@/modules/manufacturing-management/financial-management/treasury/components/memo-cap";
import { isMemoPayableLine, normalizeMemoReference, stripMemoLineMetadata } from "@/modules/manufacturing-management/financial-management/treasury/components/memo-payable-line";

import { isPettyCashBankAccount } from "@/app/api/manufacturing/financial-management/cash-issuance/disbursements/_payment-method";
import { cn } from "@/lib/utils";

export interface ExtendedDisbursement extends Disbursement {
    payeeId?: number;
    departmentId?: number;
}

interface CashIssuanceCreateDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (payload: DisbursementPayload) => Promise<DisbursementSubmitResult>;
    onPaymentAllocationSubmit?: (id: number, payments: PaymentLine[]) => Promise<DisbursementSubmitResult>;
    loading: boolean;
    editData?: ExtendedDisbursement | null;
    paymentEditingMode?: "preparation" | "releasing";
}
const isPaymentCOA = (c: COADto) => {
    return Number(c.accountType) === 1 && !!c.isPayment;
};

const isPayableOrExpenseCOA = (c: COADto) => {
    return [3, 4, 7, 8, 9, 10].includes(Number(c.accountType)) || [44, 45, 47, 30].includes(Number(c.coaId));
};

const MEMO_AMOUNT_TOLERANCE = 0.01;

function findMemoForPayableLine(line: PayableLine, memos: MemoDto[]) {
    const reference = normalizeMemoReference(line.memoNumber || line.referenceNo);
    return memos.find((memo) => normalizeMemoReference(memo.memo_number) === reference);
}

function getMemoAmountError(requestedAmount: number, availableAmount: number) {
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
        return "Memo amount must be greater than zero.";
    }
    if (requestedAmount > availableAmount + MEMO_AMOUNT_TOLERANCE) {
        return `Amount cannot exceed the available amount of this credit or debit memo (${formatCurrency(availableAmount)}).`;
    }
    return null;
}

function isPopulatedPayableLine(line: PayableLine) {
    return !!line.coaId
        || (Number.isFinite(Number(line.amount)) && Number(line.amount) !== 0)
        || !!line.referenceNo?.trim();
}

function isValidDivisionId(value: unknown) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0;
}

export function CashIssuanceCreateDialog({
    open,
    onOpenChange,
    onSubmit,
    onPaymentAllocationSubmit,
    loading,
    editData,
    paymentEditingMode = "preparation",
}: CashIssuanceCreateDialogProps) {
    const today = new Date().toISOString().split("T")[0];

    const [transactionTypeId, setTransactionTypeId] = useState<number | "">(1);
    const [payeeId, setPayeeId] = useState<number | "">("");
    const [remarks, setRemarks] = useState("");
    const [transactionDate, setTransactionDate] = useState(today);

    const [payables, setPayables] = useState<PayableLine[]>([]);
    const [payments, setPayments] = useState<PaymentLine[]>([]);
    const [banks, setBanks] = useState<BankAccountDto[]>([]);
    const [paymentValidationErrors, setPaymentValidationErrors] = useState<Set<string>>(new Set());
    const [payableValidationErrors, setPayableValidationErrors] = useState<Set<string>>(new Set());

    const [suppliers, setSuppliers] = useState<SupplierDto[]>([]);
    const [coas, setCoas] = useState<COADto[]>([]);
    const [loadingData, setLoadingData] = useState(false);

    const [unpaidPos, setUnpaidPos] = useState<UnpaidPoDto[]>([]);
    const [loadingPos, setLoadingPos] = useState(false);
    const [isPoModalOpen, setIsPoModalOpen] = useState(false);
    const poRequestIdRef = useRef(0);
    const poAbortControllerRef = useRef<AbortController | null>(null);
    const [poLoadError, setPoLoadError] = useState<string | null>(null);
    const [selectedPoIds, setSelectedPoIds] = useState<string[]>([]);
    const [taxTypes, setTaxTypes] = useState<Record<string, "VAT" | "NON_VAT">>({});

    const [memos, setMemos] = useState<MemoDto[]>([]);
    const [memoAmounts, setMemoAmounts] = useState<Record<string, string>>({});
    const [loadingMemos, setLoadingMemos] = useState(false);
    const [isMemoModalOpen, setIsMemoModalOpen] = useState(false);
    const [memoSearchQuery, setMemoSearchQuery] = useState("");
    const [memoLoadError, setMemoLoadError] = useState<string | null>(null);
    const memoAbortControllerRef = useRef<AbortController | null>(null);
    const memoRequestIdRef = useRef(0);

    const [departmentId, setDepartmentId] = useState<number | "">("");
    const [supportingDocumentsUrl, setSupportingDocumentsUrl] = useState("");
    const [uploadingFile, setUploadingFile] = useState(false);
    const [divisions, setDivisions] = useState<DivisionDto[]>([]);
    const [departments, setDepartments] = useState<DepartmentDto[]>([]);

    const [poSearchQuery, setPoSearchQuery] = useState("");
    const [isPayeeRegistrationOpen, setIsPayeeRegistrationOpen] = useState(false);

    const [localSubmitting, setLocalSubmitting] = useState(false);
    const submitLockRef = useRef(false);

    const isReleasingEdit = !!(editData && (editData.status === "Approved" || editData.status === "Partially Released"));
    const isReadOnly = !!(editData && (
        editData.status === "Released" ||
        editData.status === "Posted" ||
        (editData.status === "Submitted" && !editData.transactionTypeName?.toUpperCase().includes("NON"))
    ));
    const isPreparationPaymentEdit = paymentEditingMode === "preparation"
        && (!editData || editData.status === "Draft" || editData.status === "Returned for Revision");
    const isReleasingPaymentEdit = paymentEditingMode === "releasing" && isReleasingEdit;
    const isPaymentEditorEnabled = !isReadOnly && (isPreparationPaymentEdit || isReleasingPaymentEdit);
    const isPaymentOnlyEdit = !isReadOnly && isReleasingPaymentEdit;

    const isHeaderLocked = isReleasingEdit || isReadOnly;
    const isPayablesLocked = isReleasingEdit || isReadOnly;
    const arePaymentFieldsLocked = !isPaymentEditorEnabled || isReadOnly;

    const totalAmount = useMemo(() => payables.reduce((sum, line) => sum + (Number(line.amount) || 0), 0), [payables]);
    const paymentTotal = useMemo(() => payments.reduce((sum, line) => sum + (Number(line.amount) || 0), 0), [payments]);
    const remainingPayment = Number((totalAmount - paymentTotal).toFixed(2));
    const availableMemos = useMemo(
        () => memos.filter((memo) =>
            Number(memo.supplier_id) === Number(payeeId)
            && [1, 2].includes(Number(memo.type))
            && (Number(memo.remaining_amount ?? memo.amount) > 0.01
                || !!memo.is_locked
                || payables.some((payable) => normalizeMemoReference(payable.referenceNo) === normalizeMemoReference(memo.memo_number))),
        ),
        [memos, payables, payeeId],
    );
    const filteredMemos = useMemo(() => {
        const query = memoSearchQuery.trim().toLowerCase();
        if (!query) return availableMemos;

        return availableMemos.filter((memo) => [
            memo.memo_number,
            memo.memo_type_name,
            format(new Date(memo.date), "MMM dd, yyyy"),
            memo.account_title,
            memo.reason,
            memo.amount,
            memo.amount.toLocaleString("en-US", { minimumFractionDigits: 2 }),
            memo.remaining_amount ?? memo.amount,
            (memo.remaining_amount ?? memo.amount).toLocaleString("en-US", { minimumFractionDigits: 2 }),
        ].filter((value) => value !== null && value !== undefined).join(" ").toLowerCase().includes(query));
    }, [availableMemos, memoSearchQuery]);
    const memoReferences = useMemo(
        () => new Set(memos.map((memo) => normalizeMemoReference(memo.memo_number)).filter(x => !!x)),
        [memos],
    );
    const memoSupplierMismatchIndices = useMemo(
        () => new Set(payables
            .map((line, index) => isMemoPayableLine(line, memoReferences)
                && line.memoSupplierId != null
                && payeeId !== ""
                && Number(line.memoSupplierId) !== Number(payeeId)
                ? index
                : -1)
            .filter((index) => index >= 0)),
        [payables, memoReferences, payeeId],
    );
    const memoAmountErrors = useMemo(() => {
        const errors: Record<number, string> = {};

        payables.forEach((line, index) => {
            const memo = findMemoForPayableLine(line, memos);
            if (!memo) return;

            const availableAmount = getMemoAvailableAmount(
                memo.remaining_amount ?? memo.amount,
                payables,
                memo.memo_number,
                index,
            );
            const error = getMemoAmountError(Math.abs(Number(line.amount) || 0), availableAmount);
            if (error) errors[index] = error;
        });

        return errors;
    }, [memos, payables]);

    const isNonTradeVoucher = transactionTypeId === 2;
    const payeeSupplierType = isNonTradeVoucher ? "NON-TRADE" : "TRADE";
    const payeeSupplierTypeLabel = isNonTradeVoucher ? "Non-Trade" : "Trade";

    useEffect(() => {
        if (open) {
            Promise.allSettled([
                disbursementProvider.getCOAs(),
                disbursementProvider.getBanks(),
            ]).then(([coaResult, bankResult]) => {
                if (coaResult.status === 'fulfilled') {
                    setCoas(Array.isArray(coaResult.value) ? coaResult.value : []);
                } else {
                    console.error("Failed to load COAs:", coaResult.reason);
                    setCoas([]);
                }

                if (bankResult.status === 'fulfilled') {
                    setBanks(Array.isArray(bankResult.value) ? bankResult.value : []);
                } else {
                    console.error("Failed to load Banks:", bankResult.reason);
                    setBanks([]);
                }
            });
            disbursementProvider.getDivisions().then(res => setDivisions(Array.isArray(res) ? res : [])).catch(() => console.warn("No divisions route"));
            disbursementProvider.getDepartments().then(res => setDepartments(Array.isArray(res) ? res : [])).catch(() => console.warn("No departments route"));
        }
    }, [open]);

    useEffect(() => {
        if (open && transactionTypeId) {
            setLoadingData(true);
            const typeString = transactionTypeId === 1 ? "TRADE" : "NON-TRADE";
            disbursementProvider.getSuppliers(typeString)
                .then(res => setSuppliers(Array.isArray(res) ? res : []))
                .finally(() => setLoadingData(false));
        }
    }, [open, transactionTypeId]);

    useEffect(() => {
        if (open) {
            if (editData) {
                const isNonTrade = editData.transactionTypeName?.toUpperCase().includes("NON");
                setTransactionTypeId(isNonTrade ? 2 : 1);

                setPayeeId(editData.payeeId != null ? Number(editData.payeeId) : "");
                setDepartmentId(editData.departmentId != null ? Number(editData.departmentId) : "");
                setRemarks(editData.remarks || "");
                const docUrl = editData.supportingDocumentsUrl || "";
                const parsedUuid = docUrl.includes("/") ? (docUrl.split("/").pop()?.split("?")[0] || "") : docUrl;
                setSupportingDocumentsUrl(parsedUuid);
                setTransactionDate(editData.transactionDate ? editData.transactionDate.split('T')[0] : today);

                setPayables(editData.payables.map(p => ({
                    id: p.id,
                    referenceNo: p.referenceNo || "",
                    date: p.date ? p.date.split('T')[0] : today,
                    amount: p.amount,
                    memoOriginalAmount: Math.abs(Number(p.amount) || 0),
                    memoSupplierId: p.isMemo || p.memoId != null ? Number(editData.payeeId) : undefined,
                    coaId: p.coaId,
                    divisionId: p.divisionId || undefined,
                    remarks: p.remarks,
                    accountTitle: p.accountTitle
                })));
                setPayments(editData.payments.map(p => ({
                    id: p.id,
                    coaId: p.coaId,
                    accountTitle: p.accountTitle,
                    bankId: p.bankId,
                    bankName: p.bankName,
                    bankAccountNumber: p.bankAccountNumber,
                    checkNo: p.checkNo || "",
                    date: p.date ? p.date.split("T")[0] : today,
                    amount: p.amount,
                    remarks: p.remarks || "",
                    releasedDate: p.releasedDate,
                    releasedBy: p.releasedBy,
                })));
                setPaymentValidationErrors(new Set());
                setPayableValidationErrors(new Set());

            } else {
                setTransactionTypeId(1);
                setPayeeId("");
                setDepartmentId("");
                setRemarks("");
                setSupportingDocumentsUrl("");
                // Start with one blank row for payables so the user can begin typing immediately.
                setPayables([{ referenceNo: "", date: today, amount: 0, remarks: "", divisionId: undefined }]);
                setPayments([]);
                setPaymentValidationErrors(new Set());
                setPayableValidationErrors(new Set());
                setTransactionDate(today);
            }
        }
    }, [open, editData, today]);

    useEffect(() => {
        if (open && editData && !payeeId && editData.payeeName && suppliers.length > 0) {
            const match = suppliers.find(s => s.supplier_name?.toLowerCase() === editData.payeeName?.toLowerCase());
            if (match) setPayeeId(match.id);
        }
    }, [open, editData, payeeId, suppliers]);

    useEffect(() => {
        if (open && editData && !departmentId && editData.departmentName && departments.length > 0) {
            const match = departments.find(d => d.departmentName?.toLowerCase() === editData.departmentName?.toLowerCase());
            if (match) setDepartmentId(match.departmentId);
        }
    }, [open, editData, departmentId, departments]);

    useEffect(() => {
        memoAbortControllerRef.current?.abort();
        memoRequestIdRef.current += 1;
        setMemos([]);
        setMemoAmounts({});
        setMemoSearchQuery("");
        setMemoLoadError(null);

        if (!open || !payeeId) {
            setLoadingMemos(false);
            return;
        }

        const controller = new AbortController();
        memoAbortControllerRef.current = controller;
        const requestId = memoRequestIdRef.current;
        setLoadingMemos(true);

        disbursementProvider.getSupplierMemos(Number(payeeId), controller.signal)
            .then((fetchedMemos) => {
                if (controller.signal.aborted || requestId !== memoRequestIdRef.current) return;
                setMemos(fetchedMemos);
                setMemoAmounts(Object.fromEntries(fetchedMemos.map((memo) => [String(memo.id), String(memo.remaining_amount ?? memo.amount)])));
            })
            .catch((error: unknown) => {
                if (controller.signal.aborted || requestId !== memoRequestIdRef.current) return;
                setMemoLoadError(error instanceof Error ? error.message : "Failed to load supplier memos");
            })
            .finally(() => {
                if (!controller.signal.aborted && requestId === memoRequestIdRef.current) setLoadingMemos(false);
            });

        return () => controller.abort();
    }, [open, payeeId]);

    const handleAddPayable = useCallback(() => setPayables((prev) => [...prev, { referenceNo: "", date: today, amount: 0, remarks: "", divisionId: undefined }]), [today]);

    const handleDivisionSelect = useCallback((index: number, divisionId?: number) => {
        const nextPayables = [...payables];
        nextPayables[index] = { ...nextPayables[index], divisionId };

        setPayables(nextPayables);
        setPayableValidationErrors((current) => {
            const next = new Set(current);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            nextPayables.forEach((line: any, lineIndex: number) => {
                const key = `${lineIndex}:divisionId`;
                if (isValidDivisionId(line.divisionId)) next.delete(key);
                else if (current.size > 0 && isPopulatedPayableLine(line)) next.add(key);
            });
            return next;
        });
    }, [payables]);

    const handleRemovePayable = useCallback((index: number) => {
        setPayables((current) => current.filter((_, lineIndex: number) => lineIndex !== index));
        setPayableValidationErrors((current) => {
            const next = new Set<string>();
            current.forEach((key) => {
                const [indexText, field] = key.split(":");
                const errorIndex = Number(indexText);
                if (!Number.isInteger(errorIndex) || errorIndex === index) return;
                next.add(`${errorIndex > index ? errorIndex - 1 : errorIndex}:${field}`);
            });
            return next;
        });
    }, []);

    const handleAmountChange = useCallback((index: number, rawValue: string) => {
        const parsedAmount = rawValue.trim() === "" ? 0 : Number(rawValue);

        setPayables((current) => current.map((line, lineIndex: number) => {
            if (lineIndex !== index) return line;

            if (!Number.isFinite(parsedAmount)) {
                return { ...line, amount: 0 };
            }

            const memo = findMemoForPayableLine(line, memos);
            if (!memo) return { ...line, amount: parsedAmount };

            return {
                ...line,
                amount: memo.type === 1 ? -Math.abs(parsedAmount) : Math.abs(parsedAmount),
            };
        }));
    }, [memos]);

    const handlePayeeCreated = useCallback(async (createdPayee?: Payee) => {
        try {
            const refreshed = await disbursementProvider.getSuppliers(payeeSupplierType);
            const nextSuppliers = Array.isArray(refreshed) ? refreshed : [];
            const createdPayeeId = createdPayee?.id as number;

            setSuppliers(
                createdPayeeId == null || nextSuppliers.some((supplier) => supplier.id === createdPayeeId)
                    ? nextSuppliers
                    : [
                        ...nextSuppliers,
                        {
                            id: createdPayeeId,
                            supplier_name: (createdPayee?.supplier_name as string) || "New Payee",
                            isActive: true,
                        },
                    ],
            );
            if (createdPayeeId != null) setPayeeId(createdPayeeId);
            toast.success(`${payeeSupplierTypeLabel} payee created and selected.`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Payee created, but the payee list could not be refreshed.");
        }
    }, [payeeSupplierType, payeeSupplierTypeLabel, setPayeeId, setSuppliers]);

    const handleOpenPoModal = useCallback(async (supplierId: number) => {
        if (!Number.isInteger(supplierId) || supplierId <= 0) return toast.error("Please select a Payee first.");

        poAbortControllerRef.current?.abort();
        const controller = new AbortController();
        poAbortControllerRef.current = controller;
        const requestId = ++poRequestIdRef.current;
        setUnpaidPos([]);
        setSelectedPoIds([]);
        setTaxTypes({});
        setPoSearchQuery("");
        setPoLoadError(null);
        setLoadingPos(true);
        setIsPoModalOpen(true);
        try {
            const pos = await disbursementProvider.getUnpaidPos(supplierId, controller.signal);
            if (requestId !== poRequestIdRef.current) return;
            setUnpaidPos(pos);
        } catch (error) {
            if (controller.signal.aborted || requestId !== poRequestIdRef.current) return;
            setPoLoadError(error instanceof Error ? error.message : "Failed to load unpaid POs");
        } finally {
            if (requestId === poRequestIdRef.current) setLoadingPos(false);
        }
    }, []);

    const handlePoModalOpenChange = useCallback((nextOpen: boolean) => {
        setIsPoModalOpen(nextOpen);
        if (!nextOpen) {
            poAbortControllerRef.current?.abort();
            poRequestIdRef.current += 1;
            setLoadingPos(false);
        }
    }, []);

    // Auto-open PO modal when a Trade payee is selected (no extra click needed)
    const handlePayeeSelect = useCallback((val: number) => {
        const previousPayeeId = payeeId === "" ? undefined : Number(payeeId);
        if (previousPayeeId && previousPayeeId !== val) {
            setPayables((current) => current.map((line) => {
                const isMemoLine = isMemoPayableLine(line, memoReferences) || line.memoSupplierId != null;
                return isMemoLine && line.memoSupplierId == null
                    ? { ...line, memoSupplierId: previousPayeeId }
                    : line;
            }));
        }
        memoAbortControllerRef.current?.abort();
        memoRequestIdRef.current += 1;
        setMemos([]);
        setMemoAmounts({});
        setMemoSearchQuery("");
        setMemoLoadError(null);
        setIsMemoModalOpen(false);
        setPayeeId(val);
        if (!isNonTradeVoucher && val) {
            handleOpenPoModal(val);
        }
    }, [payeeId, memoReferences, isNonTradeVoucher, handleOpenPoModal]);

    const handlePendingRecordsError = poLoadError ? (
        <TableRow><TableCell colSpan={5}
            className="h-24 text-center text-sm font-medium text-destructive">
            {poLoadError}
        </TableCell></TableRow>
    ) : null;

    const calculateTaxedPayables = useCallback((selectedPos: UnpaidPoDto[], currentTaxTypes: Record<string, "VAT" | "NON_VAT">, date: string): PayableLine[] => {
        const newPayables: PayableLine[] = [];
        const VAT_RATE = 0.12;
        const EWT_RATE = 0.01;

        selectedPos.forEach(po => {
            const baseRef = `${po.poNo} / ${po.receiptNo}`;
            const taxType = currentTaxTypes[po.uniqueKey] || "VAT";
            if (taxType === "VAT") {
                const netAmount = po.amountDue / (1 + VAT_RATE);
                const vatAmount = netAmount * VAT_RATE;
                const ewtAmount = netAmount * EWT_RATE;
                if (po.breakdown && po.breakdown.length > 0) {
                    po.breakdown.forEach(b => {
                        let coaId = 8;
                        let remarks = `Principal Net of VAT`;
                        
                        if (b.categoryType === 'FINISHED_GOODS') {
                            coaId = 47;
                            remarks = `Principal Net of VAT - Finished Goods`;
                        } else if (b.categoryType === 'PACKAGING') {
                            coaId = 45;
                            remarks = `Principal Net of VAT - Packaging`;
                        } else if (b.categoryType === 'RAW_MATERIAL') {
                            coaId = 44;
                            remarks = `Principal Net of VAT - Ingredients`;
                        }
                        
                        const itemNetAmount = b.amount / (1 + VAT_RATE);
                        
                        newPayables.push({
                            referenceNo: baseRef,
                            date: date,
                            amount: Number(itemNetAmount.toFixed(2)),
                            coaId,
                            remarks,
                            divisionId: undefined
                        });
                    });
                } else {
                    newPayables.push({
                        referenceNo: baseRef,
                        date: date,
                        amount: Number(netAmount.toFixed(2)),
                        coaId: 8,
                        remarks: `Principal Net of VAT`,
                        divisionId: undefined
                    });
                }

                newPayables.push({
                    referenceNo: baseRef,
                    date: date,
                    amount: Number(vatAmount.toFixed(2)),
                    coaId: 30,
                    remarks: `Input VAT (12%)`,
                    divisionId: undefined
                });
                newPayables.push({
                    referenceNo: baseRef,
                    date: date,
                    amount: -Number(ewtAmount.toFixed(2)),
                    coaId: 438,
                    remarks: `EWT Deduction (1%)`,
                    divisionId: undefined
                });
            } else {
                if (po.breakdown && po.breakdown.length > 0) {
                    po.breakdown.forEach(b => {
                        let coaId = 8;
                        let remarks = `Principal (Non-VAT)`;
                        if (b.categoryType === 'FINISHED_GOODS') {
                            coaId = 47;
                            remarks = `Principal (Non-VAT) - Finished Goods`;
                        } else if (b.categoryType === 'PACKAGING') {
                            coaId = 45;
                            remarks = `Principal (Non-VAT) - Packaging`;
                        } else if (b.categoryType === 'RAW_MATERIAL') {
                            coaId = 44;
                            remarks = `Principal (Non-VAT) - Ingredients`;
                        }
                        
                        newPayables.push({
                            referenceNo: baseRef,
                            date: date,
                            amount: b.amount,
                            coaId,
                            remarks,
                            divisionId: undefined
                        });
                    });
                } else {
                    newPayables.push({
                        referenceNo: baseRef,
                        date: date,
                        amount: Number(po.amountDue.toFixed(2)),
                        coaId: 8,
                        remarks: `Principal (Non-VAT)`,
                        divisionId: undefined
                    });
                }
            }
        });
        return newPayables;
    }, []);

    const handleImportPos = useCallback(() => {
        const selected = unpaidPos.filter(po => selectedPoIds.includes(po.uniqueKey));
        const newPayables = calculateTaxedPayables(selected, taxTypes, today);

        setPayables((prev) => replaceEmptyPayablePlaceholders(prev, newPayables));
        setIsPoModalOpen(false);
        toast.success(`Imported ${selected.length} record(s) successfully`);
    }, [unpaidPos, selectedPoIds, taxTypes, today, calculateTaxedPayables]);

    const handleOpenMemoModal = () => {
        if (!payeeId) return toast.error("Please select a Payee first.");
        setMemoSearchQuery("");
        setMemoAmounts(Object.fromEntries(availableMemos.map((memo) => [String(memo.id), String(memo.remaining_amount ?? memo.amount)])));
        setIsMemoModalOpen(true);
    };

    const handleApplyMemo = (memo: MemoDto) => {
        const isAlreadyInPayables = payables.some((payable) => normalizeMemoReference(payable.referenceNo) === normalizeMemoReference(memo.memo_number));
        if (memo.is_locked) {
            const blocker = memo.locking_tr_doc_no
                ? `${memo.locking_tr_doc_no} (${memo.locking_tr_status || "unposted"})`
                : "another unposted TR";
            const additionalBlockers = (memo.locking_tr_count || 0) > 1
                ? ` ${(memo.locking_tr_count || 0) - 1} additional TR(s) also use this memo.`
                : "";
            return toast.error(`Memo ${memo.memo_number} is locked by ${blocker} and cannot be used until that TR is Posted.${additionalBlockers}`);
        }
        if (isAlreadyInPayables) {
            return toast.error(`Memo ${memo.memo_number} is already applied to this TR.`);
        }
        const isCredit = memo.type === 1;
        const remainingAmount = Number(memo.remaining_amount ?? memo.amount) || 0;
        const locallyRemainingAmount = getMemoAvailableAmount(remainingAmount, payables, memo.memo_number);
        const requestedAmount = Number(memoAmounts[String(memo.id)] ?? remainingAmount);
        const memoAmountError = getMemoAmountError(requestedAmount, locallyRemainingAmount);
        if (memoAmountError) {
            return toast.error(memoAmountError);
        }
        const finalAmount = isCredit ? -Math.abs(requestedAmount) : Math.abs(requestedAmount);

        setPayables((previous) => [...previous, {
            isMemo: true,
            memoId: memo.id,
            memoType: memo.type,
            memoNumber: memo.memo_number,
            memoSupplierId: Number(payeeId),
            referenceNo: memo.memo_number,
            date: today,
            amount: finalAmount,
            coaId: memo.coa_id,
            remarks: `${memo.memo_type_name}: ${memo.reason || 'Applied to voucher'}`
        }]);

        setIsMemoModalOpen(false);
        toast.success(`${memo.memo_type_name} applied successfully!`);
    };

    const paymentCoaOptions = useMemo(() => coas.filter(isPaymentCOA).map((coa) => ({
        value: coa.coaId,
        label: `${coa.glCode || "NO-CODE"} - ${coa.accountTitle || "Unknown"}`,
    })), [coas]);

    const handleAddPayment = useCallback(() => {
        const remaining = Number((totalAmount - payments.reduce((sum, line) => sum + (Number(line.amount) || 0), 0)).toFixed(2));
        setPayments((current) => [...current, {
            checkNo: "",
            date: today,
            amount: remaining > 0 ? remaining : 0,
            remarks: "",
        }]);
    }, [payments, today, totalAmount]);

    const handlePaymentChange = <K extends keyof PaymentLine>(index: number, key: K, value: PaymentLine[K]) => {
        setPayments((current) => current.map((line, lineIndex) => {
            if (lineIndex !== index) return line;
            const nextLine = { ...line, [key]: value } as PaymentLine;
            if (key === "bankId" && isPettyCashBankAccount(
                banks.find((bank) => bank.bankId === Number(value)),
            )) {
                nextLine.checkNo = "";
            }
            return nextLine;
        }));
        setPaymentValidationErrors((current) => {
            const next = new Set(current);
            next.delete(`${index}:${String(key)}`);
            if (key === "bankId" || key === "coaId") {
                next.delete(`${index}:bankId`);
                next.delete(`${index}:checkNo`);
            }
            return next;
        });
    };

    const validatePayments = () => {
        const errors = new Set<string>();
        const messages: string[] = [];

        if (paymentTotal > totalAmount + 0.01) {
            toast.error(`Total payments cannot exceed the voucher amount of ${formatCurrency(totalAmount)}.`);
            return false;
        }

        payments.forEach((line, index) => {
            const selectedCoa = coas.find((coa) => coa.coaId === Number(line.coaId));
            const selectedBank = banks.find((bank) => bank.bankId === Number(line.bankId));
            const pettyCash = isPettyCashBankAccount(selectedBank);
            const missingFields: string[] = [];

            if (!line.date) {
                errors.add(`${index}:date`);
                missingFields.push("Payment Date");
            }
            if (!Number.isFinite(Number(line.amount)) || Number(line.amount) === 0) {
                errors.add(`${index}:amount`);
                missingFields.push("Amount");
            }
            if (!line.coaId || !selectedCoa) {
                errors.add(`${index}:coaId`);
                missingFields.push("GL Account");
            }
            if (!line.bankId) {
                errors.add(`${index}:bankId`);
                missingFields.push("Bank / Cash Account");
            }
            if (!pettyCash && String(line.checkNo || "").trim() === "") {
                errors.add(`${index}:checkNo`);
                missingFields.push("Check / Reference No.");
            }

            if (missingFields.length > 0) {
                messages.push(`Payment row ${index + 1}: ${missingFields.join(", ")}`);
            }
        });

        setPaymentValidationErrors(errors);
        if (errors.size > 0) {
            toast.error(`Please complete the following payment fields:\n${messages.join("\n")}`);
            return false;
        }
        return true;
    };

    const validatePayables = () => {
        const errors = new Set<string>();
        const invalidRows: number[] = [];

        payables.forEach((line, index) => {
            if (!isPopulatedPayableLine(line) || isValidDivisionId(line.divisionId)) return;
            errors.add(`${index}:divisionId`);
            invalidRows.push(index + 1);
        });

        setPayableValidationErrors(errors);
        if (invalidRows.length > 0) {
            toast.error(`Cost Division is required on payable row${invalidRows.length === 1 ? "" : "s"} ${invalidRows.join(", ")}.`);
            return false;
        }
        return true;
    };

    const handleSubmit = async () => {
        if (loading || isReadOnly || submitLockRef.current) return;
        const isPartialReleasePaymentEdit = isPaymentEditorEnabled && editData?.status === "Partially Released";
        if (!transactionTypeId) return toast.error("Transaction Type is required.");
        if (!payeeId) return toast.error("Please select a Payee.");
        if (!departmentId && !isPartialReleasePaymentEdit) return toast.error("Department is required.");
        if (totalAmount <= 0) return toast.error("Voucher total must be greater than 0.");
        if (memoSupplierMismatchIndices.size > 0) {
            return toast.error("Remove and reapply memo lines that belong to a different supplier.");
        }
        if (!isPaymentOnlyEdit && !validatePayables()) return;
        const memoAmountError = Object.values(memoAmountErrors)[0];
        if (memoAmountError) return toast.error(memoAmountError);
        if (isPaymentEditorEnabled && !validatePayments()) return;

        submitLockRef.current = true;
        setLocalSubmitting(true);
        try {
            const paymentLines = payments.map((line) => {
                const selectedBank = banks.find((bank) => bank.bankId === Number(line.bankId));
                const pettyCash = isPettyCashBankAccount(selectedBank);
                return {
                    ...line,
                    coaId: Number(line.coaId),
                    bankId: line.bankId ? Number(line.bankId) : undefined,
                    checkNo: pettyCash ? "" : line.checkNo,
                };
            });
            const payload: DisbursementPayload = {
                ...(editData ? { docNo: editData.docNo } : {}),
                transactionTypeId: Number(transactionTypeId),
                payeeId: Number(payeeId),
                departmentId: departmentId ? Number(departmentId) : undefined,
                remarks,
                supportingDocumentsUrl: supportingDocumentsUrl ? (supportingDocumentsUrl.includes("/") ? (supportingDocumentsUrl.split("/").pop()?.split("?")[0] || "") : supportingDocumentsUrl) : "",
                totalAmount: totalAmount,
                transactionDate,
                payables: payables.map(p => stripMemoLineMetadata({
                    ...p,
                    coaId: p.coaId ? Number(p.coaId) : undefined,
                    divisionId: p.divisionId ? Number(p.divisionId) : undefined
                })),
                ...(isPaymentEditorEnabled ? {
                    payments: paymentLines,
                } : {}),
            };
            const result = editData && isPaymentOnlyEdit && onPaymentAllocationSubmit
                ? await onPaymentAllocationSubmit(editData.id, paymentLines)
                : await onSubmit(payload);
            if (result.success) {
                setTransactionTypeId(1);
                setPayeeId("");
                setDepartmentId("");
                setRemarks("");
                setSupportingDocumentsUrl("");
                setPayables([]);
                setPayments([]);
                setPaymentValidationErrors(new Set());
                setPayableValidationErrors(new Set());
                onOpenChange(false);
            }
        } finally {
            submitLockRef.current = false;
            setLocalSubmitting(false);
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent
                    className="max-w-[98vw] sm:max-w-[98vw] w-[98vw] h-[96vh] p-0 flex flex-col bg-background overflow-hidden border border-border shadow-2xl rounded-xl">
                    <DialogHeader className="px-6 py-4 border-b border-border bg-card shrink-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                            <DialogTitle className="text-lg font-bold text-foreground">
                                {editData ? `Disbursement Voucher [Doc: ${editData.docNo}]` : "New Disbursement Voucher"}
                            </DialogTitle>
                            <DialogDescription className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                                {editData ? "Update voucher details and line items." : "Draft a new voucher, select a payee, and assign financial entries."}
                            </DialogDescription>
                        </div>

                        {/* Totals Summary on the right side of the header */}
                        <div className="flex items-center gap-6 text-xs bg-muted/40 border border-border px-4 py-2 rounded-sm select-none self-end sm:self-auto">
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] text-muted-foreground font-semibold uppercase">Total Allocated</span>
                                <span className="font-bold text-foreground">{formatCurrency(totalAmount)}</span>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden h-full">
                        {/* LEFT COLUMN: Metadata inputs, attachments & totals */}
                        <div className="md:col-span-4 border-r border-border bg-muted/5 flex flex-col h-full overflow-y-auto scrollbar-thin">
                            <div className="p-5 space-y-5">
                                <VoucherDetailsSection
                                    transactionTypeId={transactionTypeId}
                                    setTransactionTypeId={setTransactionTypeId}
                                    transactionDate={transactionDate}
                                    setTransactionDate={setTransactionDate}
                                    payeeId={payeeId}
                                    handlePayeeSelect={handlePayeeSelect}
                                    suppliers={suppliers}
                                    loadingData={loadingData}
                                    payeeSupplierTypeLabel={payeeSupplierTypeLabel}
                                    isNonTradeVoucher={isNonTradeVoucher}
                                    setIsPayeeRegistrationOpen={setIsPayeeRegistrationOpen}
                                    handleOpenPoModal={handleOpenPoModal}
                                    departments={departments}
                                    departmentId={departmentId}
                                    setDepartmentId={setDepartmentId}
                                    remarks={remarks}
                                    setRemarks={setRemarks}
                                    supportingDocumentsUrl={supportingDocumentsUrl}
                                    setSupportingDocumentsUrl={setSupportingDocumentsUrl}
                                    uploadingFile={uploadingFile}
                                    setUploadingFile={setUploadingFile}
                                    totalAmount={totalAmount}
                                    disabled={isHeaderLocked}
                                />
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Table line items */}
                        <div className={cn(
                            "md:col-span-8 flex flex-col h-full scrollbar-thin bg-background",
                            isPaymentEditorEnabled ? "overflow-y-auto" : "overflow-hidden",
                        )}>
                            <div className={cn(
                                "p-6",
                                isPaymentEditorEnabled ? "space-y-6" : "h-full min-h-0 flex flex-col",
                            )}>
                                <PayablesSection
                                    payables={payables}
                                    setPayables={setPayables}
                                    coas={coas}
                                    divisions={divisions}
                                    isPayableOrExpenseCOA={isPayableOrExpenseCOA}
                                    totalAmount={totalAmount}
                                    payeeId={payeeId}
                                    handleAddPayable={handleAddPayable}
                                    handleOpenMemoModal={handleOpenMemoModal}
                                    handleRemovePayable={handleRemovePayable}
                                    handleAmountChange={handleAmountChange}
                                    formatMoney={formatCurrency}
                                    memoReferences={memoReferences}
                                    memoSupplierMismatchIndices={memoSupplierMismatchIndices}
                                    memoAmountErrors={memoAmountErrors}
                                    divisionValidationErrors={payableValidationErrors}
                                    onDivisionSelect={handleDivisionSelect}
                                    disabled={isPayablesLocked}
                                    isAddDisabled={!departmentId}
                                    fillHeight={!isPaymentEditorEnabled}
                                />

                                {isPaymentEditorEnabled && (
                                    <CashIssuancePaymentForm
                                        payments={payments}
                                        setPayments={setPayments}
                                        banks={banks}
                                        paymentCoaOptions={paymentCoaOptions}
                                        paymentValidationErrors={paymentValidationErrors}
                                        setPaymentValidationErrors={setPaymentValidationErrors}
                                        handlePaymentChange={handlePaymentChange}
                                        handleAddPayment={handleAddPayment}
                                        arePaymentFieldsLocked={arePaymentFieldsLocked}
                                        paymentTotal={paymentTotal}
                                        remainingPayment={remainingPayment}
                                        formatCurrency={formatCurrency}
                                    />
                                )}

                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-muted border-t border-border shrink-0 flex justify-between items-center z-10">
                        <div
                            className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                            Lines: {payables.length} Allocated
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => onOpenChange(false)}
                                className="border-input text-foreground hover:bg-accent font-bold text-xs h-9 px-5 rounded-sm">Cancel</Button>
                            <Button onClick={handleSubmit} disabled={loading || localSubmitting || isReadOnly}
                                className="text-xs font-bold h-9 px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-sm shadow-sm transition-colors">
                                {loading || localSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> :
                                    <Save className="w-4 h-4 mr-2" />}
                                {editData ? "Save and Close" : "Save and Close"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <AddPayeeModal
                open={isPayeeRegistrationOpen}
                onClose={() => setIsPayeeRegistrationOpen(false)}
                onSuccess={handlePayeeCreated}
                supplierType={payeeSupplierType}
            />

            <Dialog open={isPoModalOpen} onOpenChange={handlePoModalOpenChange}>
                <DialogContent className="sm:max-w-[750px] bg-background border-border">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-black uppercase flex items-center gap-2 text-foreground">
                            <DownloadCloud className="w-5 h-5 text-amber-500" />
                            Pending Records
                        </DialogTitle>
                        <DialogDescription
                            className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            Select the records to process for payment, and specify the tax treatment.
                        </DialogDescription>
                    </DialogHeader>

                    {/* SEARCH BAR */}
                    <div className="mt-2 flex items-center gap-2 bg-muted/50 p-2 rounded-md border border-border">
                        <Search className="w-4 h-4 text-muted-foreground ml-2" />
                        <Input
                            placeholder="Search by PO # or Invoice #..."
                            value={poSearchQuery}
                            onChange={(e) => setPoSearchQuery(e.target.value)}
                            className="h-8 text-xs font-bold uppercase bg-background border-none shadow-none focus-visible:ring-0"
                        />
                    </div>

                    <StickyTableWrapper className="max-h-[350px] overflow-auto border border-border rounded-md mt-2 custom-scrollbar">
                        <Table>
                            <TableHeader className="bg-muted/80 backdrop-blur-md sticky top-0 z-10 shadow-[0_1px_0_0_hsl(var(--border))]">
                                <TableRow className="border-border">
                                    <TableHead className="w-[40px] text-center"></TableHead>
                                    <TableHead
                                        className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">PO
                                        Number</TableHead>
                                    <TableHead
                                        className="text-[10px] font-black uppercase tracking-widest text-primary">Invoice
                                        #</TableHead>
                                    <TableHead
                                        className="text-[10px] font-black uppercase tracking-widest text-muted-foreground w-[160px]">Tax
                                        Classification</TableHead>
                                    <TableHead
                                        className="text-[10px] font-black uppercase tracking-widest text-right text-muted-foreground">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingPos ? (
                                    <TableRow><TableCell colSpan={5}
                                        className="h-24 text-center text-sm font-medium text-muted-foreground"><Loader2
                                            className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading
                                        Records...</TableCell></TableRow>
                                ) : poLoadError ? (
                                    handlePendingRecordsError
                                ) : unpaidPos.filter(po =>
                                    po.poNo.toLowerCase().includes(poSearchQuery.toLowerCase()) ||
                                    (po.receiptNo && po.receiptNo.toLowerCase().includes(poSearchQuery.toLowerCase()))
                                ).length === 0 ? (
                                    <TableRow><TableCell colSpan={5}
                                        className="h-24 text-center text-sm font-medium text-muted-foreground">No
                                        matching records found.</TableCell></TableRow>
                                ) : (
                                    unpaidPos.filter(po =>
                                        po.poNo.toLowerCase().includes(poSearchQuery.toLowerCase()) ||
                                        (po.receiptNo && po.receiptNo.toLowerCase().includes(poSearchQuery.toLowerCase()))
                                    ).map(po => (
                                        <TableRow key={po.uniqueKey}
                                            className="cursor-pointer hover:bg-muted/50 border-border"
                                            onClick={() => {
                                                const isChecking = !selectedPoIds.includes(po.uniqueKey);
                                                setSelectedPoIds(prev => isChecking ? [...prev, po.uniqueKey] : prev.filter(id => id !== po.uniqueKey));
                                                if (isChecking && !taxTypes[po.uniqueKey]) {
                                                    setTaxTypes(prev => ({ ...prev, [po.uniqueKey]: "VAT" }));
                                                }
                                            }}>
                                            <TableCell className="text-center">
                                                <Checkbox checked={selectedPoIds.includes(po.uniqueKey)}
                                                    onCheckedChange={(checked: boolean | "indeterminate") => {
                                                        if (checked === true) {
                                                            setSelectedPoIds([...selectedPoIds, po.uniqueKey]);
                                                            if (!taxTypes[po.uniqueKey]) setTaxTypes(prev => ({
                                                                ...prev,
                                                                [po.uniqueKey]: "VAT"
                                                            }));
                                                        } else {
                                                            setSelectedPoIds(selectedPoIds.filter(id => id !== po.uniqueKey));
                                                        }
                                                    }} />
                                            </TableCell>
                                            <TableCell
                                                className="font-bold text-xs uppercase flex flex-col gap-1 text-foreground mt-1.5 border-none">
                                                <div className="flex items-center gap-1.5"><FileText
                                                    className="w-3 h-3 text-muted-foreground" /> {po.poNo}</div>
                                                <span
                                                    className="text-[9px] text-muted-foreground font-medium ml-4.5">{po.date ? format(new Date(po.date), "MMM dd, yyyy") : "No Date"}</span>
                                            </TableCell>
                                            <TableCell className="text-xs font-black text-primary uppercase">
                                                <div className="flex flex-col gap-1">
                                                    {po.receiptNo}
                                                    {po.type === 'CWO' && <Badge variant="outline"
                                                        className="w-fit text-[8px] bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">Cash
                                                        With Order</Badge>}
                                                </div>
                                            </TableCell>
                                            <TableCell onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                                <select
                                                    className="h-7 w-full rounded-sm border border-input bg-background px-1 text-[10px] font-bold text-foreground shadow-sm disabled:opacity-30"
                                                    value={taxTypes[po.uniqueKey] || "VAT"}
                                                    onChange={(e) => setTaxTypes({
                                                        ...taxTypes,
                                                        [po.uniqueKey]: e.target.value as "VAT" | "NON_VAT"
                                                    })} disabled={!selectedPoIds.includes(po.uniqueKey)}>
                                                    <option value="VAT">VAT Registered</option>
                                                    <option value="NON_VAT">Non-Registered (No VAT)</option>
                                                </select>
                                            </TableCell>
                                            <TableCell
                                                className="text-xs font-black text-right text-emerald-600 dark:text-emerald-500">₱ {po.amountDue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </StickyTableWrapper>

                    <DialogFooter className="mt-4 border-t border-border pt-4">
                        <Button variant="outline" onClick={() => setIsPoModalOpen(false)}
                            className="text-[10px] font-black uppercase tracking-widest">Cancel</Button>
                        <Button onClick={handleImportPos} disabled={selectedPoIds.length === 0}
                            className="text-[10px] font-black uppercase tracking-widest bg-amber-500 hover:bg-amber-600 text-white">
                            Import {selectedPoIds.length} Record(s)
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isMemoModalOpen} onOpenChange={(open) => {
                setIsMemoModalOpen(open);
                if (!open) setMemoSearchQuery("");
            }}>
                <DialogContent className="sm:max-w-[700px] bg-background border-border">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-black uppercase flex items-center gap-2 text-foreground">
                            <FileText className="w-5 h-5 text-purple-500" />
                            Available Supplier Memos
                        </DialogTitle>
                        <DialogDescription
                            className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            Locked memos remain visible but cannot be applied until their blocking TR is Posted.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="relative mt-4">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            type="search"
                            aria-label="Search supplier memos"
                            placeholder="Search memo number, type, date, account, reason, or amount..."
                            value={memoSearchQuery}
                            onChange={(event) => setMemoSearchQuery(event.target.value)}
                            className="pl-9"
                        />
                    </div>

                    <StickyTableWrapper className="max-h-[400px] overflow-auto border border-border rounded-md mt-4 custom-scrollbar">
                        <Table>
                            <TableHeader className="bg-muted/80 backdrop-blur-md sticky top-0 z-10 shadow-[0_1px_0_0_hsl(var(--border))]">
                                <TableRow className="border-border">
                                    <TableHead
                                        className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Memo
                                        No</TableHead>
                                    <TableHead
                                        className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Type
                                        / Date</TableHead>
                                    <TableHead
                                        className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">GL
                                        Account & Reason</TableHead>
                                    <TableHead
                                        className="text-[10px] font-black uppercase tracking-widest text-right text-muted-foreground">Amount</TableHead>
                                    <TableHead className="w-[80px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingMemos ? (
                                    <TableRow><TableCell colSpan={5}
                                        className="h-24 text-center text-sm font-medium text-muted-foreground"><Loader2
                                            className="w-5 h-5 animate-spin mx-auto mb-2" /> Fetching
                                        Memos...</TableCell></TableRow>
                                ) : memoLoadError ? (
                                    <TableRow><TableCell colSpan={5}
                                        className="h-24 text-center text-sm font-medium text-destructive">{memoLoadError}</TableCell></TableRow>
                                ) : availableMemos.length === 0 ? (
                                    <TableRow><TableCell colSpan={5}
                                        className="h-24 text-center text-sm font-medium text-muted-foreground">No
                                        available memos found for this supplier.</TableCell></TableRow>
                                ) : filteredMemos.length === 0 ? (
                                    <TableRow><TableCell colSpan={5}
                                        className="h-24 text-center text-sm font-medium text-muted-foreground">No
                                        supplier memos match your search.</TableCell></TableRow>
                                ) : (
                                    filteredMemos.map(memo => {
                                        const isMemoLocked = !!memo.is_locked
                                            || payables.some((payable) => normalizeMemoReference(payable.referenceNo) === normalizeMemoReference(memo.memo_number));
                                        const memoAvailableAmount = getMemoAvailableAmount(
                                            memo.remaining_amount ?? memo.amount,
                                            payables,
                                            memo.memo_number,
                                        );
                                        const requestedAmount = Number(
                                            memoAmounts[String(memo.id)] ?? memo.remaining_amount ?? memo.amount,
                                        );
                                        const memoAmountError = isMemoLocked
                                            ? null
                                            : getMemoAmountError(requestedAmount, memoAvailableAmount);
                                        const lockDescription = memo.is_locked
                                            ? `Locked by ${memo.locking_tr_doc_no || "another unposted TR"}${memo.locking_tr_status ? ` (${memo.locking_tr_status})` : ""}${(memo.locking_tr_count || 0) > 1 ? ` · ${(memo.locking_tr_count || 0) - 1} more` : ""}`
                                            : "Already applied to this TR.";

                                        return (
                                            <TableRow key={memo.id} className={`hover:bg-muted/50 border-border ${isMemoLocked ? "bg-muted/40" : ""}`}>
                                                <TableCell
                                                    className="font-bold text-xs uppercase text-foreground">
                                                    <div>{memo.memo_number}</div>
                                                    {isMemoLocked && (
                                                        <Badge variant="outline" className="mt-1 text-[9px] uppercase text-amber-700 border-amber-300 bg-amber-50">
                                                            <LockKeyhole className="mr-1 h-3 w-3" /> Locked
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline"
                                                        className={`text-[9px] uppercase ${memo.type === 1 ? 'text-emerald-600 border-emerald-200 bg-emerald-50' : 'text-red-600 border-red-200 bg-red-50'}`}>
                                                        {memo.memo_type_name}
                                                    </Badge>
                                                    <div
                                                        className="text-[9px] text-muted-foreground mt-1 font-medium">{format(new Date(memo.date), "MMM dd, yyyy")}</div>
                                                </TableCell>
                                                <TableCell>
                                                    <div
                                                        className="text-[10px] font-black uppercase text-foreground">{memo.account_title}</div>
                                                    <div
                                                        className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[180px]">{memo.reason || "N/A"}</div>
                                                    {isMemoLocked && <div className="mt-1 text-[9px] font-bold text-amber-700">{lockDescription}</div>}
                                                </TableCell>
                                                <TableCell
                                                    className={`text-xs font-black text-right ${memo.type === 1 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                    <div>{memo.type === 1 ? '-' : '+'} ₱{memo.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                                                    <div className="text-[9px] font-bold text-muted-foreground">Remaining: ₱{(memo.remaining_amount ?? memo.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                                                    <Input
                                                        type="number"
                                                        min="0.01"
                                                        max={memoAvailableAmount}
                                                        step="0.01"
                                                        value={memoAmounts[String(memo.id)] ?? String(memo.remaining_amount ?? memo.amount)}
                                                        onChange={(event) => setMemoAmounts((current) => ({ ...current, [String(memo.id)]: event.target.value }))}
                                                        disabled={isMemoLocked}
                                                        aria-invalid={!!memoAmountError}
                                                        className={`h-7 w-28 ml-auto mt-1 text-right text-xs ${memoAmountError ? "border-destructive" : ""}`}
                                                    />
                                                    {memoAmountError && (
                                                        <p role="alert" className="mt-1 text-[10px] leading-tight text-destructive">
                                                            {memoAmountError}
                                                        </p>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button size="sm" onClick={() => handleApplyMemo(memo)} disabled={isMemoLocked || !!memoAmountError}
                                                        className="h-7 text-[10px] font-black uppercase tracking-widest bg-purple-600 hover:bg-purple-700 text-white">
                                                        Apply
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </StickyTableWrapper>
                </DialogContent>
            </Dialog>
        </>
    );
}
