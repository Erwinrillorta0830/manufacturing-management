"use client";

import React, { useState } from "react";
import { Plus, Search, RefreshCw, Loader2 } from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useItemManagement } from "./hooks/useItemManagement";
import { CatalogItem, ItemType, ItemClassification } from "./types";
import ItemsTable from "./components/ItemsTable";
import ItemTypesTable from "./components/ItemTypesTable";
import ItemClassificationsTable from "./components/ItemClassificationsTable";
import ItemFormModal from "./components/ItemFormModal";
import ItemTypeFormModal from "./components/ItemTypeFormModal";
import ItemClassificationFormModal from "./components/ItemClassificationFormModal";

export default function ItemManagementModule() {
    const {
        itemTypes,
        itemClassifications,
        filteredItems,
        filteredItemTypes,
        filteredItemClassifications,
        loading,
        searchQuery,
        setSearchQuery,
        refresh,
        handleRegisterItem,
        handleRegisterItemType,
        handleRegisterItemClassification,
        handleUpdateItem,
        handleUpdateItemType,
        handleUpdateItemClassification
    } = useItemManagement();

    const [activeTab, setActiveTab] = useState("items");
    const [isItemModalOpen, setIsItemModalOpen] = useState(false);
    const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
    const [isClassificationModalOpen, setIsClassificationModalOpen] = useState(false);

    const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
    const [editingType, setEditingType] = useState<ItemType | null>(null);
    const [editingClassification, setEditingClassification] = useState<ItemClassification | null>(null);

    const handleAddClick = () => {
        if (activeTab === "items") {
            setIsItemModalOpen(true);
        } else if (activeTab === "types") {
            setIsTypeModalOpen(true);
        } else if (activeTab === "classifications") {
            setIsClassificationModalOpen(true);
        }
    };

    const getAddButtonText = () => {
        if (activeTab === "items") return "Register New Item";
        if (activeTab === "types") return "Register New Type";
        return "Register New Classification";
    };

    return (
        <div className="space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto flex-1">
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by name..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 h-9 text-xs"
                            />
                        </div>

                    </div>

                    {/* Action Bar */}
                    <div className="flex items-center gap-2 justify-end shrink-0 w-full md:w-auto">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={refresh}
                            disabled={loading}
                            className="h-9 w-9"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-primary" : ""}`} />
                        </Button>
                        <Button
                            onClick={handleAddClick}
                            disabled={loading}
                            className="h-9 gap-1.5 shadow-md shadow-primary/15 shrink-0 text-xs font-semibold"
                        >
                            <Plus className="h-4 w-4" />
                            {getAddButtonText()}
                        </Button>
                    </div>
                </div>


                {loading ? (
                    <div className="flex flex-col items-center justify-center p-20 gap-3 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <span className="text-sm font-medium">Loading catalog data...</span>
                    </div>
                ) : (
                    <>
                        <TabsContent value="items" className="outline-none mt-0">
                            <ItemsTable 
                                items={filteredItems} 
                                onEdit={(item) => {
                                    setEditingItem(item);
                                    setIsItemModalOpen(true);
                                }}
                            />
                        </TabsContent>
                        <TabsContent value="types" className="outline-none mt-0">
                            <ItemTypesTable 
                                types={filteredItemTypes} 
                                onEdit={(type) => {
                                    setEditingType(type);
                                    setIsTypeModalOpen(true);
                                }}
                            />
                        </TabsContent>
                        <TabsContent value="classifications" className="outline-none mt-0">
                            <ItemClassificationsTable 
                                classifications={filteredItemClassifications} 
                                onEdit={(classification) => {
                                    setEditingClassification(classification);
                                    setIsClassificationModalOpen(true);
                                }}
                            />
                        </TabsContent>
                    </>
                )}
            </Tabs>

            {/* Registration Modals */}
            {isItemModalOpen && (
                <ItemFormModal
                    isOpen={isItemModalOpen}
                    item={editingItem || undefined}
                    onClose={() => {
                        setIsItemModalOpen(false);
                        setEditingItem(null);
                    }}
                    onSave={async (name, typeId, classId) => {
                        if (editingItem) {
                            return await handleUpdateItem(editingItem.id, name, typeId, classId);
                        }
                        return await handleRegisterItem(name, typeId, classId);
                    }}
                    itemTypes={itemTypes}
                    itemClassifications={itemClassifications}
                />
            )}

            {isTypeModalOpen && (
                <ItemTypeFormModal
                    isOpen={isTypeModalOpen}
                    itemType={editingType || undefined}
                    onClose={() => {
                        setIsTypeModalOpen(false);
                        setEditingType(null);
                    }}
                    onSave={async (name) => {
                        if (editingType) {
                            return await handleUpdateItemType(editingType.id, name);
                        }
                        return await handleRegisterItemType(name);
                    }}
                />
            )}

            {isClassificationModalOpen && (
                <ItemClassificationFormModal
                    isOpen={isClassificationModalOpen}
                    itemClassification={editingClassification || undefined}
                    onClose={() => {
                        setIsClassificationModalOpen(false);
                        setEditingClassification(null);
                    }}
                    onSave={async (name) => {
                        if (editingClassification) {
                            return await handleUpdateItemClassification(editingClassification.id, name);
                        }
                        return await handleRegisterItemClassification(name);
                    }}
                />
            )}
        </div>

    );
}
