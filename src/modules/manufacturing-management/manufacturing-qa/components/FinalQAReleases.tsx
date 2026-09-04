/* eslint-disable */
import React from "react";
import { Loader2, ClipboardCheck, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { FinalQACoa } from "../services/qa-api";
import { ResponsiveDataView } from "./ResponsiveDataView";

interface FinalQAReleasesProps {
    lots: any[];
    lotsProducts: any[];
    finalReleases: any[];
    loadingFinalQA: boolean;
    isFinalReleaseOpen: boolean;
    setIsFinalReleaseOpen: (open: boolean) => void;
    selectedLot: any | null;
    inspectedQty: string;
    setInspectedQty: (val: string) => void;
    defectQty: string;
    setDefectQty: (val: string) => void;
    microbiologicalStatus: "Pending" | "Passed" | "Failed";
    setMicrobiologicalStatus: (val: "Pending" | "Passed" | "Failed") => void;
    packagingSealPassed: boolean;
    setPackagingSealPassed: (val: boolean) => void;
    labelCompliancePassed: boolean;
    setLabelCompliancePassed: (val: boolean) => void;
    overallDisposition: "Approved" | "Quarantined" | "Rejected";
    setOverallDisposition: (val: "Approved" | "Quarantined" | "Rejected") => void;
    coaRefNo: string;
    setCoaRefNo: (val: string) => void;
    finalRemarks: string;
    setFinalRemarks: (val: string) => void;
    handleOpenFinalReleaseDialog: (lot: any) => void;
    handleSubmitFinalRelease: () => void;
    actionLoading: boolean;
    isFinalQAAuditOpen: boolean;
    setIsFinalQAAuditOpen: (open: boolean) => void;
    selectedFinalQAAudit: FinalQACoa | null;
    loadingFinalQAAudit: boolean;
    finalQAAuditError: string | null;
    handleOpenFinalQAAudit: (lot: any) => void;
    handlePrintFinalQACoa: () => void;
    coaPrintLoading: boolean;
    onFiltersChange?: (search: string) => void;
}

export function FinalQAReleases({
    lots,
    lotsProducts,
    finalReleases,
    loadingFinalQA,
    isFinalReleaseOpen,
    setIsFinalReleaseOpen,
    selectedLot,
    inspectedQty,
    setInspectedQty,
    defectQty,
    setDefectQty,
    microbiologicalStatus,
    setMicrobiologicalStatus,
    packagingSealPassed,
    setPackagingSealPassed,
    labelCompliancePassed,
    setLabelCompliancePassed,
    overallDisposition,
    setOverallDisposition,
    coaRefNo,
    setCoaRefNo,
    finalRemarks,
    setFinalRemarks,
    handleOpenFinalReleaseDialog,
    handleSubmitFinalRelease,
    actionLoading,
    isFinalQAAuditOpen,
    setIsFinalQAAuditOpen,
    selectedFinalQAAudit,
    loadingFinalQAAudit,
    finalQAAuditError,
    handleOpenFinalQAAudit,
    handlePrintFinalQACoa,
    coaPrintLoading,
    onFiltersChange
}: FinalQAReleasesProps) {

    // Filter to show only finished goods lots
    const fgLots = React.useMemo(() => {
        return lots;
    }, [lots]);
    const [searchQuery, setSearchQuery] = React.useState("");

    const getProductName = (productId: number) => {
        const prod = lotsProducts.find(p => Number(p.product_id) === Number(productId));
        return prod?.product_name || `Product #${productId}`;
    };

    const visibleLots = React.useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return fgLots;
        return fgLots.filter((lot) => `${getProductName(lot.product_id)} ${lot.lot_number || ""} ${lot.batch_no || ""}`.toLowerCase().includes(query));
    }, [fgLots, searchQuery, lotsProducts]);

    const getCanonicalLotId = (lot: any) => {
        if (lot?.canonical_lot_id) return Number(lot.canonical_lot_id);
        if (lot?.lot_id && typeof lot.lot_id === "object") {
            return Number(lot.lot_id.lot_id || lot.lot_id.id || 0);
        }
        return Number(lot?.lot_id || 0);
    };

    const getLotRowKey = (lot: any, index: number) => {
        const movementId = Number(lot?.line_id || lot?.id || 0);
        if (Number.isSafeInteger(movementId) && movementId > 0) {
            return `movement-${movementId}`;
        }

        const productId = Number(lot?.product_id || 0);
        const branchId = Number(lot?.branch_id || 0);
        const canonicalLotId = getCanonicalLotId(lot);
        const batchNo = String(lot?.batch_no || lot?.lot_number || "LOT-N/A").trim() || "LOT-N/A";
        return `stock-${productId}-${branchId}-${canonicalLotId || "unassigned"}-${batchNo}-${index}`;
    };

    const getReleaseForLot = (lot: any) => {
        const lotId = getCanonicalLotId(lot);
        return finalReleases.find((release) => {
            const releaseLotId = Number(
                release?.canonical_lot_id
                || (release?.lot_id && typeof release.lot_id === "object"
                    ? release.lot_id.lot_id || release.lot_id.id
                    : release?.lot_id)
                || 0
            );
            return lotId > 0 && releaseLotId === lotId;
        }) || null;
    };

    const dispositionStatus = (release: any) => String(release?.overall_disposition || "").trim().toLowerCase();

    const formatAuditDate = (value: string | null | undefined) => {
        if (!value) return "—";
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
    };

    const renderLotCard = (lot: any, index: number) => {
        const release = getReleaseForLot(lot);
        const status = dispositionStatus(release);
        const isApproved = status === "approved";
        const isQuarantined = status === "quarantined";
        const isRejected = status === "rejected";
        const product = lotsProducts.find(p => Number(p.product_id) === Number(lot.product_id));
        return (
            <div key={getLotRowKey(lot, index)} className="rounded-xl border bg-card p-4 shadow-xs">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="truncate text-base font-bold text-foreground">{getProductName(lot.product_id)}</p>
                        <p className="mt-1 font-mono text-sm font-semibold text-muted-foreground">Lot {lot.lot_number}</p>
                    </div>
                    {isApproved ? <Badge className="min-h-7 bg-emerald-950 px-2 text-sm text-emerald-400">Released</Badge> : isRejected ? <Badge className="min-h-7 bg-red-950 px-2 text-sm text-red-400">Rejected</Badge> : isQuarantined ? <Badge className="min-h-7 bg-amber-950 px-2 text-sm text-amber-400">Quarantined</Badge> : <Badge variant="outline" className="min-h-7 text-sm">Pending QA</Badge>}
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div><dt className="text-muted-foreground">Stock quantity</dt><dd className="font-mono font-semibold">{Number(lot.quantity_received || lot.quantity || 0).toLocaleString()} {product?.is_finished_good ? "packs" : "pcs"}</dd></div>
                    <div><dt className="text-muted-foreground">Expiry</dt><dd className="font-mono font-semibold">{lot.expiration_date ? new Date(lot.expiration_date).toLocaleDateString() : "No Expiry"}</dd></div>
                </dl>
                <Button className="mt-4 min-h-11 w-full" variant={release ? "secondary" : "default"} onClick={() => release ? handleOpenFinalQAAudit(lot) : handleOpenFinalReleaseDialog(lot)}>
                    {release ? (isApproved ? "Inspect / Print COA" : "View QA Audit") : "Release Audit"}
                </Button>
            </div>
        );
    };

    if (loadingFinalQA) {
        return (
            <div className="flex justify-center items-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="rounded-xl border bg-card shadow-sm">
                <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h3 className="font-bold text-base">Finished Goods & Sub-Assembly Lot Releases</h3>
                        <p className="text-xs text-muted-foreground">Perform microbiological analyses, packaging seal audits, and publish COAs to unlock stock lots for shipping or production consumption.</p>
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
                        <Input value={searchQuery} onChange={(event) => { const search = event.target.value; setSearchQuery(search); onFiltersChange?.(search); }} placeholder="Search product or lot..." aria-label="Search final QA lots" className="h-11 w-full text-sm md:w-64" />
                        {searchQuery && <Button type="button" variant="outline" className="min-h-11" onClick={() => { setSearchQuery(""); onFiltersChange?.(""); }}>Clear</Button>}
                    </div>
                </div>

                {visibleLots.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground italic text-sm">
                        No inventory lots found in the system.
                    </div>
                ) : (
                    <ResponsiveDataView
                        table={(
                        <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-xs">Product Name</TableHead>
                                <TableHead className="font-mono text-xs">Lot Number</TableHead>
                                <TableHead className="text-xs font-mono">Stock Qty</TableHead>
                                <TableHead className="text-xs">Expiry Date</TableHead>
                                <TableHead className="text-xs text-center">WMS QA Status</TableHead>
                                <TableHead className="text-xs text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {visibleLots.map((lot, index) => {
                                const release = getReleaseForLot(lot);
                                const status = dispositionStatus(release);
                                const isApproved = status === "approved";
                                const isQuarantined = status === "quarantined";
                                const isRejected = status === "rejected";
                                return (
                                    <TableRow key={getLotRowKey(lot, index)}>
                                        <TableCell className="text-xs font-semibold text-foreground">
                                            <div className="flex flex-col gap-1">
                                                <span>{getProductName(lot.product_id)}</span>
                                                {(() => {
                                                    const prod = lotsProducts.find(p => Number(p.product_id) === Number(lot.product_id));
                                                    return prod?.is_finished_good ? (
                                                        <Badge variant="secondary" className="w-fit text-[10px] py-0 px-1 font-bold leading-none bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                            Finished Good
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="w-fit text-[10px] py-0 px-1 font-bold leading-none border-blue-500/30 text-blue-400">
                                                            Sub-Assembly
                                                        </Badge>
                                                    );
                                                })()}
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-mono text-xs text-muted-foreground font-bold">{lot.lot_number}</TableCell>
                                        <TableCell className="text-xs font-mono font-bold">
                                            {Number(lot.quantity_received || lot.quantity || 0).toLocaleString()}{" "}
                                            {(() => {
                                                const prod = lotsProducts.find(p => Number(p.product_id) === Number(lot.product_id));
                                                return prod?.is_finished_good ? "packs" : "pcs";
                                            })()}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{lot.expiration_date ? new Date(lot.expiration_date).toLocaleDateString() : "No Expiry"}</TableCell>
                                        <TableCell className="text-xs text-center">
                                            {isApproved ? (
                                                <Badge className="bg-emerald-950 text-emerald-400 border border-emerald-500/30 font-bold">
                                                    Released (Passed)
                                                </Badge>
                                            ) : isRejected ? (
                                                <Badge className="bg-red-950 text-red-400 border border-red-500/30 font-bold">
                                                    Rejected (Failed)
                                                </Badge>
                                            ) : isQuarantined ? (
                                                <Badge className="bg-amber-950 text-amber-400 border border-amber-500/30 font-bold animate-pulse">
                                                    Quarantined (Hold)
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="border-blue-500/40 text-blue-400 bg-blue-500/5">
                                                    Pending final QA
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {release ? (
                                                <Button
                                                    size="xs"
                                                    variant={isApproved ? "outline" : "secondary"}
                                                    onClick={() => handleOpenFinalQAAudit(lot)}
                                                    className="font-bold min-h-11 text-sm"
                                                >
                                                    {isApproved ? "Inspect / Print COA" : "View QA Audit"}
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="xs"
                                                    variant="default"
                                                    onClick={() => handleOpenFinalReleaseDialog(lot)}
                                                    className="font-bold min-h-11 text-sm"
                                                >
                                                    Release Audit
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                        </Table>
                        )}
                        cards={(
                            <div className="space-y-3 p-3">
                                {visibleLots.map(renderLotCard)}
                            </div>
                        )}
                        minTableWidth="wide"
                    />
                )}
            </div>

            {/* DIALOG: Record Final Batch QA Release & COA */}
            <Dialog open={isFinalReleaseOpen} onOpenChange={setIsFinalReleaseOpen}>
                <DialogContent className="w-[calc(100vw-1rem)] max-w-[480px] max-h-[calc(100dvh-1rem)] bg-background border border-border text-foreground flex flex-col overflow-hidden">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-primary font-bold text-base">
                            <ClipboardCheck className="h-5 w-5" /> Finished Goods QA release inspection
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground text-xs">
                            Validate microbiological, physical and packaging criteria to release finished lot {selectedLot?.lot_number}.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={(e) => { e.preventDefault(); handleSubmitFinalRelease(); }} className="min-h-0 flex-1 space-y-4 overflow-y-auto py-2 text-sm scrollbar-thin">
                        <div className="grid grid-cols-2 gap-4">
                            {/* Inspected Quantity */}
                            <div className="space-y-1.5">
                                <Label htmlFor="inspected" className="text-foreground font-bold font-mono">Inspected Quantity (units)</Label>
                                <Input
                                    id="inspected"
                                    type="number"
                                    value={inspectedQty}
                                    onChange={(e) => setInspectedQty(e.target.value)}
                                    className="min-h-11 bg-background border-border text-sm focus-visible:ring-primary font-bold font-mono"
                                    required
                                />
                            </div>

                            {/* Defect Quantity */}
                            <div className="space-y-1.5">
                                <Label htmlFor="defect" className="text-foreground font-bold font-mono">Defect Quantity (units)</Label>
                                <Input
                                    id="defect"
                                    type="number"
                                    value={defectQty}
                                    onChange={(e) => setDefectQty(e.target.value)}
                                    className="min-h-11 bg-background border-border text-sm focus-visible:ring-primary font-bold font-mono"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {/* Microbiological Status */}
                            <div className="space-y-1.5">
                                <Label htmlFor="microbio" className="text-foreground font-bold">Microbiological Analysis</Label>
                                <select
                                    id="microbio"
                                    value={microbiologicalStatus}
                                    onChange={(e) => setMicrobiologicalStatus(e.target.value as any)}
                                    className="flex min-h-11 w-full rounded-md border border-border bg-background text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                                >
                                    <option value="Passed">Passed (Coliforms/Yeast Clean)</option>
                                    <option value="Pending">Pending Lab Culturing</option>
                                    <option value="Failed">Failed (Contamination detected)</option>
                                </select>
                            </div>

                            {/* COA Reference No */}
                            <div className="space-y-1.5">
                                <Label htmlFor="coa" className="text-foreground font-bold font-mono">Certificate of Analysis (COA) #</Label>
                                <Input
                                    id="coa"
                                    value={coaRefNo}
                                    onChange={(e) => setCoaRefNo(e.target.value)}
                                    className="min-h-11 bg-background border-border text-sm focus-visible:ring-primary font-bold font-mono"
                                    placeholder="e.g. COA-12345"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {/* Overall Disposition */}
                            <div className="space-y-1.5">
                                <Label htmlFor="disposition" className="text-foreground font-bold">Overall Lot Disposition</Label>
                                <select
                                    id="disposition"
                                    value={overallDisposition}
                                    onChange={(e) => setOverallDisposition(e.target.value as any)}
                                    className="flex min-h-11 w-full rounded-md border border-border bg-background text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                                >
                                    <option value="Approved">Approved (Release to WMS)</option>
                                    <option value="Quarantined">Quarantine Hold (Audit Lock)</option>
                                    <option value="Rejected">Rejected (Scrap/Rework)</option>
                                </select>
                            </div>

                            {/* Compliance gates */}
                            <div className="space-y-2 flex flex-col justify-end pb-1 pl-1">
                                <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-foreground font-semibold">
                                    <input 
                                        type="checkbox" 
                                        checked={packagingSealPassed}
                                        onChange={(e) => setPackagingSealPassed(e.target.checked)}
                                        className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary"
                                    />
                                    Packaging Seal Audit Passed
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-foreground font-semibold">
                                    <input 
                                        type="checkbox" 
                                        checked={labelCompliancePassed}
                                        onChange={(e) => setLabelCompliancePassed(e.target.checked)}
                                        className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary"
                                    />
                                    Label & Expiry Print Correct
                                </label>
                            </div>
                        </div>

                        {/* Final Remarks */}
                        <div className="space-y-1.5">
                            <Label htmlFor="finalRemarks" className="text-foreground font-bold">Microbiological & Sensory release notes</Label>
                            <textarea
                                id="finalRemarks"
                                value={finalRemarks}
                                onChange={(e) => setFinalRemarks(e.target.value)}
                                className="flex min-h-[60px] w-full rounded-md border border-border bg-background text-foreground px-3 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                                placeholder="Write final microbiological logs, metals check findings, or batch packaging notes..."
                            />
                        </div>

                        <DialogFooter className="sticky bottom-0 z-10 pt-3 border-t border-border gap-2 flex items-center justify-end bg-background/95 backdrop-blur">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsFinalReleaseOpen(false)}
                                className="border-border hover:bg-muted text-foreground min-h-11 text-sm font-semibold"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={actionLoading}
                                className="bg-primary hover:bg-primary/95 text-white font-bold min-h-11 text-sm px-4"
                            >
                                {actionLoading ? "Saving Release..." : "Save & Release Lot"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* DIALOG: Read-only persisted Final QA audit and COA */}
            <Dialog open={isFinalQAAuditOpen} onOpenChange={setIsFinalQAAuditOpen}>
                <DialogContent
                    className="w-[calc(100vw-1rem)] max-w-[600px] max-h-[calc(100dvh-1rem)] bg-background border border-border text-foreground flex flex-col overflow-hidden"
                    data-testid="final-qa-read-only-audit"
                >
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-primary font-bold text-base">
                            <ClipboardCheck className="h-5 w-5" /> Final QA audit / Certificate of Analysis
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground text-xs">
                            Persisted release details are read-only. Use Print COA to generate the approved lot document.
                        </DialogDescription>
                    </DialogHeader>

                    {loadingFinalQAAudit ? (
                        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin" /> Loading persisted QA release...
                        </div>
                    ) : finalQAAuditError ? (
                        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-3 text-xs text-destructive">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span>{finalQAAuditError}</span>
                        </div>
                    ) : selectedFinalQAAudit ? (
                        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-2 text-sm scrollbar-thin">
                            <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                                <div><div className="text-muted-foreground font-semibold">Product</div><div className="font-bold">{selectedFinalQAAudit.product_name}</div></div>
                                <div><div className="text-muted-foreground font-semibold">Product Code</div><div className="font-mono font-bold">{selectedFinalQAAudit.product_code || "—"}</div></div>
                                <div><div className="text-muted-foreground font-semibold">Job Order</div><div className="font-mono font-bold">{selectedFinalQAAudit.job_order_no || "—"}</div></div>
                                <div><div className="text-muted-foreground font-semibold">Branch</div><div className="font-bold">{selectedFinalQAAudit.branch_name || "—"}</div></div>
                                <div><div className="text-muted-foreground font-semibold">Lot Number</div><div className="font-mono font-bold">{selectedFinalQAAudit.lot_number}</div></div>
                                <div><div className="text-muted-foreground font-semibold">Quantity Inspected</div><div className="font-mono font-bold">{selectedFinalQAAudit.inspected_quantity.toLocaleString()}</div></div>
                                <div><div className="text-muted-foreground font-semibold">Manufacturing Date</div><div className="font-bold">{formatAuditDate(selectedFinalQAAudit.manufacturing_date)}</div></div>
                                <div><div className="text-muted-foreground font-semibold">Expiry Date</div><div className="font-bold">{formatAuditDate(selectedFinalQAAudit.expiration_date)}</div></div>
                            </div>

                            <div className="rounded-md border border-border bg-muted/20 p-3">
                                <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Inspection result</div>
                                <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                                    <div><div className="text-muted-foreground font-semibold">Overall Disposition</div><div className="font-bold">{selectedFinalQAAudit.overall_disposition}</div></div>
                                    <div><div className="text-muted-foreground font-semibold">Defect Quantity</div><div className="font-mono font-bold">{selectedFinalQAAudit.defect_quantity.toLocaleString()}</div></div>
                                    <div><div className="text-muted-foreground font-semibold">Microbiological Analysis</div><div className="font-bold">{selectedFinalQAAudit.microbiological_status}</div></div>
                                    <div><div className="text-muted-foreground font-semibold">Packaging Seal Audit</div><div className="font-bold">{selectedFinalQAAudit.packaging_seal_passed ? "Passed" : "Failed"}</div></div>
                                    <div><div className="text-muted-foreground font-semibold">Label & Expiry Compliance</div><div className="font-bold">{selectedFinalQAAudit.label_compliance_passed ? "Passed" : "Failed"}</div></div>
                                    <div><div className="text-muted-foreground font-semibold">COA Reference</div><div className="font-mono font-bold">{selectedFinalQAAudit.coa_reference_no || "Not assigned"}</div></div>
                                    <div><div className="text-muted-foreground font-semibold">Approved At</div><div className="font-bold">{formatAuditDate(selectedFinalQAAudit.approved_at)}</div></div>
                                    <div><div className="text-muted-foreground font-semibold">Approved By</div><div className="font-mono font-bold">{selectedFinalQAAudit.approved_by ? `User #${selectedFinalQAAudit.approved_by}` : "—"}</div></div>
                                </div>
                            </div>

                            <div>
                                <div className="mb-1 text-muted-foreground font-semibold">Release Remarks</div>
                                <div className="min-h-[54px] rounded-md border border-border bg-background px-3 py-2 whitespace-pre-wrap">{selectedFinalQAAudit.remarks || "No remarks recorded."}</div>
                            </div>
                        </div>
                    ) : null}

                    <DialogFooter className="sticky bottom-0 z-10 pt-3 border-t border-border gap-2 flex items-center justify-end bg-background/95 backdrop-blur">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsFinalQAAuditOpen(false)}
                            className="border-border hover:bg-muted text-foreground min-h-11 text-sm font-semibold"
                        >
                            Close
                        </Button>
                        {selectedFinalQAAudit?.overall_disposition === "Approved" && (
                            <Button
                                type="button"
                                onClick={handlePrintFinalQACoa}
                                disabled={loadingFinalQAAudit || coaPrintLoading}
                            className="bg-primary hover:bg-primary/95 text-white font-bold min-h-11 text-sm px-4"
                            >
                                {coaPrintLoading ? "Preparing COA..." : "Print COA"}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
