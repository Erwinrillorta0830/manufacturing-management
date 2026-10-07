"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Eye,
  ShieldCheck,
  ArrowRight,
  AlertTriangle,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { TransferStatusBadge } from "./components/TransferStatusBadge";
import { lotTransferService } from "./services/lot-transfer.service";
import { SearchableSelect, type Option } from "./components/SearchableSelect";
import { fetchBranches } from "./services/lot-tracking.service";
import type { BranchOption, LotTransfer, LotTransferStatus } from "./types";

interface LotTransferApprovalModuleProps {
  userBranchId?: number | null;
  transferId?: number;
}

export const LotTransferApprovalModule: React.FC<LotTransferApprovalModuleProps> = ({
  transferId,
}) => {
  const [activeBranches, setActiveBranches] = useState<BranchOption[]>([]);
  const [filterBranchId, setFilterBranchId] = useState<number | "all" | null>(null);
  const [transfers, setTransfers] = useState<LotTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [reviewLoadingId, setReviewLoadingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const statusFilter: LotTransferStatus = "Submitted";

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
      {
        value: "all",
        label: "All Active Branches",
        subLabel: "Review requests across all facilities",
      },
      ...activeBranches.map((b) => ({
        value: b.id,
        label: b.branchName,
        subLabel: b.branchCode ? `Code: ${b.branchCode} • Active` : "Active",
      })),
    ];
  }, [activeBranches]);

  const loadTransfers = useCallback(async () => {
    if (filterBranchId === null) {
      setTransfers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const filter: Parameters<typeof lotTransferService.listTransfers>[0] = {
        branchId: filterBranchId === "all" ? undefined : filterBranchId,
        search: search.trim() || undefined,
        status: statusFilter,
      };
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
        if (data?.branchId) {
          setFilterBranchId(data.branchId);
        }
      });
    }
  }, [transferId]);

  const listAnimKey = useMemo(() => {
    return `${filterBranchId ?? "none"}-${search}`;
  }, [filterBranchId, search]);

  const handleOpenReview = async (item: LotTransfer) => {
    setReviewLoadingId(item.id);
    try {
      const full = await lotTransferService.getTransferById(item.id);
      setSelectedTransfer(full);
      setQaEvidence(full.qaEvidence || "");
      setDetailModalOpen(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load transfer details for review";
      toast.error(msg);
    } finally {
      setReviewLoadingId(null);
    }
  };

  const handleApprove = async () => {
    if (!selectedTransfer) return;
    setActionLoading(true);
    try {
      await lotTransferService.approveTransfer(selectedTransfer.id, qaEvidence.trim());
      setDetailModalOpen(false);
      loadTransfers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to approve lot transfer";
      toast.error(msg);
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reject lot transfer";
      toast.error(msg);
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
          <motion.div whileTap={{ scale: 0.95 }}>
            <Button
              variant="outline"
              size="icon"
              onClick={loadTransfers}
              disabled={loading || filterBranchId === null}
              className="h-9 w-9"
              title="Refresh approval requests"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </motion.div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Active Branch Filter */}
        <div className="w-64">
          <SearchableSelect
            options={branchOptions}
            value={filterBranchId !== null ? filterBranchId : ""}
            onChange={(val) => {
              if (val === "all") {
                setFilterBranchId("all");
              } else {
                const num = Number(val);
                setFilterBranchId(Number.isNaN(num) || num <= 0 ? null : num);
              }
            }}
            placeholder="Select a branch..."
            triggerClassName="h-9"
          />
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={filterBranchId === null}
            placeholder={filterBranchId === null ? "Select a branch first to search..." : "Search request #, batch, reason..."}
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
            {filterBranchId === null ? (
              <TableRow>
                <TableCell colSpan={6} className="h-72 text-center">
                  <motion.div
                    initial={{ opacity: 0, y: 16, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.28, ease: "easeOut" }}
                    className="flex flex-col items-center justify-center max-w-md mx-auto text-center p-6 space-y-3.5"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-sm ring-8 ring-primary/5">
                      <Building2 className="w-7 h-7 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base font-bold text-foreground">Select an Operating Branch</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Please select an active branch from the dropdown above to view submitted lot transfer requests awaiting QA inspection and approval.
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/60 text-[11px] font-medium text-muted-foreground border">
                      <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                      <span>QA Approval Queue</span>
                    </div>
                  </motion.div>
                </TableCell>
              </TableRow>
            ) : loading && (transfers || []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-36 text-center text-muted-foreground" title="Loading approval requests...">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto opacity-50 text-primary" />
                    <span className="text-sm font-medium">Loading approval requests...</span>
                  </motion.div>
                </TableCell>
              </TableRow>
            ) : (transfers || []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-44 text-center text-muted-foreground" title="No lot transfer requests found">
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col items-center justify-center gap-2 py-4"
                  >
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground/60">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <span className="font-semibold text-foreground text-sm">No submitted transfers pending approval</span>
                    <span className="text-xs text-muted-foreground max-w-sm">
                      {search ? "No requests match your search criteria for this branch." : "All lot transfer requests for this branch have been reviewed or none are currently submitted."}
                    </span>
                  </motion.div>
                </TableCell>
              </TableRow>
            ) : (
              <AnimatePresence mode="popLayout" initial={false}>
                {(transfers || []).map((item, idx) => {
                  const branchDisplay = item.branchName && item.branchName !== "-" ? item.branchName : item.branchId ? `Branch #${item.branchId}` : "-";
                  const sourceLotDisplay = item.sourceLotName || `Lot #${item.sourceLotId}`;
                  const targetLotDisplay = item.targetLotName || `Lot #${item.targetLotId}`;
                  const lineCount = item.lineCount || item.details?.length || 1;
                  const requestedByDisplay = item.requestedByName || "-";

                  return (
                    <motion.tr
                      key={`${listAnimKey}-${item.id}`}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{
                        duration: 0.22,
                        delay: Math.min(idx * 0.035, 0.35),
                        ease: "easeOut",
                      }}
                      className="hover:bg-muted/40 transition-colors border-b"
                    >
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
                        <motion.div whileTap={{ scale: 0.95 }} className="inline-block">
                          <Button
                            variant={item.status === "Submitted" ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleOpenReview(item)}
                            disabled={reviewLoadingId === item.id}
                            className="h-8 text-xs gap-1.5"
                            title={item.status === "Submitted" ? "Review and Approve Transfer" : "View Transfer Details"}
                          >
                            {reviewLoadingId === item.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                            {item.status === "Submitted" ? "Review & Approve" : "View Details"}
                          </Button>
                        </motion.div>
                      </TableCell>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
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
                        <motion.tr
                          key={d.detailId || i}
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.18, delay: Math.min(i * 0.03, 0.3) }}
                          className="hover:bg-muted/30 transition-colors border-b"
                        >
                          <TableCell className="text-center font-mono text-xs text-muted-foreground" title={`Line ${d.lineNo || i + 1}`}>
                            {d.lineNo || i + 1}
                          </TableCell>
                          <TableCell title={primaryTitle}>
                            <div className="font-semibold text-sm leading-tight text-foreground">
                              {primaryTitle}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                              {pDesc && pName && <span>{pName}</span>}
                              {pCode && <span>{pCode}</span>}
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
                            <div className="flex items-center gap-1.5">
                              <span>{expDate}</span>
                              {d.sourceExpiryDate && new Date(d.sourceExpiryDate).getTime() < Date.now() && (
                                <Badge variant="destructive" className="text-[9px] py-0 px-1 font-semibold uppercase tracking-wider">
                                  Expired
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground" title={lineRemarks}>
                            {lineRemarks}
                          </TableCell>
                        </motion.tr>
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
                  <motion.div whileTap={{ scale: 0.96 }}>
                    <Button
                      variant="destructive"
                      onClick={() => setRejectModalOpen(true)}
                      disabled={actionLoading}
                      className="gap-1.5"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject Transfer
                    </Button>
                  </motion.div>
                  <motion.div whileTap={{ scale: 0.96 }}>
                    <Button
                      onClick={handleApprove}
                      disabled={actionLoading}
                      className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve Transfer
                    </Button>
                  </motion.div>
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
