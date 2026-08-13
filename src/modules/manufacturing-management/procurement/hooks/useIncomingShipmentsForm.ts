import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { ManifestLineFormItem, ShipmentFormState } from "../components/incoming-shipments/types";
import { IncomingShipment, RawMaterial, ShipmentLineItem, Supplier } from "../types";
import { DecimalValue, isNonNegativeDecimal, UNIT_PRICE_DECIMAL_SCALE } from "@/modules/manufacturing-management/decimal";
import { isSupplierForeign as isSupplierForeignRecord } from "../services/supplier.service";

export interface UseIncomingShipmentsFormProps {
    suppliers: Supplier[];
    rawMaterials: RawMaterial[];
    selectedShipment: IncomingShipment | null;
    lines: ShipmentLineItem[];
    isModalOpen: boolean;
    setIsModalOpen: (open: boolean) => void;
    shipmentForm: ShipmentFormState;
    setShipmentForm: React.Dispatch<React.SetStateAction<ShipmentFormState>>;
    linesForm: ManifestLineFormItem[];
    setLinesForm: React.Dispatch<React.SetStateAction<ManifestLineFormItem[]>>;
    onCreateShipment: (e: React.FormEvent) => void;
    onEditShipment: (shipmentId: number, shipmentData: ShipmentFormState, lineItems: ManifestLineFormItem[]) => void | Promise<boolean | void>;
    canonicalDrafting?: boolean;
}

