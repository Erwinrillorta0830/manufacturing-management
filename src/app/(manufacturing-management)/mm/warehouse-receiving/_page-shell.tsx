import type { ReactNode } from "react";
import { cookies } from "next/headers";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NavUser } from "@/components/shared/app-sidebar/nav-user";

const COOKIE_NAME = "vos_access_token";

function headerUser(token: string | undefined) {
    let payload: Record<string, unknown> | null = null;
    try {
        if (token) {
            const encoded = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
            if (encoded) payload = JSON.parse(Buffer.from(encoded + "=".repeat((4 - encoded.length % 4) % 4), "base64").toString("utf8"));
        }
    } catch {
        payload = null;
    }
    const first = String(payload?.firstName || payload?.firstname || payload?.Firstname || "").trim();
    const last = String(payload?.lastName || payload?.lastname || payload?.LastName || "").trim();
    const email = String(payload?.email || payload?.Email || "").trim();
    return { name: [first, last].filter(Boolean).join(" ") || email || "User", email, avatar: "/vos.png" };
}

export default async function WarehouseReceivingPageShell({ children }: { children: ReactNode }) {
    const token = (await cookies()).get(COOKIE_NAME)?.value;
    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <header className="relative z-10 flex h-14 shrink-0 items-center justify-between overflow-hidden border-b bg-background shadow-sm sm:h-16">
                <div className="flex h-full min-w-0 items-center gap-2 overflow-hidden px-3 sm:px-4">
                    <SidebarTrigger className="-ml-1 shrink-0" />
                    <Separator orientation="vertical" className="mr-2 hidden data-[orientation=vertical]:h-4 sm:block" />
                    <Breadcrumb>
                        <BreadcrumbList className="min-w-0 overflow-hidden">
                            <BreadcrumbItem className="hidden shrink-0 md:block"><BreadcrumbLink href="#">Manufacturing</BreadcrumbLink></BreadcrumbItem>
                            <BreadcrumbSeparator className="hidden shrink-0 md:block" />
                            <BreadcrumbItem className="hidden shrink-0 sm:block"><BreadcrumbLink href="/mm/incoming-shipments">Procurement &amp; Inbound</BreadcrumbLink></BreadcrumbItem>
                            <BreadcrumbSeparator className="hidden shrink-0 sm:block" />
                            <BreadcrumbItem className="min-w-0 overflow-hidden"><BreadcrumbPage className="max-w-[56vw] truncate">Warehouse Receiving</BreadcrumbPage></BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                </div>
                <div className="flex h-full max-w-[48vw] shrink-0 items-center overflow-hidden px-2 sm:max-w-none sm:px-4"><NavUser user={headerUser(token)} /></div>
            </header>
            <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-background p-2 sm:p-4">{children}</main>
        </div>
    );
}
