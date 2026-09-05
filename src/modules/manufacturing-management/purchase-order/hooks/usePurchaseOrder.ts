import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { IncomingShipment, LinkedProduct, RawMaterial, ShipmentLineItem, Supplier } from "../../procurement/types";
import type { ManifestLineFormItem, ShipmentFormState } from "../../procurement/components/IncomingShipments";
import type {
    PurchaseOrderCatalog,
    PurchaseOrderDraftResponse,
    PurchaseOrderDraftPayload,
    PurchaseOrderListMeta,
    PurchaseOrderListQuery
} from "../types";
import {
    fetchLinkedProducts,
    fetchRawMaterials
} from "../../procurement/services/procurement-api";
import {
    createPurchaseOrder,
    fetchPurchaseOrderDetail,
    fetchPurchaseOrders,
    updatePurchaseOrderStatus,
    fetchPurchaseOrderCatalog,
    reviseRejectedPurchaseOrder,
    cancelRejectedPurchaseOrder
} from "../services/purchase-order-api";
import { resolveProductParentId } from "../../procurement/product-relation";
import { purchaseOrderMaterialTypeFromProduct } from "../../procurement/components/incoming-shipments/types";
import { calculatePercentageDiscount } from "../../procurement/discount-calculation";

const blankLine = (): ManifestLineFormItem => ({
    parent_product_id: "", product_id: "", material_type: "", quantity_ordered: "", base_unit_cost_php: "",
    purchase_intent: "Buffer_Stock", job_order_id: "", discount_mode: "Percentage", discount_amount: "0", discount_percent: "", vat_percent: "", withholding_percent: ""
});
const blankForm = (): ShipmentFormState => ({
    reference_number: "", remark: "", supplier_id: "", exchange_rate: "", total_foreign_currency: "0", total_php_value: "0",
    status: "Ordered", date_received: new Date().toISOString().split("T")[0], branch_id: null, payment_type: null, payment_mode: null, payment_terms: null, delivery_terms: "", price_type: "", currency_code: "PHP"
});

function calculateDraftTotals(lines: PurchaseOrderDraftPayload["lines"], exchangeRate: number) {
    const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
    return lines.reduce((totals, line) => {
        const discountCalculation = calculatePercentageDiscount(line.quantity, line.unitPrice, line.discountPercent);
        const grossForeign = round(Number(discountCalculation.grossAmount));
        const discountForeign = round(Number(discountCalculation.discountAmount));
        const subtotalForeign = round(grossForeign - discountForeign);
        const vatForeign = round(subtotalForeign * line.vatPercent / 100);
        const withholdingForeign = round(subtotalForeign * line.withholdingPercent / 100);
        const netForeign = round(subtotalForeign + vatForeign - withholdingForeign);
        return {
            grossPhp: round(totals.grossPhp + grossForeign * exchangeRate),
            discountPhp: round(totals.discountPhp + discountForeign * exchangeRate),
            vatPhp: round(totals.vatPhp + vatForeign * exchangeRate),
            withholdingPhp: round(totals.withholdingPhp + withholdingForeign * exchangeRate),
            netPhp: round(totals.netPhp + netForeign * exchangeRate),
            netForeign: round(totals.netForeign + netForeign)
        };
    }, { grossPhp: 0, discountPhp: 0, vatPhp: 0, withholdingPhp: 0, netPhp: 0, netForeign: 0 });
}

export type PurchaseOrderViewMode = "queue" | "detail" | "create";

interface UsePurchaseOrderOptions {
    mode?: PurchaseOrderViewMode;
    shipmentId?: number;
    onCreated?: (result: PurchaseOrderDraftResponse) => void;
}

