"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PriceControlSearchableSelect } from "../../shared/PriceControlSearchableSelect";
import { Textarea } from "@/components/ui/textarea";

import * as api from "../providers/pcrApi";
import type { BatchImportPrefill } from "../types";
import { BatchCatalogPanel } from "./BatchCatalogPanel";
import { useCreateBatchState } from "./useCreateBatchState";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    suppliers: api.SupplierOption[];
    onCreated: () => void;
    importPrefill?: BatchImportPrefill | null;
};

export function CreatePriceChangeBatchDialog({ open, onOpenChange, suppliers, onCreated, importPrefill = null }: Props) {
    const state = useCreateBatchState({ open, onOpenChange, suppliers, onCreated, importPrefill });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
                <DialogHeader>
                    <DialogTitle>New Price Change Batch</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="grid gap-3 lg:grid-cols-[minmax(220px,0.8fr)_minmax(180px,0.55fr)_minmax(260px,1fr)]">
                        <div className="grid gap-2">
                            <Label>Supplier <span className="text-destructive">*</span></Label>
                            <PriceControlSearchableSelect
                                options={state.supplierOptions}
                                value={state.supplierId}
                                onValueChange={state.handleSupplierChange}
                                placeholder="Select supplier"
                                disabled={suppliers.length === 0 || state.saving || state.showingImportedView}
                            />
                            {state.errors.supplier_id ? <p className="text-xs text-destructive">{state.errors.supplier_id}</p> : null}
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="price-change-batch-reference">Reference No.</Label>
                            <Input id="price-change-batch-reference" value={state.referenceNo} placeholder="Reference number" readOnly disabled={state.saving} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="price-change-batch-remarks">Remarks <span className="text-destructive">*</span></Label>
                            <Textarea id="price-change-batch-remarks" value={state.remarks}
                                onChange={(e) => { state.setRemarks(e.target.value); state.setErrors((prev) => ({ ...prev, remarks: undefined })); }}
                                rows={3} aria-invalid={Boolean(state.errors.remarks)} disabled={state.saving} />
                            {state.errors.remarks ? <p className="text-xs text-destructive">{state.errors.remarks}</p> : null}
                        </div>
                    </div>

                    <BatchCatalogPanel
                        supplierId={state.supplierId}
                        saving={state.saving}
                        priceTypes={state.priceTypes}
                        products={state.products}
                        draftPrices={state.draftPrices}
                        draftCosts={state.draftCosts}
                        pendingValues={state.pendingValues}
                        unitLabelMap={state.unitLabelMap}
                        currentPriceFor={state.currentPriceFor}
                        unitLabelFor={state.unitLabelFor}
                        setDraftPrice={state.setDraftPrice}
                        setDraftCost={state.setDraftCost}
                        validation={state.validation}
                        gridNav={state.gridNav}
                        catalogViewMode={state.catalogViewMode}
                        setCatalogViewMode={state.setCatalogViewMode}
                        showingImportedView={state.showingImportedView}
                        importedProductIds={state.importedProductIds}
                        localCatalogQ={state.localCatalogQ}
                        setLocalCatalogQ={state.setLocalCatalogQ}
                        applyCatalogSearch={state.applyCatalogSearch}
                        loadingProducts={state.loadingProducts}
                        loadError={state.loadError}
                        catalogLoading={state.catalogLoading}
                        gridProducts={state.gridProducts}
                        catalogStartIndex={state.catalogStartIndex}
                        catalogEndIndex={state.catalogEndIndex}
                        catalogTotal={state.catalogTotal}
                        catalogTotalVariants={state.catalogTotalVariants}
                        catalogTotalPages={state.catalogTotalPages}
                        catalogPageSize={state.catalogPageSize}
                        setCatalogPageSize={state.setCatalogPageSize}
                        setCatalogPage={state.setCatalogPage}
                        canCatalogPrev={state.canCatalogPrev}
                        canCatalogNext={state.canCatalogNext}
                        currentCostFor={state.currentCostFor}
                        catalogQuery={state.catalogQuery}
                    />

                    {state.errors.lines ? <p className="text-sm text-destructive">{state.errors.lines}</p> : null}

                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={state.saving}>
                            Cancel
                        </Button>
                        <Button onClick={state.handleSubmit} disabled={!state.canSubmit}>
                            {state.saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Create Batch
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
