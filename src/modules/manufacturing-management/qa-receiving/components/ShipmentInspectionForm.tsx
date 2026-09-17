import React from "react";
import Image from "next/image";
import { ArrowLeft, MapPin, AlertTriangle, CheckCircle2, Search, ChevronDown, Plus, Minus, Loader2, ReceiptText, CalendarDays, Radio, RefreshCw } from "lucide-react";
import { Shipment, ShipmentLineItem, Branch, InspectionRow, StorageLot, StorageLotBatch, StorageLotLookupState, QaSpecificationLoadState, QaSpecificationReadings, ReceivingQaEvaluation, ReceivingLotAllocationInput, OverDeliveryLine, SupplierDocumentType, ReceivingQuantityStatus, QaReceiptOption } from "../types";
import { deriveRejectedQuantity } from "@/app/api/manufacturing/qa/_receiving-evaluation";
import { canForceReceivePurchaseOrder, isForceReceived } from "@/app/api/manufacturing/qa-receiving/_force-received";
import { INVENTORY_STATUS } from "@/app/api/manufacturing/procurement/_domain";
import type { ReceivingValidationIssue } from "../receiving-metadata";
import ProductQaChecklist from "./ProductQaChecklist";
import ForceReceivedDialog from "./ForceReceivedDialog";
import { CreatableSelect } from "@/modules/manufacturing-management/finished-goods/components/CreatableSelect";
import { configuredBadStockBranchId } from "../services/qa-api";
import { formatPhtTimestamp } from "../../shared/pht-date";
import { LotAllocationSection } from "./LotAllocationModal";

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

interface ShipmentInspectionFormProps {
    selectedShipment: Shipment;
    readOnly: boolean;
    isReplacement?: boolean;
    lineItems: ShipmentLineItem[];
    branches: Branch[];
    storageLotsByProductId: Record<number, StorageLot[]>;
    rejectedStorageLotsByProductId: Record<number, StorageLot[]>;
    storageLotLookupStateByProductId: Record<number, StorageLotLookupState>;
    rejectedStorageLotLookupStateByProductId: Record<number, StorageLotLookupState>;
    onRetryStorageLots: (productId: number, disposition: "accepted" | "rejected") => void;
    loadStorageLotBatches: (productId: number, lotId: number, branchId?: number, disposition?: "accepted" | "rejected") => Promise<StorageLotBatch[]>;
    receivingTicketNumber: string;
    onReceiptNumberChange: (value: string) => void;
    receiptOptions: QaReceiptOption[];
    selectedReceipt: QaReceiptOption | null;
    onReceiptSelection: (value: string) => void;
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
    onApplyBatchDates: (manufacturingDate: string, expirationDate: string) => void;
    handleUpdateQaReading: (lineId: number, specId: number, value: string) => void;
    handleSubmitInspection: (e: React.FormEvent) => void;
    onReviewPreview: () => void;
    onCancel: () => void;
    onForceReceived?: (reason: string) => Promise<void>;
    forceReceivedSubmitting?: boolean;
}

