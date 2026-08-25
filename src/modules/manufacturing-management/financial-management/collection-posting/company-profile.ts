export interface CompanyProfile {
    companyName: string | null;
    address: string | null;
    tin: string | null;
    logoDataUrl: string | null;
}

export type CompanyProfileStatus = "loading" | "ready" | "unavailable" | "error";

export interface CompanyProfileResult {
    profile: CompanyProfile | null;
    status: Exclude<CompanyProfileStatus, "loading">;
}

export async function fetchCompanyProfile(): Promise<CompanyProfileResult> {
    const response = await fetch("/api/fm/company-profile", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error(`Company profile request failed: ${response.status}`);
    }

    const payload = await response.json() as { data?: CompanyProfile | null };
    const profile = payload.data ?? null;
    const hasOfficialData = Boolean(
        profile?.companyName || profile?.address || profile?.tin || profile?.logoDataUrl,
    );

    return {
        profile,
        status: hasOfficialData ? "ready" : "unavailable",
    };
}
