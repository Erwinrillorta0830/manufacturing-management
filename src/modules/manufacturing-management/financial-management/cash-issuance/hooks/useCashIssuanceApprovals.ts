import { useState } from "react";
import { toast } from "sonner";
import { DisbursementStatusResult } from "../types";
import { disbursementProvider, DisbursementRequestError } from "../providers/fetchProvider";

export function useCashIssuanceApprovals(onSuccess: () => void) {
    const [actionLoading, setActionLoading] = useState(false);

    const changeStatus = async (id: number, status: string): Promise<DisbursementStatusResult> => {
        setActionLoading(true);
        try {
            await disbursementProvider.updateStatus(id, status);
            toast.success(`Status updated to ${status}`);
            onSuccess();
            return { success: true };
        } catch (error: unknown) {
            const message = error instanceof DisbursementRequestError
                ? error.message
                : error instanceof Error
                    ? error.message
                    : "Status update failed";
            const detail = error instanceof DisbursementRequestError ? error.detail : undefined;

            if (detail) {
                toast.error(message, { description: detail });
            } else {
                toast.error(message);
            }

            return { success: false, message, detail };
        } finally {
            setActionLoading(false);
        }
    };

    return {
        changeStatus,
        approvalsLoading: actionLoading,
    };
}
