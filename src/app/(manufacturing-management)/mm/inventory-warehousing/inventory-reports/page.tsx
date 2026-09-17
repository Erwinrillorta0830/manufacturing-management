import React from "react";
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
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import InventoryReportsModule from "@/modules/manufacturing-management/mm/inventory-warehousing/inventory-reports/InventoryReportsModule";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Inventory Maintaining Quantity Report | VOS ERP",
    description: "Monitor safety stock and replenishments when on-hand is below or equal to maintaining quantity."
};

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

    return {
        name,
        email: email || "",
        avatar: "/avatars/shadcn.jpg",
    };
}

export default async function InventoryReportsPage() {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value ?? null;
    const headerUser = buildHeaderUserFromToken(token);

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {/* Topbar */}
            <header className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b shadow-xs bg-background sm:h-16 overflow-hidden">
                <div className="flex h-full min-w-0 items-center gap-2 px-3 sm:px-4 overflow-hidden">
                    <SidebarTrigger className="-ml-1 shrink-0" />
                    <Separator
                        orientation="vertical"
                        className="hidden sm:block mr-2 data-[orientation=vertical]:h-4 shrink-0"
                    />
                    <div className="min-w-0 overflow-hidden">
                        <Breadcrumb>
                            <BreadcrumbList className="min-w-0 overflow-hidden">
                                <BreadcrumbItem className="hidden md:block shrink-0">
                                    <BreadcrumbLink href="#">Manufacturing</BreadcrumbLink>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator className="hidden md:block shrink-0" />
                                <BreadcrumbItem className="hidden md:block shrink-0">
                                    <BreadcrumbLink href="#">Inventory &amp; Warehousing</BreadcrumbLink>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator className="hidden md:block shrink-0" />
                                <BreadcrumbItem className="shrink-0">
                                    <BreadcrumbPage className="font-semibold text-foreground">
                                        Inventory Reports
                                    </BreadcrumbPage>
                                </BreadcrumbItem>
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>
                </div>

                <div className="flex items-center gap-2 px-3 sm:px-4 shrink-0">
                    <NavUser user={headerUser} />
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto">
                <InventoryReportsModule />
            </main>
        </div>
    );
}
