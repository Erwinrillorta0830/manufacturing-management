import { redirect } from "next/navigation";
import WarehouseReceivingModule from "@/modules/manufacturing-management/warehouse-receiving/WarehouseReceivingModule";
import WarehouseReceivingPageShell from "../_page-shell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function positiveInteger(value: string | undefined): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function WarehouseReceivingDetailPage({
    params
}: {
    params: Promise<{ purchaseOrderId: string }>;
}) {
    const { purchaseOrderId } = await params;
    const numericPurchaseOrderId = positiveInteger(purchaseOrderId);
    if (!numericPurchaseOrderId) redirect("/mm/warehouse-receiving");

    return (
        <WarehouseReceivingPageShell detailLabel={`PO ${numericPurchaseOrderId}`}>
            <WarehouseReceivingModule mode="detail" purchaseOrderId={numericPurchaseOrderId} />
        </WarehouseReceivingPageShell>
    );
}
