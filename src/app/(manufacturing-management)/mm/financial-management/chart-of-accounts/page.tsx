// src/app/(financial-management)/fm/treasury/disbursement/page.tsx
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NavUser } from "@/components/shared/app-sidebar/nav-user";
import { ChartOfAccountsModule } from "@/modules/manufacturing-management/financial-management/chart-of-accounts";

import { cookies } from "next/headers";

// ✅ Wire the module you asked for
// import { DisbursementModule } from "@/modules/financial-management/treasury/disbursement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "vos_access_token";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
        const parts = token.split(".");
        if (parts.length < 2) return null;

        const p = parts[1];
        const b64 = p.replace(/-/g, "+").replace(/_/g, "/");
        const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);

        const json = Buffer.from(padded, "base64").toString("utf8");
        return JSON.parse(json);
    } catch {
        return null;
    }
}

function pickString(obj: Record<string, unknown> | null | undefined, keys: string[]): string {
    for (const k of keys) {
        const v = obj ? obj[k] : undefined;
        if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
}

function buildHeaderUserFromToken(token: string | null | undefined) {
    const payload = token ? decodeJwtPayload(token) : null;

    const first = pickString(payload, [
        "Firstname",
        "FirstName",
        "firstName",
        "firstname",
        "first_name",
    ]);
    const last = pickString(payload, [
        "LastName",
        "Lastname",
        "lastName",
        "lastname",
        "last_name",
    ]);
    const email = pickString(payload, ["email", "Email"]);

    const name = [first, last].filter(Boolean).join(" ") || email || "User";

    const idStr = pickString(payload, ["sub", "id", "userId", "user_id"]);
    const id = idStr ? Number(idStr) : null;

    return {
        id,
        name,
        email: email || "",
        avatar: "/avatars/shadcn.jpg",
    };
}

export default async function Page() {
    // ✅ Next.js 16: cookies() is async
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value ?? null;

    const headerUser = buildHeaderUserFromToken(token);

    return (
        <div className="flex h-full min-h-0 flex-col">
            {/* ? Topbar is fixed in place because ONLY <main> scrolls */}
            <header className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b shadow-sm bg-background sm:h-16 overflow-hidden">
                <div className="flex h-full items-center gap-2 px-4">
                    <SidebarTrigger className="-ml-1 shrink-0" />
                    <Separator
                        orientation="vertical"
                        className="hidden sm:block mr-2 data-[orientation=vertical]:h-4 shrink-0"
                    />
                    <Breadcrumb>
                        <BreadcrumbList>
                            <BreadcrumbItem className="hidden md:block shrink-0">
                                <BreadcrumbLink href="/mm">Manufacturing</BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator className="hidden md:block shrink-0" />
                            <BreadcrumbItem className="hidden md:block shrink-0">
                                <BreadcrumbLink href="/mm/financial-management">Financial Management</BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator className="hidden md:block shrink-0" />
                            <BreadcrumbItem>
                                <BreadcrumbPage>Chart Of Accounts</BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                </div>

                <div className="flex h-full items-center px-4">
                    <NavUser user={headerUser} />
                </div>
            </header>

            <ScrollArea className="min-h-0 flex-1">
                <div className="p-4">
                    <ChartOfAccountsModule 
                        currentUser={{ id: headerUser.id, name: headerUser.name }}
                    />
                </div>
            </ScrollArea>
        </div>
    );
}
