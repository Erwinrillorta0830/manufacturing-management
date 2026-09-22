import PurchaseAmountPostingModule from "@/modules/manufacturing-management/procurement/components/PurchaseAmountPostingModule";
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
