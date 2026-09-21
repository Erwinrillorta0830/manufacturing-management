import { Building2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LotOccupancyIndicator } from "@/modules/manufacturing-management/shared/components/LotOccupancyIndicator";
import type { LotBalance } from "@/modules/manufacturing-management/shared/services/lot-balance.service";
import type { LotOption } from "../types";

interface LotSelectionCardProps {
    lot: LotOption;
    branchName: string;
    balance: LotBalance | null;
    selected: boolean;
    disabled?: boolean;
    loading?: boolean;
    occupancyError?: string | null;
    disabledReason?: string;
    productName?: string;
    productOnHand?: number;
    productUomName?: string;
    onSelect: () => void;
}

function lotUomLabel(lot: LotOption) {
    return lot.uomName || (lot.uomId === null ? "UOM not configured" : `UOM #${lot.uomId}`);
}

export function LotSelectionCard({
    lot,
    branchName,
    balance,
    selected,
    disabled = false,
    loading = false,
    occupancyError = null,
    disabledReason,
    productName,
    productOnHand,
    productUomName,
    onSelect
}: LotSelectionCardProps) {
    const uomLabel = lotUomLabel(lot);

    return (
        <button
            type="button"
            onClick={onSelect}
            disabled={disabled}
            aria-pressed={selected}
            className={cn(
                "group w-full rounded-xl border text-left shadow-sm transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                selected
                    ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/20"
                    : "border-border/80 bg-card hover:border-primary/60 hover:shadow-md",
                disabled && "cursor-not-allowed opacity-60 hover:border-border/80 hover:shadow-sm"
            )}
        >
            <div className="border-b border-border/60 bg-gradient-to-r from-muted/40 via-card to-muted/20 p-3.5">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", selected ? "bg-primary" : "bg-muted-foreground/50")} />
                            <h4 className="truncate text-sm font-extrabold text-foreground" title={lot.lotName}>
                                {lot.lotName || `Lot #${lot.lotId}`}
                            </h4>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase text-secondary-foreground">
                                {uomLabel}
                            </span>
                            <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border/80 bg-muted/80 px-2 py-0.5 text-[10px] font-semibold text-foreground">
                                <Building2 className="h-3 w-3 shrink-0 text-primary" />
                                <span className="truncate" title={branchName}>{branchName}</span>
                            </span>
                        </div>
                    </div>
                    {selected && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
                </div>
            </div>

            <div className="p-3.5">
                <LotOccupancyIndicator
                    balance={balance}
                    maxCapacity={lot.maxBatchCapacity}
                    uomLabel={uomLabel}
                    loading={loading}
                    error={occupancyError}
                />
                {productName && productOnHand !== undefined && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                        {productName} on hand: <strong className="text-foreground">{productOnHand.toLocaleString()}</strong>{productUomName ? ` ${productUomName}` : ""}
                    </p>
                )}
                {disabledReason && <p className="mt-2 text-[11px] font-medium text-muted-foreground">{disabledReason}</p>}
            </div>
        </button>
    );
}
