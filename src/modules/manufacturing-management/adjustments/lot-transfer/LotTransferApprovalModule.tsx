"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
 
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
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Eye,
  ShieldCheck,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { TransferStatusBadge } from "./components/TransferStatusBadge";
import { lotTransferService } from "./services/lot-transfer.service";
import { SearchableSelect, type Option } from "./components/SearchableSelect";
import { fetchBranches } from "./services/lot-tracking.service";
import type { BranchOption, LotTransfer } from "./types";

interface LotTransferApprovalModuleProps {
  userBranchId?: number | null;
  transferId?: number;
}

export const LotTransferApprovalModule: React.FC<LotTransferApprovalModuleProps> = ({
  userBranchId,
  transferId,
}) => {
  const [activeBranches, setActiveBranches] = useState<BranchOption[]>([]);
  const [filterBranchId, setFilterBranchId] = useState<number | null>(userBranchId || null);
  const [transfers, setTransfers] = useState<LotTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("Submitted");

  // Active transfer for review
  const [selectedTransfer, setSelectedTransfer] = useState<LotTransfer | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Approval remarks
  const [qaEvidence, setQaEvidence] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Rejection dialog
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

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

  const loadTransfers = useCallback(async () => {
    setLoading(true);
    try {
      const filter: Parameters<typeof lotTransferService.listTransfers>[0] = {
        branchId: filterBranchId || undefined,
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

  const handleOpenReview = async (item: LotTransfer) => {
    try {
      const full = await lotTransferService.getTransferById(item.id);
      setSelectedTransfer(full);
      setQaEvidence(full.qaEvidence || "");
      setDetailModalOpen(true);
    } catch {}
  };

  const handleApprove = async () => {
    if (!selectedTransfer) return;
    setActionLoading(true);
    try {
      await lotTransferService.approveTransfer(selectedTransfer.id, qaEvidence.trim());
      setDetailModalOpen(false);
      loadTransfers();
    } catch {
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedTransfer || !rejectionReason.trim()) {
      toast.error("Please enter a reason for rejecting this transfer.");
      return;
    }
    setActionLoading(true);
    try {
      await lotTransferService.rejectTransfer(selectedTransfer.id, rejectionReason.trim());
      setRejectModalOpen(false);
      setDetailModalOpen(false);
      setRejectionReason("");
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
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">Lot Transfer QA Approval</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Review submitted lot transfers, verify batch expiry / QA specifications, and approve or reject.
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
            value={filterBranchId || 0}
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
              <TableHead title="Requested By User">Requested By</TableHead>
              <TableHead className="text-right" title="Actions">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (transfers || []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground" title="Loading approval requests...">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 opacity-40" />
                  Loading approval requests...
                </TableCell>
              </TableRow>
            ) : (transfers || []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground" title="No lot transfer requests found">
                  No lot transfer requests found for this filter.
                </TableCell>
              </TableRow>
            ) : (
              (transfers || []).map((item) => {
                const branchDisplay = item.branchName && item.branchName !== "-" ? item.branchName : item.branchId ? `Branch #${item.branchId}` : "-";
                const sourceLotDisplay = item.sourceLotName || `Lot #${item.sourceLotId}`;
                const targetLotDisplay = item.targetLotName || `Lot #${item.targetLotId}`;
                const lineCount = item.lineCount || item.details?.length || 1;
                const requestedByDisplay = item.requestedByName || "-";

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
                    <TableCell className="text-xs text-muted-foreground" title={requestedByDisplay}>
                      {requestedByDisplay}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant={item.status === "Submitted" ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleOpenReview(item)}
                        className="h-8 text-xs gap-1.5"
                        title={item.status === "Submitted" ? "Review and Approve Transfer" : "View Transfer Details"}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {item.status === "Submitted" ? "Review & Approve" : "View Details"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Review Dialog */}
      {selectedTransfer && (
        <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
          <DialogContent className="max-w-6xl sm:max-w-6xl w-[95vw] h-[90vh] max-h-[920px] flex flex-col p-6 overflow-hidden">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  Review Lot Transfer {selectedTransfer.requestNo}
                </DialogTitle>
                <TransferStatusBadge status={selectedTransfer.status} />
              </div>
              <DialogDescription>
                Transfer from <strong className="text-foreground">{selectedTransfer.sourceLotName || `Lot #${selectedTransfer.sourceLotId}`}</strong> to{" "}
                <strong className="text-foreground">{selectedTransfer.targetLotName || `Lot #${selectedTransfer.targetLotId}`}</strong> on {selectedTransfer.transferDate}.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div className="p-3 border rounded-lg bg-muted/20 text-sm">
                <span className="font-semibold text-xs uppercase tracking-wider text-muted-foreground block mb-1">
                  Reason for Transfer
                </span>
                <p>{selectedTransfer.reason}</p>
              </div>

              {/* Line items verification */}
              <div className="border rounded-xl bg-card overflow-hidden">
                <div className="p-3 bg-muted/30 font-semibold text-xs uppercase tracking-wider border-b">
                  Batch Lines to Transfer ({selectedTransfer.details?.length || 0})
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20">
                      <TableHead className="w-12 text-center" title="Line Number">#</TableHead>
                      <TableHead title="Product Name / SKU">Product</TableHead>
                      <TableHead title="Source Batch Number">Source Batches No</TableHead>
                      <TableHead title="Target Batch Number">Target Batches No</TableHead>
                      <TableHead className="text-right" title="Quantity">Quantity</TableHead>
                      <TableHead title="Manufacturing Date">Mfg Date</TableHead>
                      <TableHead title="Expiry Date">Expiry Date</TableHead>
                      <TableHead title="Remarks">Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedTransfer.details?.map((d, i: number) => {
                      const pDesc = d.productDescription;
                      const pName = d.productName && d.productName !== "-" ? d.productName : "";
                      const pCode = d.productCode && d.productCode !== "-" ? d.productCode : "";
                      const primaryTitle = pDesc || pName || (d.productId ? `Product #${d.productId}` : "-");
                      const mfgDate = d.sourceManufacturingDate ? String(d.sourceManufacturingDate).slice(0, 10) : "-";
                      const expDate = d.sourceExpiryDate ? String(d.sourceExpiryDate).slice(0, 10) : "-";
                      const lineRemarks = d.lineRemarks || selectedTransfer.reason || "-";
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
                          <TableCell className="font-mono text-xs font-semibold" title={d.sourceBatchNo}>
                            {d.sourceBatchNo}
                          </TableCell>
                          <TableCell className="font-mono text-xs" title={d.targetBatchNo}>
                            {d.targetBatchNo}
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
                          <TableCell className="text-xs text-muted-foreground" title={lineRemarks}>
                            {lineRemarks}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* QA Evidence / Approval Remarks */}
              {selectedTransfer.status === "Submitted" && (
                <div className="space-y-1.5 p-4 border rounded-xl bg-card">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    QA Evidence / Approval Remarks (Optional)
                  </label>
                  <Input
                    value={qaEvidence}
                    onChange={(e) => setQaEvidence(e.target.value)}
                    placeholder="e.g. Verified COA and quarantine clearance passed"
                    className="h-9 text-sm"
                  />
                </div>
              )}

              {selectedTransfer.rejectionReason && (
                <div className="p-3 border border-destructive/30 rounded-lg bg-destructive/10 text-destructive text-sm space-y-1">
                  <div className="font-semibold text-xs uppercase flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Rejection Reason
                  </div>
                  <p>{selectedTransfer.rejectionReason}</p>
                </div>
              )}
            </div>

            <DialogFooter className="pt-3 border-t flex items-center justify-between">
              <Button variant="outline" onClick={() => setDetailModalOpen(false)}>
                Close
              </Button>

              {selectedTransfer.status === "Submitted" && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="destructive"
                    onClick={() => setRejectModalOpen(true)}
                    disabled={actionLoading}
                    className="gap-1.5"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject Transfer
                  </Button>
                  <Button
                    onClick={handleApprove}
                    disabled={actionLoading}
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Approve Transfer
                  </Button>
                </div>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Reject Confirmation Dialog */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Reject Lot Transfer
            </DialogTitle>
            <DialogDescription>
              Please specify the operational or quality reason for rejecting this transfer request.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label className="text-xs font-semibold text-muted-foreground">Rejection Reason *</label>
            <Input
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g., Near-expiry batch cannot be transferred to production lot"
              className="h-9 text-sm"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={actionLoading || !rejectionReason.trim()}
            >
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default LotTransferApprovalModule;
