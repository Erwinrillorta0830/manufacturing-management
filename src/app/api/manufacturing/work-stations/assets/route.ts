import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

interface UserRecord {
    user_id: number | string;
    user_fname?: string;
    user_lname?: string;
}

export async function GET() {
    try {
        const queryParams = new URLSearchParams({
            limit: "-1",
            sort: "-id",
            fields: "*,item_id.id,item_id.item_name,department.department_id,department.department_name",
            "filter[is_active][_eq]": "true",
            "filter[_or][0][department][_eq]": "4",
            "filter[_or][1][department][department_id][_eq]": "4",
            "filter[_or][2][department][department_name][_icontains]": "production"
        });

        const [res, usersRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/assets_and_equipment?${queryParams.toString()}`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname`, { headers, cache: "no-store" }).catch(() => null)
        ]);

        if (!res.ok) throw new Error(`Directus failed to fetch work station production assets: ${res.status}`);
        const json = await res.json();
        const assets = json.data || [];

        let usersList: UserRecord[] = [];
        if (usersRes && usersRes.ok) {
            try {
                const usersJson = await usersRes.json();
                usersList = usersJson.data || [];
            } catch (err) {
                console.error("Error parsing users in GET work-stations assets:", err);
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mappedAssets = assets.map((a: any) => {
            const matchedUser = usersList.find((u) => Number(u.user_id) === Number(a.created_by));
            let creatorName = "N/A";
            if (matchedUser) {
                creatorName = [matchedUser.user_fname, matchedUser.user_lname].filter(Boolean).join(" ") || "N/A";
            }
            return {
                ...a,
                is_active_warning: a.is_active_warning === undefined || a.is_active_warning === null ? false : Boolean(Number(a.is_active_warning)),
                is_active: a.is_active === undefined || a.is_active === null ? true : Boolean(Number(a.is_active)),
                created_by_name: creatorName
            };
        });

        return NextResponse.json(mappedAssets);
    } catch (e) {
        console.error("API Error fetching work-stations assets:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to fetch work station assets" }, { status: 500 });
    }
}
