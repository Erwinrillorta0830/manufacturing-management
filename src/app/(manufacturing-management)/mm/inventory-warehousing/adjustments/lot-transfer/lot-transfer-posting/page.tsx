import LotTransferPageShell from "../LotTransferPageShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function LotTransferPostingPage() {
    return <LotTransferPageShell mode="posting" title="Lot Transfer Posting" />;
}
