// src/app/(financial-management)/fm/accounting/discount-management/customer-discounting/page.tsx
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
import CustomerDiscountingModule from "@/modules/manufacturing-management/financial-management/discount-management/customer-discounting";
import { getCustomerDiscountingModuleData } from "@/app/api/manufacturing/financial-management/discount-management/customer-discounting/_module-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "vos_access_token";
const PAGE_SIZE = 10;
type ViewMode = "table" | "card";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Decodes the VOS JWT payload so the page can build the shared header user model.
 */
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

/**
 * Picks the first non-empty string from a set of possible JWT claim names.
 */
function pickString(source: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/**
 * Picks a numeric user id from the token payload when one is available.
 */
function pickNumber(source: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = source?.[key];
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Converts the auth cookie into the user object expected by the app sidebar header.
 */
function buildHeaderUserFromToken(token: string | null | undefined) {
  const payload = token ? decodeJwtPayload(token) : null;
  const first = pickString(payload, ["Firstname", "FirstName", "firstName", "firstname", "first_name"]);
  const last = pickString(payload, ["LastName", "Lastname", "lastName", "lastname", "last_name"]);
  const email = pickString(payload, ["email", "Email"]);
  const id = pickNumber(payload, ["id", "user_id", "userId", "sub"]);
  const name = [first, last].filter(Boolean).join(" ") || email || "User";

  return {
    id,
    name,
    email: email || "",
    avatar: "/avatars/shadcn.jpg",
  };
}

/**
 * Reads Next.js search params that may arrive as a scalar or array value.
 */
function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Normalizes the customer list page query parameter for server-side pagination.
 */
function parsePage(value: string | string[] | undefined) {
  const parsed = Number(firstSearchParam(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

/**
 * Normalizes optional relation-id query parameters.
 */
function parseOptionalId(value: string | string[] | undefined) {
  const parsed = Number(firstSearchParam(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

/**
 * Restricts the persisted view query parameter to the supported module layouts.
 */
function parseViewMode(value: string | string[] | undefined): ViewMode | undefined {
  const viewMode = firstSearchParam(value);
  return viewMode === "table" || viewMode === "card" ? viewMode : undefined;
}

/**
 * Renders the customer discounting page shell and server-loads the current customer page.
 */
export default async function Page({ searchParams }: PageProps) {
  const cookieStore = await cookies();
  const resolvedSearchParams = await searchParams;
  const token = cookieStore.get(COOKIE_NAME)?.value ?? null;
  const headerUser = buildHeaderUserFromToken(token);
  const page = parsePage(resolvedSearchParams?.page);
  const search = firstSearchParam(resolvedSearchParams?.q)?.trim() ?? "";
  const storeTypeId = parseOptionalId(resolvedSearchParams?.storeTypeId ?? resolvedSearchParams?.store_type_id);
  const viewMode = parseViewMode(resolvedSearchParams?.view);
  const moduleData = await getCustomerDiscountingModuleData({ page, pageSize: PAGE_SIZE, search, storeTypeId });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="relative z-10 flex h-14 shrink-0 items-center justify-between overflow-hidden border-b bg-background shadow-sm sm:h-16">
        <div className="flex h-full min-w-0 items-center gap-2 overflow-hidden px-3 sm:px-4">
          <SidebarTrigger className="-ml-1 shrink-0" />
          <Separator orientation="vertical" className="hidden shrink-0 sm:block mr-2 data-[orientation=vertical]:h-4" />

          <div className="min-w-0 overflow-hidden">
            <Breadcrumb>
              <BreadcrumbList className="min-w-0 overflow-hidden">
                <BreadcrumbItem className="hidden shrink-0 md:block">
                  <BreadcrumbLink href="#">FM</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden shrink-0 md:block" />
                <BreadcrumbItem className="hidden shrink-0 md:block">
                  <BreadcrumbLink href="#">Accounting</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden shrink-0 md:block" />
                <BreadcrumbItem className="hidden shrink-0 md:block">
                  <BreadcrumbLink href="#">Discount Management</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden shrink-0 md:block" />
                <BreadcrumbItem className="min-w-0 overflow-hidden">
                  <BreadcrumbPage className="truncate max-w-[56vw] sm:max-w-[60vw] md:max-w-none">
                    Customer Discounting
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </div>

        <div className="flex h-full shrink-0 items-center overflow-hidden px-2 sm:px-4 max-w-[48vw] sm:max-w-none">
          <NavUser user={headerUser} />
        </div>
      </header>

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        <CustomerDiscountingModule
          key={`${moduleData.pagination.page}:${moduleData.pagination.search}:${moduleData.pagination.storeTypeId ?? "all"}`}
          userId={headerUser.id}
          initialModuleData={moduleData}
          initialViewMode={viewMode}
        />
      </main>
    </div>
  );
}
