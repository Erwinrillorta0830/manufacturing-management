"use client";

import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { CreatableSelect } from "@/modules/manufacturing-management/finished-goods/components/CreatableSelect";
import { ReceivingLotAllocationInput, StorageLot, StorageLotBatch } from "../types";

type AllocationDisposition = "accepted" | "rejected";

type AllocationField = "batchNumber" | "manufacturingDate" | "expirationDate" | "quantity";

interface LotAllocationGroup {
    groupId: string;
    storageLotId: string;
    allocations: ReceivingLotAllocationInput[];
}

function relationNumber(value: unknown, keys: string[]): number | null {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of keys) {
            const nested = relationNumber(record[key], keys);
            if (nested !== null) return nested;
        }
        return null;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function storageLotUnitId(lot: StorageLot): number | null {
    return relationNumber(lot.unit_id, ["unit_id", "id"])
        || relationNumber(lot.uom_id, ["uom_id", "unit_id", "id"]);
}

interface StorageLotSelectProps {
    value: string | number;
    disabled?: boolean;
    storageLots: StorageLot[];
    productUnitId: number | null;
    id?: string;
    ariaLabel?: string;
    onChange: (value: string) => void;
}

function SearchableStorageLotSelect({
    value,
    disabled,
    storageLots,
    productUnitId,
    id,
    ariaLabel,
    onChange
}: StorageLotSelectProps) {
    const options = React.useMemo(() => {
        const seenLotIds = new Set<string>();
        return storageLots
            .filter(lot => {
                const isCurrent = String(lot.lot_id) === String(value);
                const isUomCompatible = productUnitId !== null && storageLotUnitId(lot) === productUnitId;
                return (lot.is_selectable !== false || isCurrent) && (isUomCompatible || isCurrent);
            })
            .filter(lot => {
                const lotId = String(lot.lot_id);
                if (seenLotIds.has(lotId)) return false;
                seenLotIds.add(lotId);
                return true;
            })
            .map(lot => {
                const lotId = String(lot.lot_id);
                const lotName = String(lot.lot_name || lot.lot_code || `Lot ${lotId}`);
                const available = lot.availableQuantity ?? lot.max_batch_capacity;
                const isCurrent = lotId === String(value);
                const isUomMismatch = productUnitId === null || storageLotUnitId(lot) !== productUnitId;
                const isFull = typeof lot.availableQuantity === "number" && lot.availableQuantity <= 0;
                const availabilityLabel = lot.capacity_status === "UNCONFIGURED"
                    ? "capacity not configured"
                    : typeof available === "number"
                        ? `${available.toLocaleString()} available`
                        : "availability unavailable";

                return {
                    value: lotId,
                    label: `${lotName} (${isUomMismatch ? "UOM mismatch - replace" : availabilityLabel})`,
                    disabled: isUomMismatch || (isFull && !isCurrent)
                };
            });
    }, [productUnitId, storageLots, value]);

    return (
        <div data-testid="storage-lot-picker" aria-label={ariaLabel} className="relative min-w-0 flex-1 overflow-visible">
            <CreatableSelect
                id={id}
                options={options}
                value={String(value || "")}
                onValueChange={onChange}
                aria-label={ariaLabel}
                placeholder="Select storage lot..."
                searchPlaceholder="Search storage lot..."
                disabled={disabled}
                className="h-9 w-full rounded-lg text-[10px] font-semibold"
                popoverClassName="z-[100] min-w-[240px] max-w-[calc(100vw-2rem)] p-0"
            />
        </div>
    );
}

interface SearchableBatchSelectProps {
    value: string;
    disabled?: boolean;
    availableBatches: StorageLotBatch[];
    id?: string;
    ariaLabel?: string;
    className?: string;
    invalid?: boolean;
    onChange: (value: string) => void;
}

