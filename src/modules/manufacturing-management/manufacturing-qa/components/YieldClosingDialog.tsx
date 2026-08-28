import React from "react";
import { Forklift, AlertTriangle, RefreshCw, Check } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JobOrder } from "../types";

interface YieldClosingDialogProps {
    isYieldDialogOpen: boolean;
    setIsYieldDialogOpen: (open: boolean) => void;
    selectedJO: JobOrder | null;
    getBranchName: (branchId?: number | null) => string;
    yieldQty: string;
    setYieldQty: (qty: string) => void;
    lotNumber: string;
    setLotNumber: (lot: string) => void;
    manufacturingDate: string;
    setManufacturingDate: (date: string) => void;
    expiryDate: string;
    setExpiryDate: (date: string) => void;
    unitCost: string;
    setUnitCost: (cost: string) => void;
    yieldMaterialsLoading: boolean;
    yieldMaterialsError: string | null;
    handleRetryYieldMaterials: () => void;
    actionLoading: boolean;
    handleSubmitYieldClosing: () => void;
}

export function YieldClosingDialog({
    isYieldDialogOpen,
    setIsYieldDialogOpen,
    selectedJO,
    getBranchName,
    yieldQty,
    setYieldQty,
    lotNumber,
    setLotNumber,
    manufacturingDate,
    setManufacturingDate,
    expiryDate,
    setExpiryDate,
    unitCost,
    setUnitCost,
    yieldMaterialsLoading,
    yieldMaterialsError,
    handleRetryYieldMaterials,
    actionLoading,
    handleSubmitYieldClosing
}: YieldClosingDialogProps) {
    return (
        <Dialog open={isYieldDialogOpen} onOpenChange={setIsYieldDialogOpen}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle className="text-xl flex items-center gap-2">
                        <Forklift className="h-5 w-5 text-primary" />
                        Job Order Yield Closing
                    </DialogTitle>
                    <DialogDescription>
                        Input actual yield quantities and verify warehouse location ledger details. Component raw materials will automatically be deducted under the selected branch.
                    </DialogDescription>
                </DialogHeader>

                {selectedJO && (
                    <div className="space-y-4 py-4">
                        {/* Summary panel */}
                        <div className="bg-muted/40 border rounded-lg p-3 text-sm grid grid-cols-2 gap-2">
                            <div>
                                <span className="text-muted-foreground block text-[11px] font-bold uppercase tracking-wider">Job Order No</span>
                                <span className="font-bold text-foreground">{selectedJO.jo_id}</span>
                            </div>
                            <div>
                                <span className="text-muted-foreground block text-[11px] font-bold uppercase tracking-wider">Target Branch</span>
                                <Badge variant="outline" className="font-semibold text-xs py-0 mt-0.5">
                                    {getBranchName(selectedJO.branch_id)}
                                </Badge>
                            </div>
                            <div className="col-span-2 border-t pt-1.5 mt-0.5">
                                <span className="text-muted-foreground block text-[11px] font-bold uppercase tracking-wider">Product Name</span>
                                <span className="font-medium text-foreground text-xs block truncate" title={selectedJO.product_name}>
                                    {selectedJO.product_name}
                                </span>
                            </div>
                            <div className="border-t pt-1.5">
                                <span className="text-muted-foreground block text-[11px] font-bold uppercase tracking-wider">Target Qty</span>
                                <span className="font-semibold text-foreground font-mono text-xs">{selectedJO.quantity.toLocaleString()} units</span>
                            </div>
                            <div className="border-t pt-1.5">
                                <span className="text-muted-foreground block text-[11px] font-bold uppercase tracking-wider">Recipe version</span>
                                <span className="font-mono text-xs text-muted-foreground">
                                    {selectedJO.recipe_version_name || 
                                     selectedJO.recipeVersionName || 
                                     selectedJO.version_name || 
                                     selectedJO.versionName || 
                                     ((selectedJO.version_id || selectedJO.versionId || selectedJO.bom?.version_id) 
                                        ? `Version #${selectedJO.version_id || selectedJO.versionId || selectedJO.bom?.version_id}` 
                                        : 'Active')}
                                </span>
                            </div>
                        </div>

                        <div
                            className={yieldMaterialsError
                                ? "rounded-md border border-destructive/40 bg-destructive/5 p-3"
                                : "rounded-md border bg-muted/20 p-3"}
                            aria-live="polite"
                        >
                            {yieldMaterialsLoading ? (
                                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                    Verifying material requirements before posting...
                                </div>
                            ) : yieldMaterialsError ? (
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-2 text-xs text-destructive">
                                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                        <span>{yieldMaterialsError}</span>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleRetryYieldMaterials}
                                        disabled={actionLoading}
                                        className="h-7 shrink-0 text-[11px]"
                                    >
                                        Retry
                                    </Button>
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    Material requirements will be verified before this yield is posted.
                                </p>
                            )}
                        </div>

                        {/* Inputs */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2 space-y-1.5">
                                <Label htmlFor="yieldQty" className="font-semibold text-xs">
                                    Final Packaging Yield Quantity (Y) <span className="text-destructive">*</span>
                                </Label>
                                <Input 
                                    id="yieldQty"
                                    type="number"
                                    placeholder="e.g. 5000"
                                    value={yieldQty}
                                    onChange={e => setYieldQty(e.target.value)}
                                    className="h-10 text-base font-bold font-mono"
                                />
                                {yieldQty && !isNaN(Number(yieldQty)) && Number(yieldQty) < selectedJO.quantity && (
                                    <p className="text-[10px] text-destructive font-bold flex items-center gap-1 mt-0.5">
                                        <AlertTriangle className="h-3 w-3 shrink-0" />
                                        Scrap yield loss detected. Merged Sales Orders allocations will split proportionally.
                                    </p>
                                )}
                            </div>

                            <div className="col-span-2 space-y-1.5">
                                <Label htmlFor="lotNo" className="font-semibold text-xs">Lot Number</Label>
                                <Input 
                                    id="lotNo"
                                    placeholder={`MFG-${selectedJO.jo_id}`}
                                    value={lotNumber}
                                    onChange={e => setLotNumber(e.target.value)}
                                    className="h-9 text-xs"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="mfgDate" className="font-semibold text-xs">
                                    Manufacturing Date <span className="text-destructive">*</span>
                                </Label>
                                <Input 
                                    id="mfgDate"
                                    type="date"
                                    value={manufacturingDate}
                                    onChange={e => setManufacturingDate(e.target.value)}
                                    className="h-9 text-xs"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="expiry" className="font-semibold text-xs">
                                    Expiration Date <span className="text-destructive">*</span>
                                </Label>
                                <Input 
                                    id="expiry"
                                    type="date"
                                    value={expiryDate}
                                    onChange={e => setExpiryDate(e.target.value)}
                                    className="h-9 text-xs"
                                />
                            </div>

                            <div className="col-span-2 space-y-1.5">
                                <Label htmlFor="unitCost" className="font-semibold text-xs">Landed Unit Cost (PHP)</Label>
                                <Input 
                                    id="unitCost"
                                    type="number"
                                    placeholder="0.00"
                                    value={unitCost}
                                    onChange={e => setUnitCost(e.target.value)}
                                    className="h-9 text-xs font-mono"
                                />
                            </div>
                        </div>
                    </div>
                )}

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button 
                        variant="outline" 
                        onClick={() => setIsYieldDialogOpen(false)}
                        disabled={actionLoading}
                        className="h-9 text-xs font-semibold"
                    >
                        Cancel
                    </Button>
                    <Button 
                        variant="default"
                        onClick={handleSubmitYieldClosing}
                        disabled={actionLoading || yieldMaterialsLoading || Boolean(yieldMaterialsError)}
                        className="h-9 text-xs font-semibold gap-1.5"
                    >
                        {yieldMaterialsLoading ? (
                            <>
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                Verifying materials...
                            </>
                        ) : actionLoading ? (
                            <>
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                Finalizing...
                            </>
                        ) : (
                            <>
                                <Check className="h-3.5 w-3.5" />
                                Submit & Receipt FG
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
