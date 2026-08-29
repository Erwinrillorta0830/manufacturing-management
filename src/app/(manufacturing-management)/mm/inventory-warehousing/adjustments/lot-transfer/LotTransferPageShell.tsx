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
import { cookies } from "next/headers";
import { decodeJwtPayload } from "@/lib/auth-utils";
import LotTransferModule from "@/modules/manufacturing-management/lot-transfer/LotTransferModule";
import type { LotTransferMode } from "@/modules/manufacturing-management/lot-transfer/types";

interface LotTransferPageShellProps {
    mode: LotTransferMode;
    title: string;
}

function numberValue(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export default async function LotTransferPageShell({ mode, title }: LotTransferPageShellProps) {
    const cookieStore = await cookies();
    const token = cookieStore.get("vos_access_token")?.value || cookieStore.get("springboot_token")?.value;
    const payload = token ? decodeJwtPayload(token) : null;
    const firstName = String(payload?.FirstName || payload?.firstName || "").trim();
    const lastName = String(payload?.LastName || payload?.lastName || "").trim();
    const email = String(payload?.email || "").trim();
    const headerUser = {
        name: [firstName, lastName].filter(Boolean).join(" ") || email || "System User",
        email: email || "user@vos.com",
        avatar: "/avatars/shadcn.jpg"
    };
    const userBranchId = numberValue(payload?.branch_id ?? payload?.branchId ?? payload?.branch);

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <header className="relative z-10 flex h-14 shrink-0 items-center justify-between overflow-hidden border-b bg-background shadow-sm sm:h-16">
                <div className="flex h-full min-w-0 items-center gap-2 overflow-hidden px-3 sm:px-4">
                    <SidebarTrigger className="-ml-1 shrink-0" />
                    <Separator orientation="vertical" className="mr-2 hidden h-4 shrink-0 sm:block" />
                    <div className="min-w-0 overflow-hidden">
                        <Breadcrumb>
                            <BreadcrumbList className="min-w-0 overflow-hidden">
                                <BreadcrumbItem className="hidden shrink-0 md:block"><BreadcrumbLink href="#">Manufacturing</BreadcrumbLink></BreadcrumbItem>
                                <BreadcrumbSeparator className="hidden shrink-0 md:block" />
                                <BreadcrumbItem className="hidden shrink-0 md:block"><BreadcrumbLink href="#">Inventory &amp; Warehousing</BreadcrumbLink></BreadcrumbItem>
                                <BreadcrumbSeparator className="hidden shrink-0 md:block" />
                                <BreadcrumbItem className="hidden shrink-0 md:block"><BreadcrumbLink href="#">Adjustments</BreadcrumbLink></BreadcrumbItem>
                                <BreadcrumbSeparator className="hidden shrink-0 md:block" />
                                <BreadcrumbItem className="min-w-0 overflow-hidden"><BreadcrumbPage className="max-w-[56vw] truncate sm:max-w-[60vw] md:max-w-none">{title}</BreadcrumbPage></BreadcrumbItem>
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>
                </div>
                <div className="flex h-full max-w-[48vw] shrink-0 items-center overflow-hidden px-2 sm:max-w-none sm:px-4"><NavUser user={headerUser} /></div>
            </header>
            <LotTransferModule mode={mode} userBranchId={userBranchId || null} />
        </div>
    );
}
