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
import { Branch, JobOrder } from "../types";
import { FinishedGoodsLotSelect } from "../../shared/FinishedGoodsLotSelect";
import { SearchableSelect } from "../../shared/components/SearchableSelect";
import { EligibleFinishedGoodsLot } from "../../shared/finished-goods-lots-api";

interface YieldClosingDialogProps {
    isYieldDialogOpen: boolean;
    setIsYieldDialogOpen: (open: boolean) => void;
    selectedJO: JobOrder | null;
    getBranchName: (branchId?: number | null) => string;
    branches: Branch[];
    postingBranchMode: "existing" | "new";
    postingBranchId: string;
    handlePostingBranchModeChange: (mode: "existing" | "new") => void;
    handlePostingBranchChange: (branchId: string) => Promise<void>;
    newPostingBranchName: string;
    setNewPostingBranchName: (value: string) => void;
    newPostingBranchCode: string;
    setNewPostingBranchCode: (value: string) => void;
    handleCreatePostingBranch: () => Promise<void>;
    branchActionLoading: boolean;
    yieldQty: string;
    setYieldQty: (qty: string) => void;
    lotNumber: string;
    setLotNumber: (lot: string) => void;
    eligibleLots: EligibleFinishedGoodsLot[];
    selectedMmLotId: string;
    setSelectedMmLotId: (lotId: string) => void;
    loadingEligibleLots: boolean;
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
    branches,
    postingBranchMode,
    postingBranchId,
    handlePostingBranchModeChange,
    handlePostingBranchChange,
    newPostingBranchName,
    setNewPostingBranchName,
    newPostingBranchCode,
    setNewPostingBranchCode,
    handleCreatePostingBranch,
    branchActionLoading,
    yieldQty,
    setYieldQty,
    lotNumber,
    setLotNumber,
    eligibleLots,
    selectedMmLotId,
    setSelectedMmLotId,
    loadingEligibleLots,
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
            <DialogContent className="w-[calc(100vw-1rem)] max-w-[480px] max-h-[calc(100dvh-1rem)] flex flex-col overflow-hidden">
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
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4 pr-1 scrollbar-thin">
                        {/* Summary panel */}
                        <div className="bg-muted/40 border rounded-lg p-3 text-sm grid grid-cols-2 gap-2">
                            <div>
                                <span className="text-muted-foreground block text-[11px] font-bold uppercase tracking-wider">Job Order No</span>
                                <span className="font-bold text-foreground">{selectedJO.jo_id}</span>
                            </div>
                            <div>
                                <span className="text-muted-foreground block text-[11px] font-bold uppercase tracking-wider">Posting Branch</span>
                                <Badge variant="outline" className="font-semibold text-xs py-0 mt-0.5">
                                    {postingBranchId ? getBranchName(Number(postingBranchId)) : "No branch selected"}
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

                        <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                            <div className="flex items-center justify-between gap-2">
                                <Label className="font-semibold text-xs">
                                    Job Order Branch <span className="text-destructive">*</span>
                                </Label>
                                <span className="text-[10px] text-muted-foreground">The persisted branch controls the output lot.</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    type="button"
                                    variant={postingBranchMode === "existing" ? "default" : "outline"}
                                    className="min-h-10 text-xs"
                                    onClick={() => handlePostingBranchModeChange("existing")}
                                    disabled={actionLoading || branchActionLoading}
                                >
                                    Use Existing Branch
                                </Button>
                                <Button
                                    type="button"
                                    variant={postingBranchMode === "new" ? "default" : "outline"}
                                    className="min-h-10 text-xs"
                                    onClick={() => handlePostingBranchModeChange("new")}
                                    disabled={actionLoading || branchActionLoading}
                                >
                                    Create New Branch
                                </Button>
                            </div>

