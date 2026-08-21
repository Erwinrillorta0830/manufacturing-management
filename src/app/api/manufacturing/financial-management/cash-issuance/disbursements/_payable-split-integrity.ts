type PayableSplitInput = {
    referenceNo?: unknown;
    divisionId?: unknown;
    remarks?: unknown;
};

const VAT_PRINCIPAL_REMARK = "Principal Net of VAT";
const VAT_CHILD_REMARKS = new Set(["Input VAT (12%)", "EWT Deduction (1%)"]);

function normalizedReference(referenceNo: unknown) {
    return referenceNo == null ? "" : String(referenceNo).trim();
}

function normalizedDivisionId(divisionId: unknown) {
    if (divisionId == null || divisionId === "") return undefined;
    const parsed = Number(divisionId);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function isVatPrincipalLine(line: PayableSplitInput) {
    return String(line.remarks ?? "").trim() === VAT_PRINCIPAL_REMARK;
}

function isVatChildLine(line: PayableSplitInput) {
    return VAT_CHILD_REMARKS.has(String(line.remarks ?? "").trim());
}

function findPrincipalByReference(lines: PayableSplitInput[]) {
    const principals = new Map<string, PayableSplitInput>();
    lines.forEach((line) => {
        const referenceNo = normalizedReference(line.referenceNo);
        if (referenceNo && isVatPrincipalLine(line)) {
            principals.set(referenceNo, line);
        }
    });
    return principals;
}

export function normalizeVatSplitDivisions<T extends PayableSplitInput>(lines: T[]) {
    const principals = findPrincipalByReference(lines);

    return lines.map((line) => {
        const referenceNo = normalizedReference(line.referenceNo);
        const principal = principals.get(referenceNo);
        if (!principal || !isVatChildLine(line)) return line;

        return {
            ...line,
            divisionId: normalizedDivisionId(principal.divisionId),
        } as T;
    });
}

export function findMissingVatPrincipalDivisionError(lines: PayableSplitInput[]) {
    const principals = findPrincipalByReference(lines);

    for (const line of lines) {
        const referenceNo = normalizedReference(line.referenceNo);
        if (!referenceNo || !isVatChildLine(line)) continue;

        const principal = principals.get(referenceNo);
        if (principal && normalizedDivisionId(principal.divisionId) === undefined && normalizedDivisionId(line.divisionId) !== undefined) {
            return `Cost Division must be selected on the principal VAT line before saving ${referenceNo}.`;
        }
    }

    return null;
}

export function findMissingPayableDivisionError(lines: PayableSplitInput[]) {
    const invalidIndex = lines.findIndex((line) => normalizedDivisionId(line.divisionId) === undefined);
    return invalidIndex >= 0
        ? `Cost Division is required on payable row ${invalidIndex + 1}.`
        : null;
}

export function findVatSplitDivisionError(lines: PayableSplitInput[]) {
    const principals = findPrincipalByReference(lines);

    for (const line of lines) {
        const referenceNo = normalizedReference(line.referenceNo);
        if (!referenceNo || !isVatChildLine(line)) continue;

        const principal = principals.get(referenceNo);
        if (!principal) continue;

        const principalDivisionId = normalizedDivisionId(principal.divisionId);
        const childDivisionId = normalizedDivisionId(line.divisionId);
        if (principalDivisionId === undefined || childDivisionId !== principalDivisionId) {
            return `Cost Division must match the principal VAT line for ${referenceNo}.`;
        }
    }

    return null;
}
