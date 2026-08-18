import React from "react";
import { Anchor, X, AlertCircle, Plus, Trash2, Loader2, Table, Sparkles, Pencil, Check } from "lucide-react";
import {
    ManifestLineFormItem,
    ShipmentFormState,
    PURCHASE_ORDER_MATERIAL_TYPE_OPTIONS,
    purchaseOrderMaterialTypeFromProductType,
    FxRateStatus
} from "./types";
import { IncomingShipment, RawMaterial, PurchaseOrderPaymentMode, PurchaseOrderPriceTypeRule } from "../../types";
import { RawProductSelector } from "./RawProductSelector";
import { formatMoney } from "./ShipmentBadges";
import { CreatableSelect } from "@/modules/manufacturing-management/finished-goods/components/CreatableSelect";
import { normalizeProductRelationId } from "../../product-relation";

export interface UOMOption {
    product_id: number;
    parent_product_id?: number;
    unit_shortcut: string;
    cost_per_unit: number;
    unit_of_measurement_count?: number;
}

export interface ShipmentFormModalProps {
    isModalOpen: boolean;
    modalRef: React.RefObject<HTMLDivElement | null>;
    canonicalDrafting: boolean;
    editingShipmentId: number | null;
    activeShipment: IncomingShipment | null;
    handleCloseModal: () => void;
    handleSubmit: (e: React.FormEvent) => void;
    shipmentForm: ShipmentFormState;
    setShipmentForm: React.Dispatch<React.SetStateAction<ShipmentFormState>>;
    supplierSelectOptions: Array<{ value: string; label: string; labelNode?: React.ReactNode }>;
    handleSupplierSelect: (val: string) => void;
    handleCurrencyChange: (currencyCode: "PHP" | "USD") => void;
    isFinanceManager: boolean;
    isOverridden: boolean;
    setIsOverridden: (val: boolean) => void;
    dynamicBranches: Array<{ id: number; branchName: string; branchCode: string }>;
    linesForm: ManifestLineFormItem[];
    setLinesForm: React.Dispatch<React.SetStateAction<ManifestLineFormItem[]>>;
    handleAddLineForm: () => void;
    handleRemoveLineForm: (idx: number) => void;
    handleLineFormChange: (idx: number, fieldOrObject: string | Record<string, unknown>, value?: unknown) => void;
    getLineErrors: (line: ManifestLineFormItem) => string[];
    rawMaterials: RawMaterial[];
    supplierRawMaterials: RawMaterial[];
    priceTypes?: Array<{ price_type_id: number; price_type_name?: string; name?: string }>;
    priceTypeRatesMap: Record<number, number>;
    discountTypes?: Array<{ id: number; discount_type: string; total_percent: number | string }>;
    productPerSupplierMap?: Record<number, { discount_type_id?: number; total_percent?: number }>;
    jobOrders: Array<{ job_order_id: number; job_order_no?: string }>;
    paymentTerms?: Array<{
        id: number;
        payment_name: string;
        payment_days?: number | null;
        payment_description?: string | null;
    }>;
    paymentModes?: PurchaseOrderPaymentMode[];
    priceTypeRules?: PurchaseOrderPriceTypeRule[];
    priceTypeResolution?: {
        status: "idle" | "pending" | "resolved" | "error";
        priceTypeName: string | null;
        message: string | null;
    };
    priceMatrixStatus?: "idle" | "loading" | "ready" | "warning" | "error";
    priceMatrixError?: string | null;
    priceMatrixMissingProductIds?: number[];
    hasSubmitted: boolean;
    draftSummary: {
        grossForeign: string;
        discountForeign: string;
        grossPhp: string;
        discountPhp: string;
        vatPhp: string;
        withholdingPhp: string;
        netPhp: string;
        netForeign: string;
    };
    totalUsdValue: string;
    fxRateStatus: FxRateStatus;
    fxRateError: string | null;
    loading: boolean;
    listLoading: boolean;
}

type ActiveRowEdit = {
    index: number;
    original: ManifestLineFormItem | null;
};

function cloneLine(line: ManifestLineFormItem): ManifestLineFormItem {
    return {
        ...line,
        uom_options: line.uom_options ? [...line.uom_options] : line.uom_options
    };
}