                            {postingBranchMode === "existing" ? (
                                <SearchableSelect
                                    options={branches
                                        .map((branch) => {
                                            const id = Number(branch.id || branch.branch_id || 0);
                                            const name = String(branch.branch_name || branch.name || "").trim();
                                            const code = String(branch.branch_code || branch.branchCode || "").trim();
                                            return {
                                                value: String(id),
                                                label: name,
                                                subLabel: code || undefined,
                                                title: code ? `${name} (${code})` : name
                                            };
                                        })
                                        .filter((option) => Number(option.value) > 0 && Boolean(option.label))}
                                    value={postingBranchId}
                                    onValueChange={(value) => void handlePostingBranchChange(value)}
                                    placeholder="Select an active branch..."
                                    searchPlaceholder="Search branches..."
                                    emptyMessage="No active branches found."
                                    disabled={actionLoading || branchActionLoading}
                                    className="min-h-11 w-full justify-between text-sm"
                                />
                            ) : (
                                <div className="space-y-2">
                                    <div className="grid grid-cols-2 gap-2">
                                        <Input
                                            aria-label="New branch name"
                                            placeholder="Branch name"
                                            value={newPostingBranchName}
                                            onChange={(event) => setNewPostingBranchName(event.target.value)}
                                            disabled={actionLoading || branchActionLoading}
                                            className="min-h-11 text-sm"
                                        />
                                        <Input
                                            aria-label="New branch code"
                                            placeholder="Branch code"
                                            value={newPostingBranchCode}
                                            onChange={(event) => setNewPostingBranchCode(event.target.value)}
                                            disabled={actionLoading || branchActionLoading}
                                            className="min-h-11 text-sm font-mono uppercase"
                                        />
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={handleCreatePostingBranch}
                                        disabled={actionLoading || branchActionLoading || !newPostingBranchName.trim() || !newPostingBranchCode.trim()}
                                        className="min-h-10 w-full text-xs"
                                    >
                                        {branchActionLoading ? "Creating and assigning..." : "Create and Assign Branch"}
                                    </Button>
                                </div>
                            )}
                            {branchActionLoading && postingBranchMode === "existing" && (
                                <p className="text-[10px] text-muted-foreground">Assigning the branch to this Job Order and loading compatible storage lots...</p>
                            )}
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
                                        className="min-h-11 shrink-0 text-sm"
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
                                    className="min-h-11 text-base font-bold font-mono"
                                />
                                {yieldQty && !isNaN(Number(yieldQty)) && Number(yieldQty) < selectedJO.quantity && (
                                    <p className="text-[10px] text-destructive font-bold flex items-center gap-1 mt-0.5">
                                        <AlertTriangle className="h-3 w-3 shrink-0" />
                                        Scrap yield loss detected. Merged Sales Orders allocations will split proportionally.
                                    </p>
                                )}
                            </div>

                            <div className="col-span-2 space-y-1.5">
                                <Label className="font-semibold text-xs">
                                    Storage Lot <span className="text-destructive">*</span>
                                </Label>
                                <FinishedGoodsLotSelect
                                    lots={eligibleLots}
                                    value={selectedMmLotId}
                                    onValueChange={setSelectedMmLotId}
                                    loading={loadingEligibleLots}
                                    disabled={actionLoading || branchActionLoading}
                                    placeholder="Select storage lot..."
                                    className="min-h-11 w-full justify-between text-sm"
                                />
                            </div>

                            <div className="col-span-2 space-y-1.5">
                                <Label htmlFor="lotNo" className="font-semibold text-xs">
                                    Batch Number <span className="text-destructive">*</span>
                                </Label>
                                <Input 
                                    id="lotNo"
                                    placeholder="e.g. BATCH-2026-001"
                                    value={lotNumber}
                                    onChange={e => setLotNumber(e.target.value)}
                                    className="min-h-11 text-sm font-mono"
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
                                    className="min-h-11 text-sm"
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
                                    className="min-h-11 text-sm"
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
                                    className="min-h-11 text-sm font-mono"
                                />
                            </div>
                        </div>
                    </div>
                )}

                <DialogFooter className="sticky bottom-0 z-10 gap-2 border-t bg-background/95 pt-3 sm:gap-0 backdrop-blur">
                    <Button 
                        variant="outline" 
                        onClick={() => setIsYieldDialogOpen(false)}
                        disabled={actionLoading}
                        className="min-h-11 text-sm font-semibold"
                    >
                        Cancel
                    </Button>
                    <Button 
                        variant="default"
                        onClick={handleSubmitYieldClosing}
                        disabled={actionLoading || branchActionLoading || yieldMaterialsLoading || Boolean(yieldMaterialsError) || !postingBranchId || !selectedMmLotId || !lotNumber.trim()}
                        className="min-h-11 text-sm font-semibold gap-1.5"
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
