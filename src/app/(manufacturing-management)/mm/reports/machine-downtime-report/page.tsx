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
import MachineDowntimeReportModule from "@/modules/manufacturing-management/machine-downtime-report/MachineDowntimeReportModule";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Machine Downtime Report | VOS ERP",
    description: "Production machine maintenance status and halted Job Order history."
};

function decodeJwtPayload(token: string | null): Record<string, unknown> | null {
    if (!token) return null;
    try {
        const parts = token.split(".");
        if (parts.length < 2) return null;
        const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = encoded + "=".repeat((4 - encoded.length % 4) % 4);
        return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
    } catch {
        return null;
    }
}

function userHeader(token: string | null) {
    const payload = decodeJwtPayload(token);
    const first = String(payload?.Firstname ?? payload?.firstName ?? payload?.first_name ?? "").trim();
    const last = String(payload?.Lastname ?? payload?.lastName ?? payload?.last_name ?? "").trim();
    const email = String(payload?.email ?? "").trim();
    return {
        name: [first, last].filter(Boolean).join(" ") || email || "User",
        email,
        avatar: "/avatars/shadcn.jpg"
    };
}

export default async function MachineDowntimeReportPage() {
    const token = (await cookies()).get("vos_access_token")?.value ?? null;
    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <header className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b bg-background shadow-sm sm:h-16">
                <div className="flex min-w-0 items-center gap-2 px-3 sm:px-4">
                    <SidebarTrigger className="-ml-1 shrink-0" />
                    <Separator orientation="vertical" className="mr-2 hidden h-4 sm:block" />
                    <Breadcrumb>
                        <BreadcrumbList className="min-w-0">
                            <BreadcrumbItem className="hidden md:block"><BreadcrumbLink href="#">Manufacturing</BreadcrumbLink></BreadcrumbItem>
                            <BreadcrumbSeparator className="hidden md:block" />
                            <BreadcrumbItem><BreadcrumbLink href="#">Reports</BreadcrumbLink></BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem><BreadcrumbPage>Machine Downtime</BreadcrumbPage></BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                </div>
                <div className="max-w-[48vw] shrink-0 overflow-hidden px-2 sm:px-4">
                    <NavUser user={userHeader(token)} />
                </div>
            </header>
            <main className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto bg-background p-4 sm:p-6">
                <MachineDowntimeReportModule />
            </main>
        </div>
    );
}
