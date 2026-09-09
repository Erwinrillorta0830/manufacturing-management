import { LotTransferError } from "./_errors";
import { LOT_TRANSFER_EPSILON } from "./_config";
import {
    readById,
    readInventoryLot,
    readMmLot,
    readOptionalInventoryLot,
    readProduct,
    directusRows,
    MM_INVENTORY_LOT_COLLECTION
} from "./_directus";
import type { RecordValue } from "./_directus";
import {
    readDestinationBatchCandidates,
    resolveDestinationBatch
} from "./_destination-batch";
import {
    movementsForBatch,
    movementsForLot,
    protectedAllocationsForInventoryLot,
    type ProtectedAllocationSummary
} from "./_inventory-availability";
import {
    legacyDetailFromRecord
} from "./_record-mappers";
import type {
    LotBalanceSnapshot,
    LotTransferDetail,
    LotTransferPreview,
    LotTransferRecord,
    ProtectedAllocation,
    ValidationCheck
} from "./_types";
import {
    allergenProfile,
    branchId,
    dateOnly,
    dateValue,
    earliestDate,
    firstValue,
    formatProtectedAllocationQuantity,
    inventoryLotId,
    lotId,
    normalizeStatus,
    normalizedBatch,
    nullableNumeric,
    numeric,
    positiveCapacity,
    productId,
    profilesEqual,
    sumMovementQuantities,
    unitId,
    validDate
} from "./_values";

export interface TransferContext {
    record: LotTransferRecord;
    branch: RecordValue;
    sourceLot: RecordValue;
    targetLot: RecordValue;
    sourceInventoryLot: RecordValue;
    targetInventoryLot: RecordValue;
    targetInventoryLotCandidates: RecordValue[];
    providedTargetInventoryLot: RecordValue | null;
    sourceInventoryLotCollection: string;
    targetInventoryLotCollection: string;
    sourceProduct: RecordValue;
    targetProduct: RecordValue;
    sourceAllergens: { available: boolean; values: string[] };
    targetAllergens: { available: boolean; values: string[] };
    sourceMovements: RecordValue[];
    targetBatchMovements: RecordValue[];
    sourceLotMovements: RecordValue[];
    targetLotMovements: RecordValue[];
    sourceProtectedAllocations: ProtectedAllocationSummary;
    targetProtectedAllocations: ProtectedAllocationSummary;
}

