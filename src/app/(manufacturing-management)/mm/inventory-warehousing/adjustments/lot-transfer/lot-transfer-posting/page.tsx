import LotTransferPageShell from "../LotTransferPageShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function LotTransferPostingPage() {
    return <LotTransferPageShell mode="posting" title="Lot Transfer Posting" />;
}
export const metadata = {
    title: "Lot Transfer Posting | Manufacturing Management",
    description: "Post lot transfers within the Manufacturing Management."
};