"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Plus, Settings } from "lucide-react";
import { toast } from "sonner";
import { AssetRecord, DepartmentRecord } from "@/modules/manufacturing-management/finished-goods/types";
import {
    fetchAssets,
    createAsset,
    saveAsset,
    fetchDepartments,
    fetchItems,
    createItem,
    fetchItemTypes,
    fetchItemClassifications,
    createItemType,
    createItemClassification
} from "@/modules/manufacturing-management/finished-goods/services/finished-goods-api";
import { Button } from "@/components/ui/button";
import { AssetListTable } from "./components/AssetListTable";
import { MaintenanceWorkOrderModal } from "./components/MaintenanceWorkOrderModal";
import { AssetDowntimeLogger } from "./components/AssetDowntimeLogger";

export interface CatalogItem {
    id: number;
    item_name: string;
    item_code?: string;
}

export interface ItemType {
    id: number;
    type_name: string;
}

export interface ItemClassification {
    id: number;
    classification_name: string;
}

export default function AssetsModule() {
    const [assets, setAssets] = useState<AssetRecord[]>([]);
    const [items, setItems] = useState<CatalogItem[]>([]);
    const [departments, setDepartments] = useState<DepartmentRecord[]>([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [conditionFilter, setConditionFilter] = useState("ALL");
    const [statusFilter, setStatusFilter] = useState("ALL");

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAsset, setEditingAsset] = useState<AssetRecord | null>(null);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [viewingAsset, setViewingAsset] = useState<AssetRecord | null>(null);

    // Form inputs
    const [itemImage, setItemImage] = useState("");
    const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
    const [rfidCode, setRfidCode] = useState("");
    const [barcode, setBarcode] = useState("");
    const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
    const [costPerItem, setCostPerItem] = useState("0");
    const [condition, setCondition] = useState<AssetRecord["condition"]>("Good");
    const [lifeSpan, setLifeSpan] = useState("");
    const [isActiveWarning, setIsActiveWarning] = useState(false);
    const [isActive, setIsActive] = useState(true);
    const [dateAcquired, setDateAcquired] = useState("");

    // Searchable dropdown state in modal
    const [itemSearch, setItemSearch] = useState("");
    const [isItemDropdownOpen, setIsItemDropdownOpen] = useState(false);
    const [validationAttempted, setValidationAttempted] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [isTransitioning, setIsTransitioning] = useState(false);

    // Sub-modal state for registering new item
    const [isNewItemModalOpen, setIsNewItemModalOpen] = useState(false);
    const [newItemName, setNewItemName] = useState("");
    const [selectedItemTypeId, setSelectedItemTypeId] = useState("");
    const [selectedItemClassId, setSelectedItemClassId] = useState("");
    const [itemTypes, setItemTypes] = useState<ItemType[]>([]);
    const [itemClassifications, setItemClassifications] = useState<ItemClassification[]>([]);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [imageFilename, setImageFilename] = useState("");

    const loadData = async () => {
        setLoading(true);
        try {
            const [assetList, itemList, deptList, typesList, classList] = await Promise.all([
                fetchAssets(),
                fetchItems().catch(() => []),
                fetchDepartments().catch(() => []),
                fetchItemTypes().catch(() => []),
                fetchItemClassifications().catch(() => [])
            ]);
            setAssets(assetList.sort((a, b) => b.id - a.id));
            setItems(itemList);
            setDepartments(deptList);
            setItemTypes(typesList);
            setItemClassifications(classList);
        } catch (e) {
            console.error("Failed to load assets data:", e);
            toast.error("Failed to load assets data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // Filtered Assets list
    const filteredAssets = useMemo(() => {
        return assets.filter(asset => {
            if (conditionFilter !== "ALL") {
                if (asset.condition !== conditionFilter) return false;
            }

            if (statusFilter !== "ALL") {
                const isActive = Boolean(asset.is_active);
                if (statusFilter === "ACTIVE" && !isActive) return false;
                if (statusFilter === "INACTIVE" && isActive) return false;
            }

            const query = searchQuery.toLowerCase();

            let itemName = "";
            if (asset.item_id && typeof asset.item_id === "object") {
                itemName = (asset.item_id as unknown as CatalogItem).item_name || "";
            } else {
                const found = items.find(i => i.id === asset.item_id);
                itemName = found ? found.item_name : "";
            }

            let deptName = "";
            if (asset.department && typeof asset.department === "object") {
                deptName = (asset.department as unknown as DepartmentRecord).department_name || "";
            } else {
                const found = departments.find(d => d.department_id === asset.department);
                deptName = found ? found.department_name : "";
            }

            const matchesName = itemName.toLowerCase().includes(query);
            const matchesBarcode = (asset.barcode || "").toLowerCase().includes(query);
            const matchesRfid = (asset.rfid_code || "").toLowerCase().includes(query);
            const matchesCond = (asset.condition || "").toLowerCase().includes(query);
            const matchesDept = deptName.toLowerCase().includes(query);

            return matchesName || matchesBarcode || matchesRfid || matchesCond || matchesDept;
        });
    }, [assets, searchQuery, items, departments, conditionFilter, statusFilter]);

    useEffect(() => {
        setCurrentPage(1);
    }, [filteredAssets.length, pageSize]);

    const totalPages = Math.ceil(filteredAssets.length / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const paginatedAssets = useMemo(() => {
        return filteredAssets.slice(startIndex, startIndex + pageSize);
    }, [filteredAssets, startIndex, pageSize]);

    const handleOpenCreateModal = () => {
        setEditingAsset(null);
        setItemImage("");
        setImageFilename("");
        setSelectedItemId(null);
        setRfidCode("");
        setBarcode("");
        setSelectedDeptId(null);
        setCostPerItem("0");
        setCondition("Good");
        setLifeSpan("");
        setIsActiveWarning(false);
        setIsActive(true);
        setDateAcquired(new Date().toISOString().substring(0, 10));

        setItemSearch("");
        setValidationAttempted(false);
        setIsTransitioning(false);
        setIsModalOpen(true);
    };

    const handleOpenViewModal = (asset: AssetRecord) => {
        setViewingAsset(asset);
        setIsViewModalOpen(true);
    };

    const handleCloseItemDropdown = () => {
        setIsItemDropdownOpen(false);
        const matchedItem = items.find(i => i.id === selectedItemId);
        setItemSearch(matchedItem ? matchedItem.item_name : "");
    };

    const handleOpenEditModal = (asset: AssetRecord, isFromView = false) => {
        setEditingAsset(asset);
        setItemImage(asset.item_image || "");
        setImageFilename("");

        const itemId = asset.item_id && typeof asset.item_id === "object" ? (asset.item_id as unknown as CatalogItem).id : (typeof asset.item_id === 'number' ? asset.item_id : null);
        setSelectedItemId(itemId);

        setRfidCode(asset.rfid_code || "");
        setBarcode(asset.barcode || "");

        const deptId = asset.department && typeof asset.department === "object" ? (asset.department as unknown as DepartmentRecord).department_id : (typeof asset.department === 'number' ? asset.department : null);
        setSelectedDeptId(deptId);

        setCostPerItem(asset.cost_per_item !== null && asset.cost_per_item !== undefined ? String(asset.cost_per_item) : (asset.total !== null && asset.total !== undefined ? String(asset.total) : "0"));
        setCondition(asset.condition || "Good");
        setLifeSpan(asset.life_span !== null && asset.life_span !== undefined ? String(asset.life_span) : "");
        setIsActiveWarning(Boolean(asset.is_active_warning));
        setIsActive(Boolean(asset.is_active));

        if (asset.date_acquired) {
            setDateAcquired(asset.date_acquired.substring(0, 10));
        } else {
            setDateAcquired("");
        }

        const matchedItem = items.find(i => i.id === itemId);
        setItemSearch(matchedItem ? matchedItem.item_name : "");

        setValidationAttempted(false);
        setIsTransitioning(isFromView);
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setValidationAttempted(true);
        if (!selectedItemId) {
            toast.error("Please select an inventory item.");
            return;
        }
        if (!costPerItem || Number(costPerItem) < 0) {
            toast.error("Total Cost cannot be negative.");
            return;
        }

        const trimmedRfid = rfidCode.trim();
        const trimmedBarcode = barcode.trim();

        if (trimmedRfid) {
            const isDuplicateRfid = assets.some(a =>
                a.id !== editingAsset?.id &&
                (a.rfid_code || "").trim().toLowerCase() === trimmedRfid.toLowerCase()
            );
            if (isDuplicateRfid) {
                toast.warning("RFID Code already exists in the database.");
                return;
            }
        }

        if (trimmedBarcode) {
            const isDuplicateBarcode = assets.some(a =>
                a.id !== editingAsset?.id &&
                (a.barcode || "").trim().toLowerCase() === trimmedBarcode.toLowerCase()
            );
            if (isDuplicateBarcode) {
                toast.warning("Barcode already exists in the database.");
                return;
            }
        }

        setSaving(true);
        try {
            const totalVal = parseFloat(costPerItem) || 0;
            const payload = {
                item_image: itemImage.trim() || null,
                item_id: selectedItemId,
                quantity: 1,
                rfid_code: trimmedRfid || null,
                barcode: trimmedBarcode || null,
                serial: null,
                department: selectedDeptId,
                cost_per_item: totalVal,
                total: totalVal,
                condition: condition || "Good",
                life_span: lifeSpan.trim() ? parseInt(lifeSpan) : null,
                is_active_warning: isActiveWarning,
                is_active: isActive,
                date_acquired: dateAcquired || null
            };

            let success = false;
            if (editingAsset) {
                const res = await saveAsset(editingAsset.id, payload);
                success = res.success;
            } else {
                const res = await createAsset(payload);
                success = res.success;
            }

            if (success) {
                toast.success(editingAsset ? "Asset updated successfully!" : "Asset registered successfully!");
                setIsModalOpen(false);
                await loadData();
            }
        } catch (e) {
            console.error("Failed to save asset:", e);
            const error = e instanceof Error ? e : new Error(String(e));
            toast.error(error.message || "Failed to save asset");
        } finally {
            setSaving(false);
        }
    };

    const handleOpenNewItemSubModal = () => {
        setNewItemName("");
        setSelectedItemTypeId("");
        setSelectedItemClassId("");
        setIsItemDropdownOpen(false);
        setIsNewItemModalOpen(true);
    };

    const handleCreateItemSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedItemName = newItemName.trim();
        if (!trimmedItemName) {
            toast.error("Item name is required.");
            return;
        }

        if (!selectedItemTypeId) {
            toast.error("Item Type is required.");
            return;
        }

        if (!selectedItemClassId) {
            toast.error("Item Classification is required.");
            return;
        }

        const isDuplicateItem = items.some(item =>
            item.item_name?.trim().toLowerCase() === trimmedItemName.toLowerCase()
        );

        if (isDuplicateItem) {
            toast.error("Item name already exists. Please choose a unique name.");
            return;
        }

        try {
            const res = await createItem({
                item_name: trimmedItemName,
                item_type: selectedItemTypeId ? Number(selectedItemTypeId) : undefined,
                item_classification: selectedItemClassId ? Number(selectedItemClassId) : undefined
            });

            if (res.success && res.item) {
                toast.success(`Successfully registered item "${trimmedItemName}"!`);
                setItems(prev => [res.item, ...prev]);
                setSelectedItemId(res.item.id);
                setItemSearch(res.item.item_name);
                setIsNewItemModalOpen(false);
            }
        } catch (err) {
            console.error("Failed to create item:", err);
            const error = err instanceof Error ? err : new Error(String(err));
            toast.error(error.message || "Failed to register item");
        }
    };

    const handleCreateItemType = async (name: string) => {
        try {
            const res = await createItemType(name);
            if (res.success && res.type) {
                toast.success(`Successfully registered item type "${name}"!`);
                setItemTypes(prev => [...prev, res.type]);
                setSelectedItemTypeId(String(res.type.id));
            }
        } catch (err) {
            console.error("Failed to create item type:", err);
            toast.error("Failed to create item type");
        }
    };

    const handleCreateItemClassification = async (name: string) => {
        try {
            const res = await createItemClassification(name);
            if (res.success && res.classification) {
                toast.success(`Successfully registered item classification "${name}"!`);
                setItemClassifications(prev => [...prev, res.classification]);
                setSelectedItemClassId(String(res.classification.id));
            }
        } catch (err) {
            console.error("Failed to create item classification:", err);
            toast.error("Failed to create item classification");
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingImage(true);
        try {
            const formData = new FormData();
            formData.append("file", file);

            const uploadRes = await fetch("/api/manufacturing/files", {
                method: "POST",
                body: formData
            });

            if (!uploadRes.ok) throw new Error("Upload failed");

            const fileData = await uploadRes.json();
            const fileId = fileData?.data?.id;
            if (fileId) {
                const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
                setItemImage(`${baseUrl}/assets/${fileId}`);
                setImageFilename(file.name);
                toast.success("Image uploaded successfully");
            }
        } catch (err) {
            console.error("Failed to upload image:", err);
            toast.error("Failed to upload image");
        } finally {
            setUploadingImage(false);
            e.target.value = "";
        }
    };

    const isDuplicateBarcode = useMemo(() => {
        const trimmed = barcode.trim().toLowerCase();
        if (!trimmed) return false;
        return assets.some(a => a.id !== editingAsset?.id && (a.barcode || "").trim().toLowerCase() === trimmed);
    }, [barcode, assets, editingAsset]);

    const isDuplicateRfid = useMemo(() => {
        const trimmed = rfidCode.trim().toLowerCase();
        if (!trimmed) return false;
        return assets.some(a => a.id !== editingAsset?.id && (a.rfid_code || "").trim().toLowerCase() === trimmed);
    }, [rfidCode, assets, editingAsset]);

    const filteredItems = useMemo(() => {
        if (!itemSearch.trim()) return items;
        const search = itemSearch.toLowerCase();
        return items.filter(i =>
            (i.item_name || "").toLowerCase().includes(search) ||
            (i.item_code || "").toLowerCase().includes(search)
        );
    }, [items, itemSearch]);

    const typeOptions = useMemo(() => itemTypes.map(t => ({ value: String(t.id), label: t.type_name })), [itemTypes]);
    const classificationOptions = useMemo(() => itemClassifications.map(c => ({ value: String(c.id), label: c.classification_name })), [itemClassifications]);

    return (
        <div className="flex flex-col gap-6 w-full">
            {/* Header section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
                        <Settings className="h-5 w-5 text-primary animate-spin" style={{ animationDuration: "25s" }} /> Asset &amp; Equipment Management
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">Track operational factory floor machinery, costs, lifespans, and physical conditions.</p>
                </div>
                <Button
                    onClick={handleOpenCreateModal}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-lg shadow-md shadow-primary/20"
                >
                    <Plus className="h-4 w-4" /> Register Equipment / Asset
                </Button>
            </div>

            {/* Table Component */}
            <AssetListTable
                loading={loading}
                filteredAssets={filteredAssets}
                paginatedAssets={paginatedAssets}
                items={items}
                departments={departments}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                conditionFilter={conditionFilter}
                setConditionFilter={setConditionFilter}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                handleOpenViewModal={handleOpenViewModal}
                handleOpenEditModal={handleOpenEditModal}
                setPreviewImage={setPreviewImage}
                currentPage={currentPage}
                setCurrentPage={setCurrentPage}
                pageSize={pageSize}
                setPageSize={setPageSize}
                totalPages={totalPages}
                startIndex={startIndex}
            />

            {/* Maintenance & Work Order Modal */}
            <MaintenanceWorkOrderModal
                isModalOpen={isModalOpen}
                setIsModalOpen={setIsModalOpen}
                editingAsset={editingAsset}
                isViewModalOpen={isViewModalOpen}
                setIsViewModalOpen={setIsViewModalOpen}
                viewingAsset={viewingAsset}
                items={items}
                departments={departments}
                itemSearch={itemSearch}
                setItemSearch={setItemSearch}
                isItemDropdownOpen={isItemDropdownOpen}
                setIsItemDropdownOpen={setIsItemDropdownOpen}
                filteredItems={filteredItems}
                selectedItemId={selectedItemId}
                setSelectedItemId={setSelectedItemId}
                selectedDeptId={selectedDeptId}
                setSelectedDeptId={setSelectedDeptId}
                costPerItem={costPerItem}
                setCostPerItem={setCostPerItem}
                lifeSpan={lifeSpan}
                setLifeSpan={setLifeSpan}
                condition={condition}
                setCondition={setCondition}
                dateAcquired={dateAcquired}
                setDateAcquired={setDateAcquired}
                itemImage={itemImage}
                imageFilename={imageFilename}
                uploadingImage={uploadingImage}
                handleImageUpload={handleImageUpload}
                barcode={barcode}
                setBarcode={setBarcode}
                isDuplicateBarcode={isDuplicateBarcode}
                rfidCode={rfidCode}
                setRfidCode={setRfidCode}
                isDuplicateRfid={isDuplicateRfid}
                isActiveWarning={isActiveWarning}
                setIsActiveWarning={setIsActiveWarning}
                isActive={isActive}
                setIsActive={setIsActive}
                validationAttempted={validationAttempted}
                setValidationAttempted={setValidationAttempted}
                saving={saving}
                handleSave={handleSave}
                handleOpenNewItemSubModal={handleOpenNewItemSubModal}
                handleOpenEditModal={handleOpenEditModal}
                setPreviewImage={setPreviewImage}
                handleCloseItemDropdown={handleCloseItemDropdown}
                isTransitioning={isTransitioning}
            />

            {/* Downtime Logger / Sub-modals Component */}
            <AssetDowntimeLogger
                isNewItemModalOpen={isNewItemModalOpen}
                setIsNewItemModalOpen={setIsNewItemModalOpen}
                newItemName={newItemName}
                setNewItemName={setNewItemName}
                selectedItemTypeId={selectedItemTypeId}
                setSelectedItemTypeId={setSelectedItemTypeId}
                selectedItemClassId={selectedItemClassId}
                setSelectedItemClassId={setSelectedItemClassId}
                typeOptions={typeOptions}
                classificationOptions={classificationOptions}
                handleCreateItemSubmit={handleCreateItemSubmit}
                handleCreateItemType={handleCreateItemType}
                handleCreateItemClassification={handleCreateItemClassification}
                previewImage={previewImage}
                setPreviewImage={setPreviewImage}
            />
        </div>
    );
}