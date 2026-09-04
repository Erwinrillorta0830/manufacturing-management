"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    fetchWarehouseReceivingOrder,
    fetchWarehouseReceivingQueue,
    postWarehouseReceiving
} from "../services/api";
import type {
    WarehouseReceiptType,
    WarehouseReceivingCommand,
    WarehouseReceivingLine,
    WarehouseReceivingOrder
} from "../types";

function today() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

function randomKey() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `warehouse-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useWarehouseReceiving() {
    const [orders, setOrders] = useState<WarehouseReceivingOrder[]>([]);
    const [selectedOrder, setSelectedOrder] = useState<WarehouseReceivingOrder | null>(null);
    const [quantities, setQuantities] = useState<Record<number, string>>({});
    const [receiptNumber, setReceiptNumber] = useState("");
    const [receiptDate, setReceiptDate] = useState(today);
    const [receiptType, setReceiptType] = useState<WarehouseReceiptType>("full");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState<WarehouseReceivingCommand["action"] | null>(null);
    const queueController = useRef<AbortController | null>(null);
    const detailController = useRef<AbortController | null>(null);

    const loadQueue = useCallback(async (requestedPage = page, requestedSearch = search) => {
        queueController.current?.abort();
        const controller = new AbortController();
        queueController.current = controller;
        setLoading(true);
        setError(null);
        try {
            const result = await fetchWarehouseReceivingQueue({ search: requestedSearch, page: requestedPage }, controller.signal);
            if (controller.signal.aborted) return;
            setOrders(result.items);
            setPage(result.page);
            setTotal(result.total);
        } catch (caught) {
            if (controller.signal.aborted || (caught as Error).name === "AbortError") return;
            const message = caught instanceof Error ? caught.message : "Unable to load Warehouse Receiving.";
            setError(message);
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, [page, search]);

    useEffect(() => {
        const timer = window.setTimeout(() => void loadQueue(1, search), 200);
        return () => window.clearTimeout(timer);
    }, [loadQueue, search]);

    useEffect(() => () => {
        queueController.current?.abort();
        detailController.current?.abort();
    }, []);

    const selectOrder = useCallback(async (order: WarehouseReceivingOrder) => {
        detailController.current?.abort();
        const controller = new AbortController();
        detailController.current = controller;
        setSelectedOrder(null);
        setDetailLoading(true);
        setDetailError(null);
        try {
            const detail = await fetchWarehouseReceivingOrder(order.id, controller.signal);
            if (controller.signal.aborted) return;
            setSelectedOrder(detail);
            setReceiptNumber(detail.draft?.receiptNumber || "");
            setReceiptDate(detail.draft?.receiptDate || today());
            setReceiptType(detail.draft?.receiptType || "full");
            setQuantities(Object.fromEntries(detail.lines.map(line => [line.lineId, String(line.currentReceivedQuantity || "")])));
        } catch (caught) {
            if (controller.signal.aborted || (caught as Error).name === "AbortError") return;
            setDetailError(caught instanceof Error ? caught.message : "Unable to load this purchase order.");
        } finally {
            if (!controller.signal.aborted) setDetailLoading(false);
        }
    }, []);

    const updateQuantity = useCallback((lineId: number, value: string) => {
        setQuantities(previous => ({ ...previous, [lineId]: value }));
    }, []);

    const commandLines = useMemo(() => selectedOrder?.lines.map(line => ({
        lineId: line.lineId,
        productId: line.productId,
        receivedQuantity: Math.max(0, Number(quantities[line.lineId] || 0))
    })) || [], [quantities, selectedOrder]);

    const post = useCallback(async (action: WarehouseReceivingCommand["action"]) => {
        if (!selectedOrder) return;
        setSubmitting(action);
        try {
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
                await loadQueue(1, search);
            } else {
                setSelectedOrder(result);
                setQuantities(Object.fromEntries(result.lines.map(line => [line.lineId, String(line.currentReceivedQuantity || "")])));
                setReceiptNumber(result.draft?.receiptNumber || receiptNumber);
                setReceiptDate(result.draft?.receiptDate || receiptDate);
                setReceiptType(result.draft?.receiptType || receiptType);
                await loadQueue(page, search);
                toast.success(action === "start" ? "Warehouse receiving started." : "Warehouse receiving draft saved.");
            }
        } catch (caught) {
            toast.error(caught instanceof Error ? caught.message : "Warehouse Receiving request failed.");
        } finally {
            setSubmitting(null);
        }
    }, [commandLines, loadQueue, page, receiptDate, receiptNumber, receiptType, search, selectedOrder]);

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
        page,
        total,
        totalPages,
        loading,
        detailLoading,
        error,
        detailError,
        submitting,
        setSearch,
        setPage: (nextPage: number) => {
            setPage(nextPage);
            void loadQueue(nextPage, search);
        },
        selectOrder,
        updateQuantity,
        setReceiptNumber,
        setReceiptDate,
        setReceiptType,
        start: () => post("start"),
        saveDraft: () => post("save_draft"),
        submitToQa: () => post("submit_to_qa"),
        retryQueue: () => loadQueue(page, search),
        clearSelection: () => {
            detailController.current?.abort();
            setSelectedOrder(null);
            setDetailError(null);
        }
    };
}
