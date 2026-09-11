import type { ReactNode } from "react";
import { AlertCircle, Loader2, RefreshCw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ModuleStatePanelProps = {
    state: "loading" | "empty" | "error";
    title: string;
    description?: string;
    icon?: LucideIcon;
    action?: ReactNode;
    onRetry?: () => void;
    retryLabel?: string;
    skeletonRows?: number;
    className?: string;
};

export function ModuleStatePanel({
    state,
    title,
    description,
    icon: Icon,
    action,
    onRetry,
    retryLabel = "Retry",
    skeletonRows,
    className
}: ModuleStatePanelProps) {
    if (state === "loading") {
        if (skeletonRows && skeletonRows > 0) {
            return (
                <div className={cn("space-y-2.5 p-4", className)} role="status" aria-label={title}>
                    <span className="sr-only">{title}</span>
                    {Array.from({ length: skeletonRows }, (_, index) => (
                        <div key={`module-skeleton-${index}`} className="animate-pulse space-y-2.5 rounded-xl border p-4" aria-hidden="true">
                            <div className="h-3 w-2/5 rounded bg-muted" />
                            <div className="h-2.5 w-3/5 rounded bg-muted" />
                            <div className="h-2.5 w-1/3 rounded bg-muted" />
                        </div>
                    ))}
                </div>
            );
        }
        return (
            <div className={cn("flex min-h-56 items-center justify-center gap-2 p-6 text-sm text-muted-foreground", className)} role="status">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                {title}
            </div>
        );
    }

    if (state === "error") {
        return (
            <div className={cn("flex min-h-56 flex-col items-center justify-center gap-2 p-6 text-center", className)} role="alert">
                <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
                <p className="font-medium text-destructive">{title}</p>
                {description && <p className="max-w-md break-words text-sm text-muted-foreground">{description}</p>}
                {(action || onRetry) && (
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                        {onRetry && (
                            <Button size="sm" variant="outline" onClick={onRetry}>
                                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                                {retryLabel}
                            </Button>
                        )}
                        {action}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className={cn("flex min-h-56 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground", className)}>
            {Icon && <Icon className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />}
            <p className="font-medium text-foreground">{title}</p>
            {description && <p className="max-w-md text-sm">{description}</p>}
            {(action || onRetry) && (
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                    {onRetry && (
                        <Button size="sm" variant="outline" onClick={onRetry}>
                            <RefreshCw className="h-4 w-4" aria-hidden="true" />
                            {retryLabel}
                        </Button>
                    )}
                    {action}
                </div>
            )}
        </div>
    );
}
