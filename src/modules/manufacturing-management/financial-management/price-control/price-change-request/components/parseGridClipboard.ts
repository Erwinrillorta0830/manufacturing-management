export function parseTsv(text: string): string[][] {
    const rows = text.split(/\r?\n/);

    while (rows.length > 0 && rows[rows.length - 1].trim() === "") {
        rows.pop();
    }

    return rows.map((row) => row.split("\t"));
}

export function isMultiCellClipboard(text: string): boolean {
    return /\t|\r?\n/.test(text);
}

export function normalizePastedPrice(cell: string): string {
    const trimmed = cell.trim();
    if (!trimmed) return "";
    return trimmed.replace(/,/g, "");
}

export function validatePastedPrice(value: string): { valid: boolean; normalized: string } {
    const normalized = normalizePastedPrice(value);
    if (!normalized) return { valid: true, normalized: "" };

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return { valid: false, normalized };
    }

    return { valid: true, normalized };
}
