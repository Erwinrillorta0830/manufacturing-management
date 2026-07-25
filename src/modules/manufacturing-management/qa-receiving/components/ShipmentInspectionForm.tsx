import React from "react";
import Image from "next/image";
import { ArrowLeft, MapPin, AlertTriangle, CheckCircle2, Search, ChevronDown, Plus, Minus, Loader2, ReceiptText } from "lucide-react";
import { Shipment, ShipmentLineItem, Branch, InspectionRow, StorageLot, QaSpecificationLoadState, QaSpecificationReadings, ReceivingQaEvaluation, ReceivingLotAllocationInput } from "../types";
import type { ReceivingValidationIssue } from "../receiving-metadata";
import ProductQaChecklist from "./ProductQaChecklist";

interface ShipmentInspectionFormProps {
    selectedShipment: Shipment;
    readOnly: boolean;
    lineItems: ShipmentLineItem[];
    branches: Branch[];
    storageLots: StorageLot[];
    receiptNumber: string;
    setReceiptNumber: (val: string) => void;
    receiptMode: "full" | "partial";
    setReceiptMode: (val: "full" | "partial") => void;
    selectedBranchId: string;
    setSelectedBranchId: (val: string) => void;
    inspectionRows: Record<number, InspectionRow>;
    qaSpecificationStates: Record<number, QaSpecificationLoadState>;
    qaReadings: QaSpecificationReadings;
    qaEvaluationResults: Record<number, ReceivingQaEvaluation>;
    hasPreview: boolean;
    previewAcknowledged: boolean;
    validatingInspection: boolean;
    previewError: string | null;
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
}

