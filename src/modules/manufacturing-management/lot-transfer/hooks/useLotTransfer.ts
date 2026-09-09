"use client";

import { useCallback, useEffect, useMemo, useState, type SetStateAction } from "react";
import {
    approveLotTransfer,
    cancelLotTransfer,
    createLotTransfer,
    deleteLotTransfer,
    fetchBranches,
    fetchBatches,
    fetchLotTransfers,
    fetchLotTransferUsers,
    fetchLots,
    fetchProducts,
    postLotTransfer,
    previewLotTransfer,
    previewLotTransferInput,
    rejectLotTransfer,
    reverseLotTransfer,
    submitLotTransfer,
    updateLotTransfer
} from "../services/api";
import type {
    BatchOption,
    BranchOption,
    LotOption,
    LotTransfer,
    LotTransferDetail,
    LotTransferForm,
    LotTransferFormDetail,
    LotTransferMode,
    LotTransferPreview,
    ProductOption,
    LotTransferReportFilters,
    LotTransferStatus,
    UserOption
} from "../types";
import { DEFAULT_LOT_TRANSFER_REPORT_FILTERS, EMPTY_LOT_TRANSFER_FORM as emptyForm } from "../types";

interface UseLotTransferOptions {
    mode: LotTransferMode;
    userBranchId?: number | null;
}

const WORKFLOW_VISIBLE_STATUSES: LotTransferStatus[] = ["Draft", "Submitted", "Approved", "Posted", "Rejected", "Cancelled", "Reversed"];

function formFromRecord(record: LotTransfer, fallbackBranchId?: number | null): LotTransferForm {
    const details = record.details?.length > 0 ? record.details : [{
        detailId: null,
        lineNo: 1,
        productId: record.productId,
        sourceInventoryLotId: record.sourceInventoryLotId,
        sourceBatchNo: record.sourceBatchNo,
        targetInventoryLotId: record.targetInventoryLotId,
        targetBatchNo: record.targetBatchNo,
        quantity: record.quantity,
        lineRemarks: ""
    } as LotTransferDetail];
    return {
        branchId: String(record.branchId || fallbackBranchId || ""),
        sourceLotId: String(record.sourceLotId || ""),
        targetLotId: String(record.targetLotId || ""),
        reason: record.reason,
        details: details.map((detail) => ({
            detailId: detail.detailId || undefined,
            lineNo: detail.lineNo,
            productId: String(detail.productId || ""),
            sourceInventoryLotId: String(detail.sourceInventoryLotId || ""),
            sourceBatchNo: detail.sourceBatchNo,
            targetInventoryLotId: String(detail.targetInventoryLotId || ""),
            targetBatchNo: detail.targetBatchNo,
            quantity: String(detail.quantity || ""),
            lineRemarks: detail.lineRemarks || ""
        }))
    };
}

function initialForm(userBranchId?: number | null): LotTransferForm {
    return {
        ...emptyForm,
        branchId: userBranchId && userBranchId > 0 ? String(userBranchId) : "",
        details: [{
            lineNo: 1,
            productId: "",
            sourceInventoryLotId: "",
            sourceBatchNo: "",
            targetInventoryLotId: "",
            targetBatchNo: "",
            quantity: "",
            lineRemarks: ""
        }]
    };
}

function hasSameLotSelection(form: LotTransferForm): boolean {
    return Boolean(form.sourceLotId && form.targetLotId && form.sourceLotId === form.targetLotId);
}

function formKey(form: LotTransferForm): string {
    return JSON.stringify(form);
}

function isCompleteDraftForm(form: LotTransferForm): boolean {
    return Boolean(
        Number(form.branchId) > 0
        && Number(form.sourceLotId) > 0
        && Number(form.targetLotId) > 0
        && form.details.length > 0
        && form.details.every((detail) => Number(detail.productId) > 0
            && Number(detail.sourceInventoryLotId) > 0
            && detail.sourceBatchNo.trim()
            && Number(detail.targetInventoryLotId) > 0
            && detail.targetBatchNo.trim()
            && Number(detail.quantity) > 0)
        && form.reason.trim()
    );
}

type DraftValidationStatus = "idle" | "stale" | "loading" | "valid" | "invalid" | "error";

