"use client";

import React from "react";
import { v4 as uuidv4 } from "uuid";
import {
    LotBatchSelectionModal as StockAdjustmentLotBatchSelectionModal,
    LotBatchSelectionResult,
} from "@/modules/manufacturing-management/shared/components/LotBatchSelectionModal";
import type { LotAllocationGroup as SharedLotAllocationGroup, QAStatus } from "@/modules/manufacturing-management/shared/types/lot-tracking.types";
import { ReceivingLotAllocationInput, StorageLot, StorageLotBatch } from "../types";

type AllocationDisposition = "accepted" | "rejected";

function lotCapacity(lot: StorageLot | undefined): number {
    if (!lot) return 0;
    const value = Number(lot.capacity ?? lot.max_batch_capacity ?? 0);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function lotUnitId(lot: StorageLot | undefined): number | null {
    if (!lot) return null;
    if (typeof lot.unit_id === "number") return lot.unit_id;
    if (typeof lot.uom_id === "number") return lot.uom_id;
    return null;
}

function toSharedLotAllocations(
    allocations: ReceivingLotAllocationInput[],
    storageLots: StorageLot[],
    productUomName: string,
    disposition: AllocationDisposition,
): SharedLotAllocationGroup[] {
    const groups = new Map<number, SharedLotAllocationGroup>();
    const qaStatus: QAStatus = disposition === "rejected" ? "DAMAGED" : "GOOD";

    for (const allocation of allocations) {
        const lotId = Number(allocation.storageLotId);
        if (!Number.isSafeInteger(lotId) || lotId <= 0) continue;

        const lot = storageLots.find(candidate => Number(candidate.lot_id) === lotId);
        const current = groups.get(lotId) || {
            lot_id: lotId,
            lot_name: lot?.lot_name || `Lot ${lotId}`,
            max_batch_capacity: lotCapacity(lot),
            unit_id: lotUnitId(lot),
            unit_name: productUomName,
            allocated_quantity: 0,
            current_stock_quantity: Math.max(0, Number(lot?.occupiedQuantity || 0)),
            batches: [],
        };

        const quantity = Number(allocation.quantity);
        const normalizedQuantity = Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
        current.batches.push({
            batch_no: allocation.batchNumber || "",
            manufacturing_date: allocation.manufacturingDate || "",
            expiry_date: allocation.expirationDate || "",
            quantity: normalizedQuantity,
            qa_status: qaStatus,
        });
        current.allocated_quantity += normalizedQuantity;
        groups.set(lotId, current);
    }

    return Array.from(groups.values());
}

function fromSharedLotAllocations(result: LotBatchSelectionResult): ReceivingLotAllocationInput[] {
    const groups = result.lot_allocations || [];
    return groups.flatMap(group => (group.batches || []).map(batch => ({
        clientId: uuidv4(),
        allocationGroupId: `lot-${group.lot_id}`,
        storageLotId: String(group.lot_id),
        batchNumber: String(batch.batch_no || ""),
        manufacturingDate: batch.manufacturing_date ? String(batch.manufacturing_date).slice(0, 10) : "",
        expirationDate: batch.expiry_date ? String(batch.expiry_date).slice(0, 10) : "",
        quantity: Number.isFinite(Number(batch.quantity)) ? Math.max(0, Number(batch.quantity)) : 0,
    })));
}

export interface LotAllocationModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    branchId?: number | null;
    productId: number;
    productName: string;
    productCode?: string;
    productType?: unknown;
    productCategory?: unknown;
    categoryName?: string;
    productUnitId: number | null;
    productUomName?: string;
    isPackaging: boolean;
    disposition: AllocationDisposition;
    allocations: ReceivingLotAllocationInput[];
    otherAllocations: ReceivingLotAllocationInput[];
    expectedQuantity: number;
    storageLots: StorageLot[];
    readOnly: boolean;
    batchDateDefaults: { manufacturingDate: string; expirationDate: string };
    loadStorageLotBatches: (productId: number, lotId: number, branchId?: number, disposition?: "accepted" | "rejected") => Promise<StorageLotBatch[]>;
    onChange: (allocations: ReceivingLotAllocationInput[]) => void;
}

