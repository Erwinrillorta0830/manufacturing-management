'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Truck, ScanLine, Loader2, CheckCircle2, Radar, Edit2, Layers, FileText } from 'lucide-react';
import { useStockTransferDispatch } from './hooks/use-stock-transfer-dispatch';
import { cn } from '@/lib/utils';
import { ScanHistorySidebar } from '../shared/components/ScanHistorySidebar';
import { StockTransferPrintPreview } from '../shared/components/StockTransferPrintPreview';
import { getAssetUrl } from '@/lib/assets';
import { resolveBranchSalesman } from '../services/stock-transfer.helpers';
import type { CurrentUser, OrderGroupItem, ProductRow, UnitOfMeasurement, ScannedItem } from '../types/stock-transfer.types';
import { LotBatchSelectionModal, LotBatchSelectionResult } from '@/modules/manufacturing-management/shared/components/LotBatchSelectionModal';

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
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination';

export default function StockTransferDispatchView({ currentUser }: { currentUser: CurrentUser }) {
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
    handleScanRFID,
    getBranchName,
    markAsPicked,
    fetchingAvailable,
    recentScans,
    isThrottled,
    clearHistory,
    updateManualQty,
    updateItemLot,
  } = useStockTransferDispatch({ currentUser });

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showPrintSlip, setShowPrintSlip] = useState(false);
  const [lotBatchModalOpen, setLotBatchModalOpen] = useState(false);
  const [activePickingItem, setActivePickingItem] = useState<OrderGroupItem | null>(null);

  const handleOpenLotBatchModal = (item: OrderGroupItem) => {
    setActivePickingItem(item);
    setLotBatchModalOpen(true);
  };

  const handleApplyLotBatch = (result: LotBatchSelectionResult) => {
    if (!activePickingItem) return;
    updateItemLot(activePickingItem.id, result);
    setLotBatchModalOpen(false);
    setActivePickingItem(null);
  };

  // Reset page when group or page size changes
  React.useEffect(() => {
    queueMicrotask(() => {
      setCurrentPage(1);
    });
  }, [selectedOrderNo, itemsPerPage]);

  const totalItems = selectedGroup?.items.length || 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const paginatedItems = selectedGroup?.items.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  ) || [];

  function buildPageList(current: number, total: number): (number | 'ellipsis')[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | 'ellipsis')[] = [1];
    if (current > 3) pages.push('ellipsis');
    const rangeStart = Math.max(2, current - 1);
    const rangeEnd = Math.min(total - 1, current + 1);
    for (let p = rangeStart; p <= rangeEnd; p++) pages.push(p);
    if (current < total - 2) pages.push('ellipsis');
    pages.push(total);
    return pages;
  }

  const [rfidInput, setRfidInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const rfidBuffer = React.useRef('');

  const metrics = React.useMemo(() => {
    if (!selectedGroup) return { totalItems: 0, totalUnits: 0, pickedUnits: 0, progress: 0 };
    
    const items = selectedGroup.items;
    const totalItems = items.length;
    const totalUnits = items.reduce((acc, i) => acc + Math.max(0, i.allocated_quantity ?? 0), 0);
    const pickedUnits = items.reduce((acc, i) => acc + (i.scannedQty || 0), 0);
    const progress = totalUnits > 0 ? Math.round((pickedUnits / totalUnits) * 100) : 0;

    return { totalItems, totalUnits, pickedUnits, progress };
  }, [selectedGroup]);

  // ── Global RFID listener ──
  React.useEffect(() => {
    if (!selectedOrderNo) return;

    const handleGlobalKey = async (e: globalThis.KeyboardEvent) => {
      // Ignore if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;

      if (e.ctrlKey || e.altKey || e.metaKey) return;

      if (e.key === 'Enter') {
        const val = rfidBuffer.current.trim();
        rfidBuffer.current = '';
        setRfidInput('');
        if (!val || isScanning) return;
        setIsScanning(true);
        try {
          await handleScanRFID(val);
        } finally {
          setIsScanning(false);
        }
      } else if (e.key.length === 1 && !isScanning) {
        rfidBuffer.current += e.key;
        setRfidInput(rfidBuffer.current);
      }
    };

    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [selectedOrderNo, isScanning, handleScanRFID]);

  const isAllScanned = selectedGroup?.items.every((i: OrderGroupItem) => {
    const targetQty = Math.max(0, i.allocated_quantity ?? 0);
    return (i.scannedQty || 0) >= targetQty;
  });

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-4 md:p-8 pt-6 min-h-screen bg-background">
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          @page { margin: 1cm; size: auto; }
          .print-hidden { display: none !important; }
        }
        @keyframes loading-bar {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(0); }
          100% { transform: translateX(100%); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.2s ease-in-out 0s 2;
        }
      ` }} />
      
      {/* Main Content Area */}
      <div className="flex-1 space-y-4">
        <div className="flex items-center justify-between space-y-2 print:hidden">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Stock Withdrawal (RFID)</h2>
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
              <CardTitle className="text-2xl font-bold">Execution & Picking</CardTitle>
              <CardDescription>
                Fulfill approved transfers through RFID scanning.
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Truck className="h-8 w-8 text-muted-foreground/30" />
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
              <div className="print:hidden">
                <div className="max-w-md space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground group flex items-center gap-1.5">
                    Select Order
                  </label>
                  <OrderSelectionModal
                    orderGroups={orderGroups}
                    selectedOrderNo={selectedOrderNo}
                    onSelect={setSelectedOrderNo}
                    getBranchName={getBranchName}
                  />
                </div>
              </div>
            )}

            {selectedGroup && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-2 duration-500">
                <MetricCard 
                  label="Progress" 
                  value={`${metrics.progress}%`} 
                  subValue={`${metrics.pickedUnits} / ${metrics.totalUnits} Units`}
                  icon={Radar}
                  color="text-primary"
                />
                <MetricCard 
                  label="Total Items" 
                  value={metrics.totalItems} 
                  subValue="Unique Products"
                  icon={Truck}
                  color="text-sky-500"
                />
                <MetricCard 
                  label="Remaining" 
                  value={Math.max(0, metrics.totalUnits - metrics.pickedUnits)} 
                  subValue="Units to Pick"
                  icon={ScanLine}
                  color="text-amber-500"
                />
                <div className="bg-muted/30 border border-border/50 rounded-xl p-4 flex flex-col justify-center items-center">
                  <div className="w-full bg-muted rounded-full h-1.5 mb-2 overflow-hidden">
                    <div 
                      className="bg-primary h-full transition-all duration-1000 ease-out" 
                      style={{ width: `${metrics.progress}%` }} 
                    />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Order Status</p>
                  <p className="text-xs font-semibold mt-1">{selectedGroup.status}</p>
                </div>
              </div>
            )}

            {selectedGroup && (
              <div className="space-y-6 border border-border rounded-xl overflow-hidden shadow-sm bg-card/50">
                <div className="bg-muted/30 p-4 border-b border-border">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Source</p>
                      <p className="font-medium text-sm">{getBranchName(selectedGroup.sourceBranch)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Target</p>
                      <p className="font-medium text-sm">{getBranchName(selectedGroup.targetBranch)}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider font-mono">{selectedGroup.orderNo}</p>
                      <p className="font-medium text-sm">Requested Transfer</p>
                    </div>
                  </div>
                </div>

                <div className="p-0 sm:p-4">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-border bg-muted/20">
                        <TableHead className="text-[10px] uppercase font-bold">Product Name</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold">Lot and Batch</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold text-center">UOM</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold text-center">Allocated Qty</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold text-center">Available Qty</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold text-center">Manual Qty</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedItems.map((item: OrderGroupItem) => {
                        const targetQty = Math.max(0, item.allocated_quantity ?? 0);
                        const complete = (item.scannedQty || 0) >= targetQty;
                        const product = typeof item.product_id === 'object' && item.product_id !== null ? (item.product_id as ProductRow) : null;
                        const productName = product?.product_name || (typeof item.product_id === 'number' ? `Product #${item.product_id}` : 'Product');
                        const productImage = getAssetUrl(product?.product_image);
                        const unitName = typeof product?.unit_of_measurement === 'object' && product.unit_of_measurement !== null 
                          ? (product.unit_of_measurement as UnitOfMeasurement).unit_name 
                          : 'unit';
                        const itemAmount = Number(item.amount) || (targetQty * Number(product?.cost_per_unit || 0));

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
                                  {item.isLoosePack && (
                                    <span className="text-[9px] bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded w-fit mt-1 font-bold flex items-center gap-1">
                                      <Edit2 className="w-2 h-2" /> MANUAL ENTRY
                                    </span>
                                  )}
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
                                    onClick={() => handleOpenLotBatchModal(item)}
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
                                    onClick={() => handleOpenLotBatchModal(item)}
                                    className="h-7 text-[10px] font-bold uppercase tracking-wider gap-1.5 border-dashed border-primary/50 text-primary hover:bg-primary/10 hover:border-primary px-2 shadow-none w-fit"
                                  >
                                    <Layers className="w-3 h-3" />
                                    Pick Lot & Batch
                                  </Button>
                                )}
                              </div>
                            </TableCell>

                            {/* 3. UOM */}
                            <TableCell className="text-[10px] text-center font-medium uppercase text-muted-foreground">
                              {unitName}
                            </TableCell>

                            {/* 4. Allocated Qty */}
                            <TableCell className="text-sm text-center font-bold text-foreground font-mono">
                              {targetQty}
                            </TableCell>

                            {/* 5. Available Qty */}
                            <TableCell className="text-xs text-center font-medium font-mono text-muted-foreground italic">
                              {fetchingAvailable ? (
                                <Loader2 className="w-3 h-3 animate-spin mx-auto text-primary" />
                              ) : (
                                Math.max(0, item.qtyAvailable ?? 0)
                              )}
                            </TableCell>

                            {/* 6. Manual Qty */}
                            <TableCell className="text-sm text-center">
                              {item.isLoosePack ? (() => {
                                const pid = Number(product?.product_id || item.product_id);
                                const currentQty = item.scannedQty ?? 0;
                                return (
                                  <QuantityStepper 
                                    value={currentQty}
                                    max={targetQty}
                                    onChange={(val) => {
                                      if (!isNaN(pid)) updateManualQty(pid, val);
                                    }}
                                    className="h-8"
                                    size="sm"
                                  />
                                );
                              })() : (
                                <span className={cn("font-bold font-mono", complete ? 'text-emerald-500' : 'text-amber-500')}>
                                  {item.scannedQty || 0}
                                </span>
                              )}
                            </TableCell>

                            {/* 7. Amount */}
                            <TableCell className="text-right text-xs font-semibold font-mono text-foreground">
                              ₱{itemAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>

                  {/* Pagination Section */}
                  {totalItems > 0 && (
                    <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-2 bg-muted/5 print:hidden">
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                          {Math.min(itemsPerPage * (currentPage - 1) + 1, totalItems)}–{Math.min(itemsPerPage * currentPage, totalItems)} of {totalItems}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Show</span>
                          <Select
                            value={String(itemsPerPage)}
                            onValueChange={(v) => setItemsPerPage(Number(v))}
                          >
                            <SelectTrigger className="h-7 min-w-[76px] w-auto px-2.5 text-[10px] font-bold border-border shadow-none bg-background">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[10, 20, 50, 100].map((s) => (
                                <SelectItem key={s} value={String(s)} className="text-[10px] font-bold">
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {totalPages > 1 && (
                        <Pagination className="w-auto mx-0 justify-end scale-90 origin-right">
                          <PaginationContent>
                            <PaginationItem>
                              <PaginationPrevious
                                href="#"
                                onClick={(e) => { e.preventDefault(); setCurrentPage((p) => Math.max(1, p - 1)); }}
                                className={currentPage === 1 ? 'pointer-events-none opacity-40' : ''}
                              />
                            </PaginationItem>
                            {buildPageList(currentPage, totalPages).map((p, i) =>
                              p === 'ellipsis' ? (
                                <PaginationItem key={`ellipsis-${i}`}>
                                  <PaginationEllipsis />
                                </PaginationItem>
                              ) : (
                                <PaginationItem key={p}>
                                  <PaginationLink
                                    href="#"
                                    isActive={p === currentPage}
                                    onClick={(e) => { e.preventDefault(); setCurrentPage(p); }}
                                  >
                                    {p}
                                  </PaginationLink>
                                </PaginationItem>
                              )
                            )}
                            <PaginationItem>
                              <PaginationNext
                                href="#"
                                onClick={(e) => { e.preventDefault(); setCurrentPage((p) => Math.min(totalPages, p + 1)); }}
                                className={currentPage === totalPages ? 'pointer-events-none opacity-40' : ''}
                              />
                            </PaginationItem>
                          </PaginationContent>
                        </Pagination>
                      )}
                    </div>
                  )}

                  <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 lg:p-0 print:hidden">
                    <div className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground text-center sm:text-left">
                      {!isAllScanned ? (
                        <span className="text-amber-600/80 italic">Scanning in progress...</span>
                      ) : (
                        <span className="text-emerald-600">Verification Complete</span>
                      )}
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      {selectedGroup.status === 'Picking' && !isAllScanned && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={processing}
                          onClick={() => markAsPicked(selectedGroup.orderNo)}
                          className="text-xs font-bold"
                        >
                          Done Picking
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className={cn(
                          "w-full sm:w-auto font-bold text-xs shadow-none px-6 transition-all",
                          (isAllScanned || selectedGroup.status === 'Picked') 
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white" 
                            : "bg-muted text-muted-foreground"
                        )}
                        disabled={processing || (!isAllScanned && selectedGroup.status !== 'Picked')}
                        onClick={() => dispatchOrder(selectedGroup.orderNo)}
                      >
                        {processing && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                        Dispatch Order
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sidebar Panel */}
      <aside className="w-full lg:w-[320px] print:hidden">
        <ScanHistorySidebar 
          scans={recentScans} 
          isScanning={isScanning}
          selectedGroup={selectedGroup}
          buffer={rfidInput}
          isThrottled={isThrottled}
          onClear={clearHistory}
        />
      </aside>

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
              : Math.max(0, i.scannedQty ?? i.scanned_quantity ?? i.picked_quantity ?? i.allocated_quantity ?? 0);
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

      {/* Lot & Batch Selection Modal for Picking */}
      {selectedGroup && (
        <LotBatchSelectionModal
          open={lotBatchModalOpen}
          onOpenChange={setLotBatchModalOpen}
          branchId={selectedGroup.sourceBranch ? Number(selectedGroup.sourceBranch) : undefined}
          productId={activePickingItem ? (typeof activePickingItem.product_id === 'object' && activePickingItem.product_id !== null ? (activePickingItem.product_id as ProductRow).product_id : Number(activePickingItem.product_id)) : undefined}
          productName={activePickingItem ? (typeof activePickingItem.product_id === 'object' && activePickingItem.product_id !== null ? (activePickingItem.product_id as ProductRow).product_name : undefined) : undefined}
          productCode={activePickingItem ? (typeof activePickingItem.product_id === 'object' && activePickingItem.product_id !== null ? (activePickingItem.product_id as ProductRow).product_code : undefined) : undefined}
          productUomName={activePickingItem ? (typeof activePickingItem.product_id === 'object' && activePickingItem.product_id !== null && (activePickingItem.product_id as ProductRow).unit_of_measurement ? ((activePickingItem.product_id as ProductRow).unit_of_measurement as { unit_name?: string }).unit_name : 'units') : 'units'}
          requestedQuantity={activePickingItem ? (activePickingItem.allocated_quantity || activePickingItem.ordered_quantity || 1) : 1}
          adjustmentType="OUT"
          mode="SELECT_EXISTING"
          initialValues={activePickingItem ? {
            batch_no: activePickingItem.batch_no || '',
            lot_id: activePickingItem.source_lot_id || undefined,
            inventory_lot_id: activePickingItem.source_inventory_lot_id || undefined,
          } : undefined}
          onConfirm={handleApplyLotBatch}
        />
      )}
    </div>
  );
}

function MetricCard({ label, value, subValue, icon: Icon, color }: {
  label: string;
  value: string | number;
  subValue: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-muted/30 border border-border/50 rounded-xl p-4 flex items-start justify-between group transition-all hover:bg-muted/50 hover:border-border">
      <div className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="text-2xl font-black tracking-tight">{value}</p>
        <p className="text-[10px] text-muted-foreground font-medium">{subValue}</p>
      </div>
      <div className={cn("p-2 rounded-lg bg-background shadow-sm border border-border/50 transition-transform group-hover:scale-110", color)}>
        <Icon className="w-4 h-4" />
      </div>
    </div>
  );
}
