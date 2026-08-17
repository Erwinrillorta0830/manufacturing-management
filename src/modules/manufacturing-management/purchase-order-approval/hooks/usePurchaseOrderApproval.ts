import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { IncomingShipment, ShipmentLineItem, Supplier } from "../../procurement/types";
import type { PurchaseOrderApprovalDetail, PurchaseOrderDecisionStage, PurchaseOrderListQuery } from "../../purchase-order/types";
import { fetchSuppliers } from "../../procurement/services/procurement-api";
import {
    fetchPurchaseOrderLines,
    fetchPurchaseOrders,
    fetchPurchaseOrderApproval,
    submitPurchaseOrderWorkflowAction
} from "../../purchase-order/services/purchase-order-api";

export function usePurchaseOrderApproval(stage: PurchaseOrderDecisionStage) {
    const [loading, setLoading] = useState(false);
    const [shipments, setShipments] = useState<IncomingShipment[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [selectedShipment, setSelectedShipment] = useState<IncomingShipment | null>(null);
    const [selectedShipmentLines, setSelectedShipmentLines] = useState<ShipmentLineItem[]>([]);
    const [approvalDetail, setApprovalDetail] = useState<PurchaseOrderApprovalDetail | null>(null);
    const listController = useRef<AbortController | null>(null);
    const detailController = useRef<AbortController | null>(null);
    const lastQuery = useRef<PurchaseOrderListQuery>({ limit: 100, approvalStage: stage });

    const load = useCallback(async (query: PurchaseOrderListQuery = lastQuery.current) => {
        const stageQuery = { ...query, approvalStage: stage };
        lastQuery.current = stageQuery;
        listController.current?.abort();
        const controller = new AbortController();
        listController.current = controller;
        setLoading(true);
        try {
            const [orders, supplierRows] = await Promise.all([
                fetchPurchaseOrders(stageQuery, controller.signal),
                fetchSuppliers()
            ]);
            setShipments(orders.data);
            setSuppliers(supplierRows);
        } catch (error) {
            if ((error as Error).name !== "AbortError") toast.error((error as Error).message || "Failed to load approval queue.");
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, [stage]);

    useEffect(() => {
        void load();
        return () => {
            listController.current?.abort();
            detailController.current?.abort();
        };
    }, [load]);

    useEffect(() => {
        detailController.current?.abort();
        if (!selectedShipment) {
            setSelectedShipmentLines([]);
            setApprovalDetail(null);
            return;
        }
        setSelectedShipmentLines([]);
        setApprovalDetail(null);
        const controller = new AbortController();
        detailController.current = controller;
        Promise.all([
            fetchPurchaseOrderLines(selectedShipment.shipment_id, controller.signal),
            fetchPurchaseOrderApproval(selectedShipment.shipment_id, stage, controller.signal)
        ])
            .then(([lines, detail]) => {
                setSelectedShipmentLines(lines);
                setApprovalDetail(detail);
            })
            .catch(error => {
                if (error.name !== "AbortError") toast.error(error.message || "Failed to load purchase-order details.");
            });
        return () => controller.abort();
    }, [selectedShipment, stage]);

    const approve = async (id: number) => {
        if (!approvalDetail) throw new Error("Approval details are not loaded.");
        await submitPurchaseOrderWorkflowAction(id, {
            action: "approve",
            workflowRevision: Number(approvalDetail.order.workflow_revision || 0),
            expectedRuleId: approvalDetail.matchedRule.ruleId,
        }, stage);
        setSelectedShipment(null);
        await load();
    };

    const reject = async (id: number, remarks: string) => {
        if (!approvalDetail) throw new Error("Approval details are not loaded.");
        await submitPurchaseOrderWorkflowAction(id, {
            action: "reject",
            workflowRevision: Number(approvalDetail.order.workflow_revision || 0),
            expectedRuleId: approvalDetail.matchedRule.ruleId,
            remarks
        }, stage);
        setSelectedShipment(null);
        await load();
    };

    const cancel = async (id: number, remarks: string) => {
        if (!approvalDetail) throw new Error("Approval details are not loaded.");
        await submitPurchaseOrderWorkflowAction(id, {
            action: "cancel",
            workflowRevision: Number(approvalDetail.order.workflow_revision || 0),
            expectedRuleId: approvalDetail.matchedRule.ruleId,
            remarks
        }, stage);
        setSelectedShipment(null);
        await load();
    };

    return {
        loading, shipments, suppliers, selectedShipment, setSelectedShipment, selectedShipmentLines, approvalDetail, approve, reject, cancel, load
    };
}
