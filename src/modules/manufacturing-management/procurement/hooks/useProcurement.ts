import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Supplier, SupplierRepresentative, SupplierFormState, IncomingShipment, ShipmentLineItem, ShipmentExpense, RawMaterial, LinkedProduct, RegisterRawMaterialPayload, PackagingVariant, ShipmentData, LineItem } from "../types";
import type { ShipmentFormState, ManifestLineFormItem } from "../components/IncomingShipments";
import {
    fetchSuppliers,
    createSupplier,
    fetchShipments,
    fetchShipmentLineItems,
    createShipment,
    fetchShipmentExpenses,
    saveAndAllocateExpenses,
    fetchRawMaterials,
    updateShipmentStatus,
    registerRawMaterial,
    updateRawMaterial,
    updateSupplier,
    fetchLinkedProducts
} from "../services/procurement-api";
import type { SupplierStatusFilter } from "../services/procurement-api";
import { purchaseOrderMaterialTypeFromProduct } from "../components/incoming-shipments/types";
import { fetchPurchaseOrderCatalog } from "../../purchase-order/services/purchase-order-api";
import {
    PHILIPPINES_COUNTRY,
    canonicalizeSupplierCountry,
    isForeignCountry,
    normalizeSupplierCountry
} from "../supplier-country";
import { isLandedCostPostingEligible } from "../landed-cost-eligibility";

type ShipmentAllocationRule = "" | "Value" | "Weight" | "Volume" | "Hybrid";

function normalizeShipmentAllocationRule(value: string | null | undefined): ShipmentAllocationRule {
    const normalized = String(value || "").replace(/^By\s+/i, "");
    return normalized === "Value" || normalized === "Weight" || normalized === "Volume" || normalized === "Hybrid"
        ? normalized
        : "";
}

