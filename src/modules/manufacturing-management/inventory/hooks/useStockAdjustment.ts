import { useState } from "react";
import { toast } from "sonner";
import { postStockAdjustment } from "../services/inventory.service";

export function useStockAdjustment(onSuccess: () => void) {
    const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
    const [adjProductId, setAdjProductId] = useState("");
    const [adjBranchId, setAdjBranchId] = useState("1");
    const [adjQty, setAdjQty] = useState("");
    const [adjType, setAdjType] = useState("Stock Take Reconciliation");
    const [adjRemarks, setAdjRemarks] = useState("");
    const [adjDate, setAdjDate] = useState(new Date().toISOString().split("T")[0]);
    const [submittingAdj, setSubmittingAdj] = useState(false);

    const handlePostAdjustment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!adjProductId || !adjQty) {
            toast.warning("Please select a product and input quantity.");
            return;
        }

        const qty = parseFloat(adjQty);
        if (isNaN(qty) || qty === 0) {
            toast.warning("Please enter a valid non-zero quantity.");
            return;
        }

        setSubmittingAdj(true);
        try {
            await postStockAdjustment({
                productId: Number(adjProductId),
                branchId: Number(adjBranchId),
                quantity: qty,
                documentType: adjType,
                documentDescription: adjRemarks,
                documentDate: adjDate
            });

            toast.success("Stock adjustment successfully posted!");
            setIsAdjustmentModalOpen(false);
            setAdjProductId("");
            setAdjQty("");
            setAdjRemarks("");
            onSuccess();
        } catch (err: any) {
            toast.error(err.message || "An error occurred.");
        } finally {
            setSubmittingAdj(false);
        }
    };

    return {
        isAdjustmentModalOpen,
        setIsAdjustmentModalOpen,
        adjProductId,
        setAdjProductId,
        adjBranchId,
        setAdjBranchId,
        adjQty,
        setAdjQty,
        adjType,
        setAdjType,
        adjRemarks,
        setAdjRemarks,
        adjDate,
        setAdjDate,
        submittingAdj,
        handlePostAdjustment
    };
}
