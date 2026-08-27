import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
    Lot,
    UnitOfMeasure,
    Branch,
    CreateLotPayload,
    UpdateLotPayload
} from "../types";
import {
    fetchLots,
    createLot,
    updateLot,
    deleteLot,
    fetchUoms,
    fetchBranches
} from "../services/lot-management-api";

export function useLotManagement() {
    const [lots, setLots] = useState<Lot[]>([]);
    const [uoms, setUoms] = useState<UnitOfMeasure[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingLot, setEditingLot] = useState<Lot | null>(null);

    const [formData, setFormData] = useState<{
        lotName: string;
        branchId: number | "";
        uomId: number | "";
        maxBatchCapacity: string;
    }>({
        lotName: "",
        branchId: "",
        uomId: "",
        maxBatchCapacity: ""
    });

    const [formErrors, setFormErrors] = useState<{
        lotName?: boolean;
        branchId?: boolean;
        uomId?: boolean;
        maxBatchCapacity?: boolean;
    }>({});

    const loadLots = async () => {
        setLoading(true);
        try {
            const [lotsList, uomsList, branchesList] = await Promise.all([
                fetchLots(),
                fetchUoms().catch(() => []),
                fetchBranches().catch(() => [])
            ]);
            setLots(lotsList);
            setUoms(uomsList);
            setBranches(branchesList);
        } catch (e) {
            console.error("Failed to load lots:", e);
            toast.error("Failed to load lots data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let isMounted = true;
        Promise.all([
            fetchLots(),
            fetchUoms().catch(() => []),
            fetchBranches().catch(() => [])
        ])
            .then(([lotsList, uomsList, branchesList]) => {
                if (isMounted) {
                    setLots(lotsList);
                    setUoms(uomsList);
                    setBranches(branchesList);
                    setLoading(false);
                }
            })
            .catch((e) => {
                if (isMounted) {
                    console.error("Failed to load lots:", e);
                    toast.error("Failed to load lots data");
                    setLoading(false);
                }
            });
        return () => {
            isMounted = false;
        };
    }, []);

    const openCreateDialog = () => {
        const defaultBranchId = branches.length > 0 ? branches[0].id : "";
        setFormData({
            lotName: "",
            branchId: defaultBranchId,
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
            branchId: lot.branchId || (branches.length > 0 ? branches[0].id : ""),
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
            branchId: "",
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
            if (value !== "" && numValue < 0) return;
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
        const isBranchEmpty = formData.branchId === "";
        const isUomEmpty = !editingLot && formData.uomId === "";
        const capacityNum = Number(formData.maxBatchCapacity);
        const isCapacityInvalid = isNaN(capacityNum) || capacityNum <= 0;

        const newErrors = {
            lotName: isNameEmpty || isDuplicateLotName,
            branchId: isBranchEmpty,
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
        if (isBranchEmpty) {
            toast.error("Branch selection is required");
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
                branch_id: Number(formData.branchId),
                unit_id: uomNum || 1,
                uom_id: uomNum || 1,
                max_batch_capacity: Number(formData.maxBatchCapacity),
                status: "ACTIVE"
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
                branch_id: Number(formData.branchId),
                unit_id: uomNum || 1,
                uom_id: uomNum || 1,
                max_batch_capacity: Number(formData.maxBatchCapacity),
                status: editingLot.status || "ACTIVE"
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
                return matchesSearch;
            })
            .map((lot, index) => ({
                ...lot,
                displayNumber: index + 1
            }));
    }, [lots, searchQuery]);

    return {
        lots,
        uoms,
        branches,
        loading,
        saving,
        searchQuery,
        setSearchQuery,
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
