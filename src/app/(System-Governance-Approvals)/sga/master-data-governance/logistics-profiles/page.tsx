import React from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { NavUser } from "@/components/shared/app-sidebar/nav-user";
import { cookies } from "next/headers";
import LogisticsProfilesModule from "@/modules/manufacturing-management/logistics-profiles/LogisticsProfilesModule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "vos_access_token";

interface DecodedToken {
    Firstname?: string;
    FirstName?: string;
    first_name?: string;
    LastName?: string;
    last_name?: string;
    email?: string;
    [key: string]: unknown;
}

function decodeJwtPayload(token: string): DecodedToken | null {
    try {
        const parts = token.split(".");
        if (parts.length < 2) return null;
        const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
        return JSON.parse(json);
    } catch {
        return null;
    }
}

export default async function LogisticsProfilesPage() {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value ?? null;
    
    let headerUser = {
        name: "User",
        email: "",
        avatar: "/avatars/shadcn.jpg"
    };

    if (token) {
        const payload = decodeJwtPayload(token);
        const first = payload?.Firstname || payload?.FirstName || payload?.first_name || "";
        const last = payload?.LastName || payload?.last_name || "";
        const email = payload?.email || "";
        headerUser = {
            name: [first, last].filter(Boolean).join(" ") || email || "User",
            email,
            avatar: "/avatars/shadcn.jpg"
        };
    }

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <header className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b shadow-sm bg-background sm:h-16 overflow-hidden">
                <div className="flex h-full min-w-0 items-center gap-2 px-3 sm:px-4 overflow-hidden">
                    <SidebarTrigger className="-ml-1 shrink-0" />
                    <Separator orientation="vertical" className="hidden sm:block mr-2 data-[orientation=vertical]:h-4 shrink-0" />
                    <div className="min-w-0 overflow-hidden">
                        <Breadcrumb>
                            <BreadcrumbList className="min-w-0 overflow-hidden">
                                <BreadcrumbItem className="hidden md:block shrink-0">
                                    <BreadcrumbLink href="#">Manufacturing</BreadcrumbLink>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator className="hidden md:block shrink-0" />
                                <BreadcrumbItem className="hidden md:block shrink-0">
                                    <BreadcrumbLink href="#">Sourcing & Supply Chain</BreadcrumbLink>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator className="hidden md:block shrink-0" />
                                <BreadcrumbItem className="min-w-0 overflow-hidden">
                                    <BreadcrumbPage className="truncate max-w-[56vw]">
                                        Logistics Profiles
                                    </BreadcrumbPage>
                                </BreadcrumbItem>
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>
                </div>
                <div className="flex h-full items-center px-2 sm:px-4 shrink-0 max-w-[48vw] sm:max-w-none overflow-hidden">
                    <NavUser user={headerUser} />
                </div>
            </header>
            
            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-4 bg-background">
                <LogisticsProfilesModule />
            </main>
        </div>
    );
}
