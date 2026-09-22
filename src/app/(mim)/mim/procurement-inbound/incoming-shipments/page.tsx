import PurchaseOrderModule from "@/modules/manufacturing-management/purchase-order/PurchaseOrderModule";
import IncomingShipmentsPageShell from "./_page-shell";
import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function positiveInteger(value: string | string[] | undefined): number | null {
    const rawValue = Array.isArray(value) ? value[0] : value;
    const parsed = Number(rawValue);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function IncomingShipmentsPage({
    searchParams
}: {
    searchParams?: Promise<{ poId?: string | string[] }>;
}) {
    const query = await searchParams;
    const legacyShipmentId = positiveInteger(query?.poId);
    if (legacyShipmentId) redirect(`/mm/incoming-shipments/${legacyShipmentId}`);

    return (
        <IncomingShipmentsPageShell>
            <PurchaseOrderModule mode="queue" />
        </IncomingShipmentsPageShell>
    );
}
