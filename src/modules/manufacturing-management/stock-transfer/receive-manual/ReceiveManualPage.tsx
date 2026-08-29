'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PackageOpen, Printer, Loader2, ChevronLeft, ChevronRight, Hand, Paperclip, X, AlertTriangle, Layers, Plus, Sparkles } from 'lucide-react';
import { useStockTransferReceiveManual } from './hooks/use-stock-transfer-receive-manual';
import { OrderGroupItem, UnitOfMeasurement, CurrentUser, ProductRow } from '../types/stock-transfer.types';
import { cn } from '@/lib/utils';
import { getAssetUrl } from '@/lib/assets';
import { StockTransferReceivingPreview } from '../shared/components/StockTransferReceivingPreview';
import { SearchableSelect } from '@/modules/manufacturing-management/shared/components/SearchableSelect';
import { checkLotProductTypeCompatibility, isBadStockLot } from '@/modules/manufacturing-management/shared/services/lot-tracking.service';
import { LotBatchSelectionModal, LotBatchSelectionResult } from '@/modules/manufacturing-management/shared/components/LotBatchSelectionModal';
import { LotAllocationGroup } from '@/modules/manufacturing-management/shared/types/lot-tracking.types';

// Shared components
import { OrderSelectionModal } from '../shared/components/OrderSelectionModal';
import { QuantityStepper } from '../shared/components/QuantityStepper';
import { Badge } from '@/components/ui/badge';
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
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export default function StockTransferReceiveManualView({ currentUser }: { currentUser: CurrentUser }) {
  const {
    orderGroups,
    selectedGroup,
    selectedOrderNo,
    setSelectedOrderNo,
    loading,
    processing,
    fetchError,
    receiveOrder,
    getBranchName,
    receivedQtys,
    updateReceivedQty,
    destinationLotIds,
    updateDestinationLot,
    destinationBatchNos,
    updateDestinationBatchNo,
    itemLotAllocations,
    updateItemLotAllocations,
    targetLots,
    loadingLots,
    lotStoredSummaryMap,
    getItemClassification,
    getLotCompatibility,
    selectedFiles,
    isUploading,
    addSelectedFiles,
    removeSelectedFile,
    remarks,
    setRemarks,
  } = useStockTransferReceiveManual();

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [lotBatchModalOpen, setLotBatchModalOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<OrderGroupItem | null>(null);

  const handleOpenLotBatchModal = (item: OrderGroupItem) => {
    setActiveItem(item);
    setLotBatchModalOpen(true);
  };

  const handleApplyLotBatch = (result: LotBatchSelectionResult) => {
    if (!activeItem) return;
    if (result.lot_allocations && result.lot_allocations.length > 0) {
      updateItemLotAllocations(activeItem.id, result.lot_allocations);
    } else if (result.lot_id) {
      updateDestinationLot(activeItem.id, result.lot_id);
      if (result.batch_no) {
        updateDestinationBatchNo(activeItem.id, result.batch_no);
      }
      if (result.total_quantity !== undefined) {
        const targetQty = Math.max(
          0,
          activeItem.scanned_quantity ??
            activeItem.picked_quantity ??
            activeItem.allocated_quantity ??
            0
        );
        updateReceivedQty(activeItem.id, result.total_quantity, targetQty || result.total_quantity);
      }
    }
    setLotBatchModalOpen(false);
    setActiveItem(null);
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

  const isAllReceived = selectedGroup?.items.every((i: OrderGroupItem) => {
    const targetQty = Math.max(0, i.scanned_quantity ?? i.picked_quantity ?? i.allocated_quantity ?? 0);
    return (receivedQtys[i.id] ?? 0) >= targetQty;
  }) ?? false;

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2 print:hidden">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Stock Deposit (Manual)</h2>
        <Button
          variant="outline"
          onClick={() => setShowPrintPreview(true)}
          disabled={!selectedGroup}
          className="gap-2 border-border shadow-none"
        >
          <Printer className="w-4 h-4" /> Print Receipt
        </Button>
      </div>

      <Card className="border-border shadow-none bg-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 print:hidden">
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold">Manual Verification</CardTitle>
            <CardDescription>
              Verify incoming items through quantitative manual entry to finalize the transfer.
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Hand className="h-8 w-8 text-muted-foreground/30" />
            {selectedGroup && (
              <div className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border bg-blue-100 text-blue-700 border-blue-200">
                {selectedGroup.status}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="mt-4 space-y-6">
          {!loading && !fetchError && (
            <div className={cn(
              "grid gap-6 print:hidden",
              selectedGroup ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2"
            )}>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Select Incoming Transfer
                </label>
                <OrderSelectionModal
                  orderGroups={orderGroups}
                  selectedOrderNo={selectedOrderNo}
                  onSelect={setSelectedOrderNo}
                  getBranchName={getBranchName}
                />
              </div>

              {/* Attachment Popover section */}
              {selectedGroup && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                    Attachments <span className="text-destructive font-black">*</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      id="attachment-upload"
                      multiple
                      accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx"
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        addSelectedFiles(files);
                        e.target.value = '';
                      }}
                      disabled={isUploading}
                    />

                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          type="button"
                          className={cn(
                            "gap-2 border-border shadow-none h-10 hover:bg-muted/50 rounded-lg shrink-0 active:scale-95 transition-all text-sm font-semibold",
                            selectedFiles.length > 0 ? "border-primary/45 bg-primary/5 text-primary hover:bg-primary/10" : ""
                          )}
                          disabled={isUploading}
                        >
                          <Paperclip className={cn("w-4 h-4", selectedFiles.length > 0 ? "text-primary" : "text-muted-foreground/50")} />
                          {selectedFiles.length > 0 ? `Manage Attachments` : `Attach Files`}
                          <span className={cn(
                            "ml-1 px-1.5 py-0.5 rounded text-[10px] font-black font-mono border",
                            selectedFiles.length > 0 
                              ? "bg-primary text-primary-foreground border-primary" 
                              : "bg-muted text-muted-foreground border-border/50"
                          )}>
                            {selectedFiles.length}
                          </span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-[320px] p-4 border border-border shadow-xl bg-card rounded-xl">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between border-b border-border/50 pb-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Manage Attachments</span>
                            <span className="text-[10px] text-muted-foreground italic">Max 20MB per file</span>
                          </div>
                          
                          <Button
                            variant="outline"
                            type="button"
                            size="sm"
                            className="w-full gap-2 border-border shadow-none text-xs font-bold rounded-lg active:scale-95 transition-all"
                            onClick={() => document.getElementById('attachment-upload')?.click()}
                          >
                            <Paperclip className="w-3.5 h-3.5 text-muted-foreground/60" />
                            Add Attachment
                          </Button>

                          {selectedFiles.length > 0 ? (
                            <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                              {selectedFiles.map((file, idx) => (
                                <div key={`${file.name}-${idx}`} className="flex items-center justify-between gap-3 text-xs py-1 border-b border-border/10 last:border-0">
                                  <span className="font-semibold truncate text-foreground flex-1 pr-2" title={file.name}>
                                    {file.name}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground font-mono shrink-0">
                                    {(file.size / 1024 / 1024).toFixed(2)} MB
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    type="button"
                                    className="h-5 w-5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full shrink-0"
                                    onClick={() => removeSelectedFile(idx)}
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-6 text-muted-foreground/45 flex flex-col items-center justify-center gap-1.5">
                              <Paperclip className="w-7 h-7 stroke-[1.5]" />
                              <span className="text-[10px] font-bold uppercase tracking-widest">No files attached yet</span>
                            </div>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>

                    <span className="text-[10px] text-muted-foreground font-medium italic hidden lg:inline">
                      Images, PDF, Word.
                    </span>
                  </div>
                </div>
              )}

              {/* Deposit Remarks / Notes */}
              {selectedGroup && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Deposit Remarks / Notes
                  </label>
                  <Input
                    placeholder="e.g. Received in good order, stored at Bay A..."
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    disabled={isUploading}
                    className="h-10 text-xs bg-background"
                  />
                </div>
              )}
            </div>
          )}

          {/* Full-Page Overlay Loader */}
          {isUploading && (
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[999] flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <span className="text-xs font-black uppercase tracking-widest text-foreground animate-pulse">
                Uploading attachments and finalizing manual deposit...
              </span>
            </div>
          )}

          {/* Order Details Banner */}
          {selectedGroup && (
            <div className="border border-border/60 bg-muted/20 p-4 rounded-xl flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
                <div>
                  <span className="text-muted-foreground mr-1.5">Transfer Ref:</span>
                  <span className="font-mono font-bold text-foreground">{selectedGroup.orderNo}</span>
                </div>
                <div className="h-3 w-px bg-border" />
                <div>
                  <span className="text-muted-foreground mr-1.5">Route:</span>
                  <span className="font-semibold text-foreground">
                    {getBranchName(selectedGroup.sourceBranch)} → {getBranchName(selectedGroup.targetBranch)}
                  </span>
                </div>
                <div className="h-3 w-px bg-border" />
                <div>
                  <span className="text-muted-foreground mr-1.5">Items:</span>
                  <span className="font-bold text-foreground">{selectedGroup.items.length} item(s)</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPrintPreview(true)}
                  className="gap-1.5 text-xs font-semibold h-8 border-border shadow-none"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Receipt
                </Button>
              </div>
            </div>
          )}

          {/* Items Table */}
          {selectedGroup && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border overflow-hidden bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40 border-b border-border">
                      <TableHead className="text-[10px] uppercase font-bold py-4">Item Details</TableHead>
                      <TableHead className="text-[10px] uppercase font-bold text-center w-[90px]">Expected</TableHead>
                      <TableHead className="text-[10px] uppercase font-bold text-center w-[130px] print:hidden">Verified</TableHead>
                      <TableHead className="text-[10px] uppercase font-bold w-[130px] print:hidden">Source Branch</TableHead>
                      <TableHead className="text-[10px] uppercase font-bold min-w-[300px] print:hidden">Target Storage & Batch Allocation</TableHead>
                      <TableHead className="text-[10px] uppercase font-bold text-right py-4 px-6">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedItems.map((item: OrderGroupItem) => {
                      const targetQty = Math.max(0, item.scanned_quantity ?? item.picked_quantity ?? item.allocated_quantity ?? 0);
                      const currentQty = receivedQtys[item.id] ?? 0;
                      const product = typeof item.product_id === 'object' && item.product_id !== null ? item.product_id : null;
                      const productName = product?.product_name || (typeof item.product_id === 'number' ? `Product #${item.product_id}` : 'Product');
                      const productImage = getAssetUrl(product?.product_image);
                      const allocs = itemLotAllocations[item.id];
                      const hasMultiLotAlloc = Boolean(allocs && allocs.length > 0);

                      return (
                        <TableRow key={item.id} className="border-b border-border/50">
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
                                <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-tight">ID: {String(product?.product_id || 'N/A')}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm font-bold text-center">
                             <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest border-border/50 bg-muted/30 mx-auto w-fit">
                              {typeof product?.unit_of_measurement === 'object' && product.unit_of_measurement !== null 
                                ? (product.unit_of_measurement as UnitOfMeasurement).unit_name 
                                : 'unit'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm font-bold text-center font-mono">{targetQty}</TableCell>
                          <TableCell className="text-center print:hidden py-2">
                             <QuantityStepper 
                                value={currentQty}
                                max={targetQty}
                                onChange={(val) => {
                                  updateReceivedQty(item.id, val, targetQty);
                                  // If multi-lot allocations exist and user changed total stepper, auto-adjust first batch
                                  if (allocs && allocs.length === 1 && allocs[0].batches?.length === 1) {
                                    const updatedAllocs = [{
                                      ...allocs[0],
                                      batches: [{ ...allocs[0].batches[0], quantity: val }]
                                    }];
                                    updateItemLotAllocations(item.id, updatedAllocs);
                                  }
                                }}
                                className="h-8 w-fit mx-auto"
                                size="sm"
                              />
                          </TableCell>
                          <TableCell className="print:hidden py-2">
                            <Badge variant="outline" className="font-semibold text-[10px] px-2 py-0.5 max-w-[130px] truncate border-border/70 bg-muted/40 text-foreground">
                              {getBranchName(selectedGroup.sourceBranch)}
                            </Badge>
                          </TableCell>
                          <TableCell className="print:hidden py-2">
                            {(() => {
                              const itemClass = getItemClassification(item);

                              if (hasMultiLotAlloc) {
                                const hasConflict = allocs!.some((g) => {
                                  const compat = getLotCompatibility(item, g.lot_id);
                                  return compat.isTypeMismatch;
                                });

                                return (
                                  <div className="space-y-2 min-w-[280px]">
                                    {allocs!.map((lotAlloc) => {
                                      const bLot = targetLots.find((l) => Number(l.lot_id) === Number(lotAlloc.lot_id));
                                      const lotName = bLot?.lot_name || lotAlloc.lot_name || `Lot #${lotAlloc.lot_id}`;
                                      const batches = lotAlloc.batches || [];
                                      const lotTotalQty = batches.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
                                      const lotCompat = getLotCompatibility(item, lotAlloc.lot_id);
                                      const isLotConflict = lotCompat.isTypeMismatch;

                                      return (
                                        <div
                                          key={`lot-group-${item.id}-${lotAlloc.lot_id}`}
                                          className={cn(
                                            "rounded-lg border overflow-hidden shadow-2xs transition-colors",
                                            isLotConflict 
                                              ? "border-destructive/40 bg-destructive/5" 
                                              : "border-border/80 bg-muted/20"
                                          )}
                                        >
                                          {/* Parent Lot Header */}
                                          <div className="flex items-center justify-between px-2.5 py-1.5 bg-muted/50 border-b border-border/50">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                              <Layers className={cn("w-3.5 h-3.5 shrink-0", isLotConflict ? "text-destructive" : "text-primary")} />
                                              <span 
                                                className={cn("font-bold text-xs truncate max-w-[160px]", isLotConflict ? "text-destructive" : "text-foreground")}
                                                title={lotName}
                                              >
                                                {lotName}
                                              </span>
                                              <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                                                ({batches.length} {batches.length === 1 ? 'batch' : 'batches'} • {lotTotalQty} total)
                                              </span>
                                            </div>

                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => handleOpenLotBatchModal(item)}
                                              className="h-5 px-1.5 text-[10px] font-bold text-primary hover:bg-primary/10 hover:text-primary cursor-pointer"
                                              title="Edit batch splits for this lot"
                                            >
                                              Edit Splits
                                            </Button>
                                          </div>

                                          {/* Nested Batches List */}
                                          <div className="p-1.5 space-y-1 bg-background/50">
                                            {batches.map((b, bIdx) => (
                                              <div
                                                key={`batch-item-${item.id}-${lotAlloc.lot_id}-${bIdx}`}
                                                className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-muted/30 hover:bg-muted/40 border border-border/40 text-[10px] font-mono transition-colors"
                                              >
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                  <span className="text-muted-foreground/40 select-none">↳</span>
                                                  <span className="font-bold text-primary truncate max-w-[130px]" title={b.batch_no}>
                                                    {b.batch_no}
                                                  </span>
                                                  {b.expiry_date && (
                                                    <span className="text-[9px] text-muted-foreground bg-muted/60 px-1 py-0.2 rounded border border-border/30">
                                                      Exp: {String(b.expiry_date).substring(0, 10)}
                                                    </span>
                                                  )}
                                                </div>

                                                <div className="flex items-center gap-1.5 shrink-0">
                                                  <span className="font-bold text-foreground text-[11px] bg-background px-1.5 py-0.5 rounded border border-border/60">
                                                    {b.quantity}
                                                  </span>
                                                  {b.qa_status && (
                                                    <Badge
                                                      variant={b.qa_status === "GOOD" ? "outline" : "destructive"}
                                                      className={cn(
                                                        "text-[8px] py-0 h-4 px-1 font-bold",
                                                        b.qa_status === "GOOD" 
                                                          ? "text-emerald-700 bg-emerald-50 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800" 
                                                          : ""
                                                      )}
                                                    >
                                                      {b.qa_status}
                                                    </Badge>
                                                  )}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    })}

                                    {hasConflict && (
                                      <div className="flex items-center gap-1 text-[10px] text-destructive font-bold pt-0.5">
                                        <AlertTriangle className="w-3 h-3 shrink-0" />
                                        <span>Storage type conflict detected in one or more assigned lots</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              }

                              const selectedLotId = destinationLotIds[item.id];
                              const selectedCompat = selectedLotId ? getLotCompatibility(item, selectedLotId) : null;
                              const isConflict = selectedCompat?.isTypeMismatch;
                              const storedForSelected = selectedLotId ? lotStoredSummaryMap.get(Number(selectedLotId)) : null;

                              return (
                                <div className="space-y-1.5 min-w-[280px]">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {(() => {
                                      const itemIsBad = (item.qa_status && item.qa_status !== 'GOOD') || (item.inventory_condition && item.inventory_condition !== 'GOOD');
                                      const compatibleLots = targetLots.filter((l) => {
                                        if (l.status && l.status !== 'ACTIVE') return false;
                                        const stored = lotStoredSummaryMap.get(Number(l.lot_id));
                                        const tCompat = checkLotProductTypeCompatibility(stored, itemClass);
                                        if (!tCompat.isCompatible) return false;
                                        const lotIsBad = isBadStockLot(l);
                                        if (itemIsBad && !lotIsBad) return false;
                                        if (!itemIsBad && lotIsBad) return false;
                                        return true;
                                      });

                                      const optionsLots = targetLots.filter(
                                        (l) => Number(l.lot_id) === Number(destinationLotIds[item.id]) || compatibleLots.some((c) => Number(c.lot_id) === Number(l.lot_id))
                                      );

                                      return (
                                        <SearchableSelect
                                          options={optionsLots.map((l) => {
                                            const lStock = Number(l.current_stock_quantity || 0);
                                            const lCap = Number(l.max_batch_capacity || 0);
                                            const isF = lCap > 0 && lStock >= lCap;
                                            const stored = lotStoredSummaryMap.get(Number(l.lot_id));
                                            const tCompat = checkLotProductTypeCompatibility(stored, itemClass);
                                            const isTConflict = tCompat.isTypeMismatch;
                                            const isDraft = stored?.is_draft_allocation;
                                            const typeSourceLabel = isDraft ? "Draft" : "Stock";
                                            const lotIsBad = isBadStockLot(l);

                                            let badgeText: string | undefined;
                                            let badgeClass = "bg-muted text-muted-foreground border-border/60 font-mono";

                                            if (isTConflict && stored) {
                                              badgeText = `Mismatch (${typeSourceLabel}: ${stored.primary_classification_label})`;
                                              badgeClass = "bg-destructive/15 text-destructive border-destructive/40 font-bold";
                                            } else if (isF) {
                                              badgeText = `Full (${lStock}/${lCap})`;
                                              badgeClass = "bg-destructive/15 text-destructive border-destructive/40 font-bold";
                                            } else if (lotIsBad) {
                                              badgeText = "Bad Stock / Quarantine";
                                              badgeClass = "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40 font-bold";
                                            } else if (stored && !stored.is_empty && stored.primary_classification === itemClass.code) {
                                              badgeText = `Matched (${stored.primary_classification_label})${isDraft ? " [Draft]" : ""}`;
                                              badgeClass = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 font-bold";
                                            } else if (stored?.is_empty) {
                                              badgeText = "Empty Lot";
                                              badgeClass = "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30 font-semibold";
                                            }

                                            const prefix = isTConflict ? "🚫 " : isF ? "🚫 " : "";
                                            const capStr = lCap ? ` (Cap: ${lCap})` : "";
                                            const storedTypeStr = stored && !stored.is_empty ? ` • Stored: ${stored.primary_classification_label}` : " • [Empty Lot]";

                                            return {
                                              value: String(l.lot_id),
                                              label: `${prefix}${l.lot_name}${capStr}`,
                                              subLabel: `Stock: ${lStock.toLocaleString()} ${l.unit_name || ""}${lCap ? ` • Max Cap: ${lCap.toLocaleString()}` : ""}${storedTypeStr}`,
                                              badge: badgeText,
                                              badgeClassName: badgeClass,
                                            };
                                          })}
                                          value={destinationLotIds[item.id] ? String(destinationLotIds[item.id]) : ""}
                                          onValueChange={(val) => updateDestinationLot(item.id, Number(val))}
                                          placeholder={loadingLots ? "Loading..." : "Select Lot"}
                                          searchPlaceholder="Search lots..."
                                          disabled={loadingLots}
                                          emptyMessage="No compatible storage lots found."
                                          triggerClassName={`h-8 text-xs font-semibold w-[150px] border-border bg-background ${isConflict ? "border-destructive ring-1 ring-destructive/40 text-destructive" : ""}`}
                                        />
                                      );
                                    })()}

                                    <Input
                                      value={destinationBatchNos[item.id] ?? item.batch_no ?? `TRF-${selectedGroup.orderNo}-${item.id}`}
                                      onChange={(e) => updateDestinationBatchNo(item.id, e.target.value)}
                                      className="h-8 text-xs font-mono w-[130px] border-border bg-background"
                                      placeholder="Batch No"
                                    />

                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleOpenLotBatchModal(item)}
                                      className="h-8 px-2 text-[10px] font-bold gap-1 text-primary border-primary/30 hover:bg-primary/10 shrink-0 cursor-pointer"
                                      title="Split across multiple storage lots or multiple batches"
                                    >
                                      <Layers className="w-3 h-3" />
                                      Multi-Lot / Splits
                                    </Button>
                                  </div>

                                  {isConflict && (
                                    <div className="flex items-center gap-1 text-[10px] text-destructive font-bold">
                                      <AlertTriangle className="w-3 h-3 shrink-0" />
                                      <span>Type conflict: {storedForSelected?.primary_classification_label}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-right text-xs font-semibold font-mono text-foreground">
                            ₱{((currentQty || 0) * Number(product?.cost_per_unit || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter className="bg-muted/10">
                    <TableRow>
                      <TableCell colSpan={6} className="text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total Verification Value</TableCell>
                      <TableCell className="text-right text-sm font-bold text-foreground font-mono">
                         ₱{selectedGroup.items.reduce((sum: number, item: OrderGroupItem) => {
                          const rqty = receivedQtys[item.id] ?? 0;
                          const product = typeof item.product_id === 'object' && item.product_id !== null ? item.product_id : null;
                          const unitPrice = Number(product?.cost_per_unit || 0);
                          return sum + (rqty * unitPrice);
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
                      <SelectTrigger className="h-8 w-[70px] text-xs font-bold border-border shadow-none">
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
                      size="sm"
                      className={cn(
                        "w-full sm:w-auto font-bold text-xs shadow-none",
                        isAllReceived ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-muted text-muted-foreground"
                      )}
                      disabled={processing || !isAllReceived}
                      onClick={() => receiveOrder(selectedOrderNo!)}
                    >
                      {processing && <Loader2 className="mr-2 h-3 w-3 animate-spin text-white" />}
                      <PackageOpen className="w-4 h-4 mr-2" />
                      Finalize Manual Deposit
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Receiving Preview */}
      {selectedGroup && (
        <StockTransferReceivingPreview
          open={showPrintPreview}
          onClose={() => setShowPrintPreview(false)}
          orderNo={selectedGroup.orderNo}
          checkedBy={currentUser.name}
          items={selectedGroup.items}
          sourceBranch={getBranchName(selectedGroup.sourceBranch)}
          targetBranch={getBranchName(selectedGroup.targetBranch)}
          salesmanName={currentUser.name}
        />
      )}

      {/* Multi-Lot & Multi-Batch Allocation Modal */}
      {selectedGroup && activeItem && (
        <LotBatchSelectionModal
          open={lotBatchModalOpen}
          onOpenChange={(op) => {
            setLotBatchModalOpen(op);
            if (!op) setActiveItem(null);
          }}
          branchId={Number(selectedGroup.targetBranch) || undefined}
          productId={
            typeof activeItem.product_id === "object" && activeItem.product_id !== null
              ? Number(activeItem.product_id.product_id)
              : Number(activeItem.product_id)
          }
          productName={
            typeof activeItem.product_id === "object" && activeItem.product_id !== null
              ? activeItem.product_id.product_name
              : `Product #${activeItem.product_id}`
          }
          productCode={
            typeof activeItem.product_id === "object" && activeItem.product_id !== null
              ? activeItem.product_id.product_code
              : undefined
          }
          productUomId={
            typeof activeItem.product_id === "object" &&
            activeItem.product_id !== null &&
            typeof activeItem.product_id.unit_of_measurement === "object" &&
            activeItem.product_id.unit_of_measurement !== null
              ? Number((activeItem.product_id.unit_of_measurement as UnitOfMeasurement).unit_id)
              : undefined
          }
          productUomName={
            typeof activeItem.product_id === "object" &&
            activeItem.product_id !== null &&
            typeof activeItem.product_id.unit_of_measurement === "object" &&
            activeItem.product_id.unit_of_measurement !== null
              ? (activeItem.product_id.unit_of_measurement as UnitOfMeasurement).unit_name
              : "units"
          }
          productType={
            typeof activeItem.product_id === "object" && activeItem.product_id !== null
              ? (activeItem.product_id as any).product_type
              : undefined
          }
          productCategory={
            typeof activeItem.product_id === "object" && activeItem.product_id !== null
              ? (activeItem.product_id as any).product_category
              : undefined
          }
          categoryName={
            typeof activeItem.product_id === "object" && activeItem.product_id !== null
              ? typeof (activeItem.product_id as any).product_category === "object"
                ? (activeItem.product_id as any).product_category?.category_name
                : String((activeItem.product_id as any).product_category || "")
              : undefined
          }
          requestedQuantity={
            (receivedQtys[activeItem.id] ?? 0) > 0
              ? receivedQtys[activeItem.id]
              : Math.max(
                  0,
                  activeItem.scanned_quantity ??
                    activeItem.picked_quantity ??
                    activeItem.allocated_quantity ??
                    activeItem.ordered_quantity ??
                    1
                )
          }
          adjustmentType="IN"
          initialLotAllocations={itemLotAllocations[activeItem.id]}
          initialValues={{
            lot_id: destinationLotIds[activeItem.id] || undefined,
            batch_no: destinationBatchNos[activeItem.id] || activeItem.batch_no || `TRF-${selectedGroup.orderNo}-${activeItem.id}`,
            manufacturing_date: activeItem.manufacturing_date || undefined,
            expiry_date: activeItem.expiry_date || undefined,
            qa_status: "GOOD",
          }}
          onConfirm={handleApplyLotBatch}
        />
      )}
    </div>
  );
}
