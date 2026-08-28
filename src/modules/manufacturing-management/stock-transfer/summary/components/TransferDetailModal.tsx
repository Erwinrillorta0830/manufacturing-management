'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import {
  Separator,
} from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ClipboardList, 
  Package, 
  Printer, 
  Paperclip, 
  Download, 
  Eye, 
  FileText, 
  Image as ImageIcon,
  ExternalLink,
  X
} from 'lucide-react';
import type { OrderGroup, OrderGroupItem, ProductRow, BranchRow } from '../../types/stock-transfer.types';
import type { SummaryOrderGroup, SummaryAttachmentItem } from '../hooks/use-stock-transfer-summary';
import { calculateUnitPrice, formatQuantity } from '../../services/stock-transfer.helpers';
import { formatPhDateTime } from '../../utils/date-utils';
import { SummaryPrintPreview } from './SummaryPrintPreview';
import { getAssetUrl } from '@/lib/assets';

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(fileName?: string, fileType?: string): boolean {
  if (fileType && fileType.startsWith('image/')) return true;
  if (!fileName) return false;
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext || '');
}

interface TransferDetailModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  group: SummaryOrderGroup | null;
  getBranchName: (id: number | null) => string;
  getUserName: (id: number | null | undefined) => string;
  getUnitName: (id: unknown) => string;
  branches?: BranchRow[];
}

