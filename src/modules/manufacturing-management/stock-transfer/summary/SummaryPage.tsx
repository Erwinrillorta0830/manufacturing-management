'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Search, 
  RefreshCcw, 
  RotateCcw,
  Calendar, 
  Layers, 
  MapPin, 
  ArrowUp, 
  ArrowDown, 
  ArrowUpDown, 
  Loader2, 
  ServerCrash, 
  Filter, 
  ExternalLink,
  Paperclip
} from 'lucide-react';
import { useStockTransferSummary, SortConfig } from './hooks/use-stock-transfer-summary';
import { TransferDetailModal } from './components/TransferDetailModal';
import { formatPhDateTime } from '../utils/date-utils';
import { formatStatusForUi } from '../services/stock-transfer.helpers';
import { SearchableSelect } from '@/modules/manufacturing-management/shared/components/SearchableSelect';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  filters: { sort: SortConfig };
  toggleSort: (key: string) => void;
  className?: string;
}

function formatBranchLabel(nameOrCode: string | undefined): string {
  if (!nameOrCode) return 'Unknown Branch';
  if (nameOrCode.includes('_')) {
    return nameOrCode
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  return nameOrCode;
}

function formatStatusOptionLabel(status: string): string {
  if (!status || status === 'all') return 'All Statuses';
  const formatted = formatStatusForUi(status);
  if (formatted && formatted !== status) return formatted;
  return status
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getStatusBadgeClass(status?: string | null): string {
  const normalized = status?.toLowerCase().replace(/[_\s-]+/g, '');
  switch (normalized) {
    case 'requested':
      return 'bg-muted text-muted-foreground border-muted';
    case 'forapproval':
    case 'pendingapproval':
      return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800';
    case 'forpicking':
      return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800';
    case 'picking':
      return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800';
    case 'picked':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800';
    case 'forloading':
      return 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800';
    case 'intransit':
    case 'dispatched':
      return 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800';
    case 'received':
    case 'completed':
      return 'bg-emerald-600 text-white border-emerald-600';
    case 'rejected':
      return 'bg-destructive text-white border-destructive';
    case 'cancelled':
      return 'bg-destructive/80 text-white border-destructive/80';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

const SortableHeader = ({ label, sortKey, filters, toggleSort, className }: SortableHeaderProps) => {
  const isSorted = filters.sort.key === sortKey;
  const direction = filters.sort.direction;
  
  return (
    <TableHead 
      className={cn(
        "font-bold text-[10px] uppercase tracking-widest cursor-pointer hover:bg-muted/30 transition-colors group/header",
        isSorted && "text-primary bg-primary/5",
        className
      )}
      onClick={() => toggleSort(sortKey)}
    >
      <div className={cn("flex items-center gap-1.5", className?.includes('text-center') && "justify-center", className?.includes('text-right') && "justify-end")}>
        {label}
        {isSorted ? (
          direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-0 group-hover/header:opacity-50 transition-opacity" />
        )}
      </div>
    </TableHead>
  );
};

export default function StockTransferSummaryView() {
  const {
    loading,
    fetchError,
    refresh,
    getBranchName,
    branches,
    filters,
    updateFilter,
    resetFilters,
    filteredGroups,
    availableStatuses,
    isModalOpen,
    setIsModalOpen,
    selectedGroup,
    handleViewDetails,
    toggleSort,
    getUserName,
    getUnitName,
  } = useStockTransferSummary();

  const [currentPage, setCurrentPage] = React.useState(1);
  const [itemsPerPage, setItemsPerPage] = React.useState(10);

  // Reset page when filters or page size changes
  React.useEffect(() => {
    queueMicrotask(() => {
      setCurrentPage(1);
    });
  }, [filters, itemsPerPage]);

  const totalPages = Math.ceil(filteredGroups.length / itemsPerPage);
  const paginatedGroups = React.useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredGroups.slice(start, start + itemsPerPage);
  }, [filteredGroups, currentPage, itemsPerPage]);

  const branchOptions = React.useMemo(() => [
    { value: 'all', label: 'All Branches' },
    ...branches
      .filter((b) => b.isActive === undefined || b.isActive === 1 || b.isActive === true || b.isActive === "1")
      .map(b => {
        const rawName = b.branch_name || b.name || (b.branch_code ? formatBranchLabel(b.branch_code) : `Branch ${b.id}`);
        return {
          value: String(b.id),
          label: formatBranchLabel(rawName),
        };
      })
  ], [branches]);

  const statusOptions = React.useMemo(() => [
    { value: 'all', label: 'All Statuses' },
    ...availableStatuses.map(s => ({
      value: s,
      label: formatStatusOptionLabel(s),
    }))
  ], [availableStatuses]);

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

  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.16, ease: "easeOut" }}
      className="flex-1 space-y-4 p-4 md:p-8 pt-6"
    >
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Stock Transfer Summary</h2>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refresh()} 
            disabled={loading}
            className="gap-2 border-border shadow-none"
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters Section */}
      <Card className="border-border shadow-none bg-card/50">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
            {/* Search Filter */}
            <div className="space-y-1.5 w-full">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Search className="w-3 h-3" /> Search
              </label>
              <Input
                placeholder="Order No / Product..."
                value={filters.search}
                onChange={(e) => updateFilter('search', e.target.value)}
                className="w-full h-9 text-xs bg-background border-border shadow-none"
              />
            </div>

            {/* Status Filter */}
            <div className="space-y-1.5 w-full">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Layers className="w-3 h-3" /> Status
              </label>
              <SearchableSelect
                options={statusOptions}
                value={filters.status}
                onValueChange={(val) => updateFilter('status', val || 'all')}
                placeholder="All Statuses"
                searchPlaceholder="Search status..."
                triggerClassName="w-full h-9 text-xs bg-background border-border shadow-none"
              />
            </div>

            {/* Source Branch Filter */}
            <div className="space-y-1.5 w-full">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <MapPin className="w-3 h-3" /> Source
              </label>
              <SearchableSelect
                options={branchOptions}
                value={filters.sourceBranch}
                onValueChange={(val) => updateFilter('sourceBranch', val || 'all')}
                placeholder="All Branches"
                searchPlaceholder="Search source branch..."
                triggerClassName="w-full h-9 text-xs bg-background border-border shadow-none"
              />
            </div>

            {/* Target Branch Filter */}
            <div className="space-y-1.5 w-full">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <MapPin className="w-3 h-3" /> Target
              </label>
              <SearchableSelect
                options={branchOptions}
                value={filters.targetBranch}
                onValueChange={(val) => updateFilter('targetBranch', val || 'all')}
                placeholder="All Branches"
                searchPlaceholder="Search target branch..."
                triggerClassName="w-full h-9 text-xs bg-background border-border shadow-none"
              />
            </div>

            {/* Date Preset Filter */}
            <div className="space-y-1.5 w-full">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Calendar className="w-3 h-3" /> Period
              </label>
              <Select
                value={filters.datePreset}
                onValueChange={(val) => updateFilter('datePreset', val)}
              >
                <SelectTrigger className="w-full h-9 text-xs bg-background border-border shadow-none">
                  <SelectValue placeholder="Select Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today" className="text-xs">Today</SelectItem>
                  <SelectItem value="yesterday" className="text-xs">Yesterday</SelectItem>
                  <SelectItem value="week" className="text-xs">Last 7 Days</SelectItem>
                  <SelectItem value="month" className="text-xs">Last 30 Days</SelectItem>
                  <SelectItem value="custom" className="text-xs">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* From Date Filter */}
            <div className="space-y-1.5 w-full">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Calendar className="w-3 h-3" /> From
              </label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => updateFilter('dateFrom', e.target.value)}
                className="w-full h-9 text-xs bg-background border-border shadow-none"
              />
            </div>

            {/* To Date Filter */}
            <div className="space-y-1.5 w-full">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Calendar className="w-3 h-3" /> To
              </label>
              <div className="flex items-center gap-2 w-full">
                <Input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => updateFilter('dateTo', e.target.value)}
                  className="h-9 text-xs bg-background border-border flex-1 shadow-none min-w-0"
                />
                <Button variant="ghost" size="icon" onClick={resetFilters} title="Reset Filters" className="h-9 w-9 shrink-0 hover:bg-destructive/10 hover:text-destructive transition-colors">
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main List Section */}
      <Card className="border-border shadow-none bg-card overflow-hidden">
        <CardHeader className="bg-muted/10 border-b border-border py-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-xl font-bold">Transfer Records</CardTitle>
              <CardDescription className="text-xs">
                History and active requests of all stock transfers.
              </CardDescription>
            </div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-background px-3 py-1 rounded-full border border-border">
              {filteredGroups.length} Matches Found
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-primary opacity-50" />
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Loading transfers...</p>
            </div>
          )}

          {!loading && fetchError && (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
              <ServerCrash className="w-12 h-12 text-destructive/50" />
              <div>
                <p className="font-bold text-destructive">Data Retrieval Failed</p>
                <p className="text-[10px] text-muted-foreground mt-1 max-w-xs">{fetchError}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => refresh()}>Try Again</Button>
            </div>
          )}

          {!loading && !fetchError && (
            <>
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow className="border-b border-border">
                    <SortableHeader label="Reference No" sortKey="orderNo" filters={filters} toggleSort={toggleSort} className="pl-6" />
                    <SortableHeader label="Source Branch" sortKey="sourceBranch" filters={filters} toggleSort={toggleSort} />
                    <SortableHeader label="Target Branch" sortKey="targetBranch" filters={filters} toggleSort={toggleSort} />
                    <SortableHeader label="Items" sortKey="items" filters={filters} toggleSort={toggleSort} className="text-center" />
                    <SortableHeader label="Value" sortKey="totalAmount" filters={filters} toggleSort={toggleSort} className="text-right" />
                    <SortableHeader label="Requested At" sortKey="dateRequested" filters={filters} toggleSort={toggleSort} className="text-center" />
                    <TableHead className="font-bold text-[10px] uppercase tracking-widest text-center">Attachments</TableHead>
                    <SortableHeader label="Status" sortKey="status" filters={filters} toggleSort={toggleSort} className="text-center" />
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedGroups.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-48 text-center">
                        <div className="flex flex-col items-center justify-center space-y-2 text-muted-foreground opacity-30">
                          <Filter className="w-10 h-10" />
                          <p className="text-sm font-bold uppercase tracking-widest">No transfers match your filters</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedGroups.map((group) => (
                      <TableRow 
                        key={group.orderNo} 
                        className="group hover:bg-muted/5 border-b border-border/50 cursor-pointer transition-colors"
                        onClick={() => handleViewDetails(group)}
                      >
                        <TableCell className="pl-6">
                          <span className="font-mono font-bold text-primary text-sm tracking-tight">{group.orderNo}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-semibold truncate max-w-[150px] block" title={formatBranchLabel(getBranchName(group.sourceBranch))}>
                            {formatBranchLabel(getBranchName(group.sourceBranch))}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground truncate max-w-[150px] block" title={formatBranchLabel(getBranchName(group.targetBranch))}>
                            {formatBranchLabel(getBranchName(group.targetBranch))}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[9px] font-bold border-border bg-background">
                            {group.items.length} {group.items.length === 1 ? 'Item' : 'Items'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-mono text-xs font-bold">
                            ₱{group.totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center">
                            <span className="text-[10px] font-medium text-foreground">
                              {formatPhDateTime(group.dateRequested, { formatType: 'dateOnly' })}
                            </span>
                            <span className="text-[9px] text-muted-foreground font-mono">
                              {formatPhDateTime(group.dateRequested, { formatType: 'timeOnly' })}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {group.attachments && group.attachments.length > 0 ? (
                            <Badge
                              variant="outline"
                              className="text-[9px] font-bold gap-1 bg-primary/5 text-primary border-primary/20 hover:bg-primary/10 transition-colors"
                              title={`${group.attachments.length} attached document(s)`}
                            >
                              <Paperclip className="w-2.5 h-2.5" />
                              {group.attachments.length} {group.attachments.length === 1 ? 'file' : 'files'}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground/30 text-xs font-mono">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge 
                            variant="outline"
                            className={cn(
                              "font-black uppercase tracking-widest text-[9px] rounded-[4px] px-2 py-0.5 border shadow-none",
                              getStatusBadgeClass(group.status)
                            )}
                          >
                            {formatStatusForUi(group.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="pr-6">
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ExternalLink className="w-3.5 h-3.5 text-primary" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Pagination Section */}
              {filteredGroups.length > 0 && (
                <div className="p-4 border-t border-border bg-muted/5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest whitespace-nowrap">
                      Showing {Math.min(itemsPerPage * (currentPage - 1) + 1, filteredGroups.length)} to {Math.min(itemsPerPage * currentPage, filteredGroups.length)} of {filteredGroups.length} transfers
                    </div>
                    
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
            </>
          )}
        </CardContent>
      </Card>

      <TransferDetailModal
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        group={selectedGroup}
        getBranchName={getBranchName}
        getUserName={getUserName}
        getUnitName={getUnitName}
        branches={branches}
      />
    </motion.div>
  );
}