export function ShipmentFormModal({
    isModalOpen,
    modalRef,
    canonicalDrafting,
    editingShipmentId,
    activeShipment,
    handleCloseModal,
    handleSubmit,
    shipmentForm,
    setShipmentForm,
    supplierSelectOptions,
    handleSupplierSelect,
    handleCurrencyChange,
    isFinanceManager,
    isOverridden,
    setIsOverridden,
    dynamicBranches,
    linesForm,
    setLinesForm,
    handleAddLineForm,
    handleRemoveLineForm,
    handleLineFormChange,
    getLineErrors,
    rawMaterials,
    supplierRawMaterials,
    priceTypes,
    priceTypeRatesMap,
    discountTypes,
    productPerSupplierMap,
    paymentTerms = [],
    paymentModes = [],
    priceTypeResolution = { status: "idle", priceTypeName: null, message: null },
    priceMatrixStatus = "idle",
    priceMatrixError = null,
    priceMatrixMissingProductIds = [],
    hasSubmitted,
    draftSummary,
    fxRateStatus,
    fxRateError,
    loading,
    listLoading
}: ShipmentFormModalProps) {
    const [activeRowEdit, setActiveRowEdit] = React.useState<ActiveRowEdit | null>(null);
    const [rowEditError, setRowEditError] = React.useState<string | null>(null);

    const missingPriceControlProducts = priceMatrixMissingProductIds.map(productId => {
        const line = linesForm.find(item => Number(item.product_id) === productId);
        const material = rawMaterials.find(item => Number(item.product_id) === productId);
        return line?.product_name || material?.product_name || `Product #${productId}`;
    });

    const handleAddRow = React.useCallback(() => {
        if (!shipmentForm.supplier_id || (!canonicalDrafting && activeRowEdit !== null)) return;

        const nextIndex = linesForm.length;
        handleAddLineForm();
        if (!canonicalDrafting) {
            setActiveRowEdit({ index: nextIndex, original: null });
        }
        setRowEditError(null);

        window.setTimeout(() => {
            const nextInput = document.getElementById(`search-input-${nextIndex}`);
            if (nextInput) nextInput.focus();
        }, 50);
    }, [activeRowEdit, canonicalDrafting, handleAddLineForm, linesForm.length, shipmentForm.supplier_id]);

    const handleStartRowEdit = React.useCallback((index: number) => {
        if (activeRowEdit !== null || !linesForm[index]) return;

        setActiveRowEdit({ index, original: cloneLine(linesForm[index]) });
        setRowEditError(null);
    }, [activeRowEdit, linesForm]);

    const handleSaveRow = React.useCallback((index: number) => {
        if (activeRowEdit?.index !== index || !linesForm[index]) return;

        const errors = getLineErrors(linesForm[index]);
        if (errors.length > 0) {
            setRowEditError(errors[0]);
            return;
        }

        setActiveRowEdit(null);
        setRowEditError(null);
    }, [activeRowEdit, getLineErrors, linesForm]);

    const handleCancelRowEdit = React.useCallback((index: number) => {
        if (activeRowEdit?.index !== index) return;

        if (activeRowEdit.original === null) {
            if (linesForm.length > 1) {
                handleRemoveLineForm(index);
            } else {
                setLinesForm(currentLines => currentLines.map((line, lineIndex) => (
                    lineIndex === index
                        ? {
                            ...line,
                            parent_product_id: "",
                            product_id: "",
                            material_type: "",
                            product_name: "",
                            product_code: "",
                            selected_uom: "",
                            uom_options: [],
                            quantity_ordered: "",
                            base_unit_cost_php: "",
                            purchase_intent: "Buffer_Stock",
                            job_order_id: "",
                            discount_type_id: "",
                            discount_mode: "Percentage",
                            discount_amount: "0",
                            discount_percent: "0"
                        }
                        : line
                )));
            }
        } else {
            const original = cloneLine(activeRowEdit.original);
            setLinesForm(currentLines => currentLines.map((line, lineIndex) => (
                lineIndex === index ? original : line
            )));
        }

        setActiveRowEdit(null);
        setRowEditError(null);
    }, [activeRowEdit, handleRemoveLineForm, linesForm.length, setLinesForm]);

    React.useEffect(() => {
        if (!isModalOpen || (activeRowEdit && activeRowEdit.index >= linesForm.length)) {
            setActiveRowEdit(null);
            setRowEditError(null);
        }
    }, [activeRowEdit, isModalOpen, linesForm.length]);

    React.useEffect(() => {
        if (!isModalOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            const isAddShortcut = (e.altKey && key === "a") || (e.altKey && key === "insert") || (e.ctrlKey && e.shiftKey && key === "a");
            if (isAddShortcut && (canonicalDrafting || activeRowEdit === null)) {
                e.preventDefault();
                handleAddRow();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [activeRowEdit, canonicalDrafting, handleAddRow, isModalOpen]);

    const handleFormSubmit = (event: React.FormEvent) => {
        if (!canonicalDrafting && activeRowEdit !== null) {
            event.preventDefault();
            setRowEditError("Save or cancel this row before submitting the purchase order.");
            return;
        }

        handleSubmit(event);
    };

    if (!isModalOpen) return null;

    const currencyCode = shipmentForm.currency_code || "PHP";
    const exchangeRate = Number(shipmentForm.exchange_rate || 1);
    const exchangeRateLabel = shipmentForm.exchange_rate === "" ? "Pending" : `₱${exchangeRate}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-2 sm:p-4 overflow-y-auto">
            <div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="purchase-order-dialog-title"
                tabIndex={-1}
                className="bg-card text-foreground w-full max-w-[98vw] xl:max-w-[1550px] border rounded-2xl shadow-2xl p-5 space-y-4 max-h-[94vh] flex flex-col transition-all duration-200"
            >
                {/* Dialog Header */}
                <div className="flex items-center justify-between border-b pb-3 shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-xl bg-primary/10 text-primary">
                            <Anchor className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 id="purchase-order-dialog-title" className="font-extrabold text-base flex items-center gap-2">
                                {editingShipmentId
                                    ? activeShipment?.status === "Rejected"
                                        ? "Revise Rejected Purchase Order"
                                        : canonicalDrafting ? "Edit For Approval Purchase Order" : "Edit Requested Purchase Order"
                                    : canonicalDrafting ? "Create Purchase Order" : "Log Incoming Cargo & PO Line Items"}
                                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 uppercase tracking-wider">
                                    Excel Grid Mode
                                </span>
                            </h3>
                            <p className="text-[11px] text-muted-foreground">
                                High-density spreadsheet entry. Use <kbd className="px-1 py-0.5 text-[9px] font-mono bg-muted rounded border">Tab</kbd> / <kbd className="px-1 py-0.5 text-[9px] font-mono bg-muted rounded border">Enter</kbd> to move between cells.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleCloseModal}
                        type="button"
                        aria-label="Close dialog"
                        title="Close dialog"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <form onSubmit={handleFormSubmit} className="flex flex-col flex-1 min-h-0">
                    <div className="space-y-4 overflow-y-auto pr-1 flex-1 pb-4">
                        {/* Header Ribbon / PO Metadata */}
                        <div className="p-4 bg-muted/20 border rounded-xl space-y-3">
                            <div className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                                <span>Purchase Order Metadata</span>
                                <span className="text-[9px] text-muted-foreground font-mono">Currency: {currencyCode} @ FX {exchangeRateLabel}</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase">{canonicalDrafting ? "PO Number" : "PO / BL Number *"}</label>
                                    <input
                                        type="text"
                                        required={!canonicalDrafting}
                                        readOnly={canonicalDrafting}
                                        placeholder={canonicalDrafting ? "Assigned on submit" : "e.g. BL-2026-004"}
                                        value={canonicalDrafting ? (editingShipmentId ? activeShipment?.purchase_order_no || "" : "") : shipmentForm.reference_number}
                                        onChange={e => setShipmentForm({...shipmentForm, reference_number: e.target.value})}
                                        className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-medium outline-none focus:ring-1 focus:ring-primary ${canonicalDrafting ? "bg-muted text-muted-foreground" : "bg-background"}`}
                                    />
                                </div>

                                {canonicalDrafting && (
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase">External Ref</label>
                                        <input
                                            type="text"
                                            maxLength={255}
                                            placeholder="Quote/Logistics Ref"
                                            value={shipmentForm.reference_number}
                                            onChange={e => setShipmentForm({...shipmentForm, reference_number: e.target.value})}
                                            className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
                                        />
                                    </div>
                                )}

                                <div className="space-y-1 sm:col-span-2">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Supplier Vendor *</label>
                                    <CreatableSelect
                                        options={supplierSelectOptions}
                                        value={String(shipmentForm.supplier_id)}
                                        onValueChange={handleSupplierSelect}
                                        placeholder="Select Supplier Vendor..."
                                        className="h-8 text-xs w-full bg-background font-semibold"
                                    />
                                </div>

                                {canonicalDrafting && (
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Currency *</label>
                                        <select
                                            value={shipmentForm.currency_code || "PHP"}
                                            disabled={Boolean(editingShipmentId)}
                                            onChange={event => {
                                                const currency = event.target.value as "PHP" | "USD";
                                                handleCurrencyChange(currency);
                                            }}
                                            className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs font-semibold h-8 disabled:bg-muted"
                                        >
                                            <option value="PHP">PHP - Peso</option>
                                            <option value="USD">USD - Dollar</option>
                                        </select>
                                    </div>
                                )}

                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase">FX Rate to PHP</label>
                                        {canonicalDrafting && shipmentForm.currency_code === "USD" && (
                                            <span className="text-[9px] font-semibold text-muted-foreground">
                                                {fxRateStatus === "loading" ? "Loading current rate..." : fxRateStatus === "error" ? "Unavailable" : "Locked at creation"}
                                            </span>
                                        )}
                                        {isFinanceManager && !canonicalDrafting && (
                                            <label className="flex items-center gap-1 text-[9px] text-primary cursor-pointer select-none">
                                                <input 
                                                    type="checkbox" 
                                                    checked={isOverridden}
                                                    onChange={e => setIsOverridden(e.target.checked)}
                                                    className="rounded border"
                                                />
                                                Override
                                            </label>
                                        )}
                                    </div>
                                    <input
                                        type="number"
                                        step="0.0001"
                                        readOnly={canonicalDrafting ? shipmentForm.currency_code === "PHP" || shipmentForm.currency_code === "USD" || Boolean(editingShipmentId) : !isOverridden || !isFinanceManager}
                                        aria-readonly={canonicalDrafting && shipmentForm.currency_code === "USD" ? true : undefined}
                                        value={String(shipmentForm.exchange_rate)}
                                        onChange={e => setShipmentForm({...shipmentForm, exchange_rate: e.target.value})}
                                        className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-mono font-bold ${
                                            (canonicalDrafting
                                                ? shipmentForm.currency_code === "PHP" || shipmentForm.currency_code === "USD" || Boolean(editingShipmentId)
                                                : !isOverridden || !isFinanceManager)
                                                ? "bg-muted text-muted-foreground cursor-not-allowed"
                                                : "bg-background text-foreground"
                                        }`}
                                    />
                                    {canonicalDrafting && shipmentForm.currency_code === "USD" && fxRateStatus === "error" && (
                                        <p className="text-[10px] font-medium text-destructive" role="alert">{fxRateError}</p>
                                    )}
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Branch *</label>
                                    <select
                                        value={shipmentForm.branch_id ? String(shipmentForm.branch_id) : ""}
                                        onChange={e => setShipmentForm({...shipmentForm, branch_id: e.target.value ? parseInt(e.target.value) : null})}
                                        className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs font-semibold h-8"
                                    >
                                        <option value="" disabled hidden>Select Branch...</option>
                                        {dynamicBranches.length > 0 ? (
                                            dynamicBranches.map(b => (
                                                <option key={b.id} value={b.id}>{b.branchName}</option>
                                            ))
                                        ) : (
                                            <>
                                                <option value={183}>Main Branch</option>
                                                <option value={163}>Urdaneta Branch</option>
                                                <option value={181}>Bihon Branch</option>
                                                <option value={182}>Bihon Bad Branch</option>
                                            </>
                                        )}
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Payment Type *</label>
                                    <select
                                        value={shipmentForm.payment_mode !== null ? String(shipmentForm.payment_mode) : ""}
                                        onChange={e => setShipmentForm({...shipmentForm, payment_mode: e.target.value ? parseInt(e.target.value) : null})}
                                        className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs font-semibold h-8"
                                    >
                                        <option value="" disabled hidden>Select Payment...</option>
                                        {paymentModes.map(mode => (
                                            <option key={mode.id} value={mode.id}>{mode.mode_name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Payment Arrangement *</label>
                                    <select
                                        value={shipmentForm.payment_type !== null ? String(shipmentForm.payment_type) : ""}
                                        onChange={e => setShipmentForm({...shipmentForm, payment_type: e.target.value ? parseInt(e.target.value) : null})}
                                        className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs font-semibold h-8"
                                    >
                                        <option value="" disabled hidden>Select Arrangement...</option>
                                        <option value={3}>Full Payment</option>
                                        <option value={1}>Advance Payment</option>
                                        <option value={2}>Partial Payment</option>
                                        <option value={4}>Refund</option>
                                        <option value={5}>Installment</option>
                                    </select>
                                </div>

                                {canonicalDrafting && (
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Payment Terms *</label>
                                        <select
                                            value={shipmentForm.payment_terms != null ? String(shipmentForm.payment_terms) : ""}
                                            onChange={e => setShipmentForm({
                                                ...shipmentForm,
                                                payment_terms: e.target.value ? parseInt(e.target.value, 10) : null
                                            })}
                                            disabled={paymentTerms.length === 0}
                                            className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs font-semibold h-8 disabled:bg-muted"
                                        >
                                            <option value="" disabled hidden>Select Payment Terms...</option>
                                            {paymentTerms.map(term => (
                                                <option key={term.id} value={term.id}>{term.payment_name}</option>
                                            ))}
                                        </select>
                                        {paymentTerms.length === 0 && (
                                            <p className="text-[10px] font-medium text-destructive" role="alert">Payment terms are unavailable.</p>
                                        )}
                                    </div>
                                )}

                                {canonicalDrafting ? (
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Price Type</label>
                                        <div
                                            aria-live="polite"
                                            role={priceTypeResolution.status === "error" ? "alert" : "status"}
                                            className={`flex min-h-8 items-center rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                                                priceTypeResolution.status === "error"
                                                    ? "border-destructive/40 bg-destructive/5 text-destructive"
                                                    : priceTypeResolution.status === "resolved"
                                                        ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700"
                                                        : "bg-muted text-muted-foreground"
                                            }`}
                                        >
                                            {priceTypeResolution.status === "resolved"
                                                ? priceTypeResolution.priceTypeName
                                                : priceTypeResolution.message || "Determined from selected products"}
                                        </div>
                                        {priceMatrixStatus === "loading" && (
                                            <p className="text-[10px] font-medium text-muted-foreground">Loading Price Control prices...</p>
                                        )}
                                        {priceMatrixStatus === "error" && (
                                            <p className="text-[10px] font-medium text-destructive" role="alert">{priceMatrixError}</p>
                                        )}
                                        {priceMatrixStatus === "warning" && (
                                            <p className="text-[10px] font-medium text-amber-700" role="status">
                                                Price Control is not configured for {missingPriceControlProducts.join(", ") || "one or more selected products"}. Enter a positive unit price; that price will be used for this purchase order only. Submit a separate Price Control change for future purchase orders.
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Price Type *</label>
                                        <select
                                            value={shipmentForm.price_type || ""}
                                            onChange={e => setShipmentForm({...shipmentForm, price_type: e.target.value || null})}
                                            className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs font-semibold h-8"
                                        >
                                            <option value="" disabled hidden>Select Price Type...</option>
                                            {priceTypes && priceTypes.length > 0 ? (
                                                priceTypes.map(pt => {
                                                    const name = pt.price_type_name || pt.name || `Price Type #${pt.price_type_id}`;
                                                    return (
                                                        <option key={pt.price_type_id} value={name}>{name}</option>
                                                    );
                                                })
                                            ) : (
                                                <>
                                                    <option value="Internal">Internal</option>
                                                    <option value="SRP">SRP</option>
                                                    <option value="Government">Government</option>
                                                    <option value="Dealer">Dealer</option>
                                                    <option value="Sub-Dealer">Sub-Dealer</option>
                                                    <option value="Project">Project</option>
                                                </>
                                            )}
                                        </select>
                                    </div>
                                )}

                                {!canonicalDrafting && (
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase">ETA Date *</label>
                                        <input
                                            type="date"
                                            required
                                            value={shipmentForm.date_received || ""}
                                            onChange={e => setShipmentForm({...shipmentForm, date_received: e.target.value})}
                                            className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs font-medium h-8"
                                        />
                                    </div>
                                )}
                            </div>
                            {canonicalDrafting && (
                                <div className="space-y-1.5 border-t pt-3">
                                    <label htmlFor="purchase-order-remarks" className="text-[10px] font-bold text-muted-foreground uppercase">
                                        Remarks
                                    </label>
                                    <textarea
                                        id="purchase-order-remarks"
                                        rows={3}
                                        value={shipmentForm.remark || ""}
                                        onChange={event => setShipmentForm({ ...shipmentForm, remark: event.target.value })}
                                        placeholder="Enter purchase notes, special terms, and other relevant details..."
                                        className="w-full resize-y rounded-lg border bg-background px-2.5 py-2 text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Excel Spreadsheet Table Container */}
                        <div className="space-y-2 pt-1">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-xs font-extrabold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                                        <Table className="h-4 w-4 text-primary" />
                                        {canonicalDrafting ? "Purchase Order Cargo Manifest Grid" : "Cargo Manifest Item Grid"}
                                    </h4>
                                    <span className="text-[10px] text-muted-foreground font-mono">
                                        ({linesForm.length} {linesForm.length === 1 ? "Row" : "Rows"})
                                    </span>
                                </div>
                                {shipmentForm.supplier_id && (
                                    <button
                                        type="button"
                                        onClick={handleAddRow}
                                        disabled={!canonicalDrafting && activeRowEdit !== null}
                                        aria-label="Add Row"
                                        title="Add Row"
                                        className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg transition-all border border-primary/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Plus className="h-3.5 w-3.5" /> Add Row
                                    </button>
                                )}
                            </div>

                            {!shipmentForm.supplier_id ? (
                                <div className="p-8 rounded-xl border bg-amber-500/5 border-amber-500/10 text-center space-y-2 animate-in fade-in duration-200">
                                    <AlertCircle className="h-6 w-6 text-amber-500 mx-auto animate-pulse" />
                                    <p className="text-xs text-amber-700 font-extrabold uppercase tracking-wider">Vendor Selection Required</p>
                                    <p className="text-[11px] text-amber-600/90 font-medium max-w-md mx-auto">Please select a supplier vendor above to unlock the raw materials catalog and spreadsheet grid.</p>
                                </div>
                            ) : (
                                <div className="border rounded-xl shadow-sm bg-card min-w-0 h-[320px] min-h-[220px] max-h-[45dvh] overflow-auto overscroll-contain">
                                    <table className="w-full text-left text-xs border-collapse font-sans min-w-[1100px]">
                                        {/* Table Column Headers */}
                                        <thead className="bg-muted/60 border-b select-none text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">
                                            <tr>
                                                <th className="p-2 border-r text-center w-10">#</th>
                                                <th className="p-2 border-r min-w-[110px]">Type <span className="text-red-500">*</span></th>
                                                <th className="p-2 border-r min-w-[260px]">Raw Product Name <span className="text-red-500">*</span></th>
                                                <th className="p-2 border-r min-w-[160px]">Packaging / UOM</th>
                                                <th className="p-2 border-r text-right min-w-[110px]">Qty <span className="text-red-500">*</span></th>
                                                <th className="p-2 border-r text-right min-w-[120px]">Price ({currencyCode}) <span className="text-red-500">*</span></th>
                                                <th className="p-2 border-r text-right min-w-[130px]">Gross ({currencyCode})</th>
                                                <th className="p-2 border-r min-w-[140px]">Discount Type</th>
                                                <th className="p-2 border-r text-right min-w-[120px]">Discount Value</th>
                                                <th className="p-2 border-r text-right min-w-[130px]">Net ({currencyCode})</th>
                                                <th className="p-2 text-center min-w-[100px]">Actions</th>
                                            </tr>
                                        </thead>

                                        {/* Table Row Cells */}
                                        <tbody className="divide-y divide-border/60">
                                            {linesForm.map((line, idx) => {
                                                const lineErrors = getLineErrors(line);
                                                const selectedMaterial = rawMaterials.find(material =>
                                                    String(material.product_id) === String(line.product_id)
                                                ) || rawMaterials.find(material =>
                                                    String(material.product_id) === String(line.parent_product_id)
                                                );

                                                const qty = Number(line.quantity_ordered || 0);
                                                const unitPrice = Number(line.base_unit_cost_php || 0);
                                                const grossForeign = qty * unitPrice;
                                                const discountMode = line.discount_mode || "Percentage";
                                                const discount = discountMode === "Fixed Amount"
                                                    ? Number(line.discount_amount || 0)
                                                    : (grossForeign * Number(line.discount_percent || 0)) / 100;
                                                const subtotal = grossForeign - discount;
                                                const materialType = line.material_type || purchaseOrderMaterialTypeFromProductType(selectedMaterial?.product_type);
                                                const isRowEditing = canonicalDrafting || activeRowEdit?.index === idx;
                                                const hasActiveRowEdit = !canonicalDrafting && activeRowEdit !== null;
                                                const isFocusedRowEdit = !canonicalDrafting && activeRowEdit?.index === idx;

                                                return (
                                                    <tr 
                                                        key={idx} 
                                                        className={`hover:bg-muted/30 transition-colors group ${
                                                            hasSubmitted && lineErrors.length > 0 ? "bg-red-500/5" : ""
                                                        } ${isFocusedRowEdit ? "bg-primary/5" : ""}`}
                                                    >
                                                        {/* Row Index */}
                                                        <td className="p-2 border-r text-center font-mono text-[10px] font-bold text-muted-foreground bg-muted/20">
                                                            {idx + 1}
                                                        </td>

                                                        {/* Material Type Selector */}
                                                        <td className="p-2 border-r align-middle">
                                                            <select
                                                                aria-label={`Type for purchase order line ${idx + 1}`}
                                                                data-index={idx}
                                                                value={materialType}
                                                                onChange={event => {
                                                                    const nextType = event.target.value as ManifestLineFormItem["material_type"];
                                                                    handleLineFormChange(idx, {
                                                                        material_type: nextType,
                                                                        product_id: "",
                                                                        parent_product_id: "",
                                                                        product_name: "",
                                                                        product_code: "",
                                                                        selected_uom: "",
                                                                        base_unit_cost_php: "",
                                                                        uom_options: []
                                                                    });
                                                                }}
                                                                disabled={!isRowEditing}
                                                                className="w-full rounded-md border bg-background px-2 py-1 text-xs font-semibold outline-none focus:ring-1 focus:ring-primary"
                                                            >
                                                                <option value="">Select Type...</option>
                                                                {PURCHASE_ORDER_MATERIAL_TYPE_OPTIONS.map(option => (
                                                                    <option key={option.value} value={option.value}>
                                                                        {option.label}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </td>

                                                        {/* Raw Product Name Selector */}
                                                        <td className="p-1.5 border-r align-middle">
                                                            <RawProductSelector
                                                                id={`search-input-${idx}`}
                                                                autoFocus={idx === linesForm.length - 1 && linesForm.length > 1}
                                                                rawMaterials={supplierRawMaterials.filter(rm => {
                                                                    const isAlreadySelected = linesForm.some((l, lIdx) => {
                                                                        if (lIdx === idx) return false;
                                                                        const selectedId = String(l.product_id);
                                                                        const selectedParentId = l.parent_product_id ? String(l.parent_product_id) : "";
                                                                        const currentId = String(rm.product_id);
                                                                        const currentParentId = normalizeProductRelationId(rm.parent_id);

                                                                        return (
                                                                            selectedId === currentId ||
                                                                            (selectedParentId && selectedParentId === currentId) ||
                                                                            (currentParentId && selectedId === String(currentParentId)) ||
                                                                            (selectedParentId && currentParentId && selectedParentId === String(currentParentId))
                                                                        );
                                                                    });
                                                                    return !isAlreadySelected;
                                                                })}
                                                                selectedProductId={line.product_id}
                                                                parentProductId={line.parent_product_id}
                                                                productName={line.product_name}
                                                                materialType={materialType}
                                                                disabled={!isRowEditing || !materialType}
                                                                onSelect={(selected) => {
                                                                    const isDuplicate = linesForm.some((l, i) => i !== idx && String(l.product_id) === String(selected.product_id));
                                                                    if (isDuplicate) return;
                                                                    
                                                                    const finalSelected = { ...selected };
                                                                    const specialPrice = priceTypeRatesMap[Number(selected.product_id)];
                                                                    if (specialPrice !== undefined && specialPrice > 0) {
                                                                        finalSelected.base_unit_cost_php = String(specialPrice);
                                                                    } else if (canonicalDrafting) {
                                                                        finalSelected.base_unit_cost_php = "";
                                                                    }
                                                                    if (canonicalDrafting && shipmentForm.currency_code === "USD" && finalSelected.base_unit_cost_php) {
                                                                        finalSelected.base_unit_cost_php = String(
                                                                            Number(finalSelected.base_unit_cost_php) / (Number(shipmentForm.exchange_rate) || 1)
                                                                        );
                                                                    }

                                                                    if (productPerSupplierMap) {
                                                                        const prodId = Number(selected.product_id);
                                                                        const parentId = selected.parent_product_id ? Number(selected.parent_product_id) : null;
                                                                        const pps = productPerSupplierMap[prodId] || (parentId ? productPerSupplierMap[parentId] : undefined);
                                                                        if (pps) {
                                                                            (finalSelected as ManifestLineFormItem).discount_type_id = pps.discount_type_id ? String(pps.discount_type_id) : "";
                                                                            (finalSelected as ManifestLineFormItem).discount_mode = "Percentage";
                                                                            (finalSelected as ManifestLineFormItem).discount_amount = "0";
                                                                            (finalSelected as ManifestLineFormItem).discount_percent = pps.total_percent !== undefined ? String(pps.total_percent) : "0";
                                                                        }
                                                                    }

                                                                    handleLineFormChange(idx, {
                                                                        ...finalSelected,
                                                                        material_type: materialType
                                                                    });
                                                                    setTimeout(() => {
                                                                        const nextInput = document.getElementById(`qty-input-${idx}`);
                                                                        if (nextInput) {
                                                                            nextInput.focus();
                                                                            if (nextInput instanceof HTMLInputElement) nextInput.select();
                                                                        }
                                                                    }, 50);
                                                                }}
                                                            />
                                                        </td>

                                                        {/* Packaging / UOM Options */}
                                                        <td className="p-1.5 border-r align-middle">
                                                            {line.uom_options && line.uom_options.length > 0 ? (
                                                                <select
                                                                    value={line.product_id}
                                                                    onChange={(e) => {
                                                                        const selectedId = e.target.value;
                                                                        const isDuplicate = linesForm.some((l, i) => i !== idx && String(l.product_id) === String(selectedId));
                                                                        if (isDuplicate) return;
                                                                        const opt = line.uom_options?.find((o: UOMOption) => String(o.product_id) === String(selectedId));
                                                                        if (opt) {
                                                                            let costVal: number | undefined = opt.cost_per_unit;
                                                                            const specialPrice = priceTypeRatesMap[Number(selectedId)];
                                                                            if (specialPrice !== undefined && specialPrice > 0) {
                                                                                costVal = specialPrice;
                                                                            } else if (canonicalDrafting) {
                                                                                costVal = undefined;
                                                                            }
                                                                            if (costVal !== undefined && canonicalDrafting && shipmentForm.currency_code === "USD") {
                                                                                costVal /= Number(shipmentForm.exchange_rate) || 1;
                                                                            }
                                                                            handleLineFormChange(idx, {
                                                                                product_id: String(selectedId),
                                                                                parent_product_id: opt.parent_product_id
                                                                                    ? String(opt.parent_product_id)
                                                                                    : line.parent_product_id,
                                                                                selected_uom: opt.unit_shortcut,
                                                                                base_unit_cost_php: costVal === undefined ? "" : String(costVal)
                                                                            });
                                                                        }
                                                                    }}
                                                                    disabled={!isRowEditing}
                                                                    className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary font-semibold text-foreground"
                                                                >
                                                                    {line.uom_options.map((o: UOMOption) => (
                                                                        <option key={o.product_id} value={o.product_id}>
                                                                            {o.unit_shortcut}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            ) : (
                                                                <span className="text-[11px] font-bold text-muted-foreground px-2">
                                                                    {line.selected_uom || "PCS"}
                                                                </span>
                                                            )}
                                                        </td>

                                                        {/* Qty Ordered */}
                                                        <td className="p-1.5 border-r align-middle">
                                                            <input
                                                                id={`qty-input-${idx}`}
                                                                type="number"
                                                                required
                                                                placeholder="1000"
                                                                value={line.quantity_ordered || ""}
                                                                onChange={e => handleLineFormChange(idx, "quantity_ordered", e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === "Enter") {
                                                                        e.preventDefault();
                                                                        const costInput = document.getElementById(`cost-input-${idx}`);
                                                                        if (costInput) {
                                                                            costInput.focus();
                                                                            if (costInput instanceof HTMLInputElement) costInput.select();
                                                                        }
                                                                    }
                                                                }}
                                                                disabled={!isRowEditing}
                                                                className="w-full text-right rounded-md border bg-background px-2 py-1 text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-primary"
                                                            />
                                                        </td>

                                                        {/* Unit Price */}
                                                        <td className="p-1.5 border-r align-middle">
                                                            <input
                                                                id={`cost-input-${idx}`}
                                                                type="number"
                                                                required
                                                                step="0.0001"
                                                                placeholder="19.00"
                                                                value={line.base_unit_cost_php}
                                                                onChange={e => handleLineFormChange(idx, "base_unit_cost_php", e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === "Enter") {
                                                                        e.preventDefault();
                                                                        if (idx === linesForm.length - 1) {
                                                                            handleAddRow();
                                                                        } else {
                                                                            const nextSearchInput = document.getElementById(`search-input-${idx + 1}`);
                                                                            if (nextSearchInput) nextSearchInput.focus();
                                                                        }
                                                                    }
                                                                }}
                                                                disabled={!isRowEditing}
                                                                className="w-full text-right rounded-md border bg-background px-2 py-1 text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-primary"
                                                            />
                                                        </td>

                                                        {/* Calculated Gross */}
                                                        <td className="p-2 border-r text-right font-mono font-extrabold text-foreground align-middle bg-muted/10">
                                                            {formatMoney(grossForeign, currencyCode)}
                                                        </td>

                                                        {/* Discount Type and Preset */}
                                                        <td className="p-1.5 border-r align-middle">
                                                            <div className="space-y-1">
                                                                <select
                                                                    aria-label={`Discount Type for purchase order line ${idx + 1}`}
                                                                    value={line.discount_mode || "Percentage"}
                                                                    onChange={event => {
                                                                        const mode = event.target.value as ManifestLineFormItem["discount_mode"];
                                                                        handleLineFormChange(idx, mode === "Fixed Amount"
                                                                            ? { discount_mode: mode, discount_type_id: "", discount_percent: "0", discount_amount: "0" }
                                                                            : { discount_mode: "Percentage", discount_amount: "0", discount_percent: line.discount_percent || "0" });
                                                                    }}
                                                                    disabled={!isRowEditing}
                                                                    className="w-full rounded-md border bg-background px-2 py-1 text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
                                                                >
                                                                    <option value="Percentage">Percentage</option>
                                                                    <option value="Fixed Amount">Fixed Amount</option>
                                                                </select>
                                                                <select
                                                                    aria-label={`Discount Preset for purchase order line ${idx + 1}`}
                                                                    value={line.discount_type_id !== undefined && line.discount_type_id !== null ? String(line.discount_type_id) : ""}
                                                                    disabled={!isRowEditing || discountMode !== "Percentage"}
                                                                    onChange={event => {
                                                                        const dtId = event.target.value;
                                                                        const selectedDt = discountTypes?.find(dt => String(dt.id) === String(dtId));
                                                                        handleLineFormChange(idx, {
                                                                            discount_mode: "Percentage",
                                                                            discount_type_id: dtId,
                                                                            discount_amount: "0",
                                                                            discount_percent: selectedDt ? String(selectedDt.total_percent) : (dtId === "" ? "0" : line.discount_percent || "0")
                                                                        });
                                                                    }}
                                                                    className="w-full rounded-md border bg-background px-2 py-1 text-[10px] font-medium outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                                                                >
                                                                    <option value="">No Preset / Custom %</option>
                                                                    {discountTypes?.map(dt => (
                                                                        <option key={dt.id} value={String(dt.id)}>
                                                                            {dt.discount_type} ({Number(dt.total_percent).toFixed(1)}%)
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        </td>

                                                        {/* Discount Value */}
                                                        <td className="p-1.5 border-r align-middle">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max={discountMode === "Fixed Amount" ? Math.max(0, grossForeign) : 100}
                                                                step="0.01"
                                                                aria-label={`${discountMode === "Fixed Amount" ? "Discount Amount" : "Discount Percentage"} for purchase order line ${idx + 1}`}
                                                                value={discountMode === "Fixed Amount" ? (line.discount_amount ?? "0") : (line.discount_percent ?? "0")}
                                                                onChange={event => handleLineFormChange(idx, discountMode === "Fixed Amount" ? "discount_amount" : "discount_percent", event.target.value)}
                                                                disabled={!isRowEditing}
                                                                className="w-full text-right rounded-md border bg-background px-2 py-1 text-xs font-mono font-medium outline-none focus:ring-1 focus:ring-primary"
                                                            />
                                                            {hasSubmitted && lineErrors.filter(error => error.toLowerCase().includes("discount")).map(error => (
                                                                <p key={error} className="mt-1 text-left text-[9px] font-semibold leading-tight text-red-600">{error}</p>
                                                            ))}
                                                        </td>

                                                        {/* Net Subtotal */}
                                                        <td className="p-2 border-r text-right font-mono font-black text-primary align-middle bg-primary/5">
                                                            {formatMoney(subtotal, currencyCode)}
                                                        </td>

                                                        {canonicalDrafting && (
                                                            <td className="p-1.5 text-center align-middle min-w-[100px]">
                                                                {linesForm.length > 1 && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleRemoveLineForm(idx)}
                                                                        aria-label={`Delete Row ${idx + 1}`}
                                                                        title={`Delete Row ${idx + 1}`}
                                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 text-red-600 shadow-sm transition-colors hover:bg-red-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </button>
                                                                )}
                                                            </td>
                                                        )}

                                                        {!canonicalDrafting && (
                                                            <>
                                                        {/* Actions */}
                                                        <td className="p-1.5 text-center align-middle min-w-[180px]">
                                                            <div className="flex flex-wrap items-center justify-center gap-1">
                                                                {isRowEditing ? (
                                                                    <>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleSaveRow(idx)}
                                                                            aria-label="Save Row"
                                                                            title="Save Row"
                                                                            className="inline-flex items-center gap-1 rounded-lg bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                                                                        >
                                                                            <Check className="h-3 w-3" /> Save Row
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleCancelRowEdit(idx)}
                                                                            aria-label="Cancel Row"
                                                                            title="Cancel Row"
                                                                            className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                                                        >
                                                                            <X className="h-3 w-3" /> Cancel Row
                                                                        </button>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleStartRowEdit(idx)}
                                                                            disabled={hasActiveRowEdit}
                                                                            aria-label="Edit Row"
                                                                            title="Edit Row"
                                                                            className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                                                                        >
                                                                            <Pencil className="h-3 w-3" /> Edit Row
                                                                        </button>
                                                                        {linesForm.length > 1 && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleRemoveLineForm(idx)}
                                                                                disabled={hasActiveRowEdit}
                                                                                aria-label="Delete Row"
                                                                                title="Delete Row"
                                                                                className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                                                                            >
                                                                                <Trash2 className="h-3 w-3" /> Delete Row
                                                                            </button>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </div>
                                                            {isRowEditing && rowEditError && (
                                                                <p role="alert" className="mt-1 text-left text-[9px] font-semibold leading-tight text-red-600">
                                                                    {rowEditError}
                                                                </p>
                                                            )}
                                                        </td>
                                                            </>
                                                        )}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>

                                        {/* Spreadsheet Totals Summary Row */}
                                        <tfoot className="bg-muted/40 font-mono font-extrabold text-xs border-t-2 border-primary/20 divide-y">
                                            <tr>
                                                <td colSpan={4} className="p-2.5 border-r text-left text-muted-foreground uppercase text-[10px] tracking-wider font-sans font-bold">
                                                    Excel Summary Totals ({linesForm.length} Line Items)
                                                </td>
                                                <td className="p-2.5 border-r text-right text-foreground">
                                                    {linesForm.reduce((sum, l) => sum + Number(l.quantity_ordered || 0), 0).toLocaleString()}
                                                </td>
                                                <td className="p-2.5 border-r text-right text-muted-foreground text-[10px]">
                                                    AVG Rate
                                                </td>
                                                <td className="p-2.5 border-r text-right text-foreground">
                                                    {formatMoney(draftSummary.grossForeign, currencyCode)}
                                                </td>
                                                <td colSpan={2} className="p-2.5 border-r text-right text-muted-foreground font-medium text-[10px]">
                                                    Disc Subtotal
                                                </td>
                                                <td className="p-2.5 border-r text-right text-primary text-sm font-black">
                                                    {formatMoney(draftSummary.netForeign, currencyCode)}
                                                </td>
                                                <td className="p-2.5"></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Financial Totals Summary Bar */}
                        {linesForm.length > 0 && (
                            <div className="p-4 bg-muted/30 border rounded-xl space-y-2 animate-in fade-in duration-200" aria-live="polite">
                                <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                                    <span>Locked Order Grand Totals Preview</span>
                                    <span className="font-mono text-primary flex items-center gap-1">
                                        <Sparkles className="h-3 w-3" /> Auto-calculated
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs pt-1">
                                    <div className="bg-background p-2.5 border rounded-lg">
                                        <span className="text-[10px] text-muted-foreground uppercase font-bold block">Gross ({currencyCode})</span>
                                        <span className="font-mono font-bold text-foreground text-sm block">{formatMoney(draftSummary.grossForeign, currencyCode)}</span>
                                    </div>
                                    <div className="bg-background p-2.5 border rounded-lg">
                                        <span className="text-[10px] text-muted-foreground uppercase font-bold block">Discount ({currencyCode})</span>
                                        <span className="font-mono font-bold text-foreground text-sm block">{formatMoney(draftSummary.discountForeign, currencyCode)}</span>
                                    </div>
                                    <div className="bg-background p-2.5 border rounded-lg sm:col-span-2">
                                        <span className="text-[10px] text-muted-foreground uppercase font-bold block">Net {currencyCode} Value</span>
                                        <span className="font-mono font-black text-primary text-base block">{formatMoney(draftSummary.netForeign, currencyCode)}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Dialog Action Buttons */}
                    <div className="sticky bottom-0 border-t pt-3 flex items-center justify-between gap-2 shrink-0 bg-card mt-auto">
                        <div className="ml-auto flex items-center gap-2">
                            <button
                                onClick={handleCloseModal}
                                type="button"
                                className="px-4 py-2 border rounded-lg text-xs font-semibold hover:bg-muted text-foreground transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                id="register-shipment-btn"
                                type="submit"
                    disabled={loading || listLoading || (canonicalDrafting && (
                        priceTypeResolution.status !== "resolved"
                        || (priceMatrixStatus !== "ready" && priceMatrixStatus !== "warning")
                        || (!editingShipmentId && shipmentForm.currency_code === "USD" && fxRateStatus !== "ready")
                    ))}
                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/95 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        {editingShipmentId
                                            ? activeShipment?.status === "Rejected" ? "Resubmitting Purchase Order..." : "Saving Changes..."
                                            : canonicalDrafting ? "Creating Purchase Order..." : "Registering Shipment..."}
                                    </>
                                ) : (editingShipmentId
                                    ? activeShipment?.status === "Rejected"
                                        ? "Revise & Resubmit PO"
                                        : canonicalDrafting ? "Save For Approval PO" : "Save Requested PO"
                                    : canonicalDrafting ? "Create Purchase Order" : "Register Shipment")}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
