import StockConversionModule from "@/modules/manufacturing-management/stock-conversion/StockConversionModule";
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
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function pickString(obj: Record<string, unknown> | null, keys: string[]): string {
  if (!obj) return "";
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function toSafeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function buildHeaderUserFromToken(token: string | null | undefined): {
  id: number;
  branchId: number;
  name: string;
  email: string;
  avatar: string;
} {
  const payload = token ? decodeJwtPayload(token) : null;

  const first = pickString(payload, ["Firstname", "FirstName", "firstName", "firstname", "first_name"]);
  const last = pickString(payload, ["LastName", "Lastname", "lastName", "lastname", "last_name"]);
  const email = pickString(payload, ["email", "Email"]);

  const nameParts: string[] = [];
  if (first) nameParts.push(first);
  if (last) nameParts.push(last);
  const name = nameParts.length > 0 ? nameParts.join(" ") : email || "User";

  const branchId = toSafeNumber(
    payload?.branch_id ?? payload?.branchId ?? payload?.branch ?? 0
  );
  const id = toSafeNumber(
    payload?.id ?? payload?.userId ?? payload?.sub ?? 0
  );

  return {
    id: id > 0 ? id : 0,
    branchId: branchId > 0 ? branchId : 0,
    name: name || "User",
    email: email || "",
    avatar: "/avatars/shadcn.jpg",
  };
}

export default async function StockConversionPage() {
  const cookieStore = await cookies();
  const token =
    cookieStore.get("springboot_token")?.value ??
    cookieStore.get(COOKIE_NAME)?.value ??
    null;

  const headerUser = buildHeaderUserFromToken(token);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b shadow-sm bg-background sm:h-16 overflow-hidden">
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
                  <BreadcrumbLink href="#">Inventory & Warehousing</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block shrink-0" />
                <BreadcrumbItem className="hidden md:block shrink-0">
                  <BreadcrumbLink href="#">Adjustments</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block shrink-0" />
                <BreadcrumbItem className="min-w-0 overflow-hidden">
                  <BreadcrumbPage className="truncate max-w-[56vw] sm:max-w-[60vw] md:max-w-none">
                    Stock Conversion
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

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-4">
        <StockConversionModule
          userId={headerUser.id}
          userBranchId={headerUser.branchId}
          userName={headerUser.name}
          userEmail={headerUser.email}
          userAvatar={headerUser.avatar}
        />
      </main>
    </div>
  );
}
