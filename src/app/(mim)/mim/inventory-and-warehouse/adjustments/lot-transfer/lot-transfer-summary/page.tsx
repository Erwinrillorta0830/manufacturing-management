import LotTransferPageShell from "../LotTransferPageShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function LotTransferSummaryPage() {
    return <LotTransferPageShell mode="summary" title="Master LOT Transfer Summary" />;
}
