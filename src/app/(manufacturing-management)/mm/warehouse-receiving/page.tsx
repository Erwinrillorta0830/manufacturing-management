import WarehouseReceivingModule from "@/modules/manufacturing-management/warehouse-receiving/WarehouseReceivingModule";
import WarehouseReceivingPageShell from "./_page-shell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function WarehouseReceivingPage() {
    return <WarehouseReceivingPageShell><WarehouseReceivingModule /></WarehouseReceivingPageShell>;
}
