import LotTransferPageShell from "../LotTransferPageShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function LotTransferApprovalPage() {
    return <LotTransferPageShell mode="approval" title="Lot Transfer QA Approval" />;
}
