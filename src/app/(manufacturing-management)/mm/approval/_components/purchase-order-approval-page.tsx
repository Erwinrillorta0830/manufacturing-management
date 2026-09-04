import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NavUser } from "@/components/shared/app-sidebar/nav-user";
import { cookies } from "next/headers";
import PurchaseOrderApprovalModule from "@/modules/manufacturing-management/purchase-order-approval/PurchaseOrderApprovalModule";
import type { PurchaseOrderDecisionStage } from "@/modules/manufacturing-management/purchase-order/types";
import type { PurchaseOrderApprovalMode } from "@/modules/manufacturing-management/purchase-order-approval/hooks/usePurchaseOrderApproval";

const COOKIE_NAME = "vos_access_token";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
        const parts = token.split(".");
        if (parts.length < 2) return null;
        const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
        return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    } catch {
        return null;
    }
}

function pickString(obj: Record<string, unknown> | null, keys: string[]) {
    for (const key of keys) {
        const value = obj?.[key];
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
}

function buildHeaderUserFromToken(token: string | null) {
    const payload = token ? decodeJwtPayload(token) : null;
    const first = pickString(payload, ["Firstname", "FirstName", "firstName", "firstname", "first_name"]);
    const last = pickString(payload, ["LastName", "Lastname", "lastName", "lastname", "last_name"]);
    const email = pickString(payload, ["email", "Email"]);
    return {
        name: [first, last].filter(Boolean).join(" ") || email || "User",
        email,
        avatar: "/avatars/shadcn.jpg"
    };
}

export default async function PurchaseOrderApprovalPage({
    stage,
    mode = "queue",
    purchaseOrderId
}: {
    stage: PurchaseOrderDecisionStage;
    mode?: PurchaseOrderApprovalMode;
    purchaseOrderId?: number;
}) {
    const token = (await cookies()).get(COOKIE_NAME)?.value ?? null;
    const headerUser = buildHeaderUserFromToken(token);
    const isDetail = mode === "detail" && purchaseOrderId;
    const label = isDetail ? `${stage} Approval · PO ${purchaseOrderId}` : `${stage} Approval`;

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <header className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b bg-background shadow-sm sm:h-16">
                <div className="flex h-full min-w-0 items-center gap-2 overflow-hidden px-3 sm:px-4">
                    <SidebarTrigger className="-ml-1 shrink-0" />
                    <Separator orientation="vertical" className="mr-2 hidden data-[orientation=vertical]:h-4 sm:block" />
                    <div className="min-w-0 overflow-hidden">
                        <Breadcrumb>
                            <BreadcrumbList className="min-w-0 overflow-hidden">
                                <BreadcrumbItem className="hidden shrink-0 md:block"><BreadcrumbLink href="#">Manufacturing</BreadcrumbLink></BreadcrumbItem>
                                <BreadcrumbSeparator className="hidden shrink-0 md:block" />
                                <BreadcrumbItem className="hidden shrink-0 md:block"><BreadcrumbLink href="#">Sourcing &amp; Supply Chain</BreadcrumbLink></BreadcrumbItem>
                                <BreadcrumbSeparator className="hidden shrink-0 md:block" />
                                <BreadcrumbItem className="min-w-0 overflow-hidden">
                                    {isDetail ? (
                                        <BreadcrumbLink href="/mm/finance-approval" className="max-w-[56vw] truncate">{label}</BreadcrumbLink>
                                    ) : (
                                        <BreadcrumbPage className="max-w-[56vw] truncate">{label}</BreadcrumbPage>
                                    )}
                                </BreadcrumbItem>
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>
                </div>
                <div className="flex h-full max-w-[48vw] shrink-0 items-center overflow-hidden px-2 sm:max-w-none sm:px-4"><NavUser user={headerUser} /></div>
            </header>
            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-background p-2 sm:p-4">
                <PurchaseOrderApprovalModule stage={stage} mode={mode} purchaseOrderId={purchaseOrderId} />
            </main>
        </div>
    );
}
