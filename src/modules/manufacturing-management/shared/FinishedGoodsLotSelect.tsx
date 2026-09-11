"use client";

import Link from "next/link";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { EligibleFinishedGoodsLot } from "./finished-goods-lots-api";

interface FinishedGoodsLotSelectProps {
    lots: EligibleFinishedGoodsLot[];
    value: string;
    onValueChange: (value: string) => void;
    loading?: boolean;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
    showBatchSummary?: boolean;
}

export function FinishedGoodsLotSelect({
    lots,
    value,
    onValueChange,
    loading = false,
    disabled = false,
    placeholder = "Select storage lot...",
    className,
    showBatchSummary = true
}: FinishedGoodsLotSelectProps) {
    const options = lots.map((lot) => ({
        value: String(lot.lotId),
        label: `${lot.lotName} — ${lot.branchName} (${lot.unitShortcut})${lot.batches.length > 0 ? ` · ${lot.batches.length} batch${lot.batches.length === 1 ? "" : "es"}` : ""}`
    }));
    const selectedLot = lots.find((lot) => String(lot.lotId) === value) || null;

    if (loading) {
        return <div className="text-xs text-muted-foreground py-1">Loading storage lots...</div>;
    }

    if (lots.length === 0) {
        return (
            <div className="text-xs text-muted-foreground border border-dashed rounded-lg p-2.5 space-y-1">
                <p className="font-semibold text-foreground">No active storage lot matches this branch and UOM.</p>
                <p>
                    Create one in{" "}
                    <Link href="/mm/inventory-warehousing/lot-management" className="text-primary underline underline-offset-2">
                        Lot Management
                    </Link>{" "}
                    before posting.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-1">
            <SearchableSelect
                options={options}
                value={value}
                onValueChange={onValueChange}
                placeholder={placeholder}
                disabled={disabled}
                className={className}
            />
            {showBatchSummary && selectedLot && (
                <p className="text-[10px] text-muted-foreground leading-snug">
                    {selectedLot.batches.length > 0
                        ? `Existing batches: ${selectedLot.batches.map((batch) => batch.batchNo).join(", ")}`
                        : "No product batch yet — posting will create one under this lot."}
                </p>
            )}
        </div>
    );
}
