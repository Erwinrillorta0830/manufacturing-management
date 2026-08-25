/* eslint-disable */
"use client";

import React, { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Loader2, DollarSign, AlertTriangle, Search } from "lucide-react";
import { toast } from "sonner";
import { CreatableSelect } from "../../finished-goods/components/CreatableSelect";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from "@/components/ui/alert-dialog";

import { CreateSalesOrderPayload } from "../types";

interface CreateSalesOrderModalProps {
    isOpen: boolean;
    onClose: () => void;
    // disabled-lint-next-line @typescript-eslint/no-explicit-any
    onSubmit: (payload: CreateSalesOrderPayload) => Promise<any>;
}

interface DirectOrderItem {
    line_id: number;
    parent_product_id: number;
    product_id: number;
    quantity: number;
    unit_price: number;
    discount_type?: number | null;
    discount_amount?: number;
    discount_percent?: number;
    bom_version_id?: number;
    product_type_id?: number;
}

interface LineErrors {
    product_type?: string;
    product?: string;
    uom?: string;
    quantity?: string;
    unit_price?: string;
    bom_version_id?: string;
}

interface FormErrors {
    customerId?: string;
    poNo?: string;
    branchId?: string;
    paymentTermId?: string;
    userId?: string;
    salesmanAccountId?: string;
    deliveryDate?: string;
    dueDate?: string;
    discountAmount?: string;
    items?: Record<number, LineErrors>;
}

interface VersionState {
    status: "loading" | "resolved" | "unavailable";
    label?: string;
    versions?: any[];
    defaultVersionId?: number;
}

function isStandardBOMVersion(version: any) {
    const normalizedName = String(version?.version_name ?? "")
        .trim()
        .toLowerCase()
        .replace(/[._-]+/g, " ")
        .replace(/\s+/g, " ");
    return normalizedName === "v1"
        || normalizedName === "v1 0"
        || normalizedName === "version 1"
        || normalizedName === "version 1 0"
        || normalizedName === "standard bom version 1"
        || normalizedName === "standard bom version 1 0";
}

function singularUnitName(name: string) {
    const normalized = name.trim().toLowerCase();
    if (normalized === "pieces") return "piece";
    if (normalized === "boxes") return "box";
    if (normalized.endsWith("s")) return normalized.slice(0, -1);
    return normalized;
}

function formatUomLabel(product: any, products: any[]) {
    const count = Number(product.unit_count) || 1;
    const parent = products.find(item => Number(item.product_id) === Number(product.parent_product_id)) || product;
    const baseUnitName = String(parent.unit_name || parent.unit_shortcut || "units").trim().toLowerCase();
    const countedBaseUnit = count === 1 ? singularUnitName(baseUnitName) : baseUnitName;
    const shortcut = String(product.unit_shortcut || "UNIT").toUpperCase();

    if (product.is_parent) return `${shortcut} - ${count} ${countedBaseUnit}`;
    const packageName = singularUnitName(String(product.unit_name || shortcut));
    return `${shortcut} - ${count} ${countedBaseUnit} per ${packageName}`;
}

