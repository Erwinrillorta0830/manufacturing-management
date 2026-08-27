import { useState, useRef } from "react";
import { toast } from "sonner";
import { DisbursementPayload, DisbursementSubmitResult } from "../types";
import { disbursementProvider } from "../providers/fetchProvider";

export function useCashIssuanceDrafts(onSuccess: () => void) {
    const [actionLoading, setActionLoading] = useState(false);
    const createRequestLockRef = useRef(false);

    const create = async (payload: DisbursementPayload): Promise<DisbursementSubmitResult> => {
        if (createRequestLockRef.current) return { success: false };
        createRequestLockRef.current = true;
        setActionLoading(true);
        try {
            await disbursementProvider.createDisbursement(payload);
            toast.success("Voucher created successfully");
            onSuccess();
            return { success: true };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Creation failed";
            toast.error(message);
            return { success: false, message };
        } finally {
            createRequestLockRef.current = false;
            setActionLoading(false);
        }
    };

    const update = async (id: number, payload: DisbursementPayload): Promise<DisbursementSubmitResult> => {
        setActionLoading(true);
        try {
            await disbursementProvider.updateDisbursement(id, payload);
            toast.success("Voucher updated successfully");
            onSuccess();
            return { success: true };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Update failed";
            toast.error(msg);
            return { success: false, message: msg };
        } finally {
            setActionLoading(false);
        }
    };

    return {
        create,
        update,
        draftsLoading: actionLoading,
    };
}
