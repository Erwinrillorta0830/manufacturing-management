import { cookies } from "next/headers";
import { LotTransferError } from "./_errors";
import type { RecordValue } from "./_directus";
import { numeric } from "./_values";

export async function getSessionUserId(): Promise<number | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("vos_access_token")?.value || cookieStore.get("springboot_token")?.value;
        if (!token) return null;
        const parts = token.split(".");
        if (parts.length < 2) return null;
        let encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        while (encoded.length % 4) encoded += "=";
        const payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as RecordValue;
        for (const key of ["id", "user_id", "userId", "sub"]) {
            const id = numeric(payload[key]);
            if (id > 0) return id;
        }
    } catch {
        // Requests without a numeric Spring user ID remain attributable as System.
    }
    return null;
}

export async function getSessionUserBranchId(): Promise<number | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("vos_access_token")?.value || cookieStore.get("springboot_token")?.value;
        if (!token) return null;
        const parts = token.split(".");
        if (parts.length < 2) return null;
        let encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        while (encoded.length % 4) encoded += "=";
        const payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as RecordValue;
        for (const key of ["branch_id", "branchId", "branch"]) {
            const id = numeric(payload[key]);
            if (id > 0) return id;
        }
    } catch {
        // Requests without a branch-scoped session may use the explicit report branch filter.
    }
    return null;
}

export function requireSessionUserId(userId: number | null, action: string): number {
    if (!userId || userId <= 0) {
        throw new LotTransferError(401, `An authenticated user is required to ${action}.`);
    }
    return userId;
}
