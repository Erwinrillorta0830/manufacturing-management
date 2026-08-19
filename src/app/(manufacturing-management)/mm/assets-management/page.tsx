import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AssetsManagementRedirectPage() {
    redirect("/mm/assets");
}

