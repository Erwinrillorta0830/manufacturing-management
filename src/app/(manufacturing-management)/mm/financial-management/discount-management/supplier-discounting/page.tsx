// src/app/(financial-management)/fm/accounting/discount-management/supplier-discounting/page.tsx
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
import SupplierDiscountingModule from "@/modules/manufacturing-management/financial-management/discount-management/supplier-discounting";
import { getSupplierDiscountingModuleData } from "@/app/api/manufacturing/financial-management/discount-management/supplier-discounting/_module-data";
import type { SupplierDiscountModuleData } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-discounting/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "vos_access_token";

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
 * Renders the supplier discounting page shell and server-loads module metadata.
 */
export default async function Page() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value ?? null;
  const headerUser = buildHeaderUserFromToken(token);
  let moduleData: SupplierDiscountModuleData;
  let metadataError: string | null = null;
  try {
    moduleData = await getSupplierDiscountingModuleData();
  } catch (error) {
    console.error("Failed to load supplier discounting meta data", error);
    moduleData = { suppliers: [], categories: [], brands: [], discountTypes: [] };
    metadataError = "Supplier discounting metadata failed to load. Product rules may be unavailable until the data service recovers.";
  }

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
                    Supplier Discounting
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
        <SupplierDiscountingModule initialModuleData={moduleData} metadataError={metadataError} />
      </main>
    </div>
  );
}
