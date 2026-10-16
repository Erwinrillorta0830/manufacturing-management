export interface RejectedOutputMetadata {
    mmLotId: number;
    batchNo: string;
    manufacturingDate: string;
    expiryDate: string;
}

export function shouldRegisterRejectedOutput(quantity: number, auditComplete: boolean): boolean {
    return Number.isFinite(quantity) && quantity > 0 && auditComplete;
}

export function isRejectedOutputRegistered(rejectedMmLotId: number | null | undefined): boolean {
    return typeof rejectedMmLotId === "number" && Number.isFinite(rejectedMmLotId) && rejectedMmLotId > 0;
}

export function rejectedOutputLedgerPatch(metadata: RejectedOutputMetadata): Record<string, unknown> {
    return {
        rejected_mm_lot_id: metadata.mmLotId,
        rejected_lot_number: metadata.batchNo,
        rejected_manufacturing_date: metadata.manufacturingDate,
        rejected_expiry_date: metadata.expiryDate,
        rejected_inventory_condition: "DAMAGED"
    };
}
