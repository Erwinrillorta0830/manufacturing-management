import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Page() {
    redirect("/mm/financial-management/cash-issuance/voucher-preparation");
}
