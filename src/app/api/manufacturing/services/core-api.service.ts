// VOS ERP - Core Directus API Client Service

export const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
export const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN !== undefined ? process.env.DIRECTUS_STATIC_TOKEN : "test";

export const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_TOKEN}`;
}

/**
 * Get a general setting value by key.
 */
export async function getGeneralSetting(key: string): Promise<string | null> {
    try {
        const url = `${DIRECTUS_URL}/items/general_setting?filter[setting_key][_eq]=${key}&limit=1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return null;
        const body = await res.json();
        return body.data?.[0]?.setting_value ?? null;
    } catch (e) {
        console.error(`[Manufacturing Directus API] Failed to fetch general setting for key ${key}:`, e);
        return null;
    }
}

/**
 * Set or update a general setting value.
 */
export async function setGeneralSetting(key: string, value: string): Promise<boolean> {
    try {
        const checkUrl = `${DIRECTUS_URL}/items/general_setting?filter[setting_key][_eq]=${key}&limit=1`;
        const checkRes = await fetch(checkUrl, { headers, cache: "no-store" });
        
        let existingId: number | null = null;
        if (checkRes.ok) {
            const body = await checkRes.json();
            if (body.data?.[0]) {
                existingId = body.data[0].id;
            }
        }

        if (existingId !== null) {
            const updateUrl = `${DIRECTUS_URL}/items/general_setting/${existingId}`;
            const res = await fetch(updateUrl, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ setting_value: value })
            });
            return res.ok;
        } else {
            const createUrl = `${DIRECTUS_URL}/items/general_setting`;
            const res = await fetch(createUrl, {
                method: "POST",
                headers,
                body: JSON.stringify({ setting_key: key, setting_value: value })
            });
            return res.ok;
        }
    } catch (e) {
        console.error(`[Manufacturing Directus API] Failed to set general setting for key ${key}:`, e);
        return false;
    }
}

/**
 * Get all general settings as a key-value record.
 */
export async function getAllGeneralSettings(): Promise<Record<string, string>> {
    try {
        const url = `${DIRECTUS_URL}/items/general_setting?limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return {};
        const body = await res.json();
        const settings: Record<string, string> = {};
        if (Array.isArray(body.data)) {
            body.data.forEach((item: { setting_key: string; setting_value: string }) => {
                if (item.setting_key) {
                    settings[item.setting_key] = item.setting_value;
                }
            });
        }
        return settings;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to fetch all general settings:", e);
        return {};
    }
}

let cachedTimezone: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000;

export async function getConfiguredTimezone(): Promise<string> {
    const now = Date.now();
    if (cachedTimezone && (now - cacheTimestamp < CACHE_TTL_MS)) {
        return cachedTimezone;
    }
    
    try {
        const tz = await getGeneralSetting("timezone");
        if (tz) {
            cachedTimezone = tz;
            cacheTimestamp = now;
            return tz;
        }
    } catch (e) {
        console.error("[Timezone Helper] Error fetching timezone setting, falling back to Asia/Manila:", e);
    }
    
    cachedTimezone = "Asia/Manila";
    cacheTimestamp = now;
    return cachedTimezone;
}

export async function getTodayDateString(now = new Date()): Promise<string> {
    const tz = await getConfiguredTimezone();
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

/**
 * Formats a persisted manufacturing event timestamp as a Philippine-time
 * wall-clock value. These fields are stored in MySQL DATETIME columns, so the
 * value must not carry an offset or be left to a database/session timezone.
 */
export function formatPhtDateTime(now = new Date()): string {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

export async function getISOStringInConfiguredTimezone(d = new Date()): Promise<string> {
    const tz = await getConfiguredTimezone();
    
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    });
    
    const parts = formatter.formatToParts(d);
    const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
    const ms = String(d.getMilliseconds()).padStart(3, "0");
    
    const tzString = d.toLocaleString("en-US", { timeZone: tz });
    const localDate = new Date(tzString);
    const utcString = d.toLocaleString("en-US", { timeZone: "UTC" });
    const utcDate = new Date(utcString);
    const diff = Math.round((localDate.getTime() - utcDate.getTime()) / 60000);
    const sign = diff >= 0 ? "+" : "-";
    const absDiff = Math.abs(diff);
    const hours = String(Math.floor(absDiff / 60)).padStart(2, "0");
    const minutes = String(absDiff % 60).padStart(2, "0");
    
    return `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}:${m.second}.${ms}${sign}${hours}:${minutes}`;
}
