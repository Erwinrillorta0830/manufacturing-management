import { redirect } from "next/navigation";
import QAReceivingModule from "@/modules/manufacturing-management/qa-receiving/QAReceivingModule";
import QAReceivingPageShell from "./_page-shell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function positiveInteger(value: string | string[] | undefined): number | null {
    const rawValue = Array.isArray(value) ? value[0] : value;
    const parsed = Number(rawValue);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function QAReceivingPage({
    searchParams
}: {
    searchParams?: Promise<{ poId?: string | string[] }>;
}) {
    const query = await searchParams;
    const legacyShipmentId = positiveInteger(query?.poId);

    if (legacyShipmentId) redirect(`/mm/qa-receiving/${legacyShipmentId}`);

    return (
        <QAReceivingPageShell>
            <QAReceivingModule mode="queue" />
        </QAReceivingPageShell>
    );
}
