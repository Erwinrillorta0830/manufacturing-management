import { redirect } from "next/navigation";
import LotTransferPageShell from "../../../LotTransferPageShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_HREF = "/mm/inventory-warehousing/adjustments/lot-transfer/lot-transfer-request";

function positiveInteger(value: string): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function LotTransferRequestEditPage({
    params
}: {
    params: Promise<{ transferId: string }>;
}) {
    const numericTransferId = positiveInteger((await params).transferId);
    if (!numericTransferId) redirect(LIST_HREF);

    return (
        <LotTransferPageShell
            mode="edit"
            title="Edit Lot Transfer Request"
            transferId={numericTransferId}
            backHref={LIST_HREF}
        />
    );
}