export default function ShipmentInspectionForm({
    selectedShipment,
    readOnly,
    isReplacement = false,
    lineItems,
    branches,
    storageLotsByProductId,
    rejectedStorageLotsByProductId,
    storageLotLookupStateByProductId,
    rejectedStorageLotLookupStateByProductId,
    onRetryStorageLots,
    loadStorageLotBatches,
    receivingTicketNumber,
    onReceiptNumberChange,
    receiptOptions,
    selectedReceipt,
    onReceiptSelection,
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
    forceReceivedSubmitting = false,
    onApplyBatchDates
}: ShipmentInspectionFormProps) {
    const [forceReceivedOpen, setForceReceivedOpen] = React.useState(false);
    const [batchDateDefaults, setBatchDateDefaults] = React.useState({ manufacturingDate: "", expirationDate: "" });
    const [batchDateError, setBatchDateError] = React.useState<string | null>(null);
    const forceClosed = Boolean(selectedShipment.isForceReceived || isForceReceived(selectedShipment.forceReceivedAt));
    const historicalReceiptOnly = Boolean(
        selectedReceipt?.readOnly
        && !isReplacement
        && selectedShipment.status !== "Received"
        && Number(selectedShipment.inventory_status) !== INVENTORY_STATUS.RECEIVED
    );
    const canForceReceive = Boolean(onForceReceived) && canForceReceivePurchaseOrder({
        inventoryStatus: selectedShipment.inventory_status ?? (selectedShipment.status === "Partially Received" ? INVENTORY_STATUS.PARTIALLY_RECEIVED : null),
        isForceReceived: forceClosed,
        isReplacement: Boolean(isReplacement)
    });
    const forceReceivedStamp = selectedShipment.forceReceivedAt
        ? formatPhtTimestamp(selectedShipment.forceReceivedAt)
        : null;

    React.useEffect(() => {
        setBatchDateDefaults({ manufacturingDate: "", expirationDate: "" });
        setBatchDateError(null);
    }, [isReplacement, selectedReceipt?.key, selectedShipment.shipment_id]);

    const applyBatchDates = () => {
        const { manufacturingDate, expirationDate } = batchDateDefaults;
        if (!manufacturingDate || !expirationDate) {
            setBatchDateError("Manufacturing date and expiry date are required.");
            return;
        }
        if (expirationDate < manufacturingDate) {
            setBatchDateError("Expiry date cannot be earlier than the manufacturing date.");
            return;
        }
        setBatchDateError(null);
        onApplyBatchDates(manufacturingDate, expirationDate);
    };
    const totalOrderedQty = React.useMemo(() => {
        return lineItems.reduce((sum, l) => sum + Number(l.quantity_ordered || 0), 0);
    }, [lineItems]);

    const receiptSelectOptions = React.useMemo(() => receiptOptions.map(option => ({
        value: option.key,
        label: `${option.receiptNumber} ${option.receiptDate || ""} ${option.postingStatus}`.trim(),
        labelNode: (
            <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="truncate font-semibold">{option.receiptNumber}</span>
                <span className="shrink-0 text-[9px] text-muted-foreground">
                    {option.receiptDate || "No date"} · {option.postingStatus}
                </span>
            </div>
        ),
        triggerNode: <span className="truncate">{option.receiptNumber}</span>
    })), [receiptOptions]);

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
                            Cargo Manifest Inspection: {selectedShipment.purchase_order_no || `PO #${selectedShipment.shipment_id}`}
                        </h3>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                            <p className="text-[10px] text-muted-foreground">Verify physical quantities, tag batch IDs, and set Expiration limits.</p>
                            {readOnly && (
                                <span className="text-[9px] bg-emerald-500/10 text-emerald-700 px-1.5 py-0.5 rounded font-extrabold whitespace-nowrap">
                                    {historicalReceiptOnly ? "Receipt - View Only" : "Received - View Only"}
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
                        {isReplacement ? (
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
                        ) : (
                            <CreatableSelect
                                id="receiving-receipt-number"
                                options={receiptSelectOptions}
                                value={selectedReceipt?.key || ""}
                                onValueChange={onReceiptSelection}
                                placeholder={receiptOptions.length > 0 ? "Select receipt number" : "No receipt records found"}
                                searchPlaceholder="Search receipt number..."
                                disabled={receiptOptions.length === 0}
                                aria-label="Receipt Number"
                                aria-invalid={Boolean(issueFor(undefined, "receiptNumber"))}
                                aria-describedby={issueFor(undefined, "receiptNumber") ? "receiving-receipt-number-error" : undefined}
                                className={`h-10 rounded-xl bg-background !pl-10 pr-3 text-xs font-semibold ${issueFor(undefined, "receiptNumber") ? "border-red-500" : ""}`}
                                popoverClassName="z-[100] min-w-[320px] max-w-[calc(100vw-2rem)] p-0"
                            />
                        )}
                    </div>
                    {issueFor(undefined, "receiptNumber") && <p id="receiving-receipt-number-error" className="text-[9px] font-semibold text-red-600" role="alert">{issueFor(undefined, "receiptNumber")?.message}</p>}
                    <p className="text-[9px] text-muted-foreground">
                        {isReplacement
                            ? "Enter the new replacement delivery receipt number."
                            : selectedReceipt?.readOnly
                                ? "Historical receipt is view-only. Select another receipt to inspect."
                                : "Select the physical receiving ticket or delivery receipt to inspect."}
                    </p>
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

            {!readOnly && (
                <div
                    data-testid="universal-batch-dates"
                    className="mx-4 mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3"
                >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div className="min-w-0">
                            <p className="text-[10px] font-extrabold uppercase tracking-wider text-primary">Batch date defaults</p>
                            <p className="mt-1 text-[10px] text-muted-foreground">
                                Apply the same manufacturing and expiry dates to every accepted and rejected batch in this receipt. You can still override dates per batch.
                            </p>
                        </div>
                        <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto lg:min-w-[440px]">
                            <label className="min-w-0 space-y-1">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Manufacturing date *</span>
                                <input
                                    type="date"
                                    value={batchDateDefaults.manufacturingDate}
                                    max={batchDateDefaults.expirationDate || undefined}
                                    onChange={event => {
                                        setBatchDateDefaults(previous => ({ ...previous, manufacturingDate: event.target.value }));
                                        setBatchDateError(null);
                                    }}
                                    className="h-10 w-full rounded-lg border bg-background px-2.5 text-xs font-semibold text-foreground outline-none focus:ring-1 focus:ring-primary"
                                />
                            </label>
                            <label className="min-w-0 space-y-1">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Expiry date *</span>
                                <input
                                    type="date"
                                    value={batchDateDefaults.expirationDate}
                                    min={batchDateDefaults.manufacturingDate || undefined}
                                    onChange={event => {
                                        setBatchDateDefaults(previous => ({ ...previous, expirationDate: event.target.value }));
                                        setBatchDateError(null);
                                    }}
                                    className="h-10 w-full rounded-lg border bg-background px-2.5 text-xs font-semibold text-foreground outline-none focus:ring-1 focus:ring-primary"
                                />
                            </label>
                        </div>
                        <button
                            type="button"
                            onClick={applyBatchDates}
                            className="h-10 shrink-0 rounded-lg border border-primary bg-primary px-3 text-[10px] font-extrabold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!batchDateDefaults.manufacturingDate || !batchDateDefaults.expirationDate}
                        >
                            Apply to All Batches
                        </button>
                    </div>
                    {batchDateError && (
                        <p className="mt-2 text-[9px] font-semibold text-red-600" role="alert">{batchDateError}</p>
                    )}
                </div>
            )}

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
                        const productId = Number(prod.product_id);
                        const productUnitId = relationNumber(prod.unit_of_measurement, ["unit_id", "uom_id", "id"]);
                        const lineStorageLots = storageLotsByProductId[productId] || [];
                        const lineRejectedStorageLots = rejectedStorageLotsByProductId[productId] || [];
                        const lineStorageLotLookup = storageLotLookupStateByProductId[productId] || { status: "loading" as const, error: null };
                        const lineRejectedStorageLotLookup = rejectedStorageLotLookupStateByProductId[productId] || { status: "loading" as const, error: null };
                        const lotBranchLabel = branches.find(branch => Number(branch.id) === Number(selectedBranchId || selectedShipment.branch_id))?.branch_name
                            || originalBranchName;
                        const lotUomLabel = prod.unit_of_measurement?.unit_shortcut || prod.unit_of_measurement?.unit_name || "selected UOM";
                        const isHighlighted = highlightedLineId === line.line_id;

                        const receivedVal = row.receivedQty !== "" ? Number(row.receivedQty) : 0;
                        const orderedVal = Number(line.quantity_ordered || 0);
                        const previouslyReceivedVal = Number(line.previously_received_quantity ?? Math.max(0, orderedVal - Number(line.remaining_quantity ?? orderedVal)));
                        const remainingVal = Math.max(0, Number(line.remaining_quantity ?? (orderedVal - previouslyReceivedVal)));
                        const previouslyAcceptedVal = Number(line.previously_accepted_quantity ?? Math.max(0, Number(line.quantity_received || 0) - Number(line.quantity_rejected || 0)));
                        const remainingAcceptedVal = Math.max(0, Number(line.remaining_accepted_quantity ?? (orderedVal - previouslyAcceptedVal)));
                        const acceptedVal = row.acceptedQty !== "" ? Number(row.acceptedQty) : 0;
                        const rejectedVal = Math.max(0, deriveRejectedQuantity(receivedVal, acceptedVal));
                        const currentReceiptQuantity = line.current_receipt_quantity === null || line.current_receipt_quantity === undefined
                            ? null
                            : Number(line.current_receipt_quantity);
                        const hasCurrentReceipt = isReplacement || readOnly || (
                            !line.current_receipt_error
                            && currentReceiptQuantity !== null
                            && Number.isFinite(currentReceiptQuantity)
                            && currentReceiptQuantity > 0
                        );
                        const currentReceiptPhysicalVal = hasCurrentReceipt ? receivedVal : null;
                        const currentReceiptAcceptedVal = hasCurrentReceipt ? acceptedVal : null;
                        const lineInputDisabled = readOnly || (!isReplacement && !hasCurrentReceipt);
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
                                        readOnly={readOnly || !hasCurrentReceipt}
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

                                {!readOnly && !isReplacement && !hasCurrentReceipt && (
                                    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-700" role="alert">
                                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                        <span>{line.current_receipt_error || "No positive Warehouse Receiving handoff is available for this line. Complete Warehouse Receiving before entering QA quantities."}</span>
                                    </div>
                                )}

                                <div className="flex flex-wrap gap-x-5 gap-y-1 border-y py-2 text-[9px] font-semibold text-muted-foreground">
                                    <span>Previously received: <strong className="text-foreground">{previouslyReceivedVal.toLocaleString()}</strong></span>
                                    <span>Previously accepted: <strong className="text-emerald-700">{previouslyAcceptedVal.toLocaleString()}</strong></span>
                                    <span>This receipt accepted: <strong className="text-primary">{currentReceiptAcceptedVal === null ? "—" : currentReceiptAcceptedVal.toLocaleString()}</strong></span>
                                    <span>This receipt physical: <strong className="text-foreground">{currentReceiptPhysicalVal === null ? "—" : currentReceiptPhysicalVal.toLocaleString()}</strong></span>
                                    <span>PO accepted balance: <strong className="text-primary">{remainingAcceptedVal.toLocaleString()}</strong></span>
                                    <span>PO physical balance: <strong className="text-foreground">{remainingVal.toLocaleString()}</strong></span>
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
                                                         disabled={lineInputDisabled}
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
                                                        disabled={lineInputDisabled}
                                                         aria-invalid={!readOnly && Boolean(quantityIssue)}
                                                        className="w-full h-10 border border-border bg-background text-center text-xs font-semibold text-foreground outline-none focus:ring-0 transition-all"
                                                     />
                                                     <button
                                                         type="button"
                                                         onClick={() => handleUpdateRow(line.line_id, "receivedQty", receivedVal + 1)}
                                                         disabled={lineInputDisabled}
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
                                                        disabled={lineInputDisabled}
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
                                                        disabled={lineInputDisabled}
                                                         aria-invalid={!readOnly && (!quantitiesReconcile || Boolean(quantityIssue))}
                                                         className={`w-full h-10 border bg-background text-center text-xs font-semibold text-foreground outline-none focus:ring-0 ${!readOnly && !quantitiesReconcile ? "border-red-500 bg-red-500/5" : ""}`}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUpdateRow(line.line_id, "acceptedQty", Math.min(receivedVal, acceptedVal + 1))}
                                                        disabled={lineInputDisabled}
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
                                                <p className="text-[10px] text-muted-foreground">Select Lot → Batch Number → Manufacturing/Expiry Dates → Quantity. Lots are filtered by Product Type, UOM, and remaining capacity; allocations that would exceed a lot&apos;s maximum occupancy are blocked.</p>
                                                {(lineIssue("acceptedStorageLot") || lineIssue("rejectedStorageLot")) && (
                                                    <p className="text-[9px] font-semibold text-red-600" role="alert">
                                                        {lineIssue("acceptedStorageLot")?.message || lineIssue("rejectedStorageLot")?.message}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        {acceptedVal > 0 && lineStorageLotLookup.status === "loading" && (
                                            <p className="flex items-center gap-1.5 text-[9px] font-semibold text-muted-foreground" role="status">
                                                <Loader2 className="h-3 w-3 animate-spin" /> Loading active storage lots for {lotBranchLabel}...
                                            </p>
                                        )}
                                        {acceptedVal > 0 && lineStorageLotLookup.status === "error" && (
                                            <div className="flex flex-wrap items-center gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-2 py-2 text-[9px] text-red-700" role="alert">
                                                <span>Unable to load active storage lots for {lotBranchLabel} ({lotUomLabel}). This is a lookup failure, not an empty lot list.</span>
                                                <button
                                                    type="button"
                                                    onClick={() => onRetryStorageLots(productId, "accepted")}
                                                    className="inline-flex h-7 items-center gap-1 rounded-md border border-red-500/40 bg-background px-2 font-extrabold hover:bg-red-500/10"
                                                >
                                                    <RefreshCw className="h-3 w-3" /> Retry
                                                </button>
                                            </div>
                                        )}
                                        {acceptedVal > 0 && lineStorageLotLookup.status === "loaded" && lineStorageLots.length === 0 && (
                                            <p className="text-[9px] font-semibold text-amber-700" role="alert">
                                                No active storage lots match {lotBranchLabel} / {lotUomLabel}. Empty or vacant locations remain valid targets; shelf/bay and FEFO shelf assignments are not required by the receiving lookup.
                                            </p>
                                        )}
                                        {acceptedVal > 0 && (
                                            <LotAllocationSection
                                                productId={Number(prod.product_id)}
                                                productName={String(prod.product_name || "")}
                                                productUnitId={productUnitId}
                                                isPackaging={row.isPackaging}
                                                disposition="accepted"
                                                allocations={row.acceptedLotAllocations}
                                                otherAllocations={row.rejectedLotAllocations}
                                                expectedQuantity={acceptedVal}
                                                storageLots={lineStorageLots}
                                                readOnly={readOnly || !hasCurrentReceipt || lineStorageLotLookup.status !== "loaded"}
                                                batchDateDefaults={batchDateDefaults}
                                                loadStorageLotBatches={loadStorageLotBatches}
                                                onChange={allocations => handleUpdateAllocations(line.line_id, allocations)}
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
                                        {lineRejectedStorageLotLookup.status === "loading" && (
                                            <p className="flex items-center gap-1.5 text-[9px] font-semibold text-muted-foreground" role="status">
                                                <Loader2 className="h-3 w-3 animate-spin" /> Loading active Bad Order storage lots...
                                            </p>
                                        )}
                                        {lineRejectedStorageLotLookup.status === "error" && (
                                            <div className="flex flex-wrap items-center gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-2 py-2 text-[9px] text-red-700" role="alert">
                                                <span>{lineRejectedStorageLotLookup.error || "Unable to load Bad Order storage lots. This is a lookup failure, not an empty lot list."}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => onRetryStorageLots(productId, "rejected")}
                                                    className="inline-flex h-7 items-center gap-1 rounded-md border border-red-500/40 bg-background px-2 font-extrabold hover:bg-red-500/10"
                                                >
                                                    <RefreshCw className="h-3 w-3" /> Retry
                                                </button>
                                            </div>
                                        )}
                                        {lineRejectedStorageLotLookup.status === "loaded" && lineRejectedStorageLots.length === 0 && (
                                            <p className="text-[9px] font-semibold text-amber-700" role="alert">
                                                {hasConfiguredBadOrderBranch
                                                    ? "No compatible storage lots are available on the configured Bad Order branch. Standard Empty / Vacant lots are valid targets; the lot category flag is not required. Lots must match this product's UOM and product scope and have available capacity."
                                                    : "The receiving branch has no active Bad Order / quarantine branch configured, so rejected quantity cannot be mapped to storage lots."}
                                            </p>
                                        )}
                                                <LotAllocationSection
                                                    productId={productId}
                                                    productName={String(prod.product_name || "")}
                                                    productUnitId={productUnitId}
                                                    isPackaging={row.isPackaging}
                                                    disposition="rejected"
                                                    allocations={row.rejectedLotAllocations}
                                                    otherAllocations={row.acceptedLotAllocations}
                                                    expectedQuantity={rejectedVal}
                                                    storageLots={lineRejectedStorageLots}
                                                    readOnly={readOnly || !hasCurrentReceipt || lineRejectedStorageLotLookup.status !== "loaded"}
                                                    batchDateDefaults={batchDateDefaults}
                                                    loadStorageLotBatches={loadStorageLotBatches}
                                                    onChange={allocations => handleUpdateRejectedAllocations(line.line_id, allocations)}
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
                                        disabled={lineInputDisabled}
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
                        <span>
                            {historicalReceiptOnly
                                ? "This receipt has already been posted. The details are available for viewing only."
                                : "This purchase order has already been received. The details are available for viewing only."}
                        </span>
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
