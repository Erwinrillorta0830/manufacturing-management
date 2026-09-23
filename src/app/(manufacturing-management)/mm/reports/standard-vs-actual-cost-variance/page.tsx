import { cookies } from "next/headers";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { NavUser } from "@/components/shared/app-sidebar/nav-user";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator
} from "@/components/ui/breadcrumb";
import StandardVsActualCostVarianceModule from "@/modules/manufacturing-management/standard-vs-actual-cost-variance/StandardVsActualCostVarianceModule";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Standard vs. Actual Cost Variance | Manufacturing",
    description: "Compare standard and actual manufacturing costs by Job Order."
};

function decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
        const payload = token.split(".")[1];
        if (!payload) return null;
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
        return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    } catch {
        return null;
    }
}

export default async function StandardVsActualCostVariancePage() {
    const token = (await cookies()).get("vos_access_token")?.value;
    const payload = token ? decodeJwtPayload(token) : null;
    const first = String(payload?.Firstname || payload?.FirstName || payload?.first_name || "");
    const last = String(payload?.LastName || payload?.last_name || "");
    const email = String(payload?.email || "");

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <header className="relative z-10 flex h-14 shrink-0 items-center justify-between overflow-hidden border-b bg-background shadow-sm sm:h-16">
                <div className="flex h-full min-w-0 items-center gap-2 overflow-hidden px-3 sm:px-4">
                    <SidebarTrigger className="-ml-1 shrink-0" />
                    <Separator orientation="vertical" className="mr-2 hidden h-4 shrink-0 sm:block" />
                    <Breadcrumb>
                        <BreadcrumbList className="min-w-0 overflow-hidden">
                            <BreadcrumbItem className="hidden shrink-0 md:block"><BreadcrumbLink href="#">Manufacturing</BreadcrumbLink></BreadcrumbItem>
                            <BreadcrumbSeparator className="hidden shrink-0 md:block" />
                            <BreadcrumbItem className="min-w-0 overflow-hidden"><BreadcrumbPage className="truncate">Standard vs. Actual Cost Variance</BreadcrumbPage></BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                </div>
                <div className="flex h-full max-w-[48vw] shrink-0 items-center overflow-hidden px-2 sm:px-4 sm:max-w-none">
                    <NavUser user={{ name: [first, last].filter(Boolean).join(" ") || email || "User", email, avatar: "/avatars/shadcn.jpg" }} />
                </div>
            </header>
            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-background p-2 sm:p-4">
                <StandardVsActualCostVarianceModule />
            </main>
        </div>
    );
}
