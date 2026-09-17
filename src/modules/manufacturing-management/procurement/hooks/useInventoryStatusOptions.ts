"use client";

import { useEffect, useState } from "react";
import {
    PAYMENT_STATUS,
    inventoryStatusToPurchaseOrderStatus,
    isInventoryStatusId
} from "@/app/api/manufacturing/procurement/_domain";
import { INVENTORY_STATUS_FILTER_OPTIONS } from "../components/incoming-shipments/ShipmentBadges";

export interface InventoryStatusOption {
    value: string;
    label: string;
}

interface TransactionStatusRow {
    id?: number | string | null;
    status?: string | null;
}

const ALL_OPTION: InventoryStatusOption = { value: "", label: "All Inventory Statuses" };

function buildOptions(rows: TransactionStatusRow[]): InventoryStatusOption[] {
    const seen = new Set<number>();
    const options: InventoryStatusOption[] = [];
    rows.forEach((row) => {
        const id = Number(row.id);
        if (!Number.isSafeInteger(id) || !isInventoryStatusId(id) || seen.has(id)) return;
        seen.add(id);
        options.push({
            value: String(id),
            label: inventoryStatusToPurchaseOrderStatus(id, PAYMENT_STATUS.PENDING)
        });
    });
    return options;
}

export function useInventoryStatusOptions(): InventoryStatusOption[] {
    const [options, setOptions] = useState<InventoryStatusOption[]>(INVENTORY_STATUS_FILTER_OPTIONS);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const response = await fetch("/api/manufacturing/procurement/inventory-statuses", { cache: "no-store" });
                if (!response.ok) throw new Error(`Inventory status lookup failed with HTTP ${response.status}.`);
                const rows = await response.json().catch(() => null);
                if (!Array.isArray(rows)) throw new Error("Inventory status lookup returned an invalid collection.");
                const mapped = buildOptions(rows);
                if (!cancelled && mapped.length > 0) {
                    setOptions([ALL_OPTION, ...mapped]);
                }
            } catch (error) {
                console.warn("Unable to load inventory status options; using the built-in list.", error);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, []);

    return options;
}
