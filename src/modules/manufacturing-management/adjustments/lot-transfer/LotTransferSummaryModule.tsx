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
  FileText,
  RefreshCw,
  Search,
  Eye,
  History,
  Activity,
  ArrowRight,
} from "lucide-react";
import { TransferStatusBadge } from "./components/TransferStatusBadge";
import { SearchableSelect, type Option } from "./components/SearchableSelect";
import { lotTransferService } from "./services/lot-transfer.service";
import { fetchBranches } from "./services/lot-tracking.service";
import type {
  BranchOption,
  LotTransfer,
  LotTransferStatus,
  LotTransferStatusHistory,
  LotTransferMovementHistory,
} from "./types";

const formatAuditTimestamp = (val?: string | null): string => {
  if (!val) return "-";
  const str = String(val).trim();
  if (!str) return "-";

  const match = str.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
  if (match) {
    return `${match[1]} ${match[2]}`;
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  return "-";
};

interface LotTransferSummaryModuleProps {
  userBranchId?: number | null;
  transferId?: number;
}

export const LotTransferSummaryModule: React.FC<LotTransferSummaryModuleProps> = ({
  userBranchId,
  transferId,
}) => {
  const [activeBranches, setActiveBranches] = useState<BranchOption[]>([]);
  const [filterBranchId, setFilterBranchId] = useState<number | null>(userBranchId || null);

  const [transfers, setTransfers] = useState<LotTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

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

  // Audit and movement details modal
  const [selectedTransfer, setSelectedTransfer] = useState<LotTransfer | null>(null);
  const [statusHistory, setStatusHistory] = useState<LotTransferStatusHistory[]>([]);
  const [movements, setMovements] = useState<LotTransferMovementHistory[]>([]);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const loadTransfers = useCallback(async () => {
    setLoading(true);
    try {
      const filter: Parameters<typeof lotTransferService.listTransfers>[0] = {
        branchId: filterBranchId || undefined,
        search: search.trim() || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      };
      if (statusFilter !== "ALL") {
        filter.status = statusFilter as LotTransferStatus;
      }
      const res = await lotTransferService.listTransfers(filter);
      setTransfers(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []);
    } catch {
      setTransfers([]);
    } finally {
      setLoading(false);
    }
  }, [filterBranchId, search, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    loadTransfers();
  }, [loadTransfers]);

  useEffect(() => {
    if (transferId) {
      lotTransferService.getTransferById(transferId).then((data) => {
        handleOpenDetail(data);
      });
    }
  }, [transferId]);

  const handleOpenDetail = async (item: LotTransfer) => {
    setSelectedTransfer(item);
    setDetailModalOpen(true);
    setLoadingAudit(true);

    try {
      const [full, historyRes, movRes] = await Promise.all([
        lotTransferService.getTransferById(item.id),
        lotTransferService.getStatusHistory(item.id).catch(() => []),
        lotTransferService.getMovements(item.id).catch(() => []),
      ]);
      setSelectedTransfer(full);
      setStatusHistory(historyRes);
      setMovements(movRes);
    } catch {
    } finally {
      setLoadingAudit(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 space-y-4 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">Lot Transfer Summary &amp; Audit</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Full audit register of all manufacturing lot transfers, lifecycle transitions, and stock movements.
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

      {/* Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
        {/* Active Branch Filter */}
        <div>
          <SearchableSelect
            options={branchOptions}
            value={filterBranchId || 0}
            onChange={(val) => setFilterBranchId(Number(val) > 0 ? Number(val) : null)}
            placeholder="Select a branch..."
            triggerClassName="h-9"
          />
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search request #, batch..."
            className="pl-9 h-9"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 px-3 border rounded-md text-sm bg-background font-medium"
        >
          <option value="ALL">All Statuses</option>
          <option value="Draft">Draft</option>
          <option value="Submitted">Submitted</option>
          <option value="Approved">Approved</option>
          <option value="Posted">Posted</option>
          <option value="Rejected">Rejected</option>
          <option value="Cancelled">Cancelled</option>
          <option value="Reversed">Reversed</option>
        </select>

        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          placeholder="From Date"
          className="h-9"
        />

        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          placeholder="To Date"
          className="h-9"
        />
      </div>

      {/* Summary Table */}
      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead title="Transfer Request Number, Date & Branch">Request & Details</TableHead>
              <TableHead title="Workflow Status">Status</TableHead>
              <TableHead title="Storage Route (Source → Target Lot)">Storage Route</TableHead>
              <TableHead className="text-right" title="Total Transfer Quantity & Lines">Total Qty & Lines</TableHead>
              <TableHead title="Transfer Reason / Operational Justification">Reason</TableHead>
              <TableHead className="text-right" title="Actions & Audit Log">Audit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (transfers || []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 opacity-40" />
                  Loading summary...
                </TableCell>
              </TableRow>
            ) : (transfers || []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  No lot transfer records found.
                </TableCell>
              </TableRow>
            ) : (
              (transfers || []).map((item) => {
                const branchDisplay = item.branchName && item.branchName !== "-" ? item.branchName : item.branchId ? `Branch #${item.branchId}` : "-";
                const sourceLotDisplay = item.sourceLotName || `Lot #${item.sourceLotId}`;
                const targetLotDisplay = item.targetLotName || `Lot #${item.targetLotId}`;
                const lineCount = item.lineCount || item.details?.length || 1;

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
                    <TableCell title={item.reason || "No operational justification provided"}>
                      <div className="text-xs text-muted-foreground max-w-[220px] truncate">
                        {item.reason || "-"}
                      </div>
                    </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenDetail(item)}
                      className="h-8 text-xs gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View Audit
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })
          )}
          </TableBody>
        </Table>
      </div>

      {/* Comprehensive Detail & Audit Dialog */}
      {selectedTransfer && (
        <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
          <DialogContent className="max-w-6xl sm:max-w-6xl w-[95vw] h-[90vh] max-h-[920px] flex flex-col p-6 overflow-hidden">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
                  <FileText className="w-5 h-5 text-primary" />
                  Lot Transfer {selectedTransfer.requestNo}
                </DialogTitle>
                <TransferStatusBadge status={selectedTransfer.status} />
              </div>
              <DialogDescription>
                Transfer Date: {selectedTransfer.transferDate} • From {selectedTransfer.sourceLotName || `Lot #${selectedTransfer.sourceLotId}`} to {selectedTransfer.targetLotName || `Lot #${selectedTransfer.targetLotId}`}.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Header metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 border rounded-xl bg-card text-xs">
                <div>
                  <span className="text-muted-foreground block">Requested By</span>
                  <span className="font-semibold text-sm">{selectedTransfer.requestedByName || "System User"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Approved By</span>
                  <span className="font-semibold text-sm">{selectedTransfer.approvedByName || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Posted By</span>
                  <span className="font-semibold text-sm">{selectedTransfer.postedByName || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Total Quantity</span>
                  <span className="font-semibold text-sm font-mono">
                    {selectedTransfer.quantity.toLocaleString()}
                    {selectedTransfer.unitName ? ` ${selectedTransfer.unitName}` : ""}
                  </span>
                </div>
              </div>

              {/* Line items table */}
              <div className="border rounded-xl bg-card overflow-hidden">
                <div className="p-2.5 bg-muted/30 font-semibold text-xs uppercase tracking-wider border-b">
                  Line Items ({selectedTransfer.details?.length || 0})
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20">
                      <TableHead className="w-12 text-center" title="Line Number">#</TableHead>
                      <TableHead title="Product Name / SKU">Product</TableHead>
                      <TableHead title="Source Batch Number">Source Batch</TableHead>
                      <TableHead title="Target Batch Number">Target Batch</TableHead>
                      <TableHead className="text-right" title="Quantity">Quantity</TableHead>
                      <TableHead title="Manufacturing Date">Mfg Date</TableHead>
                      <TableHead title="Expiry Date">Expiry Date</TableHead>
                      <TableHead title="Remarks">Remarks</TableHead>
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
                      const lineRemarks = d.lineRemarks || selectedTransfer.reason || "-";
                      const unitSuffix = selectedTransfer.unitName ? ` ${selectedTransfer.unitName}` : "";

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
                          <TableCell className="text-right font-mono text-xs font-semibold" title={`${d.quantity.toLocaleString()}${unitSuffix}`}>
                            {d.quantity.toLocaleString()}{unitSuffix}
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

              {/* Status History Audit Trail */}
              <div className="border rounded-xl bg-card overflow-hidden">
                <div className="p-2.5 bg-muted/30 font-semibold text-xs uppercase tracking-wider border-b flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-primary" />
                  Status Lifecycle Audit
                </div>
                {loadingAudit ? (
                  <div className="p-4 text-xs text-muted-foreground text-center flex items-center justify-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                    <span>Loading audit trail...</span>
                  </div>
                ) : statusHistory.length === 0 ? (
                  <div className="p-4 text-xs text-muted-foreground text-center">
                    No status transition history recorded yet.
                  </div>
                ) : (
                  <div className="divide-y text-xs">
                    {statusHistory.map((h) => (
                      <div key={h.id} className="p-3 flex items-center justify-between">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{h.oldStatus || "New"}</span>
                            <span className="text-muted-foreground">➔</span>
                            <TransferStatusBadge status={h.newStatus} />
                          </div>
                          <div className="text-muted-foreground">{h.remarks}</div>
                        </div>
                        <div className="text-right text-muted-foreground">
                          <div>{h.changedByName || "System User"}</div>
                          <div className="text-[10px] font-mono">{formatAuditTimestamp(h.changedAt)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Inventory Movements Audit */}
              {movements.length > 0 && (
                <div className="border rounded-xl bg-card overflow-hidden">
                  <div className="p-2.5 bg-muted/30 font-semibold text-xs uppercase tracking-wider border-b flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-primary" />
                    Posted Inventory Movements ({movements.length})
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="w-20">ID</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Direction</TableHead>
                        <TableHead>Batch #</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead>Remarks</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements.map((m) => (
                        <TableRow key={m.movementId}>
                          <TableCell className="font-mono text-xs">{m.movementId}</TableCell>
                          <TableCell className="text-xs">{m.transactionType || "Lot Transfer"}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={m.movementDirection === "OUT" ? "text-destructive border-destructive" : "text-emerald-600 border-emerald-600"}
                            >
                              {m.movementDirection}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{m.batchNo}</TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold">
                            {m.movementDirection === "OUT" ? `-${m.quantity}` : `+${m.quantity}`}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{m.remarks || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <DialogFooter className="pt-3 border-t flex items-center justify-between">
              <Button variant="outline" onClick={() => setDetailModalOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}


    </div>
  );
};
export default LotTransferSummaryModule;
