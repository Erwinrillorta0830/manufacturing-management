import LotTransferPageShell from "../LotTransferPageShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function LotTransferApprovalPage() {
    return <LotTransferPageShell mode="approval" title="Lot Transfer QA Approval" />;
}
export const metadata = {
    title: "Lot Transfer Approval | Manufacturing Management",
    description: "Approve lot transfers within the Manufacturing Management."
};