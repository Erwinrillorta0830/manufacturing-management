"use client";

import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { formatPHP, getDepreciatedValue, getAssetImageUrl } from "../../utils/lib";
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
} from "lucide-react";

export default function ViewAssetModal({
  asset,
  isOpen,
  onOpenChange,
  projectionDate = new Date(),
}: { asset: import("../../types").AssetTableData | null; isOpen: boolean; onOpenChange: (open: boolean) => void; projectionDate?: Date }) {
  if (!asset) return null;

  const currentVal = getDepreciatedValue(
    Number(asset.cost_per_item),
    Number(asset.quantity),
    Number(asset.life_span),
    asset.date_acquired,
    projectionDate,
  );

  const originalCost = asset.cost_per_item * asset.quantity;
  const depreciationPercentage =
    ((originalCost - currentVal) / originalCost) * 100;

  const imageUrl = getAssetImageUrl(asset.item_image);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] md:max-w-5xl p-0 overflow-hidden border-border bg-background shadow-2xl max-h-[95vh] flex flex-col">
        {/* Responsive Container */}
        <div className="flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
          {/* LEFT PANEL: Asset Identity & Image (Blue Guide 1) */}
          <div className="w-full md:w-[40%] bg-muted/30 p-6 md:p-8 flex flex-col border-b md:border-b-0 md:border-r relative overflow-hidden">
            <div />

            <div className="relative z-10 space-y-6">
              <div className="flex items-center gap-3">
                <div className="h-0.5 w-10 bg-primary" />
                <span className="text-xs font-bold tracking-widest text-primary uppercase">
                  Asset Profile
                </span>
              </div>

              <div className="relative mx-auto w-full max-w-70 md:max-w-full">
                <div className="aspect-square rounded-xl bg-background border-2 border-muted flex items-center justify-center overflow-hidden">
                  {imageUrl ? (
                    <Image
                      unoptimized
                      src={imageUrl}
                      fill className="object-contain w-full h-full p-6"
                      alt={asset.item_name}
                    />
                  ) : (
                    <Package className="h-16 w-16 text-muted" />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <Badge
                  variant="default"
                  className="w-fit text-xs uppercase tracking-wider px-3"
                >
                  {asset.condition || "Functional"}
                </Badge>
                <div className="grid grid-cols-2 md:grid-cols-1 gap-4">
                  <MetricItem
                    icon={<Tag size={16} />}
                    label="Classification"
                    value={asset.classification_name}
                  />
                  <MetricItem
                    icon={<CalendarDays size={16} />}
                    label="Acquired"
                    value={
                      asset.date_acquired
                        ? new Date(asset.date_acquired).toLocaleString(
                            undefined,
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                              hour12: true,
                            },
                          )
                        : "N/A"
                    }
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

          {/* RIGHT PANEL: Analytics & Details */}
          <div className="w-full md:w-[60%] p-6 md:p-8 flex flex-col bg-background">
            <div className="mb-8">
              <DialogTitle className="text-2xl md:text-3xl font-bold uppercase leading-none mb-3">
                {asset.item_name}
              </DialogTitle>
              <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-muted-foreground uppercase">
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
              <div className="p-6 rounded-2xl bg-muted/40 border border-border relative overflow-hidden group">
                <DollarSign
                  size={64}
                  className="absolute top-0 right-0 p-4 opacity-5"
                />
                <div className="flex flex-col sm:flex-row justify-between sm:items-end relative z-10 gap-4">
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                      Projected Value (2026)
                    </p>
                    <p className="text-3xl md:text-4xl font-bold">
                      {formatPHP(currentVal)}
                    </p>
                  </div>
                  {depreciationPercentage !== 0 && (
                    <Badge
                      variant={
                        depreciationPercentage > 0 ? "destructive" : "default"
                      }
                      className="font-bold text-xs px-2 py-1"
                    >
                      {depreciationPercentage > 0 ? "-" : "+"}{" "}
                      {Math.abs(depreciationPercentage).toFixed(1)}%
                    </Badge>
                  )}
                </div>
              </div>

              {/* Financial Data Grid (Blue Guide 3) */}
              <div className="grid grid-cols-2 gap-4">
                <DataCard
                  label="Original Cost"
                  value={formatPHP(originalCost)}
                />
                <DataCard label="Quantity" value={`${asset.quantity} Units`} />
              </div>

              <Separator className="opacity-50" />

              {/* Operational Block (Blue Guide 4) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pb-4 text-xs text-muted-foreground">
                <div>
                  <span className="font-semibold text-foreground/80">Created By: </span>
                  <span className="text-foreground/90 font-medium">{asset.created_by_name && asset.created_by_name !== "N/A" ? asset.created_by_name : (asset.created_by ? `User #${asset.created_by}` : "System")}</span>
                  {(asset.created_at || asset.date_created) && (
                    <span className="block text-[11px] text-muted-foreground/70 mt-0.5">
                      {new Date(asset.created_at || asset.date_created!).toLocaleString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </span>
                  )}
                </div>
                <div>
                  <span className="font-semibold text-foreground/80">Updated By: </span>
                  <span className="text-foreground/90 font-medium">
                    {asset.updated_by_name && asset.updated_by_name !== "N/A"
                      ? asset.updated_by_name
                      : (asset.updated_by
                          ? `User #${asset.updated_by}`
                          : (asset.created_by_name && asset.created_by_name !== "N/A" ? asset.created_by_name : "System"))}
                  </span>
                  {(asset.updated_at || asset.date_updated) && (
                    <span className="block text-[11px] text-muted-foreground/70 mt-0.5">
                      {new Date(asset.updated_at || asset.date_updated!).toLocaleString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
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