export function TransferDetailModal({
  isOpen,
  onOpenChange,
  group,
  getBranchName,
  getUserName,
  getUnitName,
  branches,
}: TransferDetailModalProps) {
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<SummaryAttachmentItem | null>(null);

  if (!group) return null;

  const attachments = group.attachments || [];

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[920px] max-h-[90vh] flex flex-col p-0 overflow-hidden bg-card border-border shadow-2xl">
          <DialogHeader className="p-6 border-b border-border bg-muted/20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-primary" />
                  <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                    Transfer Details: <span className="font-mono text-primary">{group.orderNo}</span>
                  </DialogTitle>
                </div>
                <DialogDescription className="text-xs font-medium uppercase tracking-widest opacity-70">
                  Full itemized breakdown of the stock transfer request.
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2 self-start md:self-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPrintPreview(true)}
                  className="gap-2 h-7 px-3 border-primary/20 hover:border-primary hover:bg-primary/5 text-primary shadow-none text-[10px] font-bold uppercase tracking-widest transition-all"
                >
                  <Printer className="w-3 h-3" />
                  Print Document
                </Button>
                <Separator orientation="vertical" className="h-4 mx-1" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mr-2">Status:</span>
                <Badge 
                  variant="outline" 
                  className={cn(
                    "font-black uppercase tracking-widest text-[10px] rounded-[4px] px-2 py-0.5 border shadow-none",
                    group.status === 'Requested' && "bg-muted text-muted-foreground border-muted",
                    group.status === 'For Picking' && "bg-amber-100 text-amber-700 border-amber-200",
                    group.status === 'Picking' && "bg-blue-100 text-blue-700 border-blue-200",
                    group.status === 'Picked' && "bg-emerald-100 text-emerald-700 border-emerald-200",
                    group.status === 'For Loading' && "bg-sky-100 text-sky-700 border-sky-200",
                    group.status === 'Received' && "bg-emerald-600 text-white border-emerald-600",
                    group.status === 'Rejected' && "bg-destructive text-white border-destructive"
                  )}
                >
                  {group.status}
                </Badge>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-6 p-4 rounded-xl border border-border bg-background/50">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Source Branch</p>
                <p className="font-semibold text-sm truncate" title={getBranchName(group.sourceBranch)}>{getBranchName(group.sourceBranch)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Target Branch</p>
                <p className="font-semibold text-sm truncate" title={getBranchName(group.targetBranch)}>{getBranchName(group.targetBranch)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Requested On</p>
                <p className="font-semibold text-sm">{formatPhDateTime(group.dateRequested, { formatType: 'short' })}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Lead Date</p>
                <p className="font-semibold text-sm">{formatPhDateTime(group.leadDate, { formatType: 'dateOnly' })}</p>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-auto p-4 scrollbar-hide space-y-4">
            {/* Products Table */}
            <div className="border border-border rounded-xl overflow-hidden bg-background">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="border-b border-border">
                    <TableHead className="font-bold text-[10px] uppercase tracking-widest">Product</TableHead>
                    <TableHead className="font-bold text-[10px] uppercase tracking-widest text-center">Unit</TableHead>
                    <TableHead className="font-bold text-[10px] uppercase tracking-widest text-center">Ordered</TableHead>
                    <TableHead className="font-bold text-[10px] uppercase tracking-widest text-center">Allocated</TableHead>
                    <TableHead className="font-bold text-[10px] uppercase tracking-widest text-center">Received</TableHead>
                    <TableHead className="font-bold text-[10px] uppercase tracking-widest text-right">Unit Price</TableHead>
                    <TableHead className="font-bold text-[10px] uppercase tracking-widest text-right">Total Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.items.map((item: OrderGroupItem) => {
                    const product = typeof item.product_id === 'object' ? (item.product_id as ProductRow) : null;
                    const productName = product?.product_name || (typeof item.product_id === 'number' ? `Product #${item.product_id}` : 'Product');
                    const barcode = product?.barcode || '—';
                    const unitPrice = calculateUnitPrice(item);

                    const productImage = getAssetUrl(product?.product_image);

                    return (
                      <TableRow key={item.id} className="border-b border-border/50 hover:bg-muted/5">
                        <TableCell>
                          <div className="flex items-center gap-3 max-w-[320px]">
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
                              <span className="font-bold text-sm truncate" title={productName}>{productName}</span>
                              <span className="text-[10px] text-muted-foreground font-mono">Barcode: {barcode}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-medium text-xs">
                          {getUnitName(product?.unit_of_measurement)}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-semibold text-sm">{formatQuantity(item.ordered_quantity)}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-semibold text-sm text-amber-600">{formatQuantity(item.allocated_quantity)}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-semibold text-sm text-emerald-600">{formatQuantity(item.received_quantity)}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-xs font-medium">₱{unitPrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm font-bold">₱{Number(item.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter className="bg-muted/20 border-t border-border">
                  <TableRow>
                    <TableCell colSpan={6} className="text-right font-bold text-[10px] uppercase tracking-widest text-muted-foreground py-4">Total Order Value</TableCell>
                    <TableCell className="text-right text-lg font-bold text-emerald-600 py-4">
                      ₱{group.totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            {/* Attached Documents & Receipts Section */}
            <div className="border border-border rounded-xl p-4 bg-background space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Paperclip className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Attached Documents & Deposit Receipts
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono font-bold bg-muted/30">
                  {attachments.length} {attachments.length === 1 ? 'file' : 'files'}
                </Badge>
              </div>

              {attachments.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {attachments.map((att) => {
                    const isImg = isImageFile(att.fileName, att.fileType);
                    const assetUrl = getAssetUrl(att.fileId) || att.url;

                    return (
                      <div
                        key={att.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-border/70 bg-muted/10 hover:bg-muted/20 transition-all group/att"
                      >
                        {/* File Thumbnail or Icon */}
                        {isImg ? (
                          <div 
                            className="h-11 w-11 rounded-md bg-muted/40 border border-border/60 overflow-hidden shrink-0 relative cursor-pointer group-hover/att:ring-2 group-hover/att:ring-primary/40 transition-all"
                            onClick={() => setPreviewAttachment(att)}
                            title="Click to preview image"
                          >
                            <Image
                              src={assetUrl}
                              alt={att.fileName}
                              fill
                              unoptimized
                              className="object-cover"
                            />
                          </div>
                        ) : (
                          <div className="h-11 w-11 rounded-md bg-muted/40 border border-border/60 flex items-center justify-center shrink-0 text-primary">
                            <FileText className="w-5 h-5" />
                          </div>
                        )}

                        {/* File Details */}
                        <div className="flex flex-col min-w-0 flex-1">
                          <span 
                            className="text-xs font-semibold text-foreground truncate cursor-pointer hover:text-primary transition-colors"
                            title={att.fileName}
                            onClick={() => {
                              if (isImg) {
                                setPreviewAttachment(att);
                              } else {
                                window.open(assetUrl, '_blank');
                              }
                            }}
                          >
                            {att.fileName}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {formatFileSize(att.fileSize)}
                            {att.uploadedAt ? ` • ${formatPhDateTime(att.uploadedAt, { formatType: 'dateOnly' })}` : ''}
                          </span>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                            onClick={() => {
                              if (isImg) {
                                setPreviewAttachment(att);
                              } else {
                                window.open(assetUrl, '_blank');
                              }
                            }}
                            title="View / Preview"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <a 
                            href={assetUrl} 
                            download={att.fileName}
                            target="_blank" 
                            rel="noopener noreferrer"
                          >
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                              title="Download File"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/70 italic py-2">
                  No deposit receipts or attachment files recorded for this stock transfer.
                </p>
              )}
            </div>
          </div>

          <div className="p-6 border-t border-border bg-muted/20">
            <div className="flex items-center gap-2 mb-4">
              <Package className="w-4 h-4 text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-foreground">Audit Trail</span>
              <div className="h-px flex-1 bg-border/50" />
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="space-y-1">
                <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-tighter">Requested By</p>
                <p className="text-xs font-semibold">{getUserName(group.encoderId)}</p>
                <p className="text-[10px] text-muted-foreground">{formatPhDateTime(group.dateRequested, { formatType: 'short' })}</p>
              </div>
              
              <div className="space-y-1">
                <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-tighter">Approved By</p>
                <p className="text-xs font-semibold">{group.dateApproved ? getUserName(group.approverId) : '—'}</p>
                <p className="text-[10px] text-muted-foreground">{group.dateApproved ? formatPhDateTime(group.dateApproved, { formatType: 'short' }) : '—'}</p>
              </div>
              
              <div className="space-y-1">
                <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-tighter">Dispatched By</p>
                <p className="text-xs font-semibold">{group.dateDispatched ? getUserName(group.dispatcherId) : '—'}</p>
                <p className="text-[10px] text-muted-foreground">{group.dateDispatched ? formatPhDateTime(group.dateDispatched, { formatType: 'short' }) : '—'}</p>
              </div>
              
              <div className="space-y-1">
                <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-tighter">Received By</p>
                <p className="text-xs font-semibold">{group.dateReceived ? getUserName(group.receiverId) : '—'}</p>
                <p className="text-[10px] text-muted-foreground">{group.dateReceived ? formatPhDateTime(group.dateReceived, { formatType: 'short' }) : '—'}</p>
              </div>
            </div>
          </div>
        </DialogContent>

        <SummaryPrintPreview
          open={showPrintPreview}
          onClose={() => setShowPrintPreview(false)}
          group={group}
          getBranchName={getBranchName}
          getUserName={getUserName}
          getUnitName={getUnitName}
          salesmanName={(() => {
            const targetBranchObj = branches?.find(b => b.id === group.targetBranch);
            return (targetBranchObj && (targetBranchObj.branch_description || targetBranchObj.branch_head))
              ? (targetBranchObj.branch_description || getUserName(targetBranchObj.branch_head))
              : getUserName(group.encoderId);
          })()}
        />
      </Dialog>

      {/* Attachment Image Lightbox Dialog */}
      {previewAttachment && (
        <Dialog open={Boolean(previewAttachment)} onOpenChange={(op) => { if (!op) setPreviewAttachment(null); }}>
          <DialogContent className="max-w-[80vw] max-h-[88vh] p-4 bg-background border-border flex flex-col items-center justify-center">
            <DialogHeader className="w-full flex flex-row items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-primary" />
                <DialogTitle className="text-sm font-bold truncate max-w-[500px]">
                  {previewAttachment.fileName}
                </DialogTitle>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={getAssetUrl(previewAttachment.fileId) || previewAttachment.url}
                  download={previewAttachment.fileName}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                    <Download className="w-3.5 h-3.5" /> Download
                  </Button>
                </a>
              </div>
            </DialogHeader>

            <div className="relative w-full h-[65vh] flex items-center justify-center overflow-hidden rounded-lg bg-muted/20 mt-2">
              <Image
                src={getAssetUrl(previewAttachment.fileId) || previewAttachment.url}
                alt={previewAttachment.fileName}
                fill
                unoptimized
                className="object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
