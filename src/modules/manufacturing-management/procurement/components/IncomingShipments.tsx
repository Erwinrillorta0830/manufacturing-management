import React, { useState, useEffect } from "react";

import { IncomingShipment, ShipmentLineItem, Supplier, RawMaterial, LinkedProduct } from "../types";

interface UOMOption {
    product_id: number;
    unit_shortcut: string;
    cost_per_unit: number;
    unit_of_measurement_count?: number;
}

function formatMoney(value: number | string | null | undefined, currency = "PHP", decimalPlaces = CURRENCY_DECIMAL_SCALE) {
    const symbol = currency === "USD" ? "$" : currency === "PHP" ? "₱" : `${currency} `;
    try {
        return `${symbol}${formatDecimal(value ?? 0, decimalPlaces)}`;
    } catch {
        return `${symbol}${formatDecimal(0, decimalPlaces)}`;
    }
}

function formatAmount(value: number | string | null | undefined) {
    try {
        return formatDecimal(value ?? 0);
    } catch {
        return "0.00";
    }
}

function MaterialTypeBadge({ typeId, short = false }: { typeId?: number | string | null; short?: boolean }) {
    const normalizedTypeId = Number(typeId);
    const type = normalizedTypeId === 389
        ? { label: "Raw Material", shortLabel: "RM", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" }
        : normalizedTypeId === 390
            ? { label: "Packaging Item", shortLabel: "PKG", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" }
            : { label: "Unclassified", shortLabel: "N/A", className: "bg-muted text-muted-foreground border-border" };

    return (
        <span
            aria-label={`Material Type: ${type.label}`}
            title={`Material Type: ${type.label}`}
            className={`inline-flex w-fit items-center rounded border px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider ${type.className}`}
        >
            {short ? type.shortLabel : type.label}
        </span>
    );
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Search, Plus, Calendar, ShieldCheck, Truck, Layers, Anchor, AlertCircle, Info, Landmark, Edit, RefreshCw, Loader2, Trash2, CheckCircle2, CheckSquare, X } from "lucide-react";
import { toast } from "sonner";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { BOMMaterialSelect } from "@/modules/manufacturing-management/finished-goods/components/BOMMaterialSelect";
import { CreatableSelect } from "@/modules/manufacturing-management/finished-goods/components/CreatableSelect";
import { INVENTORY_STATUS, PAYMENT_STATUS } from "@/app/api/manufacturing/procurement/_domain";
import {
    CURRENCY_DECIMAL_SCALE,
    DecimalValue,
    formatDecimal,
    isNonNegativeDecimal,
    UNIT_PRICE_DECIMAL_SCALE
} from "@/modules/manufacturing-management/decimal";

export interface ManifestLineFormItem {
    product_id: string;
    quantity_ordered: string;
    base_unit_cost_php: string;
    parent_product_id: string;
    product_name?: string;
    product_code?: string;
    selected_uom?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    uom_options?: any[];
    purchase_intent?: "MRP_Demand" | "Buffer_Stock";
    job_order_id?: string;
    discount_percent?: string;
    vat_percent?: string;
    withholding_percent?: string;
}

export interface ShipmentFormState {
    reference_number: string;
    supplier_id: string;
    exchange_rate: string;
    total_foreign_currency: string;
    total_php_value: string;
    status: "Ordered" | "Approved" | "Awaiting Payment" | "Cancelled" | "For Pickup" | "En Route" | "Receiving (QA)" | "Partially Received" | "Received" | "Rejected";
    date_received: string;
    branch_id: number | null;
    payment_type: number | null;
    price_type: string | null;
    currency_code?: "PHP" | "USD";
    workflow_revision?: number;
}

interface IncomingShipmentsProps {
    shipments: IncomingShipment[];
    suppliers: Supplier[];
    rawMaterials: RawMaterial[];
    supplierLinkedProducts: LinkedProduct[];
    selectedShipment: IncomingShipment | null;
    setSelectedShipment: (s: IncomingShipment | null) => void;
    lines: ShipmentLineItem[];
    isModalOpen: boolean;
    setIsModalOpen: (open: boolean) => void;
    shipmentForm: ShipmentFormState;
    setShipmentForm: React.Dispatch<React.SetStateAction<ShipmentFormState>>;
    linesForm: ManifestLineFormItem[];
    setLinesForm: React.Dispatch<React.SetStateAction<ManifestLineFormItem[]>>;
    onCreateShipment: (e: React.FormEvent) => void;
    onTriggerAllocation: (s: IncomingShipment) => void;
    onEditShipment: (shipmentId: number, shipmentData: ShipmentFormState, lineItems: ManifestLineFormItem[]) => void | Promise<boolean | void>;
    onCancelRejectedPurchaseOrder?: (shipmentId: number, workflowRevision: number, remarks?: string) => void | Promise<boolean>;
    onUpdateShipmentStatus: (shipmentId: number, status: "Ordered" | "Approved" | "Awaiting Payment" | "Cancelled" | "For Pickup" | "En Route" | "Receiving (QA)" | "Partially Received" | "Received" | "Rejected") => void;
    loading?: boolean;
    listLoading?: boolean;
    serverList?: {
        total: number;
        totalPages: number;
        onQueryChange: (query: { page: number; limit: number; search: string; status?: string }) => void;
    };
    canonicalDrafting?: boolean;
    jobOrders?: Array<{ job_order_id: number; job_order_no?: string }>;
}

interface RawProductSelectorProps {
    id?: string;
    autoFocus?: boolean;
    rawMaterials: RawMaterial[];
    selectedProductId: string;
    parentProductId?: string;
    productName?: string;
    onSelect: (selected: {
        parent_product_id: string;
        product_id: string;
        product_name: string;
        product_code: string;
        selected_uom: string;
        base_unit_cost_php: string;
        uom_options: Array<{
            product_id: number;
            unit_shortcut: string;
            cost_per_unit: number;
        }>;
    }) => void;
}

function RawProductSelector({
    id,
    autoFocus,
    rawMaterials,
    selectedProductId,
    parentProductId,
    productName,
    onSelect
}: RawProductSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [dropUp, setDropUp] = useState(false);

    const dropdownRef = React.useRef<HTMLDivElement>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (autoFocus && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [autoFocus]);

    const handleFocus = () => {
        setIsOpen(true);
        const currentName = productName || rawMaterials.find(m => String(m.product_id) === String(parentProductId || selectedProductId))?.product_name || "";
        setSearchQuery(currentName);
        setHighlightedIndex(0);
        if (inputRef.current) {
            const rect = inputRef.current.getBoundingClientRect();
            const windowHeight = window.innerHeight;
            setDropUp(rect.bottom > windowHeight * 0.6);
        }
    };

    const displayValue = isOpen 
        ? searchQuery 
        : (productName || rawMaterials.find(m => String(m.product_id) === String(parentProductId || selectedProductId))?.product_name || "");

    // Filter results locally
    const filteredResults = React.useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return rawMaterials;
        return rawMaterials.filter(m => 
            m.product_name.toLowerCase().includes(query) ||
            (m.product_code && m.product_code.toLowerCase().includes(query))
        );
    }, [searchQuery, rawMaterials]);

    // Group matching products by parent item dynamically
    const groupedResults = React.useMemo(() => {
        const parentMap = new Map<number, RawMaterial>();
        const childrenMap = new Map<number, RawMaterial[]>();

        // 1. Separate parents and children
        filteredResults.forEach(item => {
            if (!item.parent_id) {
                parentMap.set(item.product_id, item);
            }
        });

        filteredResults.forEach(item => {
            if (item.parent_id) {
                const pId = item.parent_id;
                if (!childrenMap.has(pId)) {
                    childrenMap.set(pId, []);
                }
                childrenMap.get(pId)!.push(item);
            }
        });

        // 2. Synthesize virtual parents for children whose parent records didn't match the search filter
        filteredResults.forEach(item => {
            if (item.parent_id && !parentMap.has(item.parent_id)) {
                parentMap.set(item.parent_id, {
                    product_id: item.parent_id,
                    product_name: item.product_name.replace(/\s*\(.*?\)\s*$/, ""),
                    product_code: item.product_code ? `${item.product_code}-P` : undefined,
                    cost_per_unit: 0,
                    estimated_unit_cost: 0,
                    density_factor: 1
                });
            }
        });

        // 3. Construct grouped array with all packaging UOM options
        return Array.from(parentMap.values()).map(parent => {
            const children = childrenMap.get(parent.product_id) || [];
            const optionsMap = new Map<number, RawMaterial>();
            
            if (parent.unit_of_measurement) {
                optionsMap.set(parent.product_id, parent);
            }
            children.forEach(c => optionsMap.set(c.product_id, c));
            
            if (optionsMap.size === 0) {
                optionsMap.set(parent.product_id, parent);
            }

            return {
                parent,
                options: Array.from(optionsMap.values())
            };
        });
    }, [filteredResults]);

    // Flatten options for easy single-index keyboard navigation
    const flatOptions = React.useMemo(() => {
        const list: Array<{
            product_id: number;
            parent: RawMaterial;
            option: RawMaterial;
            uom_shortcut: string;
            cost: number;
            groupOptions: RawMaterial[];
        }> = [];
        groupedResults.forEach(group => {
            group.options.forEach((opt: RawMaterial) => {
                list.push({
                    product_id: opt.product_id,
                    parent: group.parent,
                    option: opt,
                    uom_shortcut: opt.unit_of_measurement?.unit_shortcut || "PCS",
                    cost: Number(opt.cost_per_unit || opt.estimated_unit_cost || 0),
                    groupOptions: group.options
                });
            });
        });
        return list;
    }, [groupedResults]);

    // React-safe index updates are triggered directly in event handlers to avoid cascading render warnings

    // Scroll highlighted item into view automatically
    useEffect(() => {
        if (isOpen && highlightedIndex >= 0 && dropdownRef.current) {
            const highlightedEl = dropdownRef.current.querySelector(`[data-index="${highlightedIndex}"]`);
            if (highlightedEl) {
                highlightedEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
        }
    }, [highlightedIndex, isOpen]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            document.getElementById("register-shipment-btn")?.click();
            return;
        }

        if (!isOpen) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") {
                setIsOpen(true);
                e.preventDefault();
                if (inputRef.current) {
                    const rect = inputRef.current.getBoundingClientRect();
                    const windowHeight = window.innerHeight;
                    setDropUp(rect.bottom > windowHeight * 0.6);
                }
            }
            return;
        }

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightedIndex(prev => {
                if (flatOptions.length === 0) return -1;
                return (prev + 1) % flatOptions.length;
            });
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightedIndex(prev => {
                if (flatOptions.length === 0) return -1;
                return (prev - 1 + flatOptions.length) % flatOptions.length;
            });
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (highlightedIndex >= 0 && highlightedIndex < flatOptions.length) {
                const sel = flatOptions[highlightedIndex];
                onSelect({
                    parent_product_id: String(sel.parent.product_id),
                    product_id: String(sel.product_id),
                    product_name: sel.parent.product_name,
                    product_code: sel.option.product_code || "",
                    selected_uom: sel.uom_shortcut,
                    base_unit_cost_php: String(sel.cost),
                    uom_options: sel.groupOptions.map((x: RawMaterial) => ({
                        product_id: x.product_id,
                        unit_shortcut: x.unit_of_measurement?.unit_shortcut || "PCS",
                        cost_per_unit: x.cost_per_unit || x.estimated_unit_cost || 0,
                        unit_of_measurement_count: x.unit_of_measurement_count || 1
                    }))
                });
                setIsOpen(false);
            }
        } else if (e.key === "Escape") {
            setIsOpen(false);
            e.preventDefault();
            e.stopPropagation();
        }
    };

    return (
        <div className="relative w-full">
            <div className="relative">
                <input
                    id={id}
                    ref={inputRef}
                    type="text"
                    autoComplete="off"
                    placeholder="Type to search product..."
                    value={displayValue}
                    onChange={e => { setSearchQuery(e.target.value); setHighlightedIndex(0); }}
                    onFocus={handleFocus}
                    onKeyDown={handleKeyDown}
                    className="w-full rounded-lg border bg-background pl-3 pr-8 py-2 text-xs h-9 font-semibold text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary outline-none"
                />
                <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-[40]" onClick={() => setIsOpen(false)} />
                    <div 
                        ref={dropdownRef}
                        data-dropdown-open="true"
                        className={`absolute left-0 right-0 ${dropUp ? "bottom-full mb-1" : "top-full mt-1"} bg-card border rounded-xl shadow-2xl z-[50] max-h-60 overflow-y-auto divide-y`}
                    >
                        {groupedResults.map((group) => {
                            const hasHighlightedOption = group.options.some((x: RawMaterial) => {
                                const idx = flatOptions.findIndex(f => f.product_id === x.product_id);
                                return idx === highlightedIndex;
                            });

                            return (
                                <div 
                                    key={group.parent.product_id} 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const firstOpt = group.options[0];
                                        if (firstOpt) {
                                            const cost = Number(firstOpt.cost_per_unit || firstOpt.estimated_unit_cost || 0);
                                            onSelect({
                                                parent_product_id: String(group.parent.product_id),
                                                product_id: String(firstOpt.product_id),
                                                product_name: group.parent.product_name,
                                                product_code: firstOpt.product_code || "",
                                                selected_uom: firstOpt.unit_of_measurement?.unit_shortcut || "PCS",
                                                base_unit_cost_php: String(cost),
                                                uom_options: group.options.map((x: RawMaterial) => ({
                                                    product_id: x.product_id,
                                                    unit_shortcut: x.unit_of_measurement?.unit_shortcut || "PCS",
                                                    cost_per_unit: x.cost_per_unit || x.estimated_unit_cost || 0,
                                                    unit_of_measurement_count: x.unit_of_measurement_count || 1
                                                }))
                                            });
                                            setIsOpen(false);
                                        }
                                    }}
                                    className={`p-3 transition-all flex flex-col gap-1.5 text-xs text-left cursor-pointer ${
                                        hasHighlightedOption ? "bg-primary/[0.02] border-l-2 border-l-primary" : "hover:bg-muted/5"
                                    }`}
                                >
                                    <div>
                                        <div className="flex items-center gap-1">
                                            <div className="font-extrabold text-foreground">{group.parent.product_name}</div>
                                            <MaterialTypeBadge typeId={group.parent.product_type} />
                                        </div>
                                        <div className="text-[9px] text-muted-foreground font-mono mt-0.5">Base SKU: {group.parent.product_code || `ID-${group.parent.product_id}`}</div>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 mt-0.5">
                                        {group.options.map((opt: RawMaterial) => {
                                            const cost = Number(opt.cost_per_unit || opt.estimated_unit_cost || 0);
                                            const flatIndex = flatOptions.findIndex(x => x.product_id === opt.product_id);
                                            const isHighlighted = flatIndex === highlightedIndex;

                                            return (
                                                <button
                                                    key={opt.product_id}
                                                    type="button"
                                                    data-index={flatIndex}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSelect({
                                                            parent_product_id: String(group.parent.product_id),
                                                            product_id: String(opt.product_id),
                                                            product_name: group.parent.product_name,
                                                            product_code: opt.product_code || "",
                                                            selected_uom: opt.unit_of_measurement?.unit_shortcut || "PCS",
                                                            base_unit_cost_php: String(cost),
                                                            uom_options: group.options.map((x: RawMaterial) => ({
                                                                product_id: x.product_id,
                                                                unit_shortcut: x.unit_of_measurement?.unit_shortcut || "PCS",
                                                                cost_per_unit: x.cost_per_unit || x.estimated_unit_cost || 0,
                                                                unit_of_measurement_count: x.unit_of_measurement_count || 1
                                                            }))
                                                        });
                                                        setIsOpen(false);
                                                    }}
                                                    className={`border px-2 py-1 rounded-[4px] text-[9px] font-bold transition-all flex items-center gap-1 ${
                                                        isHighlighted 
                                                            ? "bg-primary text-primary-foreground border-primary shadow-sm scale-[1.03]" 
                                                            : "bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground border-primary/20"
                                                    }`}
                                                >
                                                    <span>{opt.unit_of_measurement?.unit_shortcut || "PCS"}</span>
                                                    <MaterialTypeBadge typeId={opt.product_type} short />
                                                    <span className="opacity-50">|</span>
                                                    <span>{formatMoney(cost)}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                        {groupedResults.length === 0 && (
                            <div className="p-4 text-center text-xs text-muted-foreground italic">
                                No compatible products found matching &quot;{searchQuery}&quot;
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

export default function IncomingShipments({
    shipments,
    suppliers,
    rawMaterials,
    supplierLinkedProducts,
    selectedShipment,
    setSelectedShipment,
    lines,
    isModalOpen,
    setIsModalOpen,
    shipmentForm,
    setShipmentForm,
    linesForm,
    setLinesForm,
    onCreateShipment,
    onEditShipment,
    onCancelRejectedPurchaseOrder,
    onUpdateShipmentStatus,
    loading = false,
    listLoading = false,
    serverList,
    canonicalDrafting = false,
    jobOrders = []
}: IncomingShipmentsProps) {
    const onServerQueryChange = serverList?.onQueryChange;
    const [editingShipmentId, setEditingShipmentId] = useState<number | null>(null);
    const [statusLoading, setStatusLoading] = useState<"en-route" | "arrived" | null>(null);
    const [search, setSearch] = useState("");
    const [isOverridden, setIsOverridden] = useState(false);
    const [statusFilter, setStatusFilter] = useState("All");
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(5);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const modalRef = React.useRef<HTMLDivElement>(null);
    const restoreFocusRef = React.useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!onServerQueryChange) return;
        const timeout = window.setTimeout(() => {
            onServerQueryChange({
                page: currentPage,
                limit: itemsPerPage,
                search,
                status: statusFilter === "All" ? undefined : statusFilter
            });
        }, 250);
        return () => window.clearTimeout(timeout);
    }, [currentPage, itemsPerPage, onServerQueryChange, search, statusFilter]);

    useEffect(() => {
        if (!isModalOpen) return;
        restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const timeout = window.setTimeout(() => {
            const firstControl = modalRef.current?.querySelector<HTMLElement>("input, select, textarea, button:not([aria-label='Close dialog'])");
            firstControl?.focus();
        }, 0);
        return () => {
            window.clearTimeout(timeout);
            restoreFocusRef.current?.focus();
            restoreFocusRef.current = null;
        };
    }, [isModalOpen]);

    const handleStartEdit = async () => {
        if (!activeShipment) return;

        setHasSubmitted(false);

        setShipmentForm({
            reference_number: activeShipment.reference_number,
            supplier_id: String(activeShipment.supplier_id && typeof activeShipment.supplier_id === "object" ? activeShipment.supplier_id.id : activeShipment.supplier_id || ""),
            date_received: activeShipment.date_received || new Date().toISOString().split("T")[0],
            total_foreign_currency: String(activeShipment.total_foreign_currency),
            exchange_rate: String(activeShipment.exchange_rate),
            total_php_value: String(activeShipment.total_php_value),
            status: "Ordered",
            branch_id: activeShipment.branch_id || 182,
            payment_type: activeShipment.payment_type || 1,
            price_type: activeShipment.price_type || "Internal"
            ,currency_code: (activeShipment as IncomingShipment & { currency_code?: "PHP" | "USD" }).currency_code || "PHP"
            ,workflow_revision: activeShipment.workflow_revision || 0
        });

        // Always re-fetch lines fresh to guarantee quantity_ordered is populated
        let freshLines: ShipmentLineItem[] = [];
        try {
            const res = await fetch(`/api/manufacturing/purchase-orders/${activeShipment.shipment_id}`);
            if (res.ok) {
                const data = await res.json();
                freshLines = Array.isArray(data) ? data : (data.data || data.lines || []);
            }
        } catch (e) {
            console.error("Failed to fetch fresh lines for edit:", e);
        }

        // Fallback to prop if fetch returned nothing
        if (freshLines.length === 0) freshLines = lines;

        console.debug("[EditPO] lines prop:", lines);
        console.debug("[EditPO] freshLines from API:", freshLines);

        const currencyCode = (activeShipment as IncomingShipment & { currency_code?: "PHP" | "USD" }).currency_code || "PHP";
        const exchangeRate = DecimalValue.from(activeShipment.exchange_rate || 1);
        setLinesForm(freshLines.map((l: ShipmentLineItem) => ({
            product_id: String(typeof l.product_id === "object" ? l.product_id.product_id : l.product_id),
            product_name: typeof l.product_id === "object" ? l.product_id.product_name : "",
            product_code: typeof l.product_id === "object" ? l.product_id.product_code || "" : "",
            quantity_ordered: String(l.quantity_ordered || 0),
            // The form edits the transaction-currency price. The API keeps the
            // PHP base cost separately in base_unit_cost_php.
            base_unit_cost_php: String(l.unit_price_foreign ?? (currencyCode === "USD"
                ? DecimalValue.from(l.base_unit_cost_php || 0).divideRounded(exchangeRate, 4).toFixed(4)
                : l.base_unit_cost_php)),
            parent_product_id: "",
            selected_uom: l.product_id && typeof l.product_id === "object" && l.product_id.unit_of_measurement ? l.product_id.unit_of_measurement.unit_shortcut : "PCS",
            uom_options: []
            ,purchase_intent: (l as ShipmentLineItem & { purchase_intent?: "MRP_Demand" | "Buffer_Stock" }).purchase_intent || "Buffer_Stock"
            ,job_order_id: String((l as ShipmentLineItem & { job_order_id?: number }).job_order_id || "")
            ,discount_percent: String((l as ShipmentLineItem & { discount_percent?: number }).discount_percent ?? "")
            ,vat_percent: String((l as ShipmentLineItem & { vat_percent?: number }).vat_percent ?? "")
            ,withholding_percent: String((l as ShipmentLineItem & { withholding_percent?: number }).withholding_percent ?? "")
        })));

        setEditingShipmentId(activeShipment.shipment_id);
        setIsModalOpen(true);
    };

    const handleCloseModal = React.useCallback(() => {
        setIsModalOpen(false);
        setEditingShipmentId(null);
        setHasSubmitted(false);
        setShipmentForm({
            reference_number: "",
            supplier_id: "",
            date_received: new Date().toISOString().split("T")[0],
            total_foreign_currency: "",
            exchange_rate: "",
            total_php_value: "",
            status: "Ordered",
            branch_id: null,
            payment_type: null,
            price_type: ""
            ,currency_code: "PHP"
        });
        setLinesForm([]);
    }, [setIsModalOpen, setLinesForm, setShipmentForm]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setHasSubmitted(true);
        
        const firstInvalidLine = linesForm
            .map((line, index) => ({ index, errors: getLineErrors(line) }))
            .find(item => item.errors.length > 0);
        if (firstInvalidLine) {
            toast.error(`Purchase Order Line ${firstInvalidLine.index + 1}: ${firstInvalidLine.errors[0]}.`);
            return;
        }

        if (editingShipmentId) {
            const editSucceeded = await onEditShipment(editingShipmentId, shipmentForm, linesForm);
            if (editSucceeded !== false) {
                setEditingShipmentId(null);
                setIsModalOpen(false);
            }
        } else {
            onCreateShipment(e);
        }
    };

    const [priceTypes, setPriceTypes] = useState<Array<{ price_type_id: number; name: string }>>([]);
    const [priceTypeRatesMap, setPriceTypeRatesMap] = useState<Record<number, number>>({});

    useEffect(() => {
        fetch("/api/manufacturing/finished-goods/price-types")
            .then(res => res.ok ? res.json() : [])
            .then(data => {
                setPriceTypes(data);
            })
            .catch(e => console.error("Error fetching price types:", e));
    }, []);

    useEffect(() => {
        let active = true;
        if (!shipmentForm.price_type || priceTypes.length === 0) {
            setTimeout(() => {
                if (active) setPriceTypeRatesMap({});
            }, 0);
            return () => { active = false; };
        }

        const match = priceTypes.find(pt => pt.name?.toLowerCase() === shipmentForm.price_type?.toLowerCase());
        if (!match) {
            setTimeout(() => {
                if (active) setPriceTypeRatesMap({});
            }, 0);
            return () => { active = false; };
        }

        fetch(`/api/manufacturing/finished-goods/price-types?priceTypeId=${match.price_type_id}`)
            .then(res => res.ok ? res.json() : [])
            .then((data) => {
                if (!active) return;
                const map: Record<number, number> = {};
                (data as { product_id: number | { product_id: number } | null; price: string | number }[]).forEach(item => {
                    const prodId = typeof item.product_id === "object" && item.product_id !== null ? item.product_id.product_id : item.product_id;
                    if (prodId) {
                        map[Number(prodId)] = parseFloat(String(item.price)) || 0;
                    }
                });
                setPriceTypeRatesMap(map);

                // Auto update already added rows in manifest list
                setLinesForm(prev => prev.map(line => {
                    if (!line.product_id) return line;
                    const specialPrice = map[Number(line.product_id)];
                    if (specialPrice !== undefined && specialPrice > 0) {
                        const rate = Number(shipmentForm.exchange_rate) || 1;
                        const transactionPrice = canonicalDrafting && shipmentForm.currency_code === "USD"
                            ? specialPrice / rate
                            : specialPrice;
                        return { ...line, base_unit_cost_php: String(transactionPrice) };
                    }
                    return line;
                }));
            })
            .catch(e => {
                if (active) console.error("Error fetching price type rates:", e);
            });

        return () => { active = false; };
    }, [canonicalDrafting, shipmentForm.currency_code, shipmentForm.exchange_rate, shipmentForm.price_type, priceTypes, setLinesForm]);



    const isFinanceManager = React.useMemo(() => {
        if (typeof window === "undefined" || !isModalOpen) return false;
        const cookieStr = document.cookie;
        const match = cookieStr.match(/vos_access_token=([^;]+)/);
        if (match) {
            try {
                const token = match[1];
                const parts = token.split(".");
                if (parts.length >= 2) {
                    const payload = JSON.parse(window.atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
                    const pos = String(
                        payload.position || 
                        payload.Position || 
                        payload.role || 
                        payload.Role || 
                        payload.user_position || 
                        payload.user_role || 
                        ""
                    ).toLowerCase();
                    
                    return (
                        pos.includes("finance") || 
                        pos.includes("accounting") || 
                        pos.includes("accountant") ||
                        pos.includes("admin") ||
                        pos.includes("manager") ||
                        pos.includes("director")
                    );
                }
            } catch (e) {
                console.error("Failed to parse access token for role identification:", e);
            }
        }
        return false;
    }, [isModalOpen]);

    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (e.altKey && e.key.toLowerCase() === "n") {
                e.preventDefault();
                setIsOverridden(false);
                setHasSubmitted(false);
                setIsModalOpen(true);
            }
            if (e.key === "Escape" && isModalOpen) {
                const activeDropdown = document.querySelector('[data-dropdown-open="true"]');
                if (!activeDropdown) {
                    setIsOverridden(false);
                    handleCloseModal();
                }
            }
        };
        window.addEventListener("keydown", handleGlobalKeyDown);
        return () => window.removeEventListener("keydown", handleGlobalKeyDown);
    }, [handleCloseModal, isModalOpen, setIsModalOpen]);

    const filteredShipments = serverList ? shipments : shipments.filter(s => {
        const poNo = s.purchase_order_no || "";
        const matchesSearch = s.reference_number.toLowerCase().includes(search.toLowerCase()) ||
            poNo.toLowerCase().includes(search.toLowerCase()) ||
            (s.supplier_id && typeof s.supplier_id === "object" && s.supplier_id.supplier_name.toLowerCase().includes(search.toLowerCase()));
        const matchesStatus = statusFilter === "All" || s.status === statusFilter;
        
        return matchesSearch && matchesStatus;
    });

    const totalItems = serverList?.total ?? filteredShipments.length;
    const totalPages = serverList?.totalPages ?? (Math.ceil(totalItems / itemsPerPage) || 1);
    const paginatedShipments = serverList
        ? filteredShipments
        : filteredShipments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const activeShipment = selectedShipment || null;
    const hasListFilters = Boolean(search.trim() || statusFilter !== "All");

    const supplierRawMaterials = React.useMemo(() => {
        if (!shipmentForm.supplier_id) return [];
        
        // Extract all valid linked product IDs
        const linkedIds = supplierLinkedProducts
            .map(lp => {
                if (typeof lp.product_id === "object" && lp.product_id !== null) {
                    return Number((lp.product_id as { product_id?: number; id?: number }).product_id || (lp.product_id as { product_id?: number; id?: number }).id);
                } else if (lp.product_id) {
                    return Number(lp.product_id);
                }
                return null;
            })
            .filter((id): id is number => id !== null && !isNaN(id));

        // Legacy screens retain their historical fallback; canonical PO drafting fails closed.
        if (linkedIds.length === 0) {
            return canonicalDrafting ? [] : rawMaterials;
        }

        return rawMaterials.filter(rm => {
            const rmId = Number(rm.product_id);
            const rmParentId = rm.parent_id ? Number(rm.parent_id) : null;
            return linkedIds.includes(rmId) || (rmParentId !== null && linkedIds.includes(rmParentId));
        });
    }, [canonicalDrafting, rawMaterials, shipmentForm.supplier_id, supplierLinkedProducts]);

    const totalPhpValue = React.useMemo(() => {
        return linesForm.reduce((acc, curr) => {
            return acc.add(DecimalValue.from(curr.quantity_ordered || 0).multiply(curr.base_unit_cost_php || 0));
        }, DecimalValue.from(0)).toFixed(2);
    }, [linesForm]);

    const totalUsdValue = React.useMemo(() => {
        try {
            const rate = DecimalValue.from(shipmentForm.exchange_rate || 0);
            if (rate.compare(0) <= 0) return "0.00";
            return DecimalValue.from(totalPhpValue).divideRounded(rate, 2).toFixed(2);
        } catch {
            return "0.00";
        }
    }, [totalPhpValue, shipmentForm.exchange_rate]);

    const draftSummary = React.useMemo(() => {
        const exchangeRate = DecimalValue.from(shipmentForm.exchange_rate || 0);
        return linesForm.reduce((summary, line) => {
            const grossForeign = DecimalValue.from(line.quantity_ordered || 0).multiply(line.base_unit_cost_php || 0).toFixed(2);
            const discountForeign = DecimalValue.from(grossForeign).multiply(line.discount_percent || 0).divideRounded(100, 2).toFixed(2);
            const subtotalForeign = DecimalValue.from(grossForeign).subtract(discountForeign).toFixed(2);
            const vatForeign = DecimalValue.from(subtotalForeign).multiply(line.vat_percent || 0).divideRounded(100, 2).toFixed(2);
            const withholdingForeign = DecimalValue.from(subtotalForeign).multiply(line.withholding_percent || 0).divideRounded(100, 2).toFixed(2);
            const netForeign = DecimalValue.from(subtotalForeign).add(vatForeign).subtract(withholdingForeign).toFixed(2);
            return {
                grossPhp: DecimalValue.from(summary.grossPhp).add(DecimalValue.from(grossForeign).multiply(exchangeRate)).toFixed(2),
                discountPhp: DecimalValue.from(summary.discountPhp).add(DecimalValue.from(discountForeign).multiply(exchangeRate)).toFixed(2),
                vatPhp: DecimalValue.from(summary.vatPhp).add(DecimalValue.from(vatForeign).multiply(exchangeRate)).toFixed(2),
                withholdingPhp: DecimalValue.from(summary.withholdingPhp).add(DecimalValue.from(withholdingForeign).multiply(exchangeRate)).toFixed(2),
                netPhp: DecimalValue.from(summary.netPhp).add(DecimalValue.from(netForeign).multiply(exchangeRate)).toFixed(2),
                netForeign: DecimalValue.from(summary.netForeign).add(netForeign).toFixed(2)
            };
        }, { grossPhp: "0.00", discountPhp: "0.00", vatPhp: "0.00", withholdingPhp: "0.00", netPhp: "0.00", netForeign: "0.00" });
    }, [linesForm, shipmentForm.exchange_rate]);

    const handleAddLineForm = () => {
        setLinesForm([...linesForm, {
            parent_product_id: "", product_id: "", quantity_ordered: "", base_unit_cost_php: "",
            purchase_intent: "Buffer_Stock", job_order_id: "", discount_percent: "", vat_percent: "", withholding_percent: ""
        }]);
    };

    const handleRemoveLineForm = (index: number) => {
        const copy = [...linesForm];
        copy.splice(index, 1);
        setLinesForm(copy);
    };

    const handleLineFormChange = (index: number, fieldOrObject: string | Record<string, unknown>, value?: unknown) => {
        const copy = [...linesForm];
        if (typeof fieldOrObject === "object" && fieldOrObject !== null) {
            copy[index] = { ...copy[index], ...fieldOrObject } as ManifestLineFormItem;
        } else {
            copy[index] = { ...copy[index], [fieldOrObject]: value } as ManifestLineFormItem;
        }
        setLinesForm(copy);
    };

    const getLineErrors = (line: ManifestLineFormItem) => {
        const errors: string[] = [];
        const quantity = Number(line.quantity_ordered);
        const unitPrice = line.base_unit_cost_php;
        const discount = Number(line.discount_percent || 0);
        const vat = Number(line.vat_percent || 0);
        const withholding = Number(line.withholding_percent || 0);

        if (!line.product_id) errors.push("Raw Product Name is required");
        if (!Number.isInteger(quantity) || quantity <= 0) errors.push("Quantity must be a positive whole number");
        if (line.base_unit_cost_php === "" || !isNonNegativeDecimal(unitPrice)) errors.push("FOB Unit Cost must be a non-negative number");
        if (!Number.isFinite(discount) || discount < 0 || discount > 100) errors.push("Discount must be between 0 and 100");
        if (!Number.isFinite(vat) || vat < 0 || vat > 100) errors.push("VAT must be between 0 and 100");
        if (!Number.isFinite(withholding) || withholding < 0 || withholding > 100) errors.push("Withholding must be between 0 and 100");
        if (line.purchase_intent === "MRP_Demand" && (!Number.isInteger(Number(line.job_order_id)) || Number(line.job_order_id) <= 0)) {
            errors.push("Job Order is required for MRP Demand");
        }
        if (line.purchase_intent === "Buffer_Stock" && line.job_order_id) errors.push("Remove the Job Order for Buffer Stock");
        return errors;
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "Pending":
                return <span className="bg-amber-500/10 text-amber-700 border border-amber-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase">Pending</span>;
            case "Requested":
                return <span className="bg-blue-500/10 text-blue-600 border border-blue-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase">Requested</span>;
            case "Ordered":
                return <span className="bg-blue-500/10 text-blue-600 border border-blue-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase">{canonicalDrafting ? "Requested" : "Ordered"}</span>;
            case "Approved":
                return <span className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase">Approved</span>;
            case "Awaiting Payment":
                return <span className="bg-orange-500/10 text-orange-700 border border-orange-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase">Awaiting Payment</span>;
            case "Cancelled":
                return <span className="bg-zinc-500/10 text-zinc-600 border border-zinc-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase">Cancelled</span>;
            case "For Pickup":
                return <span className="bg-cyan-500/10 text-cyan-700 border border-cyan-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase">For Pickup</span>;
            case "En Route":
                return <span className="bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase">En Route</span>;
            case "Receiving (QA)":
                return <span className="bg-purple-500/10 text-purple-600 border border-purple-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase">Receiving (QA)</span>;
            case "Partially Received":
                return <span className="bg-purple-500/10 text-purple-600 border border-purple-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase">Partially Received</span>;
            case "Received":
                return <span className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase">Received</span>;
            case "Rejected":
                return <span className="bg-red-500/10 text-red-600 border border-red-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase">Rejected</span>;
            default:
                return <span className="bg-muted text-muted-foreground border px-2 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase">{status}</span>;
        }
    };

    const displayShipmentStatus = (shipment: Pick<IncomingShipment, "status" | "inventory_status" | "payment_status">) => {
        if (Number(shipment.inventory_status) === INVENTORY_STATUS.FOR_PICKUP) return "Receiving (QA)";
        if (shipment.status !== "Awaiting Payment") return shipment.status;
        if (Number(shipment.inventory_status) !== INVENTORY_STATUS.APPROVED) return "Pending";
        return Number(shipment.payment_status) === PAYMENT_STATUS.AWAITING_PAYMENT ? "Approved" : shipment.status;
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6 h-full min-h-0">
            {/* Left Column: Shipments list */}
            <div className="w-full lg:w-2/5 flex flex-col border rounded-xl bg-card overflow-hidden shadow-sm">
                <div className="p-4 border-b space-y-3 shrink-0 bg-muted/20">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5 min-w-0">
                            <Anchor className="h-4 w-4 text-primary shrink-0" />
                            <span className="truncate">Procurement Registry</span>
                            <span className="text-[10px] text-muted-foreground shrink-0">({totalItems})</span>
                        </h3>
                         <button
                             onClick={() => { setIsOverridden(false); setHasSubmitted(false); setIsModalOpen(true); }}
                            className="inline-flex items-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-2.5 py-1.5 rounded-lg text-xs transition-all shadow-sm shrink-0 cursor-pointer"
                        >
                            <Plus className="h-3.5 w-3.5" /> {canonicalDrafting ? "Create PO" : "Log Cargo"}
                        </button>
                    </div>                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search BL/Reference, Supplier..."
                                value={search}
                                onChange={e => {
                                    setSearch(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="w-full pl-9 pr-8 py-2 border rounded-lg text-xs bg-background outline-none focus:ring-1 focus:ring-primary font-medium h-9"
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch("")}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 transition-colors hover:bg-muted rounded"
                                    title="Clear Search"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            )}
                        </div>
                        <select
                            value={statusFilter}
                            onChange={e => {
                                setStatusFilter(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="rounded-lg border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary font-semibold text-foreground h-9 w-32"
                        >
                            <option value="All">All Statuses</option>
                            <option value={canonicalDrafting ? "Requested" : "Ordered"}>{canonicalDrafting ? "Requested" : "Ordered"}</option>
                            <option value="Approved">Approved</option>
                            <option value="Awaiting Payment">Awaiting Payment</option>
                            <option value="Cancelled">Cancelled</option>
                            <option value="For Pickup">For Pickup</option>
                            <option value="En Route">En Route</option>
                            <option value="Receiving (QA)">Receiving (QA)</option>
                            <option value="Partially Received">Partially Received</option>
                            <option value="Received">Received</option>
                            <option value="Rejected">Rejected</option>
                        </select>
                    </div>
                </div>

                <div className="relative flex-1 overflow-y-auto divide-y">
                    {listLoading ? (
                        <div className="space-y-3 p-4" aria-label="Loading purchase orders" role="status">
                            {Array.from({ length: 4 }).map((_, index) => (
                                <div key={index} className="animate-pulse space-y-2 rounded-lg border p-3">
                                    <div className="h-3 w-3/5 rounded bg-muted" />
                                    <div className="h-3 w-4/5 rounded bg-muted" />
                                    <div className="h-2 w-2/5 rounded bg-muted" />
                                </div>
                            ))}
                        </div>
                    ) : paginatedShipments.length === 0 ? (
                        <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-8 text-center text-xs text-muted-foreground">
                            <Search className="h-8 w-8 text-muted-foreground/30" />
                            <p className="font-semibold">
                                {hasListFilters
                                    ? "No purchase orders match the current filters."
                                    : canonicalDrafting ? "No purchase orders found yet." : "No shipments logged yet."}
                            </p>
                            {hasListFilters ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearch("");
                                        setStatusFilter("All");
                                        setCurrentPage(1);
                                    }}
                                    className="text-primary font-semibold hover:underline"
                                >
                                    Clear filters
                                </button>
                            ) : (
                                <p className="text-[11px]">{canonicalDrafting ? "Click Create PO to add one." : "Click Log Cargo to add one."}</p>
                            )}
                        </div>
                    ) : (
                        paginatedShipments.map(s => {
                            const matchedSupplier = typeof s.supplier_id !== "object"
                                ? suppliers.find(sup => sup.id === Number(s.supplier_id))
                                : s.supplier_id;
                            const supName = matchedSupplier ? matchedSupplier.supplier_name : `Supplier ID: ${s.supplier_id}`;
                            return (
                                <button
                                    key={s.shipment_id}
                                    onClick={() => setSelectedShipment(s)}
                                    aria-current={activeShipment?.shipment_id === s.shipment_id ? "true" : undefined}
                                    className={`w-full text-left p-4 hover:bg-muted/40 transition-all flex flex-col gap-2 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.03)] focus:bg-primary/5 active:translate-y-0 ${
                                        activeShipment?.shipment_id === s.shipment_id ? "bg-primary/5 border-l-2 border-primary" : ""
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <span className="font-bold text-xs text-foreground truncate">{canonicalDrafting ? `PO: ${s.purchase_order_no || s.reference_number}` : `BL/PO: ${s.reference_number}`}</span>
                                        {getStatusBadge(displayShipmentStatus(s))}
                                    </div>
                                    <div className="flex items-center justify-between text-[11px] text-muted-foreground font-semibold">
                                        <span>{supName}</span>
                                        <span className="font-mono">{formatMoney(s.total_php_value)}</span>
                                    </div>
                                    <div className="text-[10px] text-muted-foreground flex justify-between">
                                        <span>{s.created_at ? `Created: ${new Date(s.created_at).toLocaleDateString()}` : "Purchase order"}</span>
                                        <span>
                                            {s.status === "Received" 
                                                ? `Received: ${s.date_received ? new Date(s.date_received).toLocaleDateString() : "N/A"}` 
                                                : `ETA: ${s.lead_time_receiving ? new Date(s.lead_time_receiving).toLocaleDateString() : "Pending"}`}
                                        </span>
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>

                {/* Pagination Controls */}
                {totalItems > 0 && (
                    <div className="p-3 border-t bg-muted/10 flex items-center justify-between gap-2 shrink-0">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                            <span>Show</span>
                            <select
                                value={itemsPerPage}
                                onChange={e => {
                                    setItemsPerPage(Number(e.target.value));
                                    setCurrentPage(1);
                                }}
                                className="rounded border bg-background px-1.5 py-0.5 outline-none font-semibold text-foreground focus:ring-1 focus:ring-primary text-[11px]"
                            >
                                <option value={5}>5</option>
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                            </select>
                        </div>
                        {totalPages > 1 && (
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    className="px-2 py-1 border rounded text-xs font-semibold hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    Prev
                                </button>
                                <span className="text-[11px] text-muted-foreground font-semibold">
                                    Page {currentPage} / {totalPages}
                                </span>
                                <button
                                    type="button"
                                    disabled={currentPage === totalPages}
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    className="px-2 py-1 border rounded text-xs font-semibold hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    Next
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Right Column: Detailed shipment & cargo view */}
            <div className="flex-1 border rounded-xl bg-card overflow-y-auto p-6 shadow-sm flex flex-col gap-6 relative min-h-[300px]">
                {loading && (
                    <div className="absolute inset-0 bg-background/40 backdrop-blur-[2px] z-50 flex items-center justify-center rounded-xl">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                )}
                {activeShipment ? (
                    <>
                        {/* Header Details */}
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b pb-5">
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-base font-extrabold text-foreground leading-tight">{canonicalDrafting ? `Purchase Order: ${activeShipment.purchase_order_no || activeShipment.reference_number}` : `Cargo Invoice / BL: ${activeShipment.reference_number}`}</h2>
                                    {getStatusBadge(displayShipmentStatus(activeShipment))}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Supplier Source:{" "}
                                    <strong className="text-foreground font-semibold">
                                        {(() => {
                                            const matchedSupplier = typeof activeShipment.supplier_id !== "object"
                                                ? suppliers.find(sup => sup.id === Number(activeShipment.supplier_id))
                                                : activeShipment.supplier_id;
                                            return matchedSupplier ? matchedSupplier.supplier_name : `ID: ${activeShipment.supplier_id}`;
                                        })()}
                                    </strong>
                                </p>
                                {activeShipment.status === "Rejected" && activeShipment.remark && (
                                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                        <strong>Rejection reason:</strong>{" "}{activeShipment.remark.replace(/^REJECTED:\s*/i, "")}
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs mt-2.5 text-muted-foreground bg-muted/40 border p-3 rounded-lg max-w-fit font-sans">
                                    <span>
                                        Destination Branch:{" "}
                                        <strong className="text-foreground font-bold">
                                            {(() => {
                                                const branchId = (activeShipment as IncomingShipment & { branch_id?: number | null }).branch_id;
                                                switch (Number(branchId)) {
                                                    case 183: return "Main Branch";
                                                    case 163: return "Urdaneta Branch";
                                                    case 181: return "Bihon Branch";
                                                    case 182: return "Bihon Bad Branch";
                                                    default: return branchId ? `Branch #${branchId}` : "Unassigned Branch";
                                                }
                                            })()}
                                        </strong>
                                    </span>
                                    <span className="hidden sm:inline text-muted-foreground/30 font-light">|</span>
                                    <span>
                                        Payment Type:{" "}
                                        <strong className="text-foreground font-bold">
                                            {(() => {
                                                const payType = (activeShipment as IncomingShipment & { payment_type?: number | null }).payment_type;
                                                switch (Number(payType)) {
                                                    case 1: return "Advance Payment";
                                                    case 2: return "Partial Payment";
                                                    case 3: return "Full Payment";
                                                    case 4: return "Refund";
                                                    case 5: return "Installment";
                                                    default: return payType ? `Payment Type #${payType}` : "N/A";
                                                }
                                            })()}
                                        </strong>
                                    </span>
                                    <span className="hidden sm:inline text-muted-foreground/30 font-light">|</span>
                                    <span>
                                        Price Type:{" "}
                                        <strong className="text-foreground font-bold">
                                            {(activeShipment as IncomingShipment & { price_type?: string | null }).price_type || "Standard"}
                                        </strong>
                                    </span>
                                </div>
                                {/* Status Progress Stepper (Read-Only) */}
                                <div className="mt-4 border bg-muted/20 rounded-xl p-4 space-y-3">
                                    <div className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block">{canonicalDrafting ? "Purchase Order Workflow Progress" : "Shipment Life Cycle Progress"}</div>
                                    <div className="flex items-center w-full relative">
                                        {(activeShipment.status === "Rejected"
                                            ? ["Requested", "Approved", "Rejected"]
                                            : ["Requested", "Approved", "En Route", "Receiving (QA)", "Received"]
                                        ).map((st, idx, arr) => {
                                            const statuses = arr;
                                            const currentStatus = activeShipment.status === "Requested" || activeShipment.status === "Ordered"
                                                ? "Requested"
                                                : activeShipment.status === "For Pickup" || activeShipment.status === "Partially Received"
                                                ? "Receiving (QA)"
                                                : activeShipment.status === "Awaiting Payment"
                                                ? (Number(activeShipment.inventory_status) === INVENTORY_STATUS.APPROVED ? "Approved" : "Requested")
                                                : activeShipment.status;
                                            const currentIdx = statuses.indexOf(currentStatus);
                                            const stepIdx = statuses.indexOf(st);
                                            
                                            const isCompleted = stepIdx < currentIdx;
                                            const isActive = stepIdx === currentIdx;
                                            
                                            return (
                                                <React.Fragment key={st}>
                                                    <div className="flex flex-col items-center flex-1 relative z-10">
                                                        <div className={`h-6 w-6 rounded-full flex items-center justify-center border-2 text-[10px] font-bold transition-all ${
                                                            isCompleted 
                                                                ? "bg-emerald-500 border-emerald-500 text-emerald-foreground" 
                                                                : isActive 
                                                                    ? "bg-primary border-primary text-primary-foreground shadow-md scale-110" 
                                                                    : "bg-background border-muted text-muted-foreground"
                                                        }`}>
                                                            {isCompleted ? "✓" : idx + 1}
                                                        </div>
                                                        <span className={`text-[9px] font-bold mt-1.5 truncate max-w-[70px] ${
                                                            isActive ? "text-primary animate-pulse" : "text-muted-foreground"
                          }`}>{st}</span>
                                                    </div>
                                                    {idx < arr.length - 1 && (
                                                        <div className={`flex-1 h-[2px] -mt-4 transition-all ${
                                                            stepIdx < currentIdx ? "bg-emerald-500" : "bg-muted"
                                                        }`} />
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </div>

                                    {/* Explicit Action Buttons for status turnover */}
                                    {(activeShipment.status === "Approved" || activeShipment.status === "Awaiting Payment") && Number(activeShipment.inventory_status) === INVENTORY_STATUS.APPROVED && (
                                        <button
                                            type="button"
                                            disabled={statusLoading !== null}
                                            onClick={() => {
                                                setStatusLoading("en-route");
                                                onUpdateShipmentStatus(activeShipment.shipment_id, "En Route");
                                                setTimeout(() => setStatusLoading(null), 3000);
                                            }}
                                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-wait text-white font-bold py-2 px-3 rounded-lg text-xs transition-all shadow-sm cursor-pointer mt-3 inline-flex items-center justify-center gap-1.5"
                                        >
                                            {statusLoading === "en-route" ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing...</> : "Dispatch Cargo (Mark En Route)"}
                                        </button>
                                    )}

                                    {(activeShipment.status === "Requested" || activeShipment.status === "Ordered") && (
                                        <div className="grid grid-cols-2 gap-2 mt-3">
                                            <button
                                                type="button"
                                                onClick={handleStartEdit}
                                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-3 rounded-lg text-xs transition-all shadow-sm cursor-pointer inline-flex items-center justify-center gap-1.5"
                                            >
                                                Edit Purchase Order
                                            </button>
                                            {canonicalDrafting && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (window.confirm("Cancel this Requested purchase order? This action cannot be undone.")) {
                                                            onUpdateShipmentStatus(activeShipment.shipment_id, "Cancelled");
                                                        }
                                                    }}
                                                    className="w-full border border-red-500/30 bg-red-500/10 text-red-700 hover:bg-red-500/20 font-bold py-2.5 px-3 rounded-lg text-xs transition-all"
                                                >
                                                    Cancel PO
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {activeShipment.status === "Rejected" && onCancelRejectedPurchaseOrder && (
                                        <div className="grid grid-cols-2 gap-2 mt-3">
                                            <button
                                                type="button"
                                                disabled={loading}
                                                onClick={handleStartEdit}
                                                className="w-full bg-blue-600 hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60 text-white font-bold py-2.5 px-3 rounded-lg text-xs transition-all shadow-sm cursor-pointer inline-flex items-center justify-center gap-1.5"
                                            >
                                                <Edit className="h-3.5 w-3.5" /> Revise &amp; Resubmit
                                            </button>
                                            <button
                                                type="button"
                                                disabled={loading}
                                                onClick={() => {
                                                    if (window.confirm("Cancel this rejected purchase order? This action cannot be undone.")) {
                                                        onCancelRejectedPurchaseOrder(
                                                            activeShipment.shipment_id,
                                                            Number(activeShipment.workflow_revision || 0),
                                                            "Purchase order cancelled after rejection."
                                                        );
                                                    }
                                                }}
                                                className="w-full border border-red-500/30 bg-red-500/10 text-red-700 hover:bg-red-500/20 disabled:cursor-wait disabled:opacity-60 font-bold py-2.5 px-3 rounded-lg text-xs transition-all inline-flex items-center justify-center gap-1.5"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" /> Cancel PO
                                            </button>
                                        </div>
                                    )}

                                    {activeShipment.status === "En Route" && (
                                        <button
                                            type="button"
                                            disabled={statusLoading !== null}
                                            onClick={() => {
                                                setStatusLoading("arrived");
                                                onUpdateShipmentStatus(activeShipment.shipment_id, "Receiving (QA)");
                                                setTimeout(() => setStatusLoading(null), 3000);
                                            }}
                                            className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-60 disabled:cursor-wait text-white font-bold py-2 px-3 rounded-lg text-xs transition-all shadow-sm cursor-pointer mt-3 inline-flex items-center justify-center gap-1.5"
                                        >
                                            {statusLoading === "arrived" ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing...</> : "Mark Cargo as Arrived (Proceed to QA Checklist)"}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Totals Summary */}
                        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
                            <div className="border p-4 rounded-xl bg-muted/5 space-y-1">
                                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">{canonicalDrafting ? "Net Total" : "Raw FOB Cost"}</span>
                                <span className="text-xs font-extrabold text-foreground">
                                    {formatMoney(activeShipment.total_php_value)}
                                </span>
                            </div>
                            <div className="border p-4 rounded-xl bg-muted/5 space-y-1">
                                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">Foreign Currency</span>
                                <span className="text-xs font-extrabold text-foreground">
                                    {formatMoney(activeShipment.total_foreign_currency, activeShipment.currency_code || "PHP")}
                                </span>
                            </div>
                            <div className="border p-4 rounded-xl bg-muted/5 space-y-1">
                                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">Exchange Rate</span>
                                <span className="text-xs font-extrabold text-foreground">{formatMoney(activeShipment.exchange_rate)}</span>
                            </div>
                            <div className="border p-4 rounded-xl bg-muted/5 space-y-1">
                                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">
                                    {activeShipment.status === "Received" ? "Arrival Date" : "ETA / Expected"}
                                </span>
                                <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                                    <Calendar className="h-3.5 w-3.5 text-primary" />
                                    {activeShipment.status === "Received"
                                        ? (activeShipment.date_received && activeShipment.date_received !== "1970-01-01" 
                                            ? new Date(activeShipment.date_received).toLocaleDateString() 
                                            : "N/A")
                                        : (activeShipment.lead_time_receiving 
                                            ? new Date(activeShipment.lead_time_receiving).toLocaleDateString() 
                                            : "Pending")}
                                </span>
                            </div>
                        </div>

                        {activeShipment.remark && activeShipment.remark.startsWith("REJECTED:") && (
                            <div className="bg-red-500/5 border border-red-500/10 p-3.5 rounded-xl text-left space-y-1">
                                <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider block">Rejection Reason / Remarks</span>
                                <span className="text-xs font-semibold text-red-700 leading-relaxed block whitespace-pre-wrap">{activeShipment.remark.replace("REJECTED:", "").trim()}</span>
                            </div>
                        )}

                        {/* Shipment Cargo Lines List */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 border-b pb-2">
                                <Layers className="h-4 w-4 text-primary" />
                                {canonicalDrafting ? "Purchase Order Lines" : "Shipment Manifest & Contents"}
                            </h3>
                            <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                        <tr className="bg-muted/50 border-b">
                                            <th className="p-3 font-semibold text-muted-foreground">Product Name</th>
                                            <th className="p-3 font-semibold text-muted-foreground">UOM</th>
                                            <th className="p-3 font-semibold text-muted-foreground text-right">Qty</th>
                                            <th className="p-3 font-semibold text-muted-foreground text-right">Unit Price</th>
                                            <th className="p-3 font-semibold text-muted-foreground text-right">ImpFreight Cost</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {lines.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="p-8 text-center text-muted-foreground">
                                                    No items registered in this container.
                                                </td>
                                            </tr>
                                        ) : (
                                            lines.map(line => {
                                                const prod = line.product_id && typeof line.product_id === "object"
                                                    ? line.product_id
                                                    : { product_name: `ID: ${line.product_id}`, product_code: "N/A", unit_of_measurement: { unit_shortcut: "PCS" } };
                                                return (
                                                    <tr key={line.line_id} className="hover:bg-muted/20">
                                                        <td className="p-3">
                                                            <div className="font-semibold text-foreground">{prod.product_name}</div>
                                                            <div className="text-[10px] text-muted-foreground font-mono">Code: {prod.product_code}</div>
                                                        </td>
                                                        <td className="p-3 text-muted-foreground font-semibold">
                                                            {prod.unit_of_measurement?.unit_shortcut || "PCS"}
                                                        </td>
                                                        <td className="p-3 text-right">
                                                            <div className="font-semibold text-foreground">
                                                                {line.quantity_received !== null && line.quantity_received !== undefined ? (
                                                                    `${Number(line.quantity_received).toLocaleString()} / ${Number(line.quantity_ordered || 0).toLocaleString()}`
                                                                ) : (
                                                                    `${Number(line.quantity_ordered || 0).toLocaleString()} (Ordered)`
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="p-3 text-right font-mono text-[11px]">
                                                            {formatMoney(line.base_unit_cost_php, "PHP", UNIT_PRICE_DECIMAL_SCALE)}
                                                        </td>
                                                        <td className="p-3 text-right font-mono text-[11px] text-muted-foreground">
                                                            +{formatMoney(line.allocated_expense_php || 0)}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Informative Note */}
                        {activeShipment.status !== "Received" && (
                            <div className="flex items-start gap-2.5 bg-blue-500/5 border border-blue-500/10 p-4 rounded-xl">
                                <Info className="h-4.5 w-4.5 text-blue-500 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <h5 className="text-xs font-bold text-blue-800 dark:text-blue-300">Pending Landed Cost Recalculation</h5>
                                     <p className="text-[11px] text-muted-foreground leading-relaxed">
                                         This cargo is currently marked as <strong className="text-foreground">{activeShipment.status}</strong>. Custom duties, ARR, brokerages, and shipping lines must be added/allocated. Marking this shipment as <strong>Received</strong> will commit the computed landed costs to the raw inventory database to update standard BOM prices.
                                     </p>
                                 </div>
                             </div>
                         )}
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center p-20 text-center text-muted-foreground h-full">
                        <Anchor className="h-16 w-16 mb-4 text-muted-foreground/30" />
                        {filteredShipments.length > 0 ? "Select a shipment from the list to view details." : "No incoming shipments logged."}
                    </div>
                )}
            </div>

            {/* Modal to Log Shipment Cargo */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
                    <div
                        ref={modalRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="purchase-order-dialog-title"
                        tabIndex={-1}
                        className={`bg-card text-foreground w-full ${canonicalDrafting ? "max-w-6xl" : "max-w-2xl"} border rounded-xl shadow-lg p-6 space-y-4 max-h-[90vh] flex flex-col`}
                    >
                        <div className="flex items-center justify-between border-b pb-3 shrink-0">
                            <h3 id="purchase-order-dialog-title" className="font-bold text-sm flex items-center gap-2">
                                <Anchor className="h-4.5 w-4.5 text-primary" />
                                {editingShipmentId
                                    ? activeShipment?.status === "Rejected" ? "Revise Rejected Purchase Order" : "Edit Requested Purchase Order"
                                    : canonicalDrafting ? "Create Purchase Order" : "Log Incoming Cargo & PO Line Items"}
                            </h3>
                            <button
                                onClick={handleCloseModal}
                                type="button"
                                aria-label="Close dialog"
                                title="Close dialog"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
                            <div className="space-y-4 overflow-y-auto pr-1 flex-1 pb-4">
                            <div className="border-b pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Purchase Order Details
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-semibold text-muted-foreground">{canonicalDrafting ? "PO Number" : "PO / Bill of Lading Number *"}</label>
                                    <input
                                        type="text"
                                        required={!canonicalDrafting}
                                        readOnly={canonicalDrafting}
                                        placeholder={canonicalDrafting ? "Assigned on submission" : "e.g. BL-NABATI-2026-004"}
                                        value={canonicalDrafting ? (editingShipmentId ? activeShipment?.purchase_order_no || "" : "") : shipmentForm.reference_number}
                                        onChange={e => setShipmentForm({...shipmentForm, reference_number: e.target.value})}
                                        className={`w-full rounded-lg border px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary ${canonicalDrafting ? "bg-muted text-muted-foreground" : "bg-background"}`}
                                    />
                                </div>

                                {canonicalDrafting && (
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-semibold text-muted-foreground">External Reference (optional)</label>
                                        <input
                                            type="text"
                                            maxLength={255}
                                            placeholder="Supplier quote, request, or logistics reference"
                                            value={shipmentForm.reference_number}
                                            onChange={e => setShipmentForm({...shipmentForm, reference_number: e.target.value})}
                                            className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                                        />
                                    </div>
                                )}

                                <div className="space-y-1.5 flex flex-col">
                                    <label className="text-[11px] font-semibold text-muted-foreground">Supplier *</label>
                                    <CreatableSelect
                                        options={suppliers.map(s => ({ value: String(s.id), label: s.supplier_name }))}
                                        value={String(shipmentForm.supplier_id)}
                                        onValueChange={(val) => setShipmentForm({...shipmentForm, supplier_id: val})}
                                        placeholder="Select Supplier..."
                                        className="h-9 text-xs w-full bg-background font-semibold"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[11px] font-semibold text-muted-foreground">Exchange Rate to PHP</label>
                                        {canonicalDrafting ? (
                                            <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                                                {editingShipmentId ? "Locked" : "Locks on submission"}
                                            </span>
                                        ) : isFinanceManager ? (
                                            <label className="flex items-center gap-1 text-[10px] text-primary cursor-pointer select-none font-semibold">
                                                <input 
                                                    type="checkbox" 
                                                    checked={isOverridden}
                                                    onChange={e => setIsOverridden(e.target.checked)}
                                                    className="rounded border"
                                                />
                                                Override Rate
                                            </label>
                                        ) : (
                                            <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                                                Locked (Standard)
                                            </span>
                                        )}
                                    </div>
                                    <input
                                        type="number"
                                        step="0.0001"
                                        readOnly={canonicalDrafting ? shipmentForm.currency_code === "PHP" || Boolean(editingShipmentId) : !isOverridden || !isFinanceManager}
                                        value={String(shipmentForm.exchange_rate)}
                                        onChange={e => setShipmentForm({...shipmentForm, exchange_rate: e.target.value})}
                                        className={`w-full rounded-lg border px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-mono font-semibold ${
                                            (canonicalDrafting
                                                ? shipmentForm.currency_code === "PHP" || Boolean(editingShipmentId)
                                                : !isOverridden || !isFinanceManager)
                                                ? "bg-muted text-muted-foreground cursor-not-allowed"
                                                : "bg-background text-foreground"
                                        }`}
                                    />
                                    {!canonicalDrafting && isOverridden && isFinanceManager && (
                                        <p className="text-[10px] text-amber-600 font-semibold mt-1 flex items-start gap-1">
                                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                            Warning: You are overriding the standard Customs FX Rate. This may affect standard landed cost calculations.
                                        </p>
                                    )}
                                </div>

                                {canonicalDrafting && (
                                    <div className="space-y-1.5 flex flex-col">
                                        <label className="text-[11px] font-semibold text-muted-foreground">Currency *</label>
                                        <select
                                            value={shipmentForm.currency_code || "PHP"}
                                            disabled={Boolean(editingShipmentId)}
                                            onChange={event => {
                                                const currency = event.target.value as "PHP" | "USD";
                                                const savedRate = typeof window === "undefined" ? "" : localStorage.getItem("vos_locked_forex_rate") || "";
                                                setShipmentForm({ ...shipmentForm, currency_code: currency, exchange_rate: currency === "PHP" ? "1" : savedRate });
                                            }}
                                            className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-semibold h-9 disabled:bg-muted"
                                        >
                                            <option value="PHP">PHP - Philippine Peso</option>
                                            <option value="USD">USD - US Dollar</option>
                                        </select>
                                    </div>
                                )}

                                <div className="space-y-1.5 flex flex-col">
                                    <label className="text-[11px] font-semibold text-muted-foreground">Destination Branch *</label>
                                    <select
                                        value={shipmentForm.branch_id ? String(shipmentForm.branch_id) : ""}
                                        onChange={e => setShipmentForm({...shipmentForm, branch_id: e.target.value ? parseInt(e.target.value) : null})}
                                        className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-semibold text-foreground h-9"
                                    >
                                        <option value="" disabled hidden>Select Destination Branch...</option>
                                        <option value={183}>Main Branch</option>
                                        <option value={163}>Urdaneta Branch</option>
                                        <option value={181}>Bihon Branch</option>
                                        <option value={182}>Bihon Bad Branch</option>
                                    </select>
                                </div>

                                <div className="space-y-1.5 flex flex-col">
                                    <label className="text-[11px] font-semibold text-muted-foreground">Payment Type *</label>
                                    <select
                                        value={shipmentForm.payment_type !== null ? String(shipmentForm.payment_type) : ""}
                                        onChange={e => setShipmentForm({...shipmentForm, payment_type: e.target.value ? parseInt(e.target.value) : null})}
                                        className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-semibold text-foreground h-9"
                                    >
                                        <option value="" disabled hidden>Select Payment Type...</option>
                                        <option value={3}>Full Payment</option>
                                        <option value={1}>Advance Payment</option>
                                        <option value={2}>Partial Payment</option>
                                        <option value={4}>Refund</option>
                                        <option value={5}>Installment</option>
                                    </select>
                                </div>

                                <div className="space-y-1.5 flex flex-col">
                                    <label className="text-[11px] font-semibold text-muted-foreground">Price Type *</label>
                                    <select
                                        value={shipmentForm.price_type || ""}
                                        onChange={e => setShipmentForm({...shipmentForm, price_type: e.target.value || null})}
                                        className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-semibold text-foreground h-9"
                                    >
                                        <option value="" disabled hidden>Select Price Type...</option>
                                        <option value="Internal">Internal</option>
                                        <option value="SRP">SRP</option>
                                        <option value="Government">Government</option>
                                        <option value="Dealer">Dealer</option>
                                        <option value="Sub-Dealer">Sub-Dealer</option>
                                        <option value="Project">Project</option>
                                    </select>
                                </div>

                                {!canonicalDrafting && <div className="space-y-1.5 col-span-2">
                                    <label className="text-[11px] font-semibold text-muted-foreground">Receive Date / ETA *</label>
                                    <input
                                        type="date"
                                        required
                                        value={shipmentForm.date_received || ""}
                                        onChange={e => setShipmentForm({...shipmentForm, date_received: e.target.value})}
                                        className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-semibold text-foreground text-left"
                                    />
                                </div>}
                            </div>

                            {/* Cargo Manifest builder */}
                            <div className="space-y-3 pt-3 border-t">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{canonicalDrafting ? "Purchase Order Lines" : "Cargo Manifest Contents"}</h4>
                                    {shipmentForm.supplier_id && (
                                        <button
                                            type="button"
                                            onClick={handleAddLineForm}
                                            className="inline-flex items-center gap-1 text-primary hover:text-primary/80 text-xs font-semibold"
                                        >
                                            <Plus className="h-3.5 w-3.5" /> Add Row
                                        </button>
                                    )}
                                </div>

                                {!shipmentForm.supplier_id ? (
                                    <div className="p-4 rounded-xl border bg-amber-500/5 border-amber-500/10 text-center space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <AlertCircle className="h-5 w-5 text-amber-500 mx-auto animate-pulse" />
                                        <p className="text-xs text-amber-700 font-extrabold uppercase tracking-wider">Vendor Selection Required</p>
                                        <p className="text-[10px] text-amber-600/90 font-semibold leading-relaxed">Please select a supplier first to view and search their registered raw materials.</p>
                                    </div>
                                 ) : (
                                     <div className="space-y-3 animate-in fade-in duration-200">
                                         <div className="space-y-3">
                                          {linesForm.map((line, idx) => {
                                             const lineErrors = getLineErrors(line);
                                             const selectedMaterial = rawMaterials.find(material =>
                                                 String(material.product_id) === String(line.product_id)
                                             ) || rawMaterials.find(material =>
                                                 String(material.product_id) === String(line.parent_product_id)
                                             );
                                             return (
                                              <React.Fragment key={idx}>
                                              <div className={`grid grid-cols-1 gap-3 bg-muted/10 border p-3 pr-10 rounded-lg relative sm:grid-cols-2 lg:grid-cols-5 ${hasSubmitted && lineErrors.length > 0 ? "border-red-500/50 bg-red-500/5" : ""}`}>
                                                <div className="w-full min-w-0 space-y-1.5 flex flex-col">
                                                    <label className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">Material Type</label>
                                                    <div
                                                        className="flex h-9 items-center rounded-lg border bg-muted/40 px-2.5"
                                                        aria-live="polite"
                                                    >
                                                        {line.product_id ? (
                                                            <MaterialTypeBadge typeId={selectedMaterial?.product_type} />
                                                        ) : (
                                                            <span className="text-[10px] font-semibold text-muted-foreground">Select a material</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="w-full min-w-0 space-y-1.5 flex flex-col relative">
                                                    <label className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">Raw Product Name <span className="text-red-500">*</span></label>
                                                    <RawProductSelector
                                                        id={`search-input-${idx}`}
                                                        autoFocus={idx === linesForm.length - 1 && linesForm.length > 1}
                                                        rawMaterials={supplierRawMaterials.filter(rm => {
                                                            const isAlreadySelected = linesForm.some((l, lIdx) => {
                                                                if (lIdx === idx) return false;
                                                                const selectedId = String(l.product_id);
                                                                const selectedParentId = l.parent_product_id ? String(l.parent_product_id) : "";
                                                                const currentId = String(rm.product_id);
                                                                const currentParentId = rm.parent_id ? String(rm.parent_id) : "";

                                                                return (
                                                                    selectedId === currentId ||
                                                                    (selectedParentId && selectedParentId === currentId) ||
                                                                    (currentParentId && selectedId === currentParentId) ||
                                                                    (selectedParentId && currentParentId && selectedParentId === currentParentId)
                                                                );
                                                            });
                                                            return !isAlreadySelected;
                                                        })}
                                                        selectedProductId={line.product_id}
                                                        parentProductId={line.parent_product_id}
                                                        productName={line.product_name}
                                                        onSelect={(selected) => {
                                                            const isDuplicate = linesForm.some((l, i) => i !== idx && String(l.product_id) === String(selected.product_id));
                                                            if (isDuplicate) {
                                                                toast.error(`"${selected.product_name}" is already added to this manifest. Please adjust the quantity instead.`);
                                                                return;
                                                            }
                                                            
                                                            const finalSelected = { ...selected };
                                                            const specialPrice = priceTypeRatesMap[Number(selected.product_id)];
                                                            if (specialPrice !== undefined && specialPrice > 0) {
                                                                finalSelected.base_unit_cost_php = String(specialPrice);
                                                            }
                                                            if (canonicalDrafting && shipmentForm.currency_code === "USD") {
                                                                finalSelected.base_unit_cost_php = String(
                                                                    Number(finalSelected.base_unit_cost_php) / (Number(shipmentForm.exchange_rate) || 1)
                                                                );
                                                            }

                                                            handleLineFormChange(idx, finalSelected);
                                                            // Move focus to Qty Ordered input of the same row
                                                            setTimeout(() => {
                                                                const nextInput = document.getElementById(`qty-input-${idx}`);
                                                                if (nextInput) {
                                                                    nextInput.focus();
                                                                    if (nextInput instanceof HTMLInputElement) {
                                                                        nextInput.select();
                                                                    }
                                                                }
                                                            }, 50);
                                                        }}
                                                    />
                                                </div>

                                                {line.uom_options && line.uom_options.length > 0 && (
                                                     <div className="w-full min-w-0 space-y-1.5">
                                                        <label className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block whitespace-nowrap">Packaging / UOM</label>
                                                        <select
                                                            value={line.product_id}
                                                            onChange={(e) => {
                                                                const selectedId = e.target.value;
                                                                const isDuplicate = linesForm.some((l, i) => i !== idx && String(l.product_id) === String(selectedId));
                                                                if (isDuplicate) {
                                                                    toast.error("This product variation is already added to this manifest. Please adjust the quantity instead.");
                                                                    return;
                                                                }
                                                                const opt = line.uom_options?.find((o: UOMOption) => String(o.product_id) === String(selectedId));
                                                                if (opt) {
                                                                    let costVal = opt.cost_per_unit;
                                                                    const specialPrice = priceTypeRatesMap[Number(selectedId)];
                                                                    if (specialPrice !== undefined && specialPrice > 0) {
                                                                        costVal = specialPrice;
                                                                    }
                                                                    if (canonicalDrafting && shipmentForm.currency_code === "USD") {
                                                                        costVal /= Number(shipmentForm.exchange_rate) || 1;
                                                                    }
                                                                    handleLineFormChange(idx, {
                                                                        product_id: String(selectedId),
                                                                        selected_uom: opt.unit_shortcut,
                                                                        base_unit_cost_php: String(costVal)
                                                                    });
                                                                }
                                                            }}
                                                            className="w-full whitespace-nowrap rounded-lg border bg-background px-2.5 py-1.5 text-xs outline-none h-9 text-foreground font-semibold"
                                                        >
                                                             {line.uom_options.map((o: UOMOption) => {
                                                                 const displayCost = canonicalDrafting && shipmentForm.currency_code === "USD"
                                                                     ? Number(o.cost_per_unit || 0) / (Number(shipmentForm.exchange_rate) || 1)
                                                                     : o.cost_per_unit || 0;
                                                                 return (
                                                                     <option key={o.product_id} value={o.product_id}>
                                                                         {o.unit_shortcut} ({shipmentForm.currency_code || "PHP"} {formatAmount(displayCost)})
                                                                     </option>
                                                                 );
                                                             })}
                                                         </select>
                                                    </div>
                                                )}

                                                <div className="w-full min-w-0 space-y-1.5 relative">
                                                    <label className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">
                                                        Qty Ordered {line.selected_uom ? `(${line.selected_uom})` : ""} <span className="text-red-500">*</span>
                                                    </label>
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
                                                                    if (costInput instanceof HTMLInputElement) {
                                                                        costInput.select();
                                                                    }
                                                                }
                                                            } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                                                e.preventDefault();
                                                                document.getElementById("register-shipment-btn")?.click();
                                                            }
                                                        }}
                                                        className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs outline-none h-9 font-semibold"
                                                    />
                                                    {(() => {
                                                        const selectedOpt = line.uom_options?.find((o: UOMOption) => String(o.product_id) === String(line.product_id));
                                                        const convFactor = Number(selectedOpt?.unit_of_measurement_count || 1);
                                                        
                                                        const parentProduct = rawMaterials.find(rm => String(rm.product_id) === String(line.parent_product_id || line.product_id));
                                                        const baseUomShortcut = parentProduct?.unit_of_measurement?.unit_shortcut || "pcs";
                                                        
                                                        const equivQty = Number(line.quantity_ordered || 0) * convFactor;
                                                        
                                                        if (equivQty > 0 && convFactor !== 1) {
                                                            return (
                                                                 <span className="mt-1 block w-fit text-[9px] text-primary font-bold whitespace-nowrap bg-primary/5 px-1 py-0.5 rounded border border-primary/10 select-none">
                                                                    = {equivQty.toLocaleString()} {baseUomShortcut}
                                                                </span>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                </div>

                                                <div className="w-full min-w-0 space-y-1.5">
                                                    <label className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">Unit Price ({shipmentForm.currency_code || "PHP"}) <span className="text-red-500">*</span></label>
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
                                                                    handleAddLineForm();
                                                                } else {
                                                                    const nextSearchInput = document.getElementById(`search-input-${idx + 1}`);
                                                                    if (nextSearchInput) {
                                                                        nextSearchInput.focus();
                                                                    }
                                                                }
                                                            } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                                                e.preventDefault();
                                                                document.getElementById("register-shipment-btn")?.click();
                                                            }
                                                        }}
                                                        className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs outline-none font-mono h-9"
                                                    />
                                                </div>
                                                {canonicalDrafting && (
                                                    <>
                                                         <div className="w-full min-w-0 space-y-1.5">
                                                            <label className="text-[10px] text-muted-foreground font-bold uppercase">Purchase Intent</label>
                                                            <select
                                                                value={line.purchase_intent || "Buffer_Stock"}
                                                                onChange={event => handleLineFormChange(idx, {
                                                                    purchase_intent: event.target.value,
                                                                    job_order_id: event.target.value === "Buffer_Stock" ? "" : line.job_order_id || ""
                                                                })}
                                                                className="w-full rounded-lg border bg-background px-2 py-1.5 text-xs h-9"
                                                            >
                                                                <option value="Buffer_Stock">Buffer Stock</option>
                                                                <option value="MRP_Demand">MRP Demand</option>
                                                            </select>
                                                        </div>
                                                        {line.purchase_intent === "MRP_Demand" && (
                                                             <div className="w-full min-w-0 space-y-1.5">
                                                                <label className="text-[10px] text-muted-foreground font-bold uppercase">Job Order</label>
                                                                <select
                                                                    value={line.job_order_id || ""}
                                                                    required
                                                                    onChange={event => handleLineFormChange(idx, "job_order_id", event.target.value)}
                                                                    className="w-full rounded-lg border bg-background px-2 py-1.5 text-xs h-9"
                                                                >
                                                                    <option value="">Select job order</option>
                                                                    {jobOrders.map(jobOrder => (
                                                                        <option key={jobOrder.job_order_id} value={jobOrder.job_order_id}>
                                                                            {jobOrder.job_order_no || `JO-${jobOrder.job_order_id}`}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        )}
                                                        {(["discount_percent", "vat_percent", "withholding_percent"] as const).map(field => (
                                                             <div key={field} className="w-full min-w-0 space-y-1.5">
                                                                <label className="text-[10px] text-muted-foreground font-bold uppercase">
                                                                    {field === "discount_percent" ? "Discount %" : field === "vat_percent" ? "VAT %" : "Withhold %"}
                                                                </label>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    max="100"
                                                                    step="0.01"
                                                                    value={line[field] ?? ""}
                                                                    onChange={event => handleLineFormChange(idx, field, event.target.value)}
                                                                    className="w-full rounded-lg border bg-background px-2 py-1.5 text-xs h-9 font-mono"
                                                                />
                                                            </div>
                                                        ))}
                                                    </>
                                                )}
                                                 {linesForm.length > 1 && (
                                                     <button
                                                        type="button"
                                                        onClick={() => handleRemoveLineForm(idx)}
                                                        className="absolute top-2 right-2 text-red-500 hover:text-red-600 hover:bg-red-500/10 p-1.5 rounded-lg transition-all shrink-0 animate-in fade-in zoom-in-95 duration-150"
                                                        title="Remove Row"
                                                    >
                                                         <Trash2 className="h-4 w-4" />
                                                     </button>
                                                 )}
                                                  {hasSubmitted && lineErrors.length > 0 && (
                                                      <p className="col-span-full text-[10px] font-semibold leading-relaxed text-red-600" role="alert">
                                                          {lineErrors.join("; ")}
                                                      </p>
                                                  )}
                                              </div>
                                              {idx === linesForm.length - 1 && (
                                                  <div className="mt-2 flex justify-end border-t pt-3">
                                                      <button
                                                          type="button"
                                                          onClick={handleAddLineForm}
                                                          className="inline-flex items-center gap-1 text-primary hover:text-primary/80 text-xs font-semibold"
                                                      >
                                                          <Plus className="h-3.5 w-3.5" /> Add Row
                                                      </button>
                                                  </div>
                                              )}
                                              </React.Fragment>
                                              );
                                          })}
                                         </div>
                                     </div>
                                )}
                            </div>

                            {/* Live calculations display */}
                            {linesForm.length > 0 && (
                                <div className="p-3.5 bg-muted/40 border rounded-xl space-y-2 animate-in fade-in duration-200 shadow-inner" aria-live="polite">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Live Totals Preview</div>
                                    {canonicalDrafting ? (
                                        <>
                                            <div className="grid min-w-0 grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-5">
                                                <span className="min-w-0">Gross <strong className="block min-w-0 font-mono leading-tight text-foreground [overflow-wrap:anywhere]">{formatMoney(draftSummary.grossPhp)}</strong></span>
                                                <span className="min-w-0">Discount <strong className="block min-w-0 font-mono leading-tight text-foreground [overflow-wrap:anywhere]">{formatMoney(draftSummary.discountPhp)}</strong></span>
                                                <span className="min-w-0">VAT <strong className="block min-w-0 font-mono leading-tight text-foreground [overflow-wrap:anywhere]">{formatMoney(draftSummary.vatPhp)}</strong></span>
                                                <span className="min-w-0">Withholding <strong className="block min-w-0 font-mono leading-tight text-foreground [overflow-wrap:anywhere]">{formatMoney(draftSummary.withholdingPhp)}</strong></span>
                                                <span className="min-w-0">Net <strong className="block min-w-0 font-mono leading-tight text-foreground [overflow-wrap:anywhere]">{formatMoney(draftSummary.netPhp)}</strong></span>
                                            </div>
                                            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t pt-2 text-xs font-bold">
                                                <span className="min-w-0">Locked {shipmentForm.currency_code || "PHP"} total</span>
                                                <span className="min-w-0 text-right font-mono [overflow-wrap:anywhere]">{formatMoney(draftSummary.netForeign, shipmentForm.currency_code || "PHP")}</span>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                    <div className="flex justify-between text-xs font-bold text-muted-foreground">
                                        <span>Total Cargo Value (PHP)</span>
                                        <span className="font-mono text-foreground text-sm font-extrabold">
                                            {formatMoney(totalPhpValue)}
                                        </span>
                                    </div>
                                        </>
                                    )}
                                    {!canonicalDrafting && (
                                        <div className="flex justify-between text-xs font-bold text-muted-foreground border-t pt-1.5">
                                            <span>Total Cargo Value (USD @ {parseFloat(shipmentForm.exchange_rate) || "N/A"})</span>
                                            <span className="font-mono text-foreground text-sm font-extrabold">
                                                {formatMoney(totalUsdValue, "USD")}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}

                            </div>

                            {/* Sticky Footer */}
                            <div className="sticky bottom-0 border-t pt-3 flex justify-end gap-2 shrink-0 bg-card mt-auto">
                                <button
                                    onClick={handleCloseModal}
                                    type="button"
                                    className="px-4 py-2 border rounded-lg text-xs font-semibold hover:bg-muted text-foreground"
                                >
                                    Cancel
                                </button>
                                <button
                                    id="register-shipment-btn"
                                    type="submit"
                                    disabled={loading || listLoading}
                                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/95 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                            {loading ? (
                                        <>
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            {editingShipmentId
                                                ? activeShipment?.status === "Rejected" ? "Resubmitting Purchase Order..." : "Saving Changes..."
                                                : canonicalDrafting ? "Creating Purchase Order..." : "Registering Shipment..."}
                                        </>
                                    ) : (editingShipmentId
                                        ? activeShipment?.status === "Rejected" ? "Revise & Resubmit PO" : "Save Requested PO"
                                        : canonicalDrafting ? "Create Purchase Order" : "Register Shipment")}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
