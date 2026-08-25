export interface ReceivingMetadataAllocation {
    storageLotId: string | number;
    batchNumber: string;
    manufacturingDate: string | null;
    expirationDate: string | null;
    quantity: number | string;
}

export interface ReceivingMetadataLine {
    lineId: number;
    productName: string;
    isPackaging: boolean;
    receivedQuantity: number;
    acceptedQuantity: number;
    rejectedQuantity: number;
    acceptedLotAllocations: ReceivingMetadataAllocation[];
    rejectedLotAllocations: ReceivingMetadataAllocation[];
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

        const validateAllocations = (
            disposition: "accepted" | "rejected",
            quantity: number,
            allocations: ReceivingMetadataAllocation[]
        ) => {
            const field = `${disposition}StorageLot`;
            if (quantity > 0 && allocations.length === 0) {
                issues.push({ lineId: line.lineId, productName: line.productName, field, message: `${line.productName}: allocate all ${disposition} quantity to storage lots.` });
                return;
            }
            if (quantity <= 0 && allocations.length > 0) {
                issues.push({ lineId: line.lineId, productName: line.productName, field, message: `${line.productName}: ${disposition} allocations are not allowed when ${disposition} quantity is zero.` });
            }

            const seen = new Set<string>();
            let total = 0;
            for (const allocation of allocations) {
                const storageLotId = Number(allocation.storageLotId);
                const batchNumber = allocation.batchNumber.trim();
                const quantityValue = Number(allocation.quantity);
                if (!Number.isInteger(storageLotId) || storageLotId <= 0) {
                    issues.push({ lineId: line.lineId, productName: line.productName, field, message: `${line.productName}: every ${disposition} allocation requires a storage lot.` });
                }
                if (!batchNumber) {
                    issues.push({ lineId: line.lineId, productName: line.productName, field, message: `${line.productName}: every ${disposition} allocation requires a Supplier Batch Number.` });
                } else if (batchNumber.length > 50) {
                    issues.push({ lineId: line.lineId, productName: line.productName, field, message: `${line.productName}: Supplier Batch Number cannot exceed 50 characters.` });
                }
                if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
                    issues.push({ lineId: line.lineId, productName: line.productName, field, message: `${line.productName}: every ${disposition} allocation requires a positive quantity.` });
                }
                const key = `${storageLotId}:${batchNumber.toLowerCase()}`;
                if (seen.has(key)) {
                    issues.push({ lineId: line.lineId, productName: line.productName, field, message: `${line.productName}: a storage lot and batch can only appear once in the ${disposition} allocation.` });
                }
                seen.add(key);
                total += Number.isFinite(quantityValue) ? quantityValue : 0;

                if (!line.isPackaging && !allocation.manufacturingDate) {
                    issues.push({ lineId: line.lineId, productName: line.productName, field, message: `${line.productName}: Manufacturing Date is required for raw materials and finished goods.` });
                }
                if (!line.isPackaging && !allocation.expirationDate) {
                    issues.push({ lineId: line.lineId, productName: line.productName, field, message: `${line.productName}: Expiry Date is required for raw materials and finished goods.` });
                }
                if (allocation.manufacturingDate && allocation.expirationDate && allocation.manufacturingDate > allocation.expirationDate) {
                    issues.push({ lineId: line.lineId, productName: line.productName, field, message: `${line.productName}: Manufacturing Date cannot be later than Expiry Date.` });
                }
            }
            if (quantity > 0 && Math.abs(total - quantity) > 1e-9) {
                issues.push({ lineId: line.lineId, productName: line.productName, field, message: `${line.productName}: ${disposition} allocations (${total}) must equal ${disposition} quantity (${quantity}).` });
            }
        };

        validateAllocations("accepted", line.acceptedQuantity, line.acceptedLotAllocations);
        validateAllocations("rejected", line.rejectedQuantity, line.rejectedLotAllocations);
    }

    return issues;
}
