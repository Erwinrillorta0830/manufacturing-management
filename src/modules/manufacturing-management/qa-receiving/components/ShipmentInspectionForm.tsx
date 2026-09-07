import React from "react";
import Image from "next/image";
import { ArrowLeft, MapPin, AlertTriangle, CheckCircle2, Search, ChevronDown, Plus, Minus, Trash2, Loader2, ReceiptText, CalendarDays, Radio, RefreshCw } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { Shipment, ShipmentLineItem, Branch, InspectionRow, StorageLot, StorageLotBatch, QaSpecificationLoadState, QaSpecificationReadings, ReceivingQaEvaluation, ReceivingLotAllocationInput, OverDeliveryLine, SupplierDocumentType, ReceivingQuantityStatus } from "../types";
import { deriveRejectedQuantity } from "@/app/api/manufacturing/qa/_receiving-evaluation";
import { canForceReceivePurchaseOrder, isForceReceived } from "@/app/api/manufacturing/qa-receiving/_force-received";
import { INVENTORY_STATUS } from "@/app/api/manufacturing/procurement/_domain";
import type { ReceivingValidationIssue } from "../receiving-metadata";
import ProductQaChecklist from "./ProductQaChecklist";
import ForceReceivedDialog from "./ForceReceivedDialog";
import { CreatableSelect } from "@/modules/manufacturing-management/finished-goods/components/CreatableSelect";
import { configuredBadStockBranchId } from "../services/qa-api";

interface ShipmentInspectionFormProps {
    selectedShipment: Shipment;
    readOnly: boolean;
    isReplacement?: boolean;
    lineItems: ShipmentLineItem[];
    branches: Branch[];
    storageLotsByProductId: Record<number, StorageLot[]>;
    rejectedStorageLotsByProductId: Record<number, StorageLot[]>;
    loadStorageLotBatches: (productId: number, lotId: number, branchId?: number, disposition?: "accepted" | "rejected") => Promise<StorageLotBatch[]>;
    receivingTicketNumber: string;
    onReceiptNumberChange: (value: string) => void;
    receiptDate: string;
    onReceiptDateChange: (value: string) => void;
    supplierDocumentTypes: SupplierDocumentType[];
    loadingSupplierDocumentTypes: boolean;
    supplierDocumentTypeError: string | null;
    supplierDocumentTypeId: number | null;
    onSupplierDocumentTypeChange: (value: string) => void;
    quantityStatus: ReceivingQuantityStatus;
    processOverDelivery: boolean;
    setProcessOverDelivery: (value: boolean) => void;
    overDeliveryLines: OverDeliveryLine[];
    selectedBranchId: string;
    inspectionRows: Record<number, InspectionRow>;
    qaSpecificationStates: Record<number, QaSpecificationLoadState>;
    qaReadings: QaSpecificationReadings;
    qaEvaluationResults: Record<number, ReceivingQaEvaluation>;
    hasPreview: boolean;
    previewAcknowledged: boolean;
    validatingInspection: boolean;
    previewError: string | null;
    onRetryPreview: () => void;
    qaSubmissionBlockReason: string | null;
    receivingValidationIssues: ReceivingValidationIssue[];
    loadingLines: boolean;
    handleUpdateRow: (lineId: number, field: string, value: string | number | boolean) => void;
    handleUpdateAllocations: (lineId: number, allocations: ReceivingLotAllocationInput[]) => void;
    handleUpdateRejectedAllocations: (lineId: number, allocations: ReceivingLotAllocationInput[]) => void;
    handleUpdateQaReading: (lineId: number, specId: number, value: string) => void;
    handleSubmitInspection: (e: React.FormEvent) => void;
    onReviewPreview: () => void;
    onCancel: () => void;
    onForceReceived?: (reason: string) => Promise<void>;
    forceReceivedSubmitting?: boolean;
}

interface SearchableStorageLotSelectProps {
    value: string | number;
    disabled?: boolean;
    storageLots: StorageLot[];
    id?: string;
    ariaLabel?: string;
    onChange: (value: string) => void;
}

