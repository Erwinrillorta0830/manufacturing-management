import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { Shipment, Branch, ShipmentLineItem, Product, InspectionRow, StorageLot, QaSpecificationLoadState, QaSpecificationReadings, ReceivingCommitPayload, ReceivingQaEvaluation, ReceivingPreview, ReceivingCommitResult, ReceivingLotAllocationInput } from "../types";
import {
    fetchActiveShipments, 
    fetchBranches, 
    fetchShipmentDetails, 
    previewReceivingQa,
    commitReceivingQa,
    fetchFifoInventory,
    fetchStorageLots,
    fetchProductQaSpecifications
} from "../services/qa-api";
import { INVENTORY_STATUS, isReceivingQueueShipmentStatus, shipmentStatusMatchesFilter } from "@/app/api/manufacturing/procurement/_domain";
import { validateReceivingMetadata, type ReceivingValidationIssue } from "../receiving-metadata";
import { deriveReceivingDisposition } from "@/app/api/manufacturing/qa/_receiving-evaluation";
import { evaluateQaReading } from "@/app/api/manufacturing/qa/_purchase-specification-domain";

interface ReceivingCommitContext {
    preview: ReceivingPreview;
    payload: ReceivingCommitPayload;
    idempotencyKey: string;
}

function resizeLotAllocations(
    allocations: ReceivingLotAllocationInput[],
    targetQuantity: number,
    fallbackLotId?: string
): ReceivingLotAllocationInput[] {
    const target = Math.max(0, Number(targetQuantity) || 0);
    if (target <= 0) return [];

    let remaining = target;
    const resized = allocations.reduce<ReceivingLotAllocationInput[]>((result, allocation) => {
        if (remaining <= 0) return result;
        const quantity = Math.min(remaining, Math.max(0, Number(allocation.quantity) || 0));
        if (quantity > 0) {
            result.push({ ...allocation, quantity });
            remaining -= quantity;
        }
        return result;
    }, []);

    if (remaining > 0 && resized.length > 0) {
        const last = resized[resized.length - 1];
        last.quantity = Number(last.quantity) + remaining;
        remaining = 0;
    }
    if (remaining > 0 && fallbackLotId) {
        resized.push({ storageLotId: fallbackLotId, quantity: remaining });
    }
    return resized;
}

function isLockedReceivingShipment(shipment: Shipment | null): boolean {
    return shipment?.status === "Received" || shipment?.status === "Partially Received";
}

