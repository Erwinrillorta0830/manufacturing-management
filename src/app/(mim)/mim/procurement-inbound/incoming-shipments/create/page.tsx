import PurchaseOrderModule from "@/modules/manufacturing-management/purchase-order/PurchaseOrderModule";
import IncomingShipmentsPageShell from "../_page-shell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function IncomingShipmentsCreatePage() {
    return (
        <IncomingShipmentsPageShell detailLabel="Create Purchase Order">
            <PurchaseOrderModule mode="create" backHref="/mm/incoming-shipments" />
        </IncomingShipmentsPageShell>
    );
}
