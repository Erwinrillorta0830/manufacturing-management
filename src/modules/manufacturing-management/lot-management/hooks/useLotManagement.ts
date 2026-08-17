import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
    Lot,
    InventoryType,
    CreateLotPayload,
    UpdateLotPayload
} from "../types";
import {
    fetchLots,
    createLot,
    updateLot,
    deleteLot,
    fetchInventoryTypes
} from "../services/lot-management-api";

export function useLotManagement() {
    const [lots, setLots] = useState<Lot[]>([]);
    const [inventoryTypes, setInventoryTypes] = useState<InventoryType[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterType, setFilterType] = useState<number | "all">("all");
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingLot, setEditingLot] = useState<Lot | null>(null);

    const [formData, setFormData] = useState<{
        lotName: string;
        inventoryTypeId: number | "";
        maxBatchCapacity: string;
    }>({
        lotName: "",
        inventoryTypeId: "",
        maxBatchCapacity: ""
    });

    const [formErrors, setFormErrors] = useState<{
        lotName?: boolean;
        inventoryTypeId?: boolean;
        maxBatchCapacity?: boolean;
    }>({});

    const loadLots = async () => {
        setLoading(true);
        try {
            const [lotsList, typesList] = await Promise.all([
                fetchLots(),
                fetchInventoryTypes()
            ]);
            setLots(lotsList);
            setInventoryTypes(typesList);
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
        const capacityNum = Number(formData.maxBatchCapacity);
        const isCapacityInvalid = isNaN(capacityNum) || capacityNum <= 0;

        const newErrors = {
            lotName: isNameEmpty || isDuplicateLotName,
            inventoryTypeId: isTypeEmpty,
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
            const payload: CreateLotPayload = {
                lot_name: formData.lotName.trim(),
                inventory_type_id: Number(formData.inventoryTypeId),
                max_batch_capacity: Number(formData.maxBatchCapacity)
            };
            await createLot(payload);
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
            const payload: UpdateLotPayload = {
                lot_name: formData.lotName.trim(),
                inventory_type_id: Number(formData.inventoryTypeId),
                max_batch_capacity: Number(formData.maxBatchCapacity)
            };
            await updateLot(editingLot.lotId, payload);
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
        const sortedBaseLots = [...lots].sort((a, b) => a.lotId - b.lotId);

        return sortedBaseLots
            .filter((lot) => {
                const matchesSearch = lot.lotName
                    .toLowerCase()
                    .includes(searchQuery.toLowerCase());
                const matchesType =
                    filterType === "all" || lot.inventoryTypeId === Number(filterType);
                return matchesSearch && matchesType;
            })
            .map((lot) => {
                const originalIndex = sortedBaseLots.findIndex((l) => l.lotId === lot.lotId);
                const displayNumber = originalIndex !== -1 ? originalIndex + 1 : 0;
                return {
                    ...lot,
                    displayNumber
                };
            });
    }, [lots, searchQuery, filterType]);

    return {
        lots,
        inventoryTypes,
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
