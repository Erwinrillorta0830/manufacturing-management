import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TabErrorStateProps {
    message: string;
    onRetry: () => void;
}

export function TabErrorState({ message, onRetry }: TabErrorStateProps) {
    return (
        <div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
            <div>
                <h3 className="text-base font-bold text-foreground">Unable to load this QA view</h3>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">{message}</p>
            </div>
            <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={onRetry}>
                <RefreshCw className="h-4 w-4" />
                Retry
            </Button>
        </div>
    );
}
