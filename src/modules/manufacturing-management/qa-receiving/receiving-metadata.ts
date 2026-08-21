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
