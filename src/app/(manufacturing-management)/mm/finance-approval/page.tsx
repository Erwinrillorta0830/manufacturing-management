import PurchaseOrderApprovalPage from "../approval/_components/purchase-order-approval-page";
import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function positiveInteger(value: string | string[] | undefined): number | null {
    const rawValue = Array.isArray(value) ? value[0] : value;
    const parsed = Number(rawValue);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function FinanceApprovalPage({
    searchParams
}: {
    searchParams?: Promise<{ poId?: string | string[] }>;
}) {
    const query = await searchParams;
    const legacyPurchaseOrderId = positiveInteger(query?.poId);
    if (legacyPurchaseOrderId) redirect(`/mm/finance-approval/${legacyPurchaseOrderId}`);

    return <PurchaseOrderApprovalPage stage="Finance" mode="queue" />;
}
