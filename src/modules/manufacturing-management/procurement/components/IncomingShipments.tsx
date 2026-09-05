import React, { useState, useEffect, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { IncomingShipmentsProps } from "./incoming-shipments/types";
import { ShipmentListSidebar } from "./incoming-shipments/ShipmentListSidebar";
import { ShipmentDetailView } from "./incoming-shipments/ShipmentDetailView";
import { ShipmentFormModal } from "./incoming-shipments/ShipmentFormModal";
import { useIncomingShipmentsForm } from "../hooks/useIncomingShipmentsForm";
import { Globe, MapPin, Building2 } from "lucide-react";
import { toast } from "sonner";
import { downloadPurchaseOrderPrintable } from "../../purchase-order/services/purchase-order-print-api";

export type { ManifestLineFormItem, ShipmentFormState, IncomingShipmentsProps } from "./incoming-shipments/types";

export default function IncomingShipments(props: IncomingShipmentsProps) {
    const {
        displayMode = "split",
        backHref,
        onExitCreate,
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
        detailLoading = false,
        listError = null,
        detailError = null,
        referenceError = null,
        onRetryList,
        onRetryDetail,
        serverList,
        canonicalDrafting = false,
        jobOrders = [],
        paymentTerms = [],
        paymentModes = [],
        priceTypeRules = []
    } = props;

    const onServerQueryChange = serverList?.onQueryChange;
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const isQueueMode = displayMode === "queue";
    const isDetailMode = displayMode === "detail";
    const isCreateMode = displayMode === "create";

    const [search, setSearch] = useState(() => isQueueMode ? searchParams.get("search") || "" : "");
    const [statusFilter, setStatusFilter] = useState(() => isQueueMode ? searchParams.get("status") || "All" : "All");
    const [currentPage, setCurrentPage] = useState(() => {
        const page = Number(searchParams.get("page"));
        return isQueueMode && Number.isSafeInteger(page) && page > 0 ? page : 1;
    });
    const [itemsPerPage, setItemsPerPage] = useState(() => {
        const limit = Number(searchParams.get("limit"));
        return isQueueMode && [5, 10, 20, 50].includes(limit) ? limit : 5;
    });
    const [printLoading, setPrintLoading] = useState(false);

    const {
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
        priceControlCostsMap,
        discountTypes,
        productPerSupplierMap,
        isFinanceManager,
        totalUsdValue,
        draftSummary,
        priceControlStatus,
        priceControlError,
        fxRateStatus,
        fxRateError,
        priceTypeResolution
    } = useIncomingShipmentsForm({
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
        canonicalDrafting,
        priceTypeRules,
        paymentTerms,
        paymentModes
    });

    useEffect(() => {
        if (!isQueueMode || !onServerQueryChange) return;
        const timeout = window.setTimeout(() => {
            onServerQueryChange({
                page: currentPage,
                limit: itemsPerPage,
                search,
                status: statusFilter === "All" ? undefined : statusFilter
            });
        }, 250);
        return () => window.clearTimeout(timeout);
    }, [currentPage, isQueueMode, itemsPerPage, onServerQueryChange, search, statusFilter]);

    useEffect(() => {
        if (!isQueueMode) return;
        const params = new URLSearchParams(window.location.search);
        if (search.trim()) params.set("search", search.trim());
        else params.delete("search");
        if (statusFilter !== "All") params.set("status", statusFilter);
        else params.delete("status");
        params.set("page", String(currentPage));
        params.set("limit", String(itemsPerPage));
        const nextUrl = `${pathname}${params.toString() ? `?${params.toString()}` : ""}`;
        window.history.replaceState(window.history.state, "", nextUrl);
    }, [currentPage, isQueueMode, itemsPerPage, pathname, search, statusFilter]);

    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (e.altKey && e.key.toLowerCase() === "n") {
                e.preventDefault();
                setIsOverridden(false);
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
    }, [handleCloseModal, isModalOpen, setIsModalOpen, setIsOverridden]);

    const filteredShipments = useMemo(() => {
        if (isQueueMode && serverList) return shipments;
        return shipments.filter(s => {
            const poNo = s.purchase_order_no || "";
            const matchesSearch = s.reference_number.toLowerCase().includes(search.toLowerCase()) ||
                poNo.toLowerCase().includes(search.toLowerCase()) ||
                (s.supplier_id && typeof s.supplier_id === "object" && s.supplier_id.supplier_name.toLowerCase().includes(search.toLowerCase()));
            const matchesStatus = statusFilter === "All" || s.status === statusFilter;
            
            return matchesSearch && matchesStatus;
        });
    }, [isQueueMode, shipments, serverList, search, statusFilter]);

    const totalItems = isQueueMode && serverList?.total !== undefined ? serverList.total : filteredShipments.length;
    const totalPages = isQueueMode && serverList?.totalPages !== undefined
        ? serverList.totalPages
        : (Math.ceil(totalItems / itemsPerPage) || 1);
    const paginatedShipments = isQueueMode && serverList
        ? filteredShipments
        : filteredShipments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const hasListFilters = Boolean(search.trim() || statusFilter !== "All");

    const queueReturnHref = useMemo(() => {
        const params = new URLSearchParams();
        if (search.trim()) params.set("search", search.trim());
        if (statusFilter !== "All") params.set("status", statusFilter);
        params.set("page", String(currentPage));
        params.set("limit", String(itemsPerPage));
        return `${pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    }, [currentPage, itemsPerPage, pathname, search, statusFilter]);

    const shipmentDetailHref = (shipmentId: number) => (
        `/mm/incoming-shipments/${shipmentId}?returnTo=${encodeURIComponent(queueReturnHref)}`
    );

    const handlePrintPurchaseOrder = async () => {
        if (!activeShipment) return;
        try {
            setPrintLoading(true);
            await downloadPurchaseOrderPrintable({
                purchaseOrderId: activeShipment.shipment_id,
                documentType: "PURCHASE_ORDER"
            });
            toast.success("Purchase-order printable downloaded.");
        } catch (error) {
            toast.error((error as Error).message || "Unable to generate the purchase-order printable.");
        } finally {
            setPrintLoading(false);
        }
    };

    const supplierRawMaterials = useMemo(() => {
        if (!shipmentForm.supplier_id) return [];
        
        const selectedSupplierId = Number(shipmentForm.supplier_id);
        const linkedIds = supplierLinkedProducts
            .filter(lp => Number(lp.supplier_id) === selectedSupplierId)
            .map(lp => {
                if (typeof lp.product_id === "object" && lp.product_id !== null) {
                    return Number((lp.product_id as { product_id?: number; id?: number }).product_id || (lp.product_id as { product_id?: number; id?: number }).id);
                } else if (lp.product_id) {
                    return Number(lp.product_id);
                }
                return null;
            })
            .filter((id): id is number => id !== null && !isNaN(id));

        if (linkedIds.length === 0) return [];

        return rawMaterials.filter(rm => {
            const rmId = Number(rm.product_id);
            const rmParentId = rm.parent_id ? Number(rm.parent_id) : null;
            return linkedIds.includes(rmId) || (rmParentId !== null && linkedIds.includes(rmParentId));
        });
    }, [rawMaterials, shipmentForm.supplier_id, supplierLinkedProducts]);

    const supplierSelectOptions = useMemo(() => {
        return suppliers.map(s => {
            const foreign = isSupplierForeign(s);
            const supCurr = s.currency || s.default_currency;
            const curr = supCurr?.toUpperCase();
            return {
                value: String(s.id),
                label: `${s.supplier_name} - ${foreign ? `Foreign${curr ? ` (${curr})` : ""}` : `Local (${curr || "PHP"})`}`,
                labelNode: (
                    <div className="flex items-center justify-between w-full gap-2 py-0.5">
                        <span className="font-semibold text-xs truncate flex items-center gap-1.5">
                            {foreign ? (
                                <Globe className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                            ) : (
                                <MapPin className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            )}
                            {s.supplier_name}
                        </span>
                        {foreign ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-blue-500/10 text-blue-600 border border-blue-500/20 uppercase tracking-wider shrink-0">
                                <Globe className="h-2.5 w-2.5" /> Foreign{curr ? ` (${curr})` : ""}
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 uppercase tracking-wider shrink-0">
                                <Building2 className="h-2.5 w-2.5" /> Local ({curr})
                            </span>
                        )}
                    </div>
                )
            };
        });
    }, [suppliers, isSupplierForeign]);

    return (
        <div className={`flex w-full min-h-0 min-w-0 gap-6 ${isQueueMode || isDetailMode || isCreateMode ? "flex-col h-full" : "flex-col lg:flex-row h-full"}`}>
            {(displayMode === "split" || isQueueMode) && (
                <ShipmentListSidebar
                    totalItems={totalItems}
                    search={search}
                    setSearch={setSearch}
                    statusFilter={statusFilter}
                    setStatusFilter={setStatusFilter}
                    itemsPerPage={itemsPerPage}
                    setItemsPerPage={setItemsPerPage}
                    currentPage={currentPage}
                    setCurrentPage={setCurrentPage}
                    totalPages={totalPages}
                    fullWidth={isQueueMode}
                    listLoading={listLoading}
                    listError={isQueueMode ? listError : null}
                    onRetry={onRetryList}
                    hasListFilters={hasListFilters}
                    canonicalDrafting={canonicalDrafting}
                    paginatedShipments={paginatedShipments}
                    suppliers={suppliers}
                    activeShipment={activeShipment}
                    setSelectedShipment={setSelectedShipment}
                    isSupplierForeign={isSupplierForeign}
                    getShipmentHref={isQueueMode ? shipmentDetailHref : undefined}
                    createHref={isQueueMode && canonicalDrafting ? "/mm/incoming-shipments/create" : undefined}
                    onOpenCreateModal={() => { setIsOverridden(false); setIsModalOpen(true); }}
                />
            )}

            {(displayMode === "split" || isDetailMode) && (
                <ShipmentDetailView
                    loading={loading || detailLoading}
                    activeShipment={activeShipment}
                    canonicalDrafting={canonicalDrafting}
                    paymentTerms={paymentTerms}
                    paymentModes={paymentModes}
                    suppliers={suppliers}
                    branches={dynamicBranches}
                    isSupplierForeign={isSupplierForeign}
                    onUpdateShipmentStatus={onUpdateShipmentStatus}
                    handleStartEdit={handleStartEdit}
                    onPrintPurchaseOrder={handlePrintPurchaseOrder}
                    printLoading={printLoading}
                    onCancelRejectedPurchaseOrder={onCancelRejectedPurchaseOrder}
                    lines={lines}
                    hasShipments={isDetailMode ? Boolean(activeShipment) : filteredShipments.length > 0}
                    detailError={isDetailMode ? detailError : null}
                    referenceError={isDetailMode ? referenceError : null}
                    onRetryDetail={isDetailMode ? onRetryDetail : undefined}
                    backHref={isDetailMode ? backHref : undefined}
                />
            )}

            <ShipmentFormModal
                isModalOpen={isCreateMode || isModalOpen}
                modalRef={modalRef}
                presentation={isCreateMode ? "page" : "modal"}
                canonicalDrafting={canonicalDrafting}
                editingShipmentId={editingShipmentId}
                activeShipment={activeShipment}
                handleCloseModal={isCreateMode ? (onExitCreate || handleCloseModal) : handleCloseModal}
                handleSubmit={handleSubmit}
                shipmentForm={shipmentForm}
                setShipmentForm={setShipmentForm}
                supplierSelectOptions={supplierSelectOptions}
                handleSupplierSelect={handleSupplierSelect}
                handleCurrencyChange={handleCurrencyChange}
                isFinanceManager={isFinanceManager}
                isOverridden={isOverridden}
                setIsOverridden={setIsOverridden}
                dynamicBranches={dynamicBranches}
                linesForm={linesForm}
                setLinesForm={setLinesForm}
                handleAddLineForm={handleAddLineForm}
                handleRemoveLineForm={handleRemoveLineForm}
                handleLineFormChange={handleLineFormChange}
                getLineErrors={getLineErrors}
                supplierRawMaterials={supplierRawMaterials}
                priceControlCostsMap={priceControlCostsMap}
                discountTypes={discountTypes}
                productPerSupplierMap={productPerSupplierMap}
                jobOrders={jobOrders}
                paymentTerms={paymentTerms}
                priceControlStatus={priceControlStatus}
                priceControlError={priceControlError}
                priceTypeResolution={priceTypeResolution}
                hasSubmitted={hasSubmitted}
                draftSummary={draftSummary}
                totalUsdValue={totalUsdValue}
                fxRateStatus={fxRateStatus}
                fxRateError={fxRateError}
                loading={loading}
                listLoading={listLoading}
            />
        </div>
    );
}
