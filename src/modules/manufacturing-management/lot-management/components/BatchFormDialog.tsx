import React from "react";
import { Loader2, Layers, Calendar, Info, Box, ShieldCheck, DollarSign, TextQuote } from "lucide-react";
import { Batch, Lot, UnitOfMeasure, BatchStatus, BatchQaStatus, ProductItem } from "../types";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { SearchableLotSelect } from "./SearchableLotSelect";
import { SearchableProductSelect } from "./SearchableProductSelect";

interface BatchFormDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: () => void;
    editingBatch: Batch | null;
    formData: {
        batchNumber: string;
        lotId: number | "";
        productId: number | "";
        itemCode: string;
        quantity: string;
        unitCost: string;
        uomId: number | "";
        manufacturingDate: string;
        expirationDate: string;
        qaStatus: BatchQaStatus;
        status: BatchStatus;
        remarks: string;
    };
    formErrors: Record<string, boolean>;
    onFormChange: (field: string, value: unknown) => void;
    lots: Lot[];
    uoms: UnitOfMeasure[];
    products?: ProductItem[];
    saving: boolean;
}

export default function BatchFormDialog({
    isOpen,
    onClose,
    onSubmit,
    editingBatch,
    formData,
    formErrors,
    onFormChange,
    lots,
    uoms,
    products = [],
    saving
}: BatchFormDialogProps) {
    const selectedLot = lots.find((l) => l.lotId === Number(formData.lotId));
    const selectedUom = uoms.find((u) => u.unitId === Number(formData.uomId)) ||
        (selectedLot ? { unitId: selectedLot.uomId, unitName: selectedLot.uomName, unitShortcut: selectedLot.uomShortcut } : null);

    const handleAutoGenerateBatchNo = () => {
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const randomNum = Math.floor(100 + Math.random() * 900);
        onFormChange("batchNumber", `BAT-${todayStr}-${randomNum}`);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[780px] bg-card border-border p-0 overflow-hidden shadow-2xl rounded-2xl">
                {/* Header Banner */}
                <DialogHeader className="p-6 pb-4 bg-muted/30 border-b border-border/60">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shadow-xs">
                            <Layers className="h-5 w-5" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl font-extrabold text-foreground">
                                {editingBatch ? "Edit Batch Registration" : "Register New Inventory Batch"}
                            </DialogTitle>
                            <DialogDescription className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                                <span>Assign batch inventory records to storage racks with quality tracking</span>
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                {/* Form Body - 2 Column Grid */}
                <div className="p-6 space-y-6 max-h-[78vh] overflow-y-auto">
                    {/* Section 1: Storage Location & Identification */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 border-b border-border/50 pb-2">
                            <Box className="h-4 w-4 text-primary" />
                            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                                Storage Rack & Material Identification
                            </h4>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Storage Rack (Searchable Lot Select) */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-bold text-foreground">
                                        Storage Rack (Lot) <span className="text-rose-500">*</span>
                                    </Label>
                                    {selectedLot && (
                                        <span className="text-[10px] text-muted-foreground">
                                            Max Cap: <strong className="text-foreground">{selectedLot.maxBatchCapacity.toLocaleString()}</strong> {selectedLot.uomShortcut || selectedLot.uomName}
                                        </span>
                                    )}
                                </div>
                                <SearchableLotSelect
                                    lots={lots}
                                    value={formData.lotId}
                                    onValueChange={(val) => onFormChange("lotId", val)}
                                    disabled={saving}
                                    hasError={!!formErrors.lotId}
                                    placeholder="Search storage rack or lot..."
                                />
                                {formErrors.lotId && (
                                    <p className="text-[11px] font-medium text-rose-500">Storage Rack selection is required.</p>
                                )}
                            </div>

                            {/* Product Material (Searchable Product Select) */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold text-foreground">
                                    Product / Material <span className="text-rose-500">*</span>
                                </Label>
                                <SearchableProductSelect
                                    products={products}
                                    value={formData.productId}
                                    onValueChange={(val) => onFormChange("productId", val)}
                                    disabled={saving}
                                    hasError={!!formErrors.productId}
                                    placeholder="Search product material..."
                                />
                                {formErrors.productId && (
                                    <p className="text-[11px] font-medium text-rose-500">Product Material selection is required.</p>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {/* Batch Number */}
                            <div className="space-y-1.5 sm:col-span-1">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-bold text-foreground">
                                        Batch No. <span className="text-rose-500">*</span>
                                    </Label>
                                    {!editingBatch && (
                                        <button
                                            type="button"
                                            onClick={handleAutoGenerateBatchNo}
                                            className="text-[10px] font-semibold text-primary hover:underline inline-flex items-center gap-0.5"
                                        >
                                            Auto-Generate
                                        </button>
                                    )}
                                </div>
                                <Input
                                    placeholder="e.g. BAT-20260825-001"
                                    value={formData.batchNumber}
                                    onChange={(e) => onFormChange("batchNumber", e.target.value)}
                                    className={`h-10 font-mono text-xs ${formErrors.batchNumber ? "border-rose-500 ring-rose-500/20" : ""}`}
                                />
                                {formErrors.batchNumber && (
                                    <p className="text-[11px] font-medium text-rose-500">Batch Number is required.</p>
                                )}
                            </div>

                            {/* Quantity */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-bold text-foreground">
                                        Quantity <span className="text-rose-500">*</span>
                                    </Label>
                                    {selectedUom && (
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase">
                                            {selectedUom.unitShortcut || selectedUom.unitName}
                                        </span>
                                    )}
                                </div>
                                <Input
                                    type="number"
                                    min="1"
                                    placeholder="1"
                                    value={formData.quantity}
                                    onChange={(e) => onFormChange("quantity", e.target.value)}
                                    className={`h-10 text-xs ${formErrors.quantity ? "border-rose-500 ring-rose-500/20" : ""}`}
                                />
                                {formErrors.quantity && (
                                    <p className="text-[11px] font-medium text-rose-500">Valid positive quantity required.</p>
                                )}
                            </div>

                            {/* Unit Cost */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold text-foreground flex items-center gap-1">
                                    <DollarSign className="h-3.5 w-3.5 text-muted-foreground" /> Unit Cost
                                </Label>
                                <Input
                                    type="number"
                                    step="0.000001"
                                    placeholder="0.000000"
                                    value={formData.unitCost}
                                    onChange={(e) => onFormChange("unitCost", e.target.value)}
                                    className="h-10 font-mono text-xs"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Dates & Quality Control Status */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 border-b border-border/50 pb-2">
                            <ShieldCheck className="h-4 w-4 text-primary" />
                            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                                Lifecycle Dates & Quality Assurance
                            </h4>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Manufacturing Date */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold text-foreground flex items-center gap-1">
                                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" /> Manufacturing Date
                                </Label>
                                <Input
                                    type="date"
                                    value={formData.manufacturingDate}
                                    onChange={(e) => onFormChange("manufacturingDate", e.target.value)}
                                    className="h-10 text-xs"
                                />
                            </div>

                            {/* Expiry Date */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold text-foreground flex items-center gap-1">
                                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" /> Expiry Date
                                </Label>
                                <Input
                                    type="date"
                                    value={formData.expirationDate}
                                    onChange={(e) => onFormChange("expirationDate", e.target.value)}
                                    className={`h-10 text-xs ${formErrors.expirationDate ? "border-rose-500 ring-rose-500/20" : ""}`}
                                />
                                {formErrors.expirationDate && (
                                    <p className="text-[11px] font-medium text-rose-500">Expiry date cannot precede MFG date.</p>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* QA Status */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold text-foreground">QA Inspection Status</Label>
                                <Select
                                    value={formData.qaStatus}
                                    onValueChange={(val) => onFormChange("qaStatus", val)}
                                >
                                    <SelectTrigger className="bg-background h-10 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-popover border border-border">
                                        <SelectItem value="GOOD">
                                            <div className="flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-400">
                                                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                                GOOD (QA Inspection Passed)
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="QUARANTINED">
                                            <div className="flex items-center gap-2 font-semibold text-amber-600 dark:text-amber-400">
                                                <span className="h-2 w-2 rounded-full bg-amber-500" />
                                                QUARANTINED (Under QA Hold)
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="DAMAGED">
                                            <div className="flex items-center gap-2 font-semibold text-rose-600 dark:text-rose-400">
                                                <span className="h-2 w-2 rounded-full bg-rose-500" />
                                                DAMAGED (Defects Found)
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="EXPIRED">
                                            <div className="flex items-center gap-2 font-semibold text-purple-600 dark:text-purple-400">
                                                <span className="h-2 w-2 rounded-full bg-purple-500" />
                                                EXPIRED (Past Expiry Date)
                                            </div>
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Batch Record Status */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold text-foreground">Record Status</Label>
                                <Select
                                    value={formData.status}
                                    onValueChange={(val) => onFormChange("status", val)}
                                >
                                    <SelectTrigger className="bg-background h-10 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-popover border border-border">
                                        <SelectItem value="ACTIVE">
                                            <div className="flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-400">
                                                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                                ACTIVE (Available for Pick/Allocation)
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="CLOSED">
                                            <div className="flex items-center gap-2 font-semibold text-muted-foreground">
                                                <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                                                CLOSED (Fully Consumed / Depleted)
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="INACTIVE">
                                            <div className="flex items-center gap-2 font-semibold text-rose-600 dark:text-rose-400">
                                                <span className="h-2 w-2 rounded-full bg-rose-500" />
                                                INACTIVE (Archived)
                                            </div>
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    {/* Section 3: Quality Notes & Remarks */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <TextQuote className="h-4 w-4 text-primary" />
                            <Label className="text-xs font-bold text-foreground">Remarks & Quality Inspection Notes</Label>
                        </div>
                        <Textarea
                            placeholder="Add optional notes, supplier source information, or QA inspection details..."
                            value={formData.remarks}
                            onChange={(e) => onFormChange("remarks", e.target.value)}
                            className="min-h-[75px] text-xs resize-none bg-background border-border"
                        />
                    </div>
                </div>

                {/* Footer Toolbar */}
                <DialogFooter className="p-4 px-6 bg-muted/20 border-t border-border/60 flex items-center !justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground hidden sm:flex">
                        <Info className="h-4 w-4 text-primary" />
                        <span>Updates storage rack occupancy &amp; lot statistics automatically.</span>
                    </div>
                    <div className="flex items-center gap-2.5 w-full sm:w-auto  ">
                        <Button variant="outline" size="sm" onClick={onClose} disabled={saving} className="h-9 px-4">
                            Cancel
                        </Button>
                        <Button size="sm" onClick={onSubmit} disabled={saving} className="h-9 px-5 gap-2 shadow-sm font-semibold">
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                            {editingBatch ? "Save Batch Changes" : "Register Batch"}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
