import { useState } from "react";
import { toast } from "sonner";
import { PaymentLine, DisbursementSubmitResult } from "../types";
import { disbursementProvider } from "../providers/fetchProvider";

export function useCashIssuanceReleasing(onSuccess: () => void) {
    const [actionLoading, setActionLoading] = useState(false);

    const updatePaymentAllocation = async (id: number, payments: PaymentLine[]): Promise<DisbursementSubmitResult> => {
        setActionLoading(true);
        try {
            await disbursementProvider.updatePaymentAllocation(id, payments);
            toast.success("Payment allocation saved successfully");
            onSuccess();
            return { success: true };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Payment allocation update failed";
            toast.error(msg);
            return { success: false, message: msg };
        } finally {
            setActionLoading(false);
        }
    };

    return {
        updatePaymentAllocation,
        releasingLoading: actionLoading,
    };
}