function SearchableBatchSelect({
    value,
    disabled,
    availableBatches,
    id,
    ariaLabel,
    className,
    invalid,
    onChange
}: SearchableBatchSelectProps) {
    const options = React.useMemo(() => {
        const seenBatchNumbers = new Set<string>();
        const batchOptions = availableBatches.flatMap(batch => {
            const batchNumber = String(batch.batchNumber || "").trim();
            if (!batchNumber || seenBatchNumbers.has(batchNumber)) return [];
            seenBatchNumbers.add(batchNumber);
            return [{ value: batchNumber, label: batchNumber }];
        });
        const currentBatchNumber = value.trim();

        if (currentBatchNumber && !seenBatchNumbers.has(currentBatchNumber)) {
            batchOptions.unshift({ value: currentBatchNumber, label: currentBatchNumber });
        }

        return batchOptions;
    }, [availableBatches, value]);

    return (
        <div data-testid="batch-picker" aria-label={ariaLabel} className="relative min-w-0 w-full overflow-visible">
            <CreatableSelect
                id={id}
                options={options}
                value={value}
                onValueChange={onChange}
                onCreateOption={onChange}
                aria-label={ariaLabel}
                placeholder="Select or assign batch"
                searchPlaceholder="Search or assign batch..."
                disabled={disabled}
                aria-invalid={invalid}
                className={className || "h-9 w-full rounded-lg text-[10px] font-semibold"}
                popoverClassName="z-[100] min-w-[220px] max-w-[calc(100vw-2rem)] p-0"
            />
        </div>
    );
}

