import LotTransferPageShell from "../LotTransferPageShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function LotTransferRequestPage() {
    return <LotTransferPageShell mode="request" title="Lot Transfer Request" />;
}