export async function loadTransferContext(record: LotTransferRecord, excludeTransferMovements = false): Promise<TransferContext> {
    const [branch, sourceLot, targetLot, sourceInventoryLotLookup, providedTargetInventoryLotLookup, sourceProduct, targetProduct] = await Promise.all([
        readById(["branches"], record.branchId, "Branch lookup"),
        readMmLot(record.sourceLotId, "Source lot lookup"),
        readMmLot(record.targetLotId, "Target lot lookup"),
        readInventoryLot(record.sourceInventoryLotId, "Source inventory lot lookup"),
        readOptionalInventoryLot(record.targetInventoryLotId, "Target inventory lot lookup"),
        readProduct(record.productId),
        readProduct(record.productId)
    ]);
    const sourceInventoryLot = sourceInventoryLotLookup.row;
    const targetInventoryLotCandidates = await readDestinationBatchCandidates({
        lotId: record.targetLotId,
        productId: record.productId,
        batchNo: record.targetBatchNo,
        readRows: directusRows
    });
    const targetInventoryLot = targetInventoryLotCandidates[0] || providedTargetInventoryLotLookup?.row || {};
    const targetInventoryLotLookup = targetInventoryLotCandidates[0]
        ? { row: targetInventoryLotCandidates[0], collection: MM_INVENTORY_LOT_COLLECTION }
        : providedTargetInventoryLotLookup;

    const excludedTransfer = excludeTransferMovements ? { id: record.id, requestNo: record.requestNo } : undefined;
    const [sourceMovements, targetBatchMovements, sourceLotMovements, targetLotMovements, sourceProtectedAllocations, targetProtectedAllocations] = await Promise.all([
        movementsForBatch({ productId: record.productId, branchId: record.branchId, lotId: record.sourceLotId, batchNo: record.sourceBatchNo }, excludedTransfer),
        movementsForBatch({ productId: record.productId, branchId: record.branchId, lotId: record.targetLotId, batchNo: record.targetBatchNo }, excludedTransfer),
        movementsForLot({ branchId: record.branchId, lotId: record.sourceLotId }, excludedTransfer),
        movementsForLot({ branchId: record.branchId, lotId: record.targetLotId }, excludedTransfer),
        protectedAllocationsForInventoryLot({
            branchId: record.branchId,
            productId: record.productId,
            lotId: record.sourceLotId,
            inventoryLotId: record.sourceInventoryLotId,
            batchNo: record.sourceBatchNo,
            legacyReservedQuantity: numeric(sourceInventoryLot.reserved_quantity),
            excludeLotTransferId: record.id
        }),
        targetInventoryLotLookup
            ? protectedAllocationsForInventoryLot({
                branchId: record.branchId,
                productId: record.productId,
                lotId: record.targetLotId,
                inventoryLotId: inventoryLotId(targetInventoryLot),
                batchNo: record.targetBatchNo,
                legacyReservedQuantity: numeric(targetInventoryLot.reserved_quantity),
                excludeLotTransferId: record.id
            })
            : Promise.resolve({ legacyReservedQuantity: 0, explicitQuantity: 0, totalQuantity: 0, allocations: [], unresolved: [] })
    ]);

    return {
        record,
        branch,
        sourceLot,
        targetLot,
        sourceInventoryLot,
        targetInventoryLot,
        targetInventoryLotCandidates,
        providedTargetInventoryLot: providedTargetInventoryLotLookup?.row || null,
        sourceInventoryLotCollection: sourceInventoryLotLookup.collection,
        targetInventoryLotCollection: targetInventoryLotLookup?.collection || MM_INVENTORY_LOT_COLLECTION,
        sourceProduct,
        targetProduct,
        sourceAllergens: allergenProfile(sourceProduct),
        targetAllergens: allergenProfile(targetProduct),
        sourceMovements,
        targetBatchMovements,
        sourceLotMovements,
        targetLotMovements,
        sourceProtectedAllocations,
        targetProtectedAllocations
    };
}

export function check(key: string, label: string, passed: boolean, message: string): ValidationCheck {
    return { key, label, passed, message };
}

export function snapshot(input: {
    lotId: number;
    inventoryLotId: number | null;
    batchNo: string;
    onHandBefore: number;
    reservedQuantity: number;
    legacyReservedQuantity: number;
    protectedAllocationQuantity: number;
    protectedAllocations: ProtectedAllocation[];
    protectedAllocationResolutionComplete: boolean;
    unitCost: number | null;
    expiryDate: string | null;
    manufacturingDate: string | null;
    quantityDelta: number;
}): LotBalanceSnapshot {
    return {
        lotId: input.lotId,
        inventoryLotId: input.inventoryLotId,
        batchNo: input.batchNo,
        onHandBefore: Math.max(0, input.onHandBefore),
        reservedQuantity: Math.max(0, input.reservedQuantity),
        legacyReservedQuantity: Math.max(0, input.legacyReservedQuantity),
        protectedAllocationQuantity: Math.max(0, input.protectedAllocationQuantity),
        protectedAllocations: input.protectedAllocations,
        protectedAllocationResolutionComplete: input.protectedAllocationResolutionComplete,
        availableQuantity: Math.max(0, input.onHandBefore - input.reservedQuantity),
        onHandAfter: Math.max(0, input.onHandBefore + input.quantityDelta),
        unitCost: input.unitCost,
        expiryDate: input.expiryDate,
        manufacturingDate: input.manufacturingDate
    };
}