export interface LotAllocationModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    productId: number;
    productName: string;
    productUnitId: number | null;
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
    productId,
    productName,
    productUnitId,
    isPackaging,
    disposition,
    allocations,
    otherAllocations,
    expectedQuantity,
    storageLots,
    readOnly,
    batchDateDefaults,
    loadStorageLotBatches,
    onChange
}: LotAllocationModalProps) {
    const [draft, setDraft] = React.useState<ReceivingLotAllocationInput[]>(allocations);
    const wasOpen = React.useRef(false);
    const [batchOptionsByLot, setBatchOptionsByLot] = React.useState<Record<number, StorageLotBatch[]>>({});
    const tone = disposition === "accepted"
        ? { label: "Accepted", text: "text-emerald-700", border: "border-emerald-500/30", input: "focus:border-emerald-500" }
        : { label: "Rejected", text: "text-red-700", border: "border-red-500/30", input: "focus:border-red-500" };

    React.useEffect(() => {
        if (open && !wasOpen.current) setDraft(allocations);
        wasOpen.current = open;
    }, [open, allocations]);

    const loadBatches = React.useCallback((lotId: number) => {
        if (batchOptionsByLot[lotId]) return;
        const lot = storageLots.find(candidate => String(candidate.lot_id) === String(lotId));
        if (!lot || productUnitId === null || storageLotUnitId(lot) !== productUnitId) return;
        const lotBranchId = lot.branch_id || undefined;
        void loadStorageLotBatches(productId, lotId, lotBranchId || undefined, disposition)
            .then(batches => setBatchOptionsByLot(previous => ({ ...previous, [lotId]: batches })))
            .catch(error => {
                if ((error as Error).name !== "AbortError") {
                    setBatchOptionsByLot(previous => ({ ...previous, [lotId]: [] }));
                }
            });
    }, [batchOptionsByLot, disposition, loadStorageLotBatches, productId, productUnitId, storageLots]);

    React.useEffect(() => {
        for (const allocation of draft) {
            const lotId = Number(allocation.storageLotId);
            if (Number.isFinite(lotId) && lotId > 0) loadBatches(lotId);
        }
    }, [draft, loadBatches]);

    const groups = React.useMemo<LotAllocationGroup[]>(() => {
        const grouped = new Map<string, LotAllocationGroup>();

        draft.forEach(allocation => {
            const storageLotId = String(allocation.storageLotId || "");
            const fallbackGroupId = allocation.allocationGroupId || `legacy-${allocation.clientId}`;
            const groupKey = storageLotId ? `lot-${storageLotId}` : `group-${fallbackGroupId}`;
            const existing = grouped.get(groupKey);

            if (existing) {
                existing.allocations.push(allocation);
                return;
            }

            grouped.set(groupKey, {
                groupId: allocation.allocationGroupId || fallbackGroupId,
                storageLotId,
                allocations: [allocation]
            });
        });

        return Array.from(grouped.values());
    }, [draft]);

    const updateAllocation = (groupId: string, clientId: string, field: AllocationField, value: string | number) => {
        setDraft(draft.map(allocation => (
            allocation.clientId === clientId
                ? { ...allocation, allocationGroupId: allocation.allocationGroupId || groupId, [field]: value }
                : allocation
        )));
    };

    const changeLot = (group: LotAllocationGroup, value: string) => {
        const lotId = Number(value);
        const groupClientIds = new Set(group.allocations.map(allocation => allocation.clientId));

        setDraft(draft.map(allocation => (
            groupClientIds.has(allocation.clientId)
                ? { ...allocation, allocationGroupId: group.groupId, storageLotId: value, batchNumber: "", manufacturingDate: "", expirationDate: "" }
                : allocation
        )));
        if (Number.isSafeInteger(lotId) && lotId > 0) loadBatches(lotId);
    };

    const addBatch = (group: LotAllocationGroup) => {
        if (readOnly || !group.storageLotId) return;

        setDraft([
            ...draft,
            {
                clientId: uuidv4(),
                allocationGroupId: group.groupId,
                storageLotId: group.storageLotId,
                batchNumber: "",
                manufacturingDate: batchDateDefaults.manufacturingDate,
                expirationDate: batchDateDefaults.expirationDate,
                quantity: ""
            }
        ]);
    };

    const removeBatch = (clientId: string) => {
        setDraft(draft.filter(allocation => allocation.clientId !== clientId));
    };

    const addLot = () => {
        if (readOnly) return;
        setDraft([
            ...draft,
            {
                clientId: uuidv4(),
                allocationGroupId: uuidv4(),
                storageLotId: "",
                batchNumber: "",
                manufacturingDate: batchDateDefaults.manufacturingDate,
                expirationDate: batchDateDefaults.expirationDate,
                quantity: ""
            }
        ]);
    };

    const total = draft.reduce((sum, allocation) => sum + Math.max(0, Number(allocation.quantity) || 0), 0);
    const effectiveStorageLots = React.useMemo(() => {
        const knownIds = new Set(storageLots.map(lot => String(lot.lot_id)));
        const historicalLots = new Map<number, StorageLot>();

        draft.forEach(allocation => {
            const lotId = Number(allocation.storageLotId);
            if (!Number.isSafeInteger(lotId) || lotId <= 0 || knownIds.has(String(lotId))) return;
            historicalLots.set(lotId, {
                lot_id: lotId,
                lot_name: `Lot ${allocation.storageLotId}`,
                max_batch_capacity: null,
                availableQuantity: null
            });
        });

        return [...storageLots, ...Array.from(historicalLots.values())];
    }, [draft, storageLots]);

    const knownStorageLotIds = React.useMemo(
        () => new Set(storageLots.map(lot => String(lot.lot_id))),
        [storageLots]
    );
    const usedLotIds = React.useMemo(
        () => new Set(groups.map(group => group.storageLotId).filter(Boolean)),
        [groups]
    );
    const hasUnassignedGroup = groups.some(group => !group.storageLotId);
    const canAddLot = !readOnly
        && !hasUnassignedGroup
        && storageLots.some(lot => {
            if (productUnitId === null || storageLotUnitId(lot) !== productUnitId) return false;
            const availableQuantity = lot.availableQuantity;
            const hasCapacity = availableQuantity === null
                || availableQuantity === undefined
                || !Number.isFinite(Number(availableQuantity))
                || Number(availableQuantity) > 0;
            return hasCapacity && !usedLotIds.has(String(lot.lot_id));
        });

    const getStorageLotsForGroup = (group: LotAllocationGroup) => {
        const usedByOtherGroup = new Set(
            groups
                .filter(otherGroup => otherGroup.groupId !== group.groupId)
                .map(otherGroup => otherGroup.storageLotId)
                .filter(Boolean)
        );

        return effectiveStorageLots.filter(lot => {
            const lotId = String(lot.lot_id);
            if (lotId === group.storageLotId) return true;
            return knownStorageLotIds.has(lotId) && !usedByOtherGroup.has(lotId);
        });
    };

    const incomingByLot = React.useMemo(() => {
        const incoming = new Map<string, number>();
        const addAllocations = (source: ReceivingLotAllocationInput[]) => {
            for (const allocation of source) {
                const lotId = String(allocation.storageLotId || "");
                if (!lotId) continue;
                incoming.set(lotId, (incoming.get(lotId) || 0) + Math.max(0, Number(allocation.quantity) || 0));
            }
        };
        if (disposition === "rejected") addAllocations(otherAllocations);
        addAllocations(draft);
        if (disposition === "accepted") addAllocations(otherAllocations);
        return incoming;
    }, [draft, disposition, otherAllocations]);

    const capacityOverageByClientId = React.useMemo(() => {
        const orderedAllocations = disposition === "accepted"
            ? [...draft, ...otherAllocations]
            : [...otherAllocations, ...draft];
        const incomingByLotCursor = new Map<string, number>();
        const overageByClientId = new Map<string, number>();

        for (const allocation of orderedAllocations) {
            const lotId = String(allocation.storageLotId || "");
            if (!lotId) continue;
            const selectedLot = effectiveStorageLots.find(lot => String(lot.lot_id) === lotId);
            const availableQuantity = selectedLot?.availableQuantity;
            if (availableQuantity === null || availableQuantity === undefined || !Number.isFinite(Number(availableQuantity))) continue;

            const incomingBeforeAllocation = incomingByLotCursor.get(lotId) || 0;
            const remainingBeforeAllocation = Math.max(0, Number(availableQuantity) - incomingBeforeAllocation);
            const quantity = Math.max(0, Number(allocation.quantity) || 0);
            const overageQuantity = Math.max(0, quantity - remainingBeforeAllocation);
            if (overageQuantity > 1e-9) overageByClientId.set(allocation.clientId, overageQuantity);
            incomingByLotCursor.set(lotId, incomingBeforeAllocation + quantity);
        }

        return overageByClientId;
    }, [draft, disposition, effectiveStorageLots, otherAllocations]);

    const validationErrors = React.useMemo(() => {
        const errors: string[] = [];
        if (Math.abs(total - expectedQuantity) > 1e-9) {
            errors.push(`${tone.label} allocations (${total.toLocaleString()}) must equal the ${tone.label.toLowerCase()} quantity (${expectedQuantity.toLocaleString()}).`);
        }
        for (const group of groups) {
            if (!group.storageLotId) {
                errors.push(`Lot #${groups.indexOf(group) + 1}: select a storage lot before applying.`);
                continue;
            }
            const selectedLot = effectiveStorageLots.find(lot => String(lot.lot_id) === group.storageLotId);
            if (!selectedLot) continue;
            const selectedLotUomId = storageLotUnitId(selectedLot);
            if (productUnitId === null || selectedLotUomId !== productUnitId) {
                errors.push(`${selectedLot.lot_name || group.storageLotId}: storage lot UOM does not match the product UOM.`);
            }
            const targetClassification = selectedLot.target_classification?.code;
            const conflict = (selectedLot.stored_products || []).find(stored =>
                stored.classification_code !== "OTHER"
                && stored.classification_code !== targetClassification
            );
            if (conflict) {
                errors.push(`${selectedLot.lot_name || group.storageLotId} already contains ${conflict.product_name} (${conflict.classification_label}); a lot cannot receive a different product type.`);
            }
            const lotIncoming = incomingByLot.get(group.storageLotId) || 0;
            const availableQuantity = selectedLot.availableQuantity;
            if (availableQuantity !== null && availableQuantity !== undefined && Number.isFinite(Number(availableQuantity))) {
                const overage = lotIncoming - Math.max(0, Number(availableQuantity));
                if (overage > 1e-9) {
                    errors.push(`${selectedLot.lot_name || group.storageLotId} exceeds its maximum occupancy by ${overage.toLocaleString()} ${tone.label.toLowerCase()} unit(s) (${lotIncoming.toLocaleString()} incoming vs ${Math.max(0, Number(availableQuantity)).toLocaleString()} available).`);
                }
            }
        }
        for (const allocation of draft) {
            const group = groups.find(candidate => candidate.allocations.some(row => row.clientId === allocation.clientId));
            const selectedLot = group ? effectiveStorageLots.find(lot => String(lot.lot_id) === group.storageLotId) : undefined;
            const lotLabel = selectedLot?.lot_name || group?.storageLotId || "Unassigned lot";
            if (!allocation.batchNumber.trim()) {
                errors.push(`${lotLabel}: batch number is required for every allocation.`);
            }
            if (!isPackaging && Number(allocation.quantity) > 0 && (!allocation.manufacturingDate || !allocation.expirationDate)) {
                errors.push(`${lotLabel}: manufacturing and expiry dates are required for raw materials and finished goods.`);
            }
            if (allocation.manufacturingDate && allocation.expirationDate && allocation.manufacturingDate > allocation.expirationDate) {
                errors.push(`${lotLabel}: manufacturing date cannot be later than the expiry date.`);
            }
            if (!(Number(allocation.quantity) > 0)) {
                errors.push(`${lotLabel}: allocation quantity must be greater than zero.`);
            }
        }
        return errors;
    }, [draft, effectiveStorageLots, expectedQuantity, groups, incomingByLot, isPackaging, productUnitId, tone.label, total]);

    const applyDisabled = readOnly || validationErrors.length > 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl p-0 gap-0" data-testid={`lot-allocation-modal-${disposition}`}>
                <DialogHeader className="border-b px-5 py-4">
                    <DialogTitle className="text-sm font-extrabold">
                        {tone.label} Lot &amp; Batch Allocation
                    </DialogTitle>
                    <DialogDescription className="text-[11px]">
                        {productName} · allocate {expectedQuantity.toLocaleString()} {tone.label.toLowerCase()} unit(s) across storage lots. Lots already holding a different product type are hidden, and allocations cannot exceed a lot&apos;s maximum occupancy.
                    </DialogDescription>
                </DialogHeader>
                <div className="max-h-[65vh] overflow-y-auto px-5 py-4">
                    <div className="space-y-2">
                        {groups.length === 0 ? (
                            <div className={`rounded-lg border px-3 py-3 text-center text-[10px] text-muted-foreground ${tone.border}`}>
                                No {tone.label.toLowerCase()} lot groups added.
                            </div>
                        ) : groups.map(group => {
                            const selectedLot = effectiveStorageLots.find(lot => String(lot.lot_id) === group.storageLotId);
                            const selectedLotUomId = selectedLot ? storageLotUnitId(selectedLot) : null;
                            const selectedLotUomMismatch = selectedLot !== undefined
                                && (productUnitId === null || selectedLotUomId !== productUnitId);
                            const groupTotal = group.allocations.reduce((sum, allocation) => sum + Math.max(0, Number(allocation.quantity) || 0), 0);
                            const lotIncomingTotal = incomingByLot.get(group.storageLotId) || 0;
                            const lotRemaining = selectedLot?.availableQuantity === null || selectedLot?.availableQuantity === undefined
                                ? null
                                : Number(selectedLot.availableQuantity) - lotIncomingTotal;

                            return (
                                <div key={group.groupId} className={`overflow-visible rounded-lg border ${tone.border}`}>
                                    <div className="border-b bg-muted/30 px-2 py-2">
                                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                                            <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                                                <span className="shrink-0 text-[9px] font-extrabold uppercase tracking-wider text-foreground">Lot *</span>
                                                <div className="w-full min-w-0 max-w-[460px]">
                                                    <SearchableStorageLotSelect
                                                        value={group.storageLotId}
                                                        disabled={readOnly}
                                                        storageLots={getStorageLotsForGroup(group)}
                                                        productUnitId={productUnitId}
                                                        id={`receiving-${disposition}-${group.groupId.replace(/[^a-zA-Z0-9_-]/g, "-")}-storage-lot`}
                                                        ariaLabel={tone.label + " storage lot"}
                                                        onChange={value => changeLot(group, value)}
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap items-center justify-between gap-2 lg:justify-end">
                                                <span className="text-[9px] font-semibold text-muted-foreground">
                                                    {selectedLot
                                                        ? `${groupTotal.toLocaleString()} allocated · ${lotRemaining === null ? "capacity not configured" : `${Math.max(0, lotRemaining).toLocaleString()} remaining`}`
                                                        : "Select an eligible lot before assigning batches."}
                                                </span>
                                                {lotRemaining !== null && lotRemaining < -1e-9 && (
                                                    <span className="text-[9px] font-bold text-red-700" role="alert">
                                                        Maximum occupancy exceeded: {Math.abs(lotRemaining).toLocaleString()} unit(s) over available capacity. Reduce the allocation before applying.
                                                    </span>
                                                )}
                                                {!readOnly && (
                                                    <button
                                                        type="button"
                                                        onClick={() => addBatch(group)}
                                                        disabled={!group.storageLotId || selectedLotUomMismatch}
                                                        className={"h-8 px-2.5 rounded-lg border bg-background text-[10px] font-extrabold flex items-center gap-1.5 hover:bg-muted disabled:opacity-50 " + tone.text + " " + tone.border}
                                                        aria-label={"Add batch to " + tone.label.toLowerCase() + " lot group"}
                                                    >
                                                        <Plus className="h-3.5 w-3.5" /> Add Batch
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {selectedLot && (
                                            <div className="mt-1 text-[9px] font-semibold text-muted-foreground">
                                                {selectedLot.lot_name} · {selectedLot.availableQuantity ?? selectedLot.max_batch_capacity ?? "capacity not configured"} unit(s) available before this receipt
                                                {selectedLot.occupiedQuantity ? ` · ${selectedLot.occupiedQuantity.toLocaleString()} unit(s) already stored` : ""}.
                                            </div>
                                        )}
                                        {selectedLotUomMismatch && (
                                            <p className="mt-1 text-[9px] font-bold text-red-700" role="alert">
                                                Storage lot {selectedLot?.lot_name || group.storageLotId} does not match this product&apos;s UOM. Select a compatible lot before adding batches.
                                            </p>
                                        )}
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[720px] text-[10px]">
                                            <caption className="sr-only">{tone.label} inventory lot allocations for {selectedLot?.lot_name || "unassigned lot"}</caption>
                                            <thead className="bg-muted/40 text-muted-foreground uppercase text-[9px] font-extrabold tracking-wider">
                                                <tr>
                                                    <th scope="col" className="w-[30%] px-2 py-2 text-left">Batch No. *</th>
                                                    <th scope="col" className="w-[22%] px-2 py-2 text-left">Mfg Date</th>
                                                    <th scope="col" className="w-[22%] px-2 py-2 text-left">Expiry Date</th>
                                                    <th scope="col" className="w-[16%] px-2 py-2 text-right">Qty *</th>
                                                    <th scope="col" className="w-12 px-2 py-2 text-center">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {group.allocations.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={5} className="px-3 py-3 text-center text-muted-foreground">
                                                            No batches assigned to this lot.
                                                        </td>
                                                    </tr>
                                                ) : group.allocations.map(allocation => {
                                                    const capacityOverageQuantity = capacityOverageByClientId.get(allocation.clientId) || 0;
                                                    const batchOptions = selectedLot ? batchOptionsByLot[selectedLot.lot_id] || [] : [];
                                                    const dateRequired = !isPackaging && Number(allocation.quantity) > 0;
                                                    const missingBatch = !allocation.batchNumber.trim();
                                                    const invalidDates = dateRequired && (!allocation.manufacturingDate || !allocation.expirationDate);
                                                    const batchControlId = "receiving-batches-" + disposition + "-" + allocation.clientId;

                                                    return (
                                                        <tr key={allocation.clientId} className="bg-background/70 align-top">
                                                            <td className="px-2 py-2">
                                                                <SearchableBatchSelect
                                                                    id={batchControlId}
                                                                    value={allocation.batchNumber}
                                                                    availableBatches={batchOptions}
                                                                    disabled={readOnly || !group.storageLotId}
                                                                    ariaLabel={tone.label + " batch number"}
                                                                    invalid={missingBatch && !readOnly}
                                                                    className={"h-9 w-full rounded-lg text-[10px] font-semibold " + (missingBatch && !readOnly ? "border-amber-500" : "border-border") + " " + tone.input}
                                                                    onChange={value => updateAllocation(group.groupId, allocation.clientId, "batchNumber", value)}
                                                                />
                                                            </td>
                                                            <td className="px-2 py-2">
                                                                <input
                                                                    id={batchControlId + "-manufacturing-date"}
                                                                    type="date"
                                                                    value={allocation.manufacturingDate}
                                                                    max={allocation.expirationDate || undefined}
                                                                    required={dateRequired}
                                                                    disabled={readOnly || !group.storageLotId || !allocation.batchNumber.trim()}
                                                                    onChange={event => updateAllocation(group.groupId, allocation.clientId, "manufacturingDate", event.target.value)}
                                                                    className={"h-9 w-full rounded-lg border bg-background px-2 text-[10px] font-semibold outline-none " + (invalidDates && !allocation.manufacturingDate && !readOnly ? "border-amber-500" : "border-border") + " " + tone.input}
                                                                    aria-label={tone.label + " manufacturing date"}
                                                                />
                                                            </td>
                                                            <td className="px-2 py-2">
                                                                <input
                                                                    id={batchControlId + "-expiration-date"}
                                                                    type="date"
                                                                    value={allocation.expirationDate}
                                                                    min={allocation.manufacturingDate || undefined}
                                                                    required={dateRequired}
                                                                    disabled={readOnly || !group.storageLotId || !allocation.batchNumber.trim()}
                                                                    onChange={event => updateAllocation(group.groupId, allocation.clientId, "expirationDate", event.target.value)}
                                                                    className={"h-9 w-full rounded-lg border bg-background px-2 text-[10px] font-semibold outline-none " + (invalidDates && !allocation.expirationDate && !readOnly ? "border-amber-500" : "border-border") + " " + tone.input}
                                                                    aria-label={tone.label + " expiry date"}
                                                                />
                                                            </td>
                                                            <td className="px-2 py-2">
                                                                <input
                                                                    id={batchControlId + "-quantity"}
                                                                    type="number"
                                                                    min="0"
                                                                    step="any"
                                                                    value={allocation.quantity}
                                                                    disabled={readOnly || !group.storageLotId || !allocation.batchNumber.trim()}
                                                                    onChange={event => updateAllocation(group.groupId, allocation.clientId, "quantity", event.target.value === "" ? "" : Number(event.target.value))}
                                                                    className={"h-9 w-full rounded-lg border bg-background px-2.5 text-[10px] font-semibold text-right outline-none " + (capacityOverageQuantity > 1e-9 ? "border-red-500" : "border-border") + " " + tone.input}
                                                                    aria-label={tone.label + " quantity for " + (selectedLot?.lot_name || group.storageLotId)}
                                                                    aria-describedby={capacityOverageQuantity > 1e-9 ? batchControlId + "-capacity-warning" : undefined}
                                                                />
                                                                {capacityOverageQuantity > 1e-9 && (
                                                                    <span id={batchControlId + "-capacity-warning"} className="mt-1 block text-[9px] font-semibold text-red-700" role="alert">
                                                                        Exceeds maximum occupancy by {capacityOverageQuantity.toLocaleString()} unit(s).
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-2 py-2 text-center">
                                                                {!readOnly ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeBatch(allocation.clientId)}
                                                                        className="h-9 w-9 rounded-lg border text-muted-foreground hover:border-red-300 hover:text-red-600 flex items-center justify-center mx-auto"
                                                                        aria-label={"Remove " + tone.label.toLowerCase() + " batch allocation"}
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </button>
                                                                ) : (
                                                                    <span className="text-muted-foreground" aria-hidden="true">-</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        })}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            {!readOnly && (
                                <button
                                    type="button"
                                    onClick={addLot}
                                    disabled={!canAddLot}
                                    className={"h-8 px-2.5 rounded-lg border bg-background text-[10px] font-extrabold flex items-center gap-1.5 hover:bg-muted disabled:opacity-50 " + tone.text + " " + tone.border}
                                >
                                    <Plus className="h-3.5 w-3.5" /> Add Lot
                                </button>
                            )}
                            <div className={`text-[10px] font-bold ${Math.abs(total - expectedQuantity) > 1e-9 ? "text-red-600" : tone.text}`}>
                                {tone.label} allocated: {total.toLocaleString()} / {expectedQuantity.toLocaleString()}
                            </div>
                        </div>
                        {validationErrors.length > 0 && (
                            <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[10px] font-semibold text-red-700" role="alert">
                                <ul className="list-disc space-y-0.5 pl-4">
                                    {validationErrors.map((error, index) => (
                                        <li key={`${index}-${error}`}>{error}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
                <DialogFooter className="border-t px-5 py-3">
                    <div className="flex w-full justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => onOpenChange(false)}
                            className="h-9 rounded-lg border bg-background px-3 text-[11px] font-extrabold hover:bg-muted"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={applyDisabled}
                            onClick={() => {
                                onChange(draft);
                                onOpenChange(false);
                            }}
                            className="h-9 rounded-lg border border-primary bg-primary px-3 text-[11px] font-extrabold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Apply Allocations
                        </button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export interface LotAllocationSectionProps {
    productId: number;
    productName: string;
    productUnitId: number | null;
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

export function LotAllocationSection({
    productId,
    productName,
    productUnitId,
    isPackaging,
    disposition,
    allocations,
    otherAllocations,
    expectedQuantity,
    storageLots,
    readOnly,
    batchDateDefaults,
    loadStorageLotBatches,
    onChange
}: LotAllocationSectionProps) {
    const [open, setOpen] = React.useState(false);
    const tone = disposition === "accepted"
        ? { label: "Accepted", text: "text-emerald-700", border: "border-emerald-500/30" }
        : { label: "Rejected", text: "text-red-700", border: "border-red-500/30" };
    const total = allocations.reduce((sum, allocation) => sum + Math.max(0, Number(allocation.quantity) || 0), 0);

    return (
        <div className="space-y-2">
            {allocations.length === 0 ? (
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
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className={"h-8 px-2.5 rounded-lg border bg-background text-[10px] font-extrabold hover:bg-muted " + tone.text + " " + tone.border}
                >
                    {readOnly ? "View allocated lots" : allocations.length === 0 ? "Create new allocation" : "Manage lot allocation"}
                </button>
                <div className={`text-[10px] font-bold ${Math.abs(total - expectedQuantity) > 1e-9 ? "text-red-600" : tone.text}`}>
                    {tone.label} allocated: {total.toLocaleString()} / {expectedQuantity.toLocaleString()}
                </div>
            </div>
            <LotAllocationModal
                open={open}
                onOpenChange={setOpen}
                productId={productId}
                productName={productName}
                productUnitId={productUnitId}
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
