"use client";

import * as React from "react";
import { AlertCircle, CheckCheck, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { applyActionError } from "../../shared/loadErrorState";
import { isUnauthorizedError } from "../../shared/apiHttp";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { ApproveDialog } from "./ApproveDialog";
import { BulkPriceTypeActionResultDialog } from "./BulkPriceTypeActionResultDialog";
import { BulkPriceTypeApprovePreview } from "./BulkPriceTypeApprovePreview";
import { CreatePriceChangeBatchDialog } from "./CreatePriceChangeBatchDialog";
import { PcrStatusTabs } from "./PcrStatusTabs";
import { PcrTabExportImportActions } from "./PcrTabExportImportActions";
import { PriceChangeBatchDetailDialog } from "./PriceChangeBatchDetailDialog";
import { PriceTypeRequestDetailDialog } from "./PriceTypeRequestDetailDialog";
import { RejectDialog } from "./RejectDialog";
import { RequestFiltersBar } from "./RequestFiltersBar";
import RequestsTable from "./RequestsTable";
import { UnifiedBatchDetailDialog } from "./UnifiedBatchDetailDialog";

import { useRequestBulkSelection } from "../hooks/useRequestBulkSelection";
import { usePriceTypeSupplierExportImport } from "../hooks/usePriceTypeSupplierExportImport";
import { SupplierPrintEditorModals } from "../../shared/print/SupplierPrintEditorModals";
import { useSupplierPrintEditor } from "../../shared/print/useSupplierPrintEditor";
import { ExcelExportOptionsDialog } from "../../shared/supplier-batch/ExcelExportOptionsDialog";
import { useUnifiedApprovals } from "../hooks/useUnifiedApprovals";
import type { SupplierOption, ProductTypeOption } from "../providers/pcrApi";
import * as pcrApi from "../providers/pcrApi";
import { applyBulkActionResult, type BulkActionOutcome } from "../utils/applyBulkActionResult";
import {
    approveManyPriceRequestsHybrid,
    orphanPriceSnapshotCount,
    rejectManyPriceRequestsHybrid,
    uniqueBatchCount,
} from "../utils/bulkPriceTypeBatchActions";
import { pcrApproveButtonClass, pcrRejectButtonClass } from "../utils/pcrStatusStyles";
import { snapshotFromPriceApprovalRow } from "../utils/labels";
import type {
    ApprovalRecordRow,
    ListQuery,
    PCRStatusFilter,
    PriceTypeSelectionSnapshot,
    PriceTypeUnifiedApprovalRow,
    UnifiedApprovalRow,
} from "../types";

type Props = {
    suppliers: SupplierOption[];
    suppliersLoading: boolean;
    suppliersError: string | null;
    productTypes: ProductTypeOption[];
    productTypesLoading?: boolean;
    productTypesError?: string | null;
    query: ListQuery;
    setQuery: React.Dispatch<React.SetStateAction<ListQuery>>;
    onUnauthorized?: () => void;
    active?: boolean;
    readOnly?: boolean;
};

export function PriceTypeRequestManager({
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
    const inbox = useUnifiedApprovals(query, setQuery, { scope: "price", enabled: active });
    const statusTab: PCRStatusFilter = inbox.query.status || "ALL";
    const { openSupplierPrint, modalsProps: printModalsProps } = useSupplierPrintEditor();
    const priceExportImport = usePriceTypeSupplierExportImport({
        supplierIds: query.supplier_ids,
        suppliers,
        onOpenPrintEditor: openSupplierPrint,
    });
    const [viewingBatchHeaderId, setViewingBatchHeaderId] = React.useState<number | null>(null);
    const [viewingMixedBatchHeaderId, setViewingMixedBatchHeaderId] = React.useState<number | null>(null);
    const [viewingRequestId, setViewingRequestId] = React.useState<number | null>(null);
    const [confirmingBatchHeaderId, setConfirmingBatchHeaderId] = React.useState<number | null>(null);
    const [rejectingBatchHeaderId, setRejectingBatchHeaderId] = React.useState<number | null>(null);
    const [confirmingBulkApprove, setConfirmingBulkApprove] = React.useState(false);
    const [rejectingBulk, setRejectingBulk] = React.useState(false);
    const [confirmingOrphanApproveId, setConfirmingOrphanApproveId] = React.useState<number | null>(null);
    const [rejectingOrphanId, setRejectingOrphanId] = React.useState<number | null>(null);
    const [bulkActionOutcome, setBulkActionOutcome] =
        React.useState<BulkActionOutcome<PriceTypeSelectionSnapshot> | null>(null);
    const [batchActing, setBatchActing] = React.useState(false);

    const {
        selectedKeys,
        selectedIds,
        selectedSnapshots,
        offPageSelectedCount,
        toggleSelect,
        toggleSelectAllPage,
        clearSelection,
        removeSelectionIds,
    } = useRequestBulkSelection({
        rows: inbox.rows,
        isSelectable: (row) =>
            (row.kind === "price_batch" || row.kind === "price_type") && row.status === "PENDING",
        toSnapshot: (row) => snapshotFromPriceApprovalRow(row),
        getRowKey: (row) => row.row_key,
    });

    const showBulkBar = false;
    const selectedBatchCount = uniqueBatchCount(selectedSnapshots);
    const selectedOrphanCount = orphanPriceSnapshotCount(selectedSnapshots);

    const viewingRequest = React.useMemo(() => {
        if (viewingRequestId == null) return null;
        const row = inbox.rows.find((r) => r.kind === "price_type" && Number(r.request_id) === viewingRequestId);
        return row ? (row as PriceTypeUnifiedApprovalRow) : null;
    }, [inbox.rows, viewingRequestId]);

    const approveBatch = React.useCallback(async (headerId: number, effectiveAt?: string | null) => {
        setBatchActing(true);
        try {
            const result = await pcrApi.approvePriceChangeBatch(headerId, effectiveAt);
            await pcrApi.waitForBatchDecision({
                kind: "price_batch",
                headerId,
                expectedStatus: "APPROVED",
                expectedApplicationStatus: result.scheduled ? "SCHEDULED" : "APPLIED",
            });
            const verb = result.scheduled ? "approved and scheduled" : "approved";
            toast.success(`${result.affected} price change line(s) ${verb}.`);
            await inbox.refresh();
        } catch (error: unknown) {
            if (applyActionError(error, "Failed to approve batch", { onUnauthorized })) {
                throw error;
            }
            throw error;
        } finally {
            setBatchActing(false);
        }
    }, [inbox, onUnauthorized]);

    const rejectBatch = React.useCallback(async (headerId: number, reason: string) => {
        setBatchActing(true);
        try {
            await pcrApi.rejectPriceChangeBatch(headerId, reason);
            await pcrApi.waitForBatchDecision({ kind: "price_batch", headerId, expectedStatus: "REJECTED" });
            toast.success("Batch rejected.");
            await inbox.refresh();
        } catch (error: unknown) {
            if (applyActionError(error, "Failed to reject batch", { onUnauthorized })) {
                throw error;
            }
            throw error;
        } finally {
            setBatchActing(false);
        }
    }, [inbox, onUnauthorized]);

    const approvePriceRequest = React.useCallback(async (requestId: number, effectiveAt?: string | null) => {
        setBatchActing(true);
        try {
            const result = await pcrApi.actionPriceRequest({
                action: "approve",
                request_id: requestId,
                effective_at: effectiveAt,
            });
            const message =
                result.data?.application_status === "SCHEDULED" ? "Approved and scheduled." : "Approved and applied.";
            toast.success(message);
            await inbox.refresh();
        } catch (error: unknown) {
            if (applyActionError(error, "Failed to approve request", { onUnauthorized })) {
                throw error;
            }
            throw error;
        } finally {
            setBatchActing(false);
        }
    }, [inbox, onUnauthorized]);

    const rejectPriceRequest = React.useCallback(async (requestId: number, reason: string) => {
        setBatchActing(true);
        try {
            await pcrApi.actionPriceRequest({ action: "reject", request_id: requestId, reject_reason: reason });
            toast.success("Rejected.");
            await inbox.refresh();
        } catch (error: unknown) {
            if (applyActionError(error, "Failed to reject request", { onUnauthorized })) {
                throw error;
            }
            throw error;
        } finally {
            setBatchActing(false);
        }
    }, [inbox, onUnauthorized]);

    const handleConfirmBulkApprove = React.useCallback(async (effectiveAt?: string | null) => {
        if (selectedSnapshots.length === 0) return;
        try {
            const result = await approveManyPriceRequestsHybrid(
                selectedSnapshots,
                approveBatch,
                approvePriceRequest,
                effectiveAt,
            );
            applyBulkActionResult(result, selectedSnapshots, removeSelectionIds, setBulkActionOutcome);
        } catch (error: unknown) {
            if (isUnauthorizedError(error)) {
                onUnauthorized?.();
                return;
            }
            throw error;
        }
        setConfirmingBulkApprove(false);
    }, [approveBatch, approvePriceRequest, onUnauthorized, removeSelectionIds, selectedSnapshots]);

    const handleRejectBulk = React.useCallback(
        async (reason: string) => {
            if (selectedSnapshots.length === 0) return;
            try {
                const result = await rejectManyPriceRequestsHybrid(
                    selectedSnapshots,
                    reason,
                    rejectBatch,
                    rejectPriceRequest,
                );
                applyBulkActionResult(result, selectedSnapshots, removeSelectionIds, setBulkActionOutcome);
            } catch (error: unknown) {
                if (isUnauthorizedError(error)) {
                    onUnauthorized?.();
                    return;
                }
                throw error;
            }
        },
        [rejectBatch, rejectPriceRequest, onUnauthorized, removeSelectionIds, selectedSnapshots],
    );

    const rawSetInboxQuery = inbox.setQuery;
    const setInboxQuery = React.useCallback<React.Dispatch<React.SetStateAction<ListQuery>>>(
        (updater) => {
            clearSelection();
            rawSetInboxQuery(updater);
        },
        [clearSelection, rawSetInboxQuery],
    );

    React.useEffect(() => {
        if (inbox.unauthorized) onUnauthorized?.();
    }, [inbox.unauthorized, onUnauthorized]);

    return (
        <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <PcrStatusTabs
                    value={statusTab as string}
                    onValueChange={(status) => {
                        clearSelection();
                        inbox.setQuery((q) => ({ ...q, status, page: 1 }));
                    }}
                    className="w-full sm:w-auto"
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
                    query={inbox.query}
                    setQuery={setInboxQuery}
                    suppliers={suppliers}
                    suppliersLoading={suppliersLoading}
                    suppliersError={suppliersError}
                    productTypes={productTypes}
                    productTypesLoading={productTypesLoading}
                    productTypesError={productTypesError}
                    loading={inbox.loading}
                    total={inbox.total}
                    totalLabel="requests"
                    searchLabel="Search requests"
                    searchPlaceholder="PCR-123, product, or barcode"
                    searchHelper="Find price type requests by PCR- number, product, code, or barcode."
                    filterContext="price"
                    onRefresh={() => {
                        clearSelection();
                        inbox.refresh();
                    }}
                    onReset={clearSelection}
                />

                {inbox.error ? (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Price type requests could not be loaded</AlertTitle>
                        <AlertDescription className="space-y-3">
                            <p>{inbox.error}</p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void inbox.refresh()}
                                disabled={inbox.loading}
                            >
                                {inbox.loading ? (
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
                            {selectedIds.length > 0 ? (
                                <div className="flex flex-col gap-0.5">
                                    <span>
                                        <span className="font-medium text-foreground">{selectedIds.length}</span>{" "}
                                        request(s) selected
                                        {selectedBatchCount > 0 ? (
                                            <span> across {selectedBatchCount} batch(es)</span>
                                        ) : null}
                                    </span>
                                    {offPageSelectedCount > 0 ? (
                                        <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                                            Includes {offPageSelectedCount} on other pages.
                                        </span>
                                    ) : null}
                                    {bulkActionOutcome && bulkActionOutcome.result.failedIds.length > 0 ? (
                                        <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                                            {bulkActionOutcome.result.failedIds.length} request(s) could not be
                                            processed. Failed rows remain selected.
                                        </span>
                                    ) : null}
                                    <span className="text-xs text-muted-foreground">
                                        Select-all applies to pending rows on this page only. Each batch is approved or
                                        rejected in full.
                                    </span>
                                </div>
                            ) : (
                                "Select pending price type requests to approve or reject in bulk."
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    clearSelection();
                                    setBulkActionOutcome(null);
                                }}
                                disabled={(inbox.loading || batchActing) || selectedIds.length === 0}
                            >
                                <X className="mr-2 h-4 w-4" />
                                Clear
                            </Button>

                            <Button
                                className={pcrApproveButtonClass}
                                onClick={() => setConfirmingBulkApprove(true)}
                                disabled={(inbox.loading || batchActing) || selectedIds.length === 0}
                            >
                                {inbox.loading || batchActing ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <CheckCheck className="mr-2 h-4 w-4" />
                                )}
                                Approve Selected
                            </Button>

                            <Button
                                variant="outline"
                                className={pcrRejectButtonClass}
                                onClick={() => setRejectingBulk(true)}
                                disabled={(inbox.loading || batchActing) || selectedIds.length === 0}
                            >
                                <X className="mr-2 h-4 w-4" />
                                Reject Selected
                            </Button>
                        </div>
                    </div>
                ) : null}

                <RequestsTable
                    rows={inbox.rows}
                    mode="approver"
                    showSelectionColumn={showBulkBar}
                    requestType="price"
                    loading={inbox.loading}
                    hasLoadError={Boolean(inbox.error)}
                    acting={inbox.loading || batchActing}
                    canSelectRow={(row) => row.status === "PENDING"}
                    onReview={(row: ApprovalRecordRow) => {
                        if (!("kind" in row)) return;
                        if (row.kind === "price_batch") {
                            setViewingBatchHeaderId(Number(row.batch_id ?? row.request_id));
                            return;
                        }
                        if (row.kind === "mixed_batch") {
                            setViewingMixedBatchHeaderId(Number(row.batch_id ?? row.request_id));
                            return;
                        }
                        if (row.kind === "price_type") setViewingRequestId(Number(row.request_id));
                    }}
                    {...(readOnly
                        ? {}
                        : {
                              onApprove: (row: ApprovalRecordRow) => {
                                  if (!("kind" in row)) return;
                                  if (row.kind === "mixed_batch") {
                                      setViewingMixedBatchHeaderId(Number(row.batch_id ?? row.request_id));
                                      return;
                                  }
                                  const id = Number(row.request_id);
                                  const headerId = row.kind === "price_batch"
                                      ? Number(row.batch_id ?? row.request_id)
                                      : row.kind === "price_type" ? row.batch_header_id ?? null : null;
                                  if (headerId) {
                                      setConfirmingBatchHeaderId(headerId);
                                      return;
                                  }
                                  setConfirmingOrphanApproveId(id);
                              },
                              onReject: (row: ApprovalRecordRow) => {
                                  if (!("kind" in row)) return;
                                  if (row.kind === "mixed_batch") {
                                      setViewingMixedBatchHeaderId(Number(row.batch_id ?? row.request_id));
                                      return;
                                  }
                                  const id = Number(row.request_id);
                                  const headerId = row.kind === "price_batch"
                                      ? Number(row.batch_id ?? row.request_id)
                                      : row.kind === "price_type" ? row.batch_header_id ?? null : null;
                                  if (headerId) {
                                      setRejectingBatchHeaderId(headerId);
                                      return;
                                  }
                                  setRejectingOrphanId(id);
                              },
                          })}
                    meta={{ total_count: inbox.total }}
                    page={Number(inbox.query.page ?? 1)}
                    pageSize={Number(inbox.query.page_size ?? 50)}
                    onPageChange={(page) =>
                        inbox.setQuery((q) => ({
                            ...q,
                            page,
                        }))
                    }
                    onPageSizeChange={(page_size) =>
                        inbox.setQuery((q) => ({
                            ...q,
                            page_size,
                            page: 1,
                        }))
                    }
                    footerItemLabel="requests"
                    selectedKeys={selectedKeys}
                    getSelectionKey={(row) => (row as UnifiedApprovalRow).row_key}
                    onToggleSelect={(key, checked, row) =>
                        toggleSelect(key, checked, row as UnifiedApprovalRow | undefined)
                    }
                    onToggleSelectAllPage={toggleSelectAllPage}
                />
            </div>

            <PriceChangeBatchDetailDialog
                batchId={viewingBatchHeaderId}
                open={viewingBatchHeaderId != null}
                acting={inbox.loading || batchActing}
                readOnly={readOnly}
                onOpenChange={(open) => {
                    if (!open) setViewingBatchHeaderId(null);
                }}
                {...(readOnly
                    ? {}
                    : {
                          onApprove: approveBatch,
                          onReject: rejectBatch,
                          onApplyScheduledNow: (headerId: number) => inbox.applyScheduledNow("price_batch", headerId),
                          onRejectScheduled: (headerId: number, reason: string) =>
                              inbox.rejectScheduled("price_batch", headerId, reason),
                          onRetryApplication: (headerId: number) => inbox.retryApplication("price_batch", headerId),
                      })}
            />

            <PriceTypeRequestDetailDialog
                row={viewingRequest}
                open={viewingRequestId != null}
                acting={inbox.loading || batchActing}
                readOnly={readOnly}
                onOpenChange={(open) => {
                    if (!open) setViewingRequestId(null);
                }}
                {...(readOnly
                    ? {}
                    : {
                          onApproveBatch: approveBatch,
                          onRejectBatch: rejectBatch,
                          onApproveRequest: approvePriceRequest,
                          onRejectRequest: rejectPriceRequest,
                          onApplyScheduledNow: (kind, id) => inbox.applyScheduledNow(kind, id),
                          onRejectScheduled: (kind, id, reason) => inbox.rejectScheduled(kind, id, reason),
                          onRetryApplication: (kind, id) => inbox.retryApplication(kind, id),
                })}
            />

            <UnifiedBatchDetailDialog
                batchId={viewingMixedBatchHeaderId}
                open={viewingMixedBatchHeaderId != null}
                acting={inbox.loading || inbox.acting || batchActing}
                readOnly={readOnly}
                onOpenChange={(open) => {
                    if (!open) setViewingMixedBatchHeaderId(null);
                }}
                {...(readOnly
                    ? {}
                    : {
                          onApprove: inbox.approveMixedBatch,
                          onReject: inbox.rejectMixedBatch,
                          onApplyScheduledNow: (headerId: number) => inbox.applyScheduledNow("mixed_batch", headerId),
                          onRetryApplication: inbox.retryMixedBatch,
                      })}
            />

            {!readOnly ? (
            <>
            <ApproveDialog
                open={confirmingOrphanApproveId != null}
                onOpenChange={() => setConfirmingOrphanApproveId(null)}
                loading={inbox.loading || batchActing}
                title="Approve Price Type Request"
                description="Approve this price type request and apply the proposed price?"
                onConfirm={async (effectiveAt) => {
                    if (confirmingOrphanApproveId == null) return;
                    await approvePriceRequest(confirmingOrphanApproveId, effectiveAt);
                    setConfirmingOrphanApproveId(null);
                }}
            />

            <RejectDialog
                open={rejectingOrphanId != null}
                onOpenChange={(open) => {
                    if (!open) setRejectingOrphanId(null);
                }}
                loading={inbox.loading || batchActing}
                title="Reject Request"
                onConfirm={async (reason) => {
                    if (rejectingOrphanId == null) return;
                    await rejectPriceRequest(rejectingOrphanId, reason);
                    setRejectingOrphanId(null);
                }}
            />

            <ApproveDialog
                open={confirmingBatchHeaderId != null}
                onOpenChange={() => setConfirmingBatchHeaderId(null)}
                loading={inbox.loading || batchActing}
                title="Approve Price Change Batch"
                description="Approve entire price change batch? All pending lines in this batch will be approved and applied."
                onConfirm={async (effectiveAt) => {
                    if (confirmingBatchHeaderId == null) return;
                    await approveBatch(confirmingBatchHeaderId, effectiveAt);
                    setConfirmingBatchHeaderId(null);
                }}
            />

            <RejectDialog
                open={rejectingBatchHeaderId != null}
                onOpenChange={(open) => {
                    if (!open) setRejectingBatchHeaderId(null);
                }}
                loading={inbox.loading || batchActing}
                title="Reject Batch"
                onConfirm={async (reason) => {
                    if (rejectingBatchHeaderId == null) return;
                    await rejectBatch(rejectingBatchHeaderId, reason);
                    setRejectingBatchHeaderId(null);
                }}
            />

            <ApproveDialog
                open={confirmingBulkApprove}
                onOpenChange={() => setConfirmingBulkApprove(false)}
                loading={inbox.loading || batchActing}
                contentClassName="sm:max-w-2xl"
                title="Approve Selected Price Type Requests"
                description={`You are about to approve ${selectedSnapshots.length} price type request(s)${
                    selectedBatchCount > 0 ? ` across ${selectedBatchCount} batch(es)` : ""
                }${selectedOrphanCount > 0 ? `, including ${selectedOrphanCount} standalone request(s)` : ""}.`}
                onConfirm={(effectiveAt) => void handleConfirmBulkApprove(effectiveAt)}
            >
                <div className="space-y-2">
                    {offPageSelectedCount > 0 ? (
                        <Alert>
                            <AlertDescription>
                                This action includes {offPageSelectedCount} selected request(s) from other pages not
                                visible in the table.
                            </AlertDescription>
                        </Alert>
                    ) : null}
                    <BulkPriceTypeApprovePreview items={selectedSnapshots} />
                </div>
            </ApproveDialog>

            <RejectDialog
                open={rejectingBulk}
                onOpenChange={(open) => {
                    if (!open) setRejectingBulk(false);
                }}
                loading={inbox.loading || batchActing}
                contentClassName="sm:max-w-2xl"
                title="Reject Selected Price Type Requests"
                onConfirm={async (reason) => {
                    await handleRejectBulk(reason);
                    setRejectingBulk(false);
                }}
            >
                <div className="mb-2 space-y-2">
                    {offPageSelectedCount > 0 ? (
                        <Alert>
                            <AlertDescription>
                                This action includes {offPageSelectedCount} selected request(s) from other pages not
                                visible in the table.
                            </AlertDescription>
                        </Alert>
                    ) : null}
                    <BulkPriceTypeApprovePreview items={selectedSnapshots} />
                </div>
            </RejectDialog>

            <BulkPriceTypeActionResultDialog
                open={bulkActionOutcome != null}
                onOpenChange={(open) => {
                    if (!open) setBulkActionOutcome(null);
                }}
                result={bulkActionOutcome?.result ?? null}
                snapshots={bulkActionOutcome?.snapshots ?? []}
            />

            <CreatePriceChangeBatchDialog
                open={priceExportImport.creatingBatch}
                onOpenChange={(open) => {
                    priceExportImport.setCreatingBatch(open);
                    if (!open) priceExportImport.clearImportPrefill();
                }}

                onCreated={() => void inbox.refresh()}
                importPrefill={priceExportImport.importPrefill}
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
