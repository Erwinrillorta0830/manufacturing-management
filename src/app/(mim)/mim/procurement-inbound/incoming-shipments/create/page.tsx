import PurchaseOrderModule from "@/modules/manufacturing-management/procurement-and-inbound/incoming-shipments/PurchaseOrderModule";
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
