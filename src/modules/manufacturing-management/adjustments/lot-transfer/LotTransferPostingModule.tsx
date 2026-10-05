"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FileCheck2,
  RefreshCw,
  Search,
  PackageCheck,
  Ban,
  Boxes,
  RotateCcw,
  ArrowRight,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { TransferStatusBadge } from "./components/TransferStatusBadge";
import { SearchableSelect, type Option } from "./components/SearchableSelect";
import { lotTransferService } from "./services/lot-transfer.service";
import { fetchBranches } from "./services/lot-tracking.service";
import type { BranchOption, LotTransfer } from "./types";

interface LotTransferPostingModuleProps {
  userBranchId?: number | null;
  transferId?: number;
}

export const LotTransferPostingModule: React.FC<LotTransferPostingModuleProps> = ({
  userBranchId,
  transferId,
}) => {
  const [activeBranches, setActiveBranches] = useState<BranchOption[]>([]);
  const [filterBranchId, setFilterBranchId] = useState<number | null>(userBranchId || null);
  const [transfers, setTransfers] = useState<LotTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("Approved");

  // Load active branches
  useEffect(() => {
    fetchBranches().then((branches) => {
      setActiveBranches(branches);
    });
  }, []);

  const branchOptions: Option[] = useMemo(() => {
    return [
      { value: 0, label: "All Active Branches" },
      ...activeBranches.map((b) => ({
        value: b.id,
        label: b.branchName,
        subLabel: b.branchCode ? `Code: ${b.branchCode} • Active` : "Active",
      })),
    ];
  }, [activeBranches]);

  // Active transfer for review
  const [selectedTransfer, setSelectedTransfer] = useState<LotTransfer | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Cancellation dialog
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");

  // Reversal dialog
  const [reverseModalOpen, setReverseModalOpen] = useState(false);
  const [reversalReason, setReversalReason] = useState("");

  const loadTransfers = useCallback(async () => {
    if (filterBranchId === null) {
      setTransfers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const filter: Parameters<typeof lotTransferService.listTransfers>[0] = {
        branchId: filterBranchId > 0 ? filterBranchId : undefined,
        search: search.trim() || undefined,
      };
      if (statusFilter !== "ALL") {
        filter.status = statusFilter as any;
      }
      const res = await lotTransferService.listTransfers(filter);
      setTransfers(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []);
    } catch {
      setTransfers([]);
    } finally {
      setLoading(false);
    }
  }, [filterBranchId, search, statusFilter]);

  useEffect(() => {
    loadTransfers();
  }, [loadTransfers]);

  useEffect(() => {
    if (transferId) {
      lotTransferService.getTransferById(transferId).then((data) => {
        setSelectedTransfer(data);
        setDetailModalOpen(true);
      });
    }
  }, [transferId]);

  const handleOpenPosting = async (item: LotTransfer) => {
    try {
      const full = await lotTransferService.getTransferById(item.id);
      setSelectedTransfer(full);
      setDetailModalOpen(true);
    } catch {}
  };

  const handlePost = async () => {
    if (!selectedTransfer) return;
    setActionLoading(true);
    try {
      await lotTransferService.postTransfer(selectedTransfer.id);
      setDetailModalOpen(false);
      loadTransfers();
    } catch {
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!selectedTransfer || !cancellationReason.trim()) {
      toast.error("Please enter a reason for cancelling this transfer.");
      return;
    }
    setActionLoading(true);
    try {
      await lotTransferService.cancelTransfer(selectedTransfer.id, cancellationReason.trim());
      setCancelModalOpen(false);
      setDetailModalOpen(false);
      setCancellationReason("");
      loadTransfers();
    } catch {
    } finally {
      setActionLoading(false);
    }
  };

  
  return (
    <div className="flex-1 flex flex-col p-4 space-y-4 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Boxes className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">Lot Transfer Posting</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Post approved lot transfer records to inventory, creating matching OUT/IN stock movements.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={loadTransfers}
            disabled={loading}
            className="h-9 w-9"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Active Branch Filter */}
        <div className="w-60">
          <SearchableSelect
            options={branchOptions}
            value={filterBranchId}
            onChange={(val) => setFilterBranchId(Number(val) > 0 ? Number(val) : null)}
            placeholder="Select a branch..."
            triggerClassName="h-9"
          />
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search request #, batch, reason..."
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Transfers List */}
      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead title="Transfer Request Number, Date & Branch">Request & Details</TableHead>
              <TableHead title="Workflow Status">Status</TableHead>
              <TableHead title="Storage Route (Source → Target Lot)">Storage Route</TableHead>
              <TableHead className="text-right" title="Total Transfer Quantity & Lines">Total Qty & Lines</TableHead>
              <TableHead title="Approved By QA User">Approved By</TableHead>
              <TableHead className="text-right" title="Actions">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (transfers || []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground" title="Loading posting queue...">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 opacity-40" />
                  Loading posting queue...
                </TableCell>
              </TableRow>
            ) : filterBranchId === null ? (
              <TableRow>
                <TableCell colSpan={6} className="h-36 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-1.5 py-6">
                    <Building2 className="w-8 h-8 opacity-30 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground/80">
                      Please select a branch to view approved transfers.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Choose a branch from the dropdown above to view transfers awaiting posting.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (transfers || []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground" title="No transfers found awaiting posting">
                  No approved transfers awaiting posting for this branch.
                </TableCell>
              </TableRow>
            ) : (
              (transfers || []).map((item) => {
                const branchDisplay = item.branchName && item.branchName !== "-" ? item.branchName : item.branchId ? `Branch #${item.branchId}` : "-";
                const sourceLotDisplay = item.sourceLotName || `Lot #${item.sourceLotId}`;
                const targetLotDisplay = item.targetLotName || `Lot #${item.targetLotId}`;
                const lineCount = item.lineCount || item.details?.length || 1;
                const approvedByDisplay = item.approvedByName || "-";

                return (
                  <TableRow key={item.id} className="hover:bg-muted/40 transition-colors">
                    <TableCell title={`${item.requestNo} • ${item.transferDate} • ${branchDisplay}`}>
                      <div className="font-mono font-bold text-xs text-foreground">
                        {item.requestNo}
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <span>{item.transferDate}</span>
                        <span>•</span>
                        <span className="truncate max-w-[130px]">{branchDisplay}</span>
                      </div>
                    </TableCell>
                    <TableCell title={`Status: ${item.status}`}>
                      <TransferStatusBadge status={item.status} />
                    </TableCell>
                    <TableCell title={`${sourceLotDisplay} → ${targetLotDisplay}`}>
                      <div className="flex items-center gap-1 text-xs font-semibold text-foreground flex-wrap">
                        <span>{sourceLotDisplay}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span>{targetLotDisplay}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right" title={`${item.quantity.toLocaleString()} total units across ${lineCount} line(s)`}>
                      <div className="font-mono font-bold text-xs text-foreground">
                        {item.quantity.toLocaleString()}
                      </div>
                      <div className="text-[11px] font-mono text-muted-foreground">
                        {lineCount} {lineCount === 1 ? "line" : "lines"}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground" title={approvedByDisplay}>
                      {approvedByDisplay}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant={item.status === "Approved" ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleOpenPosting(item)}
                        className="h-8 text-xs gap-1.5"
                        title={item.status === "Approved" ? "Post Movements" : "View Movements"}
                      >
                        <PackageCheck className="w-3.5 h-3.5" />
                        {item.status === "Approved" ? "Post Movements" : "View Movements"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Posting Review Dialog */}
      {selectedTransfer && (
        <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
          <DialogContent className="max-w-6xl sm:max-w-6xl w-[95vw] h-[90vh] max-h-[920px] flex flex-col p-6 overflow-hidden">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
                  <PackageCheck className="w-5 h-5 text-primary" />
                  Post Lot Transfer {selectedTransfer.requestNo}
                </DialogTitle>
                <TransferStatusBadge status={selectedTransfer.status} />
              </div>
              <DialogDescription>
                Confirm physical transfer from <strong className="text-foreground">{selectedTransfer.sourceLotName || `Lot #${selectedTransfer.sourceLotId}`}</strong> to{" "}
                <strong className="text-foreground">{selectedTransfer.targetLotName || `Lot #${selectedTransfer.targetLotId}`}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-3 border rounded-xl bg-card text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Transfer Date</div>
                  <div className="font-semibold mt-0.5">{selectedTransfer.transferDate}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total Quantity</div>
                  <div className="font-semibold mt-0.5 font-mono">{selectedTransfer.quantity.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Approved By</div>
                  <div className="font-semibold mt-0.5">{selectedTransfer.approvedByName || "QA Team"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">QA Evidence</div>
                  <div className="font-semibold mt-0.5 text-xs truncate">{selectedTransfer.qaEvidence || "-"}</div>
                </div>
              </div>

              {/* Line items verification */}
              <div className="border rounded-xl bg-card overflow-hidden">
                <div className="p-3 bg-muted/30 font-semibold text-xs uppercase tracking-wider border-b">
                  Movements to Post ({selectedTransfer.details?.length || 0})
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20">
                      <TableHead className="w-12 text-center" title="Line Number">#</TableHead>
                      <TableHead title="Product Name / SKU">Product</TableHead>
                      <TableHead title="Source Batch (Outgoing)">Source Batch (OUT)</TableHead>
                      <TableHead title="Target Batch (Incoming)">Target Batch (IN)</TableHead>
                      <TableHead className="text-right" title="Quantity to Transfer">Quantity</TableHead>
                      <TableHead title="Manufacturing Date">Mfg Date</TableHead>
                      <TableHead title="Expiration Date">Expiry Date</TableHead>
                      <TableHead title="Destination Resolution Action">Destination Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedTransfer.details?.map((d, i) => {
                      const pDesc = d.productDescription;
                      const pName = d.productName && d.productName !== "-" ? d.productName : "";
                      const pCode = d.productCode && d.productCode !== "-" ? d.productCode : "";
                      const primaryTitle = pDesc || pName || (d.productId ? `Product #${d.productId}` : "-");
                      const mfgDate = d.sourceManufacturingDate ? String(d.sourceManufacturingDate).slice(0, 10) : "-";
                      const expDate = d.sourceExpiryDate ? String(d.sourceExpiryDate).slice(0, 10) : "-";

                      return (
                        <TableRow key={d.detailId || i}>
                          <TableCell className="text-center font-mono text-xs text-muted-foreground" title={`Line ${d.lineNo || i + 1}`}>
                            {d.lineNo || i + 1}
                          </TableCell>
                          <TableCell title={primaryTitle}>
                            <div className="font-semibold text-sm leading-tight text-foreground">
                              {primaryTitle}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                              {pDesc && pName && <span>{pName}</span>}
                              {pCode && <span>• Code: {pCode}</span>}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold text-destructive" title={`Out: -${d.quantity} (${d.sourceBatchNo})`}>
                            - {d.quantity.toLocaleString()} ({d.sourceBatchNo})
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold text-emerald-600" title={`In: +${d.quantity} (${d.targetBatchNo})`}>
                            + {d.quantity.toLocaleString()} ({d.targetBatchNo})
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold" title={d.quantity.toLocaleString()}>
                            {d.quantity.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap" title={mfgDate}>
                            {mfgDate}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap" title={expDate}>
                            {expDate}
                          </TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="outline" className="text-[10px]" title={d.destinationBatchAction || "RESOLVE ON POST"}>
                              {d.destinationBatchAction || "RESOLVE ON POST"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

             
            </div>

            <DialogFooter className="pt-3 border-t flex items-center justify-between">
              <Button variant="outline" onClick={() => setDetailModalOpen(false)}>
                Close
              </Button>

              {selectedTransfer.status === "Approved" && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setCancelModalOpen(true)}
                    disabled={actionLoading}
                    className="gap-1.5 text-muted-foreground hover:text-destructive"
                  >
                    <Ban className="w-4 h-4" />
                    Cancel Request
                  </Button>
                  <Button
                    onClick={handlePost}
                    disabled={actionLoading}
                    className="gap-1.5 bg-primary text-primary-foreground"
                  >
                    <FileCheck2 className="w-4 h-4" />
                    Confirm &amp; Post Movements
                  </Button>
                </div>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Cancel Confirmation Dialog */}
      <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Ban className="w-5 h-5" />
              Cancel Lot Transfer
            </DialogTitle>
            <DialogDescription>
              Provide an operational reason for cancelling this approved transfer request.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label className="text-xs font-semibold text-muted-foreground">Cancellation Reason *</label>
            <Input
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              placeholder="e.g., Transfer cancelled due to batch reallocation to another batch"
              className="h-9 text-sm"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelModalOpen(false)}>
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={actionLoading || !cancellationReason.trim()}
            >
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


    </div>
  );
};
export default LotTransferPostingModule;
