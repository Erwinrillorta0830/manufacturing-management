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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function findMissingVatPrincipalDivisionError(lines: PayableSplitInput[]) {
    return null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function findMissingPayableDivisionError(lines: PayableSplitInput[]) {
    return null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function findVatSplitDivisionError(lines: PayableSplitInput[]) {
    return null;
}

