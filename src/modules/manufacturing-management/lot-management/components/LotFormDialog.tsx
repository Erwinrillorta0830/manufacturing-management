import React from "react";
import { Loader2 } from "lucide-react";
import { Lot, InventoryType } from "../types";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";

interface LotFormDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: () => void;
    editingLot: Lot | null;
    formData: {
        lotName: string;
        inventoryTypeId: number | "";
        maxBatchCapacity: string;
    };
    formErrors?: {
        lotName?: boolean;
        inventoryTypeId?: boolean;
        maxBatchCapacity?: boolean;
    };
    isDuplicateLotName?: boolean;
    onFormChange: (field: string, value: string | number) => void;
    inventoryTypes: InventoryType[];
    saving: boolean;
}

export default function LotFormDialog({
    isOpen,
    onClose,
    onSubmit,
    editingLot,
    formData,
    formErrors = {},
    isDuplicateLotName = false,
    onFormChange,
    inventoryTypes,
    saving
}: LotFormDialogProps) {
    const typeOptions = React.useMemo(() => {
        return inventoryTypes.map((type) => ({
            value: String(type.inventoryTypeId),
            label: type.typeName
        }));
    }, [inventoryTypes]);

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="sm:max-w-[425px]" showCloseButton={false}>
                <form onSubmit={handleFormSubmit} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>{editingLot ? "Edit Lot" : "Add New Lot"}</DialogTitle>
                        <DialogDescription>
                            {editingLot
                                ? "Update the storage lot details."
                                : "Register a new warehouse storage location."}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {/* Lot Name */}
                        <div className="space-y-1">
                            <Label htmlFor="lotName">
                                Lot Name <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="lotName"
                                placeholder="e.g. Rack A-1, Bin B"
                                autoComplete="off"
                                value={formData.lotName}
                                onChange={(e) => onFormChange("lotName", e.target.value)}
                                disabled={saving}
                                className={formErrors.lotName || isDuplicateLotName ? "border-destructive focus-visible:ring-destructive text-destructive" : ""}
                            />
                            {isDuplicateLotName && (
                                <p className="text-[11px] text-destructive font-medium mt-1">
                                    A lot with the name &quot;{formData.lotName.trim()}&quot; already exists.
                                </p>
                            )}
                        </div>

                        {/* Inventory Type */}
                        <div className="space-y-1">
                            <Label htmlFor="inventoryType">
                                Inventory Type <span className="text-destructive">*</span>
                            </Label>
                            <SearchableSelect
                                options={typeOptions}
                                value={formData.inventoryTypeId === "" ? undefined : String(formData.inventoryTypeId)}
                                onValueChange={(val) => onFormChange("inventoryTypeId", Number(val))}
                                placeholder="Select type..."
                                disabled={saving}
                                className={`w-full text-left font-normal ${formErrors.inventoryTypeId ? "border-destructive focus-visible:ring-destructive" : ""}`}
                            />
                        </div>

                        {/* Max Batch Capacity */}
                        <div className="space-y-1">
                            <Label htmlFor="maxBatchCapacity">
                                Max Capacity (pcs) <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="maxBatchCapacity"
                                type="number"
                                min="1"
                                step="1"
                                placeholder="e.g. 50"
                                value={formData.maxBatchCapacity}
                                onChange={(e) => onFormChange("maxBatchCapacity", e.target.value)}
                                onKeyDown={(e) => {
                                    if (["-", "e", "E", "+", "."].includes(e.key)) {
                                        e.preventDefault();
                                    }
                                }}
                                onPaste={(e) => {
                                    const pasted = e.clipboardData.getData("text");
                                    if (/[^0-9]/.test(pasted)) {
                                        e.preventDefault();
                                    }
                                }}
                                disabled={saving}
                                className={formErrors.maxBatchCapacity ? "border-destructive focus-visible:ring-destructive text-destructive" : ""}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            disabled={saving}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editingLot ? "Save Changes" : "Create Lot"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
