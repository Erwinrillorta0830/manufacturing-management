// src/modules/financial-management/accounting/customers-memo/utils/dateUtils.ts

export function formatPhDateTime(dateStr?: string | null): string {
    if (!dateStr) return "N/A";
    try {
        let normalized = String(dateStr).trim();
        // If string has space instead of T and no offset
        if (!normalized.includes('T')) {
            normalized = normalized.replace(' ', 'T') + '+08:00';
        } else if (normalized.endsWith('Z')) {
            // Strip trailing Z if Directus returned local PH time with Z
            normalized = normalized.slice(0, -1) + '+08:00';
        } else if (!normalized.includes('+') && !normalized.includes('-')) {
            normalized = normalized + '+08:00';
        }

        const d = new Date(normalized);
        if (isNaN(d.getTime())) return String(dateStr);

        return d.toLocaleString("en-US", {
            timeZone: "Asia/Manila",
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
            hour12: true
        });
    } catch {
        return String(dateStr);
    }
}
