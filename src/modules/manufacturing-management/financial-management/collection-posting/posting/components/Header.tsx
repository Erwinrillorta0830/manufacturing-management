import { Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
    onRefresh: () => void;
}

export function Header({ onRefresh }: HeaderProps) {
    return (
        <div className="flex justify-between items-end bg-card p-6 rounded-xl border border-border shadow-sm">
            <div>
                <h1 className="text-2xl font-black flex items-center gap-2 text-primary tracking-tight">
                    <Lock size={26} className="text-primary/80" /> GL Posting & Audit
                </h1>
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                    Review settled pouches and commit to General Ledger
                </p>
            </div>
            <Button onClick={onRefresh} variant="outline" size="sm" className="font-black tracking-widest uppercase bg-background hover:bg-muted transition-colors">
                <RefreshCw size={14} className="mr-2" /> Refresh Queue
            </Button>
        </div>
    );
}