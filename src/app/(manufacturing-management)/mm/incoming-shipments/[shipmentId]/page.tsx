import { redirect } from "next/navigation";
import IncomingShipmentsPageShell from "../_page-shell";
import PurchaseOrderModule from "@/modules/manufacturing-management/purchase-order/PurchaseOrderModule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function positiveInteger(value: string): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeReturnTo(value: string | string[] | undefined): string | undefined {
    const candidate = Array.isArray(value) ? value[0] : value;
    if (!candidate || !candidate.startsWith("/mm/incoming-shipments") || candidate.startsWith("//")) return undefined;
    return candidate;
}

export default async function IncomingShipmentDetailPage({
    params,
    searchParams
}: {
    params: Promise<{ shipmentId: string }>;
    searchParams?: Promise<{ returnTo?: string | string[] }>;
}) {
    const numericShipmentId = positiveInteger((await params).shipmentId);
    if (!numericShipmentId) redirect("/mm/incoming-shipments");

    const query = await searchParams;
    const returnTo = safeReturnTo(query?.returnTo);

    return (
        <IncomingShipmentsPageShell detailLabel={`PO ${numericShipmentId}`}>
            <PurchaseOrderModule
                mode="detail"
                shipmentId={numericShipmentId}
                backHref={returnTo || "/mm/incoming-shipments"}
            />
        </IncomingShipmentsPageShell>
    );
}
