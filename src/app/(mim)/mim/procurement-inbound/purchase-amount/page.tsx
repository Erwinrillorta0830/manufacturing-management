import PurchaseAmountPostingModule from "@/modules/manufacturing-management/procurement-and-inbound/purchase-amount/PurchaseAmountPostingModule";
import PurchaseAmountPageShell from "./_page-shell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function PurchaseAmountPage() {
    return (
        <PurchaseAmountPageShell>
            <PurchaseAmountPostingModule pageMode="landing" />
        </PurchaseAmountPageShell>
    );
}
