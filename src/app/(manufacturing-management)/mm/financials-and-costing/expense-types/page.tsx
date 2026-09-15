import { cookies } from "next/headers";
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
import { COOKIE_NAME, decodeJwtPayload } from "@/lib/auth-utils";
import ExpenseTypeRegistrationModule from "@/modules/manufacturing-management/expense-types/ExpenseTypeRegistrationModule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface HeaderToken {
    Firstname?: string;
    FirstName?: string;
    first_name?: string;
    LastName?: string;
    last_name?: string;
    email?: string;
    [key: string]: unknown;
}

export default async function ExpenseTypesPage() {
    const token = (await cookies()).get(COOKIE_NAME)?.value;
    const payload = token ? decodeJwtPayload(token) as HeaderToken | null : null;
    const first = payload?.Firstname || payload?.FirstName || payload?.first_name || "";
    const last = payload?.LastName || payload?.last_name || "";
    const email = payload?.email || "";
    const headerUser = {
        name: [first, last].filter(Boolean).join(" ") || email || "User",
        email,
        avatar: "/avatars/shadcn.jpg",
    };

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <header className="relative z-10 flex h-14 shrink-0 items-center justify-between overflow-hidden border-b bg-background shadow-sm sm:h-16">
                <div className="flex h-full min-w-0 items-center gap-2 overflow-hidden px-3 sm:px-4">
                    <SidebarTrigger className="-ml-1 shrink-0" />
                    <Separator orientation="vertical" className="mr-2 hidden shrink-0 data-[orientation=vertical]:h-4 sm:block" />
                    <div className="min-w-0 overflow-hidden">
                        <Breadcrumb>
                            <BreadcrumbList className="min-w-0 overflow-hidden">
                                <BreadcrumbItem className="hidden shrink-0 md:block">
                                    <BreadcrumbLink href="/mm">Manufacturing</BreadcrumbLink>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator className="hidden shrink-0 md:block" />
                                <BreadcrumbItem className="hidden shrink-0 md:block">
                                    <BreadcrumbLink href="/mm/financials-and-costing">Financials &amp; Costing</BreadcrumbLink>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator className="hidden shrink-0 md:block" />
                                <BreadcrumbItem className="min-w-0 overflow-hidden">
                                    <BreadcrumbPage className="truncate">Expense Types</BreadcrumbPage>
                                </BreadcrumbItem>
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>
                </div>
                <div className="flex h-full max-w-[48vw] shrink-0 items-center overflow-hidden px-2 sm:max-w-none sm:px-4">
                    <NavUser user={headerUser} />
                </div>
            </header>

            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-background p-2 sm:p-4">
                <ExpenseTypeRegistrationModule />
            </main>
        </div>
    );
}