function SearchableStorageLotSelect({
    value,
    disabled,
    storageLots,
    id,
    ariaLabel,
    onChange
}: SearchableStorageLotSelectProps) {
    const options = React.useMemo(() => {
        const seenLotIds = new Set<string>();
        return storageLots
            .filter(lot => lot.is_selectable !== false || String(lot.lot_id) === String(value))
            .filter(lot => {
                const lotId = String(lot.lot_id);
                if (seenLotIds.has(lotId)) return false;
                seenLotIds.add(lotId);
                return true;
            })
            .map(lot => {
                const lotId = String(lot.lot_id);
                const lotName = String(lot.lot_name || lot.lot_code || `Lot ${lotId}`);
                const available = lot.availableQuantity ?? lot.max_batch_capacity ?? "historical";
                const isCurrent = lotId === String(value);
                const isFull = typeof lot.availableQuantity === "number" && lot.availableQuantity <= 0;

                return {
                    value: lotId,
                    label: `${lotName} (${available} available)`,
                    disabled: isFull && !isCurrent
                };
            });
    }, [storageLots, value]);

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

type AllocationDisposition = "accepted" | "rejected";

type AllocationField = "batchNumber" | "manufacturingDate" | "expirationDate" | "quantity";

interface LotAllocationGroup {
    groupId: string;
    storageLotId: string;
    allocations: ReceivingLotAllocationInput[];
}

interface LotAllocationEditorProps {
    lineId: number;
    productId: number;
    isPackaging: boolean;
    disposition: AllocationDisposition;
    allocations: ReceivingLotAllocationInput[];
    otherAllocations: ReceivingLotAllocationInput[];
    expectedQuantity: number;
    storageLots: StorageLot[];
    readOnly: boolean;
    loadStorageLotBatches: (productId: number, lotId: number, branchId?: number, disposition?: "accepted" | "rejected") => Promise<StorageLotBatch[]>;
    onChange: (allocations: ReceivingLotAllocationInput[]) => void;
    onAddLot: () => void;
}

function LotAllocationEditor({
    lineId,
    productId,
    isPackaging,
    disposition,
    allocations,
    otherAllocations,
    expectedQuantity,
    storageLots,
    readOnly,
    loadStorageLotBatches,
    onChange,
    onAddLot
}: LotAllocationEditorProps) {
    const [batchOptionsByLot, setBatchOptionsByLot] = React.useState<Record<number, StorageLotBatch[]>>({});
    const tone = disposition === "accepted"
        ? { label: "Accepted", text: "text-emerald-700", border: "border-emerald-500/30", input: "focus:border-emerald-500" }
        : { label: "Rejected", text: "text-red-700", border: "border-red-500/30", input: "focus:border-red-500" };

    const loadBatches = React.useCallback((lotId: number) => {
        if (batchOptionsByLot[lotId]) return;
        const lotBranchId = storageLots.find(lot => String(lot.lot_id) === String(lotId))?.branch_id || undefined;
        void loadStorageLotBatches(productId, lotId, lotBranchId || undefined, disposition)
            .then(batches => setBatchOptionsByLot(previous => ({ ...previous, [lotId]: batches })))
            .catch(error => {
                if ((error as Error).name !== "AbortError") {
                    setBatchOptionsByLot(previous => ({ ...previous, [lotId]: [] }));
                }
            });
    }, [batchOptionsByLot, disposition, loadStorageLotBatches, productId, storageLots]);

    React.useEffect(() => {
        for (const allocation of allocations) {
            const lotId = Number(allocation.storageLotId);
            if (Number.isFinite(lotId) && lotId > 0) loadBatches(lotId);
        }
    }, [allocations, loadBatches]);

    const groups = React.useMemo<LotAllocationGroup[]>(() => {
        const grouped = new Map<string, LotAllocationGroup>();

        allocations.forEach(allocation => {
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
    }, [allocations]);

    const updateAllocation = (groupId: string, clientId: string, field: AllocationField, value: string | number) => {
        onChange(allocations.map(allocation => (
            allocation.clientId === clientId
                ? { ...allocation, allocationGroupId: allocation.allocationGroupId || groupId, [field]: value }
                : allocation
        )));
    };

    const changeLot = (group: LotAllocationGroup, value: string) => {
        const lotId = Number(value);
        const groupClientIds = new Set(group.allocations.map(allocation => allocation.clientId));

        onChange(allocations.map(allocation => (
            groupClientIds.has(allocation.clientId)
                ? { ...allocation, allocationGroupId: group.groupId, storageLotId: value, batchNumber: "", manufacturingDate: "", expirationDate: "" }
                : allocation
        )));
        if (Number.isSafeInteger(lotId) && lotId > 0) loadBatches(lotId);
    };

    const addBatch = (group: LotAllocationGroup) => {
        if (readOnly || !group.storageLotId) return;

        onChange([
            ...allocations,
            {
                clientId: uuidv4(),
                allocationGroupId: group.groupId,
                storageLotId: group.storageLotId,
                batchNumber: "",
                manufacturingDate: "",
                expirationDate: "",
                quantity: ""
            }
        ]);
    };

    const removeBatch = (clientId: string) => {
        onChange(allocations.filter(allocation => allocation.clientId !== clientId));
    };

    const total = allocations.reduce((sum, allocation) => sum + Math.max(0, Number(allocation.quantity) || 0), 0);
    const effectiveStorageLots = React.useMemo(() => {
        const knownIds = new Set(storageLots.map(lot => String(lot.lot_id)));
        const historicalLots = new Map<number, StorageLot>();

        allocations.forEach(allocation => {
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
    }, [allocations, storageLots]);

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

    const capacityWarningByClientId = React.useMemo(() => {
        const orderedAllocations = disposition === "accepted"
            ? [...allocations, ...otherAllocations]
            : [...otherAllocations, ...allocations];
        const incomingByLot = new Map<string, number>();
        const warningByClientId = new Map<string, number>();

        for (const allocation of orderedAllocations) {
            const lotId = String(allocation.storageLotId || "");
            if (!lotId) continue;
            const selectedLot = effectiveStorageLots.find(lot => String(lot.lot_id) === lotId);
            const availableQuantity = selectedLot?.availableQuantity;
            if (availableQuantity === null || availableQuantity === undefined || !Number.isFinite(Number(availableQuantity))) continue;

            const incomingBeforeAllocation = incomingByLot.get(lotId) || 0;
            const remainingBeforeAllocation = Math.max(0, Number(availableQuantity) - incomingBeforeAllocation);
            const quantity = Math.max(0, Number(allocation.quantity) || 0);
            const capacityOverrideQuantity = Math.max(0, quantity - remainingBeforeAllocation);
            if (capacityOverrideQuantity > 1e-9) warningByClientId.set(allocation.clientId, capacityOverrideQuantity);
            incomingByLot.set(lotId, incomingBeforeAllocation + quantity);
        }

        return warningByClientId;
    }, [allocations, disposition, effectiveStorageLots, otherAllocations]);

    return (
        <div className="space-y-2">
            {groups.length === 0 ? (
                <div className={`rounded-lg border px-3 py-3 text-center text-[10px] text-muted-foreground ${tone.border}`}>
                    No {tone.label.toLowerCase()} lot groups added.
                </div>
            ) : groups.map(group => {
                const selectedLot = effectiveStorageLots.find(lot => String(lot.lot_id) === group.storageLotId);
                const groupTotal = group.allocations.reduce((sum, allocation) => sum + Math.max(0, Number(allocation.quantity) || 0), 0);
                const lotIncomingTotal = [...allocations, ...otherAllocations]
                    .filter(allocation => String(allocation.storageLotId) === group.storageLotId)
                    .reduce((sum, allocation) => sum + Math.max(0, Number(allocation.quantity) || 0), 0);
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
                                            id={`receiving-${lineId}-${disposition}-${group.groupId.replace(/[^a-zA-Z0-9_-]/g, "-")}-storage-lot`}
                                            ariaLabel={tone.label + " storage lot"}
                                            onChange={value => changeLot(group, value)}
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-2 lg:justify-end">
                                    <span className="text-[9px] font-semibold text-muted-foreground">
                                        {selectedLot
                                            ? `${groupTotal.toLocaleString()} allocated · ${lotRemaining === null ? "capacity unavailable" : `${Math.max(0, lotRemaining).toLocaleString()} remaining`}`
                                            : "Select an eligible lot before assigning batches."}
                                    </span>
                                    {lotRemaining !== null && lotRemaining < -1e-9 && (
                                        <span className="text-[9px] font-bold text-amber-700" role="status" aria-live="polite">
                                            Capacity override: {Math.abs(lotRemaining).toLocaleString()} unit(s) over available capacity. Audit review required.
                                        </span>
                                    )}
                                    {!readOnly && (
                                        <button
                                            type="button"
                                            onClick={() => addBatch(group)}
                                            disabled={!group.storageLotId}
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
                                    {selectedLot.lot_name} · {selectedLot.availableQuantity ?? selectedLot.max_batch_capacity ?? "capacity unavailable"} unit(s) available before this receipt.
                                </div>
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
                                        const capacityOverrideQuantity = capacityWarningByClientId.get(allocation.clientId) || 0;
                                        const batchOptions = selectedLot ? batchOptionsByLot[selectedLot.lot_id] || [] : [];
                                        const dateRequired = !isPackaging && Number(allocation.quantity) > 0;
                                        const missingBatch = !allocation.batchNumber.trim();
                                        const invalidDates = dateRequired && (!allocation.manufacturingDate || !allocation.expirationDate);
                                        const batchControlId = "receiving-batches-" + lineId + "-" + disposition + "-" + allocation.clientId;
                                        const capacityWarningId = batchControlId + "-capacity-warning";

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
                                                        className={"h-9 w-full rounded-lg border bg-background px-2.5 text-[10px] font-semibold text-right outline-none " + (capacityOverrideQuantity > 1e-9 ? "border-amber-500" : "border-border") + " " + tone.input}
                                                        aria-label={tone.label + " quantity for " + (selectedLot?.lot_name || group.storageLotId)}
                                                        aria-describedby={capacityOverrideQuantity > 1e-9 ? capacityWarningId : undefined}
                                                    />
                                                    {capacityOverrideQuantity > 1e-9 && (
                                                        <span id={capacityWarningId} className="mt-1 block text-[9px] font-semibold text-amber-700" role="status" aria-live="polite">
                                                            Capacity override: {capacityOverrideQuantity.toLocaleString()} unit(s) from this batch require audit review.
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
                        onClick={onAddLot}
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
        </div>
    );
}

export default function ShipmentInspectionForm({
    selectedShipment,
    readOnly,
    isReplacement = false,
    lineItems,
    branches,
    storageLotsByProductId,
    rejectedStorageLotsByProductId,
    loadStorageLotBatches,
    receivingTicketNumber,
    onReceiptNumberChange,
    receiptDate,
    onReceiptDateChange,
    supplierDocumentTypes,
    loadingSupplierDocumentTypes,
    supplierDocumentTypeError,
    supplierDocumentTypeId,
    onSupplierDocumentTypeChange,
    quantityStatus,
    selectedBranchId,
    processOverDelivery,
    setProcessOverDelivery,
    overDeliveryLines,
    inspectionRows,
    qaSpecificationStates,
    qaReadings,
    qaEvaluationResults,
    hasPreview,
    previewAcknowledged,
    validatingInspection,
    previewError,
    onRetryPreview,
    qaSubmissionBlockReason,
    receivingValidationIssues,
    loadingLines,
    handleUpdateRow,
    handleUpdateAllocations,
    handleUpdateRejectedAllocations,
    handleUpdateQaReading,
    handleSubmitInspection,
    onReviewPreview,
    onCancel,
    onForceReceived,
    forceReceivedSubmitting = false
}: ShipmentInspectionFormProps) {
    const [forceReceivedOpen, setForceReceivedOpen] = React.useState(false);
    const forceClosed = Boolean(selectedShipment.isForceReceived || isForceReceived(selectedShipment.forceReceivedAt));
    const canForceReceive = Boolean(onForceReceived) && canForceReceivePurchaseOrder({
        inventoryStatus: selectedShipment.inventory_status ?? (selectedShipment.status === "Partially Received" ? INVENTORY_STATUS.PARTIALLY_RECEIVED : null),
        isForceReceived: forceClosed,
        isReplacement: Boolean(isReplacement)
    });
    const forceReceivedStamp = selectedShipment.forceReceivedAt
        ? new Intl.DateTimeFormat("en-PH", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Manila"
        }).format(new Date(selectedShipment.forceReceivedAt))
        : null;
    const totalOrderedQty = React.useMemo(() => {
        return lineItems.reduce((sum, l) => sum + Number(l.quantity_ordered || 0), 0);
    }, [lineItems]);

    const [dropdownOpen, setDropdownOpen] = React.useState(false);
    const [dropdownSearch, setDropdownSearch] = React.useState("");
    const [highlightedLineId, setHighlightedLineId] = React.useState<number | null>(null);

    const issueFor = (lineId: number | undefined, field: string) => readOnly
        ? undefined
        : receivingValidationIssues.find(issue => issue.lineId === lineId && issue.field === field);

    const dropdownRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filteredLines = React.useMemo(() => {
        if (!dropdownSearch.trim()) return lineItems;
        const q = dropdownSearch.toLowerCase();
        return lineItems.filter(l =>
            l.product_id?.product_name?.toLowerCase().includes(q) ||
            l.product_id?.product_code?.toLowerCase().includes(q)
        );
    }, [lineItems, dropdownSearch]);

    const hasQuantityMismatch = React.useMemo(() => lineItems.some(line => {
        const row = inspectionRows[line.line_id];
        const received = Number(row?.receivedQty || 0);
        const accepted = Number(row?.acceptedQty || 0);
        if (![received, accepted].every(Number.isFinite)) return true;
        if (received === 0 && accepted === 0) return false;
        return received <= 0
            || accepted < 0
            || accepted > received;
    }), [inspectionRows, lineItems]);

    const hasAllocationMismatch = React.useMemo(() => lineItems.some(line => {
        const row = inspectionRows[line.line_id];
        const accepted = Number(row?.acceptedQty || 0);
        const allocations = row?.acceptedLotAllocations || [];
        if (accepted <= 0) return allocations.length > 0;
        const total = allocations.reduce((sum, allocation) => sum + Number(allocation.quantity || 0), 0);
        return allocations.length === 0
            || Math.abs(total - accepted) > 1e-9
            || allocations.some(allocation => !allocation.batchNumber.trim() || (!row?.isPackaging && (!allocation.manufacturingDate || !allocation.expirationDate)));
    }), [inspectionRows, lineItems]);

    const hasRejectedAllocationMismatch = React.useMemo(() => lineItems.some(line => {
        const row = inspectionRows[line.line_id];
        const received = Number(row?.receivedQty || 0);
        const accepted = Number(row?.acceptedQty || 0);
        const rejected = Number.isFinite(received) && Number.isFinite(accepted)
            ? Math.max(0, deriveRejectedQuantity(received, accepted))
            : 0;
        const allocations = row?.rejectedLotAllocations || [];
        if (rejected <= 0) return allocations.length > 0;
        const total = allocations.reduce((sum, allocation) => sum + Number(allocation.quantity || 0), 0);
        return allocations.length === 0
            || Math.abs(total - rejected) > 1e-9
            || allocations.some(allocation => !allocation.batchNumber.trim() || (!row?.isPackaging && (!allocation.manufacturingDate || !allocation.expirationDate)));
    }), [inspectionRows, lineItems]);

    const addAcceptedLot = (lineId: number, row: InspectionRow) => {
        const line = lineItems.find(item => item.line_id === lineId);
        const storageLots = line ? storageLotsByProductId[Number(line.product_id?.product_id)] || [] : [];
        if (storageLots.length === 0) return;
        handleUpdateAllocations(lineId, [
            ...row.acceptedLotAllocations,
            { clientId: uuidv4(), allocationGroupId: uuidv4(), storageLotId: "", batchNumber: "", manufacturingDate: "", expirationDate: "", quantity: "" }
        ]);
    };

    const addRejectedLot = (lineId: number, row: InspectionRow) => {
        const line = lineItems.find(item => item.line_id === lineId);
        const storageLots = line ? rejectedStorageLotsByProductId[Number(line.product_id?.product_id)] || [] : [];
        if (storageLots.length === 0) return;
        handleUpdateRejectedAllocations(lineId, [
            ...row.rejectedLotAllocations,
            { clientId: uuidv4(), allocationGroupId: uuidv4(), storageLotId: "", batchNumber: "", manufacturingDate: "", expirationDate: "", quantity: "" }
        ]);
    };

    const handleSelectProduct = (lineId: number) => {
        setDropdownOpen(false);
        setDropdownSearch("");
        setHighlightedLineId(lineId);

        // Find and scroll to card
        const element = document.getElementById(`line-card-${lineId}`);
        if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
        }

        // Clear highlight
        setTimeout(() => {
            setHighlightedLineId(null);
        }, 3000);
    };

    // Filter out Bihon Bad Branch and quarantine branches from main selector
    const filteredBranches = React.useMemo(() => {
        const eligibleBranches = branches.filter(b => {
            if (b.isBadStock === true || Number(b.isBadStock) === 1) return false;
            const name = (b.branch_name || "").toLowerCase();
            return !name.includes("bad branch") &&
                !name.includes("quarantine") &&
                !name.includes("damaged") &&
                !name.includes("holding") &&
                !name.includes("bad order");
        });
        return selectedBranchId
            ? eligibleBranches.filter(branch => Number(branch.id) === Number(selectedBranchId))
            : eligibleBranches;
    }, [branches, selectedBranchId]);

    const hasConfiguredBadOrderBranch = React.useMemo(() => {
        const receivingBranch = branches.find(branch => Number(branch.id) === Number(selectedBranchId || selectedShipment.branch_id));
        return configuredBadStockBranchId(receivingBranch) > 0;
    }, [branches, selectedBranchId, selectedShipment.branch_id]);

    const originalBranchName = React.useMemo(() => {
        if (!selectedShipment.branch_id) return "N/A";
        const found = branches.find(b => Number(b.id) === Number(selectedShipment.branch_id));
        if (found) return found.branch_name;

        switch (Number(selectedShipment.branch_id)) {
            case 1:
            case 183: return "Main Branch";
            case 163: return "Urdaneta Branch";
            case 181: return "Bihon Branch";
            case 182: return "Bihon Bad Branch";
            default: return `Branch ID ${selectedShipment.branch_id}`;
        }
    }, [branches, selectedShipment.branch_id]);

    return (
        <form onSubmit={handleSubmitInspection} className="flex flex-col">
            <div className="p-4 border-b bg-muted/20 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="md:hidden min-h-10 min-w-10 rounded-xl border p-2 text-muted-foreground transition-colors hover:bg-muted shrink-0 flex items-center justify-center animate-in fade-in slide-in-from-left-2 duration-200"
                        title="Back to Inbound QA Queue"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div className="min-w-0">
                        <h3 className="text-xs font-bold text-foreground truncate">
                            Cargo Manifest Inspection: {selectedShipment.reference_number}
                        </h3>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                            <p className="text-[10px] text-muted-foreground">Verify physical quantities, tag batch IDs, and set Expiration limits.</p>
                            {readOnly && (
                                <span className="text-[9px] bg-emerald-500/10 text-emerald-700 px-1.5 py-0.5 rounded font-extrabold whitespace-nowrap">
                                    Received - View Only
                                </span>
                            )}
                            {forceClosed && (
                                <span className="text-[9px] bg-violet-500/10 text-violet-700 px-1.5 py-0.5 rounded font-extrabold whitespace-nowrap">
                                    Force Received
                                </span>
                            )}
                            {forceClosed && selectedShipment.forceReceivedReason && (
                                <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-extrabold max-w-[280px] truncate" title={selectedShipment.forceReceivedReason}>
                                    Reason: {selectedShipment.forceReceivedReason}
                                    {selectedShipment.forceReceivedByName ? ` · ${selectedShipment.forceReceivedByName}` : selectedShipment.forceReceivedBy ? ` · User ${selectedShipment.forceReceivedBy}` : ""}
                                    {forceReceivedStamp ? ` · ${forceReceivedStamp}` : ""}
                                </span>
                            )}
                            {(readOnly || selectedShipment.status === "Received") && Number(selectedShipment.payment_status) === 2 && (
                                <span className="text-[9px] bg-blue-500/10 text-blue-700 px-1.5 py-0.5 rounded font-extrabold whitespace-nowrap">
                                    Payment Status: Awaiting Payment
                                </span>
                            )}
                            {!readOnly && selectedShipment.status === "Partially Received" && (
                                <span className="text-[9px] bg-amber-500/10 text-amber-700 px-1.5 py-0.5 rounded font-extrabold whitespace-nowrap">
                                    Partially Received - Receiving Remaining Goods
                                </span>
                            )}
                            <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-extrabold whitespace-nowrap">
                                Original PO Branch: {originalBranchName}
                            </span>
                            <span className="text-[9px] bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded font-extrabold whitespace-nowrap">
                                PO Qty: {totalOrderedQty.toLocaleString()} units
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 self-stretch lg:self-auto justify-end shrink-0">
                    {/* Product Name Searchable Dropdown */}
                    <div ref={dropdownRef} className="relative w-full sm:w-[220px]">
                        <button
                            type="button"
                            onClick={() => setDropdownOpen(!dropdownOpen)}
                            className="w-full h-11 sm:h-10 rounded-xl border bg-background text-foreground text-xs font-semibold px-3.5 py-2 flex items-center justify-between shadow-sm outline-none focus:ring-1 focus:ring-primary cursor-pointer select-none"
                        >
                            <span className="truncate flex items-center gap-2">
                                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="truncate">Jump to Product...</span>
                            </span>
                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        </button>
                        {dropdownOpen && (
                            <div className="absolute right-0 mt-1.5 w-[280px] bg-popover border text-popover-foreground rounded-xl shadow-lg z-50 p-2 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                                <input
                                    type="text"
                                    placeholder="Search name or SKU..."
                                    value={dropdownSearch}
                                    onChange={e => setDropdownSearch(e.target.value)}
                                    className="w-full h-9 bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                                    autoFocus
                                />
                                <div className="max-h-[220px] overflow-y-auto space-y-0.5 pr-1">
                                    {filteredLines.length === 0 ? (
                                        <div className="text-[10px] text-muted-foreground text-center py-2">No products found</div>
                                    ) : (
                                        filteredLines.map(l => (
                                            <button
                                                key={l.line_id}
                                                type="button"
                                                onClick={() => handleSelectProduct(l.line_id)}
                                                className="w-full text-left px-2 py-2 rounded-lg text-[11px] font-medium hover:bg-accent hover:text-accent-foreground transition-all truncate block"
                                            >
                                                <span className="font-bold block truncate">{l.product_id?.product_name}</span>
                                                <span className="text-[9px] text-muted-foreground font-mono">SKU: {l.product_id?.product_code || `ID-${l.product_id?.product_id}`}</span>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                </div>
            </div>

            <div
                data-testid="receiving-metadata-grid"
                className="grid grid-cols-1 gap-3 border-b bg-background p-4 sm:grid-cols-2 2xl:grid-cols-5"
            >
                <div className="min-w-0 space-y-1">
                    <label htmlFor="receiving-receipt-number" className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                        Receipt Number {!readOnly && <span className="text-red-500">*</span>}
                    </label>
                    <div className="relative">
                        <ReceiptText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary pointer-events-none" />
                        <input
                            id="receiving-receipt-number"
                            name="receiptNumber"
                            type="text"
                            required={!readOnly}
                            maxLength={32}
                            autoComplete="off"
                            value={receivingTicketNumber}
                            onChange={event => onReceiptNumberChange(event.target.value)}
                            readOnly={readOnly}
                            aria-invalid={Boolean(issueFor(undefined, "receiptNumber"))}
                            aria-describedby={issueFor(undefined, "receiptNumber") ? "receiving-receipt-number-error" : undefined}
                            className={`w-full h-10 rounded-xl border bg-background text-foreground text-xs font-semibold pl-9 pr-3 py-2 outline-none focus:ring-1 focus:ring-primary ${issueFor(undefined, "receiptNumber") ? "border-red-500" : ""} ${readOnly ? "bg-muted/30 cursor-default" : ""}`}
                        />
                    </div>
                    {issueFor(undefined, "receiptNumber") && <p id="receiving-receipt-number-error" className="text-[9px] font-semibold text-red-600" role="alert">{issueFor(undefined, "receiptNumber")?.message}</p>}
                    <p className="text-[9px] text-muted-foreground">Enter the physical receiving ticket or delivery receipt number.</p>
                </div>

                <div className="min-w-0 space-y-1">
                    <label htmlFor="receiving-receipt-date" className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                        Date of Receipt <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                        <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary pointer-events-none" />
                        <input
                            id="receiving-receipt-date"
                            name="receiptDate"
                            type="date"
                            required={!readOnly}
                            value={receiptDate}
                            onChange={event => onReceiptDateChange(event.target.value)}
                            readOnly={readOnly}
                            aria-invalid={Boolean(issueFor(undefined, "receiptDate"))}
                            aria-describedby={issueFor(undefined, "receiptDate") ? "receiving-receipt-date-error" : undefined}
                            className={`w-full h-10 rounded-xl border bg-background text-foreground text-xs font-semibold pl-9 pr-3 py-2 outline-none focus:ring-1 focus:ring-primary ${issueFor(undefined, "receiptDate") ? "border-red-500" : ""} ${readOnly ? "bg-muted/30 cursor-default" : ""}`}
                        />
                    </div>
                    {issueFor(undefined, "receiptDate") && <p id="receiving-receipt-date-error" className="text-[9px] font-semibold text-red-600" role="alert">{issueFor(undefined, "receiptDate")?.message}</p>}
                    <p className="text-[9px] text-muted-foreground">Enter the date shown on the physical delivery receipt.</p>
                </div>

                <div className="min-w-0 space-y-1">
                    <label htmlFor="receiving-branch" className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                        Receiving Branch <span className="text-muted-foreground">(from PO)</span>
                    </label>
                    <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary pointer-events-none" />
                        <select
                            id="receiving-branch"
                            required={false}
                            value={selectedBranchId}
                            disabled={true}
                            aria-readonly="true"
                            aria-invalid={Boolean(issueFor(undefined, "branchId"))}
                            aria-describedby={issueFor(undefined, "branchId") ? "receiving-branch-error" : undefined}
                            className={`w-full h-10 rounded-xl border bg-muted/40 text-foreground text-xs font-semibold pl-9 pr-3 py-2 outline-none cursor-not-allowed disabled:opacity-100 ${issueFor(undefined, "branchId") ? "border-red-500" : ""}`}
                        >
                            <option value="">Select receiving branch...</option>
                            {filteredBranches.map(branch => (
                                <option key={branch.id} value={branch.id.toString()}>{branch.branch_name}</option>
                            ))}
                        </select>
                    </div>
                    {issueFor(undefined, "branchId") && <p id="receiving-branch-error" className="text-[9px] font-semibold text-red-600" role="alert">{issueFor(undefined, "branchId")?.message}</p>}
                    {!issueFor(undefined, "branchId") && <p className="text-[9px] text-muted-foreground">Locked to the Purchase Order branch for inventory routing.</p>}
                </div>

                <div className="min-w-0 space-y-1">
                    <label htmlFor="receiving-document-type" className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                        Supplier Document Type {!readOnly && !isReplacement && <span className="text-red-500">*</span>}
                    </label>
                    <select
                        id="receiving-document-type"
                        data-testid="receiving-document-type"
                        value={supplierDocumentTypeId ?? ""}
                        onChange={event => onSupplierDocumentTypeChange(event.target.value)}
                        disabled={readOnly || isReplacement || loadingSupplierDocumentTypes || supplierDocumentTypes.length === 0}
                        required={!readOnly && !isReplacement}
                        aria-invalid={Boolean(issueFor(undefined, "supplierDocumentTypeId"))}
                        aria-describedby={issueFor(undefined, "supplierDocumentTypeId") ? "receiving-document-type-error" : undefined}
                        className={`w-full h-10 rounded-xl border bg-background text-foreground text-xs font-semibold px-3 py-2 outline-none focus:ring-1 focus:ring-primary cursor-pointer disabled:cursor-not-allowed disabled:bg-muted/40 ${issueFor(undefined, "supplierDocumentTypeId") ? "border-red-500" : ""}`}
                    >
                        <option value="" disabled>
                            {loadingSupplierDocumentTypes ? "Loading document types..." : "Select document type..."}
                        </option>
                        {supplierDocumentTypes.map(documentType => (
                            <option key={documentType.id} value={documentType.id}>{documentType.label}</option>
                        ))}
                    </select>
                    {issueFor(undefined, "supplierDocumentTypeId") && <p id="receiving-document-type-error" className="text-[9px] font-semibold text-red-600" role="alert">{issueFor(undefined, "supplierDocumentTypeId")?.message}</p>}
                    {!issueFor(undefined, "supplierDocumentTypeId") && supplierDocumentTypeError && !readOnly && <p className="text-[9px] font-semibold text-red-600" role="alert">{supplierDocumentTypeError}</p>}
                    {!issueFor(undefined, "supplierDocumentTypeId") && !supplierDocumentTypeError && <p className="text-[9px] text-muted-foreground">Classifies the supplier document provided with this delivery.</p>}
                </div>

                <div className="min-w-0 space-y-1">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Quantity Status</span>
                    <div
                        data-testid="receiving-quantity-status"
                        role="status"
                        className="w-full h-10 rounded-xl border bg-muted/40 text-foreground text-xs font-semibold px-3 py-2 flex items-center"
                    >
                        {quantityStatus === "FULL" ? "Full" : quantityStatus === "REJECTED" ? "Rejected" : "Partial"}
                    </div>
                    <p className="text-[9px] text-muted-foreground">
                        {isReplacement ? "Replacement receipts use the linked quarantine disposition." : "Calculated from cumulative accepted quantity versus the PO."}
                    </p>
                </div>
            </div>

            {!readOnly && overDeliveryLines.length > 0 && (
                <div className="mx-4 mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-amber-800" role="alert">
                    <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                        <div className="space-y-2 flex-1">
                            <div>
                                <p className="text-[11px] font-extrabold uppercase tracking-wide">Over-delivery detected</p>
                                <p className="text-[10px]">The counted quantity is above the remaining purchase-order quantity. Confirm the excess before generating the receiving preview.</p>
                            </div>
                            <div className="space-y-1 text-[10px] font-semibold">
                                {overDeliveryLines.map(line => (
                                    <p key={line.lineId}>
                                        {line.productName}: received {line.receivedQuantity.toLocaleString()}, expected {line.remainingQuantity.toLocaleString()}, excess {line.overDeliveryQuantity.toLocaleString()}
                                    </p>
                                ))}
                            </div>
                            <label className="flex items-center gap-2 text-[10px] font-extrabold cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    data-testid="process-over-delivery"
                                    checked={processOverDelivery}
                                    onChange={event => setProcessOverDelivery(event.target.checked)}
                                    className="h-4 w-4 rounded border-amber-500 text-primary focus:ring-primary"
                                />
                                Process Over-Delivery
                            </label>
                        </div>
                    </div>
                </div>
            )}

            {/* Manifest Items Table */}
            <div className="space-y-4 p-4">
                {loadingLines ? (
                    <div className="p-8 text-center text-xs text-muted-foreground">Fetching manifest detail...</div>
                ) : (
                    lineItems.map(line => {
                        const row = inspectionRows[line.line_id] || {
                            receivedQty: "",
                            acceptedQty: "",
                            rejectedQty: 0,
                            rejectionReason: "",
                            isPackaging: false
                        };

                        const prod = line.product_id;
                        const lineStorageLots = storageLotsByProductId[Number(prod.product_id)] || [];
                        const lineRejectedStorageLots = rejectedStorageLotsByProductId[Number(prod.product_id)] || [];
                        const isHighlighted = highlightedLineId === line.line_id;

                        const receivedVal = row.receivedQty !== "" ? Number(row.receivedQty) : 0;
                        const orderedVal = Number(line.quantity_ordered || 0);
                        const previouslyReceivedVal = Number(line.previously_received_quantity ?? Math.max(0, orderedVal - Number(line.remaining_quantity ?? orderedVal)));
                        const remainingVal = Math.max(0, Number(line.remaining_quantity ?? (orderedVal - previouslyReceivedVal)));
                        const previouslyAcceptedVal = Number(line.previously_accepted_quantity ?? Math.max(0, Number(line.quantity_received || 0) - Number(line.quantity_rejected || 0)));
                        const remainingAcceptedVal = Math.max(0, Number(line.remaining_accepted_quantity ?? (orderedVal - previouslyAcceptedVal)));
                        const acceptedVal = row.acceptedQty !== "" ? Number(row.acceptedQty) : 0;
                        const rejectedVal = Math.max(0, deriveRejectedQuantity(receivedVal, acceptedVal));
                        const overDeliveryQuantity = Math.max(0, receivedVal - remainingVal);
                        const quantitiesReconcile = [receivedVal, acceptedVal].every(Number.isFinite)
                            && acceptedVal >= 0
                            && acceptedVal <= receivedVal;
                        const isRemarksMandatory = rejectedVal > 0 || (receivedVal > 0 && receivedVal !== remainingVal);
                        const evaluation = qaEvaluationResults[line.line_id];
                        const lineIssue = (field: string) => issueFor(line.line_id, field);
                        const quantityIssue = lineIssue("quantity") || lineIssue("receivedQuantity");

                        return (
                            <div
                                key={line.line_id}
                                id={`line-card-${line.line_id}`}
                                className={`border rounded-xl p-4 bg-muted/5 space-y-3.5 relative transition-all duration-300 ${isHighlighted
                                        ? "ring-2 ring-primary bg-primary/5 border-primary scale-[1.01]"
                                        : "border-border"
                                    }`}
                            >
                                {/* Header info with optional Product Image */}
                                <div className="flex gap-4 border-b pb-3 items-center">
                                    {prod.product_image ? (
                                        <div className="h-16 w-16 rounded-xl bg-background border flex items-center justify-center shrink-0 overflow-hidden shadow-xs relative">
                                            <Image
                                                src={`${process.env.NEXT_PUBLIC_DIRECTUS_URL || process.env.NEXT_PUBLIC_API_BASE_URL || ""}/assets/${prod.product_image}`}
                                                alt={prod.product_name}
                                                fill
                                                className="object-cover"
                                                unoptimized
                                            />
                                        </div>
                                    ) : null}

                                    <div className="flex-1 min-w-0">
                                        <span className="font-bold text-xs sm:text-sm text-foreground block truncate">{prod.product_name}</span>
                                        <span className="text-[10px] text-muted-foreground font-mono">SKU: {prod.product_code || `ID-${prod.product_id}`}</span>
                                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] font-semibold text-muted-foreground">
                                            {selectedShipment.status === "Partially Received" && line.latest_receipt?.receipt_number && (
                                                <span>Previous receipt: <strong className="text-foreground">{line.latest_receipt.receipt_number}</strong></span>
                                            )}
                                            {(line.rfid_tagged_count || 0) > 0 && (
                                                <span
                                                    className="inline-flex max-w-full items-center gap-1 rounded-md border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-sky-700"
                                                    data-testid={`rfid-tagged-${line.line_id}`}
                                                    title={line.rfid_tags?.join(", ") || "RFID tags captured before QA"}
                                                >
                                                    <Radio className="h-3 w-3 shrink-0" />
                                                    RFID pre-QA: {line.rfid_tagged_count}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                                        <div
                                            aria-label="Product Category Type"
                                            className={`px-2.5 py-1 rounded-lg text-[8px] uppercase font-extrabold border transition-all ${row.isPackaging
                                                    ? "bg-purple-500/10 text-purple-600 border-purple-500/20"
                                                    : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                                }`}
                                        >
                                            {row.isPackaging ? "Packaging (Lot Req)" : "Raw Material (Expiry Req)"}
                                        </div>
                                    </div>
                                </div>

                                {readOnly ? (
                                    <div className="border-t pt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] text-muted-foreground">
                                        <span><strong className="text-foreground">Recorded QA status:</strong> {line.qa_status || "Received"}</span>
                                    </div>
                                ) : (
                                    <ProductQaChecklist
                                        lineId={line.line_id}
                                        loadState={qaSpecificationStates[prod.product_id]}
                                        readings={qaReadings[line.line_id] || {}}
                                        onReadingChange={handleUpdateQaReading}
                                        readOnly={readOnly}
                                    />
                                )}
                                {lineIssue("qaReading") && (
                                    <p className="border-t pt-2 text-[9px] font-semibold text-red-600" role="alert">
                                        {receivingValidationIssues
                                            .filter(issue => issue.lineId === line.line_id && issue.field === "qaReading")
                                            .map(issue => issue.message)
                                            .join(" ")}
                                    </p>
                                )}

                                <div className="flex flex-wrap gap-x-5 gap-y-1 border-y py-2 text-[9px] font-semibold text-muted-foreground">
                                    <span>Previously received: <strong className="text-foreground">{previouslyReceivedVal.toLocaleString()}</strong></span>
                                    <span>Previously accepted: <strong className="text-emerald-700">{previouslyAcceptedVal.toLocaleString()}</strong></span>
                                    <span>Remaining accepted: <strong className="text-primary">{remainingAcceptedVal.toLocaleString()}</strong></span>
                                    <span>Physical remaining: <strong className="text-foreground">{remainingVal.toLocaleString()}</strong></span>
                                </div>

                                 {/* QA Inputs Grid - Touch Optimized layout */}
                                 {(() => {
                                     const convFactor = Number(line.product_id?.unit_of_measurement_count || 1);
                                     const childUom = line.product_id?.unit_of_measurement?.unit_shortcut || "PCS";
                                     const parentObj = line.product_id?.parent_id;
                                     const parentUom = parentObj && typeof parentObj === "object" 
                                         ? (parentObj as { unit_of_measurement?: { unit_shortcut?: string } }).unit_of_measurement?.unit_shortcut 
                                         : null;
                                     const baseUom = parentUom || childUom;

                                    const receivedEquiv = receivedVal * convFactor;
                                    const acceptedEquiv = acceptedVal * convFactor;
                                    const rejectedEquiv = rejectedVal * convFactor;

                                     return (
                                         <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                                             {/* Received Quantity Stepper */}
                                             <div className="space-y-1">
                                                 <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                                                       This Receipt - Received Quantity {!readOnly && receivedVal > 0 && <span className="text-red-500">*</span>}
                                                 </label>
                                                 <div className="flex items-center">
                                                     <button
                                                         type="button"
                                                         onClick={() => handleUpdateRow(line.line_id, "receivedQty", Math.max(0, receivedVal - 1))}
                                                         disabled={readOnly}
                                                         className="w-10 h-10 border border-r-0 bg-background text-foreground rounded-l-lg hover:bg-muted font-extrabold flex items-center justify-center transition-colors text-base select-none shrink-0"
                                                     >
                                                         <Minus className="h-3.5 w-3.5" />
                                                     </button>
                                                     <input
                                                         type="number"
                                                         min="0"
                                                         step="any"
                                                         placeholder="Manually count"
                                                        value={row.receivedQty}
                                                        onChange={e => handleUpdateRow(line.line_id, "receivedQty", e.target.value === "" ? "" : Number(e.target.value))}
                                                        disabled={readOnly}
                                                         aria-invalid={!readOnly && Boolean(quantityIssue)}
                                                        className="w-full h-10 border border-border bg-background text-center text-xs font-semibold text-foreground outline-none focus:ring-0 transition-all"
                                                     />
                                                     <button
                                                         type="button"
                                                         onClick={() => handleUpdateRow(line.line_id, "receivedQty", receivedVal + 1)}
                                                         disabled={readOnly}
                                                         className="w-10 h-10 border border-l-0 bg-background text-foreground rounded-r-lg hover:bg-muted font-extrabold flex items-center justify-center transition-colors text-base select-none shrink-0"
                                                     >
                                                         <Plus className="h-3.5 w-3.5" />
                                                     </button>
                                                 </div>
                                                 {receivedEquiv > 0 && convFactor !== 1 && (
                                                     <span className="text-[9px] text-primary font-bold block mt-1 bg-primary/5 px-2 py-0.5 rounded border border-primary/10 w-fit select-none">
                                                         = {receivedEquiv.toLocaleString()} {baseUom}
                                                     </span>
                                                 )}
                                             </div>

                                            {/* Accepted Quantity Stepper */}
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                                                      This Receipt - Accepted Quantity {!readOnly && receivedVal > 0 && <span className="text-red-500">*</span>}
                                                </label>
                                                <div className="flex items-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUpdateRow(line.line_id, "acceptedQty", Math.max(0, acceptedVal - 1))}
                                                        disabled={readOnly}
                                                        className="w-10 h-10 border border-r-0 bg-background text-foreground rounded-l-lg hover:bg-muted font-extrabold flex items-center justify-center transition-colors text-base select-none shrink-0"
                                                    >
                                                        <Minus className="h-3.5 w-3.5" />
                                                    </button>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max={receivedVal || undefined}
                                                        step="any"
                                                        placeholder="Accepted qty"
                                                        value={row.acceptedQty}
                                                        onChange={e => handleUpdateRow(line.line_id, "acceptedQty", e.target.value === "" ? "" : Number(e.target.value))}
                                                        disabled={readOnly}
                                                         aria-invalid={!readOnly && (!quantitiesReconcile || Boolean(quantityIssue))}
                                                         className={`w-full h-10 border bg-background text-center text-xs font-semibold text-foreground outline-none focus:ring-0 ${!readOnly && !quantitiesReconcile ? "border-red-500 bg-red-500/5" : ""}`}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUpdateRow(line.line_id, "acceptedQty", Math.min(receivedVal, acceptedVal + 1))}
                                                        disabled={readOnly}
                                                        className="w-10 h-10 border border-l-0 bg-background text-foreground rounded-r-lg hover:bg-muted font-extrabold flex items-center justify-center transition-colors text-base select-none shrink-0"
                                                    >
                                                        <Plus className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                                {acceptedEquiv > 0 && convFactor !== 1 && (
                                                    <span className="text-[9px] text-emerald-600 font-bold block mt-1 bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10 w-fit select-none">
                                                        = {acceptedEquiv.toLocaleString()} {baseUom}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Rejected Quantity */}
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                                                     This Receipt - Rejected Quantity <span className="text-[8px] normal-case font-semibold text-muted-foreground">(calculated)</span>
                                                </label>
                                                <div
                                                    role="status"
                                                    aria-label="Rejected quantity (calculated)"
                                                    className={`flex h-10 items-center justify-center rounded-lg border bg-muted/40 px-3 text-center text-xs font-semibold text-foreground ${!readOnly && (!quantitiesReconcile || Boolean(quantityIssue)) ? "border-red-500 bg-red-500/5" : "border-border"}`}
                                                >
                                                    {Number.isFinite(rejectedVal) ? rejectedVal.toLocaleString() : "—"}
                                                </div>
                                                <span className="text-[9px] text-muted-foreground block mt-1">Received − Accepted</span>
                                                {rejectedEquiv > 0 && convFactor !== 1 && (
                                                    <span className="text-[9px] text-red-600 font-bold block mt-1 bg-red-500/5 px-2 py-0.5 rounded border border-red-500/10 w-fit select-none">
                                                        = {rejectedEquiv.toLocaleString()} {baseUom}
                                                    </span>
                                                )}
                                            </div>
                                         {quantityIssue && <p className="sm:col-span-3 text-[9px] font-semibold text-red-600" role="alert">{quantityIssue.message}</p>}
                                         </div>
                                     );
                                })()}

                                {receivedVal > 0 && (acceptedVal > 0 || rejectedVal > 0) && (
                                    <div
                                        data-testid={`inventory-allocation-sequence-${line.line_id}`}
                                        className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-3 overflow-visible"
                                        aria-label="Inventory storage-lot allocations"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div>
                                                <p className="text-[9px] font-extrabold uppercase tracking-wider text-emerald-700">Inventory allocation sequence</p>
                                                <p className="text-[10px] text-muted-foreground">Select Lot → Batch Number → Manufacturing/Expiry Dates → Quantity. Lots are filtered by Product Type, UOM, and remaining capacity; over-capacity entries remain editable and are flagged for audit review.</p>
                                                {(lineIssue("acceptedStorageLot") || lineIssue("rejectedStorageLot")) && (
                                                    <p className="text-[9px] font-semibold text-red-600" role="alert">
                                                        {lineIssue("acceptedStorageLot")?.message || lineIssue("rejectedStorageLot")?.message}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        {lineStorageLots.length === 0 && (
                                            <p className="text-[9px] font-semibold text-amber-700" role="alert">
                                                No compatible storage lots are available. A lot must match this product&apos;s Product Type and UOM and have remaining capacity.
                                            </p>
                                        )}
                                        {acceptedVal > 0 && (
                                            <LotAllocationEditor
                                                lineId={line.line_id}
                                                productId={Number(prod.product_id)}
                                                isPackaging={row.isPackaging}
                                                disposition="accepted"
                                                allocations={row.acceptedLotAllocations}
                                                otherAllocations={row.rejectedLotAllocations}
                                                expectedQuantity={acceptedVal}
                                                storageLots={lineStorageLots}
                                                readOnly={readOnly}
                                                loadStorageLotBatches={loadStorageLotBatches}
                                                onChange={allocations => handleUpdateAllocations(line.line_id, allocations)}
                                                onAddLot={() => addAcceptedLot(line.line_id, row)}
                                            />
                                        )}
                                        {rejectedVal > 0 && (
                                            <div className="space-y-2 border-t border-red-500/20 pt-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div>
                                                        <p className="text-[9px] font-extrabold uppercase tracking-wider text-red-700">Rejected quantity by storage lot</p>
                                                        <p className="text-[10px] text-muted-foreground">Rejected stock follows the same Lot → Batch → Dates → Quantity sequence.</p>
                                                    </div>
                                                </div>
                                        {lineRejectedStorageLots.length === 0 && (
                                            <p className="text-[9px] font-semibold text-amber-700" role="alert">
                                                {hasConfiguredBadOrderBranch
                                                    ? "No compatible quarantine / Bad Order storage lots are available. A lot must match this product's UOM and be active on the configured Bad Order branch."
                                                    : "The receiving branch has no active Bad Order / quarantine branch configured, so rejected quantity cannot be mapped to storage lots."}
                                            </p>
                                        )}
                                                <LotAllocationEditor
                                                    lineId={line.line_id}
                                                    productId={Number(prod.product_id)}
                                                    isPackaging={row.isPackaging}
                                                    disposition="rejected"
                                                    allocations={row.rejectedLotAllocations}
                                                    otherAllocations={row.acceptedLotAllocations}
                                                    expectedQuantity={rejectedVal}
                                                    storageLots={lineRejectedStorageLots}
                                                    readOnly={readOnly}
                                                    loadStorageLotBatches={loadStorageLotBatches}
                                                    onChange={allocations => handleUpdateRejectedAllocations(line.line_id, allocations)}
                                                    onAddLot={() => addRejectedLot(line.line_id, row)}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {evaluation && evaluation.routes.length > 0 && (
                                    <div className="border-y py-2.5 flex flex-wrap gap-x-5 gap-y-2" aria-label="Server inventory routes">
                                        {evaluation.routes.map((route, routeIndex) => {
                                            const routeKey = [
                                                route.kind,
                                                route.storageLotId,
                                                route.supplierBatchNumber ?? "",
                                                route.manufacturingDate ?? "",
                                                route.expiryDate ?? "",
                                                routeIndex,
                                            ].join("-");

                                            return (
                                                <div key={routeKey} className="flex items-start gap-2 min-w-[220px]">
                                                    {route.kind === "Passed" ? (
                                                        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
                                                    ) : (
                                                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-red-600" />
                                                    )}
                                                    <div className="min-w-0">
                                                        <p className={`text-[10px] font-extrabold ${route.kind === "Passed" ? "text-emerald-700" : "text-red-700"}`}>
                                                            {route.kind} {route.quantity.toLocaleString()} -&gt; {route.branch.name}
                                                        </p>
                                                        <p className="text-[9px] text-muted-foreground truncate">
                                                            {route.storageLotName} | {route.transactionType.name} | {route.branch.code}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Remarks field */}
                                <div className="space-y-1 pt-1">
                                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                                         Remarks / Rejection Notes {!readOnly && isRemarksMandatory && <span className="text-red-500">*</span>}
                                    </label>
                                    <input
                                        type="text"
                                         required={!readOnly && isRemarksMandatory}
                                        placeholder={isRemarksMandatory ? "Logistics discrepancy or bad order explanation is mandatory" : "Reason for discrepancy or failure"}
                                        value={row.rejectionReason}
                                        onChange={e => handleUpdateRow(line.line_id, "rejectionReason", e.target.value)}
                                        disabled={readOnly}
                                        aria-invalid={Boolean(lineIssue("remarks"))}
                                        aria-describedby={lineIssue("remarks") ? `remarks-error-${line.line_id}` : undefined}
                                        className={`w-full h-10 bg-background border text-foreground rounded-lg px-3 py-1.5 text-xs font-semibold focus:ring-1 focus:ring-primary ${lineIssue("remarks") ? "border-red-500" : ""}`}
                                    />
                                    {lineIssue("remarks") && <p id={`remarks-error-${line.line_id}`} className="text-[9px] font-semibold text-red-600" role="alert">{lineIssue("remarks")?.message}</p>}
                                </div>

                                {/* Discrepancy warnings */}
                                 {!readOnly && receivedVal > 0 && receivedVal !== remainingVal && (
                                     <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-2.5 flex items-center gap-2 text-[10px] text-amber-600 animate-in fade-in duration-200">
                                         <AlertTriangle className="h-4 w-4 shrink-0" />
                                         <span>{overDeliveryQuantity > 1e-9
                                             ? `Over-delivery warning: received ${receivedVal.toLocaleString()} vs expected ${remainingVal.toLocaleString()} (excess ${overDeliveryQuantity.toLocaleString()}).`
                                             : `Logistics discrepancy detected: received ${receivedVal.toLocaleString()} vs expected ${remainingVal.toLocaleString()}.`}</span>
                                     </div>
                                 )}
                                 {!readOnly && !quantitiesReconcile && (receivedVal > 0 || acceptedVal > 0 || rejectedVal > 0) && (
                                    <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-2.5 flex items-center gap-2 text-[10px] text-red-600 animate-in fade-in duration-200">
                                        <AlertTriangle className="h-4 w-4 shrink-0" />
                                        <span>{acceptedVal > receivedVal
                                            ? "Accepted quantity cannot exceed received quantity."
                                            : "Enter valid received and accepted quantities."}</span>
                                    </div>
                                )}
                                 {!readOnly && rejectedVal > 0 && (
                                    <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-2.5 flex items-center gap-2 text-[10px] text-red-500 animate-in fade-in duration-200">
                                        <AlertTriangle className="h-4 w-4 shrink-0" />
                                        <span>Warning: {rejectedVal} units are marked rejected. Remarks are mandatory.</span>
                                    </div>
                                )}
                                {evaluation?.forceRejected && (
                                    <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-2.5 flex items-center gap-2 text-[10px] text-red-700">
                                        <AlertTriangle className="h-4 w-4 shrink-0" />
                                        <span>{evaluation.rejectionReason || "A critical QA failure forced the entire received quantity to Rejected."}</span>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            <div className="p-4 border-t bg-muted/15 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
                {readOnly ? (
                    <div className="flex items-start gap-2 text-[10px] text-emerald-700 max-w-xl" role="status">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>This purchase order has already been received. The details are available for viewing only.</span>
                    </div>
                ) : qaSubmissionBlockReason ? (
                    <div className="flex items-start gap-2 text-[10px] text-amber-700 max-w-xl" role="alert">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>{qaSubmissionBlockReason}</span>
                    </div>
                ) : previewError ? (
                    <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[10px] text-red-700 max-w-xl" role="alert" aria-live="assertive">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <div>
                            <strong>Preview could not be generated.</strong>
                            <p className="mt-0.5">{previewError}</p>
                            <button
                                type="button"
                                onClick={onRetryPreview}
                                disabled={validatingInspection || loadingLines || receivingValidationIssues.length > 0}
                                className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-md border border-red-700/40 px-2.5 text-[10px] font-bold text-red-700 hover:bg-red-500/10 disabled:cursor-wait disabled:opacity-60"
                            >
                                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                                Retry preview
                            </button>
                        </div>
                    </div>
                ) : receivingValidationIssues.length > 0 ? (
                    <div className="flex items-start gap-2 text-[10px] text-red-700 max-w-xl" role="alert" aria-live="polite">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <div>
                            <strong>Complete the required fields before previewing:</strong>
                            <ul className="mt-1 list-disc pl-4 space-y-0.5">
                                {receivingValidationIssues.slice(0, 6).map((issue, issueIndex) => <li key={`${issue.lineId || "global"}-${issue.field}-${issue.message}-${issueIndex}`}>{issue.message}</li>)}
                            </ul>
                            {receivingValidationIssues.length > 6 && <span>Resolve the remaining {receivingValidationIssues.length - 6} issue(s) shown on the manifest lines.</span>}
                        </div>
                    </div>
                ) : hasQuantityMismatch ? (
                    <div className="flex items-start gap-2 text-[10px] text-red-700 max-w-xl" role="alert">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>Reconcile every line before generating the movement preview: received quantity must equal accepted plus rejected.</span>
                    </div>
                ) : hasAllocationMismatch ? (
                    <div className="flex items-start gap-2 text-[10px] text-red-700 max-w-xl" role="alert">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>Allocate every accepted unit to storage lots before generating the movement preview.</span>
                    </div>
                ) : hasRejectedAllocationMismatch ? (
                    <div className="flex items-start gap-2 text-[10px] text-red-700 max-w-xl" role="alert">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>Assign every rejected unit to a quarantine / Bad Order storage lot before generating the movement preview.</span>
                    </div>
                ) : (
                    <div className="flex items-start gap-2 text-[10px] text-muted-foreground max-w-xl">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>{previewAcknowledged ? "Receiving was completed." : "Review the movement preview, then use Confirm & Receive to create the records."}</span>
                    </div>
                )}
                <div className="flex justify-end gap-3">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-5 py-2.5 border rounded-xl text-xs font-bold text-muted-foreground hover:bg-muted h-11 flex items-center justify-center cursor-pointer"
                >
                    {readOnly ? "Back to Inbound QA Queue" : "Cancel Inspection"}
                </button>
                {canForceReceive && (
                    <button
                        type="button"
                        onClick={() => setForceReceivedOpen(true)}
                        disabled={forceReceivedSubmitting || loadingLines}
                        className="px-5 py-2.5 border border-violet-300 text-violet-700 rounded-xl text-xs font-bold h-11 flex items-center justify-center cursor-pointer hover:bg-violet-500/10 disabled:opacity-60"
                    >
                        Force Received
                    </button>
                )}
                {!readOnly && (
                    <button
                        type={hasPreview ? "button" : "submit"}
                        onClick={hasPreview ? onReviewPreview : undefined}
                        disabled={loadingLines || validatingInspection || Boolean(qaSubmissionBlockReason) || receivingValidationIssues.length > 0 || hasQuantityMismatch || hasAllocationMismatch || hasRejectedAllocationMismatch}
                        className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-bold flex items-center gap-1.5 shadow h-11 justify-center cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                    >
                        {validatingInspection ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</> : qaSubmissionBlockReason ? <><AlertTriangle className="h-4 w-4" /> QA Configuration Required</> : receivingValidationIssues.length > 0 ? <><AlertTriangle className="h-4 w-4" /> Complete Required Fields</> : hasPreview ? <><ReceiptText className="h-4 w-4" /> Review Movement Preview</> : previewError ? <><RefreshCw className="h-4 w-4" /> Retry Preview</> : <><CheckCircle2 className="h-4 w-4" /> Preview QA & Routes</>}
                    </button>
                )}
                </div>
            </div>
            {onForceReceived && (
                <ForceReceivedDialog
                    open={forceReceivedOpen}
                    shipment={selectedShipment}
                    lineItems={lineItems}
                    submitting={forceReceivedSubmitting}
                    onCancel={() => setForceReceivedOpen(false)}
                    onConfirm={async reason => {
                        await onForceReceived(reason);
                        setForceReceivedOpen(false);
                    }}
                />
            )}
        </form>
    );
}
