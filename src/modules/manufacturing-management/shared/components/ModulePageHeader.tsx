import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ModulePageHeader({
    icon: Icon,
    eyebrow,
    title,
    description,
    actions,
    onBack,
    backHref,
    backLabel = "Back",
    backDisabled = false,
    className,
    titleClassName
}: {
    icon: LucideIcon;
    eyebrow?: string;
    title: string;
    description?: string;
    actions?: ReactNode;
    onBack?: () => void;
    backHref?: string;
    backLabel?: string;
    backDisabled?: boolean;
    className?: string;
    titleClassName?: string;
}) {
    return (
        <div className={cn("flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between", className)}>
            <div className="flex min-w-0 items-start gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                    {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>}
                    <h1 className={cn("text-2xl font-bold tracking-tight", titleClassName)}>{title}</h1>
                    {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
                </div>
            </div>
            {(actions || onBack || backHref) && (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {backHref && (
                        <Button variant="outline" asChild>
                            <Link href={backHref}>
                                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                                {backLabel}
                            </Link>
                        </Button>
                    )}
                    {onBack && (
                        <Button variant="outline" onClick={onBack} disabled={backDisabled}>
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                            {backLabel}
                        </Button>
                    )}
                    {actions}
                </div>
            )}
        </div>
    );
}