export async function buildSingleLinePreview(record: LotTransferRecord, options: { excludeTransferMovements?: boolean } = {}): Promise<LotTransferPreview> {
    const context = await loadTransferContext(record, options.excludeTransferMovements === true);
    const destinationBatchResolution = resolveDestinationBatch(record, context);
    const sourceInventoryLotIdValue = inventoryLotId(context.sourceInventoryLot);
    const targetInventoryLotIdValue = destinationBatchResolution.inventoryLotId;
    const sourceLotIdValue = lotId(context.sourceInventoryLot);
    const sourceProductIdValue = productId(context.sourceInventoryLot);
    const targetProductIdValue = productId(context.targetInventoryLot);
    const sourceBranchIdValue = branchId(context.sourceInventoryLot) || branchId(context.sourceLot);
    const targetBranchIdValue = branchId(context.targetInventoryLot) || branchId(context.targetLot);
    const sourceLotBranchId = branchId(context.sourceLot);
    const targetLotBranchId = branchId(context.targetLot);
    const sourceQuantityBefore = sumMovementQuantities(context.sourceMovements);
    const targetQuantityBefore = sumMovementQuantities(context.targetBatchMovements);
    const sourceLotOccupiedBefore = Math.max(0, sumMovementQuantities(context.sourceLotMovements));
    const targetLotOccupiedBefore = Math.max(0, sumMovementQuantities(context.targetLotMovements));
    const sourceReserved = context.sourceProtectedAllocations.totalQuantity;
    const targetReserved = context.targetProtectedAllocations.totalQuantity;
    const sourceExpiry = dateValue(context.sourceInventoryLot, ["expiry_date", "expiration_date", "expiryDate"]);
    const targetExpiry = destinationBatchResolution.expiryDate;
    const sourceMfg = dateValue(context.sourceInventoryLot, ["manufacturing_date", "manufacturingDate"]);
    const targetMfg = destinationBatchResolution.manufacturingDate;
    const sourceUnitCost = nullableNumeric(firstValue(context.sourceInventoryLot, ["unit_cost", "cost_per_unit", "final_landed_unit_cost"]));
    const targetUnitCost = destinationBatchResolution.unitCost;
    const sourceUnitId = unitId(context.sourceLot);
    const targetUnitId = unitId(context.targetLot);
    const sourceCapacity = nullableNumeric(firstValue(context.sourceLot, ["max_batch_capacity", "capacity"]));
    const targetCapacity = positiveCapacity(firstValue(context.targetLot, ["max_batch_capacity", "capacity"]));
    const targetCapacityRemaining = targetCapacity === null ? null : Math.max(0, targetCapacity - targetLotOccupiedBefore);
    const targetCapacityConfigured = targetCapacity !== null;
    const effectiveExpiry = earliestDate(sourceExpiry, targetExpiry);
    const today = new Date().toISOString().slice(0, 10);
    const targetReferenceMatches = !record.targetInventoryLotId || record.targetInventoryLotId === targetInventoryLotIdValue;
    const targetRecordIsActive = destinationBatchResolution.action === "CREATE"
        || normalizeStatus(context.targetInventoryLot.status) === "ACTIVE";
    const checks: ValidationCheck[] = [
        check("branch", "Same branch", record.branchId > 0 && sourceBranchIdValue === record.branchId && targetBranchIdValue === record.branchId && sourceLotBranchId === record.branchId && targetLotBranchId === record.branchId, "Source and destination records must belong to the requested branch."),
        check("product", "Same product", record.productId > 0 && sourceProductIdValue === record.productId && (!targetInventoryLotIdValue || targetProductIdValue === record.productId), "Source and destination batches must belong to the requested product."),
        check("identity", "Canonical lot and batch identity", sourceInventoryLotIdValue === record.sourceInventoryLotId && sourceLotIdValue === record.sourceLotId && targetReferenceMatches && destinationBatchResolution.valid, destinationBatchResolution.message),
        check("destination-batch", "Destination batch resolution", destinationBatchResolution.valid, destinationBatchResolution.message),
        check("active", "Active stock records", normalizeStatus(context.sourceLot.status) === "ACTIVE" && normalizeStatus(context.targetLot.status) === "ACTIVE" && normalizeStatus(context.sourceInventoryLot.status) === "ACTIVE" && targetRecordIsActive, "Source and destination lots/batches must be active."),
        check("qa", "QA-eligible source", ["GOOD", "PASSED", "PASS", "APPROVED"].includes(normalizeStatus(context.sourceInventoryLot.qa_status)), "Source stock must have a releasable QA status."),
        check("quantity", "Positive quantity", Number.isFinite(record.quantity) && record.quantity > 0, "Transfer quantity must be greater than zero."),
        check(
            "protected-allocations",
            "Protected allocation integrity",
            context.sourceProtectedAllocations.unresolved.length === 0,
            context.sourceProtectedAllocations.unresolved.length === 0
                ? "All active protected allocations have an exact source identity."
                : `Protected allocation reconciliation is required: ${context.sourceProtectedAllocations.unresolved.join(" ")}`
        ),
        check("source-availability", "Source availability", Math.max(0, sourceQuantityBefore - sourceReserved) + LOT_TRANSFER_EPSILON >= record.quantity, `Available source quantity is ${Math.max(0, sourceQuantityBefore - sourceReserved)} after ${formatProtectedAllocationQuantity(sourceReserved)} of protected allocations.`),
        check("target-capacity", "Target capacity", targetCapacityConfigured && (targetCapacityRemaining ?? 0) + LOT_TRANSFER_EPSILON >= record.quantity, targetCapacityConfigured ? `Destination lot currently contains ${targetLotOccupiedBefore}; configured capacity is ${targetCapacity}; remaining capacity is ${targetCapacityRemaining}.` : "Destination lot capacity is not configured. Set a positive max_batch_capacity before transferring stock."),
        check(
            "uom",
            "Unit compatibility",
            sourceUnitId !== null && targetUnitId !== null && sourceUnitId === targetUnitId,
            sourceUnitId === null || targetUnitId === null
                ? `Source and destination lots must each have an explicit valid UOM. Missing: ${[sourceUnitId === null ? "source" : "", targetUnitId === null ? "destination" : ""].filter(Boolean).join(" and ")}.`
                : sourceUnitId === targetUnitId
                    ? "Source and destination lots use the same UOM."
                    : `Source UOM ${sourceUnitId} and destination UOM ${targetUnitId} are incompatible; UOM conversion is not supported.`
        ),
        check("allergen", "Allergen profile match", context.sourceAllergens.available && context.targetAllergens.available && profilesEqual(context.sourceAllergens.values, context.targetAllergens.values), context.sourceAllergens.available && context.targetAllergens.available ? "Source and destination allergen profiles match." : "Allergen profiles are unavailable; QA approval is blocked."),
        check("dates", "Valid manufacturing and expiry dates", validDate(sourceMfg) && validDate(targetMfg) && validDate(sourceExpiry) && validDate(targetExpiry) && (!effectiveExpiry || dateOnly(effectiveExpiry)! >= today) && (!sourceMfg || !sourceExpiry || dateOnly(sourceMfg)! <= dateOnly(sourceExpiry)!) && (!targetMfg || !targetExpiry || dateOnly(targetMfg)! <= dateOnly(targetExpiry)!), "Manufacturing and expiry values must be valid, chronological, and not expired."),
        check("different-lot", "Different source and destination lots", record.sourceLotId !== record.targetLotId, "Source and destination lot IDs must be different."),
        check("different-batch", "Different source and destination batch", record.sourceLotId !== record.targetLotId || record.sourceInventoryLotId !== targetInventoryLotIdValue || normalizedBatch(record.sourceBatchNo) !== normalizedBatch(destinationBatchResolution.batchNo), "Source and destination must not be the same inventory batch.")
    ];

    return {
        transferId: record.id,
        requestNo: record.requestNo,
        canApprove: checks.every((item) => item.passed),
        canPost: checks.every((item) => item.passed),
        checks,
        source: snapshot({
            lotId: record.sourceLotId,
            inventoryLotId: record.sourceInventoryLotId,
            batchNo: record.sourceBatchNo,
            onHandBefore: sourceQuantityBefore,
            reservedQuantity: sourceReserved,
            legacyReservedQuantity: context.sourceProtectedAllocations.legacyReservedQuantity,
            protectedAllocationQuantity: context.sourceProtectedAllocations.explicitQuantity,
            protectedAllocations: context.sourceProtectedAllocations.allocations,
            protectedAllocationResolutionComplete: context.sourceProtectedAllocations.unresolved.length === 0,
            unitCost: sourceUnitCost,
            expiryDate: sourceExpiry,
            manufacturingDate: sourceMfg,
            quantityDelta: -record.quantity
        }),
        target: snapshot({
            lotId: record.targetLotId,
            inventoryLotId: targetInventoryLotIdValue,
            batchNo: destinationBatchResolution.batchNo,
            onHandBefore: targetQuantityBefore,
            reservedQuantity: targetReserved,
            legacyReservedQuantity: context.targetProtectedAllocations.legacyReservedQuantity,
            protectedAllocationQuantity: context.targetProtectedAllocations.explicitQuantity,
            protectedAllocations: context.targetProtectedAllocations.allocations,
            protectedAllocationResolutionComplete: context.targetProtectedAllocations.unresolved.length === 0,
            unitCost: targetUnitCost ?? sourceUnitCost,
            expiryDate: targetExpiry,
            manufacturingDate: targetMfg,
            quantityDelta: record.quantity
        }),
        sourceLotCapacity: sourceCapacity,
        sourceLotOccupiedBefore,
        targetLotCapacity: targetCapacity,
        targetLotOccupiedBefore,
        targetLotCapacityRemaining: targetCapacityRemaining,
        effectiveExpiryDate: effectiveExpiry,
        destinationBatchResolution,
        allergenProfiles: {
            source: context.sourceAllergens.available ? context.sourceAllergens.values : null,
            target: context.targetAllergens.available ? context.targetAllergens.values : null
        },
        movementPreview: {
            sourceQuantity: -record.quantity,
            targetQuantity: record.quantity,
            sourceLotId: record.sourceLotId,
            sourceInventoryLotId: record.sourceInventoryLotId,
            sourceBatchNo: record.sourceBatchNo,
            targetLotId: record.targetLotId,
            targetInventoryLotId: targetInventoryLotIdValue,
            targetBatchNo: destinationBatchResolution.batchNo
        },
        linePreviews: [],
        totalQuantity: record.quantity
    };
}

