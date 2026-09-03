"use client";

import * as React from "react";
import { AlertCircle, CheckCheck, Loader2, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { ApproveDialog } from "./ApproveDialog";
import { BulkListCostActionResultDialog } from "./BulkListCostActionResultDialog";
import { BulkListCostApprovePreview } from "./BulkListCostApprovePreview";
import { BulkPriceTypeActionResultDialog } from "./BulkPriceTypeActionResultDialog";
import { BulkPriceTypeApprovePreview } from "./BulkPriceTypeApprovePreview";
import { CreatePriceChangeBatchDialog } from "./CreatePriceChangeBatchDialog";
import { PcrStatusTabs } from "./PcrStatusTabs";
import { PcrTabExportImportActions } from "./PcrTabExportImportActions";
import { ListPriceRequestDetailDialog } from "./ListPriceRequestDetailDialog";
import { ListCostBatchDetailDialog } from "./ListCostBatchDetailDialog";
import { PriceChangeBatchDetailDialog } from "./PriceChangeBatchDetailDialog";
import { UnifiedBatchDetailDialog } from "./UnifiedBatchDetailDialog";
import { PriceTypeRequestDetailDialog } from "./PriceTypeRequestDetailDialog";
import { RejectDialog } from "./RejectDialog";
import { RequestFiltersBar } from "./RequestFiltersBar";
import RequestsTable from "./RequestsTable";

import { useRequestBulkSelection } from "../hooks/useRequestBulkSelection";
import { usePCRActions } from "../hooks/usePCRActions";
import { usePriceTypeSupplierExportImport } from "../hooks/usePriceTypeSupplierExportImport";
import { SupplierPrintEditorModals } from "../../shared/print/SupplierPrintEditorModals";
import { useSupplierPrintEditor } from "../../shared/print/useSupplierPrintEditor";
import { ExcelExportOptionsDialog } from "../../shared/supplier-batch/ExcelExportOptionsDialog";
import { pcrApproveButtonClass, pcrRejectButtonClass } from "../utils/pcrStatusStyles";
import { useUnifiedApprovals } from "../hooks/useUnifiedApprovals";
import { isUnauthorizedError } from "../../shared/apiHttp";
import type { SupplierOption, ProductTypeOption } from "../providers/pcrApi";
import { applyBulkActionResult, type BulkActionOutcome } from "../utils/applyBulkActionResult";
import {
    approveManyPriceRequestsHybrid,
    orphanPriceSnapshotCount,
    rejectManyPriceRequestsHybrid,
    uniqueBatchCount,
} from "../utils/bulkPriceTypeBatchActions";
import { snapshotFromPriceApprovalRow, snapshotFromUnifiedRow } from "../utils/labels";
import type {
    CostChangeRequestRow,
    ApprovalRecordRow,
    ListQuery,
    PCRStatusFilter,
    PriceChangeRequestRow,
    PriceTypeSelectionSnapshot,
    UnifiedApprovalRow,
} from "../types";

type Props = {
    suppliers: SupplierOption[];
    suppliersLoading?: boolean;
    suppliersError?: string | null;
    productTypes: ProductTypeOption[];
    productTypesLoading?: boolean;
    productTypesError?: string | null;
    query: ListQuery;
    setQuery: React.Dispatch<React.SetStateAction<ListQuery>>;
    onUnauthorized?: () => void;
    active?: boolean;
    readOnly?: boolean;
};

function resolveUnifiedSelectionKey(row: UnifiedApprovalRow): string {
    return row.row_key;
}

export function UnifiedApprovalsManager({
    suppliers,
    suppliersLoading,
    suppliersError,
    productTypes,
    productTypesLoading,
    productTypesError,
    query,
    setQuery,
    onUnauthorized,
    active = true,
    readOnly = false,
}: Props) {
    const feed = useUnifiedApprovals(query, setQuery, { enabled: active });
    const statusTab: PCRStatusFilter = feed.query.status || "ALL";

    const { openSupplierPrint, modalsProps: printModalsProps } = useSupplierPrintEditor();
    const priceExportImport = usePriceTypeSupplierExportImport({
        supplierIds: query.supplier_ids,
        suppliers,
        includeListCost: true,
        onOpenPrintEditor: openSupplierPrint,
    });
    const [viewingBatchHeaderId, setViewingBatchHeaderId] = React.useState<number | null>(null);
    const [viewingCostBatchHeaderId, setViewingCostBatchHeaderId] = React.useState<number | null>(null);
    const [viewingMixedBatchHeaderId, setViewingMixedBatchHeaderId] = React.useState<number | null>(null);
    const [viewingCostRequestId, setViewingCostRequestId] = React.useState<number | null>(null);
    const [viewingPriceRequestId, setViewingPriceRequestId] = React.useState<number | null>(null);
    const [rejectingCostId, setRejectingCostId] = React.useState<number | null>(null);
    const [rejectingBulkCost, setRejectingBulkCost] = React.useState(false);
    const [rejectingBulkPrice, setRejectingBulkPrice] = React.useState(false);
    const [confirmingCostApprove, setConfirmingCostApprove] = React.useState<
        { type: "single"; id: number } | { type: "batch" } | null
    >(null);
    const [confirmingBulkPriceApprove, setConfirmingBulkPriceApprove] = React.useState(false);
    const [confirmingPriceBatchHeaderId, setConfirmingPriceBatchHeaderId] = React.useState<number | null>(null);
    const [rejectingPriceBatchHeaderId, setRejectingPriceBatchHeaderId] = React.useState<number | null>(null);
    const [confirmingMixedBatchHeaderId, setConfirmingMixedBatchHeaderId] = React.useState<number | null>(null);
    const [rejectingMixedBatchHeaderId, setRejectingMixedBatchHeaderId] = React.useState<number | null>(null);
    const [confirmingOrphanPriceApproveId, setConfirmingOrphanPriceApproveId] = React.useState<number | null>(null);
    const [rejectingOrphanPriceId, setRejectingOrphanPriceId] = React.useState<number | null>(null);
    const [bulkCostActionOutcome, setBulkCostActionOutcome] = React.useState<BulkActionOutcome | null>(null);
    const [bulkPriceActionOutcome, setBulkPriceActionOutcome] =
        React.useState<BulkActionOutcome<PriceTypeSelectionSnapshot> | null>(null);

    const {
        selectedKeys: selectedCostKeys,
        selectedIds: selectedCostIds,
        selectedSnapshots: selectedCostSnapshots,
        offPageSelectedCount: offPageSelectedCostCount,
        toggleSelect: toggleCostSelect,
        toggleSelectAllPage: toggleSelectAllPendingCost,
        clearSelection: clearCostSelection,
        removeSelectionIds: removeCostSelectionIds,
    } = useRequestBulkSelection({
        rows: feed.rows,
        isSelectable: (row) => row.kind === "list_price" && row.status === "PENDING" && Boolean(row.request_id),
        toSnapshot: (row) => snapshotFromUnifiedRow(row as Extract<UnifiedApprovalRow, { kind: "list_price" }>),
        getRowKey: resolveUnifiedSelectionKey,
    });

    const {
        selectedKeys: selectedPriceKeys,
        selectedIds: selectedPriceIds,
        selectedSnapshots: selectedPriceSnapshots,
        offPageSelectedCount: offPageSelectedPriceCount,
        clearSelection: clearPriceSelection,
        removeSelectionIds: removePriceSelectionIds,
    } = useRequestBulkSelection({
        rows: feed.rows,
        isSelectable: () => false,
        toSnapshot: (row) => snapshotFromPriceApprovalRow(row),
        getRowKey: resolveUnifiedSelectionKey,
    });

    const clearAllSelections = React.useCallback(() => {
        clearCostSelection();
        clearPriceSelection();
        setBulkCostActionOutcome(null);
        setBulkPriceActionOutcome(null);
    }, [clearCostSelection, clearPriceSelection]);

    const costActions = usePCRActions(() => {
        void feed.refresh();
    }, onUnauthorized);

    const viewingCostRequest = React.useMemo(
        () =>
            feed.rows.find(
                (row) => row.kind === "list_price" && Number(row.request_id) === viewingCostRequestId,
            ) ?? null,
        [feed.rows, viewingCostRequestId],
    );

    const viewingPriceRequest = React.useMemo(() => {
        if (viewingPriceRequestId == null) return null;
        const row = feed.rows.find(
            (item) => item.kind === "price_type" && Number(item.request_id) === viewingPriceRequestId,
        );
        return row && row.kind === "price_type" ? row : null;
    }, [feed.rows, viewingPriceRequestId]);

    const showBulkBar = false;
    const hasCostSelection = selectedCostIds.length > 0;
    const hasPriceSelection = selectedPriceIds.length > 0;
    const isMixedSelection = hasCostSelection && hasPriceSelection;
    const hasAnySelection = hasCostSelection || hasPriceSelection;
    const selectedBatchCount = uniqueBatchCount(selectedPriceSnapshots);
    const selectedOrphanPriceCount = orphanPriceSnapshotCount(selectedPriceSnapshots);
    const mergedSelectedKeys = React.useMemo(
        () => [...selectedCostKeys, ...selectedPriceKeys],
        [selectedCostKeys, selectedPriceKeys],
    );

    const handleConfirmCostApprove = React.useCallback(async (effectiveAt?: string | null) => {
        if (!confirmingCostApprove) return;

        if (confirmingCostApprove.type === "single") {
            await costActions.approve(confirmingCostApprove.id, effectiveAt);
            setConfirmingCostApprove(null);
            return;
        }

        if (selectedCostIds.length === 0) return;

        const result = await costActions.approveMany(selectedCostIds, effectiveAt);
        applyBulkActionResult(
            result,
            selectedCostSnapshots,
            removeCostSelectionIds,
            setBulkCostActionOutcome,
        );
        setConfirmingCostApprove(null);
    }, [confirmingCostApprove, costActions, selectedCostIds, selectedCostSnapshots, removeCostSelectionIds]);

    const handleConfirmBulkPriceApprove = React.useCallback(async (effectiveAt?: string | null) => {
        if (selectedPriceSnapshots.length === 0) return;
        try {
            const result = await approveManyPriceRequestsHybrid(
                selectedPriceSnapshots,
                feed.approveBatch,
                feed.approvePriceRequest,
                effectiveAt,
            );
            applyBulkActionResult(
                result,
                selectedPriceSnapshots,
                removePriceSelectionIds,
                setBulkPriceActionOutcome,
            );
        } catch (error: unknown) {
            if (isUnauthorizedError(error)) {
                onUnauthorized?.();
                return;
            }
            throw error;
        }
        setConfirmingBulkPriceApprove(false);
    }, [
        feed.approveBatch,
        feed.approvePriceRequest,
        onUnauthorized,
        removePriceSelectionIds,
        selectedPriceSnapshots,
    ]);

    const clearViewingState = React.useCallback(() => {
        setViewingBatchHeaderId(null);
        setViewingCostBatchHeaderId(null);
        setViewingMixedBatchHeaderId(null);
        setViewingCostRequestId(null);
        setViewingPriceRequestId(null);
    }, []);

    const openRequestReview = React.useCallback((row: ApprovalRecordRow) => {
        if (!("kind" in row)) return;

        clearViewingState();
        if (row.kind === "price_batch") {
            setViewingBatchHeaderId(Number(row.batch_id ?? row.request_id));
            return;
        }
        if (row.kind === "cost_batch") {
            setViewingCostBatchHeaderId(Number(row.batch_id ?? row.request_id));
            return;
        }
        if (row.kind === "mixed_batch") {
            setViewingMixedBatchHeaderId(Number(row.batch_id ?? row.request_id));
            return;
        }
        if (row.kind === "list_price") {
            setViewingCostRequestId(Number(row.request_id));
            return;
        }
        setViewingPriceRequestId(Number(row.request_id));
    }, [clearViewingState]);

    const handleTableApprove = React.useCallback(
        (row: ApprovalRecordRow) => {
            if (!("kind" in row)) return;
            const id = Number(row.request_id);
            if (row.kind === "list_price") {
                setConfirmingCostApprove({ type: "single", id });
                return;
            }
            if (row.kind === "price_batch") {
                setConfirmingPriceBatchHeaderId(Number(row.batch_id ?? row.request_id));
                return;
            }
            if (row.kind === "mixed_batch") {
                setConfirmingMixedBatchHeaderId(Number(row.batch_id ?? row.request_id));
                return;
            }
            if (row.kind === "cost_batch") {
                setViewingCostBatchHeaderId(Number(row.batch_id ?? row.request_id));
                return;
            }
            if (row.kind === "price_type") {
                if (row.batch_header_id) {
                    setConfirmingPriceBatchHeaderId(row.batch_header_id);
                } else {
                    setConfirmingOrphanPriceApproveId(id);
                }
            }
        },
        [],
    );

    const handleTableReject = React.useCallback(
        (row: ApprovalRecordRow) => {
            if (!("kind" in row)) return;
            const id = Number(row.request_id);
            if (row.kind === "list_price") {
                setRejectingCostId(id);
                return;
            }
            if (row.kind === "price_batch") {
                setRejectingPriceBatchHeaderId(Number(row.batch_id ?? row.request_id));
                return;
            }
            if (row.kind === "mixed_batch") {
                setRejectingMixedBatchHeaderId(Number(row.batch_id ?? row.request_id));
                return;
            }
            if (row.kind === "cost_batch") {
                setViewingCostBatchHeaderId(Number(row.batch_id ?? row.request_id));
                return;
            }
            if (row.kind === "price_type") {
                if (row.batch_header_id) {
                    setRejectingPriceBatchHeaderId(row.batch_header_id);
                } else {
                    setRejectingOrphanPriceId(id);
                }
            }
        },
        [],
    );

    const canSelectUnifiedRow = React.useCallback((row: PriceChangeRequestRow | CostChangeRequestRow | UnifiedApprovalRow) => {
        const unified = row as UnifiedApprovalRow;
        if (unified.kind === "list_price") return unified.status === "PENDING";
        return false;
    }, []);

    const canActOnRow = React.useCallback((row: UnifiedApprovalRow) => {
        if (row.kind === "list_price") return true;
        return row.status === "PENDING";
    }, []);

    const getUnifiedSelectionKey = React.useCallback(
        (row: PriceChangeRequestRow | CostChangeRequestRow | UnifiedApprovalRow) =>
            (row as UnifiedApprovalRow).row_key,
        [],
    );

    const handleToggleSelect = React.useCallback(
        (key: string, checked: boolean, row?: UnifiedApprovalRow) => {
            const unified = row as UnifiedApprovalRow | undefined;
            if (unified?.kind === "list_price") {
                toggleCostSelect(key, checked, unified);
            }
        },
        [toggleCostSelect],
    );

    const handleToggleSelectAllPage = React.useCallback(
        (checked: boolean) => {
            toggleSelectAllPendingCost(checked);
        },
        [toggleSelectAllPendingCost],
    );

    const handleRejectSelectedCost = React.useCallback(
        async (reason: string) => {
            if (selectedCostIds.length === 0) return;
            const result = await costActions.rejectMany(selectedCostIds, reason);
            applyBulkActionResult(
                result,
                selectedCostSnapshots,
                removeCostSelectionIds,
                setBulkCostActionOutcome,
            );
        },
        [costActions, selectedCostIds, selectedCostSnapshots, removeCostSelectionIds],
    );

    const handleRejectSelectedPrice = React.useCallback(
        async (reason: string) => {
            if (selectedPriceSnapshots.length === 0) return;
            try {
                const result = await rejectManyPriceRequestsHybrid(
                    selectedPriceSnapshots,
                    reason,
                    feed.rejectBatch,
                    feed.rejectPriceRequest,
                );
                applyBulkActionResult(
                    result,
                    selectedPriceSnapshots,
                    removePriceSelectionIds,
                    setBulkPriceActionOutcome,
                );
            } catch (error: unknown) {
                if (isUnauthorizedError(error)) {
                    onUnauthorized?.();
                    return;
                }
                throw error;
            }
        },
        [feed.rejectBatch, feed.rejectPriceRequest, onUnauthorized, removePriceSelectionIds, selectedPriceSnapshots],
    );

    const handleBulkReject = React.useCallback(() => {
        if (hasPriceSelection) {
            setRejectingBulkPrice(true);
            return;
        }
        setRejectingBulkCost(true);
    }, [hasPriceSelection]);

    const handleBulkApprove = React.useCallback(() => {
        if (hasPriceSelection) {
            setConfirmingBulkPriceApprove(true);
            return;
        }
        setConfirmingCostApprove({ type: "batch" });
    }, [hasPriceSelection]);

    const acting = feed.acting || costActions.acting;

    React.useEffect(() => {
        if (feed.unauthorized) onUnauthorized?.();
    }, [feed.unauthorized, onUnauthorized]);

    return (
        <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <PcrStatusTabs
                    value={statusTab}
                    onValueChange={(status) => {
                        clearAllSelections();
                        feed.setQuery((q) => ({ ...q, status, page: 1 }));
                    }}
                />

                <PcrTabExportImportActions
                    mode="price"
                    busy={priceExportImport.busy}
                    onExportPdf={() => void priceExportImport.handleExportPdf()}
                    onExportExcel={() => void priceExportImport.handleExportExcel()}
                    onImportExcelClick={priceExportImport.handleImportExcelClick}
                    onImportExcelFile={priceExportImport.handleImportExcelFile}
                    importFileInputRef={priceExportImport.importFileInputRef}
                    exportOnly={readOnly}
                    showNewBatch={!readOnly}
                    onNewBatch={() => priceExportImport.setCreatingBatch(true)}
                />
            </div>

            <div className="space-y-3">
                <RequestFiltersBar
                    query={feed.query}
                    setQuery={(updater) => {
                        clearAllSelections();
                        feed.setQuery(updater);
                    }}
                    suppliers={suppliers}
                    suppliersLoading={suppliersLoading}
                    suppliersError={suppliersError}
                    productTypes={productTypes}
                    productTypesLoading={productTypesLoading}
                    productTypesError={productTypesError}
                    loading={feed.loading}
                    total={feed.total}
                    totalLabel="records"
                    searchLabel="Search records"
                    searchPlaceholder="PCB-123, CCR-456, product, barcode, reference, or remarks"
                    searchHelper="Search by PCB-/CCR- number, product, barcode, reference, or remarks."
                    filterContext="all"
                    onRefresh={() => {
                        clearAllSelections();
                        void feed.refresh();
                    }}
                    onReset={clearAllSelections}
                />

                {feed.error ? (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Approval records could not be loaded</AlertTitle>
                        <AlertDescription className="space-y-3">
                            <p>{feed.error}</p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void feed.refresh()}
                                disabled={feed.loading}
                            >
                                {feed.loading ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : null}
                                Retry
                            </Button>
                        </AlertDescription>
                    </Alert>
                ) : null}

                {showBulkBar ? (
                    <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-muted-foreground">
                            {hasAnySelection ? (
                                <div className="flex flex-col gap-0.5">
                                    {hasCostSelection ? (
                                        <span>
                                            <span className="font-medium text-foreground">{selectedCostIds.length}</span>{" "}
                                            list cost request(s) selected
                                        </span>
                                    ) : null}
                                    {hasPriceSelection ? (
                                        <span>
                                            <span className="font-medium text-foreground">{selectedPriceIds.length}</span>{" "}
                                            price type request(s) selected
                                            {selectedBatchCount > 0 ? (
                                                <span> across {selectedBatchCount} batch(es)</span>
                                            ) : null}
                                        </span>
                                    ) : null}
                                    {isMixedSelection ? (
                                        <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                                            Select only list cost or only price type requests to bulk approve/reject.
                                        </span>
                                    ) : null}
                                    {(offPageSelectedCostCount > 0 || offPageSelectedPriceCount > 0) ? (
                                        <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                                            Includes {offPageSelectedCostCount + offPageSelectedPriceCount} on other pages.
                                        </span>
                                    ) : null}
                                    {bulkCostActionOutcome && bulkCostActionOutcome.result.failedIds.length > 0 ? (
                                        <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                                            {bulkCostActionOutcome.result.failedIds.length} list cost request(s) could not
                                            be processed.
                                        </span>
                                    ) : null}
                                    {bulkPriceActionOutcome && bulkPriceActionOutcome.result.failedIds.length > 0 ? (
                                        <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                                            {bulkPriceActionOutcome.result.failedIds.length} price type request(s) could
                                            not be processed.
                                        </span>
                                    ) : null}
                                    <span className="text-xs text-muted-foreground">
                                        Select-all applies to pending rows on this page only.
                                    </span>
                                </div>
                            ) : (
                                "Select pending list cost requests to approve or reject in bulk."
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                variant="outline"
                                onClick={clearAllSelections}
                                disabled={acting || !hasAnySelection}
                            >
                                <X className="mr-2 h-4 w-4" />
                                Clear
                            </Button>

                            <Button
                                className={pcrApproveButtonClass}
                                onClick={handleBulkApprove}
                                disabled={acting || !hasAnySelection || isMixedSelection}
                            >
                                {acting ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <CheckCheck className="mr-2 h-4 w-4" />
                                )}
                                Approve Selected
                            </Button>

                            <Button
                                variant="outline"
                                className={pcrRejectButtonClass}
                                onClick={handleBulkReject}
                                disabled={acting || !hasAnySelection || isMixedSelection}
                            >
                                <X className="mr-2 h-4 w-4" />
                                Reject Selected
                            </Button>
                        </div>
                    </div>
                ) : null}

                <RequestsTable
                    rows={feed.rows}
                    mode="approver"
                    showSelectionColumn={showBulkBar}
                    requestType="mixed"
                    loading={feed.loading}
                    hasLoadError={Boolean(feed.error)}
                    acting={acting}
                    meta={{ total_count: feed.total }}
                    page={Number(feed.query.page ?? 1)}
                    pageSize={Number(feed.query.page_size ?? 50)}
                    onPageChange={(page) => feed.setQuery((q) => ({ ...q, page }))}
                    onPageSizeChange={(page_size) => feed.setQuery((q) => ({ ...q, page_size, page: 1 }))}
                    footerItemLabel="records"
                    selectedKeys={mergedSelectedKeys}
                    getSelectionKey={getUnifiedSelectionKey}
                    onReview={openRequestReview}
                    {...(readOnly
                        ? {}
                        : {
                              onReject: handleTableReject,
                              onApprove: handleTableApprove,
                              canApproveRow: (row) => canActOnRow(row as UnifiedApprovalRow),
                              canRejectRow: (row) => canActOnRow(row as UnifiedApprovalRow),
                          })}
                    canSelectRow={canSelectUnifiedRow}
                    canReviewRow={() => true}
                    onToggleSelect={(key, checked, row) =>
                        handleToggleSelect(key, checked, row as UnifiedApprovalRow | undefined)
                    }
                    onToggleSelectAllPage={handleToggleSelectAllPage}
                />
            </div>

            <ListPriceRequestDetailDialog
                row={viewingCostRequest}
                open={viewingCostRequestId != null}
                acting={acting}
                readOnly={readOnly}
                onOpenChange={(open) => {
                    if (!open) setViewingCostRequestId(null);
                }}
                {...(readOnly
                    ? {}
                    : {
                          onApprove: costActions.approve,
                          onReject: costActions.reject,
                          onApplyScheduledNow: costActions.applyScheduledNow,
                          onRejectScheduled: costActions.rejectScheduled,
                          onRetryApplication: costActions.retryApplication,
                      })}
            />

            <PriceChangeBatchDetailDialog
                batchId={viewingBatchHeaderId}
                open={viewingBatchHeaderId != null}
                acting={acting}
                readOnly={readOnly}
                onOpenChange={(open) => {
                    if (!open) setViewingBatchHeaderId(null);
                }}
                {...(readOnly
                    ? {}
                    : {
                          onApprove: feed.approveBatch,
                          onReject: feed.rejectBatch,
                          onApplyScheduledNow: (headerId: number) => feed.applyScheduledNow("price_batch", headerId),
                          onRejectScheduled: (headerId: number, reason: string) =>
                              feed.rejectScheduled("price_batch", headerId, reason),
                          onRetryApplication: (headerId: number) => feed.retryApplication("price_batch", headerId),
                      })}
            />

            <ListCostBatchDetailDialog
                batchId={viewingCostBatchHeaderId}
                open={viewingCostBatchHeaderId != null}
                acting={acting}
                readOnly={readOnly}
                onOpenChange={(open) => {
                    if (!open) setViewingCostBatchHeaderId(null);
                }}
                {...(readOnly
                    ? {}
                    : {
                          onApprove: feed.approveCostBatch,
                          onReject: feed.rejectCostBatch,
                          onApplyScheduledNow: (headerId: number) => feed.applyScheduledNow("cost_batch", headerId),
                          onRejectScheduled: (headerId: number, reason: string) =>
                              feed.rejectScheduled("cost_batch", headerId, reason),
                          onRetryApplication: (headerId: number) => feed.retryApplication("cost_batch", headerId),
                      })}
            />

            <UnifiedBatchDetailDialog
                batchId={viewingMixedBatchHeaderId}
                open={viewingMixedBatchHeaderId != null}
                acting={acting}
                readOnly={readOnly}
                onOpenChange={(open) => {
                    if (!open) setViewingMixedBatchHeaderId(null);
                }}
                {...(readOnly
                    ? {}
                    : {
                          onApprove: feed.approveMixedBatch,
                          onReject: feed.rejectMixedBatch,
                          onApplyScheduledNow: (headerId: number) => feed.applyScheduledNow("mixed_batch", headerId),
                          onRetryApplication: feed.retryMixedBatch,
                      })}
            />

            <PriceTypeRequestDetailDialog
                row={viewingPriceRequest}
                open={viewingPriceRequestId != null}
                acting={acting}
                readOnly={readOnly}
                onOpenChange={(open) => {
                    if (!open) setViewingPriceRequestId(null);
                }}
                {...(readOnly
                    ? {}
                    : {
                          onApproveBatch: feed.approveBatch,
                          onRejectBatch: feed.rejectBatch,
                          onApproveRequest: feed.approvePriceRequest,
                          onRejectRequest: feed.rejectPriceRequest,
                          onApplyScheduledNow: (kind, id) => feed.applyScheduledNow(kind, id),
                          onRejectScheduled: (kind, id, reason) => feed.rejectScheduled(kind, id, reason),
                          onRetryApplication: (kind, id) => feed.retryApplication(kind, id),
                      })}
            />

            {!readOnly ? (
            <CreatePriceChangeBatchDialog
                open={priceExportImport.creatingBatch}
                onOpenChange={(open) => {
                    priceExportImport.setCreatingBatch(open);
                    if (!open) priceExportImport.clearImportPrefill();
                }}

                onCreated={feed.refresh}
                importPrefill={priceExportImport.importPrefill}
            />
            ) : null}

            {!readOnly ? (
            <>
            <RejectDialog
                open={rejectingCostId != null || rejectingBulkCost}
                onOpenChange={(open) => {
                    if (!open) {
                        setRejectingCostId(null);
                        setRejectingBulkCost(false);
                    }
                }}
                loading={acting}
                contentClassName={rejectingBulkCost ? "sm:max-w-2xl" : undefined}
                title={rejectingBulkCost ? "Reject Selected Requests" : "Reject Request"}
                onConfirm={async (reason) => {
                    if (rejectingCostId != null) {
                        await costActions.reject(rejectingCostId, reason);
                        setRejectingCostId(null);
                    } else if (rejectingBulkCost) {
                        await handleRejectSelectedCost(reason);
                        setRejectingBulkCost(false);
                    }
                }}
            >
                {rejectingBulkCost ? (
                    <div className="mb-2 space-y-2">
                        {offPageSelectedCostCount > 0 ? (
                            <Alert>
                                <AlertDescription>
                                    This action includes {offPageSelectedCostCount} selected request(s) from other pages
                                    not visible in the table.
                                </AlertDescription>
                            </Alert>
                        ) : null}
                        <BulkListCostApprovePreview items={selectedCostSnapshots} />
                    </div>
                ) : null}
            </RejectDialog>

            <RejectDialog
                open={rejectingBulkPrice}
                onOpenChange={(open) => {
                    if (!open) setRejectingBulkPrice(false);
                }}
                loading={acting}
                contentClassName="sm:max-w-2xl"
                title="Reject Selected Price Type Requests"
                onConfirm={async (reason) => {
                    await handleRejectSelectedPrice(reason);
                    setRejectingBulkPrice(false);
                }}
            >
                <div className="mb-2 space-y-2">
                    {offPageSelectedPriceCount > 0 ? (
                        <Alert>
                            <AlertDescription>
                                This action includes {offPageSelectedPriceCount} selected request(s) from other pages
                                not visible in the table.
                            </AlertDescription>
                        </Alert>
                    ) : null}
                    <BulkPriceTypeApprovePreview items={selectedPriceSnapshots} />
                </div>
            </RejectDialog>

            <RejectDialog
                open={rejectingOrphanPriceId != null}
                onOpenChange={(open) => {
                    if (!open) setRejectingOrphanPriceId(null);
                }}
                loading={acting}
                title="Reject Request"
                onConfirm={async (reason) => {
                    if (rejectingOrphanPriceId == null) return;
                    await feed.rejectPriceRequest(rejectingOrphanPriceId, reason);
                    setRejectingOrphanPriceId(null);
                }}
            />

            <RejectDialog
                open={rejectingPriceBatchHeaderId != null}
                onOpenChange={(open) => {
                    if (!open) setRejectingPriceBatchHeaderId(null);
                }}
                loading={acting}
                title="Reject Batch"
                onConfirm={async (reason) => {
                    if (rejectingPriceBatchHeaderId == null) return;
                    await feed.rejectBatch(rejectingPriceBatchHeaderId, reason);
                    setRejectingPriceBatchHeaderId(null);
                }}
            />

            <RejectDialog
                open={rejectingMixedBatchHeaderId != null}
                onOpenChange={(open) => {
                    if (!open) setRejectingMixedBatchHeaderId(null);
                }}
                loading={acting}
                title="Reject Mixed Batch"
                onConfirm={async (reason) => {
                    if (rejectingMixedBatchHeaderId == null) return;
                    await feed.rejectMixedBatch(rejectingMixedBatchHeaderId, reason);
                    setRejectingMixedBatchHeaderId(null);
                }}
            />

            <ApproveDialog
                open={confirmingCostApprove != null}
                onOpenChange={() => setConfirmingCostApprove(null)}
                loading={acting}
                onConfirm={(effectiveAt) => void handleConfirmCostApprove(effectiveAt)}
                contentClassName={
                    confirmingCostApprove?.type === "batch" ? "sm:max-w-2xl" : undefined
                }
                title={
                    confirmingCostApprove?.type === "batch"
                        ? "Approve Selected List Cost Requests"
                        : "Confirm Approval"
                }
                description={
                    confirmingCostApprove?.type === "batch"
                        ? `You are about to approve ${selectedCostSnapshots.length} list cost request(s).`
                        : "Are you sure you want to approve this list cost request?"
                }
            >
                {confirmingCostApprove?.type === "batch" ? (
                    <div className="space-y-2">
                        {offPageSelectedCostCount > 0 ? (
                            <Alert>
                                <AlertDescription>
                                    This action includes {offPageSelectedCostCount} selected request(s) from other pages
                                    not visible in the table.
                                </AlertDescription>
                            </Alert>
                        ) : null}
                        <BulkListCostApprovePreview items={selectedCostSnapshots} />
                    </div>
                ) : null}
            </ApproveDialog>

            <ApproveDialog
                open={confirmingBulkPriceApprove}
                onOpenChange={() => setConfirmingBulkPriceApprove(false)}
                loading={acting}
                contentClassName="sm:max-w-2xl"
                title="Approve Selected Price Type Requests"
                description={`You are about to approve ${selectedPriceSnapshots.length} price type request(s)${
                    selectedBatchCount > 0 ? ` across ${selectedBatchCount} batch(es)` : ""
                }${selectedOrphanPriceCount > 0 ? `, including ${selectedOrphanPriceCount} standalone request(s)` : ""}.`}
                onConfirm={(effectiveAt) => void handleConfirmBulkPriceApprove(effectiveAt)}
            >
                <div className="space-y-2">
                    {offPageSelectedPriceCount > 0 ? (
                        <Alert>
                            <AlertDescription>
                                This action includes {offPageSelectedPriceCount} selected request(s) from other pages
                                not visible in the table.
                            </AlertDescription>
                        </Alert>
                    ) : null}
                    <BulkPriceTypeApprovePreview items={selectedPriceSnapshots} />
                </div>
            </ApproveDialog>

            <ApproveDialog
                open={confirmingOrphanPriceApproveId != null}
                onOpenChange={() => setConfirmingOrphanPriceApproveId(null)}
                loading={acting}
                title="Approve Price Type Request"
                description="Approve this price type request and apply the proposed price?"
                onConfirm={async (effectiveAt) => {
                    if (confirmingOrphanPriceApproveId == null) return;
                    await feed.approvePriceRequest(confirmingOrphanPriceApproveId, effectiveAt);
                    setConfirmingOrphanPriceApproveId(null);
                }}
            />

            <ApproveDialog
                open={confirmingPriceBatchHeaderId != null}
                onOpenChange={() => setConfirmingPriceBatchHeaderId(null)}
                loading={acting}
                title="Approve Price Change Batch"
                description="Approve entire price change batch? All pending lines in this batch will be approved and applied."
                onConfirm={async (effectiveAt) => {
                    if (confirmingPriceBatchHeaderId == null) return;
                    await feed.approveBatch(confirmingPriceBatchHeaderId, effectiveAt);
                    setConfirmingPriceBatchHeaderId(null);
                }}
            />

            <ApproveDialog
                open={confirmingMixedBatchHeaderId != null}
                onOpenChange={() => setConfirmingMixedBatchHeaderId(null)}
                loading={acting}
                title="Approve Mixed Batch"
                description="Approve this mixed batch? All pending price-type and list-cost lines will be approved and applied."
                onConfirm={async (effectiveAt) => {
                    if (confirmingMixedBatchHeaderId == null) return;
                    await feed.approveMixedBatch(confirmingMixedBatchHeaderId, effectiveAt);
                    setConfirmingMixedBatchHeaderId(null);
                }}
            />

            <BulkListCostActionResultDialog
                open={bulkCostActionOutcome != null}
                onOpenChange={(open) => {
                    if (!open) setBulkCostActionOutcome(null);
                }}
                result={bulkCostActionOutcome?.result ?? null}
                snapshots={bulkCostActionOutcome?.snapshots ?? []}
            />

            <BulkPriceTypeActionResultDialog
                open={bulkPriceActionOutcome != null}
                onOpenChange={(open) => {
                    if (!open) setBulkPriceActionOutcome(null);
                }}
                result={bulkPriceActionOutcome?.result ?? null}
                snapshots={bulkPriceActionOutcome?.snapshots ?? []}
            />
            </>
            ) : null}

            <ExcelExportOptionsDialog
                open={priceExportImport.excelOptionsOpen}
                onOpenChange={priceExportImport.setExcelOptionsOpen}
                busy={priceExportImport.busy}
                onConfirm={(mode) => void priceExportImport.confirmExportExcel(mode)}
            />

            <SupplierPrintEditorModals {...printModalsProps} />
        </div>
    );
}
