import { Lot, CreateLotPayload, UpdateLotPayload, InventoryType, UnitOfMeasure } from "../types";

export async function fetchLots(): Promise<Lot[]> {
    const res = await fetch(`/api/manufacturing/lots?_t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) {
        throw new Error("Failed to fetch lots from BFF");
    }
    return await res.json();
}

export async function createLot(payload: CreateLotPayload): Promise<{ success: boolean; data: Lot }> {
    const res = await fetch("/api/manufacturing/lots", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to create lot via BFF");
    }
    return await res.json();
}

export async function updateLot(
    lotId: number,
    payload: UpdateLotPayload
): Promise<{ success: boolean; data: Lot }> {
    const res = await fetch(`/api/manufacturing/lots/${lotId}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to update lot ${lotId} via BFF`);
    }
    const data = await res.json();
    return { success: true, data };
}

export async function deleteLot(lotId: number): Promise<{ success: boolean }> {
    const res = await fetch(`/api/manufacturing/lots/${lotId}`, {
        method: "DELETE"
    });
    if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to delete lot ${lotId} via BFF`);
    }
    return await res.json();
}

export async function fetchInventoryTypes(): Promise<InventoryType[]> {
    const res = await fetch("/api/manufacturing/lots/inventory-types", { cache: "no-store" });
    if (!res.ok) {
        throw new Error("Failed to fetch inventory types lookup from BFF");
    }
    return await res.json();
}

export async function fetchUoms(): Promise<UnitOfMeasure[]> {
    const res = await fetch("/api/manufacturing/lots/uoms", { cache: "no-store" });
    if (!res.ok) {
        throw new Error("Failed to fetch UOM lookup from BFF");
    }
    return await res.json();
}

