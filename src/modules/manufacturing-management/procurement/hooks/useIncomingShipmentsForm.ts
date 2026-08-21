import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
    ManifestLineFormItem,
    ShipmentFormState,
    purchaseOrderMaterialTypeFromProduct,
    purchaseOrderMaterialTypeFromCategoryType,
    FxRateStatus
} from "../components/incoming-shipments/types";
import { IncomingShipment, RawMaterial, ShipmentLineItem, Supplier, PurchaseOrderPaymentMode, PurchaseOrderPriceTypeRule } from "../types";
import { DecimalValue, isNonNegativeDecimal, UNIT_PRICE_DECIMAL_SCALE } from "@/modules/manufacturing-management/decimal";
import { isSupplierForeign as isSupplierForeignRecord } from "../services/supplier.service";
import { normalizeProductRelationId, resolveProductParentId } from "../product-relation";
import { fetchPurchaseOrderFxRate } from "../../purchase-order/services/purchase-order-api";
import {
    defaultPurchaseOrderPaymentModeId,
    resolveSupplierPaymentTermId
} from "../../purchase-order/commercial-terms";

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
    priceTypeRules?: PurchaseOrderPriceTypeRule[];
    paymentTerms?: Array<{
        id: number;
        payment_name: string;
        payment_days?: number | null;
        payment_description?: string | null;
    }>;
    paymentModes?: PurchaseOrderPaymentMode[];
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
    canonicalDrafting = false,
    priceTypeRules = [],
    paymentTerms = [],
    paymentModes = []
}: UseIncomingShipmentsFormProps) {
    const [editingShipmentId, setEditingShipmentId] = useState<number | null>(null);
    const [isOverridden, setIsOverridden] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [fxRateStatus, setFxRateStatus] = useState<FxRateStatus>("idle");
    const [fxRateError, setFxRateError] = useState<string | null>(null);
    const [priceMatrixStatus, setPriceMatrixStatus] = useState<"idle" | "loading" | "ready" | "warning" | "error">("idle");
    const [priceMatrixError, setPriceMatrixError] = useState<string | null>(null);
    const [priceMatrixMissingProductIds, setPriceMatrixMissingProductIds] = useState<number[]>([]);
    const [dynamicBranches, setDynamicBranches] = useState<Array<{ id: number; branchName: string; branchCode: string }>>([]);
    const modalRef = React.useRef<HTMLDivElement>(null);
    const restoreFocusRef = React.useRef<HTMLElement | null>(null);
    const fxRateController = React.useRef<AbortController | null>(null);
    const linesFormRef = React.useRef(linesForm);

    React.useEffect(() => {
        linesFormRef.current = linesForm;
    }, [linesForm]);

    const activeShipment = selectedShipment || null;

    const loadCurrentFxRate = useCallback(async (currencyCode: "PHP" | "USD") => {
        fxRateController.current?.abort();

        if (currencyCode === "PHP") {
            setShipmentForm(previous => ({ ...previous, exchange_rate: "1" }));
            setFxRateError(null);
            setFxRateStatus("ready");
            return;
        }

        const controller = new AbortController();
        fxRateController.current = controller;
        setFxRateStatus("loading");
        setFxRateError(null);
        setShipmentForm(previous => ({ ...previous, exchange_rate: "" }));

        try {
            const rate = await fetchPurchaseOrderFxRate(currencyCode, controller.signal);
            if (controller.signal.aborted) return;
            setShipmentForm(previous => ({ ...previous, exchange_rate: String(rate.exchangeRate) }));
            setFxRateStatus("ready");
        } catch (error) {
            if (controller.signal.aborted || (error as Error).name === "AbortError") return;
            setShipmentForm(previous => ({ ...previous, exchange_rate: "" }));
            setFxRateError((error as Error).message || "The current USD exchange rate could not be loaded.");
            setFxRateStatus("error");
        }
    }, [setShipmentForm]);

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

    const handleCurrencyChange = useCallback((currencyCode: "PHP" | "USD") => {
        setShipmentForm(previous => ({ ...previous, currency_code: currencyCode, exchange_rate: currencyCode === "PHP" ? "1" : "" }));
        if (currencyCode === "USD") {
            void loadCurrentFxRate("USD");
        } else {
            fxRateController.current?.abort();
            setFxRateStatus("ready");
            setFxRateError(null);
        }
    }, [loadCurrentFxRate, setShipmentForm]);

    useEffect(() => {
        if (!isModalOpen || editingShipmentId || shipmentForm.payment_mode !== null) return;
        const defaultPaymentModeId = defaultPurchaseOrderPaymentModeId(paymentModes);
        if (defaultPaymentModeId === null) return;
        setShipmentForm(previous => previous.payment_mode === null
            ? { ...previous, payment_mode: defaultPaymentModeId }
            : previous);
    }, [editingShipmentId, isModalOpen, paymentModes, setShipmentForm, shipmentForm.payment_mode]);

    useEffect(() => {
        if (!isModalOpen || !shipmentForm.supplier_id) return;
        const selectedSupplier = suppliers.find(supplier => String(supplier.id) === String(shipmentForm.supplier_id));
        if (!selectedSupplier) return;
        const profilePaymentTerms = resolveSupplierPaymentTermId(selectedSupplier.payment_terms, paymentTerms);
        const profileDeliveryTerms = selectedSupplier.delivery_terms?.trim() || "";
        if (profilePaymentTerms === null && !profileDeliveryTerms) return;
        setShipmentForm(previous => {
            if (String(previous.supplier_id) !== String(shipmentForm.supplier_id)) return previous;
            const nextPaymentTerms = previous.payment_terms ?? profilePaymentTerms;
            const nextDeliveryTerms = previous.delivery_terms?.trim() || profileDeliveryTerms;
            return previous.payment_terms === nextPaymentTerms && previous.delivery_terms === nextDeliveryTerms
                ? previous
                : { ...previous, payment_terms: nextPaymentTerms, delivery_terms: nextDeliveryTerms };
        });
    }, [isModalOpen, paymentTerms, setShipmentForm, shipmentForm.supplier_id, suppliers]);

    const handleSupplierSelect = useCallback((val: string) => {
        const matchedSup = suppliers.find(s => String(s.id) === String(val));

        if (String(shipmentForm.supplier_id || "") !== String(val)) {
            setLinesForm(previous => previous.map(line => ({
                ...line,
                parent_product_id: "",
                product_id: "",
                product_name: "",
                product_code: "",
                selected_uom: "",
                uom_options: [],
                quantity_ordered: "",
                base_unit_cost_php: "",
                discount_type_id: "",
                discount_amount: "0",
                discount_percent: "0"
            })));
        }
        
        if (!matchedSup) {
            setShipmentForm(prev => ({
                ...prev,
                supplier_id: val,
                payment_terms: null,
                delivery_terms: ""
            }));
            return;
        }

        const foreign = isSupplierForeign(matchedSup);
        const paymentTermsId = resolveSupplierPaymentTermId(matchedSup.payment_terms, paymentTerms);
        const deliveryTerms = matchedSup.delivery_terms?.trim() || "";
        const defaultPaymentModeId = defaultPurchaseOrderPaymentModeId(paymentModes);

        if (foreign) {
            const targetCurrency = "USD" as const;
            setFxRateStatus("loading");
            setFxRateError(null);

            setShipmentForm(prev => ({
                ...prev,
                supplier_id: val,
                payment_terms: paymentTermsId,
                delivery_terms: deliveryTerms,
                payment_mode: prev.payment_mode ?? defaultPaymentModeId,
                currency_code: targetCurrency,
                exchange_rate: ""
            }));
            void loadCurrentFxRate(targetCurrency);

            toast.info(`Automated Currency: Set to ${targetCurrency} for Foreign Supplier (${matchedSup.supplier_name}).`);
        } else {
            setShipmentForm(prev => ({
                ...prev,
                supplier_id: val,
                payment_terms: paymentTermsId,
                delivery_terms: deliveryTerms,
                payment_mode: prev.payment_mode ?? defaultPaymentModeId,
                currency_code: "PHP",
                exchange_rate: "1"
            }));
            fxRateController.current?.abort();
            setFxRateStatus("ready");
            setFxRateError(null);

            toast.info(`Automated Currency: Set to PHP for Local Supplier (${matchedSup.supplier_name})`);
        }
    }, [isSupplierForeign, loadCurrentFxRate, paymentModes, paymentTerms, setLinesForm, setShipmentForm, shipmentForm.supplier_id, suppliers]);

    const handleStartEdit = async () => {
        if (!activeShipment) return;

        setHasSubmitted(false);
        const storedRemark = activeShipment.remark || "";
        const legacyRemarkMatch = storedRemark.match(/^(REJECTED|CANCELLED):\s*/i);
        const dateReceived = activeShipment.date_received
            ? activeShipment.date_received.split("T")[0]
            : new Date().toISOString().split("T")[0];

        const supplierId = Number(activeShipment.supplier_id && typeof activeShipment.supplier_id === "object" ? activeShipment.supplier_id.id : activeShipment.supplier_id || 0);
        const storedSupplier = suppliers.find(supplier => supplier.id === supplierId);
        setShipmentForm({
            reference_number: activeShipment.reference_number,
            remark: legacyRemarkMatch ? "" : storedRemark,
            supplier_id: String(activeShipment.supplier_id && typeof activeShipment.supplier_id === "object" ? activeShipment.supplier_id.id : activeShipment.supplier_id || ""),
            date_received: dateReceived,
            total_foreign_currency: String(activeShipment.total_foreign_currency),
            exchange_rate: String(activeShipment.exchange_rate),
            total_php_value: String(activeShipment.total_php_value),
            status: "Ordered",
            branch_id: activeShipment.branch_id || 182,
            payment_type: activeShipment.payment_type || 1,
            payment_mode: activeShipment.payment_mode || null,
            payment_terms: activeShipment.payment_terms || resolveSupplierPaymentTermId(storedSupplier?.payment_terms, paymentTerms),
            delivery_terms: activeShipment.delivery_terms || storedSupplier?.delivery_terms || "",
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
        setLinesForm(freshLines.map((l: ShipmentLineItem) => {
            const productId = String(typeof l.product_id === "object" ? l.product_id.product_id : l.product_id);
            const selectedRawMaterial = rawMaterials.find(material => String(material.product_id) === productId);

            return {
                product_id: productId,
                material_type: purchaseOrderMaterialTypeFromCategoryType(l.category_type),
                product_name: typeof l.product_id === "object" ? l.product_id.product_name : "",
                product_code: typeof l.product_id === "object" ? l.product_id.product_code || "" : "",
                quantity_ordered: String(l.quantity_ordered || 0),
                base_unit_cost_php: String(l.unit_price_foreign ?? (currencyCode === "USD"
                    ? DecimalValue.from(l.base_unit_cost_php || 0).divideRounded(exchangeRate, 4).toFixed(4)
                    : l.base_unit_cost_php)),
                parent_product_id: String(resolveProductParentId(selectedRawMaterial) || ""),
                selected_uom: l.product_id && typeof l.product_id === "object" && l.product_id.unit_of_measurement ? l.product_id.unit_of_measurement.unit_shortcut : "PCS",
                uom_options: [],
                purchase_intent: (l as ShipmentLineItem & { purchase_intent?: "MRP_Demand" | "Buffer_Stock" }).purchase_intent || "Buffer_Stock",
                job_order_id: String((l as ShipmentLineItem & { job_order_id?: number }).job_order_id || ""),
                discount_mode: l.discount_mode || "Percentage",
                discount_amount: String(l.discount_amount_foreign ?? "0"),
                discount_percent: String((l as ShipmentLineItem & { discount_percent?: number }).discount_percent ?? "0")
            };
        }));

        setEditingShipmentId(activeShipment.shipment_id);
        const hasStoredRate = Number(activeShipment.exchange_rate) > 0;
        setFxRateStatus(hasStoredRate ? "ready" : "error");
        setFxRateError(hasStoredRate ? null : "The stored purchase-order exchange rate is unavailable.");
        setIsModalOpen(true);
    };

    const handleCloseModal = useCallback(() => {
        setIsModalOpen(false);
        setEditingShipmentId(null);
        setHasSubmitted(false);
        setShipmentForm({
            reference_number: "",
            remark: "",
            supplier_id: "",
            date_received: new Date().toISOString().split("T")[0],
            total_foreign_currency: "",
            exchange_rate: "",
            total_php_value: "",
            status: "Ordered",
            branch_id: null,
            payment_type: null,
            payment_mode: null,
            payment_terms: null,
            delivery_terms: "",
            price_type: "",
            currency_code: "PHP"
        });
        setLinesForm([]);
        fxRateController.current?.abort();
        setFxRateStatus("idle");
        setFxRateError(null);
    }, [setIsModalOpen, setLinesForm, setShipmentForm]);

    const getLineErrors = useCallback((line: ManifestLineFormItem) => {
        const errors: string[] = [];
        const quantity = Number(line.quantity_ordered);
        const unitPrice = line.base_unit_cost_php;
        const discountMode = line.discount_mode || "Percentage";
        const discount = Number(line.discount_percent || 0);
        const discountAmount = Number(line.discount_amount || 0);
        const selectedMaterial = rawMaterials.find(material =>
            String(material.product_id) === String(line.product_id)
        ) || rawMaterials.find(material =>
            String(material.product_id) === String(line.parent_product_id)
        );
        const selectedMaterialType = purchaseOrderMaterialTypeFromProduct(selectedMaterial, rawMaterials);

        if (!line.material_type) errors.push("Type is required");
        if (!line.product_id) errors.push("Product Name is required");
        if (line.material_type && selectedMaterial && selectedMaterialType !== line.material_type) {
            errors.push("Product Name must match the selected Type");
        }
        if (!Number.isFinite(quantity) || quantity <= 0) errors.push("Qty Ordered must be greater than zero");
        if (!isNonNegativeDecimal(unitPrice)) {
            errors.push(`Unit Price must be a non-negative decimal with at most ${UNIT_PRICE_DECIMAL_SCALE} decimal places`);
        } else if (
            canonicalDrafting &&
            priceMatrixMissingProductIds.includes(Number(line.product_id)) &&
            DecimalValue.from(unitPrice).compare(0) <= 0
        ) {
            errors.push("Unit Price must be greater than zero when Price Control is not configured");
        }
        if (discountMode !== "Percentage" && discountMode !== "Fixed Amount") errors.push("Discount Type must be Percentage or Fixed Amount");
        if (discountMode === "Percentage" && (discount < 0 || discount > 100)) errors.push("Discount % must be between 0 and 100");
        if (discountMode === "Fixed Amount") {
            const gross = Number.isFinite(quantity) && Number.isFinite(Number(unitPrice))
                ? DecimalValue.from(quantity).multiply(unitPrice).toFixed(2)
                : "0.00";
            if (!Number.isFinite(discountAmount) || discountAmount < 0) errors.push("Discount Amount must be non-negative");
            else if (DecimalValue.from(discountAmount).compare(gross) > 0) errors.push("Discount Amount cannot exceed Gross Amount");
        }
        return errors;
    }, [canonicalDrafting, priceMatrixMissingProductIds, rawMaterials]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setHasSubmitted(true);

        if (canonicalDrafting && !editingShipmentId && shipmentForm.currency_code === "USD" && fxRateStatus !== "ready") {
            toast.error(fxRateError || "Wait for the current USD exchange rate before submitting.");
            return;
        }

        if (canonicalDrafting && priceTypeResolution.status !== "resolved") {
            toast.error(priceTypeResolution.message || "Price Control could not be determined from the selected products.");
            return;
        }
        if (
            canonicalDrafting &&
            priceMatrixStatus !== "ready" &&
            priceMatrixStatus !== "warning"
        ) {
            toast.error(priceMatrixError || "Wait for the Price Control matrix to finish loading before submitting.");
            return;
        }
        
        const firstInvalidLine = linesForm
            .map((line, index) => ({ index, errors: getLineErrors(line) }))
            .find(item => item.errors.length > 0);
        if (firstInvalidLine) {
            toast.error(`Purchase Order Line ${firstInvalidLine.index + 1}: ${firstInvalidLine.errors[0]}.`);
            return;
        }

        if (editingShipmentId) {
            const linesForEdit = linesForm.map(line => ({
                ...line,
                category_type: line.material_type === "raw_material"
                    ? "RAW_MATERIAL" as const
                    : line.material_type === "packaging"
                        ? "PACKAGING" as const
                        : "FINISHED_GOODS" as const
            }));
            const editSucceeded = await onEditShipment(editingShipmentId, shipmentForm, linesForEdit);
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
            parent_product_id: "", product_id: "", material_type: "", quantity_ordered: "", base_unit_cost_php: "",
            purchase_intent: "Buffer_Stock", job_order_id: "", discount_mode: "Percentage", discount_amount: "0", discount_percent: "0"
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
                        if (mat) parentId = resolveProductParentId(mat);
                    }

                    const pps = map[prodId] || (parentId ? map[parentId] : undefined);
                    if (pps) {
                        return {
                            ...line,
                            discount_mode: "Percentage",
                            discount_amount: "0",
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

    const priceTypeResolution = React.useMemo(() => {
        if (!canonicalDrafting) {
            return { status: "idle" as const, priceTypeId: null, priceTypeName: null, message: null };
        }

        const selectedLines = linesForm.filter(line => Boolean(line.product_id));
        if (selectedLines.length === 0) {
            return {
                status: "pending" as const,
                priceTypeId: null,
                priceTypeName: null,
                message: "Select a product to determine the Price Control pricing source."
            };
        }
        if (priceTypeRules.length === 0) {
            return {
                status: "pending" as const,
                priceTypeId: null,
                priceTypeName: null,
                message: "Loading product classification Price Control rules..."
            };
        }

        const resolved = selectedLines.map(line => {
            const product = rawMaterials.find(material => String(material.product_id) === String(line.product_id));
            const ownTypeId = Number(product?.product_type) || null;
            const parentId = normalizeProductRelationId(product?.parent_id);
            const parent = parentId ? rawMaterials.find(material => Number(material.product_id) === parentId) : null;
            const parentTypeId = Number(parent?.product_type) || null;

            if (ownTypeId && parentTypeId && ownTypeId !== parentTypeId) {
                return {
                    error: `Product ${line.product_name || line.product_id} has conflicting parent and variant classifications.`
                };
            }

            const productTypeId = ownTypeId || parentTypeId;
            const rule = productTypeId
                ? priceTypeRules.find(candidate => candidate.productTypeId === productTypeId)
                : undefined;
            if (!rule?.priceTypeId) {
                return {
                    error: `Price Control is not configured for ${line.product_name || `product ${line.product_id}`}.`
                };
            }
            return {
                productTypeId,
                priceTypeId: rule.priceTypeId,
                priceTypeName: rule.priceTypeName || `Price Type #${rule.priceTypeId}`
            };
        });

        const firstError = resolved.find(item => "error" in item);
        if (firstError && "error" in firstError) {
            return { status: "error" as const, priceTypeId: null, priceTypeName: null, message: firstError.error || "Price Control could not be determined." };
        }

        const priceTypeIds = [...new Set(resolved
            .map(item => "priceTypeId" in item ? item.priceTypeId : null)
            .filter((id): id is number => id !== null))];
        if (priceTypeIds.length !== 1) {
            return {
                status: "error" as const,
                priceTypeId: null,
                priceTypeName: null,
                message: "All purchase-order lines must resolve to the same Price Control pricing source."
            };
        }

        const selectedResolution = resolved.find(item => "priceTypeId" in item && item.priceTypeId === priceTypeIds[0]);
        return {
            status: "resolved" as const,
            priceTypeId: priceTypeIds[0],
            priceTypeName: selectedResolution && "priceTypeName" in selectedResolution ? (selectedResolution.priceTypeName || null) : null,
            message: null
        };
    }, [canonicalDrafting, linesForm, priceTypeRules, rawMaterials]);

    const selectedProductIdsKey = React.useMemo(
        () => linesForm.filter(line => line.product_id).map(line => String(line.product_id)).sort().join(","),
        [linesForm]
    );

    React.useEffect(() => {
        if (!canonicalDrafting) return;
        setShipmentForm(previous => {
            const nextPriceType = priceTypeResolution.status === "resolved" ? (priceTypeResolution.priceTypeName || null) : null;
            return previous.price_type === nextPriceType ? previous : { ...previous, price_type: nextPriceType };
        });
    }, [canonicalDrafting, priceTypeResolution.priceTypeName, priceTypeResolution.status, setShipmentForm]);

    useEffect(() => {
        if (canonicalDrafting) return;
        fetch("/api/manufacturing/finished-goods/price-types")
            .then(res => res.ok ? res.json() : [])
            .then(data => {
                setPriceTypes(Array.isArray(data) ? data : []);
            })
            .catch(e => console.error("Error fetching price types:", e));
    }, [canonicalDrafting]);

    useEffect(() => {
        let active = true;
        const resolvedPriceTypeId = canonicalDrafting ? priceTypeResolution.priceTypeId : null;
        if (canonicalDrafting && priceTypeResolution.status !== "resolved") {
            const reset = window.setTimeout(() => {
                if (!active) return;
                setPriceTypeRatesMap({});
                setPriceMatrixStatus("idle");
                setPriceMatrixError(null);
                setPriceMatrixMissingProductIds([]);
            }, 0);
            return () => {
                active = false;
                window.clearTimeout(reset);
            };
        }
        if (!canonicalDrafting && (!shipmentForm.price_type || priceTypes.length === 0)) {
            const reset = window.setTimeout(() => {
                if (!active) return;
                setPriceTypeRatesMap({});
                setPriceMatrixStatus("idle");
                setPriceMatrixError(null);
                setPriceMatrixMissingProductIds([]);
            }, 0);
            return () => {
                active = false;
                window.clearTimeout(reset);
            };
        }

        const match = canonicalDrafting
            ? { price_type_id: resolvedPriceTypeId! }
            : priceTypes.find(pt => {
                const ptName = String(pt.price_type_name || pt.name || "").toLowerCase();
                const ptId = String(pt.price_type_id);
                const formVal = String(shipmentForm.price_type || "").toLowerCase();
                return ptName === formVal || ptId === formVal;
            });

        if (!match) {
            const reset = window.setTimeout(() => {
                if (!active) return;
                setPriceTypeRatesMap({});
                setPriceMatrixStatus("idle");
                setPriceMatrixError(null);
                setPriceMatrixMissingProductIds([]);
            }, 0);
            return () => {
                active = false;
                window.clearTimeout(reset);
            };
        }

        const loadingState = window.setTimeout(() => {
            if (!active) return;
            setPriceMatrixStatus("loading");
            setPriceMatrixError(null);
            setPriceMatrixMissingProductIds([]);
        }, 0);
        fetch(`/api/manufacturing/finished-goods/price-types?priceTypeId=${match.price_type_id}`)
            .then(async res => {
                if (!res.ok) throw new Error("Unable to load the Price Control matrix.");
                return res.json();
            })
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

                const resolvedLines = linesFormRef.current.map(line => {
                    if (!line.product_id) return line;

                    const directRate = map[Number(line.product_id)];
                    if (directRate !== undefined && directRate > 0) return line;

                    if (!canonicalDrafting || !Array.isArray(line.uom_options)) return line;

                    const configuredUom = line.uom_options.find((option: { product_id?: number }) => {
                        const rate = map[Number(option.product_id)];
                        return Number.isFinite(rate) && rate > 0;
                    }) as { product_id?: number; parent_product_id?: number; unit_shortcut?: string } | undefined;

                    if (!configuredUom?.product_id) return line;

                    return {
                        ...line,
                        product_id: String(configuredUom.product_id),
                        parent_product_id: configuredUom.parent_product_id
                            ? String(configuredUom.parent_product_id)
                            : line.parent_product_id,
                        selected_uom: configuredUom.unit_shortcut || line.selected_uom
                    };
                });

                if (canonicalDrafting) {
                    const missingProductIds = resolvedLines
                        .filter(line => line.product_id)
                        .map(line => Number(line.product_id))
                        .filter(productId => !Number.isFinite(map[productId]) || map[productId] <= 0);
                    if (missingProductIds.length > 0) {
                        setPriceMatrixStatus("warning");
                        setPriceMatrixError(null);
                        setPriceMatrixMissingProductIds(missingProductIds);
                    } else {
                        setPriceMatrixStatus("ready");
                        setPriceMatrixError(null);
                        setPriceMatrixMissingProductIds([]);
                    }
                } else {
                    setPriceMatrixStatus("ready");
                    setPriceMatrixMissingProductIds([]);
                }

                setLinesForm(prev => prev.map((line, index) => {
                    const resolvedLine = resolvedLines[index] || line;
                    const productId = resolvedLine.product_id;
                    if (!productId) return resolvedLine;

                    const prod = rawMaterials.find(rm => String(rm.product_id) === String(productId));
                    const defaultCost = Number(prod?.cost_per_unit || prod?.estimated_unit_cost || 0);
                    const specialPrice = map[Number(productId)];
                    const resolvedPrice = canonicalDrafting
                        ? specialPrice
                        : (specialPrice !== undefined && specialPrice > 0) ? specialPrice : defaultCost;
                    
                    if (resolvedPrice !== undefined && resolvedPrice > 0) {
                        const rate = Number(shipmentForm.exchange_rate) || 1;
                        const transactionPrice = canonicalDrafting && shipmentForm.currency_code === "USD"
                            ? resolvedPrice / rate
                            : resolvedPrice;
                        return { ...resolvedLine, base_unit_cost_php: String(transactionPrice) };
                    }
                    return resolvedLine;
                }));
            })
            .catch(e => {
                if (active) {
                    console.error("Error fetching price type rates:", e);
                    setPriceMatrixStatus("error");
                    setPriceMatrixError(e instanceof Error ? e.message : "Unable to load the Price Control matrix.");
                    setPriceMatrixMissingProductIds([]);
                    if (canonicalDrafting) setPriceTypeRatesMap({});
                }
            });

        return () => {
            active = false;
            window.clearTimeout(loadingState);
        };
    }, [canonicalDrafting, priceTypeResolution.priceTypeId, priceTypeResolution.status, selectedProductIdsKey, shipmentForm.currency_code, shipmentForm.exchange_rate, shipmentForm.price_type, priceTypes, rawMaterials, setLinesForm]);

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
            const discountForeign = line.discount_mode === "Fixed Amount"
                ? DecimalValue.from(line.discount_amount || 0).toFixed(2)
                : DecimalValue.from(grossForeign).multiply(line.discount_percent || 0).divideRounded(100, 2).toFixed(2);
            const netForeign = DecimalValue.from(grossForeign).subtract(discountForeign).toFixed(2);
            return {
                grossForeign: DecimalValue.from(summary.grossForeign).add(grossForeign).toFixed(2),
                discountForeign: DecimalValue.from(summary.discountForeign).add(discountForeign).toFixed(2),
                grossPhp: DecimalValue.from(summary.grossPhp).add(DecimalValue.from(grossForeign).multiply(exchangeRate)).toFixed(2),
                discountPhp: DecimalValue.from(summary.discountPhp).add(DecimalValue.from(discountForeign).multiply(exchangeRate)).toFixed(2),
                vatPhp: "0.00",
                withholdingPhp: "0.00",
                netPhp: DecimalValue.from(summary.netPhp).add(DecimalValue.from(netForeign).multiply(exchangeRate)).toFixed(2),
                netForeign: DecimalValue.from(summary.netForeign).add(netForeign).toFixed(2)
            };
        }, {
            grossForeign: "0.00",
            discountForeign: "0.00",
            grossPhp: "0.00",
            discountPhp: "0.00",
            vatPhp: "0.00",
            withholdingPhp: "0.00",
            netPhp: "0.00",
            netForeign: "0.00"
        });
    }, [linesForm, shipmentForm.exchange_rate]);

    return {
        editingShipmentId,
        activeShipment,
        isOverridden,
        setIsOverridden,
        hasSubmitted,
        dynamicBranches,
        modalRef,
        isSupplierForeign,
        handleSupplierSelect,
        handleCurrencyChange,
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
        draftSummary,
        priceTypeResolution,
        priceMatrixStatus,
        priceMatrixError,
        priceMatrixMissingProductIds,
        fxRateStatus,
        fxRateError
    };
}
