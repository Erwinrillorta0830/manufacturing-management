import { NextRequest, NextResponse } from "next/server";
import { stockAdjustmentManualService } from "@/modules/manufacturing-management/stock-adjustment-registration/services/stock-adjustment-manual-service";
import { handleApiError } from "@/modules/manufacturing-management/stock-adjustment-registration/utils/error-handler";
import { getUserIdFromToken } from "@/modules/manufacturing-management/stock-adjustment-registration/utils/auth-utils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Extract userId from cookie
    const token = request.cookies.get("vos_access_token")?.value;
    const userId = getUserIdFromToken(token);

    const data = await stockAdjustmentManualService.create({ ...body, userId: userId || undefined });
    return NextResponse.json({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
