import { Shipment, ShipmentLineItem, Branch, StorageLot, StorageLotBatch, QaSpecification, ReceivingCommitPayload, ReceivingCommitResult, ReceivingPreview, QuarantineDisposition, QuarantineStock, ForceReceivedResult, SupplierDocumentType } from "../types";

export interface QuarantineDispositionResponse {
    stock: QuarantineStock[];
    dispositions: QuarantineDisposition[];
}

export async function fetchActiveShipments(filters: {
    search?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    includeReceived?: boolean;
} = {}, signal?: AbortSignal): Promise<Shipment[]> {
    const params = new URLSearchParams({
        limit: "100",
        queue: "receiving",
        includeReceived: String(Boolean(filters.includeReceived))
    });
    if (filters.search) params.set("search", filters.search);
    if (filters.status) params.set("status", filters.status);
    if (filters.startDate) params.set("startDate", filters.startDate);
    if (filters.endDate) params.set("endDate", filters.endDate);
    const res = await fetch(`/api/manufacturing/purchase-orders?${params.toString()}`, { signal });
    if (!res.ok) throw new Error("Failed to load active shipments");
    const body = await res.json();
    return body.data || [];
}

export async function fetchBranches(signal?: AbortSignal): Promise<Branch[]> {
    const res = await fetch("/api/manufacturing/qa-receiving?action=branches", { signal });
    if (!res.ok) throw new Error("Failed to load branch list");
    return res.json();
}

