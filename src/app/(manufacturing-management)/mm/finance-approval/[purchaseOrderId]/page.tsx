import { redirect } from "next/navigation";
import PurchaseOrderApprovalPage from "../../approval/_components/purchase-order-approval-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function positiveInteger(value: string): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function FinanceApprovalDetailPage({
    params
}: {
    params: Promise<{ purchaseOrderId: string }>;
}) {
    const numericPurchaseOrderId = positiveInteger((await params).purchaseOrderId);
    if (!numericPurchaseOrderId) redirect("/mm/finance-approval");

    return (
        <PurchaseOrderApprovalPage
            stage="Finance"
            mode="detail"
            purchaseOrderId={numericPurchaseOrderId}
        />
    );
}
