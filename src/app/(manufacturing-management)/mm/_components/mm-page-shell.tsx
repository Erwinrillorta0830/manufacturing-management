import { Fragment, type ReactNode } from "react";
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

export type MmPageShellCrumb = {
    label: string;
    href?: string;
    visibility?: "always" | "sm" | "md";
    pageClassName?: string;
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

function pickString(obj: Record<string, unknown> | null | undefined, keys: string[]): string {
    for (const key of keys) {
        const value = obj?.[key];
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
}

function buildHeaderUserFromToken(token: string | null | undefined) {
    const payload = token ? decodeJwtPayload(token) : null;
    const first = pickString(payload, ["Firstname", "FirstName", "firstName", "firstname", "first_name"]);
    const last = pickString(payload, ["LastName", "Lastname", "lastName", "lastname", "last_name"]);
    const email = pickString(payload, ["email", "Email"]);
    return {
        name: [first, last].filter(Boolean).join(" ") || email || "User",
        email: email || "",
        avatar: "/avatars/shadcn.jpg"
    };
}

function crumbVisibilityClass(crumb: MmPageShellCrumb, isLast: boolean): string {
    if (crumb.visibility === "sm") return "hidden shrink-0 sm:block";
    if (crumb.visibility === "md") return "hidden shrink-0 md:block";
    if (isLast) return "min-w-0 overflow-hidden";
    return "shrink-0";
}

export default async function MmPageShell({
    crumbs,
    children
}: {
    crumbs: MmPageShellCrumb[];
    children: ReactNode;
}) {
    const token = (await cookies()).get(COOKIE_NAME)?.value ?? null;
    const headerUser = buildHeaderUserFromToken(token);
    const lastIndex = crumbs.length - 1;

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <header className="relative z-10 flex h-14 shrink-0 items-center justify-between overflow-hidden border-b bg-background shadow-sm sm:h-16">
                <div className="flex h-full min-w-0 items-center gap-2 overflow-hidden px-3 sm:px-4">
                    <SidebarTrigger className="-ml-1 shrink-0" />
                    <Separator orientation="vertical" className="mr-2 hidden data-[orientation=vertical]:h-4 sm:block" />
                    <div className="min-w-0 overflow-hidden">
                        <Breadcrumb>
                            <BreadcrumbList className="min-w-0 overflow-hidden">
                                {crumbs.map((crumb, index) => {
                                    const isLast = index === lastIndex;
                                    const visibilityClass = crumbVisibilityClass(crumb, isLast);
                                    return (
                                        <Fragment key={`${crumb.label}-${index}`}>
                                            {index > 0 && (
                                                <BreadcrumbSeparator className={crumbVisibilityClass(crumbs[index - 1], false)} />
                                            )}
                                            <BreadcrumbItem className={visibilityClass}>
                                                {isLast ? (
                                                    crumb.href ? (
                                                        <BreadcrumbLink href={crumb.href} className="max-w-[56vw] truncate">{crumb.label}</BreadcrumbLink>
                                                    ) : (
                                                        <BreadcrumbPage className={crumb.pageClassName ?? "max-w-[56vw] truncate"}>{crumb.label}</BreadcrumbPage>
                                                    )
                                                ) : (
                                                    <BreadcrumbLink href={crumb.href ?? "#"}>{crumb.label}</BreadcrumbLink>
                                                )}
                                            </BreadcrumbItem>
                                        </Fragment>
                                    );
                                })}
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>
                </div>
                <div className="flex h-full max-w-[48vw] shrink-0 items-center overflow-hidden px-2 sm:max-w-none sm:px-4">
                    <NavUser user={headerUser} />
                </div>
            </header>
            <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-background p-2 sm:p-4">
                {children}
            </main>
        </div>
    );
}
