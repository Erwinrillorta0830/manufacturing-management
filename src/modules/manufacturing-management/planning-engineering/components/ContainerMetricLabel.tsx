import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ContainerMetricLabelProps {
  icon: string;
  label: string;
  definition?: string;
}

export const CONTAINER_METRIC_DEFINITIONS = {
  netYieldOutput: "The total quantity of viable, saleable finished primary units (e.g., individual 454g pouches) expected to emerge at the end of the line after accounting for cumulative scrap, trim loss, and production yield factor.",
  caseCountAndRemainder: "The conversion of total primary units into master cartons or bundles according to the defined pack pattern (e.g., 24 pouches/case), including any partial or unboxed remainder units (+0 pcs remaining).",
  unitLoadCount: "The number of full logistics handling platforms (wooden or plastic pallets) required to stage and ship the finished cases, calculated using the pallet pattern (Tie High / Cases per Pallet), plus any leftover loose cases (+0 cases/bundles).",
} as const;

export function ContainerMetricLabel({ icon, label, definition }: ContainerMetricLabelProps) {
  return (
    <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
      <span>{icon} {label}</span>
      {definition && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`${label} definition`}
              className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <Info aria-hidden="true" className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs whitespace-normal text-left leading-relaxed">
            {definition}
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}
