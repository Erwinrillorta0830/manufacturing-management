import { redirect } from "next/navigation";
import PurchaseAmountPageShell from "../_page-shell";
import { PurchaseAmountAuditView } from "@/modules/manufacturing-management/procurement/components/purchase-amount/PostedPOLedgerTable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function positiveInteger(value: string): number | null {
    if (!/^\d+$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function PurchaseAmountDetailPage({
    params,
    searchParams
}: {
    params: Promise<{ purchaseOrderId: string }>;
    searchParams: Promise<{ posted?: string }>;
}) {
    const { purchaseOrderId: rawPurchaseOrderId } = await params;
    const { posted } = await searchParams;
    const purchaseOrderId = positiveInteger(rawPurchaseOrderId);

    if (!purchaseOrderId) {
        redirect("/mm/purchase-amount");
    }

    return (
        <PurchaseAmountPageShell detailLabel={`Posted Purchase Amount · PO ${purchaseOrderId}`}>
            <PurchaseAmountAuditView purchaseOrderId={purchaseOrderId} postingSuccessPurchaseOrder={posted} />
        </PurchaseAmountPageShell>
    );
}
