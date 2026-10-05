"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Factory, RefreshCw, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMachineDowntimeReport } from "./hooks/useMachineDowntimeReport";
import { MaintenanceEpisodeDialog } from "./components/MaintenanceEpisodeDialog";
import { MachineDowntimeTable } from "./components/MachineDowntimeTable";
import type { AssetHaltedJobOrder, MachineAssetReport, RouteStepUsage } from "./types";

const MACHINE_PAGE_SIZE = 10;
const EMPTY_ASSETS: MachineAssetReport[] = [];

type MachineConditionFilter = "All" | "Under Maintenance" | "Good";
type JobOrderEventFilter = "All" | "Termination" | "Cancellation";

export default function MachineDowntimeReportModule() {
    const reportState = useMachineDowntimeReport();
    const [dialogAssetId, setDialogAssetId] = useState<number | null>(null);
    const [dialogSource, setDialogSource] = useState<{ jobOrder: AssetHaltedJobOrder; routeStep: RouteStepUsage } | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [conditionFilter, setConditionFilter] = useState<MachineConditionFilter>("All");
    const [eventFilter, setEventFilter] = useState<JobOrderEventFilter>("All");
    const [currentPage, setCurrentPage] = useState(1);

    const asset = useMemo(
        () => reportState.report?.assets.find((row) => row.assetId === dialogAssetId) ?? null,
        [dialogAssetId, reportState.report]
    );
    const assets = reportState.report?.assets ?? EMPTY_ASSETS;
    const filteredAssets = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();

        return assets.reduce<MachineAssetReport[]>((matches, asset) => {
            if (conditionFilter !== "All" && asset.condition !== conditionFilter) return matches;

            const eventFilteredJobs = asset.haltedJobOrders.filter(
                (jobOrder) => eventFilter === "All" || jobOrder.eventType === eventFilter
            );
            if (eventFilter !== "All" && eventFilteredJobs.length === 0) return matches;

            const assetMatches = !query || [asset.assetName, String(asset.assetId)]
                .some((value) => value.toLowerCase().includes(query));
            let visibleJobs = eventFilteredJobs;

            if (query && !assetMatches) {
                visibleJobs = eventFilteredJobs.filter((jobOrder) => {
                    const searchableValues = [
                        jobOrder.jobOrderNo,
                        jobOrder.reason ?? "",
                        ...jobOrder.routeSteps.map((routeStep) => routeStep.workCenterName)
                    ];
                    return searchableValues.some((value) => value.toLowerCase().includes(query));
                });
                if (visibleJobs.length === 0) return matches;
            }

            matches.push({ ...asset, haltedJobOrders: visibleJobs });
            return matches;
        }, []);
    }, [assets, conditionFilter, eventFilter, searchQuery]);
    const underMaintenanceCount = filteredAssets.filter((row) => row.condition === "Under Maintenance").length;
    const goodAssetCount = filteredAssets.filter((row) => row.condition === "Good").length;
    const trackedEpisodeCount = filteredAssets.reduce((total, row) => total + row.trackedEpisodeCount, 0);
    const totalPages = Math.ceil(filteredAssets.length / MACHINE_PAGE_SIZE);
    const displayedPage = totalPages === 0 ? 0 : Math.min(currentPage, totalPages);
    const startIndex = displayedPage === 0 ? 0 : (displayedPage - 1) * MACHINE_PAGE_SIZE;
    const paginatedAssets = filteredAssets.slice(startIndex, startIndex + MACHINE_PAGE_SIZE);

    const updateSearchQuery = (value: string) => {
        setSearchQuery(value);
        setCurrentPage(1);
    };
    const updateConditionFilter = (value: MachineConditionFilter) => {
        setConditionFilter(value);
        setCurrentPage(1);
    };
    const updateEventFilter = (value: JobOrderEventFilter) => {
        setEventFilter(value);
        setCurrentPage(1);
    };
    const resetFilters = () => {
        setSearchQuery("");
        setConditionFilter("All");
        setEventFilter("All");
        setCurrentPage(1);
    };

    const openHistory = (assetId: number) => {
        setDialogAssetId(assetId);
        setDialogSource(null);
    };
    const startFromJobOrder = (assetId: number, jobOrder: AssetHaltedJobOrder, routeStep: RouteStepUsage) => {
        setDialogAssetId(assetId);
        setDialogSource({ jobOrder, routeStep });
    };
    const closeDialog = () => {
        setDialogAssetId(null);
        setDialogSource(null);
    };

    const handleStart = async (input: { assetId: number; jobOrderId: number; routeId: number }) => {
        try {
            await reportState.startEpisode({ action: "start", ...input });
            toast.success("Maintenance episode started.");
            closeDialog();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to start the maintenance episode.");
        }
    };
    const handleClose = async (input: { assetId: number; restoredCondition: "Good" | "Bad" | "Discontinued"; resolutionNotes?: string }) => {
        try {
            await reportState.closeEpisode({ action: "close", ...input });
            toast.success("Maintenance episode closed.");
            closeDialog();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to close the maintenance episode.");
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-xl font-extrabold tracking-tight">Machine Downtime Report</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Production machines and terminated or cancelled Job Orders from route steps marked Ongoing or Completed.
                    </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void reportState.refresh()} disabled={reportState.refreshing}>
                    <RefreshCw className={"mr-2 h-4 w-4" + (reportState.refreshing ? " animate-spin" : "")} />
                    Refresh
                </Button>
            </div>

            {reportState.error && (
                <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{reportState.error}</span>
                </div>
            )}

            {reportState.loading && !reportState.report ? (
                <div className="grid gap-3 sm:grid-cols-3">
                    <Skeleton className="h-24" />
                    <Skeleton className="h-24" />
                    <Skeleton className="h-24" />
                </div>
            ) : reportState.report ? (
                <>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-lg border bg-card p-4">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Factory className="h-4 w-4" />Production machines</div>
                            <div className="mt-2 text-2xl font-bold">{filteredAssets.length}</div>
                        </div>
                        <div className="rounded-lg border bg-card p-4">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Wrench className="h-4 w-4" />Under maintenance</div>
                            <div className="mt-2 flex items-center gap-2">
                                <span className="text-2xl font-bold">{underMaintenanceCount}</span>
                                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">Current condition</Badge>
                            </div>
                        </div>
                        <div className="rounded-lg border bg-card p-4">
                            <div className="text-xs text-muted-foreground">Good machines · tracked episodes</div>
                            <div className="mt-2 text-2xl font-bold">{goodAssetCount} · {trackedEpisodeCount}</div>
                        </div>
                    </div>

                    <MachineDowntimeTable
                        assets={paginatedAssets}
                        totalAssets={filteredAssets.length}
                        totalAvailableAssets={assets.length}
                        searchQuery={searchQuery}
                        conditionFilter={conditionFilter}
                        eventFilter={eventFilter}
                        currentPage={displayedPage}
                        totalPages={totalPages}
                        startIndex={startIndex}
                        pageSize={MACHINE_PAGE_SIZE}
                        onSearchQueryChange={updateSearchQuery}
                        onConditionFilterChange={updateConditionFilter}
                        onEventFilterChange={updateEventFilter}
                        onResetFilters={resetFilters}
                        onPageChange={setCurrentPage}
                        onOpenHistory={openHistory}
                        onStartMaintenance={startFromJobOrder}
                    />
                </>
            ) : null}

            <MaintenanceEpisodeDialog
                open={dialogAssetId !== null}
                asset={asset}
                source={dialogSource}
                saving={reportState.saving}
                onOpenChange={(open) => {
                    if (!open) closeDialog();
                }}
                onStart={handleStart}
                onClose={handleClose}
            />
        </div>
    );
}
