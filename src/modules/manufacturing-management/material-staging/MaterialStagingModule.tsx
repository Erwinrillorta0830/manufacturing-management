"use client";

import React from "react";
import {
    RefreshCw,
    Boxes,
    PackageCheck,
    AlertTriangle,
    Clock,
    Search,
    Building2,
    Warehouse,
    Lock,
    Unlock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { useMaterialStaging } from "./hooks/useMaterialStaging";
import { StagingPickList } from "./components/StagingPickList";
import { BinTransferModal } from "./components/BinTransferModal";
import { ShortageWarningDialog } from "./components/ShortageWarningDialog";

export default function MaterialStagingModule() {
    const {
        filteredJobOrders,
        selectedJobOrder,
        setSelectedJobOrderId,
        workCenters,
        branches,
        stats,
        loading,
        searchQuery,
        setSearchQuery,
        selectedBranchId,
        setSelectedBranchId,
        selectedStatusFilter,
        setSelectedStatusFilter,
        onlyShortages,
        setOnlyShortages,
        // Modal states
        isTransferModalOpen,
        activeTransferItem,
        transferring,
        handleOpenTransferModal,
        handleCloseTransferModal,
        handlePerformTransfer,
        handleStageAllAvailable,
        // Shortage dialog states
        isShortageDialogOpen,
        setIsShortageDialogOpen,
        shortageWarningInfo,
        handleProceedWithNegativeStock,
        refreshData
    } = useMaterialStaging();

    return (
        <div className="flex flex-col space-y-6 max-w-[1600px] mx-auto p-1 sm:p-2">
            {/* Header Toolbar */}
            <div className="relative overflow-hidden bg-gradient-to-br from-card via-card to-muted/30 p-6 rounded-2xl border shadow-sm transition-all duration-300">
                <div className="absolute -right-16 -top-16 w-36 h-36 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

                <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center relative z-10">
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2.5">
                            <div className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                            </div>
                            <span className="text-xs font-semibold tracking-wider uppercase text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                                Inventory & Shop Floor Staging
                            </span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                            Material Staging & Floor Holds
                        </h1>
                        <p className="text-sm text-muted-foreground max-w-2xl">
                            Stage raw materials and sub-assemblies from Main Store to Work Center floor bins, convert soft reservations to hard readiness holds, and enforce shortage gates.
                        </p>
                    </div>

                    <div className="flex gap-2 w-full md:w-auto shrink-0">
                        <Button
                            variant="outline"
                            size="default"
                            onClick={() => refreshData(true)}
                            disabled={loading}
                            className="text-xs h-10 shadow-sm"
                        >
                            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                            Refresh Inventory
                        </Button>
                    </div>
                </div>
            </div>

            {/* KPI Metric Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex items-center gap-3.5">
                    <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20 shrink-0">
                        <Clock className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="text-xs font-medium text-muted-foreground">Active Staging JOs</div>
                        <div className="text-xl sm:text-2xl font-extrabold text-foreground font-mono">
                            {stats.totalActiveJobs}
                        </div>
                    </div>
                </div>

                <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex items-center gap-3.5">
                    <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0">
                        <PackageCheck className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="text-xs font-medium text-muted-foreground">Floor Ready (HARD)</div>
                        <div className="text-xl sm:text-2xl font-extrabold text-emerald-500 font-mono">
                            {stats.fullyStagedJobs}
                        </div>
                    </div>
                </div>

                <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex items-center gap-3.5">
                    <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0">
                        <Boxes className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="text-xs font-medium text-muted-foreground">Pending Staging (SOFT)</div>
                        <div className="text-xl sm:text-2xl font-extrabold text-amber-500 font-mono">
                            {stats.pendingStagingJobs}
                        </div>
                    </div>
                </div>

                <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex items-center gap-3.5">
                    <div className="p-3 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 shrink-0">
                        <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="text-xs font-medium text-muted-foreground">Floor Holds / Shortages</div>
                        <div className="text-xl sm:text-2xl font-extrabold text-red-500 font-mono">
                            {stats.shortageAlertJobs}
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters Toolbar */}
            <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between bg-card p-4 rounded-xl border border-border shadow-sm">
                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center flex-1">
                    {/* Search bar */}
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search JO #, Product Name, SKU, Work Center..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 text-xs h-9 bg-background"
                        />
                    </div>

                    {/* Status Filter */}
                    <div className="w-full sm:w-[220px]">
                        <Select
                            value={selectedStatusFilter}
                            onValueChange={setSelectedStatusFilter}
                        >
                            <SelectTrigger className="h-9 text-xs bg-background">
                                <SelectValue placeholder="Filter by Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="PLANNED_RESERVED" className="text-xs font-medium">
                                    Planned & Reserved (Default)
                                </SelectItem>
                                <SelectItem value="PLANNED" className="text-xs">
                                    Planned Only
                                </SelectItem>
                                <SelectItem value="RESERVED" className="text-xs">
                                    Reserved Only
                                </SelectItem>
                                <SelectItem value="RELEASED" className="text-xs">
                                    Released / Proceed
                                </SelectItem>
                                <SelectItem value="all" className="text-xs">
                                    All Statuses
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Branch Filter */}
                    <div className="w-full sm:w-[180px]">
                        <Select
                            value={selectedBranchId}
                            onValueChange={setSelectedBranchId}
                        >
                            <SelectTrigger className="h-9 text-xs bg-background">
                                <Building2 className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                                <SelectValue placeholder="All Branches" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all" className="text-xs">
                                    All Branches
                                </SelectItem>
                                {branches.map((b) => (
                                    <SelectItem key={b.id} value={String(b.id)} className="text-xs">
                                        {b.branchName}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Shortage Filter Toggle */}
                <Button
                    variant={onlyShortages ? "destructive" : "outline"}
                    size="sm"
                    onClick={() => setOnlyShortages(!onlyShortages)}
                    className="text-xs h-9 shrink-0 gap-1.5"
                >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {onlyShortages ? "Showing Holds Only" : "Show Holds / Shortages Only"}
                </Button>
            </div>

            {/* Main Interactive Dual-Panel Area */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Panel: Job Orders Queue */}
                <div className="lg:col-span-5 flex flex-col space-y-3">
                    <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            Active Job Orders ({filteredJobOrders.length})
                        </span>
                        <span className="text-xs text-muted-foreground">
                            Click to select for staging
                        </span>
                    </div>

                    {loading ? (
                        <div className="space-y-3">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="h-28 bg-muted/40 rounded-xl animate-pulse border border-border/50" />
                            ))}
                        </div>
                    ) : filteredJobOrders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center bg-card rounded-xl border border-dashed border-border text-muted-foreground min-h-[260px]">
                            <Boxes className="h-8 w-8 mb-2 opacity-50" />
                            <p className="text-sm font-semibold text-foreground">No matching Job Orders</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Adjust your search or status filter to view active manufacturing orders.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-[750px] overflow-y-auto pr-1">
                            {filteredJobOrders.map((jo) => {
                                const isSelected = selectedJobOrder?.job_order_id === jo.job_order_id;
                                const isHard = jo.reservation_status === "HARD";
                                const isPartial = jo.reservation_status === "PARTIAL";

                                return (
                                    <div
                                        key={jo.job_order_id}
                                        onClick={() => setSelectedJobOrderId(jo.job_order_id)}
                                        className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 text-left space-y-3 ${
                                            isSelected
                                                ? "bg-primary/[0.04] border-primary ring-1 ring-primary/20 shadow-sm"
                                                : "bg-card border-border hover:border-border/80 hover:bg-muted/30"
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="space-y-0.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-xs text-primary">
                                                        {jo.job_order_no}
                                                    </span>
                                                    <Badge
                                                        variant="outline"
                                                        className={
                                                            jo.status === "RESERVED"
                                                                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]"
                                                                : "bg-blue-500/10 text-blue-500 border-blue-500/30 text-[10px]"
                                                        }
                                                    >
                                                        {jo.status}
                                                    </Badge>
                                                </div>
                                                <div className="font-bold text-sm text-foreground line-clamp-1">
                                                    {jo.product_name}
                                                </div>
                                            </div>

                                            {/* Reservation Badge */}
                                            {isHard ? (
                                                <Badge className="bg-emerald-600 text-white text-[10px] shrink-0 font-medium">
                                                    <Lock className="h-2.5 w-2.5 mr-1" />
                                                    HARD (READY)
                                                </Badge>
                                            ) : isPartial ? (
                                                <Badge variant="secondary" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] shrink-0">
                                                    PARTIAL
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary" className="bg-muted text-muted-foreground text-[10px] shrink-0">
                                                    <Unlock className="h-2.5 w-2.5 mr-1" />
                                                    SOFT HOLD
                                                </Badge>
                                            )}
                                        </div>

                                        {/* Meta & Destination */}
                                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
                                            <div>
                                                Target: <strong className="text-foreground">{jo.target_quantity.toLocaleString()} pcs</strong>
                                            </div>
                                            <div className="flex items-center gap-1 font-mono text-[11px]">
                                                <Warehouse className="h-3 w-3 text-muted-foreground" />
                                                <span className="text-emerald-600 dark:text-emerald-400 font-medium">{jo.suggested_staging_bin}</span>
                                            </div>
                                        </div>

                                        {/* Progress Bar & Shortage Tag */}
                                        <div className="space-y-1">
                                            <div className="flex justify-between items-center text-[11px]">
                                                <span className="text-muted-foreground">
                                                    Staging: {jo.staged_materials_count}/{jo.total_materials_count} components
                                                </span>
                                                <span className="font-mono font-bold text-primary">{jo.staging_percentage}%</span>
                                            </div>
                                            <Progress value={jo.staging_percentage} className="h-1.5 bg-muted" />
                                        </div>

                                        {jo.has_shortage && (
                                            <div className="flex items-center gap-1.5 text-[11px] text-red-500 font-medium bg-red-500/10 px-2 py-1 rounded-md border border-red-500/20">
                                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                                Material shortage detected in Main Store
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Right Panel: Detailed Staging Pick List & Workspace */}
                <div className="lg:col-span-7">
                    <StagingPickList
                        jobOrder={selectedJobOrder}
                        onOpenTransferModal={handleOpenTransferModal}
                        onStageAllAvailable={handleStageAllAvailable}
                        isProcessing={transferring}
                    />
                </div>
            </div>

            {/* Bin Transfer Modal */}
            <BinTransferModal
                isOpen={isTransferModalOpen}
                onClose={handleCloseTransferModal}
                activeItem={activeTransferItem}
                workCenters={workCenters}
                onConfirmTransfer={handlePerformTransfer}
                isLoading={transferring}
            />

            {/* Shortage Warning Dialog (Option A / Option B) */}
            <ShortageWarningDialog
                isOpen={isShortageDialogOpen}
                onClose={() => {
                    setIsShortageDialogOpen(false);
                }}
                warningInfo={shortageWarningInfo}
                onProceedWithNegative={handleProceedWithNegativeStock}
                isLoading={transferring}
            />
        </div>
    );
}
