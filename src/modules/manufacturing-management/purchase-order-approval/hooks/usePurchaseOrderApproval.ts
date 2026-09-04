import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { IncomingShipment, ShipmentLineItem, Supplier } from "../../procurement/types";
import type { PurchaseOrderApprovalDetail, PurchaseOrderDecisionStage, PurchaseOrderListMeta, PurchaseOrderListQuery } from "../../purchase-order/types";
import { fetchSuppliers } from "../../procurement/services/procurement-api";
import {
    fetchFinanceApprovalDetail,
    fetchPurchaseOrders,
    submitPurchaseOrderWorkflowAction
} from "../../purchase-order/services/purchase-order-api";

export type PurchaseOrderApprovalMode = "queue" | "detail";

interface UsePurchaseOrderApprovalOptions {
    mode?: PurchaseOrderApprovalMode;
    purchaseOrderId?: number;
}

export function usePurchaseOrderApproval(
    stage: PurchaseOrderDecisionStage,
    { mode = "queue", purchaseOrderId }: UsePurchaseOrderApprovalOptions = {}
) {
    const isDetailMode = mode === "detail";
    const [loading, setLoading] = useState(false);
    const [queueError, setQueueError] = useState<string | null>(null);
    const [detailLoading, setDetailLoading] = useState(isDetailMode);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [shipments, setShipments] = useState<IncomingShipment[]>([]);
    const [pagination, setPagination] = useState<PurchaseOrderListMeta>({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 1
    });
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [selectedShipment, setSelectedShipment] = useState<IncomingShipment | null>(null);
    const [selectedShipmentLines, setSelectedShipmentLines] = useState<ShipmentLineItem[]>([]);
    const [approvalDetail, setApprovalDetail] = useState<PurchaseOrderApprovalDetail | null>(null);
    const listController = useRef<AbortController | null>(null);
    const detailController = useRef<AbortController | null>(null);
    const lastQuery = useRef<PurchaseOrderListQuery>({
        page: 1,
        limit: 10,
        approvalStage: stage,
        status: "For Approval"
    });

    const load = useCallback(async (query: PurchaseOrderListQuery = lastQuery.current) => {
        if (isDetailMode) return;

        const stageQuery = {
            page: query.page ?? 1,
            limit: query.limit ?? 10,
            ...query,
            approvalStage: stage
        };
        lastQuery.current = stageQuery;
        listController.current?.abort();
        const controller = new AbortController();
        listController.current = controller;
        setLoading(true);
        setQueueError(null);
        try {
            const [orders, supplierRows] = await Promise.all([
                fetchPurchaseOrders(stageQuery, controller.signal),
                fetchSuppliers()
            ]);
            if (controller.signal.aborted) return;
            setShipments(orders.data);
            setPagination(orders.meta);
            setSuppliers(supplierRows);
        } catch (error) {
            if ((error as Error).name === "AbortError") return;
            const message = (error as Error).message || "Failed to load approval queue.";
            setQueueError(message);
            toast.error(message);
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, [isDetailMode, stage]);

    const loadDetail = useCallback(async () => {
        if (!isDetailMode || !purchaseOrderId) return;

        detailController.current?.abort();
        const controller = new AbortController();
        detailController.current = controller;
        setDetailLoading(true);
        setDetailError(null);
        setSelectedShipment(null);
        setSelectedShipmentLines([]);
        setApprovalDetail(null);
        try {
            const response = await fetchFinanceApprovalDetail(purchaseOrderId, controller.signal);
            if (controller.signal.aborted) return;
            setSelectedShipment(response.data.shipment);
            setSelectedShipmentLines(response.data.lineItems);
            setApprovalDetail(response.data.approvalDetail);
        } catch (error) {
            if ((error as Error).name === "AbortError") return;
            const message = (error as Error).message || "Failed to load Finance approval details.";
            setDetailError(message);
            toast.error(message);
        } finally {
            if (!controller.signal.aborted) setDetailLoading(false);
        }
    }, [isDetailMode, purchaseOrderId]);

    useEffect(() => {
        if (!isDetailMode) return;
        void loadDetail();
        return () => detailController.current?.abort();
    }, [isDetailMode, loadDetail]);

    useEffect(() => {
        if (isDetailMode) return;
        return () => listController.current?.abort();
    }, [isDetailMode]);

    const refreshAfterAction = async (id: number) => {
        if (isDetailMode && purchaseOrderId === id) {
            await loadDetail();
            return;
        }
        setSelectedShipment(null);
        await load();
    };

    const approve = async (id: number) => {
        if (!approvalDetail) throw new Error("Approval details are not loaded.");
        await submitPurchaseOrderWorkflowAction(id, {
            action: "approve",
            workflowRevision: Number(approvalDetail.order.workflow_revision || 0),
            expectedRuleId: approvalDetail.matchedRule.ruleId,
        }, stage);
        await refreshAfterAction(id);
    };

    const reject = async (id: number, remarks: string) => {
        if (!approvalDetail) throw new Error("Approval details are not loaded.");
        await submitPurchaseOrderWorkflowAction(id, {
            action: "reject",
            workflowRevision: Number(approvalDetail.order.workflow_revision || 0),
            expectedRuleId: approvalDetail.matchedRule.ruleId,
            remarks
        }, stage);
        await refreshAfterAction(id);
    };

    const cancel = async (id: number, remarks: string) => {
        if (!approvalDetail) throw new Error("Approval details are not loaded.");
        await submitPurchaseOrderWorkflowAction(id, {
            action: "cancel",
            workflowRevision: Number(approvalDetail.order.workflow_revision || 0),
            expectedRuleId: approvalDetail.matchedRule.ruleId,
            remarks
        }, stage);
        await refreshAfterAction(id);
    };

    return {
        loading,
        queueError,
        pagination,
        detailLoading,
        detailError,
        retryDetail: loadDetail,
        shipments,
        suppliers,
        selectedShipment,
        setSelectedShipment,
        selectedShipmentLines,
        approvalDetail,
        approve,
        reject,
        cancel,
        load
    };
}
