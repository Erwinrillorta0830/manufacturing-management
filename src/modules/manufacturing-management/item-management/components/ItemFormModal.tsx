import React, { useState, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreatableSelect } from "../../finished-goods-master/components/CreatableSelect";
import { toast } from "sonner";

import { CatalogItem, ItemType, ItemClassification } from "../types";

interface ItemFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (name: string, typeId: number, classId: number) => Promise<boolean>;
    itemTypes: ItemType[];
    itemClassifications: ItemClassification[];
    item?: CatalogItem;
}

export default function ItemFormModal({
    isOpen,
    onClose,
    onSave,
    itemTypes,
    itemClassifications,
    item
}: ItemFormModalProps) {
    const initialItemName = item?.item_name || "";
    const initialTypeId = item?.item_type
        ? (typeof item.item_type === "object" ? String(item.item_type.id) : String(item.item_type))
        : "";
    const initialClassId = item?.item_classification
        ? (typeof item.item_classification === "object" ? String(item.item_classification.id) : String(item.item_classification))
        : "";

    const [itemName, setItemName] = useState(initialItemName);
    const [selectedTypeId, setSelectedTypeId] = useState(initialTypeId);
    const [selectedClassId, setSelectedClassId] = useState(initialClassId);
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState<{ itemName?: boolean; itemType?: boolean; itemClassification?: boolean }>({});

    const typeOptions = useMemo(() => {
        return itemTypes.map((t) => ({
            value: String(t.id),
            label: t.type_name
        }));
    }, [itemTypes]);

    const classificationOptions = useMemo(() => {
        return itemClassifications.map((c) => ({
            value: String(c.id),
            label: c.classification_name
        }));
    }, [itemClassifications]);


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = itemName.trim();

        const newErrors = {
            itemName: !trimmed,
            itemType: !selectedTypeId,
            itemClassification: !selectedClassId
        };
        setErrors(newErrors);

        if (newErrors.itemName) {
            toast.error("Item Name is required.");
            return;
        }
        if (newErrors.itemType) {
            toast.error("Item Type is required.");
            return;
        }
        if (newErrors.itemClassification) {
            toast.error("Item Classification is required.");
            return;
        }

        setSubmitting(true);
        const success = await onSave(trimmed, Number(selectedTypeId), Number(selectedClassId));
        setSubmitting(false);

        if (success) {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b shrink-0 bg-muted/10">
                    <h3 className="text-sm font-bold text-foreground">
                        {item ? "Edit Catalog Item" : "Register New Catalog Item"}
                    </h3>
                </div>

                {/* Form */}
                <form
                    onSubmit={handleSubmit}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                        }
                    }}
                    className="p-5 space-y-4 text-xs"
                >
                    {/* Item Name */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                            Item Name <span className="text-destructive">*</span>
                        </label>
                        <input
                            type="text"
                            placeholder="e.g. Soya Press Machine Model X"
                            value={itemName}
                            onChange={(e) => {
                                setItemName(e.target.value);
                                if (e.target.value.trim()) {
                                    setErrors((prev) => ({ ...prev, itemName: false }));
                                }
                            }}
                            disabled={submitting}
                            className={`w-full rounded-lg border bg-background px-3 py-2 text-xs text-foreground outline-none focus:ring-1 transition-all ${errors.itemName
                                    ? "border-destructive focus:ring-destructive"
                                    : "border-border focus:ring-primary"
                                }`}
                        />
                    </div>

                    {/* Item Type */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                            Item Type <span className="text-destructive">*</span>
                        </label>
                        <CreatableSelect
                            variant="inline"
                            options={typeOptions}
                            value={selectedTypeId}
                            onValueChange={(val) => {
                                setSelectedTypeId(val);
                                if (val) {
                                    setErrors((prev) => ({ ...prev, itemType: false }));
                                }
                            }}
                            placeholder="Select Item Type..."
                            disabled={submitting}
                            popoverClassName="z-[70]"
                            className={errors.itemType ? "border-destructive focus-visible:ring-destructive" : ""}
                        />
                    </div>

                    {/* Item Classification */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                            Item Classification <span className="text-destructive">*</span>
                        </label>
                        <CreatableSelect
                            variant="inline"
                            options={classificationOptions}
                            value={selectedClassId}
                            onValueChange={(val) => {
                                setSelectedClassId(val);
                                if (val) {
                                    setErrors((prev) => ({ ...prev, itemClassification: false }));
                                }
                            }}
                            placeholder="Select Item Classification..."
                            disabled={submitting}
                            popoverClassName="z-[70]"
                            className={errors.itemClassification ? "border-destructive focus-visible:ring-destructive" : ""}
                        />
                    </div>


                    {/* Footer Buttons */}
                    <div className="flex justify-end gap-2 pt-3 border-t shrink-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            disabled={submitting}
                            className="h-8 px-3 text-xs"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={submitting}
                            className="h-8 px-3 text-xs bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded shadow transition-all"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                                    {item ? "Saving..." : "Registering..."}
                                </>
                            ) : (
                                item ? "Save Changes" : "Register Item"
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
