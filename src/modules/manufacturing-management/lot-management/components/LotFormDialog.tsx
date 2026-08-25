import React from "react";
import { Loader2 } from "lucide-react";
import { Lot, UnitOfMeasure, Branch } from "../types";
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
import { SearchableUomSelect } from "./SearchableUomSelect";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";

interface LotFormDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: () => void;
    editingLot: Lot | null;
    formData: {
        lotName: string;
        branchId: number | "";
        uomId: number | "";
        maxBatchCapacity: string;
    };
    formErrors?: {
        lotName?: boolean;
        branchId?: boolean;
        uomId?: boolean;
        maxBatchCapacity?: boolean;
    };
    isDuplicateLotName?: boolean;
    onFormChange: (field: string, value: string | number) => void;
    uoms: UnitOfMeasure[];
    branches?: Branch[];
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
    uoms,
    branches = [],
    saving
}: LotFormDialogProps) {
    const selectedUom = React.useMemo(() => {
        if (formData.uomId === "") return null;
        return uoms.find((u) => u.unitId === Number(formData.uomId));
    }, [formData.uomId, uoms]);

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="sm:max-w-[440px]" showCloseButton={false}>
                <form onSubmit={handleFormSubmit} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>{editingLot ? "Edit Lot Location" : "Add New Lot Location"}</DialogTitle>
                        <DialogDescription>
                            {editingLot
                                ? "Update the storage lot details."
                                : "Register a new warehouse storage location with branch assignment."}
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

                        {/* Branch Selection */}
                        <div className="space-y-1">
                            <Label htmlFor="branchId">
                                Branch Location <span className="text-destructive">*</span>
                            </Label>
                            <Select
                                value={formData.branchId !== "" ? String(formData.branchId) : ""}
                                onValueChange={(val) => onFormChange("branchId", Number(val))}
                                disabled={saving}
                            >
                                <SelectTrigger className={`bg-background ${formErrors.branchId ? "border-destructive ring-destructive/20" : ""}`}>
                                    <SelectValue placeholder="Select branch location..." />
                                </SelectTrigger>
                                <SelectContent className="bg-popover border border-border max-h-[220px]">
                                    {branches.map((b) => (
                                        <SelectItem key={b.id} value={String(b.id)}>
                                            <div className="flex items-center justify-between gap-3 w-full">
                                                <span className="font-semibold">{b.branchName}</span>
                                                <span className="text-xs text-muted-foreground font-mono">({b.branchCode})</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {formErrors.branchId && (
                                <p className="text-[11px] text-destructive font-medium mt-1">
                                    Branch selection is required.
                                </p>
                            )}
                        </div>

                        {/* Unit of Measure (UOM) */}
                        <div className="space-y-1">
                            <Label htmlFor="uomId">
                                Unit of Measure (UOM) <span className="text-destructive">*</span>
                            </Label>
                            <SearchableUomSelect
                                uoms={uoms}
                                value={formData.uomId}
                                onValueChange={(val) => onFormChange("uomId", val)}
                                disabled={saving}
                                hasError={!!formErrors.uomId}
                                placeholder="Select unit of measure..."
                            />
                        </div>

                        {/* Max Capacity */}
                        <div className="space-y-1">
                            <Label htmlFor="maxBatchCapacity">
                                Maximum Capacity <span className="text-destructive">*</span>
                            </Label>
                            <div className="relative flex items-center">
                                <Input
                                    id="maxBatchCapacity"
                                    type="number"
                                    min="1"
                                    step="1"
                                    placeholder="e.g. 500"
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
                                    className={`${selectedUom?.unitShortcut ? "pr-14" : ""} ${formErrors.maxBatchCapacity ? "border-destructive focus-visible:ring-destructive text-destructive" : ""}`}
                                />
                                {selectedUom?.unitShortcut && (
                                    <span className="absolute right-3 text-xs font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase pointer-events-none">
                                        {selectedUom.unitShortcut}
                                    </span>
                                )}
                            </div>
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
