"use client";

import { useCallback, useEffect, useMemo, useState, type SetStateAction } from "react";
import {
    approveLotTransfer,
    createLotTransfer,
    deleteLotTransfer,
    fetchBranches,
    fetchBatches,
    fetchLotTransfers,
    fetchLots,
    fetchProducts,
    postLotTransfer,
    previewLotTransfer,
    previewLotTransferInput,
    rejectLotTransfer,
    submitLotTransfer,
    updateLotTransfer
} from "../services/api";
import type {
    BatchOption,
    BranchOption,
    LotOption,
    LotTransfer,
    LotTransferForm,
    LotTransferMode,
    LotTransferPreview,
    ProductOption
} from "../types";
import { EMPTY_LOT_TRANSFER_FORM as emptyForm } from "../types";

interface UseLotTransferOptions {
    mode: LotTransferMode;
    userBranchId?: number | null;
}

function formFromRecord(record: LotTransfer, fallbackBranchId?: number | null): LotTransferForm {
    return {
        branchId: String(record.branchId || fallbackBranchId || ""),
        productId: String(record.productId || ""),
        sourceLotId: String(record.sourceLotId || ""),
        sourceInventoryLotId: String(record.sourceInventoryLotId || ""),
        sourceBatchNo: record.sourceBatchNo,
        targetLotId: String(record.targetLotId || ""),
        targetInventoryLotId: String(record.targetInventoryLotId || ""),
        targetBatchNo: record.targetBatchNo,
        quantity: String(record.quantity || ""),
        reason: record.reason
    };
}

function initialForm(userBranchId?: number | null): LotTransferForm {
    return {
        ...emptyForm,
        branchId: userBranchId && userBranchId > 0 ? String(userBranchId) : ""
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
        && Number(form.productId) > 0
        && Number(form.sourceLotId) > 0
        && Number(form.sourceInventoryLotId) > 0
        && form.sourceBatchNo.trim()
        && Number(form.targetLotId) > 0
        && Number(form.targetInventoryLotId) > 0
        && form.targetBatchNo.trim()
        && Number(form.quantity) > 0
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
    const [batchesByLot, setBatchesByLot] = useState<Record<number, BatchOption[]>>({});
    const [search, setSearch] = useState("");
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
            const response = await fetchLotTransfers({
                status: mode === "request" ? "Draft" : mode === "approval" ? "Submitted" : mode === "posting" ? "Approved" : undefined,
                branchId: userBranchId || undefined
            });
            const nextRecords = mode === "summary"
                ? response.data.filter((record) => record.status === "Posted" || record.status === "Rejected")
                : response.data;
            setRecords(nextRecords);
            setTotalCount(mode === "summary" ? nextRecords.length : response.totalCount);
            setError(null);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Unable to load lot-transfer requests.");
        } finally {
            setIsLoading(false);
        }
    }, [mode, userBranchId]);

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
                const [productRows, lotRows, branchRows] = await Promise.all([
                    fetchProducts(),
                    fetchLots(userBranchId || undefined),
                    fetchBranches()
                ]);
                if (!active) return;
                setProducts(productRows);
                setLots(lotRows);
                setBranches(branchRows);
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
    }, [userBranchId]);

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
        if (mode === "approval" || mode === "posting") {
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
            sourceInventoryLotId: "",
            sourceBatchNo: "",
            targetLotId: current.targetLotId === lotId ? "" : current.targetLotId,
            targetInventoryLotId: current.targetLotId === lotId ? "" : current.targetInventoryLotId,
            targetBatchNo: current.targetLotId === lotId ? "" : current.targetBatchNo
        }));
        if (form.targetLotId === lotId) setError("Source and destination lot IDs must be different.");
        void loadBatchesForLot(Number(lotId));
    }, [form.targetLotId, loadBatchesForLot, updateForm]);

    const handleTargetLotChange = useCallback((lotId: string) => {
        if (form.sourceLotId === lotId) {
            updateForm((current) => ({
                ...current,
                targetLotId: "",
                targetInventoryLotId: "",
                targetBatchNo: ""
            }));
            setError("Source and destination lot IDs must be different.");
            return;
        }
        updateForm((current) => ({
            ...current,
            targetLotId: lotId,
            targetInventoryLotId: "",
            targetBatchNo: ""
        }));
        void loadBatchesForLot(Number(lotId));
    }, [form.sourceLotId, loadBatchesForLot, updateForm]);

    const handleProductChange = useCallback((productId: string) => {
        updateForm((current) => ({
            ...current,
            productId,
            sourceLotId: "",
            sourceInventoryLotId: "",
            sourceBatchNo: "",
            targetLotId: "",
            targetInventoryLotId: "",
            targetBatchNo: ""
        }));
    }, [updateForm]);

    const handleBatchChange = useCallback((side: "source" | "target", inventoryLotId: string) => {
        const lotId = Number(side === "source" ? form.sourceLotId : form.targetLotId);
        const batch = (batchesByLot[lotId] || []).find((row) => String(row.batchId) === inventoryLotId);
        if (!batch) {
            updateForm((current) => ({
                ...current,
                [side === "source" ? "sourceInventoryLotId" : "targetInventoryLotId"]: inventoryLotId,
                [side === "source" ? "sourceBatchNo" : "targetBatchNo"]: ""
            }));
            return;
        }
        updateForm((current) => ({
            ...current,
            [side === "source" ? "sourceInventoryLotId" : "targetInventoryLotId"]: String(batch.batchId),
            [side === "source" ? "sourceBatchNo" : "targetBatchNo"]: batch.batchNumber
        }));
    }, [batchesByLot, form.sourceLotId, form.targetLotId, updateForm]);

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

    const filteredRecords = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return records;
        return records.filter((record) => [
            record.requestNo,
            record.status,
            record.sourceBatchNo,
            record.targetBatchNo,
            record.reason
        ].some((value) => value.toLowerCase().includes(query)));
    }, [records, search]);

    const sourceBatches = useMemo(() => {
        const rows = batchesByLot[Number(form.sourceLotId)] || [];
        return rows.filter((row) => !form.productId || row.productId === Number(form.productId));
    }, [batchesByLot, form.productId, form.sourceLotId]);

    const targetBatches = useMemo(() => {
        const rows = batchesByLot[Number(form.targetLotId)] || [];
        return rows.filter((row) => !form.productId || row.productId === Number(form.productId));
    }, [batchesByLot, form.productId, form.targetLotId]);

    return {
        userBranchId,
        records: filteredRecords,
        totalCount,
        form,
        selectedId,
        selectedRecord,
        preview,
        products,
        lots,
        branches,
        sourceBatches,
        targetBatches,
        draftValidationStatus,
        draftValidationMessage,
        draftValidationIsCurrent,
        isDraftFormComplete: isCompleteDraftForm(form),
        search,
        setSearch,
        setField,
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
        refresh,
        isLoading,
        isLookupLoading,
        isActionLoading,
        error
    };
}
