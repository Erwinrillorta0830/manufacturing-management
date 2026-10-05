import { NextResponse } from "next/server";
import {
    JobOrderModuleAccessError,
    JOB_ORDER_MODULE_PATHS,
    requireJobOrderModuleAccess
} from "@/app/api/manufacturing/job-orders/_module-access";

export type MachineDowntimeAuthorization =
    | { userId: number; response?: never }
    | { userId?: never; response: NextResponse };

export async function authorizeMachineDowntimeReport(): Promise<MachineDowntimeAuthorization> {
    try {
        const user = await requireJobOrderModuleAccess(JOB_ORDER_MODULE_PATHS.production);
        return { userId: user.userId };
    } catch (error) {
        if (error instanceof JobOrderModuleAccessError) {
            return {
                response: NextResponse.json(
                    { success: false, error: error.message, code: error.code },
                    { status: error.status }
                )
            };
        }
        console.error("Machine Downtime Report authorization failed:", error);
        return {
            response: NextResponse.json(
                { success: false, error: "Unable to verify Manufacturing access.", code: "MODULE_ACCESS_SERVICE_UNAVAILABLE" },
                { status: 503 }
            )
        };
    }
}