export function LotAllocationModal({
    open,
    onOpenChange,
    branchId,
    productId,
    productName,
    productCode,
    productType,
    productCategory,
    categoryName,
    productUnitId,
    productUomName = "units",
    isPackaging,
    disposition,
    allocations,
    otherAllocations,
    expectedQuantity,
    storageLots,
    readOnly,
    onChange,
}: LotAllocationModalProps) {
    const allowedLotIds = React.useMemo(() => {
        const ids = new Set<number>();
        for (const lot of storageLots) {
            const lotId = Number(lot.lot_id);
            if (Number.isSafeInteger(lotId) && lotId > 0) ids.add(lotId);
        }
        for (const allocation of [...allocations, ...otherAllocations]) {
            const lotId = Number(allocation.storageLotId);
            if (Number.isSafeInteger(lotId) && lotId > 0) ids.add(lotId);
        }
        return Array.from(ids);
    }, [allocations, otherAllocations, storageLots]);
    const initialLotAllocations = React.useMemo(
        () => toSharedLotAllocations(allocations, storageLots, productUomName, disposition),
        [allocations, disposition, productUomName, storageLots],
    );
    const existingFormAllocations = React.useMemo(() => {
        const siblingLotAllocations = toSharedLotAllocations(otherAllocations, storageLots, productUomName, disposition);
        if (siblingLotAllocations.length === 0) return undefined;
        return [{
            product_id: productId,
            product_name: productName,
            product_code: productCode,
            product_type: productType,
            product_category: productCategory,
            category_name: categoryName,
            lot_allocations: siblingLotAllocations,
        }];
    }, [categoryName, disposition, otherAllocations, productCategory, productCode, productId, productName, productType, productUomName, storageLots]);
    const resolvedBranchId = branchId || storageLots.find(lot => lot.allocation_branch_id || lot.branch_id)?.allocation_branch_id || storageLots.find(lot => lot.branch_id)?.branch_id || undefined;

    const handleConfirm = (result: LotBatchSelectionResult) => {
        onChange(fromSharedLotAllocations(result));
    };

    return (
        <StockAdjustmentLotBatchSelectionModal
            open={open}
            onOpenChange={onOpenChange}
            branchId={resolvedBranchId || undefined}
            productId={productId}
            productName={productName}
            productCode={productCode}
            productUomId={productUnitId}
            productUomName={productUomName}
            productType={productType}
            productCategory={productCategory}
            categoryName={categoryName}
            requestedQuantity={expectedQuantity}
            adjustmentType="IN"
            requireBatchDates={!isPackaging}
            mode="CREATE_OR_ASSIGN"
            readOnly={readOnly}
            initialValues={{ qa_status: disposition === "rejected" ? "DAMAGED" : "GOOD", total_quantity: expectedQuantity }}
            initialLotAllocations={initialLotAllocations}
            existingFormAllocations={existingFormAllocations}
            allowedLotIds={allowedLotIds}
            onConfirm={handleConfirm}
        />
    );
}

export interface LotAllocationSectionProps {
    branchId?: number | null;
    productId: number;
    productName: string;
    productCode?: string;
    productType?: unknown;
    productCategory?: unknown;
    categoryName?: string;
    productUnitId: number | null;
    productUomName?: string;
    isPackaging: boolean;
    disposition: AllocationDisposition;
    allocations: ReceivingLotAllocationInput[];
    otherAllocations: ReceivingLotAllocationInput[];
    expectedQuantity: number;
    storageLots: StorageLot[];
    readOnly: boolean;
    compact?: boolean;
    batchDateDefaults: { manufacturingDate: string; expirationDate: string };
    loadStorageLotBatches: (productId: number, lotId: number, branchId?: number, disposition?: "accepted" | "rejected") => Promise<StorageLotBatch[]>;
    onChange: (allocations: ReceivingLotAllocationInput[]) => void;
}

