export interface ReceivingMetadataLine {
    lineId: number;
    productName: string;
    isPackaging: boolean;
    receivedQuantity: number;
    batchNumber: string;
    lotId: string;
    manufacturingDate: string;
    expirationDate: string;
}

export interface ReceivingValidationIssue {
    field: string;
    lineId?: number;
    productName?: string;
    message: string;
}

export const RECEIPT_NUMBER_MAX_LENGTH = 32;

export function getTodayReceiptDate(now = new Date()): string {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

export function isValidReceiptDate(receiptDate: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(receiptDate)) return false;
    const [year, month, day] = receiptDate.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
}

export function validateReceivingReceiptDate(receiptDate: string): ReceivingValidationIssue[] {
    const normalized = receiptDate.trim();
    if (!normalized) {
        return [{ field: "receiptDate", message: "Date of Receipt is required." }];
    }
    if (!isValidReceiptDate(normalized)) {
        return [{ field: "receiptDate", message: "Date of Receipt must be a valid date." }];
    }
    return [];
}

export function validateReceivingReceiptNumber(receiptNumber: string): ReceivingValidationIssue[] {
    const normalized = receiptNumber.trim();
    if (!normalized) {
        return [{ field: "receiptNumber", message: "Receipt Number is required." }];
    }
    if (normalized.length > RECEIPT_NUMBER_MAX_LENGTH) {
        return [{ field: "receiptNumber", message: `Receipt Number cannot exceed ${RECEIPT_NUMBER_MAX_LENGTH} characters.` }];
    }
    return [];
}

export function validateReceivingMetadata(
    branchId: string,
    lines: ReceivingMetadataLine[]
): ReceivingValidationIssue[] {
    const issues: ReceivingValidationIssue[] = [];
    if (!Number.isInteger(Number(branchId)) || Number(branchId) <= 0) {
        issues.push({ field: "branchId", message: "Receiving Branch is required." });
    }

    for (const line of lines) {
        if (line.receivedQuantity === 0) continue;
        if (!line.batchNumber.trim()) {
            issues.push({ lineId: line.lineId, productName: line.productName, field: "batchNumber", message: `${line.productName}: Supplier Batch Number is required.` });
        } else if (line.batchNumber.trim().length > 50) {
            issues.push({ lineId: line.lineId, productName: line.productName, field: "batchNumber", message: `${line.productName}: Supplier Batch Number cannot exceed 50 characters.` });
        }
        if (!Number.isInteger(Number(line.lotId)) || Number(line.lotId) <= 0) {
            issues.push({ lineId: line.lineId, productName: line.productName, field: "storageLot", message: `${line.productName}: Storage Lot allocation is required.` });
        }

        if (!line.isPackaging && !line.manufacturingDate) {
            issues.push({ lineId: line.lineId, productName: line.productName, field: "manufacturingDate", message: `${line.productName}: Manufacturing Date is required for raw materials.` });
        }
        if (!line.isPackaging && !line.expirationDate) {
            issues.push({ lineId: line.lineId, productName: line.productName, field: "expirationDate", message: `${line.productName}: Expiry Date is required for raw materials.` });
        }
        if (line.manufacturingDate && line.expirationDate && line.manufacturingDate > line.expirationDate) {
            issues.push({ lineId: line.lineId, productName: line.productName, field: "expirationDate", message: `${line.productName}: Manufacturing Date cannot be later than Expiry Date.` });
        }
    }

    return issues;
}