export function usePurchaseOrder({ mode = "queue", shipmentId, onCreated }: UsePurchaseOrderOptions = {}) {
    const isDetailMode = mode === "detail";
    const isCreateMode = mode === "create";
    const [loading, setLoading] = useState(false);
    const [listLoading, setListLoading] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [listError, setListError] = useState<string | null>(null);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [referenceError, setReferenceError] = useState<string | null>(null);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [shipments, setShipments] = useState<IncomingShipment[]>([]);
    const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
    const [supplierLinkedProducts, setSupplierLinkedProducts] = useState<LinkedProduct[]>([]);
    const [paymentModes, setPaymentModes] = useState<PurchaseOrderCatalog["paymentModes"]>([]);
    const [paymentTerms, setPaymentTerms] = useState<PurchaseOrderCatalog["paymentTerms"]>([]);
    const [priceTypeRules, setPriceTypeRules] = useState<PurchaseOrderCatalog["priceTypeRules"]>([]);
    const [jobOrders, setJobOrders] = useState<Array<{ job_order_id: number; job_order_no?: string }>>([]);
    const [selectedShipment, setSelectedShipment] = useState<IncomingShipment | null>(null);
    const [selectedShipmentLines, setSelectedShipmentLines] = useState<ShipmentLineItem[]>([]);
    const [isShipmentModalOpen, setIsShipmentModalOpen] = useState(false);
    const [shipmentForm, setShipmentForm] = useState<ShipmentFormState>(blankForm);
    const [shipmentLinesForm, setShipmentLinesForm] = useState<ManifestLineFormItem[]>([blankLine()]);
    const [listMeta, setListMeta] = useState<PurchaseOrderListMeta>({ page: 1, limit: 5, total: 0, totalPages: 1 });
    const lastQuery = useRef<PurchaseOrderListQuery>({ page: 1, limit: 5 });
    const listController = useRef<AbortController | null>(null);
    const detailController = useRef<AbortController | null>(null);
    const catalogLoad = useRef<Promise<void> | null>(null);
    const rawMaterialsLoad = useRef<Promise<void> | null>(null);
    const catalogLoaded = useRef(false);
    const rawMaterialsLoaded = useRef(false);

    const loadCatalog = useCallback(async () => {
        if (catalogLoaded.current) return;
        if (catalogLoad.current) return catalogLoad.current;

        const request = fetchPurchaseOrderCatalog()
            .then(catalog => {
                setSuppliers(catalog.suppliers);
                setPaymentModes(catalog.paymentModes);
                setPaymentTerms(catalog.paymentTerms);
                setPriceTypeRules(catalog.priceTypeRules);
                setJobOrders(catalog.jobOrders);
                catalogLoaded.current = true;
            })
            .catch(error => {
                setReferenceError((error as Error).message || "Failed to load purchase-order reference data.");
                throw error;
            })
            .finally(() => {
                catalogLoad.current = null;
            });

        catalogLoad.current = request;
        return request;
    }, []);

    const loadRawMaterialCatalog = useCallback(async () => {
        if (rawMaterialsLoaded.current) return;
        if (rawMaterialsLoad.current) return rawMaterialsLoad.current;

        const request = fetchRawMaterials()
            .then(materials => {
                setRawMaterials(materials);
                rawMaterialsLoaded.current = true;
            })
            .catch(error => {
                setReferenceError((error as Error).message || "Failed to load material reference data.");
                throw error;
            })
            .finally(() => {
                rawMaterialsLoad.current = null;
            });

        rawMaterialsLoad.current = request;
        return request;
    }, []);

    const loadShipments = useCallback(async (query: PurchaseOrderListQuery = lastQuery.current) => {
        lastQuery.current = query;
        listController.current?.abort();
        const controller = new AbortController();
        listController.current = controller;
        setListLoading(true);
        setListError(null);
        try {
            const result = await fetchPurchaseOrders(query, controller.signal);
            if (controller.signal.aborted) return [];
            setShipments(result.data);
            setListMeta(result.meta);
            setSelectedShipment(null);
            setSelectedShipmentLines([]);
            return result.data;
        } catch (error) {
            if ((error as Error).name !== "AbortError") {
                setShipments([]);
                setListError((error as Error).message || "Failed to load purchase orders.");
            }
            return [];
        } finally {
            if (!controller.signal.aborted) setListLoading(false);
        }
    }, []);

    const loadDetail = useCallback(async (id: number = shipmentId || 0) => {
        if (!id) {
            setDetailError("The purchase-order ID is invalid.");
            return null;
        }

        detailController.current?.abort();
        const controller = new AbortController();
        detailController.current = controller;
        setDetailLoading(true);
        setDetailError(null);
        setSelectedShipment(null);
        setSelectedShipmentLines([]);

        try {
            const result = await fetchPurchaseOrderDetail(id, controller.signal);
            if (controller.signal.aborted) return null;
            setSelectedShipment(result.data.shipment);
            setSelectedShipmentLines(result.data.lines);
            return result.data;
        } catch (error) {
            if ((error as Error).name !== "AbortError") {
                setDetailError((error as Error).message || "Failed to load purchase-order details.");
            }
            return null;
        } finally {
            if (!controller.signal.aborted) setDetailLoading(false);
        }
    }, [shipmentId]);

    useEffect(() => {
        if (isDetailMode) {
            void loadDetail().catch(() => undefined);
        } else if (!isCreateMode) {
            void loadShipments();
        }
        return () => {
            listController.current?.abort();
            detailController.current?.abort();
        };
    }, [isCreateMode, isDetailMode, loadDetail, loadShipments]);

    useEffect(() => {
        if (isDetailMode || isCreateMode) {
            void loadCatalog().catch(() => undefined);
        }
    }, [isCreateMode, isDetailMode, loadCatalog]);

    useEffect(() => {
        if (isCreateMode) {
            void loadRawMaterialCatalog().catch(() => undefined);
        }
    }, [isCreateMode, loadRawMaterialCatalog]);

    useEffect(() => {
        if (!isShipmentModalOpen) return;
        void Promise.all([loadCatalog(), loadRawMaterialCatalog()]).catch(() => undefined);
    }, [isShipmentModalOpen, loadCatalog, loadRawMaterialCatalog]);

    useEffect(() => {
        if (!shipmentForm.supplier_id) {
            setSupplierLinkedProducts([]);
            return;
        }
        void fetchLinkedProducts(Number(shipmentForm.supplier_id))
            .then(setSupplierLinkedProducts)
            .catch(() => setSupplierLinkedProducts([]));
    }, [shipmentForm.supplier_id]);

    useEffect(() => {
        if (!isShipmentModalOpen) {
            setShipmentForm(blankForm());
            setShipmentLinesForm([blankLine()]);
        }
    }, [isShipmentModalOpen, setShipmentForm]);

    const handleCreateShipment = async (event: React.FormEvent) => {
        event.preventDefault();
        const invalidRows = shipmentLinesForm.flatMap((line, index) => {
            const errors: string[] = [];
            const quantity = Number(line.quantity_ordered);
            const unitPrice = Number(line.base_unit_cost_php);
            const discount = Number(line.discount_percent || 0);
            const vat = Number(line.vat_percent || 0);
            const withholding = Number(line.withholding_percent || 0);
            const product = rawMaterials.find(material => Number(material.product_id) === Number(line.product_id));
            const masterMaterialType = purchaseOrderMaterialTypeFromProduct(product, rawMaterials);

            if (!line.product_id) errors.push("select a product");
            if (!line.material_type) errors.push("select a Category Type");
            if (line.material_type && masterMaterialType !== line.material_type) errors.push("select a Category Type matching the product master");
            if (!Number.isInteger(quantity) || quantity <= 0) errors.push("enter a positive whole quantity");
            if (line.base_unit_cost_php === "" || !Number.isFinite(unitPrice) || unitPrice < 0) errors.push("enter a non-negative unit price");
            if (line.discount_mode === "Fixed Amount") errors.push("convert legacy fixed discounts to Percentage before saving");
            if (line.discount_mode && line.discount_mode !== "Percentage" && line.discount_mode !== "Fixed Amount") errors.push("select Percentage as the Discount Type");
            if (!Number.isFinite(discount) || discount < 0 || discount > 100) errors.push("set Discount between 0 and 100");
            if (!Number.isFinite(vat) || vat < 0 || vat > 100) errors.push("set VAT between 0 and 100");
            if (!Number.isFinite(withholding) || withholding < 0 || withholding > 100) errors.push("set Withholding between 0 and 100");
            if (line.purchase_intent === "MRP_Demand" && (!Number.isInteger(Number(line.job_order_id)) || Number(line.job_order_id) <= 0)) {
                errors.push("select a valid Job Order for MRP Demand");
            }
            if (line.purchase_intent === "Buffer_Stock" && line.job_order_id) errors.push("remove the Job Order for Buffer Stock");

            return errors.length > 0 ? [`Row ${index + 1}: ${errors.join(", ")}.`] : [];
        });
        if (invalidRows.length > 0) {
            toast.error(invalidRows[0]);
            return;
        }

        const lines = shipmentLinesForm;
        if (!shipmentForm.supplier_id) {
            toast.error("Supplier is required.");
            return;
        }
        if (!shipmentForm.branch_id) {
            toast.error("Destination Branch is required.");
            return;
        }
        if (!shipmentForm.payment_type) {
            toast.error("Payment Arrangement is required.");
            return;
        }
        if (!shipmentForm.payment_mode) {
            toast.error("Payment Type is required.");
            return;
        }
        if (!shipmentForm.payment_terms) {
            toast.error("Payment Terms is required.");
            return;
        }
        if (!shipmentForm.delivery_terms?.trim()) {
            toast.error("Delivery Terms is required.");
            return;
        }
        if (lines.length === 0) {
            toast.error("Add at least one Purchase Order Line.");
            return;
        }
        const exchangeRate = Number(shipmentForm.exchange_rate);
        if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
            toast.error("A valid exchange rate is required.");
            return;
        }
        const unresolvedLine = lines.find(line => {
            const product = rawMaterials.find(material => Number(material.product_id) === Number(line.product_id));
            return !product || !resolveProductParentId(product);
        });
        if (unresolvedLine) {
            toast.error("The selected product relationship is unavailable. Refresh the catalog and try again.");
            return;
        }

        const lineItems: PurchaseOrderDraftPayload["lines"] = lines.map(line => {
            const productId = Number(line.product_id);
            const product = rawMaterials.find(material => Number(material.product_id) === productId);
            const canonicalParentId = resolveProductParentId(product!);

            return {
                productId,
                categoryType: line.material_type === "raw_material"
                    ? "RAW_MATERIAL"
                    : line.material_type === "packaging"
                        ? "PACKAGING"
                        : "FINISHED_GOODS",
                parentProductId: canonicalParentId,
                purchaseIntent: line.purchase_intent || "Buffer_Stock",
                jobOrderId: line.purchase_intent === "MRP_Demand" ? Number(line.job_order_id) || null : null,
                quantity: Number(line.quantity_ordered),
                unitPrice: Number(line.base_unit_cost_php),
                discountMode: "Percentage",
                discountPercent: Number(line.discount_percent) || 0,
                discountAmount: Number(calculatePercentageDiscount(
                    line.quantity_ordered,
                    line.base_unit_cost_php,
                    Number(line.discount_percent) || 0
                ).discountAmount),
                vatPercent: Number(line.vat_percent) || 0,
                withholdingPercent: Number(line.withholding_percent) || 0
            };
        });
        if (lineItems.some(line => line.purchaseIntent === "MRP_Demand" && !line.jobOrderId)) {
            toast.error("Every MRP-demand line requires a valid job order.");
            return;
        }
        if (new Set(lineItems.map(line => line.productId)).size !== lineItems.length) {
            toast.error("Duplicate products must be consolidated into one line.");
            return;
        }
        const totals = calculateDraftTotals(lineItems, exchangeRate);
        setLoading(true);
        try {
            const result = await createPurchaseOrder({
                externalReference: shipmentForm.reference_number.trim() || undefined,
                remark: shipmentForm.remark === "" ? undefined : shipmentForm.remark,
                supplierId: Number(shipmentForm.supplier_id),
                branchId: Number(shipmentForm.branch_id),
                paymentArrangementId: Number(shipmentForm.payment_type),
                paymentModeId: Number(shipmentForm.payment_mode),
                paymentTermsId: Number(shipmentForm.payment_terms),
                deliveryTerms: shipmentForm.delivery_terms.trim(),
                currencyCode: shipmentForm.currency_code || "PHP",
                exchangeRate,
                expectedTotals: totals,
                lines: lineItems
            });
            toast.success(`Purchase order ${result.purchaseOrderNo || ""} created in For Approval status.`.trim());
            if (isCreateMode) {
                onCreated?.(result);
            } else {
                setIsShipmentModalOpen(false);
                await loadShipments();
            }
        } catch (error) {
            toast.error((error as Error).message || "Failed to create purchase order.");
        } finally {
            setLoading(false);
        }
    };

    const handleEditShipment = async (id: number, data: ShipmentFormState, lines: ManifestLineFormItem[]) => {
        if (selectedShipment?.status !== "Rejected" || selectedShipment.rejection_stage !== "Finance") {
            toast.error("Purchase orders can only be edited after a formal Finance rejection.");
            return false;
        }
        setLoading(true);
        try {
            await reviseRejectedPurchaseOrder(id, data, lines, Number(data.workflow_revision || 0));
            toast.success("Finance-rejected purchase order revised and resubmitted for approval.");
            if (isDetailMode) {
                await loadDetail(id);
            } else {
                setSelectedShipment(null);
                await loadShipments();
            }
            return true;
        } catch (error) {
            toast.error((error as Error).message || "Failed to update purchase order.");
            return false;
        } finally {
            setLoading(false);
        }
    };

    const handleCancelRejectedShipment = async (id: number, workflowRevision: number, remarks?: string) => {
        if (selectedShipment?.status !== "Rejected" || selectedShipment.rejection_stage !== "Finance") {
            toast.error("Purchase orders can only be cancelled after a formal Finance rejection.");
            return false;
        }
        setLoading(true);
        try {
            await cancelRejectedPurchaseOrder(id, workflowRevision, remarks);
            toast.success("Rejected purchase order cancelled.");
            if (isDetailMode) {
                await loadDetail(id);
            } else {
                setSelectedShipment(null);
                await loadShipments();
            }
            return true;
        } catch (error) {
            toast.error((error as Error).message || "Failed to cancel purchase order.");
            return false;
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateShipmentStatus = async (id: number, status: IncomingShipment["status"]) => {
        if (status === "Cancelled") {
            toast.error("Purchase orders can only be cancelled after a formal Finance rejection.");
            return;
        }
        setLoading(true);
        try {
            await updatePurchaseOrderStatus(id, status);
            toast.success(`Purchase-order status updated to ${status}.`);
            if (isDetailMode) {
                await loadDetail(id);
            } else {
                await loadShipments();
            }
        } catch (error) {
            toast.error((error as Error).message || "Failed to update purchase-order status.");
        } finally {
            setLoading(false);
        }
    };

    return {
        loading, listLoading, detailLoading, listError, detailError, referenceError,
        suppliers, shipments, rawMaterials, supplierLinkedProducts, paymentModes, paymentTerms, priceTypeRules, jobOrders,
        listMeta, loadShipments, retryList: () => loadShipments(lastQuery.current), retryDetail: () => loadDetail(),
        selectedShipment, setSelectedShipment, selectedShipmentLines,
        isShipmentModalOpen, setIsShipmentModalOpen,
        shipmentForm, setShipmentForm, shipmentLinesForm, setShipmentLinesForm,
        handleCreateShipment, handleEditShipment, handleCancelRejectedShipment, handleUpdateShipmentStatus
    };
}
