"use client";

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  PhilippinePeso, TrendingDown, FileText, Download,
  Briefcase, Wallet, ListChecks,
} from 'lucide-react';
import { useAccountsPayable } from './hooks/useAccountsPayable';
import { MetricCard } from './components/MetricCard';
import { APTable } from './components/APTable';
import { CategorySplitHeader } from './components/CategorySplitHeader';
import { APFilterBar } from './components/APFilterBar';
import { AIInsightsPanel } from './components/AIInsightsPanel';
import {
  buildAgingBuckets, buildSupplierData, buildStatusData, deriveMetrics,
  buildCategoryBreakdown, formatPeso,
} from './utils';
import type { APStatus, APCategory } from './types';

const STATUS_OPTIONS: APStatus[] = [
  'Paid', 'Unpaid', 'Partially Paid', 'Unpaid | Overdue', 'Partially Paid | Overdue',
];
type TabValue = 'all' | APCategory;

const ChartSkeleton = () => (
  <Skeleton className="h-[300px] w-full rounded-lg" />
);

const APAgingChart = dynamic(
  () => import('./components/APAgingChart').then((module) => module.APAgingChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
const APSupplierChart = dynamic(
  () => import('./components/APSupplierChart').then((module) => module.APSupplierChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
const APStatusPieChart = dynamic(
  () => import('./components/APStatusPieChart').then((module) => module.APStatusPieChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

export default function AccountsPayableModule() {
  const { loading, error, records } = useAccountsPayable();
  const [tab, setTab] = useState<TabValue>('all');
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [supplier, setSupplier] = useState('');
  const [status, setStatus] = useState('');

  const tradeRecords    = useMemo(() => records.filter(r => r.apCategory === 'Trade'),     [records]);
  const nonTradeRecords = useMemo(() => records.filter(r => r.apCategory === 'Non-Trade'), [records]);

  const [tradeBreakdown, nonTradeBreakdown] = useMemo(() => {
    const breakdown = buildCategoryBreakdown(records);
    return [breakdown[0], breakdown[1]];
  }, [records]);

  const tabRecords = useMemo(() => {
    if (tab === 'Trade')     return tradeRecords;
    if (tab === 'Non-Trade') return nonTradeRecords;
    return records;
  }, [tab, records, tradeRecords, nonTradeRecords]);

  const supplierOptions = useMemo(
    () => Array.from(new Set(tabRecords.map(r => r.supplier).filter(Boolean))).sort(),
    [tabRecords]
  );

  const handleTabChange = (v: string) => {
    setTab(v as TabValue);
    setSupplier('');
    setStatus('');
    setPage(1);
  };

  const isFiltered = !!(dateFrom || dateTo || supplier || status);

  const filteredRecords = useMemo(() => {
    return tabRecords.filter(r => {
      const recDate = (r.invoiceDate || r.dueDate || '').split(' ')[0];
      if (dateFrom && recDate && recDate < dateFrom) return false;
      if (dateTo   && recDate && recDate > dateTo)   return false;
      if (supplier && r.supplier !== supplier)        return false;
      if (status   && r.status   !== status)          return false;
      return true;
    });
  }, [tabRecords, dateFrom, dateTo, supplier, status]);

  const displayRecords      = filteredRecords;
  const displayMetrics      = useMemo(() => deriveMetrics(filteredRecords),     [filteredRecords]);
  const displayAgingData    = useMemo(() => buildAgingBuckets(filteredRecords), [filteredRecords]);
  const displaySupplierData = useMemo(() => buildSupplierData(filteredRecords), [filteredRecords]);
  const displayStatusData   = useMemo(() => buildStatusData(filteredRecords),   [filteredRecords]);

  const clearFilters = () => {
    setDateFrom(''); setDateTo(''); setSupplier(''); setStatus(''); setPage(1);
  };

  const exportToPDF = async () => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageW = doc.internal.pageSize.getWidth();
    const total = displayMetrics.totalPayable;
    const formattedTotal = `PHP ${total.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 20);
    doc.text(`Accounts Payable Report - ${tab === 'all' ? 'All' : tab} (Men2 Corp)`, 14, 16);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const totalLabel  = `Grand Total: ${formattedTotal}`;
    const totalLabelX = Math.max(pageW / 2, pageW - 14 - doc.getTextWidth(totalLabel));
    doc.text(totalLabel, totalLabelX, 16);

    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.line(14, 20, pageW - 14, 20);

    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `From: ${dateFrom || 'N/A'}   To: ${dateTo || 'N/A'}   Supplier: ${supplier || 'All'}   Status: ${status || 'All'}   Category: ${tab === 'all' ? 'Trade + Non-Trade' : tab}`,
      14, 26
    );
    doc.text(`Exported: ${new Date().toLocaleString('en-PH')}   Total Records: ${displayRecords.length}`, 14, 31);
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 36,
      headStyles: { fillColor: [24, 24, 27], fontSize: 7, textColor: 255 },
      bodyStyles: { fontSize: 7 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      head: [[
        'Ref. No.', 'Supplier', 'Invoice No.', 'Division', 'Invoice Date', 'Due Date',
        'Amount Payable (PHP)', 'Amount Paid (PHP)', 'Outstanding Balance (PHP)',
        'Aging (Days)', 'Status', 'Category',
      ]],
      body: displayRecords.map(r => [
        r.refNo, r.supplier,
        r.invoiceNo !== '\u2014' ? r.invoiceNo : '',
        r.division,
        r.invoiceDate ? r.invoiceDate.split(' ')[0] : '\u2014',
        r.dueDate     ? r.dueDate.split(' ')[0]     : '\u2014',
        r.amountPayable.toLocaleString('en-PH',      { minimumFractionDigits: 2 }),
        r.amountPaid.toLocaleString('en-PH',         { minimumFractionDigits: 2 }),
        r.outstandingBalance.toLocaleString('en-PH', { minimumFractionDigits: 2 }),
        Math.max(0, r.aging ?? 0),
        r.status, r.apCategory,
      ]),
      margin: { left: 14, right: 14 },
    });

    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? 36;
    const boxW = 110, boxH = 12, boxX = pageW - 14 - boxW, boxY = finalY + 6;
    doc.setFillColor(24, 24, 27);
    doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Grand Total:', boxX + 4, boxY + 7.5);
    const amtW = doc.getTextWidth(formattedTotal);
    doc.text(formattedTotal, boxX + boxW - 4 - amtW, boxY + 7.5);

    const tabSuffix = tab === 'all' ? 'all' : tab.toLowerCase();
    doc.save(`ap-export-${tabSuffix}-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (loading) return (
    <div className="p-8 space-y-4">
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-6 w-1/2" />
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (error) return (
    <div className="p-8 text-center m-8 border border-red-500/20 bg-red-500/5 rounded-lg">
      <p className="text-red-500 font-medium">Error: {error}</p>
      <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
        Retry Connection
      </Button>
    </div>
  );

  return (
    <div className="p-4 md:p-6 bg-background text-foreground min-h-screen space-y-6 w-full box-border overflow-hidden">

      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-sky-500/5 via-indigo-500/5 to-amber-500/5 px-5 sm:px-7 py-5 sm:py-6">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-gradient-to-br from-sky-500/20 to-indigo-500/20 blur-3xl pointer-events-none" aria-hidden />
        <div className="absolute -right-8 -bottom-16 h-56 w-56 rounded-full bg-gradient-to-br from-amber-500/15 to-rose-500/15 blur-3xl pointer-events-none" aria-hidden />
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              Financial Monitoring
            </p>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
              Accounts Payable
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-2xl">
              Trade vs Non-Trade payables, aging analysis, and supplier exposure at a glance.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={exportToPDF}
            className="h-9 px-3 text-xs gap-1.5 self-start sm:self-auto"
          >
            <Download className="h-3.5 w-3.5" />
            Export PDF
          </Button>
        </div>
      </div>

      <CategorySplitHeader trade={tradeBreakdown} nonTrade={nonTradeBreakdown} />

      <Tabs value={tab} onValueChange={handleTabChange} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList className="h-9 p-1 bg-muted/60 border border-border">
            <TabsTrigger value="all" className="h-7 px-3 text-xs font-bold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm">
              <ListChecks className="h-3.5 w-3.5 mr-1.5" />All
              <span className="ml-1.5 text-[10px] font-black tabular-nums opacity-70">{records.length}</span>
            </TabsTrigger>
            <TabsTrigger value="Trade" className="h-7 px-3 text-xs font-bold data-[state=active]:bg-gradient-to-br data-[state=active]:from-sky-500 data-[state=active]:to-indigo-500 data-[state=active]:text-white data-[state=active]:shadow-sm">
              <Briefcase className="h-3.5 w-3.5 mr-1.5" />Trade
              <span className="ml-1.5 text-[10px] font-black tabular-nums opacity-80">{tradeRecords.length}</span>
            </TabsTrigger>
            <TabsTrigger value="Non-Trade" className="h-7 px-3 text-xs font-bold data-[state=active]:bg-gradient-to-br data-[state=active]:from-amber-500 data-[state=active]:to-rose-500 data-[state=active]:text-white data-[state=active]:shadow-sm">
              <Wallet className="h-3.5 w-3.5 mr-1.5" />Non-Trade
              <span className="ml-1.5 text-[10px] font-black tabular-nums opacity-80">{nonTradeRecords.length}</span>
            </TabsTrigger>
          </TabsList>

          <p className="text-[11px] text-muted-foreground tabular-nums">
            <span className="font-bold text-foreground">{formatPeso(displayMetrics.totalOutstanding)}</span>
            {' '}outstanding across{' '}
            <span className="font-bold text-foreground">{displayRecords.length}</span>
            {' '}record{displayRecords.length !== 1 ? 's' : ''}
          </p>
        </div>

        <TabsContent value={tab} className="m-0 space-y-6">
          <APFilterBar
            dateFrom={dateFrom} setDateFrom={setDateFrom}
            dateTo={dateTo}     setDateTo={setDateTo}
            supplier={supplier} setSupplier={setSupplier}
            status={status}     setStatus={setStatus}
            supplierOptions={supplierOptions}
            isFiltered={isFiltered}
            clearFilters={clearFilters}
            setPage={setPage}
            STATUS_OPTIONS={STATUS_OPTIONS}
          />

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 w-full">
            <MetricCard
              title="Total Payable"
              value={formatPeso(displayMetrics.totalPayable)}
              sub={`${displayMetrics.totalRecords} total records`}
              icon={<PhilippinePeso className="h-4 w-4 text-primary" />}
              gradient="bg-gradient-to-r from-sky-500 to-indigo-500"
              progress={displayMetrics.totalPayable > 0 ? 100 : 0}
            />
            <MetricCard
              title="Total Paid"
              value={formatPeso(displayMetrics.totalPaid)}
              sub={displayMetrics.totalPayable > 0
                ? `${((displayMetrics.totalPaid / displayMetrics.totalPayable) * 100).toFixed(1)}% of total`
                : 'No payables yet'}
              icon={<FileText className="h-4 w-4 text-emerald-700" />}
              gradient="bg-gradient-to-r from-emerald-500 to-emerald-400"
              iconClass="bg-emerald-500/10 text-emerald-700"
              progress={displayMetrics.totalPayable > 0
                ? (displayMetrics.totalPaid / displayMetrics.totalPayable) * 100
                : 0}
            />
            <MetricCard
              title="Outstanding Balance"
              value={formatPeso(displayMetrics.totalOutstanding)}
              sub={displayMetrics.totalPayable > 0
                ? `${((displayMetrics.totalOutstanding / displayMetrics.totalPayable) * 100).toFixed(1)}% of total`
                : 'Fully settled'}
              icon={<TrendingDown className="h-4 w-4 text-rose-700" />}
              gradient="bg-gradient-to-r from-rose-500 to-amber-500"
              iconClass="bg-rose-500/10 text-rose-700"
              progress={displayMetrics.totalPayable > 0
                ? (displayMetrics.totalOutstanding / displayMetrics.totalPayable) * 100
                : 0}
            />
          </div>

          <AIInsightsPanel records={displayRecords} />

          <div className="grid gap-4 md:grid-cols-3 w-full min-w-0 items-stretch">
            <div className="md:col-span-2 h-full">
              <APAgingChart data={displayAgingData} isFiltered={isFiltered} />
            </div>
            <div className="md:col-span-1 h-full">
              <APStatusPieChart data={displayStatusData} isFiltered={isFiltered} />
            </div>
          </div>

          <APSupplierChart data={displaySupplierData} isFiltered={isFiltered} />

          <APTable records={displayRecords} page={page} setPage={setPage} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
