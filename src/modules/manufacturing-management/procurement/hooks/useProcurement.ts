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
import {
    PHILIPPINES_COUNTRY,
    canonicalizeSupplierCountry,
    isForeignCountry,
    normalizeSupplierCountry
} from "../supplier-country";

export function useProcurement(defaultTab: string = "suppliers") {
    const [activeTab, setActiveTab] = useState(defaultTab);
    const [loading, setLoading] = useState(false);
    const [rawMaterialsLoading, setRawMaterialsLoading] = useState(true);
    const [submittingExpenses, setSubmittingExpenses] = useState(false);

    // Data lists
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [shipments, setShipments] = useState<IncomingShipment[]>([]);
    const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);

    // Selected items
    const [selectedShipment, setSelectedShipment] = useState<IncomingShipment | null>(null);
    const [selectedShipmentLines, setSelectedShipmentLines] = useState<ShipmentLineItem[]>([]);
    const [selectedShipmentExpenses, setSelectedShipmentExpenses] = useState<ShipmentExpense[]>([]);

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
        price_type: ""
    });

    const [shipmentLinesForm, setShipmentLinesForm] = useState<ManifestLineFormItem[]>([{ parent_product_id: "", product_id: "", quantity_ordered: "", base_unit_cost_php: "" }]);

    const [expenseAllocationForm, setExpenseAllocationForm] = useState<{
        allocation_method: "Value" | "Weight" | "Volume";
        expenses: Array<{ overhead_id: string; expense_type: string; amount_php: string }>;
    }>({
        allocation_method: "Value",
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
                price_type: ""
            });
            setShipmentLinesForm([{ parent_product_id: "", product_id: "", quantity_ordered: "", base_unit_cost_php: "" }]);
        }
    }, [isShipmentModalOpen]);

    const [supplierLinkedProducts, setSupplierLinkedProducts] = useState<LinkedProduct[]>([]);

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
                allocation_method: selectedShipmentExpenses[0].allocation_method === "By Weight" ? "Weight" :
                    selectedShipmentExpenses[0].allocation_method === "By Volume" ? "Volume" : "Value",
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
                allocation_method: "Value",
                expenses: [{ overhead_id: "", expense_type: "", amount_php: "" }]
            });
        }
    }, [selectedShipmentExpenses]);

    // Load sub-details when shipment is selected
    useEffect(() => {
        if (selectedShipment) {
            loadShipmentDetails(selectedShipment.shipment_id);
        } else {
            setSelectedShipmentLines([]);
            setSelectedShipmentExpenses([]);
        }
    }, [selectedShipment]);

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
            const data = await fetchShipments();
            setShipments(data);
            return data;
        } catch (e) {
            console.error(e);
            toast.error("Failed to load incoming shipments");
            return [];
        }
    }, []);

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

    async function loadShipmentDetails(shipmentId: number) {
        setLoading(true);
        try {
            const [lines, exps] = await Promise.all([
                fetchShipmentLineItems(shipmentId),
                fetchShipmentExpenses(shipmentId)
            ]);
            setSelectedShipmentLines(lines);
            setSelectedShipmentExpenses(exps);
        } catch (e) {
            console.error(e);
            toast.error("Failed to load shipment details");
        } finally {
            setLoading(false);
        }
    }

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
            const isForeignVal = (Number(supplierForm.is_foreign) === 1 || (supplierForm.is_foreign as unknown) === true || String(supplierForm.currency || supplierForm.default_currency).toUpperCase() === "USD" || isForeignCountry(country)) ? 1 : 0;
            const currVal = supplierForm.currency || supplierForm.default_currency || (isForeignVal === 1 ? "USD" : "PHP");

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
        const isForeign = Number(supplier.is_foreign) === 1 || 
            (supplier.is_foreign as unknown) === true || 
            String(supplier.default_currency).toUpperCase() === "USD" || 
            isForeignCountry(country);
        const defaultCurrency = supplier.default_currency || (isForeign ? "USD" : "PHP");
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
                quantity_ordered: parseFloat(l.quantity_ordered),
                base_unit_cost_php: parseFloat(l.base_unit_cost_php)
            }));

            const totalPhp = linesPayload.reduce((acc, curr) => acc + (curr.quantity_ordered * curr.base_unit_cost_php), 0);
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
                price_type: ""
            });
            setShipmentLinesForm([{ parent_product_id: "", product_id: "", quantity_ordered: "", base_unit_cost_php: "" }]);
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
        const validExps = expenseAllocationForm.expenses.filter(x => x.overhead_id && x.amount_php);
        
        setSubmittingExpenses(true);
        try {
            const expsPayload = validExps.map(x => ({
                overhead_id: parseInt(x.overhead_id),
                expense_type: x.expense_type || "",
                amount_php: parseFloat(x.amount_php)
            }));

            // Map UI allocation method to DB ENUM values ('By Value', 'By Weight', 'By Volume')
            const dbAllocationMethod =
                expenseAllocationForm.allocation_method === "Weight" ? "By Weight" :
                    expenseAllocationForm.allocation_method === "Volume" ? "By Volume" : "By Value";

            await saveAndAllocateExpenses(
                shipmentId,
                targetStatus,
                expsPayload,
                dbAllocationMethod,
                lineItemUpdates
            );
            toast.success("Landed costs calculated and updated successfully");
            
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

    const handleUpdateShipmentStatus = async (shipmentId: number, status: "Ordered" | "Approved" | "Awaiting Payment" | "Cancelled" | "For Pickup" | "En Route" | "Receiving (QA)" | "Partially Received" | "Received" | "Rejected") => {
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

    const handleToggleSupplierActive = async (supplier: Supplier) => {
        setLoading(true);
        try {
            const newActive = Number(supplier.isActive) === 0 ? 1 : 0;
            await updateSupplier(supplier.id, { isActive: newActive });
            toast.success(`Supplier "${supplier.supplier_name}" ${newActive ? "activated" : "deactivated"} successfully`);
            await loadSuppliers();
        } catch (e) {
            console.error(e);
            toast.error((e as Error).message || "Failed to update supplier active status");
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
        supplierLinkedProducts,
        selectedShipment,
        setSelectedShipment,
        selectedShipmentLines,
        selectedShipmentExpenses,
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
        handleToggleSupplierActive,
        loadShipments
    };
}
