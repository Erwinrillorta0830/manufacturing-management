import MmPageShell from "../../_components/mm-page-shell";
import PurchaseOrderApprovalModule from "@/modules/manufacturing-management/purchase-order-approval/PurchaseOrderApprovalModule";
import type { PurchaseOrderDecisionStage } from "@/modules/manufacturing-management/purchase-order/types";
import type { PurchaseOrderApprovalMode } from "@/modules/manufacturing-management/purchase-order-approval/hooks/usePurchaseOrderApproval";

export default async function PurchaseOrderApprovalPage({
    stage,
    mode = "queue",
    purchaseOrderId
}: {
    stage: PurchaseOrderDecisionStage;
    mode?: PurchaseOrderApprovalMode;
    purchaseOrderId?: number;
}) {
    const isDetail = mode === "detail" && purchaseOrderId;
    const label = isDetail ? `${stage} Approval · PO ${purchaseOrderId}` : `${stage} Approval`;

    return (
        <MmPageShell
            crumbs={[
                { label: "Manufacturing", visibility: "md" },
                { label: "Sourcing & Supply Chain", visibility: "md" },
                { label, href: isDetail ? "/mm/finance-approval" : undefined }
            ]}
        >
            <PurchaseOrderApprovalModule stage={stage} mode={mode} purchaseOrderId={purchaseOrderId} />
        </MmPageShell>
    );
}
