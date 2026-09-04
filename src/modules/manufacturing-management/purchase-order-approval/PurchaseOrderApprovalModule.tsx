"use client";

import ApprovalModule from "../approval/ApprovalModule";
import type { PurchaseOrderDecisionStage } from "../purchase-order/types";
import type { PurchaseOrderApprovalMode } from "./hooks/usePurchaseOrderApproval";

export default function PurchaseOrderApprovalModule({
    stage,
    mode = "queue",
    purchaseOrderId
}: {
    stage: PurchaseOrderDecisionStage;
    mode?: PurchaseOrderApprovalMode;
    purchaseOrderId?: number;
}) {
    return <ApprovalModule stage={stage} mode={mode} purchaseOrderId={purchaseOrderId} />;
}
