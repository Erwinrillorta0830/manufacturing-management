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
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  RefreshCw,
  Search,
  Eye,
  History,
  Activity,
  ArrowRight,
  Building2,
  RotateCcw,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { TransferStatusBadge } from "./components/TransferStatusBadge";
import { SearchableSelect, type Option } from "./components/SearchableSelect";
import { LotTransferPrintModal } from "./components/LotTransferPrintModal";
import { lotTransferService } from "./services/lot-transfer.service";
import { fetchBranches } from "./services/lot-tracking.service";
import type {
  BranchOption,
  LotTransfer,
  LotTransferStatus,
  LotTransferStatusHistory,
  LotTransferMovementHistory,
} from "./types";

function buildPageList(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "ellipsis")[] = [1];
  if (current > 3) {
    pages.push("ellipsis");
  }
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  if (current < total - 2) {
    pages.push("ellipsis");
  }
  pages.push(total);
  return pages;
}

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
  transferId,
}) => {
  const [activeBranches, setActiveBranches] = useState<BranchOption[]>([]);
  const [filterBranchId, setFilterBranchId] = useState<number | "all" | null>(null);

  const [transfers, setTransfers] = useState<LotTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [auditLoadingId, setAuditLoadingId] = useState<number | null>(null);
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
      {
        value: "all",
        label: "All Active Branches",
        subLabel: "Audit register across all facilities",
      },
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

  // Reversal state for posted transfers
  const [reverseModalOpen, setReverseModalOpen] = useState(false);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalLoading, setReversalLoading] = useState(false);

  // Printable slip modal state
  const [printTransfer, setPrintTransfer] = useState<LotTransfer | null>(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printLoadingId, setPrintLoadingId] = useState<number | null>(null);

  const handleOpenPrint = useCallback(async (item: LotTransfer) => {
    if (item.details && item.details.length > 0) {
      setPrintTransfer(item);
      setPrintModalOpen(true);
      return;
    }
    setPrintLoadingId(item.id);
    try {
      const full = await lotTransferService.getTransferById(item.id);
      setPrintTransfer(full || item);
      setPrintModalOpen(true);
    } catch {
      setPrintTransfer(item);
      setPrintModalOpen(true);
    } finally {
      setPrintLoadingId(null);
    }
  }, []);

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

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);

  // Auto-reset to page 1 on filter/search change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterBranchId, search, statusFilter, dateFrom, dateTo]);

  const totalItems = transfers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedTransfers = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * itemsPerPage;
    return transfers.slice(startIndex, startIndex + itemsPerPage);
  }, [transfers, safeCurrentPage, itemsPerPage]);

  const listAnimKey = useMemo(() => {
    return `${filterBranchId ?? "none"}-${statusFilter}-${search}-${dateFrom}-${dateTo}-${safeCurrentPage}`;
  }, [filterBranchId, statusFilter, search, dateFrom, dateTo, safeCurrentPage]);

  const handleOpenDetail = useCallback(async (item: LotTransfer) => {
    setAuditLoadingId(item.id);
    setSelectedTransfer(item);
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
      setDetailModalOpen(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load audit history";
      toast.error(msg);
    } finally {
      setLoadingAudit(false);
      setAuditLoadingId(null);
    }
  }, []);

  useEffect(() => {
    if (transferId) {
      lotTransferService.getTransferById(transferId).then((data) => {
        if (data?.branchId) {
          setFilterBranchId(data.branchId);
        }
        handleOpenDetail(data);
      });
    }
  }, [transferId, handleOpenDetail]);

  const handleConfirmReversal = async () => {
    if (!selectedTransfer || !reversalReason.trim()) {
      toast.error("Please provide a reason for reversing this transfer.");
      return;
    }
    setReversalLoading(true);
    try {
      await lotTransferService.reverseTransfer(selectedTransfer.id, reversalReason.trim());
      setReverseModalOpen(false);
      setDetailModalOpen(false);
      setReversalReason("");
      loadTransfers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reverse lot transfer";
      toast.error(msg);
    } finally {
      setReversalLoading(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col p-4 space-y-4 max-w-7xl mx-auto w-full">
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
          <motion.div whileTap={{ scale: 0.95 }}>
            <Button
              variant="outline"
              size="icon"
              onClick={loadTransfers}
              disabled={loading || filterBranchId === null}
              className="h-9 w-9"
              title="Refresh audit register"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </motion.div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
        {/* Active Branch Filter */}
        <div>
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

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={filterBranchId === null}
            placeholder={filterBranchId === null ? "Select a branch first to search..." : "Search request #, batch..."}
            className="pl-9 h-9"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          disabled={filterBranchId === null}
          className="h-9 px-3 border rounded-md text-sm bg-background font-medium disabled:opacity-50"
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
          disabled={filterBranchId === null}
          placeholder="From Date"
          className="h-9 disabled:opacity-50"
        />

        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          disabled={filterBranchId === null}
          placeholder="To Date"
          className="h-9 disabled:opacity-50"
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
                        Please select an active branch from the dropdown above to view the audit register of manufacturing lot transfers.
                      </p>
                    </div>

                  </motion.div>
                </TableCell>
              </TableRow>
            ) : loading && (transfers || []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-36 text-center text-muted-foreground">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto opacity-50 text-primary" />
                    <span className="text-sm font-medium">Loading summary & audit records...</span>
                  </motion.div>
                </TableCell>
              </TableRow>
            ) : (transfers || []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-44 text-center text-muted-foreground">
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col items-center justify-center gap-2 py-4"
                  >
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground/60">
                      <FileText className="w-5 h-5" />
                    </div>
                    <span className="font-semibold text-foreground text-sm">No lot transfer records found</span>
                    <span className="text-xs text-muted-foreground max-w-sm">
                      {search || statusFilter !== "ALL" || dateFrom || dateTo
                        ? "No transfers match the selected filter criteria for this branch."
                        : "No lot transfer records have been registered under this branch."}
                    </span>
                  </motion.div>
                </TableCell>
              </TableRow>
            ) : (
              <AnimatePresence mode="popLayout" initial={false}>
                {(paginatedTransfers || []).map((item, idx) => {
                  const branchDisplay = item.branchName && item.branchName !== "-" ? item.branchName : item.branchId ? `Branch #${item.branchId}` : "-";
                  const sourceLotDisplay = item.sourceLotName || `Lot #${item.sourceLotId}`;
                  const targetLotDisplay = item.targetLotName || `Lot #${item.targetLotId}`;
                  const lineCount = item.lineCount || item.details?.length || 1;

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
                      <TableCell title={item.reason || "No operational justification provided"}>
                        <div className="text-xs text-muted-foreground max-w-[220px] truncate">
                          {item.reason || "-"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <motion.div whileTap={{ scale: 0.95 }} className="inline-block">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenPrint(item)}
                              disabled={printLoadingId === item.id}
                              className="h-8 text-xs gap-1.5 px-2 text-muted-foreground hover:text-foreground"
                              title="Print lot transfer slip"
                            >
                              {printLoadingId === item.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Printer className="w-3.5 h-3.5" />
                              )}
                              <span className="hidden sm:inline">Print</span>
                            </Button>
                          </motion.div>
                          <motion.div whileTap={{ scale: 0.95 }} className="inline-block">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenDetail(item)}
                              disabled={auditLoadingId === item.id}
                              className="h-8 text-xs gap-1.5"
                            >
                              {auditLoadingId === item.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                              View Audit
                            </Button>
                          </motion.div>
                        </div>
                      </TableCell>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            )}
          </TableBody>
        </Table>

        {/* Pagination Controls */}
        {transfers.length > 0 && (
          <div className="p-3 sm:p-4 border-t border-border bg-muted/5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="text-xs text-muted-foreground font-medium whitespace-nowrap">
                Showing{" "}
                <span className="font-bold text-foreground">
                  {Math.min(itemsPerPage * (safeCurrentPage - 1) + 1, totalItems)}
                </span>{" "}
                to{" "}
                <span className="font-bold text-foreground">
                  {Math.min(itemsPerPage * safeCurrentPage, totalItems)}
                </span>{" "}
                of <span className="font-bold text-foreground">{totalItems}</span> transfers
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">Show</span>
                <Select
                  value={String(itemsPerPage)}
                  onValueChange={(v) => {
                    setItemsPerPage(Number(v));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 min-w-[72px] w-auto px-2.5 text-xs font-semibold border-border bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 50, 100].map((s) => (
                      <SelectItem key={s} value={String(s)} className="text-xs font-medium">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {totalPages > 1 && (
              <Pagination className="w-auto mx-0 justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setCurrentPage((p) => Math.max(1, p - 1));
                      }}
                      className={safeCurrentPage === 1 ? "pointer-events-none opacity-40" : "cursor-pointer"}
                    />
                  </PaginationItem>

                  {buildPageList(safeCurrentPage, totalPages).map((p, i) =>
                    p === "ellipsis" ? (
                      <PaginationItem key={`ellipsis-${i}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={p}>
                        <PaginationLink
                          href="#"
                          isActive={p === safeCurrentPage}
                          onClick={(e) => {
                            e.preventDefault();
                            setCurrentPage(p);
                          }}
                          className="cursor-pointer"
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  )}

                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setCurrentPage((p) => Math.min(totalPages, p + 1));
                      }}
                      className={safeCurrentPage === totalPages ? "pointer-events-none opacity-40" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        )}
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
                        </motion.tr>
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
                    {statusHistory.map((h, hIdx) => (
                      <motion.div
                        key={h.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: Math.min(hIdx * 0.04, 0.3) }}
                        className="p-3 flex items-center justify-between"
                      >
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
                      </motion.div>
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
                      {movements.map((m, mIdx) => (
                        <motion.tr
                          key={m.movementId}
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.18, delay: Math.min(mIdx * 0.03, 0.3) }}
                          className="border-b"
                        >
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
                        </motion.tr>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <DialogFooter className="pt-3 border-t flex items-center justify-between">
              <div>
                {selectedTransfer.status === "Posted" && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setReverseModalOpen(true)}
                    className="gap-1.5 text-xs h-8"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reverse Transfer
                  </Button>
                )}
              </div>
              <motion.div whileTap={{ scale: 0.96 }}>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPrintTransfer(selectedTransfer);
                      setPrintModalOpen(true);
                    }}
                    className="h-9 gap-1.5 "
                    title="Print transfer document"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print Slip
                  </Button>
                  <Button variant="outline" onClick={() => setDetailModalOpen(false)}>
                    Close
                  </Button>
                </div>
              </motion.div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Reversal Confirmation Dialog */}
      <Dialog open={reverseModalOpen} onOpenChange={setReverseModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <RotateCcw className="w-5 h-5" />
              Reverse Lot Transfer {selectedTransfer?.requestNo}
            </DialogTitle>
            <DialogDescription>
              Reversing this transfer will create compensating opposite inventory movements, returning stock from{" "}
              <strong className="text-foreground">{selectedTransfer?.targetLotName || `Lot #${selectedTransfer?.targetLotId}`}</strong> back to{" "}
              <strong className="text-foreground">{selectedTransfer?.sourceLotName || `Lot #${selectedTransfer?.sourceLotId}`}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label className="text-xs font-semibold text-foreground">
              Reason for Reversal *
            </label>
            <Input
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              placeholder="e.g. Relocation clerical error / wrong destination bin selected"
              className="text-sm"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setReverseModalOpen(false);
                setReversalReason("");
              }}
              disabled={reversalLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmReversal}
              disabled={reversalLoading || !reversalReason.trim()}
              className="gap-1.5"
            >
              {reversalLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
              Confirm Reversal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lot Transfer Print Slip Modal */}
      <LotTransferPrintModal
        open={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        transfer={printTransfer}
      />
    </div>
  );
};
export default LotTransferSummaryModule;