export function recordForDetail(record: LotTransferRecord, detail: LotTransferDetail): LotTransferRecord {
    return {
        ...record,
        productId: detail.productId,
        sourceInventoryLotId: detail.sourceInventoryLotId,
        sourceBatchNo: detail.sourceBatchNo,
        targetInventoryLotId: detail.targetInventoryLotId,
        targetBatchNo: detail.targetBatchNo,
        quantity: detail.quantity,
        sourceMovementId: detail.sourceMovementId,
        targetMovementId: detail.targetMovementId,
        sourceUnitCost: detail.sourceUnitCost,
        targetUnitCost: detail.targetUnitCost,
        sourceBalanceBefore: detail.sourceBalanceBefore,
        sourceBalanceAfter: detail.sourceBalanceAfter,
        targetBalanceBefore: detail.targetBalanceBefore,
        targetBalanceAfter: detail.targetBalanceAfter
    };
}

function replaceCheck(checks: ValidationCheck[], key: string, passed: boolean, message: string): ValidationCheck[] {
    return checks.map((item) => item.key === key ? { ...item, passed, message } : item);
}

export async function buildLotTransferPreview(record: LotTransferRecord, options: { excludeTransferMovements?: boolean } = {}): Promise<LotTransferPreview> {
    const details = record.details.length > 0 ? record.details : [legacyDetailFromRecord(record)];
    const rawLines = await Promise.all(details.map(async (detail) => {
        const preview = await buildSingleLinePreview(recordForDetail(record, detail), options);
        return {
            detail,
            preview,
            line: {
                detailId: detail.detailId,
                lineNo: detail.lineNo,
                productId: detail.productId,
                quantity: detail.quantity,
                lineRemarks: detail.lineRemarks,
                checks: preview.checks,
                source: preview.source,
                target: preview.target,
                sourceLotCapacity: preview.sourceLotCapacity,
                sourceLotOccupiedBefore: preview.sourceLotOccupiedBefore,
                targetLotCapacity: preview.targetLotCapacity,
                targetLotOccupiedBefore: preview.targetLotOccupiedBefore,
                targetLotCapacityRemaining: preview.targetLotCapacityRemaining,
                effectiveExpiryDate: preview.effectiveExpiryDate,
                destinationBatchResolution: preview.destinationBatchResolution,
                movementPreview: preview.movementPreview
            }
        };
    }));

    const sourceGroups = new Map<string, { quantity: number; available: number }>();
    const targetGroups = new Map<number, { quantity: number; capacity: number | null; remaining: number | null }>();
    for (const entry of rawLines) {
        const sourceKey = `${entry.detail.productId}:${record.sourceLotId}:${entry.detail.sourceInventoryLotId}:${entry.detail.sourceBatchNo.toLowerCase()}`;
        const sourceGroup = sourceGroups.get(sourceKey) || { quantity: 0, available: entry.preview.source.availableQuantity };
        sourceGroup.quantity += entry.detail.quantity;
        sourceGroups.set(sourceKey, sourceGroup);

        const targetGroup = targetGroups.get(record.targetLotId) || {
            quantity: 0,
            capacity: entry.preview.targetLotCapacity,
            remaining: entry.preview.targetLotCapacityRemaining
        };
        targetGroup.quantity += entry.detail.quantity;
        targetGroup.capacity = targetGroup.capacity ?? entry.preview.targetLotCapacity;
        targetGroup.remaining = targetGroup.remaining ?? entry.preview.targetLotCapacityRemaining;
        targetGroups.set(record.targetLotId, targetGroup);
    }

    const linePreviews = rawLines.map((entry) => {
        const sourceKey = `${entry.detail.productId}:${record.sourceLotId}:${entry.detail.sourceInventoryLotId}:${entry.detail.sourceBatchNo.toLowerCase()}`;
        const sourceGroup = sourceGroups.get(sourceKey)!;
        const targetGroup = targetGroups.get(record.targetLotId)!;
        const sourcePassed = sourceGroup.available + LOT_TRANSFER_EPSILON >= sourceGroup.quantity;
        const targetPassed = targetGroup.remaining !== null && targetGroup.remaining + LOT_TRANSFER_EPSILON >= targetGroup.quantity;
        const checks = replaceCheck(
            replaceCheck(
                entry.line.checks,
                "source-availability",
                sourcePassed,
                sourcePassed
                    ? `Source batch has ${formatProtectedAllocationQuantity(sourceGroup.available)} available for ${formatProtectedAllocationQuantity(sourceGroup.quantity)} across this transfer.`
                    : `Source batch has ${formatProtectedAllocationQuantity(sourceGroup.available)} available, but this transfer requires ${formatProtectedAllocationQuantity(sourceGroup.quantity)} across its detail lines.`
            ),
            "target-capacity",
            targetPassed,
            targetPassed
                ? `Destination lot has ${formatProtectedAllocationQuantity(targetGroup.remaining || 0)} capacity remaining for ${formatProtectedAllocationQuantity(targetGroup.quantity)} incoming across this transfer.`
                : targetGroup.capacity === null
                    ? "Destination lot capacity is not configured. Set a positive max_batch_capacity before transferring stock."
                    : `Destination lot has ${formatProtectedAllocationQuantity(targetGroup.remaining || 0)} capacity remaining, but this transfer requires ${formatProtectedAllocationQuantity(targetGroup.quantity)} across its detail lines.`
        );
        return { ...entry.line, checks };
    });

    const first = linePreviews[0];
    if (!first) throw new LotTransferError(400, "At least one transfer detail line is required.");
    const checks = linePreviews.flatMap((line) => line.checks.map((item) => ({
        ...item,
        key: `line-${line.lineNo}-${item.key}`,
        label: `Line ${line.lineNo}: ${item.label}`
    })));
    const totalQuantity = details.reduce((sum, detail) => sum + detail.quantity, 0);
    return {
        transferId: record.id,
        requestNo: record.requestNo,
        canApprove: checks.every((item) => item.passed),
        canPost: checks.every((item) => item.passed),
        checks,
        source: first.source,
        target: first.target,
        sourceLotCapacity: first.sourceLotCapacity,
        sourceLotOccupiedBefore: first.sourceLotOccupiedBefore,
        targetLotCapacity: first.targetLotCapacity,
        targetLotOccupiedBefore: first.targetLotOccupiedBefore,
        targetLotCapacityRemaining: first.targetLotCapacityRemaining,
        effectiveExpiryDate: linePreviews.map((line) => line.effectiveExpiryDate).filter((value): value is string => Boolean(value)).sort()[0] || null,
        destinationBatchResolution: first.destinationBatchResolution,
        allergenProfiles: rawLines[0].preview.allergenProfiles,
        movementPreview: first.movementPreview,
        linePreviews,
        totalQuantity
    };
}
