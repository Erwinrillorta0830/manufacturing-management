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
import ManufacturingJobOrderInspectionQAModule from "@/modules/manufacturing-management/manufacturing-job-order-inspection-qa/ManufacturingJobOrderInspectionQAModule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "vos_access_token";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
        const parts = token.split(".");
        if (parts.length < 2) return null;

        const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
        return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    } catch {
        return null;
    }
}

function pickString(payload: Record<string, unknown> | null, keys: string[]): string {
    for (const key of keys) {
        const value = payload?.[key];
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
}

function buildHeaderUser(token: string | null) {
    const payload = token ? decodeJwtPayload(token) : null;
    const firstName = pickString(payload, ["Firstname", "FirstName", "firstName", "firstname", "first_name"]);
    const lastName = pickString(payload, ["LastName", "Lastname", "lastName", "lastname", "last_name"]);
    const email = pickString(payload, ["email", "Email"]);
    return {
        name: [firstName, lastName].filter(Boolean).join(" ") || email || "User",
        email: email || "",
        avatar: "/avatars/shadcn.jpg",
    };
}

export default async function ManufacturingJobOrderInspectionQAPage() {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value ?? null;
    const headerUser = buildHeaderUser(token);

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
                                <BreadcrumbItem className="min-w-0 overflow-hidden"><BreadcrumbPage className="max-w-[56vw] truncate sm:max-w-[60vw] md:max-w-none">Job Order Inspection QA</BreadcrumbPage></BreadcrumbItem>
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>
                </div>
                <div className="flex h-full shrink-0 items-center overflow-hidden px-2 sm:px-4"><NavUser user={headerUser} /></div>
            </header>

            <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-background p-2 sm:p-4">
                <ManufacturingJobOrderInspectionQAModule inspectorName={headerUser.name} />
            </main>
        </div>
    );
}