export function useProcurement(defaultTab: string = "suppliers") {
    const [activeTab, setActiveTab] = useState(defaultTab);
    const [loading, setLoading] = useState(false);
    const [rawMaterialsLoading, setRawMaterialsLoading] = useState(true);
    const [submittingExpenses, setSubmittingExpenses] = useState(false);

    // Data lists
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [shipments, setShipments] = useState<IncomingShipment[]>([]);
    const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
    const [paymentModes, setPaymentModes] = useState<import("../types").PurchaseOrderPaymentMode[]>([]);

    // Selected items
    const [selectedShipment, setSelectedShipment] = useState<IncomingShipment | null>(null);
    const [selectedShipmentLines, setSelectedShipmentLines] = useState<ShipmentLineItem[]>([]);
    const [selectedShipmentExpenses, setSelectedShipmentExpenses] = useState<ShipmentExpense[]>([]);
    const [lastFinalizedShipmentId, setLastFinalizedShipmentId] = useState<number | null>(null);

    useEffect(() => {
        if (activeTab !== "shipment-expenses") setLastFinalizedShipmentId(null);
    }, [activeTab]);

    // Modals
    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
    const [isShipmentModalOpen, setIsShipmentModalOpen] = useState(false);
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

    // Forms
    const [supplierError, setSupplierError] = useState<string | null>(null);
    const [supplierForm, setSupplierForm] = useState<SupplierFormState>({
        supplier_name: "",
        supplier_shortcut: "",
        tin_number: "",
        phone_number: "",
        email_address: "",
        address: "",
        city: "",
        brgy: "",
        state_province: "",
        country: PHILIPPINES_COUNTRY,
        postal_code: "",
        payment_terms: "",
        delivery_terms: "",
        currency: "PHP",
        default_currency: "PHP",
        notes_or_comments: "",
        isActive: true,
        nonBuy: false as boolean | number,
        is_foreign: 0 as number,
        representatives: [] as SupplierRepresentative[]
    });

    const [isEditingSupplier, setIsEditingSupplier] = useState(false);
    const [editingSupplierId, setEditingSupplierId] = useState<number | null>(null);

    // Reset error & editing status when supplier modal opens/closes
    useEffect(() => {
        if (isSupplierModalOpen) {
            setSupplierError(null);
        } else {
            setSupplierError(null);
            setIsEditingSupplier(false);
            setEditingSupplierId(null);
        }
    }, [isSupplierModalOpen]);

    const [shipmentForm, setShipmentForm] = useState<ShipmentFormState>({
        reference_number: "",
        supplier_id: "",
        exchange_rate: "",
        total_foreign_currency: "0",
        total_php_value: "0",
        status: "Ordered",
        date_received: new Date().toISOString().split("T")[0],
        branch_id: null,
        payment_type: null,
        payment_mode: null,
        price_type: ""
    });

    const [shipmentLinesForm, setShipmentLinesForm] = useState<ManifestLineFormItem[]>([{ material_type: "", parent_product_id: "", product_id: "", quantity_ordered: "", base_unit_cost_php: "", discount_mode: "Percentage", discount_amount: "0", discount_percent: "0" }]);

    const [expenseAllocationForm, setExpenseAllocationForm] = useState<{
        allocation_method: ShipmentAllocationRule;
        expenses: Array<{ overhead_id: string; expense_type: string; amount_php: string }>;
    }>({
        allocation_method: "",
        expenses: [{ overhead_id: "", expense_type: "", amount_php: "" }]
    });

    // Auto-generate reference number when modal opens, and clean up form when modal closes
    useEffect(() => {
        if (isShipmentModalOpen) {
            const year = new Date().getFullYear();
            const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            
            fetch("/api/manufacturing/procurement/forex")
                .then(res => res.json())
                .then(data => {
                    const usdConfig = data?.activeRates?.find((r: { currency_code: string; exchange_rate: number }) => r.currency_code === "USD");
                    const activeRate = usdConfig?.exchange_rate ? String(usdConfig.exchange_rate) : "58.00";
                    setShipmentForm(prev => ({
                        ...prev,
                        exchange_rate: prev.exchange_rate || activeRate,
                        reference_number: prev.reference_number || `PO-${year}-${randomCode}`
                    }));
                })
                .catch(() => {
                    setShipmentForm(prev => ({
                        ...prev,
                        exchange_rate: prev.exchange_rate || "58.00",
                        reference_number: prev.reference_number || `PO-${year}-${randomCode}`
                    }));
                });
        } else {
            setShipmentForm({
                reference_number: "",
                supplier_id: "",
                exchange_rate: "",
                total_foreign_currency: "0",
                total_php_value: "0",
                status: "Ordered" as const,
                date_received: new Date().toISOString().split("T")[0],
                branch_id: null,
                payment_type: null,
                payment_mode: null,
                price_type: ""
            });
            setShipmentLinesForm([{ material_type: "", parent_product_id: "", product_id: "", quantity_ordered: "", base_unit_cost_php: "", discount_mode: "Percentage", discount_amount: "0", discount_percent: "0" }]);
        }
    }, [isShipmentModalOpen]);

    const [supplierLinkedProducts, setSupplierLinkedProducts] = useState<LinkedProduct[]>([]);

    useEffect(() => {
        void fetchPurchaseOrderCatalog()
            .then(catalog => setPaymentModes(catalog.paymentModes))
            .catch(error => toast.error((error as Error).message || "Failed to load configured payment types."));
    }, []);

    useEffect(() => {
        const loadLinkedForSelectedSupplier = async () => {
            if (!shipmentForm.supplier_id) {
                setSupplierLinkedProducts([]);
                return;
            }
            try {
                const linked = await fetchLinkedProducts(parseInt(shipmentForm.supplier_id));
                setSupplierLinkedProducts(linked || []);
            } catch (e) {
                console.error("Failed to load linked products for supplier:", e);
                setSupplierLinkedProducts([]);
            }
        };
        loadLinkedForSelectedSupplier();
    }, [shipmentForm.supplier_id]);

    // Sync loaded expenses with the form state
    useEffect(() => {
        if (selectedShipmentExpenses && selectedShipmentExpenses.length > 0) {
            setExpenseAllocationForm({
                allocation_method: normalizeShipmentAllocationRule(selectedShipmentExpenses[0].allocation_method),
                expenses: selectedShipmentExpenses.map(x => ({
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    overhead_id: x.overhead_id ? String(typeof x.overhead_id === "object" ? (x.overhead_id as any).id : x.overhead_id) : "",
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    expense_type: x.expense_type || (x.overhead_id && typeof x.overhead_id === "object" ? (x.overhead_id as any).overhead_name : ""),
                    amount_php: String(x.amount_php || "")
                }))
            });
        } else {
            setExpenseAllocationForm({
                allocation_method: "",
                expenses: [{ overhead_id: "", expense_type: "", amount_php: "" }]
            });
        }
    }, [selectedShipmentExpenses]);

    const loadSuppliers = useCallback(async (status: SupplierStatusFilter = activeTab === "suppliers" ? "all" : "active") => {
        try {
            const data = await fetchSuppliers(status);
            setSuppliers(data);
        } catch (e) {
            console.error(e);
            toast.error("Failed to load suppliers");
        }
    }, [activeTab]);

    const loadShipments = useCallback(async () => {
        try {
            const landedCostOnly = activeTab === "shipment-expenses";
            const data = await fetchShipments({ landedCostOnly });
            const visibleShipments = landedCostOnly
                ? data.filter(isLandedCostPostingEligible)
                : data;

            if (landedCostOnly) {
                setSelectedShipment(previous => previous && visibleShipments.some(
                    shipment => shipment.shipment_id === previous.shipment_id
                ) ? previous : null);
            }

            setShipments(visibleShipments);
            return visibleShipments;
        } catch (e) {
            console.error(e);
            toast.error("Failed to load incoming shipments");
            return [];
        }
    }, [activeTab]);

    const loadRawMaterials = useCallback(async () => {
        setRawMaterialsLoading(true);
        try {
            const data = await fetchRawMaterials();
            setRawMaterials(data);
        } catch (e) {
            console.error(e);
            toast.error("Failed to load raw materials");
        } finally {
            setRawMaterialsLoading(false);
        }
    }, []);

    // Load only the data required by the current procurement page. In particular,
    // raw-materials does not need the purchase-order shipment endpoint.
    useEffect(() => {
        if (activeTab === "suppliers" || activeTab === "raw-materials" || activeTab === "incoming-shipments") {
            loadSuppliers();
            loadRawMaterials();
        }
        if (activeTab === "incoming-shipments" || activeTab === "shipment-expenses") {
            loadShipments();
        }
    }, [activeTab, loadSuppliers, loadRawMaterials, loadShipments]);

    const loadShipmentDetails = useCallback(async (shipmentId: number) => {
        setLoading(true);
        try {
            const [lines, exps] = await Promise.all([
                fetchShipmentLineItems(shipmentId),
                activeTab === "shipment-expenses"
                    ? fetchShipmentExpenses(shipmentId)
                    : Promise.resolve([] as ShipmentExpense[])
            ]);
            setSelectedShipmentLines(lines);
            setSelectedShipmentExpenses(exps);
        } catch (e) {
            console.error(e);
            toast.error("Failed to load shipment details");
        } finally {
            setLoading(false);
        }
    }, [activeTab]);

    // Load sub-details when shipment is selected.
    useEffect(() => {
        const canLoadExpenses = activeTab !== "shipment-expenses"
            || (selectedShipment ? isLandedCostPostingEligible(selectedShipment) : false);

        if (selectedShipment && canLoadExpenses) {
            loadShipmentDetails(selectedShipment.shipment_id);
        } else {
            setSelectedShipmentLines([]);
            setSelectedShipmentExpenses([]);
        }
    }, [activeTab, loadShipmentDetails, selectedShipment]);

    function parseCreationError(errorMsg: string): string {
        const msg = errorMsg.toLowerCase();
        if (msg.includes("unique") && (msg.includes("supplier") || msg.includes("collection"))) {
            return "A supplier with this Corporate Name or Code already exists. Please choose unique values.";
        }
        if (msg.includes("supplier_name") || msg.includes("name already exists") || msg.includes("unique") && msg.includes("name")) {
            return "This Supplier Name already exists. Please choose a unique name.";
        }
        if (msg.includes("tin_number") || msg.includes("tin already registered") || msg.includes("unique") && msg.includes("tin")) {
            return "This TIN Number is already registered. Please enter a unique TIN.";
        }
        if (msg.includes("supplier_shortcut") || msg.includes("shortcut") || msg.includes("code") && msg.includes("unique")) {
            return "This Supplier Code already exists. Please choose a unique code.";
        }
        if (msg.includes("country")) {
            return "Please select a valid country from the list.";
        }
        return errorMsg;
    }

    const handleCreateSupplier = async (e: React.FormEvent) => {
        e.preventDefault();
        setSupplierError(null);
        if (!supplierForm.supplier_name.trim()) {
            setSupplierError("Supplier Corporate Name is required");
            toast.error("Supplier Corporate Name is required");
            return;
        }
        if (!supplierForm.supplier_shortcut.trim()) {
            setSupplierError("Supplier Code/Shortcut is required");
            toast.error("Supplier Code/Shortcut is required");
            return;
        }
        if (!supplierForm.address.trim()) {
            setSupplierError("Business Street Address is required");
            toast.error("Business Street Address is required");
            return;
        }
        if (!supplierForm.payment_terms) {
            setSupplierError("Payment Terms is required");
            toast.error("Payment Terms is required");
            return;
        }
        if (!supplierForm.delivery_terms) {
            setSupplierError("Delivery Terms is required");
            toast.error("Delivery Terms is required");
            return;
        }

        // Validate representatives
        const reps = supplierForm.representatives || [];
        for (let i = 0; i < reps.length; i++) {
            const rep = reps[i];
            if (!rep.first_name?.trim() || !rep.last_name?.trim()) {
                setSupplierError(`Representative #${i + 1} first name and last name are required.`);
                toast.error(`Representative #${i + 1} first name and last name are required.`);
                return;
            }
            if (!rep.email?.trim() && !rep.contact_number?.trim()) {
                setSupplierError(`Representative #${i + 1} (${rep.first_name} ${rep.last_name}) must have either an email address or a contact number.`);
                toast.error(`Representative #${i + 1} (${rep.first_name} ${rep.last_name}) must have either an email address or a contact number.`);
                return;
            }
        }

        // Check for duplicates
        const isDuplicateName = suppliers.some(s =>
            s.id !== editingSupplierId &&
            s.supplier_name.trim().toLowerCase() === supplierForm.supplier_name.trim().toLowerCase()
        );
        if (isDuplicateName) {
            setSupplierError("This Supplier Corporate Name already exists. Please choose a unique name.");
            toast.error("This Supplier Corporate Name already exists. Please choose a unique name.");
            return;
        }

        const isDuplicateCode = suppliers.some(s =>
            s.id !== editingSupplierId &&
            s.supplier_shortcut?.trim().toLowerCase() === supplierForm.supplier_shortcut.trim().toLowerCase()
        );
        if (isDuplicateCode) {
            setSupplierError("This Supplier Code/Shortcut already exists. Please choose a unique code.");
            toast.error("This Supplier Code/Shortcut already exists. Please choose a unique code.");
            return;
        }

        try {
            const country = canonicalizeSupplierCountry(supplierForm.country);
            const currVal = String(supplierForm.currency || supplierForm.default_currency || "PHP").trim().toUpperCase();
            const foreignClassificationRequested = Number(supplierForm.is_foreign) === 1
                || (supplierForm.is_foreign as unknown) === true
                || isForeignCountry(country);
            if (foreignClassificationRequested && currVal === "PHP") {
                const message = "A foreign supplier requires an active non-PHP currency.";
                setSupplierError(message);
                toast.error(message);
                return;
            }
            const isForeignVal = currVal === "PHP" ? 0 : 1;

            const payload = {
                ...supplierForm,
                country,
                is_foreign: isForeignVal,
                currency: currVal,
                default_currency: currVal,
                isActive: supplierForm.isActive ? 1 : 0
            };

            if (isEditingSupplier && editingSupplierId) {
                await updateSupplier(editingSupplierId, payload);
                toast.success("Supplier updated successfully");
            } else {
                await createSupplier(payload);
                toast.success("Supplier created successfully");
            }

            setIsSupplierModalOpen(false);
            setIsEditingSupplier(false);
            setEditingSupplierId(null);
            setSupplierForm({
                supplier_name: "",
                supplier_shortcut: "",
                tin_number: "",
                phone_number: "",
                email_address: "",
                address: "",
                city: "",
                brgy: "",
                state_province: "",
                country: PHILIPPINES_COUNTRY,
                postal_code: "",
                payment_terms: "",
                delivery_terms: "",
                currency: "PHP",
                default_currency: "PHP",
                notes_or_comments: "",
                isActive: true,
                nonBuy: false as boolean | number,
                is_foreign: 0 as number,
                representatives: []
            });
            setSupplierError(null);
            loadSuppliers();
        } catch (e) {
            const rawMsg = (e as Error).message || "Failed to submit supplier";
            const userFriendlyMsg = parseCreationError(rawMsg);
            setSupplierError(userFriendlyMsg);
            toast.error(userFriendlyMsg);
        }
    };

    const handleStartEditSupplier = (supplier: Supplier) => {
        const country = normalizeSupplierCountry(supplier.country) || supplier.country || PHILIPPINES_COUNTRY;
        const supplierCurrency = String(supplier.currency || supplier.default_currency || "").trim().toUpperCase();
        const isForeign = Number(supplier.is_foreign) === 1 || 
            (supplier.is_foreign as unknown) === true || 
            (supplierCurrency !== "" && supplierCurrency !== "PHP") ||
            isForeignCountry(country);
        const defaultCurrency = supplierCurrency || (isForeign ? "" : "PHP");
        const cleanNotes = (supplier.notes_or_comments || "")
            .replace(/\[Currency:\s*\w+\]/gi, "")
            .replace(/\[Foreign:\s*\d+\]/gi, "")
            .trim();

        setSupplierForm({
            supplier_name: supplier.supplier_name || "",
            supplier_shortcut: supplier.supplier_shortcut || "",
            tin_number: supplier.tin_number || "",
            phone_number: supplier.phone_number || "",
            email_address: supplier.email_address || "",
            address: supplier.address || "",
            city: supplier.city || "",
            brgy: supplier.brgy || "",
            state_province: supplier.state_province || "",
            country,
            postal_code: supplier.postal_code || "",
            payment_terms: supplier.payment_terms || "",
            delivery_terms: supplier.delivery_terms || "",
            currency: defaultCurrency,
            default_currency: defaultCurrency,
            notes_or_comments: cleanNotes,
            isActive: Number(supplier.isActive) !== 0,
            nonBuy: supplier.nonBuy === 1 || supplier.nonBuy === true,
            is_foreign: isForeign ? 1 : 0,
            representatives: supplier.representatives || []
        });

        setIsEditingSupplier(true);
        setEditingSupplierId(supplier.id);
        setIsSupplierModalOpen(true);
    };

    const handleCreateShipment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!shipmentForm.reference_number.trim()) {
            toast.error("Reference Number/BL is required");
            return;
        }
        if (!shipmentForm.supplier_id) {
            toast.error("Supplier is required");
            return;
        }
        if (!shipmentForm.branch_id) {
            toast.error("Destination branch is required");
            return;
        }
        if (!shipmentForm.payment_type) {
            toast.error("Payment arrangement is required");
            return;
        }
        if (!shipmentForm.payment_mode) {
            toast.error("Payment type is required");
            return;
        }
        if (!shipmentForm.price_type) {
            toast.error("Price type is required");
            return;
        }
        const rateVal = parseFloat(shipmentForm.exchange_rate);
        if (isNaN(rateVal) || rateVal <= 0) {
            toast.error("Exchange rate required — check forex settings in header");
            return;
        }

        const hasBlankProduct = shipmentLinesForm.some(l => !l.product_id);
        if (hasBlankProduct) {
            toast.error("Please fill out the product selection field for all rows in the cargo manifest.");
            return;
        }

        const validLines = shipmentLinesForm.filter(l => l.product_id && l.quantity_ordered && l.base_unit_cost_php);
        if (validLines.length === 0) {
            toast.error("At least one product item is required");
            return;
        }

        const invalidCategoryLine = validLines.find(line => {
            const product = rawMaterials.find(material => String(material.product_id) === String(line.product_id));
            const masterType = purchaseOrderMaterialTypeFromProduct(product, rawMaterials);
            return !line.material_type || !product || masterType !== line.material_type;
        });
        if (invalidCategoryLine) {
            toast.error("Every purchase-order line must select a Category Type matching the product master.");
            return;
        }

        const productIds = validLines.map(l => l.product_id);
        const uniqueProductIds = new Set(productIds);
        if (productIds.length !== uniqueProductIds.size) {
            toast.error("Duplicate items found in the shipment manifest. Please consolidate identical items.");
            return;
        }

        try {
            setLoading(true);
            const linesPayload = validLines.map(l => ({
                product_id: parseInt(l.product_id),
                category_type: l.material_type === "raw_material" ? "RAW_MATERIAL" : "PACKAGING",
                quantity_ordered: parseFloat(l.quantity_ordered),
                base_unit_cost_php: parseFloat(l.base_unit_cost_php),
                discount_type: l.discount_type_id ? Number(l.discount_type_id) : null,
                discount_mode: l.discount_mode || "Percentage",
                discount_amount: Number(l.discount_amount || 0),
                discount_percent: Number(l.discount_percent || 0),
                vat_percent: Number(l.vat_percent || 0),
                withholding_percent: Number(l.withholding_percent || 0),
                purchase_intent: l.purchase_intent,
                job_order_id: l.job_order_id ? Number(l.job_order_id) : null
            }));

            const totalPhp = linesPayload.reduce((acc, curr) => {
                const gross = curr.quantity_ordered * curr.base_unit_cost_php;
                const discount = curr.discount_mode === "Fixed Amount"
                    ? curr.discount_amount
                    : gross * curr.discount_percent / 100;
                return acc + gross - discount;
            }, 0);
            const rate = rateVal;

            const shipmentPayload = {
                reference_number: shipmentForm.reference_number,
                supplier_id: parseInt(shipmentForm.supplier_id),
                exchange_rate: rate,
                total_foreign_currency: totalPhp / rate,
                total_php_value: totalPhp,
                status: shipmentForm.status,
                date_received: shipmentForm.date_received,
                branch_id: Number(shipmentForm.branch_id),
                payment_type: Number(shipmentForm.payment_type),
                payment_mode: Number(shipmentForm.payment_mode),
                price_type: shipmentForm.price_type
            };

            await createShipment(shipmentPayload, linesPayload);
            toast.success("Shipment registered successfully");
            setIsShipmentModalOpen(false);
            setShipmentForm({
                reference_number: "",
                supplier_id: "",
                exchange_rate: "",
                total_foreign_currency: "0",
                total_php_value: "0",
                status: "Ordered",
                date_received: new Date().toISOString().split("T")[0],
                branch_id: null,
                payment_type: null,
                payment_mode: null,
                price_type: ""
            });
            setShipmentLinesForm([{ material_type: "", parent_product_id: "", product_id: "", quantity_ordered: "", base_unit_cost_php: "", discount_mode: "Percentage", discount_amount: "0", discount_percent: "0" }]);
            loadShipments();
        } catch (e: unknown) {
            console.error(e);
            toast.error((e as Error).message || "Failed to save incoming shipment");
        } finally {
            setLoading(false);
        }
    };

    const handleAllocateExpenses = async (
        e: React.FormEvent,
        shipmentId: number,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        targetStatus: any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lineItemUpdates?: any[]
    ) => {
        e.preventDefault();
        if (!expenseAllocationForm.allocation_method) {
            toast.error("Select an allocation rule before finalizing landed costs.");
            return;
        }
        const validExps = expenseAllocationForm.expenses.filter(x => x.overhead_id && Number(x.amount_php) > 0);
        
        setSubmittingExpenses(true);
        try {
            const expsPayload = validExps.map(x => ({
                overhead_id: parseInt(x.overhead_id),
                expense_type: x.expense_type || "",
                amount_php: parseFloat(x.amount_php)
            }));

            const dbAllocationMethod = expenseAllocationForm.allocation_method;

            await saveAndAllocateExpenses(
                shipmentId,
                targetStatus,
                expsPayload,
                dbAllocationMethod,
                lineItemUpdates
            );
            toast.success("Landed costs calculated and updated successfully");
            setLastFinalizedShipmentId(shipmentId);
            
            setExpenseAllocationForm({
                allocation_method: expenseAllocationForm.allocation_method,
                expenses: validExps.map(x => ({
                    overhead_id: String(x.overhead_id),
                    expense_type: x.expense_type,
                    amount_php: String(x.amount_php)
                }))
            });
            setIsExpenseModalOpen(false);
            
            setExpenseAllocationForm({
                allocation_method: expenseAllocationForm.allocation_method,
                expenses: validExps.map(x => ({
                    overhead_id: String(x.overhead_id),
                    expense_type: x.expense_type,
                    amount_php: String(x.amount_php)
                }))
            });
            setIsExpenseModalOpen(false);

            // Reload active selections
            const freshShipments = await loadShipments();
            await loadRawMaterials();
            if (selectedShipment && selectedShipment.shipment_id === shipmentId) {
                const updatedShip = freshShipments.find(s => s.shipment_id === shipmentId);
                if (updatedShip) {
                    setSelectedShipment(updatedShip);
                    await loadShipmentDetails(shipmentId);
                } else {
                    setSelectedShipment(null);
                }
            }
        } catch (e: unknown) {
            console.error(e);
            toast.error((e as Error).message || "Failed to allocate expenses");
        } finally {
            setSubmittingExpenses(false);
        }
    };

    const handleUpdateShipmentStatus = async (shipmentId: number, status: "Ordered" | "Approved" | "Awaiting Payment" | "Cancelled" | "For Pickup" | "Receiving (QA)" | "Partially Received" | "Received" | "Rejected") => {
        setLoading(true);
        try {
            await updateShipmentStatus(shipmentId, status);
            toast.success(`Shipment status updated to ${status}`);
            const freshShipments = await loadShipments();
            await loadRawMaterials();
            if (selectedShipment && selectedShipment.shipment_id === shipmentId) {
                const updatedShip = freshShipments.find(s => s.shipment_id === shipmentId);
                if (updatedShip) {
                    setSelectedShipment(updatedShip);
                    await loadShipmentDetails(shipmentId);
                } else {
                    setSelectedShipment(null);
                }
            }
        } catch (e: unknown) {
            console.error(e);
            toast.error((e as Error).message || "Failed to update shipment status");
        } finally {
            setLoading(false);
        }
    };

    const handleRegisterRawMaterial = async (
        productDetails: RegisterRawMaterialPayload,
        supplierIds?: number[],
        packagingVariants?: PackagingVariant[]
    ): Promise<boolean> => {
        setLoading(true);
        try {
            await registerRawMaterial(productDetails, supplierIds, packagingVariants);
            toast.success(`Successfully registered raw material "${productDetails.product_name}"`);
            await loadRawMaterials();
            return true;
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateRawMaterial = async (
        productId: number,
        productDetails: RegisterRawMaterialPayload,
        supplierIds?: number[],
        packagingVariants?: PackagingVariant[]
    ): Promise<boolean> => {
        setLoading(true);
        try {
            await updateRawMaterial(productId, productDetails, supplierIds, packagingVariants);
            toast.success(`Successfully updated raw material "${productDetails.product_name}"`);
            await loadRawMaterials();
            return true;
        } finally {
            setLoading(false);
        }
    };

    const handleEditShipment = async (
        shipmentId: number,
        shipmentData: ShipmentData,
        lineItems: LineItem[]
    ) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/manufacturing/procurement/shipments`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    shipmentId,
                    shipmentData,
                    lineItems
                })
            });

            if (!res.ok) {
                const errJson = await res.json();
                throw new Error(errJson.error || "Failed to update shipment");
            }

            toast.success("Purchase Order updated and resubmitted successfully.");
            setSelectedShipment(null);
            await loadShipments();
        } catch (e: unknown) {
            console.error(e);
            toast.error((e as Error).message || "Failed to update Purchase Order");
        } finally {
            setLoading(false);
        }
    };

    return {
        handleEditShipment,
        activeTab,
        setActiveTab,
        loading,
        rawMaterialsLoading,
        submittingExpenses,
        suppliers,
        shipments,
        rawMaterials,
        paymentModes,
        supplierLinkedProducts,
        selectedShipment,
        setSelectedShipment,
        selectedShipmentLines,
        selectedShipmentExpenses,
        lastFinalizedShipmentId,
        isSupplierModalOpen,
        setIsSupplierModalOpen,
        isShipmentModalOpen,
        setIsShipmentModalOpen,
        isExpenseModalOpen,
        setIsExpenseModalOpen,
        supplierForm,
        setSupplierForm,
        supplierError,
        setSupplierError,
        shipmentForm,
        setShipmentForm,
        shipmentLinesForm,
        setShipmentLinesForm,
        expenseAllocationForm,
        setExpenseAllocationForm,
        isEditingSupplier,
        editingSupplierId,
        handleStartEditSupplier,
        handleCreateSupplier,
        handleCreateShipment,
        handleAllocateExpenses,
        handleUpdateShipmentStatus,
        handleRegisterRawMaterial,
        handleUpdateRawMaterial,
        loadShipments
    };
}
