"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    approveLotTransfer,
    createLotTransfer,
    deleteLotTransfer,
    fetchBranches,
    fetchBatches,
    fetchLotTransfers,
    fetchLots,
    fetchProducts,
    previewLotTransfer,
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

    const refresh = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetchLotTransfers({
                status: mode === "request" ? "Draft" : mode === "approval" ? "For Approval" : undefined,
                branchId: userBranchId || undefined
            });
            const nextRecords = mode === "summary"
                ? response.data.filter((record) => record.status === "Approved" || record.status === "Rejected")
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
        setForm((current) => ({ ...current, [field]: value }));
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedId(null);
        setSelectedRecord(null);
        setPreview(null);
        setForm(initialForm(userBranchId));
    }, [userBranchId]);

    const selectRecord = useCallback(async (record: LotTransfer) => {
        setSelectedId(record.id);
        setSelectedRecord(record);
        setForm(formFromRecord(record, userBranchId));
        setError(null);
        if (record.sourceLotId > 0) void loadBatchesForLot(record.sourceLotId);
        if (record.targetLotId > 0 && record.targetLotId !== record.sourceLotId) void loadBatchesForLot(record.targetLotId);
        if (mode === "approval") {
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
    }, [loadBatchesForLot, mode, userBranchId]);

    const handleSourceLotChange = useCallback((lotId: string) => {
        setForm((current) => ({
            ...current,
            sourceLotId: lotId,
            sourceInventoryLotId: "",
            sourceBatchNo: ""
        }));
        void loadBatchesForLot(Number(lotId));
    }, [loadBatchesForLot]);

    const handleTargetLotChange = useCallback((lotId: string) => {
        setForm((current) => ({
            ...current,
            targetLotId: lotId,
            targetInventoryLotId: "",
            targetBatchNo: ""
        }));
        void loadBatchesForLot(Number(lotId));
    }, [loadBatchesForLot]);

    const handleProductChange = useCallback((productId: string) => {
        setForm((current) => ({
            ...current,
            productId,
            sourceLotId: "",
            sourceInventoryLotId: "",
            sourceBatchNo: "",
            targetLotId: "",
            targetInventoryLotId: "",
            targetBatchNo: ""
        }));
    }, []);

    const handleBatchChange = useCallback((side: "source" | "target", inventoryLotId: string) => {
        const lotId = Number(side === "source" ? form.sourceLotId : form.targetLotId);
        const batch = (batchesByLot[lotId] || []).find((row) => String(row.batchId) === inventoryLotId);
        if (!batch) {
            setForm((current) => ({
                ...current,
                [side === "source" ? "sourceInventoryLotId" : "targetInventoryLotId"]: inventoryLotId,
                [side === "source" ? "sourceBatchNo" : "targetBatchNo"]: ""
            }));
            return;
        }
        setForm((current) => ({
            ...current,
            [side === "source" ? "sourceInventoryLotId" : "targetInventoryLotId"]: String(batch.batchId),
            [side === "source" ? "sourceBatchNo" : "targetBatchNo"]: batch.batchNumber
        }));
    }, [batchesByLot, form.sourceLotId, form.targetLotId]);

    const saveDraft = useCallback(async () => {
        setIsActionLoading(true);
        try {
            const saved = selectedId
                ? await updateLotTransfer(selectedId, form)
                : await createLotTransfer(form);
            setSelectedId(saved.id);
            setSelectedRecord(saved);
            setForm(formFromRecord(saved, userBranchId));
            await refresh();
            setError(null);
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
    }, [clearSelection, refresh, selectedId]);

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
        reject,
        refresh,
        isLoading,
        isLookupLoading,
        isActionLoading,
        error
    };
}