export function LotAllocationSection({
    branchId,
    productId,
    productName,
    productCode,
    productType,
    productCategory,
    categoryName,
    productUnitId,
    productUomName,
    isPackaging,
    disposition,
    allocations,
    otherAllocations,
    expectedQuantity,
    storageLots,
    readOnly,
    compact = false,
    batchDateDefaults,
    loadStorageLotBatches,
    onChange,
}: LotAllocationSectionProps) {
    const [open, setOpen] = React.useState(false);
    const tone = disposition === "accepted"
        ? { label: "Accepted", text: "text-emerald-700", border: "border-emerald-500/30" }
        : { label: "Rejected", text: "text-red-700", border: "border-red-500/30" };
    const total = allocations.reduce((sum, allocation) => sum + Math.max(0, Number(allocation.quantity) || 0), 0);

    return (
        <div className={compact ? "space-y-1" : "space-y-2"}>
            {!compact && (allocations.length === 0 ? (
                <div className={`rounded-lg border px-3 py-3 text-center text-[10px] text-muted-foreground ${tone.border}`}>
                    No {tone.label.toLowerCase()} lot allocations yet.
                </div>
            ) : (
                <div className={`overflow-x-auto rounded-lg border ${tone.border}`}>
                    <table className="w-full min-w-[560px] text-[10px]">
                        <thead className="bg-muted/40 text-muted-foreground uppercase text-[9px] font-extrabold tracking-wider">
                            <tr>
                                <th scope="col" className="px-2 py-2 text-left">Storage lot</th>
                                <th scope="col" className="px-2 py-2 text-left">Batch No.</th>
                                <th scope="col" className="px-2 py-2 text-left">Mfg Date</th>
                                <th scope="col" className="px-2 py-2 text-left">Expiry Date</th>
                                <th scope="col" className="px-2 py-2 text-right">Qty</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {allocations.map(allocation => {
                                const lot = storageLots.find(candidate => String(candidate.lot_id) === String(allocation.storageLotId));
                                return (
                                    <tr key={allocation.clientId}>
                                        <td className="px-2 py-2 font-semibold">{lot?.lot_name || `Lot ${allocation.storageLotId}`}</td>
                                        <td className="px-2 py-2">{allocation.batchNumber || "-"}</td>
                                        <td className="px-2 py-2">{allocation.manufacturingDate || "-"}</td>
                                        <td className="px-2 py-2">{allocation.expirationDate || "-"}</td>
                                        <td className="px-2 py-2 text-right font-semibold tabular-nums">{Number(allocation.quantity || 0).toLocaleString()}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ))}
            <div className={compact ? "flex flex-col items-end gap-1" : "flex flex-wrap items-center justify-between gap-2"}>
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className={`h-8 whitespace-nowrap rounded-lg border bg-background px-2.5 text-[10px] font-extrabold hover:bg-muted ${tone.text} ${tone.border}`}
                >
                    {readOnly ? "View allocated lots" : allocations.length === 0 ? "* Assign Lot & Batch" : "Manage lot allocation"}
                </button>
                <div className={`text-[10px] font-bold ${Math.abs(total - expectedQuantity) > 1e-9 ? "text-red-600" : tone.text}`}>
                    {tone.label} allocated: {total.toLocaleString()} / {expectedQuantity.toLocaleString()}
                </div>
            </div>
            <LotAllocationModal
                open={open}
                onOpenChange={setOpen}
                branchId={branchId}
                productId={productId}
                productName={productName}
                productCode={productCode}
                productType={productType}
                productCategory={productCategory}
                categoryName={categoryName}
                productUnitId={productUnitId}
                productUomName={productUomName}
                isPackaging={isPackaging}
                disposition={disposition}
                allocations={allocations}
                otherAllocations={otherAllocations}
                expectedQuantity={expectedQuantity}
                storageLots={storageLots}
                readOnly={readOnly}
                batchDateDefaults={batchDateDefaults}
                loadStorageLotBatches={loadStorageLotBatches}
                onChange={onChange}
            />
        </div>
    );
}
