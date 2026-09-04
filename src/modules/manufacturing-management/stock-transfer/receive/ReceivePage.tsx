'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PackageOpen, Printer, Loader2, CheckCircle2, Radar, Edit2, Layers, AlertTriangle } from 'lucide-react';
import { useStockTransferReceive } from './hooks/use-stock-transfer-receive';
import { OrderGroupItem, ProductRow, CurrentUser } from '../types/stock-transfer.types';
import { cn } from '@/lib/utils';
import { ScanHistorySidebar } from '../shared/components/ScanHistorySidebar';
import { StockTransferReceivingPreview } from '../shared/components/StockTransferReceivingPreview';
import { getAssetUrl } from '@/lib/assets';
import { resolveBranchSalesman } from '../services/stock-transfer.helpers';
import { SearchableSelect } from '@/modules/manufacturing-management/shared/components/SearchableSelect';
import { checkLotProductTypeCompatibility, isBadStockLot } from '@/modules/manufacturing-management/shared/services/lot-tracking.service';

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
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function StockTransferReceiveView({ currentUser }: { currentUser: CurrentUser }) {
  const {
    branches,
    orderGroups,
    selectedGroup,
    selectedOrderNo,
    setSelectedOrderNo,
    processing,
    receiveOrder,
    handleScanRFID,
    getBranchName,
    recentScans,
    isThrottled,
    clearHistory,
    updateManualQty,
    destinationLotIds,
    updateDestinationLot,
    destinationBatchNos,
    updateDestinationBatchNo,
    targetLots,
    loadingLots,
    lotStoredSummaryMap,
    getItemClassification,
    getLotCompatibility,
  } = useStockTransferReceive({ currentUser });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  // Reset page when group changes
  React.useEffect(() => {
    queueMicrotask(() => {
      setCurrentPage(1);
    });
  }, [selectedOrderNo]);

  const paginatedItems = selectedGroup?.items.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  ) || [];

  const [rfidInput, setRfidInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const rfidBuffer = React.useRef('');

  // Global RFID listener
  React.useEffect(() => {
    if (!selectedOrderNo) return;

    const handleGlobalKey = async (e: globalThis.KeyboardEvent) => {
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

  const isAllReceived = selectedGroup?.items.every((i: OrderGroupItem) => {
    const targetQty = i.picked_quantity ?? i.allocated_quantity ?? 0;
    return (i.receivedQty || 0) >= targetQty;
  }) ?? false;

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-4 md:p-8 pt-6 min-h-[calc(100vh-4rem)] bg-muted/5">
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
      <div className="flex-1 space-y-4 min-w-0">
        <div className="flex items-center justify-between space-y-2 print:hidden">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <PackageOpen className="w-8 h-8 text-blue-500" />
              Stock Deposit
            </h2>
            <p className="text-muted-foreground text-sm">Verify and finalize incoming transfers via RFID.</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowPrintPreview(true)} 
              disabled={!selectedGroup}
              className="gap-2 border-border shadow-sm bg-background"
            >
              <Printer className="w-4 h-4" /> Print
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-500/20"
              disabled={processing || !isAllReceived}
              onClick={() => receiveOrder(selectedOrderNo!)}
            >
              {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Finalize Receipt
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:hidden">
          <Card className="md:col-span-2 border-border shadow-sm bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Select Incoming Order</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderSelectionModal 
                orderGroups={orderGroups}
                selectedOrderNo={selectedOrderNo}
                onSelect={setSelectedOrderNo}
                getBranchName={getBranchName}
                title="Active Dispatches"
                description="Select a dispatched order to verify content."
              />
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Transfer Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Origin:</span>
                <span className="font-bold">{selectedGroup ? getBranchName(selectedGroup.sourceBranch) : '---'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Status:</span>
                <Badge variant="outline" className="px-1 py-0 h-4 text-[9px] uppercase">{selectedGroup?.status || 'Waiting'}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {selectedGroup && (
          <Card className="border-border shadow-xl bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border bg-muted/40 hover:bg-muted/40">
                    <TableHead className="text-[10px] uppercase font-bold py-4 px-6">Product Name</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold text-center w-[90px]">UOM</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold text-center w-[90px]">Allocated Qty</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold text-center w-[100px]">Dispatched Qty</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold text-center w-[130px]">Received Qty</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold w-[160px] print:hidden">Lot</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold w-[140px] print:hidden">Batch</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold text-right py-4 px-6 w-[110px]">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                    {paginatedItems.map((item: OrderGroupItem) => {
                      const allocatedQty = item.allocated_quantity ?? 0;
                      const dispatchedQty = item.picked_quantity ?? item.allocated_quantity ?? 0;
                      const targetQty = dispatchedQty;
                      const progress = targetQty > 0 ? (item.receivedQty || 0) / targetQty : 0;
                      const complete = progress >= 1;
                      const product = typeof item.product_id === 'object' ? (item.product_id as ProductRow) : null;
                      const productName = product?.product_name || (typeof item.product_id === 'number' ? `Product #${item.product_id}` : 'Product');
                      const unitName = typeof product?.unit_of_measurement === 'object' && product.unit_of_measurement !== null 
                        ? (product.unit_of_measurement as { unit_name?: string }).unit_name 
                        : 'PCS';
                      const itemAmount = Number(item.amount) || (dispatchedQty * Number(product?.cost_per_unit || 0));

                    return (
                      <TableRow key={item.id} className="border-b border-border/50 group hover:bg-muted/20 transition-colors">
                        {/* 1. Product Name */}
                        <TableCell className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            {getAssetUrl(product?.product_image) ? (
                              <div className="h-10 w-10 rounded-lg bg-muted/40 border border-border/60 overflow-hidden shrink-0 relative">
                                <Image
                                  src={getAssetUrl(product?.product_image)!}
                                  alt={productName}
                                  fill
                                  unoptimized
                                  className="object-cover"
                                />
                              </div>
                            ) : (
                              <div className={cn(
                                "p-2 rounded-lg border transition-colors shrink-0",
                                complete ? "bg-blue-500/10 border-blue-500/20" : "bg-muted border-border"
                              )}>
                                <Radar className={cn("w-4 h-4", complete ? "text-blue-500" : "text-muted-foreground")} />
                              </div>
                            )}
                            <div className="flex flex-col">
                              <span className="font-bold text-sm group-hover:text-primary transition-colors">{productName}</span>
                              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] text-muted-foreground font-mono">CODE: {product?.product_code || '---'}</span>
                                {item.batch_no && (
                                  <Badge variant="outline" className="text-[9px] py-0 h-4 font-mono bg-muted/40 gap-1">
                                    <Layers className="w-2.5 h-2.5 text-primary" />
                                    Batch: {item.batch_no}
                                  </Badge>
                                )}
                              </div>
                              {item.isLoosePack && (
                                <span className="text-[9px] bg-sky-500/10 text-sky-600 px-1.5 py-0.5 rounded w-fit mt-1 font-bold flex items-center gap-1">
                                  <Edit2 className="w-2 h-2" /> MANUAL ENTRY
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* 2. UOM */}
                        <TableCell className="text-center">
                           <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest border-border/50 bg-muted/30 mx-auto w-fit">
                            {unitName}
                          </Badge>
                        </TableCell>

                        {/* 3. Allocated Qty */}
                        <TableCell className="text-center font-mono font-bold text-sm text-muted-foreground">{allocatedQty}</TableCell>

                        {/* 4. Dispatched Qty */}
                        <TableCell className="text-center font-mono font-bold text-sm">{dispatchedQty}</TableCell>

                        {/* 5. Received Qty */}
                        <TableCell className="text-center">
                          {item.isLoosePack ? (
                            <QuantityStepper 
                              value={item.receivedQty || 0}
                              max={dispatchedQty}
                              onChange={(val) => updateManualQty(Number(product?.product_id || item.product_id), val)}
                              className="h-8 w-fit mx-auto"
                              size="sm"
                            />
                          ) : (
                            <div className="flex flex-col items-center">
                              <span className={cn(
                                "font-bold font-mono text-sm px-3 py-1 rounded-md w-fit mx-auto",
                                complete ? "bg-blue-500/10 text-blue-600 border border-blue-500/20" : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                              )}>
                                {item.receivedQty || 0}
                              </span>
                            </div>
                          )}
                        </TableCell>

                        {/* 6. Lot */}
                        <TableCell className="print:hidden py-2">
                          {(() => {
                            const itemClass = getItemClassification(item);
                            const selectedLotId = destinationLotIds[item.id];
                            const selectedCompat = selectedLotId ? getLotCompatibility(item, selectedLotId) : null;
                            const isConflict = selectedCompat?.isTypeMismatch;
                            const storedForSelected = selectedLotId ? lotStoredSummaryMap.get(Number(selectedLotId)) : null;

                            return (
                              <div className="space-y-1">
                                {(() => {
                                  const productUom = typeof product?.unit_of_measurement === 'object' ? product.unit_of_measurement : null;
                                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                  const itemUomId = Number(productUom?.unit_id || (product as any)?.unit_id || 0);

                                  const targetBranchObj = branches.find((b) => Number(b.id) === Number(selectedGroup.targetBranch));
                                  const isTargetBadStock = isBadStockLot(undefined, targetBranchObj || { branch_name: getBranchName(selectedGroup.targetBranch) });
                                  const itemIsBad = (item.qa_status && item.qa_status !== 'GOOD') || (item.inventory_condition && item.inventory_condition !== 'GOOD') || isTargetBadStock;
                                  const compatibleLots = targetLots.filter((l) => {
                                    if (l.status && l.status !== 'ACTIVE') return false;
                                    if (l.unit_id && itemUomId && Number(l.unit_id) !== Number(itemUomId)) return false;
                                    const stored = lotStoredSummaryMap.get(Number(l.lot_id));
                                    const tCompat = checkLotProductTypeCompatibility(stored, itemClass);
                                    if (!tCompat.isCompatible) return false;
                                    const lotIsBad = isBadStockLot(l);
                                    if (itemIsBad && !lotIsBad) return false;
                                    if (!itemIsBad && lotIsBad) return false;
                                    return true;
                                  });

                                  const matchedOptions = targetLots.filter(
                                    (l) => Number(l.lot_id) === Number(destinationLotIds[item.id]) || compatibleLots.some((c) => Number(c.lot_id) === Number(l.lot_id))
                                  );
                                  const optionsLots = matchedOptions.length > 0 ? matchedOptions : targetLots.filter((l) => !l.status || l.status === 'ACTIVE');

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
                                      triggerClassName={`h-8 text-xs font-semibold w-[160px] border-border bg-background ${isConflict ? "border-destructive ring-1 ring-destructive/40 text-destructive" : ""}`}
                                    />
                                  );
                                })()}
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

                        {/* 7. Batch */}
                        <TableCell className="print:hidden py-2">
                          <Input
                            value={destinationBatchNos[item.id] ?? item.batch_no ?? ''}
                            onChange={(e) => updateDestinationBatchNo(item.id, e.target.value)}
                            className="h-8 text-xs font-mono w-[130px] border-border bg-background"
                            placeholder="Batch No"
                          />
                        </TableCell>

                        {/* 8. Amount */}
                        <TableCell className="text-right py-4 px-6 font-mono text-xs font-semibold text-foreground">
                          ₱{itemAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
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

      {selectedGroup && (
        <StockTransferReceivingPreview
          open={showPrintPreview}
          onClose={() => setShowPrintPreview(false)}
          orderNo={selectedGroup.orderNo}
          checkedBy={currentUser.name}
          items={selectedGroup.items}
          sourceBranch={getBranchName(selectedGroup.sourceBranch)}
          targetBranch={getBranchName(selectedGroup.targetBranch)}
          salesmanName={resolveBranchSalesman(selectedGroup.targetBranch, branches)}
        />
      )}
    </div>
  );
}
