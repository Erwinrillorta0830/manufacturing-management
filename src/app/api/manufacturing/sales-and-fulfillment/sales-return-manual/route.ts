/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// Sales Return Manual — Next.js API Route (Server Gateway)
// Thin wrapper around the service layer.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import {
  fetchReturns,
  fetchReturnDetails,
  fetchReferences,
  fetchProductCatalog,
  fetchInvoices,
  fetchStatusCard,
  submitReturn,
  updateReturn,
  updateStatus,
  fetchLots,
  fetchInvoiceDetails,
} from "@/modules/manufacturing-management/sales-and-fulfillment/sales-return-manual/services/sales-return.service";
import { getUserIdFromToken } from "@/modules/manufacturing-management/sales-and-fulfillment/sales-return-manual/services/sales-return.helpers";
import { handleApiError } from "@/modules/manufacturing-management/sales-and-fulfillment/sales-return-manual/lib/handle-api-error";
import { SubmitReturnSchema, UpdateReturnSchema, UpdateStatusSchema } from "@/modules/manufacturing-management/sales-and-fulfillment/sales-return-manual/types/sales-return.schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(res: any, status = 200) {
  return NextResponse.json(res, { status });
}

// =============================================================================
// GET — Dispatches based on ?action= query param
// =============================================================================
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "list";

    switch (action) {
      case "list": {
        const page = Number(url.searchParams.get("page") || 1);
        const limit = Number(url.searchParams.get("limit") || 10);
        const filters = {
          salesman: url.searchParams.get("salesman") || undefined,
          customer: url.searchParams.get("customer") || undefined,
          status: url.searchParams.get("status") || undefined,
          invoiceNo: url.searchParams.get("invoiceNo") || undefined,
        };
        const data = await fetchReturns(page, limit, filters);
        return json({ data: data.data, total: data.total });
      }

      case "details": {
        const id = url.searchParams.get("id");
        const returnNo = url.searchParams.get("returnNo");
        if (!id || !returnNo) {
          return json({ error: "id and returnNo are required" }, 400);
        }
        const data = await fetchReturnDetails(Number(id), returnNo);
        return json({ data });
      }

      case "references": {
        const data = await fetchReferences();
        return json({ data });
      }

      case "lots": {
        const data = await fetchLots();
        return json({ data });
      }

      case "products": {
        const customerCode = url.searchParams.get("customerCode") || undefined;
        const includeInactive = url.searchParams.get("includeInactive") === "true";
        const data = await fetchProductCatalog(customerCode, includeInactive);
        return json({ data });
      }

      case "invoices": {
        const salesmanId = url.searchParams.get("salesmanId") || undefined;
        const customerCode = url.searchParams.get("customerCode") || undefined;
        const data = await fetchInvoices(salesmanId, customerCode);
        return json({ data });
      }

      case "invoice-items": {
        const id = url.searchParams.get("id");
        if (!id) {
          return json({ error: "id is required" }, 400);
        }
        const data = await fetchInvoiceDetails(Number(id));
        return json({ data });
      }

      case "statusCard": {
        const id = url.searchParams.get("id");
        if (!id) {
          return json({ error: "id is required" }, 400);
        }
        const data = await fetchStatusCard(Number(id));
        return json({ data });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (error) {
    return handleApiError(error, "Failed to execute GET action");
  }
}

// =============================================================================
// POST — Create a new Sales Return
// =============================================================================
export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("vos_access_token")?.value;
    const userId = getUserIdFromToken(token);
    
    // 🟢 Session token is now mandatory.
    if (!userId) {
      return json({ error: "Unauthorized: Invalid or missing session" }, 401);
    }

    const rawBody = await req.json().catch(() => ({}));
    const body = SubmitReturnSchema.parse(rawBody);
    
    const data = await submitReturn(body, userId);
    return json({ data }, 201);
  } catch (error) {
    return handleApiError(error, "Failed to create sales return");
  }
}

// =============================================================================
// PATCH — Update an existing Sales Return or change status
// =============================================================================
export async function PATCH(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "update";

    if (action === "status") {
      const id = url.searchParams.get("id");
      const status = url.searchParams.get("status");
      if (!id || !status) {
        return json({ error: "id and status are required" }, 400);
      }
      
      const isReceived = url.searchParams.get("isReceived") === "true" ? true : undefined;
      const received_at = url.searchParams.get("receivedAt") || undefined;

      const body = UpdateStatusSchema.parse({
        id: Number(id),
        status,
        isReceived,
        receivedAt: received_at,
      });

      const data = await updateStatus(body.id, body.status, body.isReceived ? 1 : undefined, body.receivedAt);
      return json({ data });
    }

    // Default: full update
    const token = req.cookies.get("vos_access_token")?.value;
    const userId = getUserIdFromToken(token);
    
    // 🟢 Session token is now mandatory.
    if (!userId) {
      return json({ error: "Unauthorized: Invalid or missing session" }, 401);
    }

    const rawBody = await req.json().catch(() => ({}));
    const body = UpdateReturnSchema.parse(rawBody);
    
    const data = await updateReturn(body, userId);
    return json({ data });
  } catch (error) {
    return handleApiError(error, "Failed to update sales return");
  }
}
