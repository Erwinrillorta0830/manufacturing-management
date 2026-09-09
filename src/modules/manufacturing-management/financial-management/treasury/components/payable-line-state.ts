import { PayableLine } from "../types";

export function replaceEmptyPayablePlaceholders(prev: PayableLine[], newPayables: PayableLine[]): PayableLine[] {
    const isPopulated = (line: PayableLine) =>
        !!line.coaId ||
        (Number.isFinite(Number(line.amount)) && Number(line.amount) !== 0) ||
        !!line.referenceNo?.trim();

    const existingPopulated = prev.filter(isPopulated);
    return [...existingPopulated, ...newPayables];
}