export function useLotTransfer({ mode, userBranchId }: UseLotTransferOptions) {
    const [records, setRecords] = useState<LotTransfer[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [form, setForm] = useState<LotTransferForm>(() => initialForm(userBranchId));
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [selectedRecord, setSelectedRecord] = useState<LotTransfer | null>(null);
    const [preview, setPreview] = useState<LotTransferPreview | null>(null);
    const [products, setProducts] = useState<ProductOption[]>([]);
    const [lots, setLots] = useState<LotOption[]>([]);
    const [branches, setBranches] = useState<BranchOption[]>([]);
    const [users, setUsers] = useState<UserOption[]>([]);
    const [batchesByLot, setBatchesByLot] = useState<Record<number, BatchOption[]>>({});
    const [reportFilters, setReportFilters] = useState<LotTransferReportFilters>(() => ({
        ...DEFAULT_LOT_TRANSFER_REPORT_FILTERS,
        statuses: [...DEFAULT_LOT_TRANSFER_REPORT_FILTERS.statuses]
    }));
    const [appliedReportFilters, setAppliedReportFilters] = useState<LotTransferReportFilters>(() => ({
        ...DEFAULT_LOT_TRANSFER_REPORT_FILTERS,
        statuses: [...DEFAULT_LOT_TRANSFER_REPORT_FILTERS.statuses]
    }));
    const [isLoading, setIsLoading] = useState(true);
    const [isLookupLoading, setIsLookupLoading] = useState(false);
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [draftValidationStatus, setDraftValidationStatus] = useState<DraftValidationStatus>("idle");
    const [draftValidationMessage, setDraftValidationMessage] = useState<string | null>(null);
    const [validatedDraftKey, setValidatedDraftKey] = useState("");

    const draftFormKey = useMemo(() => formKey(form), [form]);
    const draftValidationIsCurrent = validatedDraftKey === draftFormKey;

    const markDraftValidationStale = useCallback(() => {
        setPreview(null);
        setDraftValidationStatus("stale");
        setDraftValidationMessage(null);
        setValidatedDraftKey("");
    }, []);

    const updateForm = useCallback((updater: SetStateAction<LotTransferForm>) => {
        markDraftValidationStale();
        setForm(updater);
    }, [markDraftValidationStale]);

    const refresh = useCallback(async () => {
        setIsLoading(true);
        try {
            const workflowStatuses = mode === "summary"
                ? appliedReportFilters.statuses
                : WORKFLOW_VISIBLE_STATUSES;
            const report = mode === "summary" ? appliedReportFilters : null;
            const response = await fetchLotTransfers({
                status: workflowStatuses,
                branchId: userBranchId || (report?.branchId ? Number(report.branchId) : undefined),
                search: report?.search,
                requestedFrom: report?.requestedFrom,
                requestedTo: report?.requestedTo,
                transferDateFrom: report?.transferDateFrom,
                transferDateTo: report?.transferDateTo,
                productId: report?.productId ? Number(report.productId) : undefined,
                sourceLotId: report?.sourceLotId ? Number(report.sourceLotId) : undefined,
                targetLotId: report?.targetLotId ? Number(report.targetLotId) : undefined,
                sourceBatchNo: report?.sourceBatchNo,
                targetBatchNo: report?.targetBatchNo,
                requestedBy: report?.requestedBy ? Number(report.requestedBy) : undefined,
                approvedBy: report?.approvedBy ? Number(report.approvedBy) : undefined,
                postedBy: report?.postedBy ? Number(report.postedBy) : undefined
            });
            setRecords(response.data);
            setTotalCount(response.totalCount);
            setError(null);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Unable to load lot-transfer requests.");
        } finally {
            setIsLoading(false);
        }
    }, [appliedReportFilters, mode, userBranchId]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        if (mode !== "request" || !isCompleteDraftForm(form)) return;
        let cancelled = false;
        const currentKey = draftFormKey;
        const timer = window.setTimeout(async () => {
            if (cancelled) return;
            setDraftValidationStatus("loading");
            setDraftValidationMessage("Running the latest server validation checks...");
            try {
                const nextPreview = await previewLotTransferInput(form);
                if (cancelled) return;
                setPreview(nextPreview);
                setValidatedDraftKey(currentKey);
                setDraftValidationStatus(nextPreview.canApprove ? "valid" : "invalid");
                setDraftValidationMessage(nextPreview.canApprove
                    ? "All server validation checks passed."
                    : "Correct the failed checks before submitting for QA approval.");
            } catch (validationError) {
                if (cancelled) return;
                setPreview(null);
                setValidatedDraftKey("");
                setDraftValidationStatus("error");
                setDraftValidationMessage(validationError instanceof Error
                    ? validationError.message
                    : "Unable to run server validation. Retry before submitting.");
            }
        }, 450);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [draftFormKey, form, mode]);

    useEffect(() => {
        let active = true;
        const loadLookups = async () => {
            setIsLookupLoading(true);
            try {
                const [productRows, lotRows, branchRows, userRows] = await Promise.all([
                    fetchProducts(),
                    fetchLots(userBranchId || undefined),
                    fetchBranches(),
                    mode === "summary" ? fetchLotTransferUsers() : Promise.resolve([])
                ]);
                if (!active) return;
                setProducts(productRows);
                setLots(lotRows);
                setBranches(branchRows);
                setUsers(userRows);
                setError(null);
            } catch (lookupError) {
                if (active) setError(lookupError instanceof Error ? lookupError.message : "Unable to load lot-transfer options.");
            } finally {
                if (active) setIsLookupLoading(false);
            }
        };
        void loadLookups();
        return () => {
            active = false;
        };
    }, [mode, userBranchId]);

    const loadBatchesForLot = useCallback(async (lotId: number) => {
        if (!lotId || batchesByLot[lotId]) return batchesByLot[lotId] || [];
        try {
            const rows = await fetchBatches(lotId);
            setBatchesByLot((current) => ({ ...current, [lotId]: rows }));
            return rows;
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Unable to load lot batches.");
            return [];
        }
    }, [batchesByLot]);

    const setField = useCallback(<K extends keyof LotTransferForm>(field: K, value: LotTransferForm[K]) => {
        updateForm((current) => ({ ...current, [field]: value }));
    }, [updateForm]);

    const clearSelection = useCallback(() => {
        setSelectedId(null);
        setSelectedRecord(null);
        setPreview(null);
        setDraftValidationStatus("idle");
        setDraftValidationMessage(null);
        setValidatedDraftKey("");
        setForm(initialForm(userBranchId));
    }, [userBranchId]);

    const selectRecord = useCallback(async (record: LotTransfer) => {
        setSelectedId(record.id);
        setSelectedRecord(record);
        markDraftValidationStale();
        setForm(formFromRecord(record, userBranchId));
        setError(null);
        if (record.sourceLotId > 0) void loadBatchesForLot(record.sourceLotId);
        if (record.targetLotId > 0 && record.targetLotId !== record.sourceLotId) void loadBatchesForLot(record.targetLotId);
        const shouldLoadPreview = (mode === "approval" && record.status === "Submitted")
            || (mode === "posting" && record.status === "Approved");
        if (shouldLoadPreview) {
            setIsActionLoading(true);
            try {
                setPreview(await previewLotTransfer(record.id));
            } catch (previewError) {
                setPreview(null);
                setError(previewError instanceof Error ? previewError.message : "Unable to generate the QA preview.");
            } finally {
                setIsActionLoading(false);
            }
        }
    }, [loadBatchesForLot, markDraftValidationStale, mode, userBranchId]);

    const handleSourceLotChange = useCallback((lotId: string) => {
        updateForm((current) => ({
            ...current,
            sourceLotId: lotId,
            details: current.details.map((detail) => ({
                ...detail,
                sourceInventoryLotId: "",
                sourceBatchNo: "",
                targetInventoryLotId: "",
                targetBatchNo: ""
            }))
        }));
        if (form.targetLotId === lotId) setError("Source and destination lot IDs must be different.");
        void loadBatchesForLot(Number(lotId));
    }, [form.targetLotId, loadBatchesForLot, updateForm]);

    const handleTargetLotChange = useCallback((lotId: string) => {
        if (form.sourceLotId === lotId) {
            updateForm((current) => ({
                ...current,
                targetLotId: "",
                details: current.details.map((detail) => ({
                    ...detail,
                    targetInventoryLotId: "",
                    targetBatchNo: ""
                }))
            }));
            setError("Source and destination lot IDs must be different.");
            return;
        }
        updateForm((current) => ({
            ...current,
            targetLotId: lotId,
            details: current.details.map((detail) => ({
                ...detail,
                targetInventoryLotId: "",
                targetBatchNo: ""
            }))
        }));
        void loadBatchesForLot(Number(lotId));
    }, [form.sourceLotId, loadBatchesForLot, updateForm]);

    const updateDetail = useCallback((index: number, patch: Partial<LotTransferFormDetail>) => {
        updateForm((current) => ({
            ...current,
            details: current.details.map((detail, detailIndex) => detailIndex === index ? { ...detail, ...patch } : detail)
        }));
    }, [updateForm]);

    const addDetail = useCallback(() => {
        updateForm((current) => ({
            ...current,
            details: [...current.details, {
                lineNo: current.details.length + 1,
                productId: "",
                sourceInventoryLotId: "",
                sourceBatchNo: "",
                targetInventoryLotId: "",
                targetBatchNo: "",
                quantity: "",
                lineRemarks: ""
            }]
        }));
    }, [updateForm]);

    const removeDetail = useCallback((index: number) => {
        updateForm((current) => ({
            ...current,
            details: current.details.filter((_, detailIndex) => detailIndex !== index).map((detail, detailIndex) => ({ ...detail, lineNo: detailIndex + 1 }))
        }));
    }, [updateForm]);

    const handleProductChange = useCallback((productId: string, index = 0) => {
        updateDetail(index, {
            productId,
            sourceInventoryLotId: "",
            sourceBatchNo: "",
            targetInventoryLotId: "",
            targetBatchNo: ""
        });
    }, [updateDetail]);

    const handleBatchChange = useCallback((index: number, side: "source" | "target", inventoryLotId: string) => {
        const lotId = Number(side === "source" ? form.sourceLotId : form.targetLotId);
        const batch = (batchesByLot[lotId] || []).find((row) => String(row.batchId) === inventoryLotId);
        updateDetail(index, side === "source"
            ? { sourceInventoryLotId: inventoryLotId, sourceBatchNo: batch?.batchNumber || "" }
            : { targetInventoryLotId: inventoryLotId, targetBatchNo: batch?.batchNumber || "" });
    }, [batchesByLot, form.sourceLotId, form.targetLotId, updateDetail]);

    const saveDraft = useCallback(async () => {
        if (hasSameLotSelection(form)) {
            setError("Source and destination lot IDs must be different.");
            return null;
        }
        setIsActionLoading(true);
        try {
            const saved = selectedId
                ? await updateLotTransfer(selectedId, form)
                : await createLotTransfer(form);
            const savedForm = formFromRecord(saved, userBranchId);
            setSelectedId(saved.id);
            setSelectedRecord(saved);
            setForm(savedForm);
            await refresh();
            try {
                const savedPreview = await previewLotTransfer(saved.id);
                setPreview(savedPreview);
                setValidatedDraftKey(formKey(savedForm));
                setDraftValidationStatus(savedPreview.canApprove ? "valid" : "invalid");
                setDraftValidationMessage(savedPreview.canApprove
                    ? "All server validation checks passed."
                    : "Draft saved. Correct the failed checks before submitting for QA approval.");
                setError(null);
            } catch (validationError) {
                setPreview(null);
                setValidatedDraftKey("");
                setDraftValidationStatus("error");
                setDraftValidationMessage("Draft saved, but server validation is unavailable. Retry before submitting.");
                setError(validationError instanceof Error ? validationError.message : "Unable to validate the saved Draft.");
            }
            return saved;
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Unable to save the lot-transfer draft.");
            return null;
        } finally {
            setIsActionLoading(false);
        }
    }, [form, refresh, selectedId, userBranchId]);

    const deleteDraft = useCallback(async (id: number) => {
        setIsActionLoading(true);
        try {
            await deleteLotTransfer(id);
            await refresh();
            if (selectedId === id) clearSelection();
            setError(null);
            return true;
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : "Unable to delete the lot-transfer draft.");
            return false;
        } finally {
            setIsActionLoading(false);
        }
    }, [clearSelection, refresh, selectedId]);

    const submit = useCallback(async () => {
        if (!selectedId) {
            setError("Save the lot-transfer request as a Draft before submitting it for QA approval.");
            return null;
        }
        if (hasSameLotSelection(form)) {
            setError("Source and destination lot IDs must be different.");
            return null;
        }
        if (!isCompleteDraftForm(form) || !draftValidationIsCurrent || draftValidationStatus !== "valid" || !preview?.canApprove) {
            setError("Complete a current passing server validation before submitting for QA approval.");
            return null;
        }
        setIsActionLoading(true);
        try {
            const submitted = await submitLotTransfer(selectedId);
            await refresh();
            clearSelection();
            setError(null);
            return submitted;
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : "Unable to submit the lot-transfer request.");
            return null;
        } finally {
            setIsActionLoading(false);
        }
    }, [clearSelection, draftValidationIsCurrent, draftValidationStatus, form, preview, refresh, selectedId]);

    const approve = useCallback(async () => {
        if (!selectedId) return null;
        setIsActionLoading(true);
        try {
            const result = await approveLotTransfer(selectedId);
            setSelectedRecord(result.transfer);
            setPreview(result.preview);
            await refresh();
            setError(null);
            return result.transfer;
        } catch (approveError) {
            setError(approveError instanceof Error ? approveError.message : "Unable to approve the lot-transfer request.");
            return null;
        } finally {
            setIsActionLoading(false);
        }
    }, [refresh, selectedId]);

    const post = useCallback(async () => {
        if (!selectedId) return null;
        setIsActionLoading(true);
        try {
            const result = await postLotTransfer(selectedId);
            setSelectedRecord(result.transfer);
            setPreview(result.preview);
            await refresh();
            setError(null);
            return result.transfer;
        } catch (postError) {
            setError(postError instanceof Error ? postError.message : "Unable to post the lot-transfer request.");
            return null;
        } finally {
            setIsActionLoading(false);
        }
    }, [refresh, selectedId]);

    const reject = useCallback(async (rejectionReason: string, qaEvidence?: string) => {
        if (!selectedId) return null;
        setIsActionLoading(true);
        try {
            const rejected = await rejectLotTransfer(selectedId, rejectionReason, qaEvidence);
            await refresh();
            setSelectedRecord(rejected);
            setPreview(null);
            setError(null);
            return rejected;
        } catch (rejectError) {
            setError(rejectError instanceof Error ? rejectError.message : "Unable to reject the lot-transfer request.");
            return null;
        } finally {
            setIsActionLoading(false);
        }
    }, [refresh, selectedId]);

    const cancel = useCallback(async (id: number, cancellationReason: string) => {
        setIsActionLoading(true);
        try {
            const cancelled = await cancelLotTransfer(id, cancellationReason);
            await refresh();
            if (selectedId === id) {
                setSelectedRecord(cancelled);
                setPreview(null);
            }
            setError(null);
            return cancelled;
        } catch (cancelError) {
            setError(cancelError instanceof Error ? cancelError.message : "Unable to cancel the lot-transfer request.");
            return null;
        } finally {
            setIsActionLoading(false);
        }
    }, [refresh, selectedId]);

    const reverse = useCallback(async (id: number, reversalReason: string) => {
        setIsActionLoading(true);
        try {
            const result = await reverseLotTransfer(id, reversalReason);
            await refresh();
            setSelectedId(result.transfer.id);
            setSelectedRecord(result.transfer);
            setPreview(result.preview);
            setError(null);
            return result.transfer;
        } catch (reverseError) {
            setError(reverseError instanceof Error ? reverseError.message : "Unable to reverse the lot-transfer request.");
            return null;
        } finally {
            setIsActionLoading(false);
        }
    }, [refresh]);

    const sourceBatches = useMemo(() => {
        const detail = form.details[0];
        const rows = batchesByLot[Number(form.sourceLotId)] || [];
        return rows.filter((row) => !detail?.productId || row.productId === Number(detail.productId));
    }, [batchesByLot, form.details, form.sourceLotId]);

    const targetBatches = useMemo(() => {
        const detail = form.details[0];
        const rows = batchesByLot[Number(form.targetLotId)] || [];
        return rows.filter((row) => !detail?.productId || row.productId === Number(detail.productId));
    }, [batchesByLot, form.details, form.targetLotId]);

    return {
        userBranchId,
        records,
        totalCount,
        form,
        selectedId,
        selectedRecord,
        preview,
        products,
        lots,
        branches,
        users,
        batchesByLot,
        loadBatchesForLot,
        sourceBatches,
        targetBatches,
        draftValidationStatus,
        draftValidationMessage,
        draftValidationIsCurrent,
        isDraftFormComplete: isCompleteDraftForm(form),
        reportFilters,
        setReportFilter: <K extends keyof LotTransferReportFilters>(field: K, value: LotTransferReportFilters[K]) => {
            setReportFilters((current) => ({ ...current, [field]: value }));
        },
        applyReportFilters: () => setAppliedReportFilters({
            ...reportFilters,
            statuses: [...reportFilters.statuses]
        }),
        clearReportFilters: () => {
            const nextFilters = {
                ...DEFAULT_LOT_TRANSFER_REPORT_FILTERS,
                branchId: userBranchId ? "" : DEFAULT_LOT_TRANSFER_REPORT_FILTERS.branchId,
                statuses: [...DEFAULT_LOT_TRANSFER_REPORT_FILTERS.statuses]
            };
            setReportFilters(nextFilters);
            setAppliedReportFilters(nextFilters);
        },
        setField,
        updateDetail,
        addDetail,
        removeDetail,
        handleProductChange,
        handleSourceLotChange,
        handleTargetLotChange,
        handleBatchChange,
        selectRecord,
        clearSelection,
        saveDraft,
        deleteDraft,
        submit,
        approve,
        post,
        reject,
        cancel,
        reverse,
        refresh,
        isLoading,
        isLookupLoading,
        isActionLoading,
        error
    };
}
