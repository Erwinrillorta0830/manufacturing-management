"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    downloadWarehouseReceivingSummary,
    fetchWarehouseReceivingOrder,
    fetchWarehouseReceivingQueue,
    postWarehouseReceiving
} from "../services/api";
import type {
    WarehouseReceiptType,
    WarehouseReceivingCommand,
    WarehouseReceivingLine,
    WarehouseReceivingOrder,
    WarehouseReceivingQueueResponse
} from "../types";

function today() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

function randomKey() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `warehouse-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface UseWarehouseReceivingOptions {
    mode?: "queue" | "detail";
    purchaseOrderId?: number;
}

export function useWarehouseReceiving({ mode = "queue", purchaseOrderId }: UseWarehouseReceivingOptions = {}) {
    const isDetailMode = mode === "detail";
    const [orders, setOrders] = useState<WarehouseReceivingOrder[]>([]);
    const [selectedOrder, setSelectedOrder] = useState<WarehouseReceivingOrder | null>(null);
    const [quantities, setQuantities] = useState<Record<number, string>>({});
    const [receiptNumber, setReceiptNumber] = useState("");
    const [receiptDate, setReceiptDate] = useState(today);
    const [receiptType, setReceiptType] = useState<WarehouseReceiptType>("full");
    const [search, setSearch] = useState("");
    const [supplierId, setSupplierId] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [status, setStatus] = useState("ALL");
    const [supplierOptions, setSupplierOptions] = useState<WarehouseReceivingQueueResponse["supplierOptions"]>([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState<WarehouseReceivingCommand["action"] | null>(null);
    const [printing, setPrinting] = useState(false);
    const queueController = useRef<AbortController | null>(null);
    const detailController = useRef<AbortController | null>(null);

    const filters = useMemo(() => ({ search, supplierId, dateFrom, dateTo, status }), [dateFrom, dateTo, search, status, supplierId]);

    const loadQueue = useCallback(async (requestedPage: number, requestedFilters: typeof filters) => {
        queueController.current?.abort();
        const controller = new AbortController();
        queueController.current = controller;
        setLoading(true);
        setError(null);
        try {
            const result = await fetchWarehouseReceivingQueue({ ...requestedFilters, page: requestedPage }, controller.signal);
            if (controller.signal.aborted) return;
            setOrders(result.items);
            setPage(result.page);
            setTotal(result.total);
            setSupplierOptions(result.supplierOptions || []);
        } catch (caught) {
            if (controller.signal.aborted || (caught as Error).name === "AbortError") return;
            const message = caught instanceof Error ? caught.message : "Unable to load Warehouse Receiving.";
            setError(message);
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isDetailMode) return;
        const timer = window.setTimeout(() => void loadQueue(1, filters), 200);
        return () => window.clearTimeout(timer);
    }, [filters, isDetailMode, loadQueue]);

    useEffect(() => () => {
        queueController.current?.abort();
        detailController.current?.abort();
    }, []);

    const loadOrder = useCallback(async (orderId: number) => {
        detailController.current?.abort();
        const controller = new AbortController();
        detailController.current = controller;
        setSelectedOrder(null);
        setDetailLoading(true);
        setDetailError(null);
        try {
            const detail = await fetchWarehouseReceivingOrder(orderId, controller.signal);
            if (controller.signal.aborted) return;
            setSelectedOrder(detail);
            const receipt = detail.draft || detail.pendingQaReceipt;
            setReceiptNumber(receipt?.receiptNumber || "");
            setReceiptDate(receipt?.receiptDate || today());
            setReceiptType(receipt?.receiptType || "full");
            setQuantities(Object.fromEntries(detail.lines.map(line => [line.lineId, String(line.currentReceivedQuantity || "")])));
        } catch (caught) {
            if (controller.signal.aborted || (caught as Error).name === "AbortError") return;
            setDetailError(caught instanceof Error ? caught.message : "Unable to load this purchase order.");
        } finally {
            if (!controller.signal.aborted) setDetailLoading(false);
        }
    }, []);

    const selectOrder = useCallback(async (order: WarehouseReceivingOrder) => {
        await loadOrder(order.id);
    }, [loadOrder]);

    useEffect(() => {
        if (!isDetailMode || !purchaseOrderId) return;
        void loadOrder(purchaseOrderId);
        return () => detailController.current?.abort();
    }, [isDetailMode, loadOrder, purchaseOrderId]);

    const updateQuantity = useCallback((lineId: number, value: string) => {
        setQuantities(previous => ({ ...previous, [lineId]: value }));
    }, []);

    const commandLines = useMemo(() => selectedOrder?.lines.map(line => ({
        lineId: line.lineId,
        productId: line.productId,
        receivedQuantity: Math.max(0, Number(quantities[line.lineId] || 0))
    })) || [], [quantities, selectedOrder]);

    const post = useCallback(async (
        action: WarehouseReceivingCommand["action"],
        options: { silent?: boolean } = {}
    ): Promise<WarehouseReceivingOrder | null> => {
        if (!selectedOrder) return null;
        setSubmitting(action);
        try {
            const hasOverReceiving = selectedOrder.lines.some(line => {
                const entered = Math.max(0, Number(quantities[line.lineId] || 0));
                return entered > line.allowableQuantity + 1e-9;
            });
            if (hasOverReceiving && action !== "start" && receiptType !== "partial") {
                toast.warning("Over-receiving quantities will be recorded and flagged for review.");
            }
            const result = await postWarehouseReceiving({
                action,
                purchaseOrderId: selectedOrder.id,
                workflowRevision: selectedOrder.workflowRevision,
                idempotencyKey: action === "start" ? randomKey() : undefined,
                receiptNumber: receiptNumber.trim() || undefined,
                receiptType,
                receiptDate: receiptDate || undefined,
                branchId: selectedOrder.branchId,
                lines: action === "start" ? undefined : commandLines
            });
            if (action === "submit_to_qa") {
                toast.success(`${result.poNumber} was sent to QA Receiving.`);
                setSelectedOrder(null);
                setQuantities({});
                await loadQueue(1, filters);
            } else {
                setSelectedOrder(result);
                setQuantities(Object.fromEntries(result.lines.map(line => [line.lineId, String(line.currentReceivedQuantity || "")])));
                setReceiptNumber(result.draft?.receiptNumber || receiptNumber);
                setReceiptDate(result.draft?.receiptDate || receiptDate);
                setReceiptType(result.draft?.receiptType || receiptType);
                await loadQueue(page, filters);
                if (!options.silent) {
                    toast.success(action === "start" ? "Warehouse receiving started." : "Warehouse receiving draft saved.");
                }
            }
            return result;
        } catch (caught) {
            toast.error(caught instanceof Error ? caught.message : "Warehouse Receiving request failed.");
            return null;
        } finally {
            setSubmitting(null);
        }
    }, [commandLines, filters, loadQueue, page, quantities, receiptDate, receiptNumber, receiptType, selectedOrder]);

    const printSummary = useCallback(async () => {
        if (!selectedOrder?.draft || submitting !== null || printing) return;
        setPrinting(true);
        try {
            const saved = await post("save_draft", { silent: true });
            if (!saved?.draft?.id) return;
            await downloadWarehouseReceivingSummary({
                purchaseOrderId: saved.id,
                receivingHeaderId: saved.draft.id
            });
            toast.success("Warehouse receiving summary downloaded.");
        } catch (caught) {
            toast.error(caught instanceof Error ? caught.message : "Unable to generate the warehouse receiving summary.");
        } finally {
            setPrinting(false);
        }
    }, [post, printing, selectedOrder, submitting]);

    const totalPages = Math.max(1, Math.ceil(total / 25));
    const selectedLines: WarehouseReceivingLine[] = selectedOrder?.lines || [];

    return {
        orders,
        selectedOrder,
        selectedLines,
        quantities,
        receiptNumber,
        receiptDate,
        receiptType,
        search,
        supplierId,
        dateFrom,
        dateTo,
        status,
        supplierOptions,
        page,
        total,
        totalPages,
        loading,
        detailLoading,
        error,
        detailError,
        submitting,
        printing,
        setSearch,
        setSupplierId,
        setDateFrom,
        setDateTo,
        setStatus,
        setPage: (nextPage: number) => {
            setPage(nextPage);
            void loadQueue(nextPage, filters);
        },
        selectOrder,
        updateQuantity,
        setReceiptNumber,
        setReceiptDate,
        setReceiptType,
        start: () => post("start"),
        saveDraft: () => post("save_draft"),
        submitToQa: () => post("submit_to_qa"),
        printSummary,
        retryQueue: () => loadQueue(page, filters),
        clearSelection: () => {
            detailController.current?.abort();
            setSelectedOrder(null);
            setDetailError(null);
        }
    };
}
