import LotTransferPageShell from "../../LotTransferPageShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_HREF = "/mm/inventory-warehousing/adjustments/lot-transfer/lot-transfer-request";

export default function LotTransferRequestCreatePage() {
    return <LotTransferPageShell mode="create" title="New Lot Transfer Request" backHref={LIST_HREF} />;
}
