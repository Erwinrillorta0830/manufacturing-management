"use client";

import IncomingShipments from "../procurement/components/IncomingShipments";
import { usePurchaseOrder } from "./hooks/usePurchaseOrder";

export default function PurchaseOrderModule() {
    const purchaseOrder = usePurchaseOrder();
    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden space-y-4">
            <IncomingShipments
                shipments={purchaseOrder.shipments}
                suppliers={purchaseOrder.suppliers}
                rawMaterials={purchaseOrder.rawMaterials}
                supplierLinkedProducts={purchaseOrder.supplierLinkedProducts}
                selectedShipment={purchaseOrder.selectedShipment}
                setSelectedShipment={purchaseOrder.setSelectedShipment}
                lines={purchaseOrder.selectedShipmentLines}
                isModalOpen={purchaseOrder.isShipmentModalOpen}
                setIsModalOpen={purchaseOrder.setIsShipmentModalOpen}
                shipmentForm={purchaseOrder.shipmentForm}
                setShipmentForm={purchaseOrder.setShipmentForm}
                linesForm={purchaseOrder.shipmentLinesForm}
                setLinesForm={purchaseOrder.setShipmentLinesForm}
                onCreateShipment={purchaseOrder.handleCreateShipment}
                onEditShipment={purchaseOrder.handleEditShipment}
                onCancelRejectedPurchaseOrder={purchaseOrder.handleCancelRejectedShipment}
                onUpdateShipmentStatus={purchaseOrder.handleUpdateShipmentStatus}
                onTriggerAllocation={() => undefined}
                loading={purchaseOrder.loading}
                listLoading={purchaseOrder.listLoading}
                serverList={{
                    total: purchaseOrder.listMeta.total,
                    totalPages: purchaseOrder.listMeta.totalPages,
                    onQueryChange: purchaseOrder.loadShipments
                }}
                canonicalDrafting
                paymentModes={purchaseOrder.paymentModes}
                priceTypeRules={purchaseOrder.priceTypeRules}
                paymentTerms={purchaseOrder.paymentTerms}
                jobOrders={purchaseOrder.jobOrders}
            />
        </div>
    );
}
