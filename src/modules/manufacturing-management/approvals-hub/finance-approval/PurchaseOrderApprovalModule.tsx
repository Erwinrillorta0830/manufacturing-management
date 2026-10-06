"use client";

import ApprovalModule from "@/modules/manufacturing-management/approval/ApprovalModule";
import type { PurchaseOrderDecisionStage } from "@/modules/manufacturing-management/procurement-and-inbound/incoming-shipments/types";
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