export default function ShipmentInspectionForm({
    selectedShipment,
    readOnly,
    lineItems,
    branches,
    storageLots,
    receiptNumber,
    setReceiptNumber,
    receiptMode,
    setReceiptMode,
    selectedBranchId,
    setSelectedBranchId,
    inspectionRows,
    qaSpecificationStates,
    qaReadings,
    qaEvaluationResults,
    hasPreview,
    previewAcknowledged,
    validatingInspection,
    previewError,
    qaSubmissionBlockReason,
    receivingValidationIssues,
    loadingLines,
    handleUpdateRow,
    handleUpdateAllocations,
    handleUpdateRejectedAllocations,
    handleUpdateQaReading,
    handleSubmitInspection,
    onReviewPreview,
    onCancel
}: ShipmentInspectionFormProps) {
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
        const rejected = Number(row?.rejectedQty || 0);
        if (![received, accepted, rejected].every(Number.isFinite)) return true;
        if (received === 0 && accepted === 0 && rejected === 0) return false;
        return received <= 0
            || accepted < 0
            || rejected < 0
            || accepted > received
            || rejected > received
            || Math.abs(received - accepted - rejected) > 1e-9;
    }), [inspectionRows, lineItems]);

    const hasAllocationMismatch = React.useMemo(() => lineItems.some(line => {
        const row = inspectionRows[line.line_id];
        const accepted = Number(row?.acceptedQty || 0);
        const allocations = row?.acceptedLotAllocations || [];
        if (accepted <= 0) return allocations.length > 0;
        const total = allocations.reduce((sum, allocation) => sum + Number(allocation.quantity || 0), 0);
        return allocations.length === 0 || Math.abs(total - accepted) > 1e-9;
    }), [inspectionRows, lineItems]);

    const hasRejectedAllocationMismatch = React.useMemo(() => lineItems.some(line => {
        const row = inspectionRows[line.line_id];
        const rejected = Number(row?.rejectedQty || 0);
        const allocations = row?.rejectedLotAllocations || [];
        if (rejected <= 0) return allocations.length > 0;
        const total = allocations.reduce((sum, allocation) => sum + Number(allocation.quantity || 0), 0);
        return allocations.length === 0 || Math.abs(total - rejected) > 1e-9;
    }), [inspectionRows, lineItems]);

    const addAcceptedLot = (lineId: number, row: InspectionRow) => {
        const accepted = Number(row.acceptedQty || 0);
        const allocated = row.acceptedLotAllocations.reduce((sum, allocation) => sum + Number(allocation.quantity || 0), 0);
        const remaining = Math.max(0, accepted - allocated);
        const selectedIds = new Set(row.acceptedLotAllocations.map(allocation => Number(allocation.storageLotId)));
        const availableLot = storageLots.find(lot => {
            const available = lot.availableQuantity;
            return !selectedIds.has(lot.lot_id) && (available === null || available === undefined || available > 0);
        });
        if (!availableLot) return;
        const initialQuantity = availableLot.availableQuantity === null || availableLot.availableQuantity === undefined
            ? remaining
            : Math.min(remaining, availableLot.availableQuantity);
        if (initialQuantity <= 0) return;
        handleUpdateAllocations(lineId, [
            ...row.acceptedLotAllocations,
            { storageLotId: String(availableLot.lot_id), quantity: initialQuantity }
        ]);
    };

    const updateAcceptedLot = (lineId: number, row: InspectionRow, index: number, field: "storageLotId" | "quantity", value: string | number) => {
        const allocations = row.acceptedLotAllocations.map((allocation, allocationIndex) =>
            allocationIndex === index ? { ...allocation, [field]: value } : allocation
        );
        handleUpdateAllocations(lineId, allocations);
    };

    const addRejectedLot = (lineId: number, row: InspectionRow) => {
        const rejected = Number(row.rejectedQty || 0);
        const allocated = row.rejectedLotAllocations.reduce((sum, allocation) => sum + Number(allocation.quantity || 0), 0);
        const remaining = Math.max(0, rejected - allocated);
        const selectedIds = new Set(row.rejectedLotAllocations.map(allocation => Number(allocation.storageLotId)));
        const availableLot = storageLots.find(lot => {
            const available = lot.availableQuantity;
            return !selectedIds.has(lot.lot_id) && (available === null || available === undefined || available > 0);
        });
        if (!availableLot) return;
        const initialQuantity = availableLot.availableQuantity === null || availableLot.availableQuantity === undefined
            ? remaining
            : Math.min(remaining, availableLot.availableQuantity);
        if (initialQuantity <= 0) return;
        handleUpdateRejectedAllocations(lineId, [
            ...row.rejectedLotAllocations,
            { storageLotId: String(availableLot.lot_id), quantity: initialQuantity }
        ]);
    };

    const updateRejectedLot = (lineId: number, row: InspectionRow, index: number, field: "storageLotId" | "quantity", value: string | number) => {
        const allocations = row.rejectedLotAllocations.map((allocation, allocationIndex) =>
            allocationIndex === index ? { ...allocation, [field]: value } : allocation
        );
        handleUpdateRejectedAllocations(lineId, allocations);
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
        return branches.filter(b => {
            if (b.isBadStock === true || Number(b.isBadStock) === 1) return false;
            const name = (b.branch_name || "").toLowerCase();
            return !name.includes("bad branch") &&
                !name.includes("quarantine") &&
                !name.includes("damaged") &&
                !name.includes("holding") &&
                !name.includes("bad order");
        });
    }, [branches]);

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
        <form onSubmit={handleSubmitInspection} className="flex flex-col h-full">
            <div className="p-4 border-b bg-muted/20 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="md:hidden p-2 hover:bg-muted rounded-xl border text-muted-foreground transition-colors shrink-0 flex items-center justify-center animate-in fade-in slide-in-from-left-2 duration-200"
                        title="Back to Queue"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div className="min-w-0">
                        <h3 className="text-xs font-bold text-foreground truncate">
                            Cargo Manifest Inspection: {selectedShipment.reference_number}
                        </h3>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                            <p className="text-[10px] text-muted-foreground">Verify physical quantities, tag batch IDs, and set Expiration limits.</p>
                            {readOnly && selectedShipment.status !== "Partially Received" && (
                                <span className="text-[9px] bg-emerald-500/10 text-emerald-700 px-1.5 py-0.5 rounded font-extrabold whitespace-nowrap">
                                    Received - View Only
                                </span>
                            )}
                            {selectedShipment.status === "Partially Received" && (
                                <span className="text-[9px] bg-slate-500/10 text-slate-700 px-1.5 py-0.5 rounded font-extrabold whitespace-nowrap">
                                    Partially Received - View Only
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 border-b bg-background shrink-0">
                <div className="space-y-1">
                    <label htmlFor="receiving-receipt-number" className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                        Receiving Ticket / DR Number {!readOnly && <span className="text-red-500">*</span>}
                    </label>
                    <div className="relative">
                        <ReceiptText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary pointer-events-none" />
                        <input
                            id="receiving-receipt-number"
                            type="text"
                            required={!readOnly}
                            maxLength={50}
                            placeholder="Enter supplier receipt or DR number"
                            value={receiptNumber}
                            onChange={(event) => setReceiptNumber(event.target.value)}
                            disabled={readOnly}
                            aria-invalid={Boolean(issueFor(undefined, "receiptNumber"))}
                            aria-describedby={issueFor(undefined, "receiptNumber") ? "receiving-receipt-number-error" : undefined}
                            className={`w-full h-10 rounded-xl border bg-background text-foreground text-xs font-semibold pl-9 pr-3 py-2 outline-none focus:ring-1 focus:ring-primary ${issueFor(undefined, "receiptNumber") ? "border-red-500" : ""}`}
                        />
                    </div>
                    {issueFor(undefined, "receiptNumber") && <p id="receiving-receipt-number-error" className="text-[9px] font-semibold text-red-600" role="alert">{issueFor(undefined, "receiptNumber")?.message}</p>}
                </div>

                <fieldset className="space-y-1">
                    <legend className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Receiving Mode</legend>
                    <div className="grid grid-cols-2 gap-1 rounded-xl border p-1 h-10">
                        <button
                            type="button"
                            disabled={readOnly}
                            onClick={() => setReceiptMode("full")}
                            aria-pressed={receiptMode === "full"}
                            className={`rounded-lg text-[10px] font-bold transition-colors ${receiptMode === "full" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                        >
                            Full Receipt
                        </button>
                        <button
                            type="button"
                            disabled={readOnly}
                            onClick={() => setReceiptMode("partial")}
                            aria-pressed={receiptMode === "partial"}
                            className={`rounded-lg text-[10px] font-bold transition-colors ${receiptMode === "partial" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                        >
                            Partial Receipt
                        </button>
                    </div>
                    <p className="text-[9px] text-muted-foreground">Choose Partial Receipt when any counted quantity is below its remaining quantity.</p>
                    {selectedShipment.status === "Partially Received" && (
                        <p className="text-[9px] text-slate-700 font-semibold">
                            This purchase order is locked after partial receipt. Previous receiving details and the remaining quantity are view-only.
                        </p>
                    )}
                </fieldset>

                <div className="space-y-1">
                    <label htmlFor="receiving-branch" className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                         Receiving Branch {!readOnly && <span className="text-red-500">*</span>}
                    </label>
                    <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary pointer-events-none" />
                        <select
                            id="receiving-branch"
                            required={!readOnly}
                            value={selectedBranchId}
                            onChange={(event) => setSelectedBranchId(event.target.value)}
                            disabled={readOnly}
                            aria-invalid={Boolean(issueFor(undefined, "branchId"))}
                            aria-describedby={issueFor(undefined, "branchId") ? "receiving-branch-error" : undefined}
                            className={`w-full h-10 rounded-xl border bg-background text-foreground text-xs font-semibold pl-9 pr-3 py-2 outline-none focus:ring-1 focus:ring-primary cursor-pointer ${issueFor(undefined, "branchId") ? "border-red-500" : ""}`}
                        >
                            <option value="">Select receiving branch...</option>
                            {filteredBranches.map(branch => (
                                <option key={branch.id} value={branch.id.toString()}>{branch.branch_name}</option>
                            ))}
                        </select>
                    </div>
                    {issueFor(undefined, "branchId") && <p id="receiving-branch-error" className="text-[9px] font-semibold text-red-600" role="alert">{issueFor(undefined, "branchId")?.message}</p>}
                </div>
            </div>

            {/* Manifest Items Table */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loadingLines ? (
                    <div className="p-8 text-center text-xs text-muted-foreground">Fetching manifest detail...</div>
                ) : (
                    lineItems.map(line => {
                        const row = inspectionRows[line.line_id] || {
                            receivedQty: "",
                            acceptedQty: "",
                            rejectedQty: "",
                            batchNumber: "",
                            lotId: "",
                            manufacturingDate: "",
                            expirationDate: "",
                            rejectionReason: "",
                            isPackaging: false
                        };

                        const prod = line.product_id;
                        const isHighlighted = highlightedLineId === line.line_id;

                        const receivedVal = row.receivedQty !== "" ? Number(row.receivedQty) : 0;
                        const orderedVal = Number(line.quantity_ordered || 0);
                        const previouslyReceivedVal = Number(line.previously_received_quantity ?? Math.max(0, orderedVal - Number(line.remaining_quantity ?? orderedVal)));
                        const remainingVal = Math.max(0, Number(line.remaining_quantity ?? (orderedVal - previouslyReceivedVal)));
                        const acceptedVal = row.acceptedQty !== "" ? Number(row.acceptedQty) : 0;
                        const rejectedVal = row.rejectedQty !== "" ? Number(row.rejectedQty) : 0;
                        const quantitiesReconcile = [receivedVal, acceptedVal, rejectedVal].every(Number.isFinite)
                            && acceptedVal >= 0
                            && rejectedVal >= 0
                            && acceptedVal <= receivedVal
                            && rejectedVal <= receivedVal
                            && Math.abs(receivedVal - acceptedVal - rejectedVal) <= 1e-9;
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
                                                src={`${process.env.NEXT_PUBLIC_DIRECTUS_URL || "http://vtc:8074"}/assets/${prod.product_image}`}
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
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => handleUpdateRow(line.line_id, "isPackaging", !row.isPackaging)}
                                            disabled={readOnly}
                                            className={`px-2.5 py-1 rounded-lg text-[8px] uppercase font-extrabold border transition-all ${row.isPackaging
                                                    ? "bg-purple-500/10 text-purple-600 border-purple-500/20"
                                                    : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                                }`}
                                        >
                                            {row.isPackaging ? "Packaging (Lot Req)" : "Raw Material (Expiry Req)"}
                                        </button>
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
                                         <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
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
                                                     This Receipt - Rejected Quantity {!readOnly && receivedVal > 0 && <span className="text-red-500">*</span>}
                                                </label>
                                                <div className="flex items-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUpdateRow(line.line_id, "rejectedQty", Math.max(0, rejectedVal - 1))}
                                                        disabled={readOnly}
                                                        className="w-10 h-10 border border-r-0 bg-background text-foreground rounded-l-lg hover:bg-muted font-extrabold flex items-center justify-center transition-colors shrink-0"
                                                    >
                                                        <Minus className="h-3.5 w-3.5" />
                                                    </button>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max={receivedVal || undefined}
                                                        step="any"
                                                        placeholder="Rejected qty"
                                                        value={row.rejectedQty}
                                                        onChange={event => handleUpdateRow(line.line_id, "rejectedQty", event.target.value === "" ? "" : Number(event.target.value))}
                                                        disabled={readOnly}
                                                         aria-invalid={!readOnly && (!quantitiesReconcile || Boolean(quantityIssue))}
                                                         className={`w-full h-10 border bg-background text-center text-xs font-semibold text-foreground outline-none focus:ring-0 ${!readOnly && !quantitiesReconcile ? "border-red-500 bg-red-500/5" : ""}`}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUpdateRow(line.line_id, "rejectedQty", Math.min(receivedVal, rejectedVal + 1))}
                                                        disabled={readOnly}
                                                        className="w-10 h-10 border border-l-0 bg-background text-foreground rounded-r-lg hover:bg-muted font-extrabold flex items-center justify-center transition-colors shrink-0"
                                                    >
                                                        <Plus className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
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

                                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 pt-1">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                                             Supplier Batch Number {!readOnly && receivedVal > 0 && <span className="text-red-500">*</span>}
                                        </label>
                                        <input
                                            type="text"
                                             required={!readOnly && receivedVal > 0}
                                            maxLength={50}
                                            placeholder="Supplier batch number"
                                            value={row.batchNumber}
                                            onChange={e => handleUpdateRow(line.line_id, "batchNumber", e.target.value)}
                                            disabled={readOnly}
                                            aria-invalid={Boolean(lineIssue("batchNumber"))}
                                            aria-describedby={lineIssue("batchNumber") ? `batch-number-error-${line.line_id}` : undefined}
                                            className={`w-full h-10 bg-background border text-foreground rounded-lg px-3 py-1.5 text-xs font-semibold focus:ring-1 focus:ring-primary ${lineIssue("batchNumber") ? "border-red-500" : ""}`}
                                        />
                                        {lineIssue("batchNumber") && <p id={`batch-number-error-${line.line_id}`} className="text-[9px] font-semibold text-red-600" role="alert">{lineIssue("batchNumber")?.message}</p>}
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                                             Manufacturing Date {!readOnly && receivedVal > 0 && !row.isPackaging && <span className="text-red-500">*</span>}
                                        </label>
                                        {readOnly ? (
                                            <div className="w-full h-10 bg-muted/40 border text-foreground rounded-lg px-3 py-1.5 text-xs font-semibold flex items-center">
                                                {row.manufacturingDate || "Not recorded"}
                                            </div>
                                        ) : (
                                            <input
                                                type="date"
                                                required={receivedVal > 0 && !row.isPackaging}
                                                max={row.expirationDate || undefined}
                                                value={row.manufacturingDate}
                                                onChange={event => handleUpdateRow(line.line_id, "manufacturingDate", event.target.value)}
                                                aria-invalid={Boolean(lineIssue("manufacturingDate"))}
                                                aria-describedby={lineIssue("manufacturingDate") ? `manufacturing-date-error-${line.line_id}` : undefined}
                                                className={`w-full h-10 bg-background border text-foreground rounded-lg px-3 py-1.5 text-xs font-semibold focus:ring-1 focus:ring-primary ${lineIssue("manufacturingDate") ? "border-red-500" : ""}`}
                                            />
                                        )}
                                        {lineIssue("manufacturingDate") && <p id={`manufacturing-date-error-${line.line_id}`} className="text-[9px] font-semibold text-red-600" role="alert">{lineIssue("manufacturingDate")?.message}</p>}
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                                             Expiry Date {!readOnly && receivedVal > 0 && !row.isPackaging && <span className="text-red-500">*</span>}
                                        </label>
                                        <input
                                            type="date"
                                             required={!readOnly && receivedVal > 0 && !row.isPackaging}
                                            min={row.manufacturingDate || undefined}
                                            value={row.expirationDate}
                                            onChange={e => handleUpdateRow(line.line_id, "expirationDate", e.target.value)}
                                            disabled={readOnly}
                                            aria-invalid={Boolean(lineIssue("expirationDate"))}
                                            aria-describedby={lineIssue("expirationDate") ? `expiration-date-error-${line.line_id}` : undefined}
                                            className={`w-full h-10 bg-background border text-foreground rounded-lg px-3 py-1.5 text-xs font-semibold focus:ring-1 focus:ring-primary ${lineIssue("expirationDate") ? "border-red-500" : ""}`}
                                        />
                                        {lineIssue("expirationDate") && <p id={`expiration-date-error-${line.line_id}`} className="text-[9px] font-semibold text-red-600" role="alert">{lineIssue("expirationDate")?.message}</p>}
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                                            Server Disposition
                                        </label>
                                        <div className={`h-10 rounded-xl border px-3 flex items-center text-[10px] font-extrabold ${
                                            readOnly
                                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700"
                                                : evaluation?.disposition === "Passed"
                                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700"
                                                : evaluation?.disposition === "Partially Accepted"
                                                    ? "bg-amber-500/10 border-amber-500/20 text-amber-700"
                                                    : evaluation?.disposition === "Rejected"
                                                        ? "bg-red-500/10 border-red-500/20 text-red-700"
                                                        : evaluation?.disposition === "Not Received"
                                                            ? "bg-muted text-muted-foreground"
                                                            : "bg-muted/40 text-muted-foreground"
                                        }`}>
                                            {readOnly
                                                ? `${line.qa_status || "Received"} - Recorded`
                                                : evaluation
                                                    ? `${evaluation.disposition} - Server verified`
                                                    : "Pending server validation"}
                                        </div>
                                    </div>
                                </div>

                                {receivedVal > 0 && (acceptedVal > 0 || rejectedVal > 0) && (
                                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-3" aria-label="Inventory storage-lot allocations">
                                        <div className="flex items-center justify-between gap-2">
                                            <div>
                                                <p className="text-[9px] font-extrabold uppercase tracking-wider text-emerald-700">Inventory allocation</p>
                                                <p className="text-[10px] text-muted-foreground">
                                                    Assign accepted and rejected quantities to their storage lots below.
                                                </p>
                                                {(lineIssue("acceptedStorageLot") || lineIssue("rejectedStorageLot")) && (
                                                    <p className="text-[9px] font-semibold text-red-600" role="alert">
                                                        {lineIssue("acceptedStorageLot")?.message || lineIssue("rejectedStorageLot")?.message}
                                                    </p>
                                                )}
                                            </div>
                                            {!readOnly && acceptedVal > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => addAcceptedLot(line.line_id, row)}
                                                    disabled={row.acceptedLotAllocations.length >= storageLots.length
                                                        || row.acceptedLotAllocations.reduce((sum, allocation) => sum + Number(allocation.quantity || 0), 0) >= acceptedVal}
                                                    className="h-8 px-2.5 rounded-lg border border-emerald-500/30 bg-background text-emerald-700 text-[10px] font-extrabold flex items-center gap-1.5 hover:bg-emerald-500/10 disabled:opacity-50"
                                                >
                                                    <Plus className="h-3.5 w-3.5" /> Add storage lot
                                                </button>
                                            )}
                                        </div>
                                        {acceptedVal > 0 && (
                                            <div className="space-y-2">
                                                <p className="text-[9px] font-extrabold uppercase tracking-wider text-emerald-700">Accepted quantity by storage lot</p>
                                        <div className="space-y-2">
                                            {row.acceptedLotAllocations.map((allocation, allocationIndex) => {
                                                const selectedLot = storageLots.find(lot => String(lot.lot_id) === String(allocation.storageLotId));
                                                const available = selectedLot?.availableQuantity;
                                                const incomingForLot = [...row.acceptedLotAllocations, ...row.rejectedLotAllocations]
                                                    .filter(current => String(current.storageLotId) === String(allocation.storageLotId))
                                                    .reduce((sum, current) => sum + Number(current.quantity || 0), 0);
                                                         const overCapacity = !readOnly && available !== null && available !== undefined && incomingForLot > available;
                                                return (
                                                    <div key={`${line.line_id}-accepted-lot-${allocationIndex}`} className="grid grid-cols-[minmax(0,1fr)_130px_auto] gap-2 items-center">
                                                        <select
                                                            value={allocation.storageLotId}
                                                            disabled={readOnly}
                                                            onChange={event => updateAcceptedLot(line.line_id, row, allocationIndex, "storageLotId", event.target.value)}
                                                            className="h-9 min-w-0 bg-background border text-foreground rounded-lg px-2.5 text-[10px] font-semibold"
                                                        >
                                                            <option value="">Select storage lot...</option>
                                                            {storageLots.map(lot => {
                                                                const alreadySelected = row.acceptedLotAllocations.some((current, index) => index !== allocationIndex && String(current.storageLotId) === String(lot.lot_id));
                                                                const full = lot.availableQuantity !== null && lot.availableQuantity !== undefined && lot.availableQuantity <= 0;
                                                                return (
                                                                    <option key={lot.lot_id} value={lot.lot_id} disabled={alreadySelected || (full && String(lot.lot_id) !== String(allocation.storageLotId))}>
                                                                        {lot.lot_name} ({lot.availableQuantity ?? lot.max_batch_capacity} available)
                                                                    </option>
                                                                );
                                                            })}
                                                        </select>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="any"
                                                            value={allocation.quantity}
                                                            disabled={readOnly}
                                                            onChange={event => updateAcceptedLot(line.line_id, row, allocationIndex, "quantity", event.target.value === "" ? "" : Number(event.target.value))}
                                                            className={`h-9 bg-background border rounded-lg px-2.5 text-[10px] font-semibold text-right ${overCapacity ? "border-red-500" : ""}`}
                                                            aria-label={`Accepted quantity for storage lot ${selectedLot?.lot_name || allocation.storageLotId}`}
                                                        />
                                                        {!readOnly && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleUpdateAllocations(line.line_id, row.acceptedLotAllocations.filter((_, index) => index !== allocationIndex))}
                                                                className="h-9 w-9 rounded-lg border text-muted-foreground hover:text-red-600 hover:border-red-300 flex items-center justify-center"
                                                                aria-label="Remove storage-lot allocation"
                                                            >
                                                                <Minus className="h-3.5 w-3.5" />
                                                            </button>
                                                        )}
                                                        {overCapacity && <span className="col-span-2 text-[9px] text-red-600">This allocation exceeds the lot&apos;s remaining capacity.</span>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className={`text-[10px] font-bold ${!readOnly && Math.abs(row.acceptedLotAllocations.reduce((sum, allocation) => sum + Number(allocation.quantity || 0), 0) - acceptedVal) > 1e-9 ? "text-red-600" : "text-emerald-700"}`}>
                                            Allocated: {row.acceptedLotAllocations.reduce((sum, allocation) => sum + Number(allocation.quantity || 0), 0).toLocaleString()} / {acceptedVal.toLocaleString()}
                                        </div>
                                            </div>
                                        )}
                                        {rejectedVal > 0 && (
                                            <div className="space-y-2 border-t border-red-500/20 pt-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div>
                                                    <p className="text-[9px] font-extrabold uppercase tracking-wider text-red-700">Rejected quantity by storage lot</p>
                                                    <p className="text-[10px] text-muted-foreground">Allocate rejected quantity across one or more storage lots.</p>
                                                    </div>
                                                    {!readOnly && (
                                                        <button
                                                            type="button"
                                                            onClick={() => addRejectedLot(line.line_id, row)}
                                                            disabled={row.rejectedLotAllocations.length >= storageLots.length
                                                                || row.rejectedLotAllocations.reduce((sum, allocation) => sum + Number(allocation.quantity || 0), 0) >= rejectedVal}
                                                            className="h-8 px-2.5 rounded-lg border border-red-500/30 bg-background text-red-700 text-[10px] font-extrabold flex items-center gap-1.5 hover:bg-red-500/10 disabled:opacity-50"
                                                        >
                                                            <Plus className="h-3.5 w-3.5" /> Add storage lot
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="space-y-2">
                                                    {row.rejectedLotAllocations.map((allocation, allocationIndex) => {
                                                        const selectedLot = storageLots.find(lot => String(lot.lot_id) === String(allocation.storageLotId));
                                                        const available = selectedLot?.availableQuantity;
                                                        const incomingForLot = [...row.acceptedLotAllocations, ...row.rejectedLotAllocations]
                                                            .filter(current => String(current.storageLotId) === String(allocation.storageLotId))
                                                            .reduce((sum, current) => sum + Number(current.quantity || 0), 0);
                                                         const overCapacity = !readOnly && available !== null && available !== undefined && incomingForLot > available;
                                                        return (
                                                            <div key={`${line.line_id}-rejected-lot-${allocationIndex}`} className="grid grid-cols-[minmax(0,1fr)_130px_auto] gap-2 items-center">
                                                                <select
                                                                    value={allocation.storageLotId}
                                                                    disabled={readOnly}
                                                                    onChange={event => updateRejectedLot(line.line_id, row, allocationIndex, "storageLotId", event.target.value)}
                                                                    className="h-9 min-w-0 bg-background border text-foreground rounded-lg px-2.5 text-[10px] font-semibold"
                                                                >
                                                                    <option value="">Select storage lot...</option>
                                                                    {storageLots.map(lot => {
                                                                        const alreadySelected = row.rejectedLotAllocations.some((current, index) => index !== allocationIndex && String(current.storageLotId) === String(lot.lot_id));
                                                                        const full = lot.availableQuantity !== null && lot.availableQuantity !== undefined && lot.availableQuantity <= 0;
                                                                        return (
                                                                            <option key={lot.lot_id} value={lot.lot_id} disabled={alreadySelected || (full && String(lot.lot_id) !== String(allocation.storageLotId))}>
                                                                                {lot.lot_name} ({lot.availableQuantity ?? lot.max_batch_capacity} available)
                                                                            </option>
                                                                        );
                                                                    })}
                                                                </select>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="any"
                                                                    value={allocation.quantity}
                                                                    disabled={readOnly}
                                                                    onChange={event => updateRejectedLot(line.line_id, row, allocationIndex, "quantity", event.target.value === "" ? "" : Number(event.target.value))}
                                                                    className={`h-9 bg-background border rounded-lg px-2.5 text-[10px] font-semibold text-right ${overCapacity ? "border-red-500" : ""}`}
                                                                    aria-label={`Rejected quantity for storage lot ${selectedLot?.lot_name || allocation.storageLotId}`}
                                                                />
                                                                {!readOnly && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleUpdateRejectedAllocations(line.line_id, row.rejectedLotAllocations.filter((_, index) => index !== allocationIndex))}
                                                                        className="h-9 w-9 rounded-lg border text-muted-foreground hover:text-red-600 hover:border-red-300 flex items-center justify-center"
                                                                        aria-label="Remove rejected storage-lot allocation"
                                                                    >
                                                                        <Minus className="h-3.5 w-3.5" />
                                                                    </button>
                                                                )}
                                                                {overCapacity && <span className="col-span-2 text-[9px] text-red-600">This allocation exceeds the lot&apos;s remaining capacity.</span>}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <div className={`text-[10px] font-bold ${!readOnly && Math.abs(row.rejectedLotAllocations.reduce((sum, allocation) => sum + Number(allocation.quantity || 0), 0) - rejectedVal) > 1e-9 ? "text-red-600" : "text-red-700"}`}>
                                                    Allocated: {row.rejectedLotAllocations.reduce((sum, allocation) => sum + Number(allocation.quantity || 0), 0).toLocaleString()} / {rejectedVal.toLocaleString()}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {evaluation && evaluation.routes.length > 0 && (
                                    <div className="border-y py-2.5 flex flex-wrap gap-x-5 gap-y-2" aria-label="Server inventory routes">
                                        {evaluation.routes.map(route => (
                                            <div key={`${route.kind}-${route.storageLotId}`} className="flex items-start gap-2 min-w-[220px]">
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
                                        ))}
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
                                 {!readOnly && receivedVal > 0 && receivedVal !== orderedVal && (
                                    <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-2.5 flex items-center gap-2 text-[10px] text-amber-600 animate-in fade-in duration-200">
                                        <AlertTriangle className="h-4 w-4 shrink-0" />
                                        <span>Logistics discrepancy detected (Counted quantity differs from original purchase order).</span>
                                    </div>
                                )}
                                 {!readOnly && !quantitiesReconcile && (receivedVal > 0 || acceptedVal > 0 || rejectedVal > 0) && (
                                    <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-2.5 flex items-center gap-2 text-[10px] text-red-600 animate-in fade-in duration-200">
                                        <AlertTriangle className="h-4 w-4 shrink-0" />
                                        <span>{acceptedVal > receivedVal || rejectedVal > receivedVal
                                            ? "Accepted and rejected quantities cannot exceed received quantity."
                                            : `Received (${receivedVal.toLocaleString()}) must equal accepted (${acceptedVal.toLocaleString()}) plus rejected (${rejectedVal.toLocaleString()}).`}</span>
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
                        </div>
                    </div>
                ) : receivingValidationIssues.length > 0 ? (
                    <div className="flex items-start gap-2 text-[10px] text-red-700 max-w-xl" role="alert" aria-live="polite">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <div>
                            <strong>Complete the required fields before previewing:</strong>
                            <ul className="mt-1 list-disc pl-4 space-y-0.5">
                                {receivingValidationIssues.slice(0, 6).map(issue => <li key={`${issue.lineId || "global"}-${issue.field}-${issue.message}`}>{issue.message}</li>)}
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
                        <span>Assign every rejected unit to a storage lot in the Inventory Allocation section before generating the movement preview.</span>
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
                    {readOnly ? "Back to Queue" : "Cancel Inspection"}
                </button>
                {!readOnly && (
                    <button
                        type={hasPreview ? "button" : "submit"}
                        onClick={hasPreview ? onReviewPreview : undefined}
                        disabled={loadingLines || validatingInspection || Boolean(qaSubmissionBlockReason) || receivingValidationIssues.length > 0 || hasQuantityMismatch || hasAllocationMismatch || hasRejectedAllocationMismatch}
                        className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-bold flex items-center gap-1.5 shadow h-11 justify-center cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                    >
                        {validatingInspection ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</> : qaSubmissionBlockReason ? <><AlertTriangle className="h-4 w-4" /> QA Configuration Required</> : receivingValidationIssues.length > 0 ? <><AlertTriangle className="h-4 w-4" /> Complete Required Fields</> : hasPreview ? <><ReceiptText className="h-4 w-4" /> Review Movement Preview</> : <><CheckCircle2 className="h-4 w-4" /> Preview QA & Routes</>}
                    </button>
                )}
                </div>
            </div>
        </form>
    );
}
