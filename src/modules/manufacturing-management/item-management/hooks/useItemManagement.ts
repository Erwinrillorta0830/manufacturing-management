import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import {
    CatalogItem,
    ItemType,
    ItemClassification
} from "../types";
import {
    fetchItems,
    fetchItemTypes,
    fetchItemClassifications,
    createItem as apiCreateItem,
    createItemType as apiCreateItemType,
    createItemClassification as apiCreateItemClassification,
    updateItem as apiUpdateItem,
    updateItemType as apiUpdateItemType,
    updateItemClassification as apiUpdateItemClassification
} from "../services/item-management-api";

export function useItemManagement() {
    const [items, setItems] = useState<CatalogItem[]>([]);
    const [itemTypes, setItemTypes] = useState<ItemType[]>([]);
    const [itemClassifications, setItemClassifications] = useState<ItemClassification[]>([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    const loadAllData = useCallback(async () => {
        setLoading(true);
        try {
            const [itemsList, typesList, classificationsList] = await Promise.all([
                fetchItems().catch(() => []),
                fetchItemTypes().catch(() => []),
                fetchItemClassifications().catch(() => [])
            ]);

            // Assume Directus returns elements chronologically or sorted. 
            // We sort them by ID ascending first to make sure index 0 is truly the oldest.
            const sortedItems = [...itemsList].sort((a, b) => a.id - b.id);
            const sortedTypes = [...typesList].sort((a, b) => a.id - b.id);
            const sortedClassifications = [...classificationsList].sort((a, b) => a.id - b.id);

            setItems(sortedItems);
            setItemTypes(sortedTypes);
            setItemClassifications(sortedClassifications);
        } catch (err) {
            console.error("Failed to load item management data:", err);
            toast.error("Failed to load catalog data");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        queueMicrotask(() => {
            loadAllData();
        });
    }, [loadAllData]);

    // Handle registrations
    const handleRegisterItem = async (name: string, typeId: number, classId: number): Promise<boolean> => {
        const trimmed = name.trim();
        if (!trimmed) {
            toast.error("Item name is required.");
            return false;
        }
        if (!typeId) {
            toast.error("Item type is required.");
            return false;
        }
        if (!classId) {
            toast.error("Item classification is required.");
            return false;
        }

        // Duplicate check (Client-side)
        const isDuplicate = items.some(
            (item) => item.item_name?.trim().toLowerCase() === trimmed.toLowerCase()
        );
        if (isDuplicate) {
            toast.error("Item name already exists. Please choose a unique name.");
            return false;
        }

        setSaving(true);
        try {
            const res = await apiCreateItem({
                item_name: trimmed,
                item_type: typeId,
                item_classification: classId
            });
            if (res.success && res.item) {
                toast.success(`Successfully registered item "${trimmed}"!`);
                await loadAllData();
                return true;
            }
            return false;
        } catch (err) {
            console.error("Failed to register item:", err);
            const message = err instanceof Error ? err.message : "Failed to register item";
            toast.error(message);
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleRegisterItemType = async (name: string): Promise<boolean> => {
        const trimmed = name.trim();
        if (!trimmed) {
            toast.error("Item type name is required.");
            return false;
        }

        const isDuplicate = itemTypes.some(
            (t) => t.type_name?.trim().toLowerCase() === trimmed.toLowerCase()
        );
        if (isDuplicate) {
            toast.error("Item type name already exists. Please choose a unique name.");
            return false;
        }

        setSaving(true);
        try {
            const res = await apiCreateItemType({ name: trimmed });
            if (res.success && res.type) {
                toast.success(`Successfully registered item type "${trimmed}"!`);
                await loadAllData();
                return true;
            }
            return false;
        } catch (err) {
            console.error("Failed to register item type:", err);
            const message = err instanceof Error ? err.message : "Failed to register item type";
            toast.error(message);
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleRegisterItemClassification = async (name: string): Promise<boolean> => {
        const trimmed = name.trim();
        if (!trimmed) {
            toast.error("Item classification name is required.");
            return false;
        }

        const isDuplicate = itemClassifications.some(
            (c) => c.classification_name?.trim().toLowerCase() === trimmed.toLowerCase()
        );
        if (isDuplicate) {
            toast.error("Item classification name already exists. Please choose a unique name.");
            return false;
        }

        setSaving(true);
        try {
            const res = await apiCreateItemClassification({ name: trimmed });
            if (res.success && res.classification) {
                toast.success(`Successfully registered item classification "${trimmed}"!`);
                await loadAllData();
                return true;
            }

            return false;
        } catch (err) {
            console.error("Failed to register item classification:", err);
            const message = err instanceof Error ? err.message : "Failed to register item classification";
            toast.error(message);
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateItem = async (id: number, name: string, typeId: number, classId: number): Promise<boolean> => {
        const trimmed = name.trim();
        if (!trimmed) {
            toast.error("Item name is required.");
            return false;
        }
        if (!typeId) {
            toast.error("Item type is required.");
            return false;
        }
        if (!classId) {
            toast.error("Item classification is required.");
            return false;
        }

        const isDuplicate = items.some(
            (item) => item.id !== id && item.item_name?.trim().toLowerCase() === trimmed.toLowerCase()
        );
        if (isDuplicate) {
            toast.error("Item name already exists. Please choose a unique name.");
            return false;
        }

        setSaving(true);
        try {
            const res = await apiUpdateItem(id, {
                item_name: trimmed,
                item_type: typeId,
                item_classification: classId
            });
            if (res.success && res.item) {
                toast.success(`Successfully updated item "${trimmed}"!`);
                await loadAllData();
                return true;
            }
            return false;
        } catch (err) {
            console.error("Failed to update item:", err);
            const message = err instanceof Error ? err.message : "Failed to update item";
            toast.error(message);
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateItemType = async (id: number, name: string): Promise<boolean> => {
        const trimmed = name.trim();
        if (!trimmed) {
            toast.error("Item type name is required.");
            return false;
        }

        const isDuplicate = itemTypes.some(
            (t) => t.id !== id && t.type_name?.trim().toLowerCase() === trimmed.toLowerCase()
        );
        if (isDuplicate) {
            toast.error("Item type name already exists. Please choose a unique name.");
            return false;
        }

        setSaving(true);
        try {
            const res = await apiUpdateItemType(id, { name: trimmed });
            if (res.success && res.type) {
                toast.success(`Successfully updated item type "${trimmed}"!`);
                await loadAllData();
                return true;
            }
            return false;
        } catch (err) {
            console.error("Failed to update item type:", err);
            const message = err instanceof Error ? err.message : "Failed to update item type";
            toast.error(message);
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateItemClassification = async (id: number, name: string): Promise<boolean> => {
        const trimmed = name.trim();
        if (!trimmed) {
            toast.error("Item classification name is required.");
            return false;
        }

        const isDuplicate = itemClassifications.some(
            (c) => c.id !== id && c.classification_name?.trim().toLowerCase() === trimmed.toLowerCase()
        );
        if (isDuplicate) {
            toast.error("Item classification name already exists. Please choose a unique name.");
            return false;
        }

        setSaving(true);
        try {
            const res = await apiUpdateItemClassification(id, { name: trimmed });
            if (res.success && res.classification) {
                toast.success(`Successfully updated item classification "${trimmed}"!`);
                await loadAllData();
                return true;
            }
            return false;
        } catch (err) {
            console.error("Failed to update item classification:", err);
            const message = err instanceof Error ? err.message : "Failed to update item classification";
            toast.error(message);
            return false;
        } finally {
            setSaving(false);
        }
    };

    // Filtered Lists (Sorted descending: newest first, with stable display numbering)
    const filteredItems = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        const chronologicalItems = [...items].sort((a, b) => a.id - b.id);
        return items
            .filter((item) => item.item_name?.toLowerCase().includes(query))
            .sort((a, b) => b.id - a.id)
            .map((item) => {
                const originalIndex = chronologicalItems.findIndex((i) => i.id === item.id);
                // 1 being oldest, highest being latest
                const displayNumber = originalIndex !== -1 ? originalIndex + 1 : 0;
                return { ...item, displayNumber };
            });
    }, [items, searchQuery]);

    const filteredItemTypes = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        const chronologicalTypes = [...itemTypes].sort((a, b) => a.id - b.id);
        return itemTypes
            .filter((t) => t.type_name?.toLowerCase().includes(query))
            .sort((a, b) => b.id - a.id)
            .map((t) => {
                const originalIndex = chronologicalTypes.findIndex((i) => i.id === t.id);
                const displayNumber = originalIndex !== -1 ? originalIndex + 1 : 0;
                return { ...t, displayNumber };
            });
    }, [itemTypes, searchQuery]);

    const filteredItemClassifications = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        const chronologicalClassifications = [...itemClassifications].sort((a, b) => a.id - b.id);
        return itemClassifications
            .filter((c) => c.classification_name?.toLowerCase().includes(query))
            .sort((a, b) => b.id - a.id)
            .map((c) => {
                const originalIndex = chronologicalClassifications.findIndex((i) => i.id === c.id);
                const displayNumber = originalIndex !== -1 ? originalIndex + 1 : 0;
                return { ...c, displayNumber };
            });
    }, [itemClassifications, searchQuery]);

    return {
        items,
        itemTypes,
        itemClassifications,
        filteredItems,
        filteredItemTypes,
        filteredItemClassifications,
        loading,
        saving,
        searchQuery,
        setSearchQuery,
        refresh: loadAllData,
        handleRegisterItem,
        handleRegisterItemType,
        handleRegisterItemClassification,
        handleUpdateItem,
        handleUpdateItemType,
        handleUpdateItemClassification
    };
}
