"use client";

import { Building2, ImageIcon } from "lucide-react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import type { WorkCenter } from "../types";

interface WorkstationAssetSummaryProps {
    workCenter?: WorkCenter | null;
    fallbackName?: string | null;
    compact?: boolean;
}

function resolveAssetImageUrl(value: string | { id?: string | number } | null | undefined): string | null {
    const rawValue = value && typeof value === "object"
        ? (value as { id?: string | number }).id
        : value;
    const source = String(rawValue || "").trim();
    if (!source) return null;

    const uuid = source.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/)?.[0]
        || (source.includes("/assets/") ? source.split("/assets/")[1]?.split(/[/?]/)[0] : null)
        || source;
    return `/api/manufacturing/asset-management/asset-image-view?id=${encodeURIComponent(uuid)}`;
}

function conditionClass(condition: string): string {
    const normalized = condition.toLowerCase();
    if (normalized.includes("good") || normalized.includes("operational")) {
        return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    }
    if (normalized.includes("bad") || normalized.includes("maintenance") || normalized.includes("repair")) {
        return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    }
    return "border-border bg-muted/40 text-muted-foreground";
}

export function WorkstationAssetSummary({
    workCenter,
    fallbackName,
    compact = false
}: WorkstationAssetSummaryProps) {
    const asset = workCenter?.asset;
    const assetName = asset?.item_name || asset?.item_id?.item_name || null;
    const condition = String(asset?.condition || "Condition not recorded").trim();
    const imageUrl = resolveAssetImageUrl(asset?.item_image);
    const workCenterName = workCenter?.work_center_name || fallbackName || "Unassigned";
    const code = workCenter?.barcode || (workCenter?.work_center_id ? `WC-${workCenter.work_center_id}` : null);

    return (
        <div className={`flex min-w-0 items-start gap-2 ${compact ? "text-xs" : "rounded-lg border border-border/60 bg-background/60 p-2.5"}`}>
            <div className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-muted/40 ${compact ? "h-8 w-8" : "h-11 w-11"}`}>
                <ImageIcon className={`${compact ? "h-3.5 w-3.5" : "h-5 w-5"} text-muted-foreground`} />
                {imageUrl && (
                    <Image
                        fill
                        src={imageUrl}
                        alt={assetName || `${workCenterName} asset`}
                        sizes={compact ? "32px" : "44px"}
                        unoptimized
                        className="object-cover"
                        onError={(event) => {
                            event.currentTarget.style.display = "none";
                        }}
                    />
                )}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="truncate font-semibold text-foreground" title={workCenterName}>{workCenterName}</span>
                </div>
                <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    {assetName || code || "No asset linked"}
                    {asset?.serial ? ` · ${asset.serial}` : ""}
                </div>
                <Badge variant="outline" className={`mt-1 h-5 max-w-full truncate px-1.5 text-[9px] font-bold ${conditionClass(condition)}`}>
                    {condition}
                </Badge>
            </div>
        </div>
    );
}
