import { redirect } from "next/navigation";
import PurchaseAmountPageShell from "../../_page-shell";
import PurchaseAmountPostingModule from "@/modules/manufacturing-management/procurement/components/PurchaseAmountPostingModule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function positiveInteger(value: string): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function PurchaseAmountEditPage({
    params
}: {
    params: Promise<{ purchaseOrderId: string }>;
}) {
    const purchaseOrderId = positiveInteger((await params).purchaseOrderId);
    if (!purchaseOrderId) redirect("/mm/purchase-amount");

    return (
        <PurchaseAmountPageShell detailLabel={`Edit Purchase Amount · PO ${purchaseOrderId}`}>
            <PurchaseAmountPostingModule pageMode="edit" purchaseOrderId={purchaseOrderId} />
        </PurchaseAmountPageShell>
    );
}