export async function fetchSupplierDocumentTypes(signal?: AbortSignal): Promise<SupplierDocumentType[]> {
    const res = await fetch("/api/manufacturing/qa-receiving/document-types", { signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Failed to load supplier document types.");
    const data = Array.isArray(body) ? body : body.data;
    if (!Array.isArray(data)) throw new Error("Supplier document types returned an invalid response.");
    return data as SupplierDocumentType[];
}

export async function fetchStorageLots(productId: number, branchId: number, signal?: AbortSignal): Promise<StorageLot[]> {
    const res = await fetch(`/api/manufacturing/qa-receiving?action=lots&productId=${encodeURIComponent(productId)}&branchId=${encodeURIComponent(branchId)}`, { signal });
    if (!res.ok) throw new Error("Failed to load storage lots");
    return res.json();
}

export async function fetchStorageLotBatches(productId: number, branchId: number, lotId: number, signal?: AbortSignal): Promise<StorageLotBatch[]> {
    const params = new URLSearchParams({
        action: "batches",
        productId: String(productId),
        branchId: String(branchId),
        lotId: String(lotId)
    });
    const res = await fetch(`/api/manufacturing/qa-receiving?${params.toString()}`, { signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Failed to load storage-lot batches");
    return Array.isArray(body) ? body : [];
}

export async function fetchShipmentDetails(shipmentId: number, signal?: AbortSignal): Promise<ShipmentLineItem[]> {
    const res = await fetch(`/api/manufacturing/purchase-orders/${shipmentId}`, { signal });
    if (!res.ok) throw new Error("Failed to load shipment lines");
    const body = await res.json();
    return body.data || [];
}

export async function fetchQaReceivingDetail(
    shipmentId: number,
    replacementDispositionId?: number,
    signal?: AbortSignal
): Promise<{
    shipment: Shipment;
    lineItems: ShipmentLineItem[];
    replacementDisposition: QuarantineDisposition | null;
}> {
    const params = new URLSearchParams();
    if (replacementDispositionId) params.set("replacementDispositionId", String(replacementDispositionId));
    const query = params.toString();
    const res = await fetch(`/api/manufacturing/qa-receiving/${encodeURIComponent(String(shipmentId))}${query ? `?${query}` : ""}`, { signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Failed to load QA receiving details.");
    const data = body.data;
    if (!data?.shipment || !Array.isArray(data.lineItems)) {
        throw new Error("QA receiving details returned an invalid response.");
    }
    return {
        shipment: data.shipment as Shipment,
        lineItems: data.lineItems as ShipmentLineItem[],
        replacementDisposition: data.replacementDisposition || null
    };
}

export async function fetchProductQaSpecifications(productId: number, signal?: AbortSignal): Promise<QaSpecification[]> {
    const params = new URLSearchParams({ productId: String(productId) });
    const res = await fetch(`/api/manufacturing/qa/specifications?${params.toString()}`, { signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(body.error || "Failed to load the product QA checklist.");
    }
    return Array.isArray(body.data) ? body.data : [];
}

export async function previewReceivingQa(payload: {
    shipmentId: number;
    replacementDispositionId?: number | null;
    receiptNumber: string;
    receiptDate: string;
    supplierDocumentTypeId: number | null;
    processOverDelivery: boolean;
    destinationBranchId: number;
    lines: Array<{
        lineId: number;
        productId: number;
        receivedQuantity: number;
        acceptedQuantity: number;
        rejectedQuantity: number;
        acceptedLotAllocations: Array<{
            storageLotId: number;
            batchNumber: string;
            manufacturingDate: string | null;
            expirationDate: string | null;
            quantity: number;
        }>;
        rejectedLotAllocations: Array<{
            storageLotId: number;
            batchNumber: string;
            manufacturingDate: string | null;
            expirationDate: string | null;
            quantity: number;
        }>;
        remarks: string | null;
        isPackaging: boolean;
        readings: Array<{ specId: number; actualReading: string }>;
    }>;
}, signal?: AbortSignal): Promise<ReceivingPreview> {
    const res = await fetch("/api/manufacturing/qa-receiving/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(body.error || "Failed to generate receiving preview.");
    }
    if (!body.data || !Array.isArray(body.data.lines) || typeof body.data.postingEnabled !== "boolean") {
        throw new Error("Receiving preview returned an invalid response.");
    }
    return body.data as ReceivingPreview;
}

export async function commitReceivingQa(payload: ReceivingCommitPayload, idempotencyKey: string): Promise<ReceivingCommitResult> {
    const res = await fetch("/api/manufacturing/qa-receiving/commit", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Failed to post receiving.");
    if (
        body.data?.mode !== "compatibility"
        || !body.data?.commitReference
        || typeof body.data?.receivingTicketNumber !== "string"
        || (body.data.status === "Received" && Number(body.data.paymentStatus) !== 2)
        || !Array.isArray(body.data?.receivingRecords)
        || body.data.receivingRecords.some((record: Record<string, unknown>) =>
            !Number.isSafeInteger(Number(record.receivingRecordId))
            || !Number.isSafeInteger(Number(record.lineId))
            || !Array.isArray(record.inventoryLotIds)
            || record.inventoryLotIds.some((id: unknown) => !Number.isSafeInteger(Number(id)))
            || !Array.isArray(record.qaResultIds)
            || record.qaResultIds.some((id: unknown) => !Number.isSafeInteger(Number(id)))
        )
        || !Array.isArray(body.data?.movements)
        || body.data.movements.some((movement: Record<string, unknown>) =>
            !Number.isSafeInteger(Number(movement.movementId))
            || !Number.isSafeInteger(Number(movement.receivingLineId))
            || !Number.isSafeInteger(Number(movement.inventoryLotId))
        )
    ) {
        throw new Error("Receiving commit returned an invalid response.");
    }
    return body.data as ReceivingCommitResult;
}

export async function forceReceivePurchaseOrder(
    payload: { shipmentId: number; workflowRevision: number; reason: string },
    idempotencyKey: string
): Promise<ForceReceivedResult> {
    const res = await fetch("/api/manufacturing/qa-receiving/force-received", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Failed to force-receive the purchase order.");
    const data = body.data as ForceReceivedResult | undefined;
    if (
        !data
        || data.status !== "Received"
        || Number(data.inventoryStatus) !== 6
        || Number(data.paymentStatus) !== 2
        || data.isForceReceived !== true
        || !Array.isArray(data.lines)
        || data.lines.some(line => Number(line.remainingQuantity) !== 0 || Number(line.remainingAcceptedQuantity) !== 0)
    ) {
        throw new Error("Force Received returned an invalid closure response.");
    }
    return data;
}

export async function fetchQuarantineDispositions(signal?: AbortSignal): Promise<QuarantineDispositionResponse> {
    const res = await fetch("/api/manufacturing/qa-receiving/quarantine", { signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Failed to load quarantined stock.");
    if (!Array.isArray(body.stock) || !Array.isArray(body.dispositions)) {
        throw new Error("Quarantine response returned an invalid shape.");
    }
    return body as QuarantineDispositionResponse;
}

export async function createQuarantineDisposition(payload: {
    sourceReceivingId: number;
    lotId: number;
    batchNo: string;
    dispositionType: "VENDOR_RETURN" | "REPLACEMENT";
    requestedQuantity: number;
    reason: string;
    supplierReference: string | null;
}): Promise<QuarantineDisposition> {
    const res = await fetch("/api/manufacturing/qa-receiving/quarantine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, idempotencyKey: crypto.randomUUID() })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Failed to create quarantine disposition.");
    return body.data as QuarantineDisposition;
}

export async function processQuarantineReturn(dispositionId: number, quantity: number): Promise<QuarantineDisposition> {
    const res = await fetch(`/api/manufacturing/qa-receiving/quarantine/${dispositionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ action: "PROCESS_RETURN", quantity, operationKey: crypto.randomUUID() })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Failed to process the vendor return.");
    return body.data as QuarantineDisposition;
}

export async function cancelQuarantineDisposition(dispositionId: number): Promise<QuarantineDisposition> {
    const res = await fetch(`/api/manufacturing/qa-receiving/quarantine/${dispositionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CANCEL" })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Failed to cancel the quarantine disposition.");
    return body.data as QuarantineDisposition;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchFifoInventory(branchId: string, signal?: AbortSignal): Promise<any[]> {
    const res = await fetch(`/api/manufacturing/qa-receiving?branchId=${branchId}`, { signal });
    if (!res.ok) throw new Error("Failed to load branch inventory ledger");
    return res.json();
}
