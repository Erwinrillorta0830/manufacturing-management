"use client";

import { Landmark } from "lucide-react";
import SuppliersDirectory from "./components/SuppliersDirectory";
import IncomingShipments from "./components/IncomingShipments";
import ShipmentExpenses from "./components/ShipmentExpenses";
import RawMaterialsMaster from "./components/RawMaterialsMaster";
import ForexManagementModule from "./components/ForexManagementModule";
import PurchaseAmountPostingModule from "./components/PurchaseAmountPostingModule";
import { useProcurement } from "./hooks/useProcurement";
import type { IncomingShipment } from "./types";
import { CreatableSelect } from "../finished-goods/components/CreatableSelect";

interface ProcurementModuleProps {
    initialTab?: string;
    hideNavTabs?: boolean;
}

export default function ProcurementModule({ initialTab = "suppliers" }: ProcurementModuleProps) {

    const {
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
        isEditingSupplier,
        handleStartEditSupplier,
        shipmentForm,
        setShipmentForm,
        shipmentLinesForm,
        setShipmentLinesForm,
        expenseAllocationForm,
        setExpenseAllocationForm,
        handleCreateSupplier,
        handleCreateShipment,
        handleEditShipment,
        handleAllocateExpenses,
        handleUpdateShipmentStatus,
        handleRegisterRawMaterial,
        handleUpdateRawMaterial,
        handleToggleSupplierActive
    } = useProcurement(initialTab);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleTriggerExpenseAllocation = (shipment: any) => {
        setSelectedShipment(shipment);
        setIsExpenseModalOpen(true);
    };

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden space-y-4">
            {/* Module Tabs Navigation */}
            <div className="flex border-b border-border/60 gap-1 bg-muted/20 px-4 pt-2 shrink-0 overflow-x-auto">
                <button
                    type="button"
                    onClick={() => setActiveTab("suppliers")}
                    className={`px-4 py-2 text-xs font-bold border-b-2 transition-all -mb-[1px] cursor-pointer ${activeTab === "suppliers" ? "border-primary text-primary bg-background rounded-t-lg shadow-xs" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                    Suppliers Directory
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("incoming-shipments")}
                    className={`px-4 py-2 text-xs font-bold border-b-2 transition-all -mb-[1px] cursor-pointer ${activeTab === "incoming-shipments" ? "border-primary text-primary bg-background rounded-t-lg shadow-xs" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                    Incoming Shipments
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("shipment-expenses")}
                    className={`px-4 py-2 text-xs font-bold border-b-2 transition-all -mb-[1px] cursor-pointer ${activeTab === "shipment-expenses" ? "border-primary text-primary bg-background rounded-t-lg shadow-xs" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                    Shipment Expenses
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("raw-materials")}
                    className={`px-4 py-2 text-xs font-bold border-b-2 transition-all -mb-[1px] cursor-pointer ${activeTab === "raw-materials" ? "border-primary text-primary bg-background rounded-t-lg shadow-xs" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                    Raw Materials Master
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("forex")}
                    className={`px-4 py-2 text-xs font-bold border-b-2 transition-all -mb-[1px] cursor-pointer ${activeTab === "forex" ? "border-primary text-primary bg-background rounded-t-lg shadow-xs" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                    Forex Rates
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("posting")}
                    className={`px-4 py-2 text-xs font-bold border-b-2 transition-all -mb-[1px] cursor-pointer ${activeTab === "posting" ? "border-primary text-primary bg-background rounded-t-lg shadow-xs" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                    Purchase Postings
                </button>
            </div>

            {/* Tab Content window */}
            <div className={`flex-1 min-h-0 relative flex flex-col ${activeTab === "raw-materials" || activeTab === "forex" ? "overflow-y-auto pr-1" : ""}`}>

                {activeTab === "suppliers" && (
                    <SuppliersDirectory
                        suppliers={suppliers}
                        isModalOpen={isSupplierModalOpen}
                        setIsModalOpen={setIsSupplierModalOpen}
                        supplierForm={supplierForm}
                        setSupplierForm={setSupplierForm}
                        supplierError={supplierError}
                        isEditingSupplier={isEditingSupplier}
                        onStartEditSupplier={handleStartEditSupplier}
                        onCreateSupplier={handleCreateSupplier}
                        onToggleSupplierActive={handleToggleSupplierActive}
                        rawMaterials={rawMaterials}
                    />
                )}

                {activeTab === "incoming-shipments" && (
                    <IncomingShipments
                        shipments={shipments}
                        suppliers={suppliers}
                        rawMaterials={rawMaterials}
                        supplierLinkedProducts={supplierLinkedProducts}
                        selectedShipment={selectedShipment}
                        setSelectedShipment={setSelectedShipment}
                        lines={selectedShipmentLines}
                        isModalOpen={isShipmentModalOpen}
                        setIsModalOpen={setIsShipmentModalOpen}
                        shipmentForm={shipmentForm}
                        setShipmentForm={setShipmentForm}
                        linesForm={shipmentLinesForm}
                        setLinesForm={setShipmentLinesForm}
                        onCreateShipment={handleCreateShipment}
                        onEditShipment={handleEditShipment}
                        onTriggerAllocation={handleTriggerExpenseAllocation}
                        onUpdateShipmentStatus={handleUpdateShipmentStatus}
                        loading={loading}
                    />
                )}

                {activeTab === "shipment-expenses" && (
                    <div className="border rounded-xl p-6 bg-card shadow-sm h-full overflow-y-auto flex flex-col space-y-6">
                        {shipments.length > 0 ? (
                            <div className="space-y-6">
                                {/* Always visible Active Cargo Shipment selection at the top */}
                                <div className="space-y-1.5 max-w-md flex flex-col shrink-0">
                                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">Active Cargo Shipment</label>
                                    <CreatableSelect
                                        options={shipments.map(s => {
                                            const poNo = (s as { purchase_order_no?: string }).purchase_order_no ? ` / ${(s as { purchase_order_no?: string }).purchase_order_no}` : "";
                                            return {
                                                value: String(s.shipment_id),
                                                label: `BL/PO: ${s.reference_number}${poNo} (${s.status})`
                                            };
                                        })}
                                        value={selectedShipment ? String(selectedShipment.shipment_id) : ""}
                                        onValueChange={(val) => {
                                            const match = shipments.find(s => String(s.shipment_id) === val);
                                            if (match) setSelectedShipment(match);
                                        }}
                                        placeholder="Choose Cargo Shipment..."
                                        className="h-10 text-xs w-full bg-background font-semibold"
                                    />
                                </div>

                                {selectedShipment ? (
                                    <ShipmentExpenses
                                        shipment={selectedShipment}
                                        lines={selectedShipmentLines}
                                        expenses={selectedShipmentExpenses}
                                        isModalOpen={isExpenseModalOpen}
                                        setIsModalOpen={setIsExpenseModalOpen}
                                        allocationForm={expenseAllocationForm}
                                        setAllocationForm={setExpenseAllocationForm}
                                        onAllocate={handleAllocateExpenses}
                                        submitting={submittingExpenses}
                                    />
                                ) : (
                                    <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl text-xs text-amber-600 font-semibold">
                                        Please select a shipment from the dropdown above to calculate and allocate landed costs.
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-20 text-center text-muted-foreground">
                                <Landmark className="h-16 w-16 mb-4 text-muted-foreground/30" />
                                No logged shipments available for expense allocation. Go to &quot;Incoming Shipments&quot; to record cargo first.
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "raw-materials" && (
                    <RawMaterialsMaster
                        rawMaterials={rawMaterials}
                        suppliers={suppliers}
                        loadingItems={rawMaterialsLoading}
                        onRegisterRawMaterial={handleRegisterRawMaterial}
                        onUpdateRawMaterial={handleUpdateRawMaterial}
                    />
                )}

                {activeTab === "forex" && (
                    <ForexManagementModule />
                )}

                {activeTab === "purchase-amount" && (
                    <div className="border rounded-xl p-6 bg-card shadow-sm h-full overflow-y-auto flex flex-col space-y-6">
                        <PurchaseAmountPostingModule
                            shipments={shipments}
                            selectedShipment={selectedShipment}
                            setSelectedShipment={(shipment) => setSelectedShipment(shipment as IncomingShipment | null)}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
