"use client";

import { useState } from "react";
import { Loader2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { phtTimestampToEpoch } from "@/modules/manufacturing-management/shared/pht-date";
import { isManufacturingEvidenceVideo, manufacturingFileUrl } from "@/modules/manufacturing-management/production-workflow/services/production-yield-image";
import type { AssetHaltedJobOrder, MachineAssetReport, RouteStepUsage } from "../types";

interface MaintenanceEpisodeDialogProps {
    open: boolean;
    asset: MachineAssetReport | null;
    source: { jobOrder: AssetHaltedJobOrder; routeStep: RouteStepUsage } | null;
    saving: boolean;
    onOpenChange: (open: boolean) => void;
    onStart: (input: { assetId: number; jobOrderId: number; routeId: number }) => Promise<void>;
    onClose: (input: {
        assetId: number;
        restoredCondition: "Good" | "Bad" | "Discontinued";
        correctiveAction: string;
        technicianName: string;
        resolutionNotes?: string;
    }) => Promise<void>;
}

function displayTimestamp(value: string | null): string {
    if (!value) return "Unknown start time";
    const timestamp = phtTimestampToEpoch(value);
    if (!timestamp) return value;
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    }).format(date);
}

export function MaintenanceEpisodeDialog({
    open,
    asset,
    source,
    saving,
    onOpenChange,
    onStart,
    onClose
}: MaintenanceEpisodeDialogProps) {
    const [restoredCondition, setRestoredCondition] = useState<"Good" | "Bad" | "Discontinued">("Good");
    const [correctiveAction, setCorrectiveAction] = useState("");
    const [technicianName, setTechnicianName] = useState("");
    const [resolutionNotes, setResolutionNotes] = useState("");

    const handleCloseEpisode = async () => {
        if (!asset) return;
        await onClose({
            assetId: asset.assetId,
            restoredCondition,
            correctiveAction: correctiveAction.trim(),
            technicianName: technicianName.trim(),
            resolutionNotes: resolutionNotes.trim() || undefined
        });
        setRestoredCondition("Good");
        setCorrectiveAction("");
        setTechnicianName("");
        setResolutionNotes("");
    };

    const handleStartEpisode = async () => {
        if (!asset || !source) return;
        await onStart({
            assetId: asset.assetId,
            jobOrderId: source.jobOrder.jobOrderId,
            routeId: source.routeStep.routeId
        });
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) {
                    setRestoredCondition("Good");
                    setCorrectiveAction("");
                    setTechnicianName("");
                    setResolutionNotes("");
                }
                onOpenChange(nextOpen);
            }}
        >
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Maintenance history</DialogTitle>
                    <DialogDescription>
                        {asset
                            ? `${asset.assetName} · Classification: ${asset.classificationName} · Assigned To: ${asset.assignedToName}`
                            : "Select a machine"}
                    </DialogDescription>
                </DialogHeader>

                {asset && (
                    <div className="space-y-5">
                        <div className="rounded-md border bg-muted/20 p-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">Current condition</span>
                                <span className="font-medium">{asset.condition}</span>
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">Tracked episodes</span>
                                <span className="font-medium">{asset.trackedEpisodeCount}</span>
                            </div>
                        </div>

                        <section className="space-y-2">
                            <h4 className="text-sm font-semibold">Recorded episodes</h4>
                            {asset.history.length === 0 ? (
                                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                                    No maintenance episodes have been recorded since tracking began.
                                </p>
                            ) : (
                                <div className="max-h-56 space-y-2 overflow-y-auto">
                                    {asset.history.map((episode) => (
                                        <div key={episode.id} className="rounded-md border p-3 text-sm">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <span className="font-medium">
                                                    {episode.isOpen ? "Open episode" : "Completed episode"}
                                                    {episode.sourceType === "baseline" ? " · Baseline" : ""}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    {episode.isOpen ? "Ongoing" : "Restored: " + (episode.restoredCondition || "Not recorded")}
                                                </span>
                                            </div>
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                Started: {episode.sourceType === "baseline" ? "Already under maintenance at rollout; start unknown" : displayTimestamp(episode.startedAt)}
                                            </div>
                                            {episode.endedAt && (
                                                <div className="mt-1 text-xs text-muted-foreground">Ended: {displayTimestamp(episode.endedAt)}</div>
                                            )}
                                            {episode.sourceJobOrderNo && (
                                                <div className="mt-1 text-xs text-muted-foreground">Source: {episode.sourceJobOrderNo}</div>
                                            )}
                                            {episode.breakdownCategory && <p className="mt-1 text-xs">Category: {episode.breakdownCategory}</p>}
                                            {episode.rootCause && <p className="mt-1 text-xs">Root cause: {episode.rootCause}</p>}
                                            {episode.correctiveAction && <p className="mt-1 text-xs">Corrective action: {episode.correctiveAction}</p>}
                                            {episode.technicianName && <p className="mt-1 text-xs text-muted-foreground">Technician: {episode.technicianName}</p>}
                                            {episode.startReason && <p className="mt-1 text-xs">{episode.startReason}</p>}
                                            {episode.resolutionNotes && <p className="mt-1 text-xs text-muted-foreground">{episode.resolutionNotes}</p>}
                                            {episode.evidenceFiles.length > 0 && (
                                                <div className="mt-3 space-y-1.5">
                                                    <p className="text-xs font-medium">Breakdown evidence</p>
                                                    <div className="grid gap-2 sm:grid-cols-2">
                                                        {episode.evidenceFiles.map((file, index) => {
                                                            const fileUrl = manufacturingFileUrl(file.directus_file_id);
                                                            const isVideo = isManufacturingEvidenceVideo(file.mime_type, file.file_name);
                                                            const fileName = file.file_name || `Evidence ${index + 1}`;
                                                            return (
                                                                <div key={`${file.directus_file_id}-${index}`} className="overflow-hidden rounded-md border bg-muted/20">
                                                                    {isVideo ? (
                                                                        <video
                                                                            src={fileUrl}
                                                                            controls
                                                                            playsInline
                                                                            preload="metadata"
                                                                            aria-label={fileName}
                                                                            className="max-h-48 w-full bg-black"
                                                                        />
                                                                    ) : (
                                                                        <a href={fileUrl} target="_blank" rel="noreferrer" className="block">
                                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                            <img src={fileUrl} alt={fileName} className="h-32 w-full bg-muted object-contain" />
                                                                        </a>
                                                                    )}
                                                                    <p className="truncate px-2 py-1.5 text-[11px] font-medium" title={fileName}>{fileName}</p>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        {asset.openEpisode ? (
                            <section className="space-y-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                                <div>
                                    <h4 className="text-sm font-semibold">Close open maintenance episode</h4>
                                    <p className="text-xs text-muted-foreground">Choose the asset condition after maintenance is complete.</p>
                                </div>
                                <Select value={restoredCondition} onValueChange={(value) => setRestoredCondition(value as typeof restoredCondition)}>
                                    <SelectTrigger aria-label="Restored asset condition">
                                        <SelectValue placeholder="Select restored condition" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Good">Good</SelectItem>
                                        <SelectItem value="Bad">Bad</SelectItem>
                                        <SelectItem value="Discontinued">Discontinued</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Input
                                    value={technicianName}
                                    onChange={(event) => setTechnicianName(event.target.value)}
                                    maxLength={200}
                                    placeholder="Technician name *"
                                    aria-label="Technician name"
                                />
                                <Textarea
                                    value={correctiveAction}
                                    onChange={(event) => setCorrectiveAction(event.target.value)}
                                    maxLength={5000}
                                    placeholder="Corrective actions taken *"
                                    rows={3}
                                />
                                <Textarea
                                    value={resolutionNotes}
                                    onChange={(event) => setResolutionNotes(event.target.value)}
                                    maxLength={2000}
                                    placeholder="Additional resolution notes (optional)"
                                    rows={2}
                                />
                                <DialogFooter>
                                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                                        Cancel
                                    </Button>
                                    <Button type="button" onClick={() => void handleCloseEpisode()} disabled={saving || !technicianName.trim() || !correctiveAction.trim()}>
                                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Close episode
                                    </Button>
                                </DialogFooter>
                            </section>
                        ) : source ? (
                            <section className="space-y-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                                <div>
                                    <h4 className="text-sm font-semibold">Start maintenance for {source.jobOrder.jobOrderNo}</h4>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {source.jobOrder.eventType} · {source.routeStep.workCenterName} · {source.routeStep.status}
                                    </p>
                                    <p className="mt-1 text-xs">{source.jobOrder.reason || "No event reason was recorded."}</p>
                                </div>
                                <DialogFooter>
                                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                                        Cancel
                                    </Button>
                                    <Button type="button" onClick={() => void handleStartEpisode()} disabled={saving}>
                                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wrench className="mr-2 h-4 w-4" />}
                                        Mark Under Maintenance
                                    </Button>
                                </DialogFooter>
                            </section>
                        ) : (
                            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                                To start an episode, use Mark maintenance on a terminated or cancelled JO linked to this machine.
                            </p>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
