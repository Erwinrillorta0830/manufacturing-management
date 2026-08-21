"use client";

import React from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { CreatableSelect } from "../../finished-goods/components/CreatableSelect";

interface Option {
    value: string;
    label: string;
}

interface AssetDowntimeLoggerProps {
    isNewItemModalOpen: boolean;
    setIsNewItemModalOpen: (open: boolean) => void;
    newItemName: string;
    setNewItemName: (name: string) => void;
    selectedItemTypeId: string;
    setSelectedItemTypeId: (id: string) => void;
    selectedItemClassId: string;
    setSelectedItemClassId: (id: string) => void;
    typeOptions: Option[];
    classificationOptions: Option[];
    handleCreateItemSubmit: (e: React.FormEvent) => void;
    handleCreateItemType: (name: string) => void;
    handleCreateItemClassification: (name: string) => void;
    previewImage: string | null;
    setPreviewImage: (image: string | null) => void;
}

export function AssetDowntimeLogger({
    isNewItemModalOpen,
    setIsNewItemModalOpen,
    newItemName,
    setNewItemName,
    selectedItemTypeId,
    setSelectedItemTypeId,
    selectedItemClassId,
    setSelectedItemClassId,
    typeOptions,
    classificationOptions,
    handleCreateItemSubmit,
    handleCreateItemType,
    handleCreateItemClassification,
    previewImage,
    setPreviewImage
}: AssetDowntimeLoggerProps) {
    return (
        <>
            {/* Sub-modal: Register New Item */}
            {isNewItemModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
                    <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm overflow-visible flex flex-col animate-in zoom-in-95 duration-150">
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/10 shrink-0">
                            <h4 className="text-sm font-bold text-foreground">Register New Catalog Item</h4>
                        </div>
                        {/* Body Form */}
                        <form onSubmit={handleCreateItemSubmit} className="p-5 space-y-4 text-xs">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Item Name <span className="text-destructive">*</span></label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Soya Press Machine Model X"
                                    value={newItemName}
                                    onChange={e => setNewItemName(e.target.value)}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary transition-all"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Item Type <span className="text-destructive">*</span></label>
                                <CreatableSelect
                                    variant="inline"
                                    options={typeOptions}
                                    value={selectedItemTypeId}
                                    onValueChange={setSelectedItemTypeId}
                                    placeholder="Select or type to create Item Type"
                                    onCreateOption={handleCreateItemType}
                                    popoverClassName="z-[70]"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Item Classification <span className="text-destructive">*</span></label>
                                <CreatableSelect
                                    variant="inline"
                                    options={classificationOptions}
                                    value={selectedItemClassId}
                                    onValueChange={setSelectedItemClassId}
                                    placeholder="Select or type to create Item Classification"
                                    onCreateOption={handleCreateItemClassification}
                                    popoverClassName="z-[70]"
                                />
                            </div>

                            {/* Footer Buttons */}
                            <div className="flex justify-end gap-2 pt-3 border-t shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setIsNewItemModalOpen(false)}
                                    className="px-3 py-1.5 border border-border rounded text-xs font-semibold hover:bg-muted transition-colors text-muted-foreground"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-3 py-1.5 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded text-xs transition-all shadow"
                                >
                                    Create Item
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Preview Image Modal */}
            {previewImage && (
                <div
                    className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
                    onClick={() => setPreviewImage(null)}
                >
                    <div
                        className="relative max-w-5xl max-h-[90vh] p-2 bg-card border border-border/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Close Button */}
                        <button
                            type="button"
                            onClick={() => setPreviewImage(null)}
                            className="absolute top-4 right-4 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 transition-colors focus:outline-none"
                        >
                            <X className="h-4 w-4" />
                        </button>

                        {/* Image */}
                        <Image
                            src={previewImage}
                            alt="Asset Preview Large"
                            width={900}
                            height={700}
                            unoptimized
                            className="max-w-full max-h-[85vh] object-contain rounded-xl animate-in zoom-in-95 duration-200"
                            style={{ width: "auto", height: "auto" }}
                        />
                    </div>
                </div>
            )}
        </>
    );
}