export function useIncomingShipmentsForm({
    suppliers,
    rawMaterials,
    selectedShipment,
    lines,
    isModalOpen,
    setIsModalOpen,
    shipmentForm,
    setShipmentForm,
    linesForm,
    setLinesForm,
    onCreateShipment,
    onEditShipment,
    canonicalDrafting = false
}: UseIncomingShipmentsFormProps) {
    const [editingShipmentId, setEditingShipmentId] = useState<number | null>(null);
    const [statusLoading, setStatusLoading] = useState<"en-route" | "arrived" | null>(null);
    const [isOverridden, setIsOverridden] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [dynamicBranches, setDynamicBranches] = useState<Array<{ id: number; branchName: string; branchCode: string }>>([]);
    const modalRef = React.useRef<HTMLDivElement>(null);
    const restoreFocusRef = React.useRef<HTMLElement | null>(null);

    const activeShipment = selectedShipment || null;

    useEffect(() => {
        fetch("/api/manufacturing/branches")
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data) && data.length > 0) {
                    setDynamicBranches(data);
                }
            })
            .catch(err => console.error("Error fetching branches:", err));
    }, []);

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

    const isSupplierForeign = useCallback((s: Supplier | null | undefined): boolean => {
        return isSupplierForeignRecord(s);
    }, []);

    const handleSupplierSelect = useCallback(async (val: string) => {
        const matchedSup = suppliers.find(s => String(s.id) === String(val));
        
        if (!matchedSup) {
            setShipmentForm(prev => ({ ...prev, supplier_id: val }));
            return;
        }

        const foreign = isSupplierForeign(matchedSup);

        if (foreign) {
            const rawCurr = (matchedSup.currency || matchedSup.default_currency || "USD").toUpperCase();
            const targetCurrency = (rawCurr !== "PHP" ? rawCurr : "USD") as "PHP" | "USD";
            
            let fxRate = shipmentForm.exchange_rate && shipmentForm.exchange_rate !== "1" ? shipmentForm.exchange_rate : "58.00";
            
            try {
                const res = await fetch("/api/manufacturing/procurement/forex");
                if (res.ok) {
                    const data = await res.json();
                    const latestHistory = data?.rateHistory?.find((h: { currency_code: string; new_rate: number }) => h.currency_code === targetCurrency || h.currency_code === "USD");
                    const activeConfig = data?.activeRates?.find((r: { currency_code: string; exchange_rate: number }) => r.currency_code === targetCurrency || r.currency_code === "USD");
                    const rateVal = latestHistory?.new_rate || activeConfig?.exchange_rate;
                    if (rateVal) {
                        fxRate = String(rateVal);
                    }
                }
            } catch (err) {
                console.error("Error fetching forex rate for automated supplier currency:", err);
            }

            setShipmentForm(prev => ({
                ...prev,
                supplier_id: val,
                currency_code: targetCurrency,
                exchange_rate: fxRate
            }));

            toast.info(`Automated Currency: Set to ${targetCurrency} for Foreign Supplier (${matchedSup.supplier_name}) at FX Rate ₱${fxRate}`);
        } else {
            setShipmentForm(prev => ({
                ...prev,
                supplier_id: val,
                currency_code: "PHP",
                exchange_rate: "1"
            }));

            toast.info(`Automated Currency: Set to PHP for Local Supplier (${matchedSup.supplier_name})`);
        }
    }, [suppliers, isSupplierForeign, shipmentForm.exchange_rate, setShipmentForm]);

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
            price_type: activeShipment.price_type || "Internal",
            currency_code: (activeShipment as IncomingShipment & { currency_code?: "PHP" | "USD" }).currency_code || "PHP",
            workflow_revision: activeShipment.workflow_revision || 0
        });

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

        if (freshLines.length === 0) freshLines = lines;

        const currencyCode = (activeShipment as IncomingShipment & { currency_code?: "PHP" | "USD" }).currency_code || "PHP";
        const exchangeRate = DecimalValue.from(activeShipment.exchange_rate || 1);
        setLinesForm(freshLines.map((l: ShipmentLineItem) => ({
            product_id: String(typeof l.product_id === "object" ? l.product_id.product_id : l.product_id),
            product_name: typeof l.product_id === "object" ? l.product_id.product_name : "",
            product_code: typeof l.product_id === "object" ? l.product_id.product_code || "" : "",
            quantity_ordered: String(l.quantity_ordered || 0),
            base_unit_cost_php: String(l.unit_price_foreign ?? (currencyCode === "USD"
                ? DecimalValue.from(l.base_unit_cost_php || 0).divideRounded(exchangeRate, 4).toFixed(4)
                : l.base_unit_cost_php)),
            parent_product_id: "",
            selected_uom: l.product_id && typeof l.product_id === "object" && l.product_id.unit_of_measurement ? l.product_id.unit_of_measurement.unit_shortcut : "PCS",
            uom_options: [],
            purchase_intent: (l as ShipmentLineItem & { purchase_intent?: "MRP_Demand" | "Buffer_Stock" }).purchase_intent || "Buffer_Stock",
            job_order_id: String((l as ShipmentLineItem & { job_order_id?: number }).job_order_id || ""),
            discount_percent: String((l as ShipmentLineItem & { discount_percent?: number }).discount_percent ?? "0")
        })));

        setEditingShipmentId(activeShipment.shipment_id);
        setIsModalOpen(true);
    };

    const handleCloseModal = useCallback(() => {
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
            price_type: "",
            currency_code: "PHP"
        });
        setLinesForm([]);
    }, [setIsModalOpen, setLinesForm, setShipmentForm]);

    const getLineErrors = useCallback((line: ManifestLineFormItem) => {
        const errors: string[] = [];
        const quantity = Number(line.quantity_ordered);
        const unitPrice = line.base_unit_cost_php;
        const discount = Number(line.discount_percent || 0);

        if (!line.product_id) errors.push("Raw Product Name is required");
        if (!Number.isFinite(quantity) || quantity <= 0) errors.push("Qty Ordered must be greater than zero");
        if (!isNonNegativeDecimal(unitPrice)) {
            errors.push(`Unit Price must be a non-negative decimal with at most ${UNIT_PRICE_DECIMAL_SCALE} decimal places`);
        }
        if (canonicalDrafting) {
            if (discount < 0 || discount > 100) errors.push("Discount % must be between 0 and 100");
        }
        return errors;
    }, [canonicalDrafting]);

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

    const handleAddLineForm = () => {
        setLinesForm([...linesForm, {
            parent_product_id: "", product_id: "", quantity_ordered: "", base_unit_cost_php: "",
            purchase_intent: "Buffer_Stock", job_order_id: "", discount_percent: "0"
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

    const [discountTypes, setDiscountTypes] = useState<Array<{ id: number; discount_type: string; total_percent: number | string }>>([]);
    const [productPerSupplierMap, setProductPerSupplierMap] = useState<Record<number, { discount_type_id?: number; total_percent?: number }>>({});

    useEffect(() => {
        fetch("/api/manufacturing/procurement/discount-types")
            .then(res => res.ok ? res.json() : [])
            .then(data => setDiscountTypes(Array.isArray(data) ? data : []))
            .catch(e => console.error("Error fetching discount types:", e));
    }, []);

    useEffect(() => {
        let active = true;
        if (!shipmentForm.supplier_id) {
            setTimeout(() => {
                if (active) setProductPerSupplierMap({});
            }, 0);
            return () => { active = false; };
        }
        fetch(`/api/manufacturing/procurement/product-per-supplier?supplierId=${shipmentForm.supplier_id}`)
            .then(res => res.ok ? res.json() : [])
            .then(data => {
                if (!active) return;
                const map: Record<number, { discount_type_id?: number; total_percent?: number }> = {};
                if (Array.isArray(data)) {
                    data.forEach(item => {
                        const prodId = typeof item.product_id === "object" && item.product_id ? item.product_id.product_id : item.product_id;
                        if (prodId && item.discount_type) {
                            const dt = typeof item.discount_type === "object" ? item.discount_type : null;
                            map[Number(prodId)] = {
                                discount_type_id: dt?.id || item.discount_type,
                                total_percent: dt?.total_percent ? Number(dt.total_percent) : 0
                            };
                        }
                    });
                }
                setProductPerSupplierMap(map);

                setLinesForm(prev => prev.map(line => {
                    if (!line.product_id) return line;
                    const prodId = Number(line.product_id);
                    let parentId: number | null = line.parent_product_id ? Number(line.parent_product_id) : null;
                    if (!parentId) {
                        const mat = rawMaterials.find(rm => String(rm.product_id) === line.product_id);
                        if (mat?.parent_id) parentId = Number(mat.parent_id);
                    }

                    const pps = map[prodId] || (parentId ? map[parentId] : undefined);
                    if (pps) {
                        return {
                            ...line,
                            discount_type_id: pps.discount_type_id ? String(pps.discount_type_id) : line.discount_type_id,
                            discount_percent: pps.total_percent !== undefined ? String(pps.total_percent) : line.discount_percent
                        };
                    }
                    return line;
                }));
            })
            .catch(e => console.error("Error fetching product_per_supplier map:", e));

        return () => { active = false; };
    }, [shipmentForm.supplier_id, rawMaterials, setLinesForm]);

    const [priceTypes, setPriceTypes] = useState<Array<{ price_type_id: number; price_type_name?: string; name?: string }>>([]);
    const [priceTypeRatesMap, setPriceTypeRatesMap] = useState<Record<number, number>>({});

    useEffect(() => {
        fetch("/api/manufacturing/finished-goods/price-types")
            .then(res => res.ok ? res.json() : [])
            .then(data => {
                setPriceTypes(Array.isArray(data) ? data : []);
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

        const match = priceTypes.find(pt => {
            const ptName = String(pt.price_type_name || pt.name || "").toLowerCase();
            const ptId = String(pt.price_type_id);
            const formVal = String(shipmentForm.price_type || "").toLowerCase();
            return ptName === formVal || ptId === formVal;
        });

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

                setLinesForm(prev => prev.map(line => {
                    if (!line.product_id) return line;
                    const prod = rawMaterials.find(rm => String(rm.product_id) === String(line.product_id));
                    const defaultCost = Number(prod?.cost_per_unit || prod?.estimated_unit_cost || 0);
                    const specialPrice = map[Number(line.product_id)];
                    const resolvedPrice = (specialPrice !== undefined && specialPrice > 0) ? specialPrice : defaultCost;
                    
                    if (resolvedPrice > 0) {
                        const rate = Number(shipmentForm.exchange_rate) || 1;
                        const transactionPrice = canonicalDrafting && shipmentForm.currency_code === "USD"
                            ? resolvedPrice / rate
                            : resolvedPrice;
                        return { ...line, base_unit_cost_php: String(transactionPrice) };
                    }
                    return line;
                }));
            })
            .catch(e => {
                if (active) console.error("Error fetching price type rates:", e);
            });

        return () => { active = false; };
    }, [canonicalDrafting, shipmentForm.currency_code, shipmentForm.exchange_rate, shipmentForm.price_type, priceTypes, rawMaterials, setLinesForm]);

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
            const netForeign = DecimalValue.from(grossForeign).subtract(discountForeign).toFixed(2);
            return {
                grossPhp: DecimalValue.from(summary.grossPhp).add(DecimalValue.from(grossForeign).multiply(exchangeRate)).toFixed(2),
                discountPhp: DecimalValue.from(summary.discountPhp).add(DecimalValue.from(discountForeign).multiply(exchangeRate)).toFixed(2),
                vatPhp: "0.00",
                withholdingPhp: "0.00",
                netPhp: DecimalValue.from(summary.netPhp).add(DecimalValue.from(netForeign).multiply(exchangeRate)).toFixed(2),
                netForeign: DecimalValue.from(summary.netForeign).add(netForeign).toFixed(2)
            };
        }, { grossPhp: "0.00", discountPhp: "0.00", vatPhp: "0.00", withholdingPhp: "0.00", netPhp: "0.00", netForeign: "0.00" });
    }, [linesForm, shipmentForm.exchange_rate]);

    return {
        editingShipmentId,
        activeShipment,
        statusLoading,
        setStatusLoading,
        isOverridden,
        setIsOverridden,
        hasSubmitted,
        dynamicBranches,
        modalRef,
        isSupplierForeign,
        handleSupplierSelect,
        handleStartEdit,
        handleCloseModal,
        handleSubmit,
        getLineErrors,
        handleAddLineForm,
        handleRemoveLineForm,
        handleLineFormChange,
        priceTypes,
        priceTypeRatesMap,
        discountTypes,
        productPerSupplierMap,
        isFinanceManager,
        totalPhpValue,
        totalUsdValue,
        draftSummary
    };
}
