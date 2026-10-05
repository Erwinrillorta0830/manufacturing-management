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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AssetHaltedJobOrder, MachineAssetReport, RouteStepUsage } from "../types";

interface MaintenanceEpisodeDialogProps {
    open: boolean;
    asset: MachineAssetReport | null;
    source: { jobOrder: AssetHaltedJobOrder; routeStep: RouteStepUsage } | null;
    saving: boolean;
    onOpenChange: (open: boolean) => void;
    onStart: (input: { assetId: number; jobOrderId: number; routeId: number }) => Promise<void>;
    onClose: (input: { assetId: number; restoredCondition: "Good" | "Bad" | "Discontinued"; resolutionNotes?: string }) => Promise<void>;
}

function displayTimestamp(value: string | null): string {
    if (!value) return "Unknown start time";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
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
    const [resolutionNotes, setResolutionNotes] = useState("");

    const handleCloseEpisode = async () => {
        if (!asset) return;
        await onClose({
            assetId: asset.assetId,
            restoredCondition,
            resolutionNotes: resolutionNotes.trim() || undefined
        });
        setRestoredCondition("Good");
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
                    setResolutionNotes("");
                }
                onOpenChange(nextOpen);
            }}
        >
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Maintenance history</DialogTitle>
                    <DialogDescription>
                        {asset ? asset.assetName + " · Production asset #" + asset.assetId : "Select a machine"}
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
                            <p className="mt-2 text-xs text-muted-foreground">
                                Maintenance history before report rollout is unavailable.
                            </p>
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
                                            {episode.startReason && <p className="mt-1 text-xs">{episode.startReason}</p>}
                                            {episode.resolutionNotes && <p className="mt-1 text-xs text-muted-foreground">{episode.resolutionNotes}</p>}
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
                                <Textarea
                                    value={resolutionNotes}
                                    onChange={(event) => setResolutionNotes(event.target.value)}
                                    maxLength={2000}
                                    placeholder="Resolution notes (optional)"
                                    rows={3}
                                />
                                <DialogFooter>
                                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                                        Cancel
                                    </Button>
                                    <Button type="button" onClick={() => void handleCloseEpisode()} disabled={saving}>
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
