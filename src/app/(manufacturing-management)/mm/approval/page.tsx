import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function ApprovalPage() {
    redirect("/mm/plant-approval");
}
