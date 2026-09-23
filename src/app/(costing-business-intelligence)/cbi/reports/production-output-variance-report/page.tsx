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
    BreadcrumbSeparator
} from "@/components/ui/breadcrumb";
import ProductionOutputVarianceReportModule from "@/modules/manufacturing-management/production-output-variance-report/ProductionOutputVarianceReportModule";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Production Output & Variance Report | VOS ERP",
    description: "Compare planned Job Order quantities and completion dates with actual shop-floor yield."
};

function decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
        const parts = token.split(".");
        if (parts.length < 2) return null;
        const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
        return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    } catch {
        return null;
    }
}

function userHeader(token: string | undefined) {
    const payload = token ? decodeJwtPayload(token) : null;
    const pick = (...keys: string[]) => {
        for (const key of keys) {
            const value = payload?.[key];
            if (typeof value === "string" && value.trim()) return value.trim();
        }
        return "";
    };
    const first = pick("Firstname", "FirstName", "firstName", "firstname", "first_name");
    const last = pick("LastName", "Lastname", "lastName", "lastname", "last_name");
    const email = pick("email", "Email");
    return { name: [first, last].filter(Boolean).join(" ") || email || "User", email, avatar: "/avatars/shadcn.jpg" };
}

export default async function ProductionOutputVarianceReportPage() {
    const token = (await cookies()).get("vos_access_token")?.value;
    const headerUser = userHeader(token);

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
                            <BreadcrumbItem className="min-w-0 overflow-hidden"><BreadcrumbPage className="max-w-[56vw] truncate sm:max-w-[60vw] md:max-w-none">Production Output &amp; Variance Report</BreadcrumbPage></BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                </div>
                <div className="flex h-full max-w-[48vw] shrink-0 items-center overflow-hidden px-2 sm:max-w-none sm:px-4"><NavUser user={headerUser} /></div>
            </header>
            <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-background p-2 sm:p-4">
                <ProductionOutputVarianceReportModule />
            </main>
        </div>
    );
}