export function CreateSalesOrderModal({
    isOpen,
    onClose,
    onSubmit
}: CreateSalesOrderModalProps) {
    const [submitting, setSubmitting] = useState(false);
    const poInputRef = useRef<HTMLInputElement>(null);
    const nextLineIdRef = useRef(1);
    const versionRequestRef = useRef(0);

    // Lookups
    // disabled-lint-next-line @typescript-eslint/no-explicit-any
    const [customers, setCustomers] = useState<any[]>([]);
    // disabled-lint-next-line @typescript-eslint/no-explicit-any
    const [products, setProducts] = useState<any[]>([]);
    // disabled-lint-next-line @typescript-eslint/no-explicit-any
    const [branches, setBranches] = useState<any[]>([]);
    // disabled-lint-next-line @typescript-eslint/no-explicit-any
    const [paymentTerms, setPaymentTerms] = useState<any[]>([]);
    // disabled-lint-next-line @typescript-eslint/no-explicit-any
    const [salesmen, setSalesmen] = useState<any[]>([]);
    // disabled-lint-next-line @typescript-eslint/no-explicit-any
    const [users, setUsers] = useState<any[]>([]);
    // disabled-lint-next-line @typescript-eslint/no-explicit-any
    const [productTypes, setProductTypes] = useState<any[]>([]);

    const [loadingLookups, setLoadingLookups] = useState(false);
    const [lookupError, setLookupError] = useState("");

    // Form fields
    const [customerId, setCustomerId] = useState("");
    const [poNo, setPoNo] = useState("");
    const [branchId, setBranchId] = useState("");
    const [paymentTermId, setPaymentTermId] = useState("");
    const [userId, setUserId] = useState("");
    const [salesmanAccountId, setSalesmanAccountId] = useState("");
    const [deliveryDate, setDeliveryDate] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [remarks, setRemarks] = useState("");
    const [overrideLeadTime, setOverrideLeadTime] = useState(false);

    // Detail Items
    const [items, setItems] = useState<DirectOrderItem[]>([]);
    const [productSearch, setProductSearch] = useState("");
    const [formErrors, setFormErrors] = useState<FormErrors>({});
    const [discardOpen, setDiscardOpen] = useState(false);

    const [customerOverrides, setCustomerOverrides] = useState<Record<number, number>>({});
    const [versionStates, setVersionStates] = useState<Record<number, VersionState>>({});

    const getLeadTimeStatus = () => {
        if (!deliveryDate || items.length === 0) return { feasible: true, maxLeadDays: 0, requiredDate: null };
        
        let maxLeadDays = 0;
        items.forEach(item => {
            if (item.product_id) {
                const prod = products.find(p => Number(p.product_id) === Number(item.product_id));
                if (prod && prod.manufacturing_lead_days) {
                    maxLeadDays = Math.max(maxLeadDays, Number(prod.manufacturing_lead_days));
                }
            }
        });

        if (maxLeadDays === 0) return { feasible: true, maxLeadDays: 0, requiredDate: null };

        const orderDateObj = new Date();
        const requiredDateObj = new Date(orderDateObj.getTime() + maxLeadDays * 24 * 60 * 60 * 1000);
        
        // Format required date as YYYY-MM-DD local time safely
        const offset = requiredDateObj.getTimezoneOffset();
        const localRequiredDateObj = new Date(requiredDateObj.getTime() - offset * 60 * 1000);
        const requiredDateStr = localRequiredDateObj.toISOString().split('T')[0];

        const feasible = deliveryDate >= requiredDateStr;
        return { feasible, maxLeadDays, requiredDate: requiredDateStr };
    };

    useEffect(() => {
        if (!customerId) {
            setCustomerOverrides({});
            return;
        }
        const controller = new AbortController();
        fetch(`/api/manufacturing/finished-goods/customer-product-version?customerId=${customerId}`, {
            signal: controller.signal
        })
            .then(r => r.ok ? r.json() : [])
            .then(data => {
                const map: Record<number, number> = {};
                data.forEach((item: any) => {
                    map[Number(item.product_id)] = Number(item.version_id);
                });
                setCustomerOverrides(map);
            })
            .catch(err => {
                if (err?.name !== "AbortError") console.error("Error loading overrides in modal:", err);
            });
        return () => controller.abort();
    }, [customerId]);

    useEffect(() => {
        setVersionStates({});
    }, [customerId]);

    useEffect(() => {
        const productIds = [...new Set(items.map(item => Number(item.product_id)).filter(Boolean))];
        const requestId = ++versionRequestRef.current;
        const controller = new AbortController();
        if (productIds.length === 0) {
            setVersionStates({});
            return () => controller.abort();
        }

        setVersionStates(Object.fromEntries(productIds.map(id => [id, { status: "loading" }])));
        Promise.all(productIds.map(async productId => {
            try {
                const response = await fetch(`/api/manufacturing/finished-goods/versions?productId=${productId}`, {
                    signal: controller.signal
                });
                if (!response.ok) return [productId, { status: "unavailable" }] as const;
                const versions = await response.json();
                const overrideVersionId = customerOverrides[productId];
                const overrideVersion = overrideVersionId
                    ? versions.find((version: any) => Number(version.version_id) === overrideVersionId)
                    : null;
                const standardVersion = versions.find((version: any) => (
                    (version.status === "Active" || version.is_active) && isStandardBOMVersion(version)
                ));
                const matchedVersion = overrideVersion
                    || standardVersion
                    || versions.find((version: any) => version.status === "Active" || version.is_active);
                if (!matchedVersion) return [productId, { status: "unavailable" }] as const;
                const suffix = overrideVersion ? "Override" : standardVersion === matchedVersion ? "Standard" : "Active fallback";
                return [productId, {
                    status: "resolved",
                    label: `${matchedVersion.version_name} (${suffix})`,
                    versions,
                    defaultVersionId: Number(matchedVersion.version_id)
                }] as const;
            } catch (error) {
                if ((error as Error)?.name === "AbortError") return null;
                console.error("Error fetching version details in modal:", error);
                return [productId, { status: "unavailable" }] as const;
            }
        })).then(results => {
            if (requestId !== versionRequestRef.current) return;
            setVersionStates(Object.fromEntries(results.filter(Boolean) as Array<readonly [number, VersionState]>));
        });

        return () => controller.abort();
    }, [items.map(item => item.product_id).join(","), customerOverrides]);

    useEffect(() => {
        if (!isOpen) return;

        if (!isOpen) {
            setCustomerId("");
            setPoNo("");
            setBranchId("");
            setPaymentTermId("");
            setUserId("");
            setSalesmanAccountId("");
            setDeliveryDate("");
            setDueDate("");
            setRemarks("");
            setOverrideLeadTime(false);
            setItems([]);
            setFormErrors({});
            nextLineIdRef.current = 1;
        } else {
            setLoadingLookups(true);
            fetch("/api/manufacturing/sales-order?action=create-lookups")
                .then(res => res.json())
                .then(data => {
                    setCustomers(data.customers || []);
                    setProducts(data.products || []);
                    setBranches(data.branches || []);
                    setPaymentTerms(data.paymentTerms || []);
                    setSalesmen(data.salesmen || []);
                    setUsers(data.users || []);
                    setProductTypes(data.productTypes || []);
                    setLookupError("");
                })
                .catch(err => setLookupError(err.message || "Failed to load lookup data."))
                .finally(() => setLoadingLookups(false));
        };
    }, [isOpen]);

    const fetchLineDiscount = async (cId: string, pId: number, basePrice: number) => {
        if (!cId || !pId) return { discountType: null, discountAmount: 0 };
        try {
            const customer = customers.find(c => String(c.id) === cId);
            const customerCode = customer?.customer_code;
            if (!customerCode) return { discountType: null, discountAmount: 0 };

            const res = await fetch(`/api/manufacturing/financial-management/discount-management/customer-discounting/pricing?customerCode=${customerCode}&productId=${pId}&basePrice=${basePrice}`);
            if (res.ok) {
                const data = await res.json();
                const discountAmount = typeof data.finalPrice === 'number' && typeof basePrice === 'number'
                    ? basePrice - data.finalPrice
                    : 0;
                return { 
                    discountType: data.discount?.id || null, 
                    discountAmount: discountAmount,
                    discountPercent: data.discount?.totalPercent || 0
                };
            }
        } catch (e) {
            console.error("Failed to fetch discount", e);
        }
        return { discountType: null, discountAmount: 0, discountPercent: 0 };
    };

    useEffect(() => {
        if (!isOpen || loadingLookups) return;
        poInputRef.current?.focus();
    }, [isOpen, loadingLookups]);

    const handleCustomerChange = async (value: string) => {
        setCustomerId(value);
        setFormErrors(previous => ({ ...previous, customerId: undefined }));
        const customer = customers.find(item => String(item.id) === value);
        const defaultPaymentTermId = Number(customer?.payment_term_id);
        const hasConfiguredTerm = Number.isSafeInteger(defaultPaymentTermId)
            && defaultPaymentTermId > 0
            && paymentTerms.some(term => Number(term.id) === defaultPaymentTermId);
        setPaymentTermId(hasConfiguredTerm ? String(defaultPaymentTermId) : "");

        // Refetch discounts for existing items if they have product selected
        setItems(prev => {
            const newItems = [...prev];
            Promise.all(newItems.map(async (item, i) => {
                if (item.product_id) {
                    const { discountType, discountAmount, discountPercent } = await fetchLineDiscount(value, item.product_id, item.unit_price);
                    setItems(current => current.map((curr, idx) => idx === i ? {
                        ...curr,
                        discount_type: discountType,
                        discount_amount: discountAmount,
                        discount_percent: discountPercent
                    } : curr));
                }
            }));
            return newItems;
        });
    };

    // Dynamically calculate Due Date whenever paymentTermId or deliveryDate changes
    useEffect(() => {
        if (!paymentTermId) {
            setDueDate("");
            return;
        }
        const term = paymentTerms.find(t => String(t.id) === String(paymentTermId));
        const days = Number(term?.payment_days ?? term?.days ?? 0);
        const baseDateStr = deliveryDate || new Date().toISOString().split("T")[0];
        const [year, month, day] = baseDateStr.split("-").map(Number);
        if (!year || !month || !day) return;
        const targetDate = new Date(Date.UTC(year, month - 1, day + days));
        const calculatedDueDate = targetDate.toISOString().split("T")[0];
        setDueDate(calculatedDueDate);
        setFormErrors(prev => ({ ...prev, dueDate: undefined }));
    }, [paymentTermId, deliveryDate, paymentTerms]);

    const handleAddItem = () => {
        setItems(prev => [...prev, {
            line_id: nextLineIdRef.current++,
            product_type_id: 0,
            parent_product_id: 0,
            product_id: 0,
            quantity: 1,
            unit_price: 0
        }]);
        setFormErrors(previous => {
            const itemErrors = { ...(previous.items || {}) };
            delete itemErrors[0];
            return { ...previous, items: itemErrors };
        });
    };

    const handleRemoveItem = (index: number) => {
        const lineId = items[index]?.line_id;
        setItems(prev => prev.filter((_, idx) => idx !== index));
        if (lineId) {
            setFormErrors(previous => {
                const itemErrors = { ...(previous.items || {}) };
                delete itemErrors[lineId];
                return { ...previous, items: itemErrors };
            });
        }
    };

    const clearLineError = (lineId: number, field: keyof LineErrors) => {
        setFormErrors(previous => ({
            ...previous,
            items: {
                ...(previous.items || {}),
                [lineId]: { ...(previous.items?.[lineId] || {}), [field]: undefined }
            }
        }));
    };

    const handleProductTypeChange = (index: number, productTypeId: number) => {
        const lineId = items[index]?.line_id;
        if (lineId) {
            clearLineError(lineId, "product_type");
            clearLineError(lineId, "product");
            clearLineError(lineId, "uom");
        }
        setItems(prev => prev.map((item, idx) => {
            if (idx !== index) return item;
            return {
                ...item,
                product_type_id: productTypeId,
                parent_product_id: 0,
                product_id: 0,
                unit_price: 0,
                discount_type: null,
                discount_amount: 0,
                discount_percent: 0,
                bom_version_id: undefined
            };
        }));
    };

    const handleParentProductChange = async (index: number, parentProductId: number) => {
        const lineId = items[index]?.line_id;
        if (lineId) {
            clearLineError(lineId, "product");
            clearLineError(lineId, "uom");
        }
        
        const usedVariantIds = new Set(items
            .filter((_, otherIndex) => otherIndex !== index)
            .map(otherItem => Number(otherItem.product_id))
            .filter(Boolean));
        const variants = products
            .filter(product => Number(product.parent_product_id) === parentProductId)
            .sort((a, b) => Number(b.is_parent) - Number(a.is_parent) || Number(a.unit_count) - Number(b.unit_count));
        const defaultVariant = variants.find(variant => !usedVariantIds.has(Number(variant.product_id)));
        
        const newProductId = defaultVariant ? Number(defaultVariant.product_id) : 0;
        const newUnitPrice = defaultVariant ? Number(defaultVariant.price_per_unit || defaultVariant.cost_per_unit || 0) : 0;

        const { discountType, discountAmount, discountPercent } = await fetchLineDiscount(customerId, newProductId, newUnitPrice);

        setItems(prev => prev.map((item, idx) => {
            if (idx !== index) return item;
            return {
                ...item,
                parent_product_id: parentProductId,
                product_id: newProductId,
                unit_price: newUnitPrice,
                discount_type: discountType,
                discount_amount: discountAmount,
                discount_percent: discountPercent
            };
        }));
    };

    const handleUomChange = async (index: number, productId: number) => {
        const variant = products.find(product => Number(product.product_id) === productId);
        const lineId = items[index]?.line_id;
        if (lineId) clearLineError(lineId, "uom");
        
        const unitPrice = variant ? Number(variant.price_per_unit || variant.cost_per_unit || 0) : 0;
        const { discountType, discountAmount, discountPercent } = await fetchLineDiscount(customerId, productId, unitPrice);

        setItems(prev => prev.map((item, idx) => idx === index ? {
                ...item,
                product_id: productId,
                unit_price: unitPrice,
                discount_type: discountType,
                discount_amount: discountAmount,
                discount_percent: discountPercent
            } : item));
    };

    const handleItemChange = (index: number, field: "quantity" | "unit_price" | "bom_version_id", value: number) => {
        const lineId = items[index]?.line_id;
        if (lineId) clearLineError(lineId, field as keyof LineErrors);
        setItems(prev => prev.map((item, idx) => idx === index ? { ...item, [field]: value } : item));
    };

    const subTotal = items.reduce((sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0), 0);
    const totalDiscountAmount = items.reduce((sum, item) => sum + (item.discount_amount || 0) * (item.quantity || 0), 0);
    const grandTotal = subTotal - totalDiscountAmount;

    const isDirty = Boolean(
        customerId || poNo || branchId || paymentTermId || userId || salesmanAccountId
        || deliveryDate || dueDate || remarks || items.length
    );

    const requestClose = () => {
        if (submitting) return;
        if (isDirty) {
            setDiscardOpen(true);
            return;
        }
        onClose();
    };

    const validateForm = () => {
        const errors: FormErrors = { items: {} };
        let valid = true;
        if (!poNo.trim()) { errors.poNo = "PO Number is required"; valid = false; }
        if (!customerId) { errors.customerId = "Customer is required"; valid = false; }
        if (!branchId) { errors.branchId = "Production Branch is required"; valid = false; }
        if (!paymentTermId) { errors.paymentTermId = "Payment Terms are required"; valid = false; }
        if (!userId) { errors.userId = "Salesman is required"; valid = false; }
        if (!salesmanAccountId) { errors.salesmanAccountId = "Salesman Account is required"; valid = false; }
        if (!deliveryDate) {
            errors.deliveryDate = "Delivery Date is required";
            valid = false;
        }
        if (!dueDate) errors.dueDate = "Due date must be calculated.";

        const leadTime = getLeadTimeStatus();
        if (!leadTime.feasible && !overrideLeadTime) {
            errors.deliveryDate = `Delivery date is earlier than required lead time (${leadTime.maxLeadDays} days).`;
            valid = false;
        }

        const seenProductIds = new Set<number>();
        items.forEach(item => {
            const lineErrors: LineErrors = {};
            if (!item.product_type_id) lineErrors.product_type = "Select a product type.";
            if (!item.parent_product_id) lineErrors.product = "Select a parent product.";
            if (!item.product_id) lineErrors.uom = "Select an available UOM.";
            if (item.product_id && seenProductIds.has(item.product_id)) lineErrors.uom = "This product and UOM are already selected.";
            if (item.product_id) {
                seenProductIds.add(item.product_id);
                
                const prod = products.find(p => Number(p.product_id) === Number(item.parent_product_id));
                const typeObj = prod ? productTypes.find(t => String(t.id) === String(prod.product_type)) : null;
                const isFinishedGood = typeObj && typeObj.name === 'Finished Goods';

                if (isFinishedGood) {
                    const versionState = versionStates[item.product_id];
                    if (!versionState || versionState.status === "loading") lineErrors.product = "BOM version is still loading.";
                    if (versionState?.status === "unavailable") lineErrors.product = "No active BOM version is available.";
                }
            }
            if (!Number.isFinite(item.quantity) || item.quantity <= 0) lineErrors.quantity = "Quantity must be greater than zero.";
            if (!Number.isFinite(item.unit_price) || item.unit_price <= 0) lineErrors.unit_price = "Unit price must be explicitly greater than ₱0.00.";
            if (Object.keys(lineErrors).length > 0) {
                errors.items![item.line_id] = lineErrors;
                valid = false;
            }
        });
        if (items.length === 0) {
            errors.items = { 0: { product: "Add at least one product." } };
            valid = false;
        }
        if (grandTotal <= 0 && items.length > 0) errors.dueDate = "Total net amount must be greater than ₱0.00.";

        setFormErrors(errors);
        if (!valid) {
            requestAnimationFrame(() => {
                const firstInvalid = document.querySelector<HTMLElement>('[data-slot="dialog-content"] [aria-invalid="true"]');
                firstInvalid?.focus();
            });
        }
        return valid;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (lookupError || customers.length === 0 || products.length === 0) {
            return toast.error("Customer and product directories must load before creating a sales order.");
        }
        if (!validateForm()) return;

        setSubmitting(true);
        const leadTime = getLeadTimeStatus();
        const finalRemarks = (!leadTime.feasible && overrideLeadTime)
            ? `${remarks ? remarks + '\n' : ''}[USER OVERRIDE: Lead time feasibility bypassed]`
            : remarks;

        try {
            await onSubmit({
                customerId: Number(customerId),
                poNo,
                branchId: Number(branchId),
                paymentTerms: Number(paymentTermId),
                salesmanId: salesmanAccountId ? Number(salesmanAccountId) : undefined,
                deliveryDate,
                dueDate,
                remarks: finalRemarks,
                items: items.map(item => ({
                    parent_product_id: item.parent_product_id,
                    product_id: item.product_id,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    discount_type: item.discount_type,
                    discount_amount: item.discount_amount,
                    discount_percent: item.discount_percent,
                    bom_version_id: item.bom_version_id
                }))
            });
            onClose();
        } catch (err) {
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    const handleFormKeyDown = (e: React.KeyboardEvent) => {
        // Prevent form submission on hitting Enter in input fields
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
            e.preventDefault();
        }
        // Keyboard Shortcut: Alt + A adds a product row
        if (e.altKey && e.key.toLowerCase() === "a") {
            e.preventDefault();
            handleAddItem();
        }
    };

    if (!isOpen) return null;

    const lookupsReady = !lookupError && customers.length > 0 && products.length > 0;
    const fieldLabelClassName = "block text-xs font-semibold text-foreground";
    const inputClassName = "h-9 w-full rounded-md border bg-background px-3 text-xs font-semibold outline-none focus:border-primary focus:ring-1 focus:ring-primary aria-invalid:border-destructive";

    return (
        <>
            <Dialog open={isOpen} onOpenChange={open => { if (!open) requestClose(); }}>
                <DialogContent
                    className="flex max-h-[95vh] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:w-[80vw] sm:max-w-[80vw]"
                    onOpenAutoFocus={event => {
                        event.preventDefault();
                        poInputRef.current?.focus();
                    }}
                >
                    <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12 text-left">
                        <DialogTitle>Create Direct Sales Order</DialogTitle>
                        <DialogDescription>Enter the customer, fulfillment, and product details.</DialogDescription>
                    </DialogHeader>
                {loadingLookups ? (
                    <div className="p-20 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <span className="text-xs">Loading dependencies...</span>
                    </div>
                ) : (
                    <form
                        onSubmit={handleSubmit}
                        onKeyDown={handleFormKeyDown}
                        className="flex min-h-0 flex-1 flex-col"
                    >
                        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6 pb-40">
                        {lookupError && (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                                {lookupError}
                            </div>
                        )}
                        {/* Header Fields */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="space-y-1.5">
                                <label htmlFor="direct-so-po" className={fieldLabelClassName}>PO Number <span className="text-destructive">*</span></label>
                                <input
                                    id="direct-so-po"
                                    ref={poInputRef}
                                    type="text"
                                    value={poNo}
                                    onChange={event => {
                                        setPoNo(event.target.value);
                                        setFormErrors(previous => ({ ...previous, poNo: undefined }));
                                    }}
                                    placeholder="e.g. PO-88902"
                                    aria-invalid={Boolean(formErrors.poNo)}
                                    aria-describedby={formErrors.poNo ? "direct-so-po-error" : undefined}
                                    className={inputClassName}
                                />
                                {formErrors.poNo && <p id="direct-so-po-error" className="text-xs text-destructive">{formErrors.poNo}</p>}
                            </div>

                            <div className="space-y-1.5">
                                <label className={fieldLabelClassName}>Customer <span className="text-destructive">*</span></label>
                                <CreatableSelect
                                    options={customers.map(c => ({ value: String(c.id), label: `${c.customer_name} (${c.customer_code})` }))}
                                    value={customerId}
                                    onValueChange={handleCustomerChange}
                                    placeholder="Select Customer..."
                                    className="h-9 text-xs"
                                    disabled={!lookupsReady}
                                    aria-label="Customer"
                                    aria-invalid={Boolean(formErrors.customerId)}
                                    aria-describedby={formErrors.customerId ? "direct-so-customer-error" : undefined}
                                />
                                {formErrors.customerId && <p id="direct-so-customer-error" className="text-xs text-destructive">{formErrors.customerId}</p>}
                            </div>

                            <div className="space-y-1.5">
                                <label className={fieldLabelClassName}>Production Branch <span className="text-destructive">*</span></label>
                                <CreatableSelect
                                    options={branches.map(b => ({ value: String(b.id), label: b.branch_name }))}
                                    value={branchId}
                                    onValueChange={val => {
                                        setBranchId(val);
                                        setFormErrors(prev => ({ ...prev, branchId: undefined }));
                                    }}
                                    placeholder="Select Branch..."
                                    className="h-9 text-xs"
                                    aria-label="Production branch"
                                    aria-invalid={Boolean(formErrors.branchId)}
                                />
                                {formErrors.branchId && <p className="text-xs text-destructive">{formErrors.branchId}</p>}
                            </div>

                            <div className="space-y-1.5">
                                <label className={fieldLabelClassName}>Payment Terms <span className="text-destructive">*</span></label>
                                <CreatableSelect
                                    options={paymentTerms.map(t => ({ value: String(t.id), label: `${t.payment_name} (${t.payment_days} days)` }))}
                                    value={paymentTermId}
                                    onValueChange={val => {
                                        setPaymentTermId(val);
                                        setFormErrors(prev => ({ ...prev, paymentTermId: undefined }));
                                    }}
                                    placeholder="Select Terms..."
                                    className="h-9 text-xs"
                                    aria-label="Payment terms"
                                    aria-invalid={Boolean(formErrors.paymentTermId)}
                                />
                                {formErrors.paymentTermId && <p className="text-xs text-destructive">{formErrors.paymentTermId}</p>}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="space-y-1.5">
                                <label className={fieldLabelClassName}>Salesman <span className="text-destructive">*</span></label>
                                <CreatableSelect
                                    options={users
                                        .filter(u => salesmen.some(s => Number(s.employee_id) === Number(u.user_id)))
                                        .map(u => ({ value: String(u.user_id), label: `${u.user_fname} ${u.user_lname}` }))}
                                    value={userId}
                                    onValueChange={val => {
                                        setUserId(val);
                                        setSalesmanAccountId("");
                                        setFormErrors(prev => ({ ...prev, userId: undefined, salesmanAccountId: undefined }));
                                    }}
                                    placeholder="Select Salesman..."
                                    className="h-9 text-xs"
                                    aria-label="Salesman"
                                    aria-invalid={Boolean(formErrors.userId)}
                                />
                                {formErrors.userId && <p className="text-xs text-destructive">{formErrors.userId}</p>}
                            </div>

                            <div className="space-y-1.5">
                                <label className={fieldLabelClassName}>Salesman Account <span className="text-destructive">*</span></label>
                                <CreatableSelect
                                    options={salesmen
                                        .filter(s => Number(s.employee_id) === Number(userId))
                                        .map(s => ({ value: String(s.id), label: s.salesman_name }))}
                                    value={salesmanAccountId}
                                    onValueChange={val => {
                                        setSalesmanAccountId(val);
                                        setFormErrors(prev => ({ ...prev, salesmanAccountId: undefined }));
                                    }}
                                    placeholder="Select Account..."
                                    className="h-9 text-xs"
                                    disabled={!userId}
                                    aria-label="Salesman Account"
                                    aria-invalid={Boolean(formErrors.salesmanAccountId)}
                                />
                                {formErrors.salesmanAccountId && <p className="text-xs text-destructive">{formErrors.salesmanAccountId}</p>}
                            </div>

                            <div className="space-y-1.5">
                                <label htmlFor="direct-so-delivery-date" className={fieldLabelClassName}>Delivery Date <span className="text-destructive">*</span></label>
                                <input
                                    id="direct-so-delivery-date"
                                    type="date"
                                    value={deliveryDate}
                                    onChange={e => {
                                        setDeliveryDate(e.target.value);
                                        setFormErrors(prev => ({ ...prev, deliveryDate: undefined }));
                                    }}
                                    className={`${inputClassName} dark:[color-scheme:dark]`}
                                    aria-invalid={Boolean(formErrors.deliveryDate)}
                                />
                                {formErrors.deliveryDate && <p className="text-xs text-destructive">{formErrors.deliveryDate}</p>}
                            </div>

                            <div className="space-y-1.5">
                                <label htmlFor="direct-so-due-date" className={fieldLabelClassName}>Due Date <span className="text-destructive">*</span></label>
                                <input
                                    id="direct-so-due-date"
                                    type="date"
                                    value={dueDate}
                                    readOnly
                                    title="System-calculated based on Payment Terms"
                                    className={`${inputClassName} dark:[color-scheme:dark] bg-muted cursor-not-allowed text-muted-foreground`}
                                    aria-invalid={Boolean(formErrors.dueDate)}
                                />
                                {formErrors.dueDate && <p className="text-xs text-destructive">{formErrors.dueDate}</p>}
                            </div>

                            {/* Lead time feasibility warning alert */}
                            {(() => {
                                const leadTime = getLeadTimeStatus();
                                if (leadTime.feasible) return null;
                                return (
                                    <div className="col-span-1 md:col-span-4 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-lg p-3 text-xs flex flex-col gap-1.5 mt-1">
                                        <div className="font-bold flex items-center gap-1.5">
                                            ⚠️ Lead Time Feasibility Warning
                                        </div>
                                        <div>
                                            The requested delivery date of <strong>{deliveryDate}</strong> is earlier than the standard manufacturing lead time of <strong>{leadTime.maxLeadDays} days</strong> (Earliest feasible date: <strong>{leadTime.requiredDate}</strong>).
                                        </div>
                                        <label className="flex items-center gap-1.5 mt-1 font-semibold cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={overrideLeadTime} 
                                                onChange={e => {
                                                    setOverrideLeadTime(e.target.checked);
                                                    if (e.target.checked) {
                                                        setFormErrors(prev => ({ ...prev, deliveryDate: undefined }));
                                                    }
                                                }}
                                                className="rounded border-gray-300 text-primary focus:ring-primary h-3.5 w-3.5"
                                            />
                                            Override lead time feasibility constraint
                                        </label>
                                    </div>
                                );
                            })()}
                        </div>

                        <div className="space-y-1">
                            <label htmlFor="direct-so-remarks" className={fieldLabelClassName}>Remarks / Special Instructions</label>
                            <textarea
                                id="direct-so-remarks"
                                value={remarks}
                                onChange={e => setRemarks(e.target.value)}
                                placeholder="Add general remarks, freight instructions, or delivery guidelines here..."
                                rows={2}
                                className="w-full bg-background border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-none font-semibold"
                            />
                        </div>

                        {/* Order Items Section */}
                        <div className="space-y-3 border-t pt-4">
                            <div className="flex items-center justify-between mb-3">
                                <h5 className="text-sm font-semibold text-foreground">Order Products</h5>
                                <div className="relative w-64">
                                    <Search className="absolute left-2.5 top-1.5 h-4 w-4 text-muted-foreground" />
                                    <input
                                        type="text"
                                        placeholder="Search inserted products..."
                                        value={productSearch}
                                        onChange={(e) => setProductSearch(e.target.value)}
                                        className="w-full bg-background border rounded-lg pl-9 pr-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary focus:border-primary font-semibold"
                                    />
                                </div>
                            </div>
                            {formErrors.items?.[0]?.product && <p id="direct-so-items-error" className="text-xs text-destructive">{formErrors.items[0].product}</p>}

                            <div className="overflow-visible rounded-md border bg-card">
                                <table className="block w-full text-left text-xs md:table">
                                    <thead className="hidden md:table-header-group">
                                        <tr className="border-b bg-muted/40 text-xs font-semibold text-muted-foreground">
                                            <th className="py-2.5 px-4 w-[18%]">Product Type</th>
                                            <th className="py-2.5 px-4 w-[20%]">Parent product</th>
                                            <th className="py-2.5 px-4 w-[15%]">Version</th>
                                            <th className="py-2.5 px-4 w-28">UOM</th>
                                            <th className="py-2.5 px-4 text-right w-24">Unit Price (PHP)</th>
                                            <th className="py-2.5 px-4 text-right w-24">Discount (PHP)</th>
                                            <th className="py-2.5 px-4 text-right w-20">Quantity</th>
                                            <th className="py-2.5 px-4 text-right">Total Net</th>
                                            <th className="py-2.5 px-4 text-center">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="block divide-y md:table-row-group">
                                        {items.length === 0 ? (
                                            <tr className="block md:table-row">
                                                <td colSpan={8} className="py-8 text-center text-muted-foreground italic font-semibold">
                                                    No products added.
                                                </td>
                                            </tr>
                                        ) : (
                                            (() => {
                                                const filteredItems = items.filter(item => {
                                                    if (!productSearch.trim()) return true;
                                                    const query = productSearch.toLowerCase();
                                                    const parentProd = products.find(p => Number(p.product_id) === Number(item.parent_product_id));
                                                    const uomProd = products.find(p => Number(p.product_id) === Number(item.product_id));
                                                    const parentLabel = parentProd ? `${parentProd.product_name} ${parentProd.product_code || ""}`.toLowerCase() : "";
                                                    const uomLabel = uomProd ? formatUomLabel(uomProd, products).toLowerCase() : "";
                                                    return parentLabel.includes(query) || uomLabel.includes(query);
                                                });
                                                
                                                if (filteredItems.length === 0) {
                                                    return (
                                                        <tr className="block md:table-row">
                                                            <td colSpan={8} className="py-8 text-center text-muted-foreground italic font-semibold">
                                                                No products match your search.
                                                            </td>
                                                        </tr>
                                                    );
                                                }

                                                return filteredItems.map((item) => {
                                                    const trueIndex = items.findIndex(it => it.line_id === item.line_id);
                                                const totalNet = Number(item.unit_price || 0) * Number(item.quantity || 0);
                                                const otherSelectedVariantIds = items
                                                    .map((it, idx) => idx !== trueIndex ? it.product_id : 0)
                                                    .filter(id => id > 0);
                                                const parentOptions = products
                                                    .filter(product => product.is_parent)
                                                    .filter(p => {
                                                        if (item.product_type_id && Number(p.product_type) !== item.product_type_id) return false;
                                                        const totalVariants = products.filter(child => Number(child.parent_product_id) === Number(p.product_id)).length || 1;
                                                        const usedVariantsCount = items.filter((it, idx) => idx !== trueIndex && Number(it.parent_product_id) === Number(p.product_id) && it.product_id > 0).length;
                                                        return usedVariantsCount < totalVariants;
                                                    })
                                                    .map(p => ({
                                                        value: String(p.product_id),
                                                        label: `${p.product_name} (${p.product_code || `SKU-${p.product_id}`})`
                                                    }));
                                                const uomOptions = products
                                                    .filter(product => Number(product.parent_product_id) === Number(item.parent_product_id))
                                                    .filter(product => Number(product.product_id) === Number(item.product_id)
                                                        || !otherSelectedVariantIds.includes(Number(product.product_id)))
                                                    .sort((a, b) => Number(b.is_parent) - Number(a.is_parent) || Number(a.unit_count) - Number(b.unit_count))
                                                    .map(product => ({
                                                        value: String(product.product_id),
                                                        label: formatUomLabel(product, products)
                                                    }));
                                                return (
                                                    <tr key={item.line_id} className="grid grid-cols-1 gap-3 p-3 font-semibold text-foreground hover:bg-muted/5 md:table-row md:p-0">
                                                        <td className="block overflow-visible p-0 md:table-cell md:p-3">
                                                            <span className="mb-1 block text-xs font-semibold md:hidden">Product Type</span>
                                                            <CreatableSelect
                                                                options={productTypes.map(t => ({ value: String(t.id), label: t.name }))}
                                                                value={item.product_type_id ? String(item.product_type_id) : ""}
                                                                onValueChange={val => handleProductTypeChange(trueIndex, Number(val))}
                                                                placeholder="Choose Type..."
                                                                className="h-8 text-xs font-semibold"
                                                                disabled={!lookupsReady}
                                                                aria-label={`Product type for line ${trueIndex + 1}`}
                                                                aria-invalid={Boolean(formErrors.items?.[item.line_id]?.product_type)}
                                                                aria-describedby={formErrors.items?.[item.line_id]?.product_type ? `line-${item.line_id}-product-type-error` : undefined}
                                                            />
                                                            {formErrors.items?.[item.line_id]?.product_type && <p id={`line-${item.line_id}-product-type-error`} className="mt-1 text-xs text-destructive">{formErrors.items[item.line_id].product_type}</p>}
                                                        </td>
                                                        <td className="block overflow-visible p-0 md:table-cell md:p-3">
                                                            <span className="mb-1 block text-xs font-semibold md:hidden">Parent Product</span>
                                                            <CreatableSelect
                                                                options={parentOptions}
                                                                value={item.parent_product_id ? String(item.parent_product_id) : ""}
                                                                onValueChange={val => handleParentProductChange(trueIndex, Number(val))}
                                                                placeholder="Choose Parent Product..."
                                                                className="h-8 text-xs font-semibold"
                                                                disabled={!lookupsReady || !item.product_type_id}
                                                                aria-label={`Parent product for line ${trueIndex + 1}`}
                                                                aria-invalid={Boolean(formErrors.items?.[item.line_id]?.product)}
                                                                aria-describedby={formErrors.items?.[item.line_id]?.product ? `line-${item.line_id}-product-error` : undefined}
                                                            />
                                                            {formErrors.items?.[item.line_id]?.product && <p id={`line-${item.line_id}-product-error`} className="mt-1 text-xs text-destructive">{formErrors.items[item.line_id].product}</p>}
                                                        </td>
                                                        <td className="block overflow-visible p-0 md:table-cell md:p-3">
                                                            <span className="mb-1 block text-xs font-semibold md:hidden">Version</span>
                                                            {Number(item.product_id) > 0 && versionStates[item.product_id]?.versions && versionStates[item.product_id]!.versions!.length > 0 ? (
                                                                versionStates[item.product_id]?.status === "loading" ? (
                                                                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Resolving...</span>
                                                                ) : versionStates[item.product_id]?.status === "resolved" ? (
                                                                    <select
                                                                        value={item.bom_version_id || versionStates[item.product_id]?.defaultVersionId || ""}
                                                                        onChange={e => handleItemChange(trueIndex, "bom_version_id", Number(e.target.value))}
                                                                        className="h-8 w-full text-xs font-semibold bg-background border rounded px-1.5 outline-none focus:ring-1 focus:ring-primary focus:border-primary text-primary truncate max-w-[150px]"
                                                                    >
                                                                        {versionStates[item.product_id]?.versions?.map((v: any) => (
                                                                            <option key={v.version_id} value={v.version_id}>
                                                                                {v.version_name} {Number(v.version_id) === versionStates[item.product_id]?.defaultVersionId ? "(Default)" : ""}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                ) : <span className="text-[10px] text-muted-foreground">Unavailable</span>
                                                            ) : (
                                                                <span className="text-muted-foreground text-xs font-semibold text-center block">-</span>
                                                            )}
                                                        </td>
                                                        <td className="block overflow-visible p-0 md:table-cell md:w-44 md:min-w-44 md:p-3">
                                                            <span className="mb-1 block text-xs font-semibold md:hidden">Unit of Measure</span>
                                                            <CreatableSelect
                                                                options={uomOptions}
                                                                value={item.product_id ? String(item.product_id) : ""}
                                                                onValueChange={val => handleUomChange(trueIndex, Number(val))}
                                                                placeholder="Choose UOM..."
                                                                className="h-8 text-xs font-semibold"
                                                                disabled={!item.parent_product_id || uomOptions.length === 0}
                                                                aria-label={`Unit of measure for line ${trueIndex + 1}`}
                                                                aria-invalid={Boolean(formErrors.items?.[item.line_id]?.uom)}
                                                                aria-describedby={formErrors.items?.[item.line_id]?.uom ? `line-${item.line_id}-uom-error` : undefined}
                                                            />
                                                            {formErrors.items?.[item.line_id]?.uom && <p id={`line-${item.line_id}-uom-error`} className="mt-1 text-xs text-destructive">{formErrors.items[item.line_id].uom}</p>}
                                                            {item.parent_product_id > 0 && uomOptions.length === 0 && <p className="mt-1 text-xs text-muted-foreground">No additional UOM is available.</p>}
                                                        </td>
                                                        <td className="block p-0 md:table-cell md:w-28 md:p-3 md:text-right">
                                                            <span className="mb-1 block text-xs font-semibold md:hidden">Unit Price</span>
                                                            <div className="h-8 flex items-center justify-end px-2 text-xs font-semibold font-mono text-muted-foreground bg-muted/50 border rounded-lg">
                                                                {item.unit_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                            </div>
                                                        </td>
                                                        <td className="block p-0 md:table-cell md:w-24 md:p-3 md:text-right">
                                                            <span className="mb-1 block text-xs font-semibold md:hidden">Discount (PHP)</span>
                                                            <div className="h-8 flex items-center justify-end px-2 text-xs font-semibold font-mono text-destructive bg-muted/50 border rounded-lg">
                                                                {item.discount_amount ? `-${item.discount_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-"}
                                                            </div>
                                                        </td>
                                                        <td className="block p-0 md:table-cell md:w-24 md:p-3 md:text-right">
                                                            <label htmlFor={`line-${item.line_id}-quantity`} className="mb-1 block text-xs font-semibold md:sr-only">Quantity</label>
                                                            <input
                                                                id={`line-${item.line_id}-quantity`}
                                                                type="number"
                                                                min={1}
                                                                value={item.quantity}
                                                                onChange={e => handleItemChange(trueIndex, "quantity", Number(e.target.value))}
                                                                aria-invalid={Boolean(formErrors.items?.[item.line_id]?.quantity)}
                                                                aria-describedby={formErrors.items?.[item.line_id]?.quantity ? `line-${item.line_id}-quantity-error` : undefined}
                                                                className="w-full bg-background border rounded-lg px-2 py-1 h-8 text-xs text-right outline-none focus:ring-1 focus:ring-primary focus:border-primary font-semibold"
                                                            />
                                                            {formErrors.items?.[item.line_id]?.quantity && <p id={`line-${item.line_id}-quantity-error`} className="mt-1 text-xs text-destructive">{formErrors.items[item.line_id].quantity}</p>}
                                                        </td>
                                                        <td className="flex items-center justify-between p-0 text-right font-bold text-foreground md:table-cell md:p-3">
                                                            <span className="text-xs md:hidden">Total</span>
                                                            ₱{((item.unit_price - (item.discount_amount || 0)) * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="block p-0 text-right md:table-cell md:p-3 md:text-center">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveItem(trueIndex)}
                                                                aria-label={`Remove line ${trueIndex + 1}`}
                                                                title={`Remove line ${trueIndex + 1}`}
                                                                className="p-1 hover:bg-rose-500/10 text-rose-500 hover:text-rose-600 rounded-lg border-none bg-transparent cursor-pointer transition-colors"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                                });
                                            })()
                                        )}
                                    </tbody>
                                </table>
                                <div className="p-3 border-t bg-muted/10 flex justify-end">
                                    <button
                                        id="direct-so-add-product"
                                        type="button"
                                        onClick={handleAddItem}
                                        disabled={!lookupsReady}
                                        aria-invalid={Boolean(formErrors.items?.[0]?.product)}
                                        aria-describedby={formErrors.items?.[0]?.product ? "direct-so-items-error" : undefined}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border-none px-3 py-1.5 text-xs font-bold cursor-pointer transition-all disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <Plus className="h-3.5 w-3.5" /> Add Product
                                    </button>
                                </div>
                            </div>
                        </div>

                        </div>
                        <div className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="grid grid-cols-3 gap-x-5 text-xs">
                                <div className="flex justify-between text-xs text-muted-foreground font-bold">
                                    <span>Subtotal:</span>
                                    <span>₱{subTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between text-xs text-rose-500 font-bold">
                                    <span>Total Discount:</span>
                                    <span>-₱{totalDiscountAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between text-xs text-foreground font-black">
                                    <span>Grand Total:</span>
                                    <span className="text-primary">₱{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                            </div>

                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={requestClose}
                                className="h-9 rounded-md border bg-background px-4 text-xs font-semibold transition-colors hover:bg-muted"
                            >
                                Cancel
                            </button>
                             <button
                                type="submit"
                                disabled={submitting || !lookupsReady || grandTotal <= 0 || items.some(it => !it.unit_price || it.unit_price <= 0)}
                                className="bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    <>
                                        <DollarSign className="h-3.5 w-3.5" />
                                        Create Sales Order
                                    </>
                                )}
                            </button>
                        </div>
                            </div>
                        </div>
                    </form>
                )}
                </DialogContent>
            </Dialog>

            <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
                <AlertDialogContent size="sm">
                    <AlertDialogHeader>
                        <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
                        <AlertDialogTitle>Discard sales order?</AlertDialogTitle>
                        <AlertDialogDescription>Your entered sales order details will be lost.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep Editing</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => { setDiscardOpen(false); onClose(); }}>Discard</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
