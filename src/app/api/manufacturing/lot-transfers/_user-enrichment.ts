import { directusRows, type RecordValue } from "./_directus";
import type { LotTransferRecord } from "./_types";
import { numeric, stringValue } from "./_values";

function userDisplayName(row: RecordValue): string | null {
    const fullName = [row.user_fname, row.user_mname, row.user_lname]
        .map(stringValue)
        .filter(Boolean)
        .join(" ");
    return fullName || stringValue(row.user_email) || null;
}

function fallbackUserName(userId: number | null): string | null {
    return userId && userId > 0 ? `User #${userId}` : null;
}

function resolveUserName(userId: number | null, existingName: string | null, names: Map<number, string>): string | null {
    if (!userId || userId <= 0) return null;
    return existingName || names.get(userId) || fallbackUserName(userId);
}

export async function enrichTransferActorNames(records: LotTransferRecord[]): Promise<LotTransferRecord[]> {
    const userIds = [...new Set(records.flatMap((record) => [record.submittedBy, record.postedBy]).filter((id): id is number => Boolean(id && id > 0)))];
    if (userIds.length === 0) return records;

    const params = new URLSearchParams({
        "filter[user_id][_in]": userIds.join(","),
        fields: "user_id,user_fname,user_mname,user_lname,user_email",
        limit: "-1"
    });
    let userRows: RecordValue[] = [];
    try {
        userRows = await directusRows(`/items/user?${params.toString()}`, "Lot-transfer actor lookup");
    } catch (error) {
        console.warn("[Lot Transfer] Actor-name lookup failed; using user ID fallbacks.", error);
    }

    const names = new Map<number, string>();
    for (const row of userRows) {
        const userId = numeric(row.user_id);
        const name = userDisplayName(row);
        if (userId > 0 && name) names.set(userId, name);
    }

    return records.map((record) => ({
        ...record,
        submittedByName: resolveUserName(record.submittedBy, record.submittedByName, names),
        postedByName: resolveUserName(record.postedBy, record.postedByName, names)
    }));
}
