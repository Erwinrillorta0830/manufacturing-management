'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Trash2, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination';
import { ScannedItem } from '../../types/stock-transfer.types';
import { QuantityStepper } from './QuantityStepper';
import { getAssetUrl } from '@/lib/assets';
import { StockAllocationModal } from '@/modules/manufacturing-management/shared/components/StockAllocationModal';
import type { StockAllocationPlan, BatchAllocationResult } from '@/modules/manufacturing-management/shared/types/lot-tracking.types';

interface StockTransferTableProps {
  items: ScannedItem[];
  onQtyChange: (rfid: string, qty: number) => void;
  onDelete: (rfid: string) => void;
  branchId?: number;
  onAllocationChange?: (rfid: string, plan: StockAllocationPlan) => void;
}

const PAGE_SIZE_OPTIONS = [10, 20, 40, 50, 100];

export default function StockTransferTable({ 
  items, 
  onQtyChange, 
  onDelete,
  branchId,
  onAllocationChange,
}: StockTransferTableProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [activeAllocationItem, setActiveAllocationItem] = useState<ScannedItem | null>(null);
  const [allocationModalOpen, setAllocationModalOpen] = useState(false);

  React.useEffect(() => {
    queueMicrotask(() => {
      setPage(1);
    });
  }, [items.length]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const start = (page - 1) * pageSize;
  const paginatedItems = items.slice(start, start + pageSize);

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

  const pageList = buildPageList(page, totalPages);

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden shadow-none">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow className="hover:bg-transparent border-b border-border">
            <TableHead className="font-bold text-foreground h-10 text-[10px] uppercase tracking-widest w-12">
              No.
            </TableHead>
            <TableHead className="font-bold text-foreground text-[10px] uppercase tracking-widest">
              Product Name
            </TableHead>
            <TableHead className="font-bold text-foreground text-[10px] uppercase tracking-widest">
              Brand
            </TableHead>
            <TableHead className="font-bold text-foreground text-[10px] uppercase tracking-widest">
              Unit
            </TableHead>
            <TableHead className="font-bold text-foreground text-[10px] uppercase tracking-widest text-right w-28">
              Order Qty
            </TableHead>
            <TableHead className="font-bold text-foreground text-[10px] uppercase tracking-widest text-right">
              Line Total
            </TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedItems.length > 0 ? (
            paginatedItems.map((item, index) => {
              const imgUrl = getAssetUrl(item.productImage);
              return (
              <TableRow
                key={item.rfid}
                className="border-border/50 hover:bg-muted/5 transition-colors"
              >
                <TableCell className="text-[10px] font-medium text-muted-foreground py-2.5">
                  {start + index + 1}
                </TableCell>
                <TableCell className="text-xs font-semibold text-foreground py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {imgUrl ? (
                      <div className="h-8 w-8 rounded-lg bg-muted/40 border border-border/60 overflow-hidden shrink-0 relative">
                        <Image
                          src={imgUrl}
                          alt={item.productName}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="h-8 w-8 rounded-lg bg-muted/30 border border-border/40 flex items-center justify-center shrink-0 text-[10px] font-mono font-bold text-muted-foreground/60">
                        {item.productName?.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="line-clamp-1">{item.productName}</span>
                      <div className="flex items-center gap-1 mt-0.5">
                        {(() => {
                          const allocations = item.allocations || [];
                          const batches = allocations.length > 0 
                            ? allocations.map((a) => a.batch_no).filter(Boolean)
                            : item.batch_no 
                            ? item.batch_no.split(',').map((s) => s.trim()).filter(Boolean) 
                            : [];
                          const label = batches.length > 1 ? `(${batches.length} Batches)` : batches.length === 1 ? `(${batches[0]})` : '';
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveAllocationItem(item);
                                setAllocationModalOpen(true);
                              }}
                              className="focus:outline-none group/badge"
                              title={batches.length > 0 ? `Allocated Batches:\n${batches.join('\n')}\n\nClick to view / customize allocation` : 'Click to view / customize FEFO batch allocation'}
                            >
                              <Badge
                                variant="outline"
                                className="text-[9px] py-0 h-4 px-1.5 font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1 cursor-pointer hover:bg-emerald-500/20 hover:border-emerald-500/50 hover:shadow-sm transition-all"
                              >
                                <Layers className="w-2.5 h-2.5 text-emerald-600 group-hover/badge:scale-110 transition-transform" />
                                <span>AUTO — FEFO {label}</span>
                              </Badge>
                            </button>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-[10px] font-bold text-primary/70 uppercase py-2.5">
                  {item.brandName || '—'}
                </TableCell>
                <TableCell className="text-[10px] text-muted-foreground uppercase py-2.5 font-medium">
                  {item.unit}
                </TableCell>
                <TableCell className="text-right py-1.5">
                  <QuantityStepper 
                    value={item.unitQty}
                    max={9999}
                    onChange={(val) => onQtyChange(item.rfid, val)}
                    className="h-8 w-fit ml-auto"
                    size="sm"
                  />
                </TableCell>
                <TableCell className="text-xs font-bold text-foreground text-right py-2.5 font-mono">
                  ₱{item.totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="py-1.5 text-center px-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => onDelete(item.rfid)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })
          ) : (
            <TableRow>
              <TableCell
                colSpan={7}
                className="h-32 text-center text-muted-foreground text-xs italic"
              >
                No products added. Click &apos;Add Products&apos; to begin.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
        {items.length > 0 && (
          <TableFooter className="bg-muted/10">
            <TableRow>
              <TableCell colSpan={5} className="font-bold text-right text-[10px] uppercase tracking-widest text-muted-foreground">Total Value</TableCell>
              <TableCell className="font-bold text-right text-xs text-emerald-600 font-mono">
                ₱{items.reduce((sum, item) => sum + (item.totalAmount || 0), 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        )}
      </Table>

      {items.length > 0 && (
        <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-2 bg-muted/5">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              {start + 1}–{Math.min(start + pageSize, items.length)} of {items.length}
            </span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger className="h-7 w-[60px] text-[10px] border-border shadow-none bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)} className="text-[10px]">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Pagination className="w-auto mx-0 justify-end scale-75 origin-right">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => { e.preventDefault(); setPage((p) => Math.max(1, p - 1)); }}
                  className={page === 1 ? 'pointer-events-none opacity-40' : ''}
                />
              </PaginationItem>
              {pageList.map((p, i) =>
                p === 'ellipsis' ? (
                  <PaginationItem key={`ellipsis-${i}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={p}>
                    <PaginationLink
                      href="#"
                      isActive={p === page}
                      onClick={(e) => { e.preventDefault(); setPage(p); }}
                    >
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                )
              )}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => { e.preventDefault(); setPage((p) => Math.min(totalPages, p + 1)); }}
                  className={page === totalPages ? 'pointer-events-none opacity-40' : ''}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {activeAllocationItem && (
        <StockAllocationModal
          open={allocationModalOpen}
          onOpenChange={(open) => {
            setAllocationModalOpen(open);
            if (!open) setActiveAllocationItem(null);
          }}
          branchId={branchId || 0}
          productId={activeAllocationItem.productId}
          productName={activeAllocationItem.productName}
          requestedQuantity={activeAllocationItem.unitQty || 1}
          uomName={activeAllocationItem.unit || 'units'}
          initialAllocations={
            activeAllocationItem.allocations && activeAllocationItem.allocations.length > 0
              ? (activeAllocationItem.allocations as BatchAllocationResult[])
              : activeAllocationItem.batch_no && (activeAllocationItem.inventory_lot_id || activeAllocationItem.lot_id)
              ? [
                  {
                    inventory_lot_id: activeAllocationItem.inventory_lot_id || 1,
                    lot_id: activeAllocationItem.lot_id || 1,
                    batch_no: activeAllocationItem.batch_no,
                    allocated_quantity: activeAllocationItem.unitQty || 1,
                    available_quantity: activeAllocationItem.qtyAvailable || activeAllocationItem.unitQty || 1,
                    status: 'ACTIVE',
                    qa_status: activeAllocationItem.qa_status || 'GOOD',
                  } as BatchAllocationResult,
                ]
              : undefined
          }
          onConfirm={(plan) => {
            if (onAllocationChange) {
              onAllocationChange(activeAllocationItem.rfid, plan);
            }
          }}
        />
      )}
    </div>
  );
}