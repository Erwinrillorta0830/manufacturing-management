export type YieldEvidenceChannel = "INSPECTOR_SHIFT" | "QA_ACCEPTED_STOCK" | "QA_REJECTED_STOCK";

export interface YieldEvidenceRequirements {
    inspectorShift: true;
    acceptedStock: boolean;
    rejectedStock: boolean;
}

export function yieldEvidenceRequirements(acceptedQuantity: number, rejectedQuantity: number): YieldEvidenceRequirements {
    return {
        inspectorShift: true,
        acceptedStock: Number.isFinite(acceptedQuantity) && acceptedQuantity > 0,
        rejectedStock: Number.isFinite(rejectedQuantity) && rejectedQuantity > 0
    };
}

export function yieldEvidenceChannelLabel(channel: YieldEvidenceChannel): string {
    switch (channel) {
        case "INSPECTOR_SHIFT": return "Inspector / Shift Evidence";
        case "QA_ACCEPTED_STOCK": return "QA Accepted Stock Evidence";
        case "QA_REJECTED_STOCK": return "QA Rejected Stock Evidence";
    }
}

