"use client";

import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { formatPHP, calculateAssetFinancials, getAssetImageUrl, parseDateTimeSafe } from "../../utils/lib";
import {
  Barcode,
  Building,
  CalendarDays,
  Cpu,
  DollarSign,
  Package,
  ShieldAlert,
  ShieldCheck,
  Tag,
  User,
  Activity,
  Gauge,
} from "lucide-react";

export default function ViewAssetModal({
  asset,
  isOpen,
  onOpenChange,
  projectionDate = new Date(),
}: {
  asset: import("../../types").AssetTableData | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  projectionDate?: Date;
}) {
  if (!asset) return null;

  const financials = calculateAssetFinancials(asset, projectionDate);
  const isUop = financials.isUOP;
  const uomLabel =
    asset.production_unit_shortcut || asset.production_unit || "units";

  const acqDateObj = parseDateTimeSafe(asset.date_acquired);
  const acqDateFormatted = acqDateObj
    ? `${new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(acqDateObj)}${
        asset.date_acquired && (asset.date_acquired.includes(":") || asset.date_acquired.includes(" "))
          ? ` ${new Intl.DateTimeFormat("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            }).format(acqDateObj)}`
          : ""
      }`
    : "N/A";

  const depStartDateObj = parseDateTimeSafe(asset.depreciation_start_date) || acqDateObj;
  const depStartDateFormatted = depStartDateObj
    ? `${new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(depStartDateObj)}`
    : "N/A";

  const depreciationPercentage =
    financials.acquisitionCost > 0
      ? (financials.accumulatedDepreciation / financials.acquisitionCost) * 100
      : 0;

  const imageUrl = getAssetImageUrl(asset.item_image);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-w-[96vw] md:max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[1400px] w-full p-0 overflow-hidden border-border bg-background shadow-2xl max-h-[95vh] flex flex-col rounded-2xl"
      >
        <DialogTitle className="sr-only">Asset Profile: {asset.item_name}</DialogTitle>
        <DialogDescription className="sr-only">Asset information, specifications, and depreciation details</DialogDescription>
        {/* Responsive Container */}
        <div className="flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
          {/* LEFT PANEL: Asset Identity & Image */}
          <div className="w-full md:w-[32%] lg:w-[30%] xl:w-[28%] bg-muted/30 p-6 md:p-8 flex flex-col border-b md:border-b-0 md:border-r relative overflow-hidden shrink-0">
            <div className="relative z-10 space-y-6">
              <div className="flex items-center gap-3">
                <div className="h-0.5 w-10 bg-primary" />
                <span className="text-xs font-bold tracking-widest text-primary uppercase">
                  Asset Profile
                </span>
              </div>

              <div className="relative mx-auto w-full max-w-72 md:max-w-full">
                <div className="relative aspect-square rounded-2xl bg-background border-2 border-muted flex items-center justify-center overflow-hidden">
                  {imageUrl ? (
                    <Image
                      unoptimized
                      src={imageUrl}
                      fill
                      className="object-contain w-full h-full p-6"
                      alt={asset.item_name}
                    />
                  ) : (
                    <Package className="h-16 w-16 text-muted" />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="default"
                    className="text-xs uppercase tracking-wider px-3"
                  >
                    {asset.condition || "Functional"}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className="text-xs tracking-wider px-2.5"
                  >
                    {asset.asset_type || "Administrative"}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-xs tracking-wider px-2.5 font-medium ${
                      asset.asset_origin === "Existing" || financials.isLegacyMigrated
                        ? "border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/40"
                        : "border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/40"
                    }`}
                  >
                    {asset.asset_origin === "Existing" || financials.isLegacyMigrated ? "Existing Asset" : "New Acquisition"}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-1 gap-3 pt-2">
                  <MetricItem
                    icon={<Tag size={16} />}
                    label="Classification"
                    value={asset.classification_name}
                  />
                  <MetricItem
                    icon={<CalendarDays size={16} />}
                    label="Acquired"
                    value={acqDateFormatted}
                  />
                  <MetricItem
                    icon={<CalendarDays size={16} className="text-primary" />}
                    label="Dep. Start"
                    value={depStartDateFormatted}
                  />
                  <MetricItem
                    icon={
                      asset.is_active_warning === 1 ? (
                        <ShieldCheck size={16} className="text-green-500" />
                      ) : (
                        <ShieldAlert size={16} className="text-red-500" />
                      )
                    }
                    label="Security Tag"
                    value={
                      asset.is_active_warning === 1
                        ? "Activated"
                        : "Deactivated"
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: Analytics & Depreciation Details */}
          <div className="w-full md:w-[68%] lg:w-[70%] xl:w-[72%] p-6 md:p-8 flex flex-col bg-background overflow-y-auto max-h-[90vh]">
            <div className="mb-6">
              <DialogTitle className="text-2xl md:text-3xl font-bold uppercase leading-none mb-3">
                {asset.item_name}
              </DialogTitle>
              <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-muted-foreground uppercase">
                <span className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded">
                  <Barcode size={14} className="text-primary" />{" "}
                  {asset.barcode || "N/A"}
                </span>
                <span className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded">
                  <Cpu size={14} className="text-primary" />{" "}
                  {asset.rfid_code || "N/A"}
                </span>
                <span className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded">
                  <Package size={14} className="text-primary" /> SN:{" "}
                  {asset.serial || "N/A"}
                </span>
              </div>
            </div>

            <div className="space-y-6 grow">
              {/* Main Book Value Banner */}
              <div className="p-5 rounded-2xl bg-muted/40 border border-border relative overflow-hidden group">
                <DollarSign
                  size={64}
                  className="absolute top-0 right-0 p-4 opacity-5"
                />
                <div className="flex flex-col sm:flex-row justify-between sm:items-end relative z-10 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
                        Current Book Value
                      </span>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {asset.depreciation_method || "Straight Line"}
                      </Badge>
                    </div>
                    <p className="text-3xl font-bold text-foreground">
                      {formatPHP(financials.bookValue)}
                    </p>
                  </div>
                  {depreciationPercentage > 0 && (
                    <Badge
                      variant="secondary"
                      className="font-bold text-xs px-2.5 py-1"
                    >
                      {depreciationPercentage.toFixed(1)}% Depreciated
                    </Badge>
                  )}
                </div>
              </div>

              {/* SECTION: Financial Baseline */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    Financial Baseline
                  </span>
                  {(asset.asset_origin === "Existing" || financials.isLegacyMigrated) ? (
                    <Badge variant="outline" className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-50/30">
                      Existing (Cutover Opening Applied)
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-50/30">
                      New System Asset
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <DataCard
                    label="Historical Cost"
                    value={formatPHP(financials.acquisitionCost)}
                  />
                  <DataCard
                    label="Opening Book Value"
                    value={formatPHP(financials.openingBookValue)}
                  />
                  <DataCard
                    label="Residual Value"
                    value={formatPHP(financials.residualValue)}
                  />
                  <DataCard
                    label="Depreciable Basis"
                    value={formatPHP(financials.depreciableAmount)}
                  />
                </div>
              </div>

              {/* SECTION: Legacy Migration Details (if present) */}
              {financials.isLegacyMigrated && (
                <div className="p-3.5 rounded-xl border border-dashed border-primary/40 bg-primary/5 space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                    Opening Cutover Metrics
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                    <div className="p-2 rounded-lg bg-background border">
                      <span className="text-muted-foreground block text-[11px]">Prior Accum. Dep.:</span>
                      <span className="font-bold text-foreground mt-0.5 block">{formatPHP(financials.openingAccumulatedDepreciation)}</span>
                    </div>
                    {isUop && (
                      <div className="p-2 rounded-lg bg-background border">
                        <span className="text-muted-foreground block text-[11px]">Prior Units Produced:</span>
                        <span className="font-bold text-foreground mt-0.5 block">{financials.openingProductionUnits?.toLocaleString() || "0"} {uomLabel}</span>
                      </div>
                    )}
                    <div className="p-2 rounded-lg bg-background border">
                      <span className="text-muted-foreground block text-[11px]">Remaining at Cutover:</span>
                      <span className="font-bold text-foreground mt-0.5 block">
                        {isUop
                          ? `${financials.remainingCapacityAtOpening?.toLocaleString() || "0"} ${uomLabel}`
                          : `${financials.usefulMonths} months`}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION: Depreciation Details & Method Metrics */}
              <div className="p-4 rounded-xl border border-border bg-card/60 space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                    {isUop ? <Gauge size={14} /> : <Activity size={14} />}
                    Depreciation Details ({asset.depreciation_method || "Straight Line"})
                  </span>
                </div>

                {isUop ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="p-2.5 rounded-lg bg-background border">
                        <span className="text-muted-foreground font-medium block">
                          Maximum Capacity:
                        </span>
                        <span className="text-sm font-bold text-foreground mt-0.5 block">
                          {financials.maxCapacity?.toLocaleString() || "0"} {uomLabel}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-background border">
                        <span className="text-muted-foreground font-medium block">
                          System Job Orders Produced:
                        </span>
                        <span className="text-sm font-bold text-foreground mt-0.5 block">
                          {financials.systemProduced?.toLocaleString() || "0"} {uomLabel}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-background border">
                        <span className="text-muted-foreground font-medium block">
                          Remaining Capacity:
                        </span>
                        <span className="text-sm font-bold text-foreground mt-0.5 block">
                          {financials.remainingCapacity?.toLocaleString() || "0"} {uomLabel}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                      <div className="p-2.5 rounded-lg bg-background border">
                        <span className="text-muted-foreground font-medium block">
                          Depreciation / Unit:
                        </span>
                        <span className="text-sm font-bold text-foreground mt-0.5 block">
                          {formatPHP(financials.depreciationRate)} / {uomLabel}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-background border">
                        <span className="text-muted-foreground font-medium block">
                          Total Accumulated Dep.:
                        </span>
                        <span className="text-sm font-bold text-foreground mt-0.5 block">
                          {formatPHP(financials.accumulatedDepreciation)}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-background border border-primary/30 bg-primary/5">
                        <span className="text-primary font-medium block">
                          Current Book Value:
                        </span>
                        <span className="text-sm font-bold text-primary mt-0.5 block">
                          {formatPHP(financials.bookValue)}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="p-2.5 rounded-lg bg-background border">
                        <span className="text-muted-foreground font-medium block">
                          Useful Life:
                        </span>
                        <span className="text-sm font-bold text-foreground mt-0.5 block">
                          {financials.usefulMonths} months ({financials.usefulYears ? Math.round(financials.usefulYears) : 1} yrs)
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-background border">
                        <span className="text-muted-foreground font-medium block">
                          Depreciation Start:
                        </span>
                        <span className="text-sm font-bold text-foreground mt-0.5 block">
                          {depStartDateFormatted}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-background border">
                        <span className="text-muted-foreground font-medium block">
                          Monthly Depreciation:
                        </span>
                        <span className="text-sm font-bold text-foreground mt-0.5 block">
                          {formatPHP(financials.depreciationRate)} / month
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                      <div className="p-2.5 rounded-lg bg-background border">
                        <span className="text-muted-foreground font-medium block">
                          Total Accumulated Dep.:
                        </span>
                        <span className="text-sm font-bold text-foreground mt-0.5 block">
                          {formatPHP(financials.accumulatedDepreciation)}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-background border border-primary/30 bg-primary/5">
                        <span className="text-primary font-medium block">
                          Current Book Value:
                        </span>
                        <span className="text-sm font-bold text-primary mt-0.5 block">
                          {formatPHP(financials.bookValue)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <Separator className="opacity-50" />

              {/* Operational Block */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <AssignmentBlock
                  icon={<Building size={18} />}
                  label="Department"
                  value={asset.department_name}
                />
                <AssignmentBlock
                  icon={<User size={18} />}
                  label="Assigned To"
                  value={asset.assigned_to_name}
                />
              </div>

              <Separator className="opacity-50" />

              {/* Audit Information Block */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-2 text-xs text-muted-foreground">
                <div>
                  <span className="font-semibold text-foreground/80">Created By: </span>
                  <span className="text-foreground/90 font-medium">
                    {asset.created_by_name && asset.created_by_name !== "N/A"
                      ? asset.created_by_name
                      : asset.created_by ? `User #${asset.created_by}` : "System"}
                  </span>
                  {(asset.created_at || asset.date_created) && (
                    <span className="block text-[11px] text-muted-foreground/70 mt-0.5">
                      {new Date(asset.created_at || asset.date_created!).toLocaleString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
                <div>
                  <span className="font-semibold text-foreground/80">Updated By: </span>
                  <span className="text-foreground/90 font-medium">
                    {asset.updated_by_name && asset.updated_by_name !== "N/A"
                      ? asset.updated_by_name
                      : asset.updated_by ? `User #${asset.updated_by}` : "System"}
                  </span>
                  {(asset.updated_at || asset.date_updated) && (
                    <span className="block text-[11px] text-muted-foreground/70 mt-0.5">
                      {new Date(asset.updated_at || asset.date_updated!).toLocaleString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetricItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-lg bg-background border border-border text-primary shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs uppercase font-bold text-muted-foreground leading-none mb-1">
          {label}
        </p>
        <p className="text-xs font-medium truncate">{value || "---"}</p>
      </div>
    </div>
  );
}

function DataCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-4 rounded-xl border bg-card/50 shadow-sm">
      <p className="text-xs uppercase font-bold text-muted-foreground/70 mb-2">
        {label}
      </p>
      <p className="text-base md:text-lg font-bold truncate">{value}</p>
    </div>
  );
}

function AssignmentBlock({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | number }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <span className="text-xs font-bold uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="text-sm font-semibold text-foreground truncate">
        {value || "Unassigned"}
      </p>
    </div>
  );
}
