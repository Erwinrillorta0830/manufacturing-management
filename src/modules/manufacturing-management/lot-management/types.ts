// ─── Directus Response Types (snake_case at Directus boundary) ───────

export interface DirectusLot {
    lot_id: number;
    lot_name: string;
    inventory_type_id: number | { id: number; name: string } | null;
    unit_id?: number | { unit_id: number; unit_name: string; unit_shortcut?: string } | null;
    uom_id?: number | { unit_id: number; unit_name: string; unit_shortcut?: string } | null;
    max_batch_capacity: number;
    created_at: string;
    updated_at: string;
    created_by: number | { user_id: number; username: string } | null;
    updated_by: number | { user_id: number; username: string } | null;
}

export interface DirectusInventoryType {
    id: number;
    name: string;
}

export interface DirectusUnit {
    unit_id: number;
    unit_name: string;
    unit_shortcut?: string | null;
    order?: number | null;
    sku_code?: string | null;
}

// ─── Frontend Types (camelCase) ──────────────────────────────────────

export interface Lot {
    lotId: number;
    lotName: string;
    inventoryTypeId: number;
    inventoryTypeName: string;
    uomId: number | null;
    uomName: string;
    uomShortcut: string;
    maxBatchCapacity: number;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    updatedBy: string;
    displayNumber?: number;
}

export interface InventoryType {
    inventoryTypeId: number;
    typeName: string;
}

export interface UnitOfMeasure {
    unitId: number;
    unitName: string;
    unitShortcut: string;
    order?: number | null;
    skuCode?: string | null;
}

export interface CreateLotPayload {
    lot_name: string;
    inventory_type_id: number;
    unit_id?: number | null;
    uom_id?: number | null;
    max_batch_capacity: number;
}

export interface UpdateLotPayload {
    lot_name?: string;
    inventory_type_id?: number;
    unit_id?: number | null;
    uom_id?: number | null;
    max_batch_capacity?: number;
}

