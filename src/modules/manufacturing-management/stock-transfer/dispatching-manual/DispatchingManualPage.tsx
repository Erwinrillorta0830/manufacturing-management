'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Truck, Loader2, CheckCircle2, ChevronLeft, ChevronRight, Hand, Layers, FileText } from 'lucide-react';
import { useStockTransferDispatchManual } from './hooks/use-stock-transfer-dispatch-manual';
import { OrderGroupItem, CurrentUser, ProductRow, ScannedItem } from '../types/stock-transfer.types';
import { cn } from '@/lib/utils';
import { StockTransferPrintPreview } from '../shared/components/StockTransferPrintPreview';
import { getAssetUrl } from '@/lib/assets';
import { resolveBranchSalesman } from '../services/stock-transfer.helpers';
import { StockAllocationModal } from '@/modules/manufacturing-management/shared/components/StockAllocationModal';
import { isBadStockLot } from '@/modules/manufacturing-management/shared/services/lot-tracking.service';
import type { StockAllocationPlan, BatchAllocationResult } from '@/modules/manufacturing-management/shared/types/lot-tracking.types';

// Shared components
import { OrderSelectionModal } from '../shared/components/OrderSelectionModal';
import { QuantityStepper } from '../shared/components/QuantityStepper';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';

export default function StockTransferDispatchManualView({ currentUser: _currentUser }: { currentUser: CurrentUser }) {
  const {
    branches,
    orderGroups,
    selectedGroup,
    selectedOrderNo,
    setSelectedOrderNo,
    loading,
    processing,
    fetchError,
    dispatchOrder,
    getBranchName,
    markAsPicked,
    fetchingAvailable,
    scannedQtys,
    updateScannedQty,
    updateItemAllocationPlan,
  } = useStockTransferDispatchManual();

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showPrintSlip, setShowPrintSlip] = useState(false);
  const [lotBatchModalOpen, setLotBatchModalOpen] = useState(false);
  const [
    activePickingItem,
    setActivePickingItem,
  ] = useState<OrderGroupItem | null>(null);

  const handleOpenAllocationModal = (item: OrderGroupItem) => {
    setActivePickingItem(item);
    setLotBatchModalOpen(true);
  };

  const handleApplyAllocation = (plan: StockAllocationPlan) => {
    if (!activePickingItem) return;
    updateItemAllocationPlan(activePickingItem.id, plan);
    setLotBatchModalOpen(false);
    setActivePickingItem(null);
  };

  // Reset page when group changes
  React.useEffect(() => {
    queueMicrotask(() => {
      setCurrentPage(1);
    });
  }, [selectedOrderNo]);

  const totalItems = selectedGroup?.items.length || 0;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const paginatedItems = selectedGroup?.items.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  ) || [];

  const hasScannedAny = selectedGroup?.items.some((i: OrderGroupItem) => {
    return (scannedQtys[i.id] ?? 0) > 0;
  }) ?? false;

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2 print:hidden">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Stock Withdrawal (Manual)</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowPrintSlip(true)}
            disabled={!selectedGroup}
            className="gap-2 border-border shadow-none"
          >
            <FileText className="w-4 h-4" /> Print Dispatch Slip
          </Button>
        </div>
      </div>

      <Card className="border-border shadow-none bg-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 print:hidden">
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold">Manual Withdrawal</CardTitle>
            <CardDescription>
              Fulfill approved stock transfers through quantitative manual entry.
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Hand className="h-8 w-8 text-muted-foreground/30" />
            {selectedGroup && (
              <div className={cn(
                "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
                selectedGroup.status === 'For Picking' && "bg-amber-100 text-amber-700 border-amber-200",
                selectedGroup.status === 'Picking' && "bg-blue-100 text-blue-700 border-blue-200 animate-pulse",
                selectedGroup.status === 'Picked' && "bg-emerald-100 text-emerald-700 border-emerald-200"
              )}>
                {selectedGroup.status}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="mt-4 space-y-6">
          {!loading && !fetchError && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:hidden">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Select Order
                </label>
                <OrderSelectionModal
                  orderGroups={orderGroups}
                  selectedOrderNo={selectedOrderNo}
                  onSelect={setSelectedOrderNo}
                  getBranchName={getBranchName}
                />
              </div>

              <div className="flex items-center justify-end">
                {selectedGroup && selectedGroup.status !== 'Picked' && (
                  <Button 
                    className="bg-amber-600 hover:bg-amber-700 gap-2 shadow-none font-bold text-xs"
                    onClick={() => markAsPicked(selectedGroup.orderNo)}
                    disabled={processing || selectedGroup.status !== 'For Picking' || !hasScannedAny}
                  >
                    {processing ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <CheckCircle2 className="w-4 h-4 text-white" />}
                    Mark as Done Picking
                  </Button>
                )}
              </div>
            </div>
          )}

          {selectedGroup && (
            <div className="space-y-6 border border-border rounded-xl overflow-hidden shadow-sm bg-card/50">
              <div className="bg-muted/30 p-4 border-b border-border">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Source</p>
                    <p className="font-medium text-sm">{getBranchName(selectedGroup.sourceBranch)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Target</p>
                    <p className="font-medium text-sm">{getBranchName(selectedGroup.targetBranch)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider font-mono">Reference</p>
                    <p className="font-medium text-sm">{selectedGroup.orderNo}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Requested On</p>
                    <p className="font-medium text-sm">{new Date(selectedGroup.dateRequested).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}</p>
                  </div>
                </div>
              </div>

              <div className="p-4 print:p-0">
                <Table className="w-full">
                  <TableHeader>
                    <TableRow className="border-b border-border bg-muted/20">
                      <TableHead className="text-[10px] uppercase font-bold">Product Name</TableHead>
                      <TableHead className="text-[10px] uppercase font-bold">Lot and Batch</TableHead>
                      <TableHead className="text-[10px] uppercase font-bold text-center">UOM</TableHead>
                      <TableHead className="text-[10px] uppercase font-bold text-center">Allocated Qty</TableHead>
                      <TableHead className="text-[10px] uppercase font-bold text-center">Available Qty</TableHead>
                      <TableHead className="text-[10px] uppercase font-bold text-center print:hidden">Manual Qty</TableHead>
                      <TableHead className="text-[10px] uppercase font-bold text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedItems.map((item: OrderGroupItem) => {
                      const targetQty = Number(item.allocated_quantity || 0);
                      const availableQty = Number(item.qtyAvailable || 0);
                      const maxAllowedQty = Math.min(targetQty, availableQty);
                      const currentQty = scannedQtys[item.id] ?? 0;
                      const product = typeof item.product_id === 'object' && item.product_id !== null ? item.product_id : null;
                      const productName = product?.product_name || (typeof item.product_id === 'number' ? `Product #${item.product_id}` : 'Product');
                      const productImage = getAssetUrl(product?.product_image);
                      const unitName = typeof product?.unit_of_measurement === 'object' && product.unit_of_measurement !== null 
                        ? (product.unit_of_measurement as { unit_name?: string }).unit_name 
                        : 'unit';

                      return (
                        <TableRow key={item.id} className="border-b border-border/50">
                          {/* 1. Product Name */}
                          <TableCell className="py-3">
                            <div className="flex items-center gap-3">
                              {productImage ? (
                                <div className="h-9 w-9 rounded-lg bg-muted/40 border border-border/60 overflow-hidden shrink-0 relative">
                                  <Image
                                    src={productImage}
                                    alt={productName}
                                    fill
                                    unoptimized
                                    className="object-cover"
                                  />
                                </div>
                              ) : (
                                <div className="h-9 w-9 rounded-lg bg-muted/30 border border-border/40 flex items-center justify-center shrink-0 text-[10px] font-mono font-bold text-muted-foreground/60">
                                  {productName.substring(0, 2).toUpperCase()}
                                </div>
                              )}
                              <div className="flex flex-col min-w-0">
                                <span className="font-semibold text-sm line-clamp-1">{productName}</span>
                              </div>
                            </div>
                          </TableCell>

                          {/* 2. Lot and Batch */}
                          <TableCell className="py-3">
                            <div className="flex flex-col gap-1">
                              {item.batch_no ? (
                                <button
                                  type="button"
                                  disabled={selectedGroup?.status !== 'For Picking'}
                                  onClick={() => handleOpenAllocationModal(item)}
                                  className={cn(
                                    "inline-flex items-center gap-1 text-[9px] font-mono font-semibold px-2 py-1 rounded bg-primary/10 border border-primary/20 text-primary transition-all text-left w-fit",
                                    selectedGroup?.status === 'For Picking' && "hover:bg-primary/20 hover:border-primary/40 cursor-pointer shadow-xs"
                                  )}
                                  title={selectedGroup?.status === 'For Picking' ? "Click to change picked lot and batch" : undefined}
                                >
                                  <Layers className="w-2.5 h-2.5 text-primary shrink-0" />
                                  <span>Batch: {item.batch_no}</span>
                                  {item.source_lot_id && (
                                    <span className="text-[9px] text-muted-foreground ml-1">(Lot #{item.source_lot_id})</span>
                                  )}
                                </button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={selectedGroup?.status !== 'For Picking'}
                                  onClick={() => handleOpenAllocationModal(item)}
                                  className="h-7 text-[10px] font-bold uppercase tracking-wider gap-1.5 border-dashed border-primary/50 text-primary hover:bg-primary/10 hover:border-primary px-2 shadow-none w-fit"
                                >
                                  <Layers className="w-3 h-3" />
                                  Allocate Stock
                                </Button>
                              )}
                            </div>
                          </TableCell>

                          {/* 3. UOM */}
                          <TableCell className="text-[10px] text-center font-medium uppercase text-muted-foreground">
                            {unitName}
                          </TableCell>

                          {/* 4. Allocated Qty */}
                          <TableCell className="text-sm font-bold text-center font-mono">{targetQty}</TableCell>

                          {/* 5. Available Qty */}
                          <TableCell className="text-xs text-center font-medium font-mono text-muted-foreground italic">
                            {fetchingAvailable ? (
                              <Loader2 className="w-3 h-3 animate-spin mx-auto text-primary" />
                            ) : (
                              availableQty
                            )}
                          </TableCell>

                          {/* 6. Manual Qty */}
                          <TableCell className="print:hidden text-center">
                            <QuantityStepper 
                              value={currentQty}
                              max={maxAllowedQty}
                              onChange={(val) => updateScannedQty(item.id, val, maxAllowedQty)}
                              disabled={selectedGroup?.status !== 'For Picking'}
                              className="h-8 w-fit mx-auto"
                              size="sm"
                            />
                          </TableCell>

                          {/* 7. Amount */}
                          <TableCell className="text-right text-xs font-semibold font-mono text-foreground">
                            ₱{((currentQty || 0) * Number(product?.cost_per_unit || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter className="bg-muted/10">
                    <TableRow>
                      <TableCell colSpan={6} className="text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total Withdrawal Amount</TableCell>
                      <TableCell className="text-right text-sm font-bold text-foreground font-mono">
                        ₱{selectedGroup.items.reduce((sum: number, item: OrderGroupItem) => {
                          const sqty = scannedQtys[item.id] ?? 0;
                          const product = typeof item.product_id === 'object' && item.product_id !== null ? item.product_id : null;
                          const unitPrice = Number(product?.cost_per_unit || 0);
                          return sum + (sqty * unitPrice);
                        }, 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>

                <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden px-2">
                   <div className="flex items-center gap-4">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Page View</span>
                    <Select
                      value={String(itemsPerPage)}
                      onValueChange={(v) => {
                        setItemsPerPage(Number(v));
                        setCurrentPage(1);
                      }}
                    >
                      <SelectTrigger className="h-8 min-w-[76px] w-auto px-2.5 text-xs font-bold border-border shadow-none">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[10, 20, 50, 100].map((v) => (
                          <SelectItem key={v} value={String(v)} className="text-xs">{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(p => p - 1)}
                        className="h-8 w-8 p-0 border-border"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-xs font-mono font-bold text-muted-foreground mx-2">{currentPage} / {totalPages}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(p => p + 1)}
                        className="h-8 w-8 p-0 border-border"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  )}

                  <div className="flex items-center gap-3 w-full sm:w-auto mt-4 sm:mt-0">
                    <Button
                      className={cn(
                        "flex-1 sm:flex-none font-bold text-xs shadow-none",
                        selectedGroup.status === 'Picked' ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-muted text-muted-foreground"
                      )}
                      disabled={processing || selectedGroup.status !== 'Picked'}
                      onClick={() => dispatchOrder(selectedGroup.orderNo)}
                    >
                      {processing && <Loader2 className="mr-2 h-3 w-3 animate-spin text-white" />}
                      <Truck className="w-3 h-3 mr-2" />
                      Confirm Manual Dispatch
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Dispatch Slip Preview */}
      {selectedGroup && (
        <StockTransferPrintPreview
          open={showPrintSlip}
          onClose={() => setShowPrintSlip(false)}
          documentTitle="STOCK TRANSFER DISPATCH SLIP"
          orderNo={selectedGroup.orderNo}
          status={selectedGroup.status}
          sourceBranchLabel={getBranchName(selectedGroup.sourceBranch)}
          targetBranchLabel={getBranchName(selectedGroup.targetBranch)}
          leadDate={selectedGroup.dateRequested ? new Date(selectedGroup.dateRequested).toLocaleDateString('en-PH') : '—'}
          salesmanName={resolveBranchSalesman(selectedGroup.targetBranch, branches)}
          scannedItems={selectedGroup.items.map((i: OrderGroupItem) => {
            const product = typeof i.product_id === 'object' && i.product_id !== null ? (i.product_id as ProductRow) : null;
            const uom = typeof product?.unit_of_measurement === 'object' ? product?.unit_of_measurement : null;
            const brand = typeof product?.product_brand === 'object' ? product?.product_brand?.brand_name : '';
            const allocs = i.lot_allocations && i.lot_allocations.length > 0 ? i.lot_allocations : undefined;
            const batchTotal = allocs
              ? allocs.reduce((sum, g) => sum + (g.batches || []).reduce((bSum, b) => bSum + Number(b.quantity || 0), 0), 0)
              : undefined;
            const qty = batchTotal !== undefined
              ? batchTotal
              : (scannedQtys[i.id] ?? Math.max(0, i.scanned_quantity ?? i.picked_quantity ?? i.allocated_quantity ?? 0));
            const unitPrice = Number(product?.cost_per_unit || 0);

            return {
              rfid: '',
              productId: Number(product?.product_id || i.product_id),
              productName: product?.product_name || `Product #${i.product_id}`,
              description: product?.description || '',
              brandName: brand || 'N/A',
              unit: uom?.unit_name || 'unit',
              qtyAvailable: i.qtyAvailable || 0,
              unitQty: qty,
              unitPrice: unitPrice,
              totalAmount: qty * unitPrice,
              lot_id: i.source_lot_id,
              batch_no: i.batch_no,
              manufacturing_date: i.manufacturing_date,
              expiry_date: i.expiry_date,
              lot_allocations: i.lot_allocations,
            } as ScannedItem;
          })}
        />
      )}

      {/* Stock Allocation Engine Modal for Picking */}
      {selectedGroup && activePickingItem && (() => {
        const product = typeof activePickingItem.product_id === 'object' && activePickingItem.product_id !== null
          ? (activePickingItem.product_id as ProductRow)
          : null;
        const productId = product?.product_id ?? Number(activePickingItem.product_id);
        const productName = product?.product_name;
        const uomName = typeof product?.unit_of_measurement === 'object' && product.unit_of_measurement !== null
          ? ((product.unit_of_measurement as { unit_name?: string }).unit_name || 'units')
          : 'units';
        const requestedQty = Number(activePickingItem.allocated_quantity || activePickingItem.ordered_quantity || 1);

        // Build initial allocations from existing lot data on the item
        const existingAllocations: BatchAllocationResult[] | undefined =
          activePickingItem.lot_allocations && activePickingItem.lot_allocations.length > 0
            ? activePickingItem.lot_allocations.flatMap((grp) =>
                (grp.batches || []).map((b) => ({
                  inventory_lot_id: b.inventory_lot_id ?? 0,
                  lot_id: grp.lot_id,
                  lot_name: grp.lot_name,
                  batch_no: b.batch_no,
                  expiry_date: b.expiry_date ?? null,
                  manufacturing_date: b.manufacturing_date ?? null,
                  unit_cost: b.unit_cost ?? 0,
                  qa_status: b.qa_status,
                  status: 'ACTIVE' as const,
                  available_quantity: grp.allocated_quantity,
                  allocated_quantity: b.quantity,
                  priority_index: 0,
                  priority_label: 'P1',
                  days_until_expiry: null,
                  is_expired: false,
                  is_eligible: true,
                }))
              )
            : activePickingItem.batch_no && activePickingItem.source_inventory_lot_id
            ? [{
                inventory_lot_id: activePickingItem.source_inventory_lot_id ?? 0,
                lot_id: activePickingItem.source_lot_id ?? 0,
                batch_no: activePickingItem.batch_no,
                expiry_date: null,
                manufacturing_date: null,
                unit_cost: 0,
                qa_status: 'GOOD' as const,
                status: 'ACTIVE' as const,
                available_quantity: requestedQty,
                allocated_quantity: requestedQty,
                priority_index: 0,
                priority_label: 'P1',
                days_until_expiry: null,
                is_expired: false,
                is_eligible: true,
              } as BatchAllocationResult]
            : undefined;

        const targetBranchName = getBranchName(selectedGroup.targetBranch);
        const targetBranchObj = branches.find((b) => Number(b.id) === Number(selectedGroup.targetBranch));
        const isTargetBadStock = isBadStockLot(undefined, targetBranchObj || { branch_name: targetBranchName });

        return (
          <StockAllocationModal
            open={lotBatchModalOpen}
            onOpenChange={(open) => {
              setLotBatchModalOpen(open);
              if (!open) setActivePickingItem(null);
            }}
            branchId={selectedGroup.sourceBranch ? Number(selectedGroup.sourceBranch) : 0}
            targetBranchId={selectedGroup.targetBranch}
            targetBranchName={targetBranchName}
            isTargetBadStock={isTargetBadStock}
            productId={productId}
            productName={productName}
            requestedQuantity={requestedQty}
            uomName={uomName}
            initialAllocations={existingAllocations}
            onConfirm={handleApplyAllocation}
          />
        );
      })()}
    </div>
  );
}
