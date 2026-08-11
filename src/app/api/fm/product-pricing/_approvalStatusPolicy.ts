export function appendDisplayStatusFilter(params: URLSearchParams, andIdx: number, status: string): number {
    const normalized = status.trim().toUpperCase();
    if (!normalized) return andIdx;

    const addAnd = (suffix: string, value: string) => {
        params.set(`filter[_and][${andIdx}]${suffix}`, value);
        andIdx += 1;
    };

    if (normalized === "SCHEDULED") {
        addAnd("[status][_eq]", "APPROVED");
        addAnd("[application_status][_eq]", "SCHEDULED");
        return andIdx;
    }

    if (["APPLYING", "FAILED"].includes(normalized)) {
        addAnd("[status][_eq]", "APPROVED");
        addAnd("[application_status][_eq]", normalized);
        return andIdx;
    }

    if (normalized === "APPROVED") {
        addAnd("[status][_eq]", "APPROVED");
        params.set(`filter[_and][${andIdx}][_or][0][application_status][_nin]`, "SCHEDULED,APPLYING,FAILED");
        params.set(`filter[_and][${andIdx}][_or][1][application_status][_null]`, "true");
        return andIdx + 1;
    }

    addAnd("[status][_eq]", normalized);
    return andIdx;
}
