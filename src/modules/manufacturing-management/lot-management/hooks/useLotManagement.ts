import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
    Lot,
    InventoryType,
    UnitOfMeasure,
    CreateLotPayload,
    UpdateLotPayload
} from "../types";
import {
    fetchLots,
    createLot,
    updateLot,
    deleteLot,
    fetchInventoryTypes,
    fetchUoms
} from "../services/lot-management-api";

export function useLotManagement() {
    const [lots, setLots] = useState<Lot[]>([]);
    const [inventoryTypes, setInventoryTypes] = useState<InventoryType[]>([]);
    const [uoms, setUoms] = useState<UnitOfMeasure[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterType, setFilterType] = useState<number | "all">("all");
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingLot, setEditingLot] = useState<Lot | null>(null);

    const [formData, setFormData] = useState<{
        lotName: string;
        inventoryTypeId: number | "";
        uomId: number | "";
        maxBatchCapacity: string;
    }>({
        lotName: "",
        inventoryTypeId: "",
        uomId: "",
        maxBatchCapacity: ""
    });

    const [formErrors, setFormErrors] = useState<{
        lotName?: boolean;
        inventoryTypeId?: boolean;
        uomId?: boolean;
        maxBatchCapacity?: boolean;
    }>({});

    const loadLots = async () => {
        setLoading(true);
        try {
            const [lotsList, typesList, uomsList] = await Promise.all([
                fetchLots(),
                fetchInventoryTypes(),
                fetchUoms().catch(() => [])
            ]);
            setLots(lotsList);
            setInventoryTypes(typesList);
            setUoms(uomsList);
        } catch (e) {
            console.error("Failed to load lots:", e);
            toast.error("Failed to load lots data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadLots();
    }, []);

    const openCreateDialog = () => {
        setFormData({
            lotName: "",
            inventoryTypeId: "",
            uomId: "",
            maxBatchCapacity: ""
        });
        setFormErrors({});
        setEditingLot(null);
        setIsFormOpen(true);
    };

    const openEditDialog = (lot: Lot) => {
        setFormData({
            lotName: lot.lotName,
            inventoryTypeId: lot.inventoryTypeId,
            uomId: lot.uomId !== null && lot.uomId !== undefined ? lot.uomId : "",
            maxBatchCapacity: String(lot.maxBatchCapacity)
        });
        setFormErrors({});
        setEditingLot(lot);
        setIsFormOpen(true);
    };

    const closeDialog = () => {
        setFormData({
            lotName: "",
            inventoryTypeId: "",
            uomId: "",
            maxBatchCapacity: ""
        });
        setFormErrors({});
        setEditingLot(null);
        setIsFormOpen(false);
    };

    const handleFormChange = (field: string, value: string | number) => {
        if (field === "maxBatchCapacity") {
            const numValue = Number(value);
            if (value !== "" && numValue < 0) return; // Silently reject negative values
        }
        setFormData((prev) => ({
            ...prev,
            [field]: value
        }));
        setFormErrors((prev) => ({
            ...prev,
            [field]: false
        }));
    };

    const isDuplicateLotName = useMemo(() => {
        const trimmed = formData.lotName.trim().toLowerCase();
        if (!trimmed) return false;
        return lots.some(
            (l) =>
                l.lotName.trim().toLowerCase() === trimmed &&
                (!editingLot || l.lotId !== editingLot.lotId)
        );
    }, [formData.lotName, lots, editingLot]);

    const validateForm = (): boolean => {
        const isNameEmpty = !formData.lotName.trim();
        const isTypeEmpty = formData.inventoryTypeId === "";
        const isUomEmpty = !editingLot && formData.uomId === "";
        const capacityNum = Number(formData.maxBatchCapacity);
        const isCapacityInvalid = isNaN(capacityNum) || capacityNum <= 0;

        const newErrors = {
            lotName: isNameEmpty || isDuplicateLotName,
            inventoryTypeId: isTypeEmpty,
            uomId: isUomEmpty,
            maxBatchCapacity: isCapacityInvalid
        };
        setFormErrors(newErrors);

        if (isNameEmpty) {
            toast.error("Lot Name is required");
            return false;
        }
        if (isDuplicateLotName) {
            toast.error(`A lot with the name "${formData.lotName.trim()}" already exists`);
            return false;
        }
        if (isTypeEmpty) {
            toast.error("Inventory Type is required");
            return false;
        }
        if (isUomEmpty) {
            toast.error("Unit of Measure (UOM) is required");
            return false;
        }
        if (isCapacityInvalid) {
            toast.error("Max Capacity must be a positive number greater than 0");
            return false;
        }
        return true;
    };

    const handleCreate = async () => {
        if (!validateForm()) return;
        setSaving(true);
        try {
            const uomNum = formData.uomId !== "" ? Number(formData.uomId) : null;
            const payload: CreateLotPayload = {
                lot_name: formData.lotName.trim(),
                inventory_type_id: Number(formData.inventoryTypeId),
                unit_id: uomNum,
                uom_id: uomNum,
                max_batch_capacity: Number(formData.maxBatchCapacity)
            };
            const result = await createLot(payload);
            if (!result || !result.success) {
                throw new Error("Failed to create lot");
            }
            toast.success("Lot created successfully!");
            closeDialog();
            await loadLots();
        } catch (e) {
            console.error("Failed to create lot:", e);
            toast.error(e instanceof Error ? e.message : "Failed to create lot");
        } finally {
            setSaving(false);
        }
    };

    const handleUpdate = async () => {
        if (!editingLot) return;
        if (!validateForm()) return;
        setSaving(true);
        try {
            const uomNum = formData.uomId !== "" ? Number(formData.uomId) : null;
            const payload: UpdateLotPayload = {
                lot_name: formData.lotName.trim(),
                inventory_type_id: Number(formData.inventoryTypeId),
                unit_id: uomNum,
                uom_id: uomNum,
                max_batch_capacity: Number(formData.maxBatchCapacity)
            };

            const result = await updateLot(editingLot.lotId, payload);
            if (!result || !result.success) {
                throw new Error("Failed to update lot");
            }
            toast.success("Lot updated successfully!");
            closeDialog();
            await loadLots();
        } catch (e) {
            console.error("Failed to update lot:", e);
            toast.error(e instanceof Error ? e.message : "Failed to update lot");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (lotId: number) => {
        setSaving(true);
        try {
            await deleteLot(lotId);
            toast.success("Lot deleted successfully!");
            await loadLots();
        } catch (e) {
            console.error("Failed to delete lot:", e);
            toast.error(e instanceof Error ? e.message : "Failed to delete lot");
        } finally {
            setSaving(false);
        }
    };

    const filteredLots = useMemo(() => {
        const parseUtcTime = (dateStr?: string | null): number => {
            if (!dateStr) return 0;
            try {
                let normalized = dateStr.trim();
                if (!normalized.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(normalized)) {
                    normalized = normalized.replace(" ", "T") + "Z";
                }
                const parsed = new Date(normalized).getTime();
                return isNaN(parsed) ? 0 : parsed;
            } catch {
                return 0;
            }
        };

        const sortedBaseLots = [...lots].sort((a, b) => {
            const timeA = parseUtcTime(a.updatedAt || a.createdAt);
            const timeB = parseUtcTime(b.updatedAt || b.createdAt);
            if (timeB !== timeA) {
                return timeB - timeA;
            }
            return b.lotId - a.lotId;
        });

        return sortedBaseLots
            .filter((lot) => {
                const matchesSearch = lot.lotName
                    .toLowerCase()
                    .includes(searchQuery.toLowerCase());
                const matchesType =
                    filterType === "all" || lot.inventoryTypeId === Number(filterType);
                return matchesSearch && matchesType;
            })
            .map((lot, index) => ({
                ...lot,
                displayNumber: index + 1
            }));
    }, [lots, searchQuery, filterType]);

    return {
        lots,
        inventoryTypes,
        uoms,
        loading,
        saving,
        searchQuery,
        setSearchQuery,
        filterType,
        setFilterType,
        isFormOpen,
        editingLot,
        formData,
        formErrors,
        isDuplicateLotName,
        openCreateDialog,
        openEditDialog,
        closeDialog,
        handleFormChange,
        handleCreate,
        handleUpdate,
        handleDelete,
        filteredLots,
        loadLots
    };
}

