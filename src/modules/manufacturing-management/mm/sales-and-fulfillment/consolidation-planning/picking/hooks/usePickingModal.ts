"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { InvoiceConsolidation, PickingSavePayload } from "../../types";
import { PickingItem, PickingTotals } from "../types";
import { fetchStockAvailability } from "../../services/invoice-consolidation-api";

export function usePickingModal(
    consolidation: InvoiceConsolidation | null,
    submitting: boolean,
    onSaveQuantities: (payload: PickingSavePayload) => Promise<boolean>,
    onCompletePicking: (batchId: number) => Promise<boolean>,
    onClose: () => void,
) {
    const [localItems, setLocalItems] = useState<PickingItem[]>([]);
    const [hasChanges, setHasChanges] = useState(false);
    const [editingDetailId, setEditingDetailId] = useState<number | null>(null);
    const [editValue, setEditValueState] = useState("");
    const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
    const [showCloseConfirm, setShowCloseConfirm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [stockByProduct, setStockByProduct] = useState<Map<number, number>>(new Map());
    const [stockReady, setStockReady] = useState(false);
    const [stockChecking, setStockChecking] = useState(false);
    const [stockError, setStockError] = useState(false);
    const stockReadyRef = useRef(false);
    const validationRequestRef = useRef(0);
    const interactedRef = useRef(false);
    const previousDiscrepanciesRef = useRef<Set<number>>(new Set());
    const batchId = consolidation?.id;

    const refreshAvailability = useCallback(async (silent = false): Promise<boolean> => {
        if (!batchId) return false;
        const requestId = ++validationRequestRef.current;
        if (!silent || !stockReadyRef.current) setStockChecking(true);

        try {
            const availability = await fetchStockAvailability(batchId);
            if (requestId !== validationRequestRef.current) return false;

            setStockByProduct(new Map(
                availability.map((item) => [item.productId, Number(item.availableQuantity || 0)])
            ));
            stockReadyRef.current = true;
            setStockReady(true);
            setStockError(false);
            return true;
        } catch {
            if (requestId === validationRequestRef.current) {
                setStockError(true);
                if (!stockReadyRef.current) setStockReady(false);
            }
            return false;
        } finally {
            if (requestId === validationRequestRef.current) setStockChecking(false);
        }
    }, [batchId]);

    useEffect(() => {
        if (!consolidation?.details) return;
        const items = consolidation.details.map((detail) => ({
            detailId: detail.id,
            productId: detail.productId,
            productName: detail.productName,
            productCode: detail.productCode,
            orderedQuantity: detail.orderedQuantity,
            pickedQuantity: detail.pickedQuantity,
        }));

        setLocalItems(items);
        setHasChanges(false);
        setEditingDetailId(null);
        setShowCompleteConfirm(false);
        setShowCloseConfirm(false);
        setStockByProduct(new Map());
        stockReadyRef.current = false;
        setStockReady(false);
        setStockError(false);
        interactedRef.current = false;
        previousDiscrepanciesRef.current = new Set();
        void refreshAvailability();
    }, [consolidation?.id, consolidation?.details, refreshAvailability]);

    useEffect(() => {
        if (!batchId) return;
        const refresh = () => void refreshAvailability(true);
        const interval = window.setInterval(refresh, 15_000);
        window.addEventListener("focus", refresh);
        return () => {
            window.clearInterval(interval);
            window.removeEventListener("focus", refresh);
        };
    }, [batchId, refreshAvailability]);

    const effectiveItems = useMemo(() => {
        if (editingDetailId == null) return localItems;
        const parsed = editValue.trim() === "" ? 0 : Number(editValue);
        if (!Number.isInteger(parsed) || parsed < 0) return localItems;

        return localItems.map((item) => item.detailId === editingDetailId
            ? { ...item, pickedQuantity: Math.min(parsed, item.orderedQuantity) }
            : item
        );
    }, [editingDetailId, editValue, localItems]);

    const totals: PickingTotals = useMemo(() => {
        const ordered = localItems.reduce((sum, item) => sum + item.orderedQuantity, 0);
        const picked = localItems.reduce((sum, item) => sum + item.pickedQuantity, 0);
        const short = ordered - picked;
        const pct = ordered > 0 ? (picked / ordered) * 100 : 0;
        return { ordered, picked, short, pct };
    }, [localItems]);

    const shortProducts = useMemo(
        () => localItems.filter((item) => item.pickedQuantity < item.orderedQuantity),
        [localItems]
    );

    const discrepancyProductIds = useMemo(() => {
        const discrepancies = new Set<number>();
        if (!stockReady) return discrepancies;

        const pickedByProduct = new Map<number, number>();
        for (const item of effectiveItems) {
            pickedByProduct.set(
                item.productId,
                (pickedByProduct.get(item.productId) || 0) + item.pickedQuantity
            );
        }

        for (const [productId, pickedQuantity] of pickedByProduct) {
            if (pickedQuantity > (stockByProduct.get(productId) || 0)) {
                discrepancies.add(productId);
            }
        }
        return discrepancies;
    }, [effectiveItems, stockByProduct, stockReady]);

    const validationErrors = useMemo(() => new Set(
        effectiveItems
            .filter((item) => discrepancyProductIds.has(item.productId))
            .map((item) => item.detailId)
    ), [discrepancyProductIds, effectiveItems]);

    useEffect(() => {
        if (!stockReady) return;
        const previous = previousDiscrepanciesRef.current;
        const added = [...discrepancyProductIds].filter((productId) => !previous.has(productId));

        if (interactedRef.current && added.length > 0) {
            const names = added.map((productId) =>
                localItems.find((item) => item.productId === productId)?.productName || `Product #${productId}`
            );
            toast.warning(
                names.length === 1
                    ? `${names[0]} exceeds available stock. Reduce the picked quantity.`
                    : `${names.length} products exceed available stock. Reduce the picked quantities.`
            );
        }
        previousDiscrepanciesRef.current = new Set(discrepancyProductIds);
    }, [discrepancyProductIds, localItems, stockReady]);

    const updateItem = useCallback((detailId: number, newQty: number) => {
        interactedRef.current = true;
        setLocalItems((previous) => previous.map((item) =>
            item.detailId === detailId
                ? { ...item, pickedQuantity: Math.max(0, Math.min(newQty, item.orderedQuantity)) }
                : item
        ));
        setHasChanges(true);
    }, []);

    const setEditValue = useCallback((value: string) => {
        interactedRef.current = true;
        setEditValueState(value);
    }, []);

    const increment = useCallback((detailId: number) => {
        const item = localItems.find((candidate) => candidate.detailId === detailId);
        if (item && item.pickedQuantity < item.orderedQuantity) {
            updateItem(detailId, item.pickedQuantity + 1);
        }
    }, [localItems, updateItem]);

    const decrement = useCallback((detailId: number) => {
        const item = localItems.find((candidate) => candidate.detailId === detailId);
        if (item && item.pickedQuantity > 0) {
            updateItem(detailId, item.pickedQuantity - 1);
        }
    }, [localItems, updateItem]);

    const startEdit = useCallback((item: PickingItem) => {
        setEditingDetailId(item.detailId);
        setEditValueState(String(item.pickedQuantity));
    }, []);

    const commitEdit = useCallback(() => {
        if (editingDetailId == null) return;
        const quantity = Number(editValue);
        if (Number.isInteger(quantity) && quantity >= 0) {
            updateItem(editingDetailId, quantity);
        }
        setEditingDetailId(null);
        setEditValueState("");
    }, [editingDetailId, editValue, updateItem]);

    const cancelEdit = useCallback(() => {
        setEditingDetailId(null);
        setEditValueState("");
    }, []);

    const doSave = useCallback(async (): Promise<boolean> => {
        if (!consolidation) return false;
        setSaving(true);
        try {
            const success = await onSaveQuantities({
                batchId: consolidation.id,
                quantities: localItems.map((item) => ({
                    detailId: item.detailId,
                    pickedQuantity: item.pickedQuantity,
                })),
            });
            if (success) {
                setHasChanges(false);
                void refreshAvailability(true);
            }
            return success;
        } finally {
            setSaving(false);
        }
    }, [consolidation, localItems, onSaveQuantities, refreshAvailability]);

    const handleSave = useCallback(async () => {
        if (!consolidation || !hasChanges || editingDetailId != null) return;
        await doSave();
    }, [consolidation, doSave, editingDetailId, hasChanges]);

    const completionBlocked = !stockReady || stockError || validationErrors.size > 0 || editingDetailId != null;

    const handleComplete = useCallback(async () => {
        if (!consolidation || completionBlocked) return;
        if (shortProducts.length > 0) {
            setShowCompleteConfirm(true);
            return;
        }

        setSaving(true);
        try {
            if (hasChanges && !(await doSave())) return;
            await onCompletePicking(consolidation.id);
            setShowCompleteConfirm(false);
        } finally {
            setSaving(false);
        }
    }, [completionBlocked, consolidation, doSave, hasChanges, onCompletePicking, shortProducts]);

    const handleConfirmShortComplete = useCallback(async () => {
        if (!consolidation || completionBlocked) return;
        setSaving(true);
        try {
            if (hasChanges && !(await doSave())) return;
            await onCompletePicking(consolidation.id);
            setShowCompleteConfirm(false);
        } finally {
            setSaving(false);
        }
    }, [completionBlocked, consolidation, doSave, hasChanges, onCompletePicking]);

    const handleClose = useCallback(() => {
        if (hasChanges) setShowCloseConfirm(true);
        else onClose();
    }, [hasChanges, onClose]);

    return {
        localItems,
        hasChanges,
        editingDetailId,
        editValue,
        showCompleteConfirm,
        showCloseConfirm,
        saving,
        totals,
        shortProducts,
        validationErrors,
        stockReady,
        stockChecking,
        stockError,
        completionBlocked,
        setEditValue,
        setEditingDetailId,
        setShowCompleteConfirm,
        setShowCloseConfirm,
        increment,
        decrement,
        startEdit,
        commitEdit,
        cancelEdit,
        handleSave,
        handleComplete,
        handleConfirmShortComplete,
        handleClose,
    };
}