export function useQAReceiving() {
    const listController = useRef<AbortController | null>(null);
    const detailController = useRef<AbortController | null>(null);
    const fifoController = useRef<AbortController | null>(null);
    const previewController = useRef<AbortController | null>(null);
    const [activeTab, setActiveTab] = useState<"inbound" | "fifo">("inbound");
    
    // Core data lists
    const [shipments, setShipments] = useState<Shipment[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [storageLots, setStorageLots] = useState<StorageLot[]>([]);
    const [loadingShipments, setLoadingShipments] = useState(false);
    const [loadingBranches, setLoadingBranches] = useState(false);

    // Selected active container details
    const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
    const [lineItems, setLineItems] = useState<ShipmentLineItem[]>([]);
    const [loadingLines, setLoadingLines] = useState(false);

    // Inspection form state
    const [receiptNumber, setReceiptNumber] = useState<string>("");
    const [receiptMode, setReceiptMode] = useState<"full" | "partial">("full");
    const [selectedBranchId, setSelectedBranchId] = useState<string>("");
    const [inspectionRows, setInspectionRows] = useState<Record<number, InspectionRow>>({});
    const [qaSpecificationStates, setQaSpecificationStates] = useState<Record<number, QaSpecificationLoadState>>({});
    const [qaReadings, setQaReadings] = useState<QaSpecificationReadings>({});
    const [qaEvaluationResults, setQaEvaluationResults] = useState<Record<number, ReceivingQaEvaluation>>({});
    const [receivingCommitContext, setReceivingCommitContext] = useState<ReceivingCommitContext | null>(null);
    const [committedResult, setCommittedResult] = useState<ReceivingCommitResult | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewAcknowledged, setPreviewAcknowledged] = useState(false);
    const [validatingInspection, setValidatingInspection] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [postingInspection, setPostingInspection] = useState(false);
    const receivingPreview = receivingCommitContext?.preview ?? null;
    const receivingCommitReady = Boolean(receivingCommitContext?.preview.postingEnabled);

    const handleReceiptNumberChange = useCallback((value: string) => {
        previewController.current?.abort();
        setReceiptNumber(value);
        setQaEvaluationResults({});
        setReceivingCommitContext(null);
        setCommittedResult(null);
        setPreviewOpen(false);
        setPreviewAcknowledged(false);
        setPreviewError(null);
        setValidatingInspection(false);
    }, []);

    const handleDestinationBranchChange = useCallback((value: string) => {
        previewController.current?.abort();
        setSelectedBranchId(value);
        setQaEvaluationResults({});
        setReceivingCommitContext(null);
        setCommittedResult(null);
        setPreviewOpen(false);
        setPreviewAcknowledged(false);
        setPreviewError(null);
        setValidatingInspection(false);
    }, []);

    // FIFO inventory screen states
    const [fifoBranchId, setFifoBranchId] = useState<string>("");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [fifoInventory, setFifoInventory] = useState<any[]>([]);
    const [loadingFifo, setLoadingFifo] = useState(false);
    const [expandedProducts, setExpandedProducts] = useState<Record<number, boolean>>({});
    const [fifoSearch, setFifoSearch] = useState("");
    const [showReceived, setShowReceived] = useState(true);

    const clearInspection = useCallback(() => {
        detailController.current?.abort();
        previewController.current?.abort();
        setSelectedShipment(null);
        setLineItems([]);
        setLoadingLines(false);
        setInspectionRows({});
        setReceiptNumber("");
        setReceiptMode("full");
        setSelectedBranchId("");
        setQaSpecificationStates({});
        setQaReadings({});
        setQaEvaluationResults({});
        setReceivingCommitContext(null);
        setCommittedResult(null);
        setPreviewOpen(false);
        setPreviewAcknowledged(false);
        setPreviewError(null);
        setValidatingInspection(false);
        setPostingInspection(false);
    }, []);

    // Filter states for shipments queue
    const [searchPO, setSearchPO] = useState("");
    const [searchStatus, setSearchStatus] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");

    const filteredShipments = useMemo(() => {
        return shipments.filter(s => {
            // Plant-approved and en-route orders must enter QA through For Pickup.
            if (!isReceivingQueueShipmentStatus(s.inventory_status ?? s.status) && s.status !== "Received") return false;

            // 1. PO# filter (case-insensitive search on reference_number or shipment_id)
            if (searchPO.trim()) {
                const poMatch = s.reference_number.toLowerCase().includes(searchPO.toLowerCase()) || 
                                String(s.shipment_id).includes(searchPO);
                if (!poMatch) return false;
            }

            // 2. Status filter
            if (searchStatus) {
                if (!shipmentStatusMatchesFilter(s.status, searchStatus)) return false;
            } else {
                // If no specific status is selected, follow showReceived logic
                if (!showReceived && s.status === "Received") return false;
            }

            // 3. Date range filter (using s.date_received or s.created_at)
            const dateStr = s.date_received || s.created_at?.split('T')[0];
            if (dateStr) {
                if (startDate && dateStr < startDate) return false;
                if (endDate && dateStr > endDate) return false;
            } else if (startDate || endDate) {
                return false;
            }

            return true;
        });
    }, [shipments, searchPO, searchStatus, startDate, endDate, showReceived]);

    const loadShipments = useCallback(async (filters: { search?: string; status?: string; startDate?: string; endDate?: string; includeReceived?: boolean } = {}) => {
        listController.current?.abort();
        const controller = new AbortController();
        listController.current = controller;
        setLoadingShipments(true);
        try {
            const data = await fetchActiveShipments(filters, controller.signal);
            setShipments(data || []);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            if (e.name !== "AbortError") {
                console.error(e);
                toast.error(e.message || "Failed to load active shipments");
            }
        } finally {
            if (!controller.signal.aborted) setLoadingShipments(false);
        }
    }, []);

    // Load base data
    useEffect(() => {
        loadBranches();
        loadStorageLots();
        return () => {
            listController.current?.abort();
            detailController.current?.abort();
            fifoController.current?.abort();
            previewController.current?.abort();
        };
    }, []);

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            void loadShipments({
                search: searchPO.trim() || undefined,
                status: searchStatus || undefined,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
                includeReceived: showReceived
            });
        }, 250);
        return () => window.clearTimeout(timeout);
    }, [searchPO, searchStatus, startDate, endDate, showReceived, loadShipments]);

    useEffect(() => {
        if (!selectedShipment || shipments.some(shipment => shipment.shipment_id === selectedShipment.shipment_id)) return;
        clearInspection();
    }, [shipments, selectedShipment, clearInspection]);

    const loadBranches = async () => {
        setLoadingBranches(true);
        try {
            const data = await fetchBranches();
            setBranches(data || []);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            console.error(e);
            toast.error(e.message || "Failed to load branch list");
        } finally {
            setLoadingBranches(false);
        }
    };

    const loadStorageLots = async () => {
        try {
            setStorageLots(await fetchStorageLots());
        } catch (e) {
            console.error(e);
            toast.error("Failed to load storage lots");
        }
    };

    const handleSelectShipment = async (shipment: Shipment) => {
        const isReceived = shipment.status === "Received" || Number(shipment.inventory_status) === INVENTORY_STATUS.RECEIVED;
        const isPartiallyReceived = shipment.status === "Partially Received";
        if (!isReceivingQueueShipmentStatus(shipment.inventory_status ?? shipment.status) && !isReceived) {
            toast.error("The purchase order must be moved to QA (Receiving) before it can be received.");
            clearInspection();
            return;
        }
        detailController.current?.abort();
        const controller = new AbortController();
        detailController.current = controller;
        setSelectedShipment(shipment);
        setReceiptNumber("");
        setReceiptMode(isPartiallyReceived ? "partial" : "full");
        setQaSpecificationStates({});
        setQaReadings({});
        setQaEvaluationResults({});
        setReceivingCommitContext(null);
        setCommittedResult(null);
        setPreviewOpen(false);
        setPreviewAcknowledged(false);
        setPreviewError(null);
        setLoadingLines(true);
        try {
            const lines = await fetchShipmentDetails(shipment.shipment_id, controller.signal);
            setLineItems(lines);

            // Prepopulate form states
            const rowsInit: Record<number, InspectionRow> = {};
            lines.forEach(l => {
                const prodName = l.product_id?.product_name?.toLowerCase() || "";
                const latestReceipt = isReceived || isPartiallyReceived ? l.latest_receipt : null;
                const latestReceivedQuantity = Number(latestReceipt?.received_quantity ?? l.quantity_received ?? 0);
                const latestAcceptedQuantity = Number(latestReceipt?.accepted_quantity ?? Math.max(0, latestReceivedQuantity - Number(l.quantity_rejected || 0)));
                const latestRejectedQuantity = Number(latestReceipt?.rejected_quantity ?? l.quantity_rejected ?? 0);
                const latestStorageLotId = latestReceipt?.storage_lot_id ?? l.lot_id ?? null;
                const latestAcceptedAllocations = latestReceipt?.accepted_lot_allocations?.length
                    ? latestReceipt.accepted_lot_allocations.map(allocation => ({
                        storageLotId: String(allocation.storage_lot_id),
                        quantity: allocation.quantity
                    }))
                    : latestStorageLotId && latestAcceptedQuantity > 0
                        ? [{ storageLotId: String(latestStorageLotId), quantity: latestAcceptedQuantity }]
                        : [];
                const latestRejectedAllocations = latestReceipt?.rejected_lot_allocations?.length
                    ? latestReceipt.rejected_lot_allocations.map(allocation => ({
                        storageLotId: String(allocation.storage_lot_id),
                        quantity: allocation.quantity
                    }))
                    : latestStorageLotId && latestRejectedQuantity > 0
                        ? [{ storageLotId: String(latestStorageLotId), quantity: latestRejectedQuantity }]
                        : [];
                // Guess if packaging based on name context
                const isPkg = prodName.includes("box") || prodName.includes("bottle") || prodName.includes("cap") || prodName.includes("sticker") || prodName.includes("packaging") || prodName.includes("plastic") || prodName.includes("wrapper");
                
                rowsInit[l.line_id] = {
                    receivedQty: isReceived
                        ? Number(l.quantity_received || 0)
                        : isPartiallyReceived
                            ? latestReceivedQuantity
                            : "",
                    acceptedQty: isReceived
                        ? Math.max(0, Number(l.quantity_received || 0) - Number(l.quantity_rejected || 0))
                        : isPartiallyReceived
                            ? latestAcceptedQuantity
                            : "",
                    rejectedQty: isReceived ? Number(l.quantity_rejected || 0) : isPartiallyReceived ? latestRejectedQuantity : 0,
                    batchNumber: isReceived || isPartiallyReceived ? (latestReceipt?.supplier_batch_number || l.batch_no || l.lot_number || "") : "",
                    lotId: (isReceived || isPartiallyReceived) && latestStorageLotId ? String(latestStorageLotId) : "",
                    acceptedLotAllocations: isReceived
                        ? l.lot_id && Number(l.quantity_received || 0) - Number(l.quantity_rejected || 0) > 0
                            ? [{ storageLotId: String(l.lot_id), quantity: Math.max(0, Number(l.quantity_received || 0) - Number(l.quantity_rejected || 0)) }]
                            : []
                        : isPartiallyReceived
                            ? latestAcceptedAllocations
                            : [],
                    rejectedLotAllocations: isReceived
                        ? l.lot_id && Number(l.quantity_rejected || 0) > 0
                            ? [{ storageLotId: String(l.lot_id), quantity: Number(l.quantity_rejected || 0) }]
                            : []
                        : isPartiallyReceived
                            ? latestRejectedAllocations
                            : [],
                    manufacturingDate: isReceived || isPartiallyReceived ? (latestReceipt?.manufacturing_date || l.manufacturing_date || "") : "",
                    expirationDate: isReceived || isPartiallyReceived ? (latestReceipt?.expiration_date || l.expiration_date || "") : "",
                    rejectionReason: latestReceipt?.rejection_reason || l.rejection_reason || "",
                    isPackaging: isPkg
                };
            });
            setInspectionRows(rowsInit);

            const storedReceiptNumber = lines
                .map(line => {
                    const receipt = line.latest_receipt?.receipt_number?.trim() || "";
                    const suffix = `-${line.line_id}`;
                    return receipt.endsWith(suffix) ? receipt.slice(0, -suffix.length) : receipt;
                })
                .find(Boolean) || "";
            setReceiptNumber(isReceived || isPartiallyReceived ? storedReceiptNumber : "");

            // Reuse the last partial receipt branch when available; otherwise use the PO branch.
            const latestReceiptBranchId = isPartiallyReceived
                ? lines.find(line => line.latest_receipt?.branch_id)?.latest_receipt?.branch_id
                : null;
            if (latestReceiptBranchId) {
                setSelectedBranchId(latestReceiptBranchId.toString());
            } else if (shipment.branch_id) {
                setSelectedBranchId(shipment.branch_id.toString());
            } else if (branches.length > 0) {
                setSelectedBranchId(branches[0].id.toString());
            } else {
                setSelectedBranchId("");
            }

            const productIds = [...new Set(lines.map(line => Number(line.product_id?.product_id)).filter(productId => Number.isSafeInteger(productId) && productId > 0))];
            setQaSpecificationStates(Object.fromEntries(productIds.map(productId => [productId, {
                status: "loading" as const,
                specifications: [],
                error: null
            }])));
            setLoadingLines(false);

            await Promise.all(productIds.map(async productId => {
                try {
                    const specifications = await fetchProductQaSpecifications(productId, controller.signal);
                    if (controller.signal.aborted) return;
                    setQaSpecificationStates(previous => ({
                        ...previous,
                        [productId]: { status: "loaded", specifications, error: null }
                    }));
                } catch (error) {
                    if (controller.signal.aborted || (error as Error).name === "AbortError") return;
                    setQaSpecificationStates(previous => ({
                        ...previous,
                        [productId]: {
                            status: "error",
                            specifications: [],
                            error: (error as Error).message || "Failed to load the product QA checklist."
                        }
                    }));
                }
            }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            if (e.name !== "AbortError") {
                console.error(e);
                toast.error(e.message || "Failed to load shipment lines");
            }
        } finally {
            if (!controller.signal.aborted) setLoadingLines(false);
        }
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleUpdateRow = (lineId: number, field: string, value: any) => {
        if (isLockedReceivingShipment(selectedShipment)) return;
        previewController.current?.abort();
        setValidatingInspection(false);
        setReceivingCommitContext(null);
        setCommittedResult(null);
        setPreviewOpen(false);
        setPreviewAcknowledged(false);
        setPreviewError(null);
        setQaEvaluationResults(previous => {
            if (!previous[lineId]) return previous;
            const next = { ...previous };
            delete next[lineId];
            return next;
        });
        setInspectionRows(prev => {
            const previousRow = prev[lineId];
            const updatedRow: InspectionRow = {
                ...previousRow,
                [field]: value
            };

            if (field === "receivedQty") {
                const previousReceived = Number(previousRow?.receivedQty || 0);
                const previousAccepted = Number(previousRow?.acceptedQty || 0);
                const previousRejected = Number(previousRow?.rejectedQty || 0);
                const nextReceived = Math.max(0, Number(value) || 0);
                if (previousReceived > 0 && Math.abs(previousReceived - previousAccepted - previousRejected) <= 1e-9) {
                    const nextAccepted = Math.min(previousAccepted, nextReceived);
                    updatedRow.acceptedQty = nextAccepted;
                    updatedRow.rejectedQty = Math.max(0, nextReceived - nextAccepted);
                }
            }

            const accepted = Number(updatedRow.acceptedQty || 0);
            const rejected = Number(updatedRow.rejectedQty || 0);
            if (field === "acceptedQty" || field === "receivedQty" || field === "lotId") {
                updatedRow.acceptedLotAllocations = resizeLotAllocations(
                    updatedRow.acceptedLotAllocations,
                    accepted,
                    updatedRow.lotId
                );
            }
            if (field === "rejectedQty" || field === "receivedQty" || field === "lotId") {
                updatedRow.rejectedLotAllocations = resizeLotAllocations(
                    updatedRow.rejectedLotAllocations,
                    rejected,
                    updatedRow.lotId
                );
            }
            return {
                ...prev,
                [lineId]: updatedRow
            };
        });
    };

    const handleUpdateAllocations = (lineId: number, allocations: ReceivingLotAllocationInput[]) => {
        if (isLockedReceivingShipment(selectedShipment)) return;
        previewController.current?.abort();
        setValidatingInspection(false);
        setReceivingCommitContext(null);
        setCommittedResult(null);
        setPreviewOpen(false);
        setPreviewAcknowledged(false);
        setPreviewError(null);
        setQaEvaluationResults(previous => {
            if (!previous[lineId]) return previous;
            const next = { ...previous };
            delete next[lineId];
            return next;
        });
        setInspectionRows(previous => ({
            ...previous,
            [lineId]: {
                ...previous[lineId],
                acceptedLotAllocations: allocations
            }
        }));
    };

    const handleUpdateRejectedAllocations = (lineId: number, allocations: ReceivingLotAllocationInput[]) => {
        if (isLockedReceivingShipment(selectedShipment)) return;
        previewController.current?.abort();
        setValidatingInspection(false);
        setReceivingCommitContext(null);
        setCommittedResult(null);
        setPreviewOpen(false);
        setPreviewAcknowledged(false);
        setPreviewError(null);
        setQaEvaluationResults(previous => {
            if (!previous[lineId]) return previous;
            const next = { ...previous };
            delete next[lineId];
            return next;
        });
        setInspectionRows(previous => ({
            ...previous,
            [lineId]: {
                ...previous[lineId],
                rejectedLotAllocations: allocations
            }
        }));
    };

    const handleUpdateQaReading = (lineId: number, specId: number, value: string) => {
        if (isLockedReceivingShipment(selectedShipment)) return;
        previewController.current?.abort();
        setValidatingInspection(false);
        setReceivingCommitContext(null);
        setCommittedResult(null);
        setPreviewOpen(false);
        setPreviewAcknowledged(false);
        setPreviewError(null);
        setQaEvaluationResults(previous => {
            if (!previous[lineId]) return previous;
            const next = { ...previous };
            delete next[lineId];
            return next;
        });
        setQaReadings(previous => ({
            ...previous,
            [lineId]: {
                ...previous[lineId],
                [specId]: value
            }
        }));
    };

    const qaSubmissionBlockReason = useMemo(() => {
        if (lineItems.length === 0) return null;
        const productIds = [...new Set(lineItems.map(line => Number(line.product_id?.product_id)))];
        for (const productId of productIds) {
            const state = qaSpecificationStates[productId];
            if (!state || state.status === "loading") return "Wait for all applicable QA checklists to finish loading.";
            if (state.status === "error") return "QA checklist configuration could not be verified. Receiving is blocked to protect inventory records.";
        }
        return null;
    }, [lineItems, qaSpecificationStates]);

    const receivingValidationIssues = useMemo<ReceivingValidationIssue[]>(() => {
        if (isLockedReceivingShipment(selectedShipment)) return [];

        const issues = validateReceivingMetadata(receiptNumber, selectedBranchId, lineItems.map(line => {
            const row = inspectionRows[line.line_id];
            return {
                lineId: line.line_id,
                productName: line.product_id?.product_name || `Item ${line.line_id}`,
                isPackaging: Boolean(row?.isPackaging),
                receivedQuantity: Number(row?.receivedQty || 0),
                batchNumber: row?.batchNumber || "",
                lotId: row?.lotId || row?.acceptedLotAllocations?.[0]?.storageLotId || row?.rejectedLotAllocations?.[0]?.storageLotId || "",
                manufacturingDate: row?.manufacturingDate || "",
                expirationDate: row?.expirationDate || ""
            };
        }));
        const addIssue = (issue: ReceivingValidationIssue) => {
            if (!issues.some(existing => existing.field === issue.field && existing.lineId === issue.lineId && existing.message === issue.message)) {
                issues.push(issue);
            }
        };
        const receivedLines = lineItems.filter(line => Number(inspectionRows[line.line_id]?.receivedQty || 0) > 0);

        if (receivedLines.length === 0) {
            addIssue({ field: "receivedQuantity", message: "Enter a positive received quantity for at least one purchase-order line." });
        }

        for (const line of lineItems) {
            const row = inspectionRows[line.line_id];
            const productName = line.product_id?.product_name || `Item ${line.line_id}`;
            const received = Number(row?.receivedQty || 0);
            const accepted = Number(row?.acceptedQty || 0);
            const rejected = Number(row?.rejectedQty || 0);
            const ordered = Number(line.quantity_ordered || 0);
            const remaining = Math.max(0, Number(line.remaining_quantity ?? (ordered - Number(line.quantity_received || 0))));

            if (receiptMode === "full" && Math.abs(received - remaining) > 1e-9) {
                addIssue({ lineId: line.line_id, productName, field: "receivedQuantity", message: "Complete the remaining quantities for Full Receipt, or select Partial Receipt." });
            }
            if (received <= 0) continue;

            if (![received, accepted, rejected].every(Number.isFinite)
                || accepted < 0
                || rejected < 0
                || accepted > received
                || rejected > received
                || Math.abs(received - accepted - rejected) > 1e-9) {
                addIssue({ lineId: line.line_id, productName, field: "quantity", message: `${productName}: Received Quantity must equal Accepted Quantity plus Rejected Quantity.` });
            }

            const acceptedAllocations = row?.acceptedLotAllocations || [];
            const acceptedAllocated = acceptedAllocations.reduce((sum, allocation) => sum + Number(allocation.quantity || 0), 0);
            if (accepted > 0 && (acceptedAllocations.length === 0 || Math.abs(acceptedAllocated - accepted) > 1e-9)) {
                addIssue({ lineId: line.line_id, productName, field: "acceptedStorageLot", message: `${productName}: allocate all accepted quantity to storage lots.` });
            }

            const rejectedAllocations = row?.rejectedLotAllocations || [];
            const rejectedAllocated = rejectedAllocations.reduce((sum, allocation) => sum + Number(allocation.quantity || 0), 0);
            if (rejected > 0 && (rejectedAllocations.length === 0 || Math.abs(rejectedAllocated - rejected) > 1e-9)) {
                addIssue({ lineId: line.line_id, productName, field: "rejectedStorageLot", message: `${productName}: allocate all rejected quantity to storage lots.` });
            }

            if ((rejected > 0 || Math.abs(received - remaining) > 1e-9) && !row?.rejectionReason?.trim()) {
                addIssue({ lineId: line.line_id, productName, field: "remarks", message: `${productName}: Remarks are required for rejected or discrepancy quantities.` });
            }

            const qaState = qaSpecificationStates[Number(line.product_id?.product_id)];
            if (qaState?.status === "loaded") {
                for (const specification of qaState.specifications) {
                    const reading = qaReadings[line.line_id]?.[specification.specId] ?? "";
                    if (evaluateQaReading(specification, reading).status === "incomplete") {
                        addIssue({ lineId: line.line_id, productName, field: "qaReading", message: `${productName}: QA reading is required for ${specification.parameter.parameterName}.` });
                    }
                }
            }
        }

        const completesPurchaseOrder = lineItems.length > 0 && lineItems.every(line => {
            const received = Number(inspectionRows[line.line_id]?.receivedQty || 0);
            const ordered = Number(line.quantity_ordered || 0);
            const remaining = Math.max(0, Number(line.remaining_quantity ?? (ordered - Number(line.quantity_received || 0))));
            return Math.abs(received - remaining) <= 1e-9;
        });
        if (receiptMode === "partial" && completesPurchaseOrder) {
            addIssue({ field: "receiptMode", message: "Partial Receipt requires at least one line to remain below its remaining quantity." });
        }

        return issues;
    }, [inspectionRows, lineItems, qaReadings, qaSpecificationStates, receiptMode, receiptNumber, selectedBranchId, selectedShipment]);

    const handleSubmitInspection = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedShipment || isLockedReceivingShipment(selectedShipment)) {
            if (selectedShipment?.status === "Partially Received") {
                toast.error("Partially received purchase orders are view-only and cannot be received again.");
            }
            return;
        }

        if (receivingValidationIssues.length > 0) {
            toast.error(receivingValidationIssues.slice(0, 3).map(issue => issue.message).join(" "));
            return;
        }
        if (qaSubmissionBlockReason) {
            toast.error(qaSubmissionBlockReason);
            return;
        }
        if (!selectedBranchId) {
            toast.error("Please select a receiving warehouse branch");
            return;
        }

        let completesPurchaseOrder = true;

        // Validation for new fields and QA constraints
        for (const line of lineItems) {
            const row = inspectionRows[line.line_id];
            if (!row) continue;

            const name = line.product_id?.product_name || `Item ${line.product_id}`;

            const received = Number(row.receivedQty);
            const accepted = Number(row.acceptedQty);
            const rejected = Number(row.rejectedQty);
            const ordered = Number(line.quantity_ordered || 0);
            const remaining = Math.max(0, Number(line.remaining_quantity ?? (ordered - Number(line.quantity_received || 0))));

            try {
                deriveReceivingDisposition({
                    receivedQuantity: received,
                    acceptedQuantity: accepted,
                    rejectedQuantity: rejected
                });
            } catch (error) {
                toast.error(`${name}: ${(error as Error).message}`);
                return;
            }

            if (receiptMode === "full" && Math.abs(received - remaining) > 1e-9) {
                toast.error("Complete the remaining quantities for Full Receipt, or select Partial Receipt.");
                return;
            }
            if (Math.abs(received - remaining) > 1e-9) completesPurchaseOrder = false;

            if (received === 0) continue;

            // Expiration rule for raw materials
            if (!row.isPackaging && !row.expirationDate && accepted > 0) {
                toast.error(`Expiration Date is mandatory for Raw Material: ${name}`);
                return;
            }

            // Reject counts above the remaining quantity before preview.
            if (received > remaining) {
                toast.error(`Received quantity for ${name} (${received.toLocaleString()}) exceeds the remaining quantity (${remaining.toLocaleString()}).`);
                return;
            }

            if (rejected > 0 && (!row.rejectionReason || !row.rejectionReason.trim())) {
                toast.error(`Remarks are mandatory for ${name} because there is a rejected quantity (${rejected} units).`);
                return;
            }

            if (received !== remaining && (!row.rejectionReason || !row.rejectionReason.trim())) {
                toast.error(`Remarks are mandatory for ${name} due to logistics discrepancy (Received: ${received}, Remaining: ${remaining}).`);
                return;
            }
        }

        if (receiptMode === "partial" && completesPurchaseOrder) {
            toast.error("Partial Receipt requires at least one line to remain below its remaining ordered quantity. Select Full Receipt to complete the PO.");
            return;
        }

        if (!lineItems.some(line => Number(inspectionRows[line.line_id]?.receivedQty || 0) > 0)) {
            toast.error("At least one line must have a positive received quantity.");
            return;
        }

        previewController.current?.abort();
        const controller = new AbortController();
        previewController.current = controller;
        setPreviewError(null);
        setValidatingInspection(true);
        try {
            const evaluationLines = lineItems.map(line => {
                const row = inspectionRows[line.line_id]!;
                return {
                    lineId: line.line_id,
                    productId: line.product_id.product_id,
                    receivedQuantity: Number(row.receivedQty || 0),
                    acceptedQuantity: Number(row.acceptedQty || 0),
                    rejectedQuantity: Number(row.rejectedQty || 0),
                    storageLotId: row.lotId ? Number(row.lotId) : null,
                    acceptedLotAllocations: row.acceptedLotAllocations
                        .filter(allocation => Number(allocation.storageLotId) > 0 && Number(allocation.quantity) > 0)
                        .map(allocation => ({ storageLotId: Number(allocation.storageLotId), quantity: Number(allocation.quantity) })),
                    rejectedLotAllocations: row.rejectedLotAllocations
                        .filter(allocation => Number(allocation.storageLotId) > 0 && Number(allocation.quantity) > 0)
                        .map(allocation => ({ storageLotId: Number(allocation.storageLotId), quantity: Number(allocation.quantity) })),
                    supplierBatchNumber: row.batchNumber.trim(),
                    manufacturingDate: row.manufacturingDate || null,
                    expiryDate: row.expirationDate || null,
                    remarks: row.rejectionReason.trim() || null,
                    isPackaging: row.isPackaging,
                    readings: Object.entries(qaReadings[line.line_id] || {}).map(([specId, actualReading]) => ({
                        specId: Number(specId),
                        actualReading
                    }))
                };
            });

            const preview = await previewReceivingQa({
                shipmentId: selectedShipment.shipment_id,
                receiptNumber: receiptNumber.trim(),
                receiptMode,
                destinationBranchId: Number(selectedBranchId),
                lines: evaluationLines
            }, controller.signal);
            if (controller.signal.aborted) return;
            const idempotencyKey = uuidv4();
            const payload: ReceivingCommitPayload = {
                contractVersion: "v1",
                workflowRevision: preview.workflowRevision,
                shipmentId: selectedShipment.shipment_id,
                receiptNumber: receiptNumber.trim(),
                receiptMode,
                destinationBranchId: Number(selectedBranchId),
                lines: evaluationLines
            };
            setReceivingCommitContext({ preview, payload, idempotencyKey });
            setQaEvaluationResults(Object.fromEntries(preview.lines.map(result => [result.lineId, result])));
            setPreviewAcknowledged(false);
            setPreviewOpen(true);
            setInspectionRows(previous => {
                const next = { ...previous };
                for (const result of preview.lines) {
                    if (!result.forceRejected || !next[result.lineId]) continue;
                    next[result.lineId] = {
                        ...next[result.lineId],
                        acceptedQty: result.acceptedQuantity,
                        rejectedQty: result.rejectedQuantity,
                        acceptedLotAllocations: result.acceptedQuantity > 0 ? next[result.lineId].acceptedLotAllocations : [],
                        rejectionReason: result.rejectionReason || next[result.lineId].rejectionReason
                    };
                }
                return next;
            });
            toast.success("QA quantities and inventory routes were previewed. No inventory records were written.");
        } catch (error) {
            if (error && typeof error === "object" && "name" in error && error.name === "AbortError") return;
            const message = error instanceof Error ? error.message : "Failed to generate receiving preview.";
            setPreviewError(message);
            toast.error(message);
        } finally {
            if (!controller.signal.aborted) setValidatingInspection(false);
        }
    };

    const handleCommitReceiving = useCallback(async () => {
        if (postingInspection) return;
        if (selectedShipment?.status === "Partially Received") {
            toast.error("Partially received purchase orders are view-only and cannot be received again.");
            return;
        }
        if (!receivingCommitContext) {
            toast.error("The receiving preview is no longer valid. Generate a new preview before posting.");
            return;
        }
        if (!receivingCommitContext.preview.postingEnabled) {
            toast.error("Receiving posting is currently unavailable.");
            return;
        }
        setPostingInspection(true);
        try {
            const result = await commitReceivingQa(receivingCommitContext.payload, receivingCommitContext.idempotencyKey);
            toast.success(`Receiving ${result.commitReference} posted as ${result.status}.`);
            setCommittedResult(result);
            setPreviewAcknowledged(true);
            setPreviewOpen(true);
            await loadShipments({
                search: searchPO.trim() || undefined,
                status: searchStatus || undefined,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
                includeReceived: showReceived
            });
        } catch (error) {
            toast.error((error as Error).message || "Failed to post receiving.");
        } finally {
            setPostingInspection(false);
        }
    }, [postingInspection, selectedShipment?.status, receivingCommitContext, loadShipments, searchPO, searchStatus, startDate, endDate, showReceived]);

    const handlePreviewOpenChange = useCallback((open: boolean) => {
        setPreviewOpen(open);
        if (!open && committedResult) clearInspection();
    }, [committedResult, clearInspection]);

    // Load FIFO inventory breakdown
    const handleLoadFifoInventory = async (branchId: string) => {
        fifoController.current?.abort();
        setFifoBranchId(branchId);
        if (!branchId) {
            setFifoInventory([]);
            return;
        }

        const controller = new AbortController();
        fifoController.current = controller;
        setLoadingFifo(true);
        try {
            const items = await fetchFifoInventory(branchId, controller.signal);

            // Group by product and create batches list
            const groupedMap: Record<number, {
                product: Product;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
                batches: any[];
                totalQty: number;
                isPackaging: boolean;
            }> = {};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
            items.forEach((item: any) => {
                const prod = item.product_id;
                if (!prod) return;

                const prodId = prod.product_id;
                const prodName = prod.product_name.toLowerCase();
                const isPkg = prodName.includes("box") || prodName.includes("bottle") || prodName.includes("cap") || prodName.includes("sticker") || prodName.includes("packaging") || prodName.includes("plastic") || prodName.includes("wrapper");

                if (!groupedMap[prodId]) {
                    groupedMap[prodId] = {
                        product: prod,
                        batches: [],
                        totalQty: 0,
                        isPackaging: isPkg
                    };
                }

                groupedMap[prodId].batches.push({
                    lot_number: item.lot_number || "BATCH-N/A",
                    expiration_date: item.expiration_date,
                    received_qty: Number(item.quantity_received || 0),
                    reception_date: item.shipment_id?.date_received || item.shipment_id?.created_at?.split('T')[0] || "N/A",
                    shipment_ref: item.shipment_id?.reference_number || "N/A",
                    qa_status: item.qa_status || "Passed"
                });

                groupedMap[prodId].totalQty += Number(item.quantity_received || 0);
            });

            // Apply sorting for FIFO:
            // - Raw materials: Closest expiration date first
            // - Packaging: Oldest reception date first (FIFO)
            const groupedList = Object.values(groupedMap).map(group => {
                if (group.isPackaging) {
                    group.batches.sort((a, b) => new Date(a.reception_date).getTime() - new Date(b.reception_date).getTime());
                } else {
                    group.batches.sort((a, b) => {
                        if (!a.expiration_date) return 1;
                        if (!b.expiration_date) return -1;
                        return new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime();
                    });
                }
                return group;
            });

            setFifoInventory(groupedList);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            if (e.name !== "AbortError") {
                console.error(e);
                toast.error(e.message || "Failed to load branch inventory ledger");
            }
        } finally {
            if (!controller.signal.aborted) setLoadingFifo(false);
        }
    };

    const toggleProductExpand = (prodId: number) => {
        setExpandedProducts(prev => ({
            ...prev,
            [prodId]: !prev[prodId]
        }));
    };

    const filteredFifoList = useMemo(() => {
        return fifoInventory.filter(item => {
            const query = fifoSearch.toLowerCase();
            return (
                item.product.product_name.toLowerCase().includes(query) ||
                item.product.product_code.toLowerCase().includes(query)
            );
        });
    }, [fifoInventory, fifoSearch]);

    return {
        activeTab,
        setActiveTab,
        shipments,
        branches,
        storageLots,
        loadingShipments,
        loadingBranches,
        selectedShipment,
        readOnly: isLockedReceivingShipment(selectedShipment),
        setSelectedShipment,
        lineItems,
        setLineItems,
        loadingLines,
        selectedBranchId,
        setSelectedBranchId: handleDestinationBranchChange,
        receiptNumber,
        setReceiptNumber: handleReceiptNumberChange,
        receiptMode,
        setReceiptMode,
        inspectionRows,
        qaSpecificationStates,
        qaReadings,
        qaEvaluationResults,
        receivingPreview,
        receivingCommitReady,
        committedResult,
        previewOpen,
        setPreviewOpen: handlePreviewOpenChange,
        handlePreviewOpenChange,
        handleFinishCommitted: clearInspection,
        previewAcknowledged,
        postingInspection,
        handleCommitReceiving,
        validatingInspection,
        previewError,
        qaSubmissionBlockReason,
        receivingValidationIssues,
        handleSelectShipment,
        handleUpdateRow,
        handleUpdateAllocations,
        handleUpdateRejectedAllocations,
        handleUpdateQaReading,
        handleSubmitInspection,
        clearInspection,
        fifoBranchId,
        fifoInventory,
        loadingFifo,
        expandedProducts,
        fifoSearch,
        setFifoSearch,
        showReceived,
        setShowReceived,
        filteredShipments,
        filteredFifoList,
        handleLoadFifoInventory,
        toggleProductExpand,

        // Expose new filter states
        searchPO,
        setSearchPO,
        searchStatus,
        setSearchStatus,
        startDate,
        setStartDate,
        endDate,
        setEndDate
    };
}
