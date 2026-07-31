import { InventoryData, PickingJO, ReceivingJO, ReceivingResult, PickingItem } from "../types/inventory.types";

export async function fetchInventoryData(): Promise<InventoryData> {
    const res = await fetch("/api/manufacturing/inventory");
    if (!res.ok) {
        throw new Error("Failed to load inventory logs from server.");
    }
    return res.json();
}

export async function fetchPickingData(): Promise<PickingJO[]> {
    const res = await fetch("/api/manufacturing/inventory/picking");
    if (!res.ok) {
        throw new Error("Failed to load picking data.");
    }
    return res.json();
}

export async function fetchReceivingData(): Promise<ReceivingJO[]> {
    const res = await fetch("/api/manufacturing/inventory/receiving");
    if (!res.ok) {
        throw new Error("Failed to load receiving job orders.");
    }
    return res.json();
}

export async function postPickingConfirm(payload: {
    joId: string;
    branchId: number;
    items: PickingItem[];
}): Promise<void> {
    const res = await fetch("/api/manufacturing/inventory/picking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        throw new Error(result.error || "Failed to process pick.");
    }
}

export async function postReceivingConfirm(payload: {
    joId: string;
    productId: number;
    quantityProduced: number;
    lotNumber: string;
    expirationDate: string;
    unitCost: number;
}): Promise<ReceivingResult> {
    const res = await fetch("/api/manufacturing/inventory/receiving", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!res.ok || !result.success) {
        throw new Error(result.error || "Failed to receive yield.");
    }
    return result;
}

export async function postStockAdjustment(payload: {
    productId: number;
    branchId: number;
    quantity: number;
    documentType: string;
    documentDescription: string;
    documentDate: string;
}): Promise<void> {
    const res = await fetch("/api/manufacturing/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(result.error || "Failed to submit stock adjustment.");
    }
}
