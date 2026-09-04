import { redirect } from "next/navigation";
import QAReceivingModule from "@/modules/manufacturing-management/qa-receiving/QAReceivingModule";
import QAReceivingPageShell from "../_page-shell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function positiveInteger(value: string | undefined): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function QAReceivingDetailPage({
    params,
    searchParams
}: {
    params: Promise<{ shipmentId: string }>;
    searchParams?: Promise<{ replacementDispositionId?: string | string[] }>;
}) {
    const { shipmentId } = await params;
    const numericShipmentId = positiveInteger(shipmentId);
    if (!numericShipmentId) redirect("/mm/qa-receiving");

    const query = await searchParams;
    const rawDispositionId = Array.isArray(query?.replacementDispositionId)
        ? query.replacementDispositionId[0]
        : query?.replacementDispositionId;
    const replacementDispositionId = rawDispositionId ? positiveInteger(rawDispositionId) : undefined;

    return (
        <QAReceivingPageShell detailLabel={`PO ${numericShipmentId}`}>
            <QAReceivingModule
                mode="detail"
                shipmentId={numericShipmentId}
                replacementDispositionId={replacementDispositionId ?? undefined}
            />
        </QAReceivingPageShell>
    );
}
