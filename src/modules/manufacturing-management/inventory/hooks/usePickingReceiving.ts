import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PickingJO, ReceivingJO, ReceivingResult, PickingItem } from "../types/inventory.types";
import {
    fetchPickingData,
    fetchReceivingData,
    postPickingConfirm,
    postReceivingConfirm
} from "../services/inventory.service";

export function usePickingReceiving(activeTab: string, onDataRefresh: () => void) {
    const [pickingList, setPickingList] = useState<PickingJO[]>([]);
    const [receivingJOs, setReceivingJOs] = useState<ReceivingJO[]>([]);
    const [pickingLoading, setPickingLoading] = useState(false);
    const [receivingLoading, setReceivingLoading] = useState(false);

    const [isPickingModalOpen, setIsPickingModalOpen] = useState(false);
    const [isReceivingModalOpen, setIsReceivingModalOpen] = useState(false);
    const [selectedPickingJO, setSelectedPickingJO] = useState<PickingJO | null>(null);
    const [selectedReceivingJO, setSelectedReceivingJO] = useState<ReceivingJO | null>(null);

    const [pickingSubmitting, setPickingSubmitting] = useState(false);

    // Receiving form state
    const [recQtyProduced, setRecQtyProduced] = useState("");
    const [recLotNumber, setRecLotNumber] = useState("");
    const [recExpirationDate, setRecExpirationDate] = useState("");
    const [recUnitCost, setRecUnitCost] = useState("");
    const [recSubmitting, setRecSubmitting] = useState(false);

    // Yield Allocation & Cost Variance output state
    const [receivingResult, setReceivingResult] = useState<ReceivingResult | null>(null);
    const [showReceivingResult, setShowReceivingResult] = useState(false);

    const loadPicking = async () => {
        setPickingLoading(true);
        try {
            const data = await fetchPickingData();
            setPickingList(data);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Failed to load picking lists.";
            toast.error(msg);
        } finally {
            setPickingLoading(false);
        }
    };

    const loadReceiving = async () => {
        setReceivingLoading(true);
        try {
            const data = await fetchReceivingData();
            setReceivingJOs(data);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Failed to load receiving job orders.";
            toast.error(msg);
        } finally {
            setReceivingLoading(false);
        }
    };

    useEffect(() => {
        queueMicrotask(() => {
            if (activeTab === "picking") {
                loadPicking();
            } else if (activeTab === "receiving") {
                loadReceiving();
            }
        });
    }, [activeTab]);

    const handleConfirmPick = async (jo: PickingJO) => {
        if (!jo || !jo.allocationResults || jo.allocationResults.length === 0) {
            toast.error("No FIFO allocation results found for this Job Order. Schedulers must run the allocation check first.");
            return;
        }

        const itemsToPick: PickingItem[] = [];
        jo.allocationResults.forEach((alloc) => {
            const productId = alloc.component_product_id;
            if (alloc.batches && Array.isArray(alloc.batches)) {
                alloc.batches.forEach((b) => {
                    itemsToPick.push({
                        productId,
                        lotNumber: b.lot_number,
                        quantity: b.quantity
                    });
                });
            }
        });

        if (itemsToPick.length === 0) {
            toast.warning("No materials are allocated to pick for this Job Order.");
            return;
        }

        if (!jo.branch_id) {
            toast.error("Error: Job Order is missing branch_id allocation.");
            return;
        }

        setPickingSubmitting(true);
        try {
            await postPickingConfirm({
                joId: jo.jo_id,
                branchId: Number(jo.branch_id),
                items: itemsToPick
            });

            toast.success(`Successfully picked and transferred stock to WIP for ${jo.jo_id}!`);
            setIsPickingModalOpen(false);
            loadPicking();
            onDataRefresh();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "An error occurred during picking.";
            toast.error(msg);
        } finally {
            setPickingSubmitting(false);
        }
    };

    const handleConfirmReceiving = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedReceivingJO) return;

        const qty = parseFloat(recQtyProduced);
        if (isNaN(qty) || qty <= 0) {
            toast.warning("Please enter a valid yield quantity.");
            return;
        }

        setRecSubmitting(true);
        try {
            const result = await postReceivingConfirm({
                joId: selectedReceivingJO.jo_id,
                productId: selectedReceivingJO.product_id,
                quantityProduced: qty,
                lotNumber: recLotNumber,
                expirationDate: recExpirationDate,
                unitCost: parseFloat(recUnitCost) || 0
            });

            toast.success(`Yield received and Job Order ${selectedReceivingJO.jo_id} closed successfully!`);
            setReceivingResult(result);
            setShowReceivingResult(true);
            setIsReceivingModalOpen(false);
            loadReceiving();
            onDataRefresh();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "An error occurred during yield receiving.";
            toast.error(msg);
        } finally {
            setRecSubmitting(false);
        }
    };

    return {
        pickingList,
        receivingJOs,
        pickingLoading,
        receivingLoading,
        isPickingModalOpen,
        setIsPickingModalOpen,
        isReceivingModalOpen,
        setIsReceivingModalOpen,
        selectedPickingJO,
        setSelectedPickingJO,
        selectedReceivingJO,
        setSelectedReceivingJO,
        pickingSubmitting,
        recQtyProduced,
        setRecQtyProduced,
        recLotNumber,
        setRecLotNumber,
        recExpirationDate,
        setRecExpirationDate,
        recUnitCost,
        setRecUnitCost,
        recSubmitting,
        receivingResult,
        setReceivingResult,
        showReceivingResult,
        setShowReceivingResult,
        handleConfirmPick,
        handleConfirmReceiving,
        loadPicking,
        loadReceiving
    };
}
